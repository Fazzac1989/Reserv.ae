import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AgentServiceEnv } from '@reservai/config';
import { BOOKING_EVENTS, nextChannel, type VenueBookingChannel } from '@reservai/core';
import { enabledRails } from '@reservai/config';
import { requireUser } from '../auth';
import { learnFromDecision } from '../learn';
import { serviceClient, userClient } from '../supabase';
import { applyTransition } from '../bookings/transition';
import { ServiceError } from '../errors';

interface Options {
  env: AgentServiceEnv;
}

const approveBody = z.object({ suggestionId: z.string().uuid() });

const transitionBody = z.object({
  event: z.enum(BOOKING_EVENTS),
  reason: z.string().max(1000).optional(),
  /** Only ever an ops action from the console — the other kinds come from rails. */
  evidence: z
    .object({
      kind: z.literal('ops_action'),
      opsUserId: z.string().uuid(),
      note: z.string().min(1).max(1000),
    })
    .optional(),
  externalRef: z.string().max(200).optional(),
});

async function assertOps(env: AgentServiceEnv, accessToken: string, userId: string): Promise<void> {
  const { data } = await userClient(env, accessToken)
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  const isOps = (data ?? []).some((r) => r.role === 'ops' || r.role === 'admin');
  if (!isOps) throw new ServiceError(403, 'Ops access required.');
}

/**
 * The booking lifecycle.
 *
 * Every route here ends in `applyTransition`, which runs the state machine and
 * writes the audit row atomically. Nothing writes `bookings.status` directly —
 * not this service, not the console, not the app.
 */
export async function registerBookingRoutes(app: FastifyInstance, { env }: Options): Promise<void> {
  /**
   * The user accepts one of the three cards.
   *
   * Creates the booking as `draft` and immediately applies `user_approve`. The
   * draft is not a formality: it is the row the transition is recorded against,
   * so the audit trail starts with "the user said yes" rather than with a
   * booking that simply appeared already approved.
   */
  app.post('/bookings/approve', async (request, reply) => {
    const user = await requireUser(request, env);

    const parsed = approveBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Which suggestion?' });

    const asUser = userClient(env, user.accessToken);
    const asService = serviceClient(env);

    // RLS restricts this to suggestions on the caller's own request.
    const { data: suggestion } = await asUser
      .from('suggestions')
      .select('id, request_id, venue_id, proposed_starts_at, outcome, requests(user_id)')
      .eq('id', parsed.data.suggestionId)
      .maybeSingle();

    if (!suggestion) return reply.status(404).send({ error: 'No such suggestion.' });
    if (suggestion.outcome !== 'pending') {
      throw new ServiceError(409, 'You have already decided on that one.');
    }

    const { data: request_ } = await asUser
      .from('requests')
      .select('parsed_intent')
      .eq('id', suggestion.request_id)
      .single();

    const intent = request_?.parsed_intent as {
      party_size?: number;
      constraints?: string[];
    } | null;

    const { data: preferences } = await asUser
      .from('user_preferences')
      .select('default_party_size, dietary, allergies')
      .eq('user_id', user.id)
      .single();

    // Dietary needs travel with the booking automatically. The user should not
    // have to remember to mention a shellfish allergy every single time.
    const specialRequests = [
      ...(preferences?.allergies ?? []).map((a) => `Allergy: ${a}`),
      ...(preferences?.dietary ?? []),
      ...(intent?.constraints ?? []),
    ].join('. ');

    const { data: booking, error: createError } = await asService
      .from('bookings')
      .insert({
        user_id: user.id,
        venue_id: suggestion.venue_id,
        request_id: suggestion.request_id,
        suggestion_id: suggestion.id,
        status: 'draft',
        party_size: intent?.party_size ?? preferences?.default_party_size ?? 2,
        scheduled_for: suggestion.proposed_starts_at,
        special_requests: specialRequests || null,
      })
      .select('id')
      .single();
    if (createError) throw createError;

    await applyTransition(env, {
      bookingId: booking.id,
      event: 'user_approve',
      actor: 'user',
      actorId: user.id,
      correlationId: suggestion.request_id,
    });

    await asService
      .from('suggestions')
      .update({ outcome: 'accepted', decided_at: new Date().toISOString() })
      .eq('id', suggestion.id);

    // The others were considered and turned down. That is the only signal
    // this product gets that nobody self-reported.
    await asService
      .from('suggestions')
      .update({ outcome: 'rejected', decided_at: new Date().toISOString() })
      .eq('request_id', suggestion.request_id)
      .neq('id', suggestion.id)
      .eq('outcome', 'pending');

    await asService
      .from('requests')
      .update({ status: 'converted' })
      .eq('id', suggestion.request_id);

    // After the booking exists, and unable to affect it either way.
    await learnFromDecision(env, user.id, suggestion.request_id, suggestion.id);

    // Pick the rail. Only the manual rail exists in the pilot's first
    // end-to-end path, so this creates work for a human rather than pretending
    // an automated channel did something.
    const { data: channels } = await asService
      .from('venue_booking_channels')
      .select('*')
      .eq('venue_id', suggestion.venue_id);

    const channel = nextChannel({
      channels: (channels ?? []) as unknown as VenueBookingChannel[],
      enabledRails: enabledRails(env),
    });

    const { data: venue } = await asService
      .from('venues')
      .select('name')
      .eq('id', suggestion.venue_id)
      .single();

    if (!channel) {
      await applyTransition(env, {
        bookingId: booking.id,
        event: 'escalate',
        actor: 'system',
        reason: 'No enabled booking channel for this venue.',
        correlationId: suggestion.request_id,
      });
    }

    await asService.from('ops_tasks').insert({
      kind: 'manual_booking',
      // Sooner bookings are more urgent; this is a coarse but honest proxy.
      priority: Date.parse(suggestion.proposed_starts_at) - Date.now() < 48 * 3600_000 ? 2 : 3,
      booking_id: booking.id,
      venue_id: suggestion.venue_id,
      user_id: user.id,
      title: `Book ${venue?.name ?? 'venue'} — ${new Date(suggestion.proposed_starts_at).toLocaleString('en-GB')}`,
      detail: channel
        ? `Rail: ${channel.kind}. ${specialRequests || 'No special requests.'}`
        : 'No enabled channel — this venue cannot be reached automatically.',
    });

    return reply.send({
      bookingId: booking.id,
      status: channel ? 'user_approved' : 'escalated',
      rail: channel?.kind ?? null,
      message: channel
        ? 'Approved. I am arranging it now and will confirm as soon as the venue does.'
        : 'Approved, though I have no working channel for this venue — a person will sort it out.',
    });
  });

  /** The user's own bookings, newest first. */
  app.get('/bookings', async (request, reply) => {
    const user = await requireUser(request, env);

    const { data, error } = await userClient(env, user.accessToken)
      .from('bookings')
      .select('id, status, party_size, scheduled_for, special_requests, venues(name, zone)')
      .order('scheduled_for', { ascending: false })
      .limit(50);
    if (error) throw error;

    return reply.send({ bookings: data ?? [] });
  });

  /**
   * An ops action from the console booking queue.
   *
   * The console cannot write `bookings.status` itself: RLS grants it, but the
   * deferred audit trigger refuses any change without a matching events_log
   * row, and ops cannot write that table. So it comes here, where the state
   * machine runs.
   */
  app.post('/bookings/:bookingId/transition', async (request, reply) => {
    const user = await requireUser(request, env);
    await assertOps(env, user.accessToken, user.id);

    const params = z.object({ bookingId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'Which booking?' });

    const parsed = transitionBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Bad request.' });
    }

    const result = await applyTransition(env, {
      bookingId: params.data.bookingId,
      event: parsed.data.event,
      actor: 'ops',
      actorId: user.id,
      ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
      ...(parsed.data.evidence !== undefined ? { evidence: parsed.data.evidence } : {}),
      ...(parsed.data.externalRef !== undefined ? { externalRef: parsed.data.externalRef } : {}),
    });

    // Closing the loop: an ops task for a booking that has reached a resting
    // place should not sit in the queue looking like outstanding work.
    if (['confirmed', 'completed', 'cancelled', 'failed'].includes(result.to)) {
      await serviceClient(env)
        .from('ops_tasks')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution_note: `Booking moved to ${result.to}.`,
        })
        .eq('booking_id', params.data.bookingId)
        .in('status', ['open', 'in_progress']);
    }

    return reply.send(result);
  });
}
