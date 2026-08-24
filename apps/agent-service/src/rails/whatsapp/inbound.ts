import type { AgentServiceEnv } from '@reservai/config';
import { parseVenueReply, type ModelProvider } from '@reservai/ai';
import { serviceClient } from '../../supabase';
import { applyTransition } from '../../bookings/transition';
import type { InboundMessage } from './provider';

/**
 * What happens when a venue replies.
 *
 * This is the path that can move a booking to `confirmed`, so every step is
 * deliberately conservative: the delivery is claimed once, the reply is matched
 * to a real open booking, the model classifies it, and the deterministic layer
 * in packages/ai decides whether that classification is good enough to act on.
 *
 * Anything it is not sure about becomes an ops task. That is the cheap failure.
 */

export interface InboundOutcome {
  readonly handled: boolean;
  readonly reason: string;
  readonly bookingId?: string;
}

export async function handleInboundMessage(
  env: AgentServiceEnv,
  model: ModelProvider,
  bspName: string,
  message: InboundMessage,
): Promise<InboundOutcome> {
  const supabase = serviceClient(env);

  // BSPs retry. Claiming the delivery first means a venue's "yes" is acted on
  // exactly once, however many times it arrives.
  const { data: claimed } = await supabase.rpc('claim_webhook_event', {
    p_provider: bspName,
    p_external_id: message.eventId,
  });
  if (claimed !== true) {
    return { handled: false, reason: 'Already processed this delivery.' };
  }

  // Which venue is this? The booker number is ours; the sender is theirs.
  const { data: channels } = await supabase
    .from('venue_booking_channels')
    .select('venue_id, config')
    .eq('kind', 'whatsapp');

  const venueId = (channels ?? []).find(
    (c) => (c.config as { phone_e164?: string }).phone_e164 === message.fromE164,
  )?.venue_id;

  if (!venueId) {
    // Someone messaged the booker number who is not a venue we know. Record it
    // and stop — this is not a booking event.
    await supabase.from('webhook_events').update({ processed_at: new Date().toISOString() }).match({
      provider: bspName,
      external_id: message.eventId,
    });
    return { handled: false, reason: `No venue matches ${message.fromE164}.` };
  }

  // The booking this most likely concerns: the one we most recently wrote to
  // this venue about that is still waiting on them.
  const { data: candidates } = await supabase
    .from('bookings')
    .select('id, status, party_size, scheduled_for, venues(name)')
    .eq('venue_id', venueId)
    .in('status', ['attempting', 'pending_venue'])
    .order('created_at', { ascending: false })
    .limit(1);

  const booking = candidates?.[0];

  const { data: stored } = await supabase
    .from('venue_messages')
    .insert({
      booking_id: booking?.id ?? null,
      venue_id: venueId,
      direction: 'inbound',
      status: 'received',
      body: message.body,
      bsp: bspName,
      bsp_message_id: message.eventId,
    })
    .select('id')
    .single();

  if (!booking) {
    // A reply with nothing open to attach it to still belongs to someone. A
    // person reads it rather than it disappearing into the thread.
    await supabase.from('ops_tasks').insert({
      kind: 'unclear_venue_reply',
      priority: 3,
      venue_id: venueId,
      title: 'Venue replied with no booking open',
      detail: message.body,
    });
    return { handled: true, reason: 'No open booking for that venue; sent to ops.' };
  }

  const { data: thread } = await supabase
    .from('venue_messages')
    .select('direction, body')
    .eq('booking_id', booking.id)
    .order('created_at')
    .limit(20);

  const askedFor = new Date(booking.scheduled_for);

  let parsed;
  try {
    parsed = await parseVenueReply(model, {
      context: {
        askedFor: askedFor.toLocaleString('en-GB', {
          timeZone: 'Asia/Dubai',
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        }),
        askedForIso: booking.scheduled_for,
        partySize: booking.party_size,
        venueName: booking.venues?.name ?? 'the venue',
        thread: (thread ?? []).map((m) => ({ direction: m.direction, body: m.body })),
        reply: message.body,
      },
      correlationId: booking.id,
    });
  } catch (error) {
    // A model that cannot read the reply must not cause the reply to be lost.
    await supabase.from('ops_tasks').insert({
      kind: 'unclear_venue_reply',
      priority: 2,
      booking_id: booking.id,
      venue_id: venueId,
      title: 'Could not read the venue reply automatically',
      detail: `${message.body}\n\n(${error instanceof Error ? error.message : 'model error'})`,
    });
    return { handled: true, reason: 'Parser failed; sent to ops.', bookingId: booking.id };
  }

  await supabase
    .from('venue_messages')
    .update({ parsed_outcome: parsed.outcome, parsed_confidence: parsed.confidence })
    .eq('id', stored?.id ?? '');

  const decision = parsed.decision;

  switch (decision.kind) {
    case 'confirm': {
      await applyTransition(env, {
        bookingId: booking.id,
        event: 'confirm',
        actor: 'parsed_confirmation',
        reason: decision.summary,
        evidence: {
          kind: 'parsed_confirmation',
          attemptId: stored?.id ?? booking.id,
          confidence: decision.confidence,
          transcriptRef: `venue_messages/${stored?.id}`,
        },
        correlationId: booking.id,
      });
      return { handled: true, reason: 'Confirmed by the venue.', bookingId: booking.id };
    }

    case 'declined': {
      // The venue said no. Whether to try elsewhere is a decision for the
      // fallback chain, not something to improvise here.
      await applyTransition(env, {
        bookingId: booking.id,
        event: 'escalate',
        actor: 'system',
        reason: `Venue declined: ${decision.summary}`,
        correlationId: booking.id,
      });
      await supabase.from('ops_tasks').insert({
        kind: 'sla_breach',
        priority: 2,
        booking_id: booking.id,
        venue_id: venueId,
        title: 'Venue declined — find an alternative',
        detail: decision.summary,
      });
      return { handled: true, reason: 'Venue declined.', bookingId: booking.id };
    }

    case 'alternative': {
      // Accepting a different time on someone's behalf is exactly the kind of
      // decision the user has to make. Escalate with the offer attached.
      await applyTransition(env, {
        bookingId: booking.id,
        event: 'escalate',
        actor: 'system',
        reason: `Venue offered an alternative: ${decision.summary}`,
        metadata: {
          alternative: {
            scheduledFor: decision.scheduledFor,
            partySize: decision.partySize,
            note: decision.note,
          },
        },
        correlationId: booking.id,
      });
      await supabase.from('ops_tasks').insert({
        kind: 'out_of_bounds_negotiation',
        priority: 2,
        booking_id: booking.id,
        venue_id: venueId,
        title: 'Venue offered a different time',
        detail: [
          decision.summary,
          decision.scheduledFor ? `Proposed: ${decision.scheduledFor}` : null,
          decision.note,
        ]
          .filter(Boolean)
          .join('\n'),
      });
      return { handled: true, reason: 'Alternative offered.', bookingId: booking.id };
    }

    default: {
      await applyTransition(env, {
        bookingId: booking.id,
        event: 'escalate',
        actor: 'system',
        reason: decision.reason,
        correlationId: booking.id,
      });
      await supabase.from('ops_tasks').insert({
        kind: 'unclear_venue_reply',
        priority: 2,
        booking_id: booking.id,
        venue_id: venueId,
        title: 'Venue reply needs a person',
        detail: `${decision.reason}\n\nThey said: ${message.body}`,
      });
      return { handled: true, reason: decision.reason, bookingId: booking.id };
    }
  }
}
