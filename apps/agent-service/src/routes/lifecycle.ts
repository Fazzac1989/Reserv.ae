import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AgentServiceEnv } from '@reservai/config';
import { enabledRails } from '@reservai/config';
import { nextChannel, type VenueBookingChannel } from '@reservai/core';
import { ClaudeProvider } from '@reservai/ai';
import { requireUser } from '../auth';
import { serviceClient, userClient } from '../supabase';
import { applyTransition } from '../bookings/transition';
import { ServiceError } from '../errors';
import { createWhatsAppProvider } from '../rails/whatsapp';
import { WhatsAppRail } from '../rails/whatsapp/rail';
import { runSweep } from '../scheduler';

interface Options {
  env: AgentServiceEnv;
}

const bookingParams = z.object({ bookingId: z.string().uuid() });

/**
 * What happens to a booking after it is confirmed: reminders, cancellation,
 * the calendar entry, and the rating that teaches the Curator.
 */
export async function registerLifecycleRoutes(
  app: FastifyInstance,
  { env }: Options,
): Promise<void> {
  /** Registers a device for reminders. Idempotent — devices re-register often. */
  app.post('/push-tokens', async (request, reply) => {
    const user = await requireUser(request, env);

    const parsed = z
      .object({
        token: z.string().min(10).max(500),
        platform: z.enum(['ios', 'android']),
      })
      .safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'That token is not valid.' });

    const { error } = await serviceClient(env).from('push_tokens').upsert(
      {
        user_id: user.id,
        token: parsed.data.token,
        platform: parsed.data.platform,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    );
    if (error) throw error;

    return reply.send({ ok: true });
  });

  /** The user's reservations, with everything the confirmation card shows. */
  app.get('/reservations', async (request, reply) => {
    const user = await requireUser(request, env);

    const { data, error } = await userClient(env, user.accessToken)
      .from('bookings')
      .select(
        'id, status, party_size, scheduled_for, service_name, special_requests, created_at, confirmed_at, cancelled_at, calendar_event_id, rating, rated_at, no_show, venues(name, zone, address, lat, lng, photo_urls)',
      )
      .order('scheduled_for', { ascending: false })
      .limit(100);
    if (error) throw error;

    const now = Date.now();
    const rows = data ?? [];

    return reply.send({
      // Split here rather than in the app: "upcoming" means the same thing on
      // every surface, and the rule lives in one place.
      upcoming: rows.filter(
        (b) =>
          Date.parse(b.scheduled_for) > now &&
          [
            'draft',
            'user_approved',
            'attempting',
            'pending_venue',
            'escalated',
            'confirmed',
            'reminded',
          ].includes(b.status),
      ),
      past: rows.filter(
        (b) =>
          Date.parse(b.scheduled_for) <= now ||
          ['completed', 'cancelled', 'failed'].includes(b.status),
      ),
    });
  });

  /**
   * The user cancels.
   *
   * Two things have to happen and the order matters: the booking moves to
   * `cancelled` in our system, and the venue is told. If the venue cannot be
   * told automatically, that becomes a job for a person rather than a silent
   * omission — a table nobody cancelled is the venue's problem and our fault.
   */
  app.post('/bookings/:bookingId/cancel', async (request, reply) => {
    const user = await requireUser(request, env);

    const params = bookingParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'Which booking?' });

    const parsed = z
      .object({ reason: z.string().max(500).optional() })
      .safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'That reason is too long.' });

    const asUser = userClient(env, user.accessToken);
    const asService = serviceClient(env);

    // RLS scopes this to the caller's own bookings.
    const { data: booking } = await asUser
      .from('bookings')
      .select(
        'id, status, venue_id, scheduled_for, party_size, special_requests, service_name, provider_name, user_id, request_id, suggestion_id, confirmed_at, confirmation_evidence, external_ref, cancelled_at, cancellation_reason, no_show, rating, created_at, updated_at',
      )
      .eq('id', params.data.bookingId)
      .maybeSingle();

    if (!booking) return reply.status(404).send({ error: 'No such booking.' });

    const wasConfirmed = ['confirmed', 'reminded'].includes(booking.status);

    await applyTransition(env, {
      bookingId: booking.id,
      event: 'cancel',
      actor: 'user',
      actorId: user.id,
      reason: parsed.data.reason ?? 'Cancelled by the user.',
      correlationId: booking.id,
    });

    // Only a booking the venue knows about needs unwinding with them.
    let venueTold: 'queued' | 'ops' | 'not_needed' = 'not_needed';

    if (wasConfirmed) {
      const { data: channels } = await asService
        .from('venue_booking_channels')
        .select('*')
        .eq('venue_id', booking.venue_id);

      const channel = nextChannel({
        channels: (channels ?? []) as unknown as VenueBookingChannel[],
        enabledRails: enabledRails(env),
      });

      const bsp = createWhatsAppProvider(env);

      if (channel?.kind === 'whatsapp' && bsp) {
        const rail = new WhatsAppRail(
          env,
          bsp,
          new ClaudeProvider({
            apiKey: env.ANTHROPIC_API_KEY,
            models: { fast: env.AI_MODEL_FAST, strong: env.AI_MODEL_STRONG },
          }),
        );
        await rail.cancel({
          booking: booking as never,
          channel: channel,
          sequence: 1,
          correlationId: booking.id,
        });
        venueTold = 'queued';
      } else {
        const { data: venue } = await asService
          .from('venues')
          .select('name')
          .eq('id', booking.venue_id)
          .single();

        await asService.from('ops_tasks').insert({
          kind: 'manual_booking',
          priority: 2,
          booking_id: booking.id,
          venue_id: booking.venue_id,
          user_id: user.id,
          title: `Cancel with ${venue?.name ?? 'venue'}`,
          detail: `The user cancelled. Let the venue know: ${new Date(booking.scheduled_for).toLocaleString('en-GB')}, party of ${booking.party_size}.`,
        });
        venueTold = 'ops';
      }
    }

    return reply.send({
      cancelled: true,
      venueTold,
      message:
        venueTold === 'not_needed'
          ? 'Cancelled. Nothing had been asked of the venue yet.'
          : 'Cancelled. I am letting the venue know.',
    });
  });

  /** Records the calendar event id so the entry can be updated or removed later. */
  app.post('/bookings/:bookingId/calendar', async (request, reply) => {
    const user = await requireUser(request, env);

    const params = bookingParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'Which booking?' });

    const parsed = z
      .object({ calendarEventId: z.string().min(1).max(200).nullable() })
      .safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'That event id is not valid.' });

    const { data: owned } = await userClient(env, user.accessToken)
      .from('bookings')
      .select('id')
      .eq('id', params.data.bookingId)
      .maybeSingle();
    if (!owned) return reply.status(404).send({ error: 'No such booking.' });

    const { error } = await serviceClient(env)
      .from('bookings')
      .update({ calendar_event_id: parsed.data.calendarEventId })
      .eq('id', params.data.bookingId);
    if (error) throw error;

    return reply.send({ ok: true });
  });

  /**
   * The post-visit rating.
   *
   * Written straight onto the booking rather than into preferences: Phase 10
   * learns from the pattern across many bookings, and a single rating is
   * evidence, not a conclusion.
   */
  app.post('/bookings/:bookingId/rate', async (request, reply) => {
    const user = await requireUser(request, env);

    const params = bookingParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'Which booking?' });

    const parsed = z
      .object({
        rating: z.number().int().min(1).max(5),
        note: z.string().max(1000).optional(),
        noShow: z.boolean().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Give a rating from 1 to 5.' });

    const { data: booking } = await userClient(env, user.accessToken)
      .from('bookings')
      .select('id, status')
      .eq('id', params.data.bookingId)
      .maybeSingle();
    if (!booking) return reply.status(404).send({ error: 'No such booking.' });

    if (!['confirmed', 'reminded', 'completed'].includes(booking.status)) {
      throw new ServiceError(409, 'That booking never happened, so there is nothing to rate.');
    }

    const asService = serviceClient(env);

    await asService
      .from('bookings')
      .update({
        rating: parsed.data.rating,
        rated_at: new Date().toISOString(),
        rating_note: parsed.data.note ?? null,
        no_show: parsed.data.noShow ?? false,
      })
      .eq('id', booking.id);

    // Rating it is also the user telling us the visit happened.
    if (booking.status !== 'completed') {
      await applyTransition(env, {
        bookingId: booking.id,
        event: 'complete',
        actor: 'system',
        reason: 'User rated the visit.',
        metadata: { rating: parsed.data.rating, noShow: parsed.data.noShow ?? false },
        correlationId: booking.id,
      }).catch(() => {
        // A booking ops already completed is fine; the rating still landed.
      });
    }

    await asService
      .from('bookings')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', booking.id)
      .is('completed_at', null);

    return reply.send({ ok: true });
  });

  /**
   * Runs the sweep now.
   *
   * Ops-only, and the same code the timer runs — useful for testing the
   * reminder path without waiting for a real booking to come round.
   */
  app.post('/internal/sweep', async (request, reply) => {
    const secret = request.headers['x-internal-secret'];
    if (secret !== env.INTERNAL_API_SECRET) {
      throw new ServiceError(403, 'Internal endpoint.');
    }

    // An optional "as of" time. The sweep's decisions depend heavily on the
    // clock — quiet hours, reminder windows, SLA elapsed — and without this
    // they can only be exercised by waiting. Secret-gated and internal, so it
    // is an operational tool rather than a way in.
    const at = z
      .object({ at: z.string().datetime({ offset: true }).optional() })
      .safeParse(request.body ?? {});

    const now = at.success && at.data.at ? new Date(at.data.at) : new Date();

    const result = await runSweep(env, request.log, now);
    return reply.send({ ...result, ranAt: now.toISOString() });
  });
}
