import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AgentServiceEnv } from '@reservai/config';
import { enabledRails } from '@reservai/config';
import { filterCandidates, REJECTION_LABELS, type CandidateVenue } from '@reservai/core';
import { ClaudeProvider, ModelOutputError, runCurator } from '@reservai/ai';
import { requireUser } from '../auth';
import { MODEL_LIMIT } from '../rate-limit';
import { serviceClient, userClient } from '../supabase';
import { ServiceError } from '../errors';
import { loadLearnedProfile } from '../memory';

interface Options {
  env: AgentServiceEnv;
}

const params = z.object({ requestId: z.string().uuid() });

/**
 * Turning a parsed request into two or three real options.
 *
 * Deterministic filtering first, ranking second. The filter decides what is
 * bookable — a matter of fact — and the model decides what is best, which is a
 * matter of taste. Getting that order wrong is how a concierge ends up offering
 * somewhere that closed an hour ago.
 */
export async function registerSuggestionRoutes(
  app: FastifyInstance,
  { env }: Options,
): Promise<void> {
  const provider = new ClaudeProvider({
    apiKey: env.ANTHROPIC_API_KEY,
    models: { fast: env.AI_MODEL_FAST, strong: env.AI_MODEL_STRONG },
  });

  app.post('/requests/:requestId/suggest', MODEL_LIMIT, async (request, reply) => {
    const user = await requireUser(request, env);

    const parsed = params.safeParse(request.params);
    if (!parsed.success) return reply.status(400).send({ error: 'Which request?' });

    const asUser = userClient(env, user.accessToken);
    const asService = serviceClient(env);

    // RLS means this only finds the caller's own request.
    const { data: requestRow } = await asUser
      .from('requests')
      .select('id, parsed_intent, status')
      .eq('id', parsed.data.requestId)
      .maybeSingle();

    if (!requestRow) return reply.status(404).send({ error: 'No such request.' });

    const intent = requestRow.parsed_intent as {
      vertical: string | null;
      zones: string[];
      window: { starts_at: string; ends_at: string } | null;
      party_size: number | null;
      price_band_max: number | null;
      occasion: string | null;
      constraints: string[];
    } | null;

    if (!intent?.vertical || !intent.window) {
      throw new ServiceError(
        409,
        'That request still needs a few details before I can look for anywhere.',
      );
    }

    const { data: preferences } = await asUser
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();
    if (!preferences) throw new ServiceError(409, 'Finish setting up your profile first.');

    // The whole live directory, with what we need to judge feasibility.
    const { data: venues, error: venuesError } = await asService
      .from('venues')
      .select(
        'id, name, vertical, zone, price_band, tags, house_note, best_times, opening_hours, onboarding_status, booking_consent_obtained_at, venue_booking_channels(kind, is_enabled), venue_policies(min_lead_time_minutes, max_lead_time_days, min_party_size, max_party_size)',
      )
      .eq('onboarding_status', 'live');
    if (venuesError) throw venuesError;

    const railsOn = new Set(enabledRails(env));

    const candidates: CandidateVenue[] = (venues ?? []).map((v) => {
      const policyEmbed = v.venue_policies;
      const policy = Array.isArray(policyEmbed) ? (policyEmbed[0] ?? null) : (policyEmbed ?? null);
      return {
        id: v.id,
        name: v.name,
        vertical: v.vertical,
        zone: v.zone,
        price_band: v.price_band,
        tags: v.tags ?? [],
        // A jsonb column arrives as Json. The shape is enforced on write by
        // openingHoursSchema; here it is read back through unknown.
        opening_hours: (v.opening_hours ?? []) as unknown as CandidateVenue['opening_hours'],
        onboarding_status: v.onboarding_status,
        booking_consent_obtained_at: v.booking_consent_obtained_at,
        // A rail counts only if the venue has it on AND it is switched on
        // globally. A channel configured for a rail we have not built yet is
        // not a way of reaching anyone.
        reachableRails: (v.venue_booking_channels ?? [])
          .filter((c) => c.is_enabled && railsOn.has(c.kind))
          .map((c) => c.kind),
        policy,
      };
    });

    const { candidates: shortlist, rejected } = filterCandidates(candidates, {
      vertical: intent.vertical as CandidateVenue['vertical'],
      zones: intent.zones as CandidateVenue['zone'][],
      window: intent.window,
      partySize: intent.party_size ?? preferences.default_party_size,
      priceBandMax: intent.price_band_max ?? preferences.price_band_max,
      cuisinesAvoided: preferences.cuisines_avoided ?? [],
      now: new Date().toISOString(),
    });

    if (shortlist.length === 0) {
      // Say what actually happened rather than "no results". The tally is the
      // most useful thing ops has when a real user's request finds nothing.
      const tally = rejected.reduce<Record<string, number>>((acc, r) => {
        acc[r.reason] = (acc[r.reason] ?? 0) + 1;
        return acc;
      }, {});

      await asService.from('requests').update({ status: 'suggested' }).eq('id', requestRow.id);

      return reply.send({
        suggestions: [],
        message:
          'Nothing in the directory fits that yet. I have flagged it so we can widen the options.',
        rejected: Object.entries(tally).map(([reason, count]) => ({
          reason,
          label: REJECTION_LABELS[reason as keyof typeof REJECTION_LABELS] ?? reason,
          count,
        })),
      });
    }

    const [{ data: recent }, learned] = await Promise.all([
      asUser
        .from('bookings')
        .select('venue_id')
        .order('created_at', { ascending: false })
        .limit(10),
      loadLearnedProfile(env, user.id, user.accessToken),
    ]);

    const byId = new Map(shortlist.map((v) => [v.id, v]));
    const details = new Map((venues ?? []).map((v) => [v.id, v]));

    let ranking;
    try {
      ranking = await runCurator(provider, {
        context: {
          occasion: intent.occasion,
          partySize: intent.party_size ?? preferences.default_party_size,
          windowStart: intent.window.starts_at,
          windowEnd: intent.window.ends_at,
          constraints: intent.constraints ?? [],
          // What they told us in onboarding, plus what they have actually
          // picked since. Behaviour is the better signal, so it goes last and
          // the Curator sees both.
          cuisinesLoved: [
            ...(preferences.cuisines_loved ?? []),
            ...learned.likes.map((l) => l.tag),
          ],
          dietary: preferences.dietary ?? [],
          allergies: preferences.allergies ?? [],
          recentVenueIds: (recent ?? []).map((b) => b.venue_id),
        },
        candidates: shortlist.map((v) => {
          const detail = details.get(v.id);
          return {
            id: v.id,
            name: v.name,
            zone: v.zone,
            priceBand: v.price_band,
            tags: v.tags,
            houseNote: detail?.house_note ?? null,
            bestTimes: detail?.best_times ?? [],
          };
        }),
        vertical: intent.vertical,
        correlationId: requestRow.id,
      });
    } catch (error) {
      if (error instanceof ModelOutputError) {
        request.log.warn({ err: error, requestId: requestRow.id }, 'Curator produced no ranking');
        throw new ServiceError(
          503,
          'I could not put options together just now. Try again shortly.',
        );
      }
      throw error;
    }

    if (ranking.discarded.length > 0) {
      // Worth knowing about: it means the prompt let something through that the
      // deterministic layer had to catch.
      request.log.warn(
        { requestId: requestRow.id, discarded: ranking.discarded },
        'Curator output partly rejected',
      );
    }

    // Replace rather than append: re-running suggestions on a request should
    // not leave the previous set lying around to be approved by mistake.
    await asService.from('suggestions').delete().eq('request_id', requestRow.id);

    const { data: written, error: writeError } = await asService
      .from('suggestions')
      .insert(
        ranking.suggestions.map((s) => ({
          request_id: requestRow.id,
          venue_id: s.venueId,
          rank: s.rank,
          proposed_starts_at: s.proposedStart,
          proposed_ends_at: s.proposedEnd,
          // Nothing has been asked of the venue yet. Only the API rail, once it
          // exists, may ever set this true.
          slot_is_verified: false,
          rationale: s.rationale,
          reasoning_snapshot: {
            model: ranking.model,
            usage: ranking.usage,
            shortlist: shortlist.map((v) => v.id),
            rejected: rejected.map((r) => ({ venueId: r.venueId, reason: r.reason })),
            discarded: ranking.discarded,
          },
        })),
      )
      .select('id, rank, venue_id, proposed_starts_at, proposed_ends_at, rationale');
    if (writeError) throw writeError;

    await asService.from('requests').update({ status: 'suggested' }).eq('id', requestRow.id);

    return reply.send({
      suggestions: (written ?? []).map((s) => {
        const venue = byId.get(s.venue_id);
        const detail = details.get(s.venue_id);
        return {
          id: s.id,
          rank: s.rank,
          venueId: s.venue_id,
          name: venue?.name ?? 'Unknown',
          zone: venue?.zone,
          priceBand: venue?.price_band,
          tags: venue?.tags ?? [],
          houseNote: detail?.house_note ?? null,
          proposedStart: s.proposed_starts_at,
          proposedEnd: s.proposed_ends_at,
          rationale: s.rationale,
          /** False until a rail has actually confirmed the slot exists. */
          slotIsVerified: false,
        };
      }),
      rejected: [],
    });
  });
}
