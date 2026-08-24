import type { CuratorOutput } from './schema';

/**
 * The deterministic layer over the Curator's ranking.
 *
 * The model is given a shortlist that is already feasible, so its job is taste,
 * not fact. This is where we make sure it stayed inside that job: a venue it
 * was not offered, a time outside the window, or a duplicated rank are all
 * dropped rather than shown to a user as a real option.
 */

export interface RankableVenue {
  readonly id: string;
  readonly name: string;
}

export interface RankedSuggestion {
  readonly venueId: string;
  readonly rank: number;
  readonly rationale: string;
  readonly proposedStart: string;
  readonly proposedEnd: string;
}

export interface RankingResult {
  readonly suggestions: RankedSuggestion[];
  /** Anything the model returned that we refused to pass on, and why. */
  readonly discarded: { venueId: string; reason: string }[];
}

export interface RankingWindow {
  readonly starts_at: string;
  readonly ends_at: string;
}

/** How long we assume a booking occupies, per vertical. */
const DURATION_MINUTES: Record<string, number> = {
  restaurant: 120,
  salon: 90,
  barber: 45,
};

export function normaliseRanking(
  output: CuratorOutput,
  candidates: readonly RankableVenue[],
  window: RankingWindow,
  vertical: string,
): RankingResult {
  const allowed = new Map(candidates.map((c) => [c.id, c]));
  const suggestions: RankedSuggestion[] = [];
  const discarded: { venueId: string; reason: string }[] = [];
  const usedRanks = new Set<number>();
  const usedVenues = new Set<string>();

  const windowStart = Date.parse(window.starts_at);
  const windowEnd = Date.parse(window.ends_at);
  const duration = (DURATION_MINUTES[vertical] ?? 90) * 60_000;

  for (const ranking of [...output.rankings].sort((a, b) => a.rank - b.rank)) {
    // The one that matters most: a venue nobody offered is an invention, and
    // showing it would mean offering a user somewhere we cannot book.
    if (!allowed.has(ranking.venue_id)) {
      discarded.push({ venueId: ranking.venue_id, reason: 'not among the candidates' });
      continue;
    }
    if (usedVenues.has(ranking.venue_id)) {
      discarded.push({ venueId: ranking.venue_id, reason: 'ranked twice' });
      continue;
    }

    const proposed = Date.parse(ranking.proposed_start);
    if (Number.isNaN(proposed)) {
      discarded.push({ venueId: ranking.venue_id, reason: 'unreadable proposed time' });
      continue;
    }
    // The window is what the user asked for. A time outside it is a different
    // request, not a suggestion.
    if (proposed < windowStart || proposed > windowEnd) {
      discarded.push({ venueId: ranking.venue_id, reason: 'proposed time outside the window' });
      continue;
    }

    const rationale = ranking.rationale.trim();
    if (rationale.length === 0) {
      discarded.push({ venueId: ranking.venue_id, reason: 'no rationale' });
      continue;
    }

    usedVenues.add(ranking.venue_id);
    // Ranks are reassigned in order rather than trusted, so a gap or a repeat
    // in the model's numbering cannot produce two "first choices".
    let rank = suggestions.length + 1;
    while (usedRanks.has(rank)) rank += 1;
    usedRanks.add(rank);

    suggestions.push({
      venueId: ranking.venue_id,
      rank,
      rationale,
      proposedStart: new Date(proposed).toISOString(),
      proposedEnd: new Date(proposed + duration).toISOString(),
    });

    if (suggestions.length === 3) break;
  }

  return { suggestions, discarded };
}
