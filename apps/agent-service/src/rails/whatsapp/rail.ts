import type { AttemptContext, AttemptResult, BookingRail } from '@reservai/core';
import type { AgentServiceEnv } from '@reservai/config';
import { draftVenueMessage, type ModelProvider } from '@reservai/ai';
import { serviceClient } from '../../supabase';
import { WhatsAppSendError, type WhatsAppProvider } from './provider';

/**
 * The WhatsApp rail.
 *
 * Drafts a message, checks it, then either queues it for a human or sends it.
 * Human approval is on by default for every venue and is a per-venue setting,
 * not a global one — the pilot starts with a person reading every word that
 * goes to a venue, and that trust is earned back venue by venue.
 */
export class WhatsAppRail implements BookingRail {
  readonly kind = 'whatsapp' as const;

  constructor(
    private readonly env: AgentServiceEnv,
    private readonly bsp: WhatsAppProvider,
    private readonly model: ModelProvider,
  ) {}

  async isAvailable(context: AttemptContext): Promise<boolean> {
    if (!this.env.FLAG_RAIL_WHATSAPP) return false;
    if (!context.channel.is_enabled) return false;
    if (context.channel.kind !== 'whatsapp') return false;

    const config = context.channel.config as { phone_e164?: string };
    return Boolean(config.phone_e164);
  }

  async attempt(context: AttemptContext): Promise<AttemptResult> {
    const supabase = serviceClient(this.env);
    const config = context.channel.config as {
      phone_e164: string;
      contact_name?: string | null;
      human_approval_required?: boolean;
    };

    const [{ data: venue }, { data: user }] = await Promise.all([
      supabase.from('venues').select('name, vertical').eq('id', context.booking.venue_id).single(),
      supabase
        .from('users')
        .select('full_name, email, phone_e164')
        .eq('id', context.booking.user_id)
        .single(),
    ]);

    const fullName = user?.full_name?.trim() ?? '';
    const firstName = fullName.split(/\s+/)[0] || 'our client';
    const surname = fullName.split(/\s+/).slice(1).join(' ');

    const when = new Date(context.booking.scheduled_for);
    // Rendered here, in venue-local terms, so the model does no date maths and
    // cannot quietly shift a booking by an hour.
    const whenText = when.toLocaleString('en-GB', {
      timeZone: 'Asia/Dubai',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    let draft;
    try {
      draft = await draftVenueMessage(this.model, {
        context: {
          clientFirstName: firstName,
          venueName: venue?.name ?? 'the venue',
          vertical: venue?.vertical ?? 'restaurant',
          partySize: context.booking.party_size,
          whenText,
          serviceName: context.booking.service_name,
          specialRequests: context.booking.special_requests,
          businessName: 'reservAI',
        },
        // Everything about the client that must not reach a venue.
        forbiddenTerms: [surname, user?.email ?? '', user?.phone_e164 ?? ''].filter(
          (t) => t.length > 2,
        ),
        correlationId: context.correlationId,
      });
    } catch (error) {
      return {
        outcome: 'error',
        confidence: 0,
        awaitingVenue: false,
        errorMessage: error instanceof Error ? error.message : 'Could not draft a message.',
      };
    }

    // A draft that failed its own checks is never auto-sent, whatever this
    // venue's approval setting says. The checks exist for the case where the
    // prompt did not hold.
    const requiresApproval = config.human_approval_required !== false || !draft.check.ok;

    const { data: message, error: insertError } = await supabase
      .from('venue_messages')
      .insert({
        booking_id: context.booking.id,
        venue_id: context.booking.venue_id,
        direction: 'outbound',
        status: requiresApproval ? 'awaiting_approval' : 'approved',
        body: draft.message,
        bsp: this.bsp.name,
        drafted_by: 'booker_wa',
        error_message: draft.check.ok ? null : draft.check.problems.join('; '),
      })
      .select('id')
      .single();
    if (insertError) throw insertError;

    if (requiresApproval) {
      await supabase.from('ops_tasks').insert({
        kind: 'approve_outbound_message',
        priority: draft.check.ok ? 3 : 1,
        booking_id: context.booking.id,
        venue_id: context.booking.venue_id,
        user_id: context.booking.user_id,
        title: `Approve WhatsApp to ${venue?.name ?? 'venue'}`,
        detail: draft.check.ok
          ? draft.message
          : `HELD — ${draft.check.problems.join('; ')}\n\n${draft.message}`,
      });

      return {
        outcome: 'no_response',
        confidence: 0,
        awaitingVenue: false,
        awaitingApproval: true,
        threadRef: message.id,
      };
    }

    return this.send(message.id, config.phone_e164, draft.message);
  }

  /**
   * Puts an approved message on the wire.
   *
   * Called by `attempt` for auto-send venues and by the ops console when an
   * operator approves a held draft.
   */
  async send(messageId: string, toE164: string, body: string): Promise<AttemptResult> {
    const supabase = serviceClient(this.env);

    await supabase.from('venue_messages').update({ status: 'sending' }).eq('id', messageId);

    try {
      const result = await this.bsp.sendText({ toE164, body });

      await supabase
        .from('venue_messages')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          bsp_message_id: result.messageId,
        })
        .eq('id', messageId);

      return {
        outcome: 'no_response',
        confidence: 0,
        // Sent and now waiting. The SLA clock starts here.
        awaitingVenue: true,
        threadRef: messageId,
        externalRef: result.messageId,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Send failed.';

      await supabase
        .from('venue_messages')
        .update({ status: 'failed', error_message: detail })
        .eq('id', messageId);

      return {
        outcome: 'error',
        confidence: 0,
        awaitingVenue: false,
        threadRef: messageId,
        errorMessage: detail,
        ...(error instanceof WhatsAppSendError && error.retryable
          ? { offeredAlternative: undefined }
          : {}),
      };
    }
  }

  /**
   * Cancelling with the venue.
   *
   * Always held for a human. Telling a venue a booking is off is a message we
   * cannot take back, and the volume is low enough that a person reading it
   * costs nothing.
   */
  async cancel(context: AttemptContext): Promise<AttemptResult> {
    const supabase = serviceClient(this.env);
    const config = context.channel.config as { phone_e164: string };

    const { data: venue } = await supabase
      .from('venues')
      .select('name')
      .eq('id', context.booking.venue_id)
      .single();

    const when = new Date(context.booking.scheduled_for).toLocaleString('en-GB', {
      timeZone: 'Asia/Dubai',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const body = `Hello — I need to cancel the booking for ${when}, party of ${context.booking.party_size}. Apologies for the change, and thank you.\n\nreservAI`;

    const { data: message, error } = await supabase
      .from('venue_messages')
      .insert({
        booking_id: context.booking.id,
        venue_id: context.booking.venue_id,
        direction: 'outbound',
        status: 'awaiting_approval',
        body,
        bsp: this.bsp.name,
        drafted_by: 'booker_wa',
      })
      .select('id')
      .single();
    if (error) throw error;

    await supabase.from('ops_tasks').insert({
      kind: 'approve_outbound_message',
      priority: 2,
      booking_id: context.booking.id,
      venue_id: context.booking.venue_id,
      title: `Approve cancellation to ${venue?.name ?? 'venue'}`,
      detail: `${body}\n\nSend to ${config.phone_e164}`,
    });

    return {
      outcome: 'no_response',
      confidence: 0,
      awaitingVenue: false,
      awaitingApproval: true,
      threadRef: message.id,
    };
  }
}
