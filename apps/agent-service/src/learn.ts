import type { AgentServiceEnv } from '@reservai/config';
import { signalsFromDecision, type DecisionVenue } from '@reservai/core';
import { serviceClient } from './supabase';

/**
 * Learning from a decision that has already been made.
 *
 * Called after the booking is created, never before: what is recorded here
 * changes future suggestions and nothing about this one, so it must not be able
 * to delay or fail an approval. Every error is swallowed for the same reason —
 * a preference not learned is a smaller problem than a booking not made.
 */
export async function learnFromDecision(
  env: AgentServiceEnv,
  userId: string,
  requestId: string,
  chosenSuggestionId: string,
): Promise<void> {
  try {
    const asService = serviceClient(env);

    const { data, error } = await asService
      .from('suggestions')
      .select('id, venue_id, venues(vertical, zone, price_band, tags)')
      .eq('request_id', requestId);
    if (error || !data) return;

    const venues = data.flatMap((row) => {
      const v = row.venues;
      if (!v) return [];
      return [
        {
          id: row.id,
          venue: {
            venueId: row.venue_id,
            vertical: v.vertical,
            zone: v.zone,
            priceBand: v.price_band,
            tags: v.tags ?? [],
          } satisfies DecisionVenue,
        },
      ];
    });

    const chosen = venues.find((v) => v.id === chosenSuggestionId);
    if (!chosen) return;

    const observations = signalsFromDecision(
      chosen.venue,
      venues.filter((v) => v.id !== chosenSuggestionId).map((v) => v.venue),
    );

    await Promise.all(
      observations.map((o) =>
        asService.rpc('record_preference_signal', {
          p_user_id: userId,
          p_subject: o.subject,
          p_attribute: o.attribute,
          p_value: o.value,
          p_source: o.agreed ? 'booking' : 'rejection',
          p_agreed: o.agreed,
        }),
      ),
    );
  } catch {
    // Deliberately silent. See above.
  }
}
