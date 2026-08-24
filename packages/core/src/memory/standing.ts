/**
 * Standing entities: "my barber", "our usual place".
 *
 * Two ways a venue earns one of these labels. The user can set it explicitly in
 * their profile, and that always wins. Otherwise we infer it from behaviour —
 * but only where the behaviour is unambiguous, because resolving "my barber" to
 * the wrong barber is worse than not resolving it at all.
 */

export interface VenueHistoryEntry {
  readonly venueId: string;
  readonly venueName: string;
  readonly vertical: string;
  readonly visits: number;
  readonly lastVisit: string;
  readonly avgRating: number | null;
}

/** Phrases that mean "the one you know I mean", by vertical. */
const PHRASES: { pattern: RegExp; vertical: string | null }[] = [
  { pattern: /\b(?:my|our) (?:usual )?barber\b/i, vertical: 'barber' },
  { pattern: /\b(?:my|our) (?:usual )?(?:hairdresser|salon|stylist)\b/i, vertical: 'salon' },
  { pattern: /\b(?:my|our) usual (?:place|spot|restaurant|table)\b/i, vertical: 'restaurant' },
  { pattern: /\b(?:the|our) usual\b/i, vertical: null },
  { pattern: /\bsame (?:place|as last time|as always)\b/i, vertical: null },
];

export interface StandingMatch {
  readonly venueId: string;
  readonly venueName: string;
  /** 'explicit' when the user set it; 'inferred' when we worked it out. */
  readonly source: 'explicit' | 'inferred';
  readonly phrase: string;
}

/**
 * Enough of a favourite to answer to "my barber".
 *
 * The dominance test is the important one: three visits somewhere means little
 * if they have been to four other barbers just as often. Requiring a clear
 * leader is what stops us confidently booking the wrong place.
 */
const MIN_VISITS = 3;
const DOMINANCE = 2;

export function inferStanding(
  history: readonly VenueHistoryEntry[],
  vertical: string,
): VenueHistoryEntry | null {
  const inVertical = history
    .filter((h) => h.vertical === vertical && h.visits >= MIN_VISITS)
    .sort((a, b) => b.visits - a.visits || Date.parse(b.lastVisit) - Date.parse(a.lastVisit));

  const leader = inVertical[0];
  if (!leader) return null;

  const runnerUp = inVertical[1];
  // A clear favourite, or nothing. Ambiguity means asking rather than guessing.
  if (runnerUp && leader.visits < runnerUp.visits * DOMINANCE) return null;

  return leader;
}

/**
 * Resolves a standing phrase in what the user said.
 *
 * Returns null when there is no phrase, or when there is one but we cannot say
 * confidently which venue it means. Null is the safe answer: the Concierge then
 * asks, rather than booking somewhere they did not mean.
 */
export function resolveStanding(
  text: string,
  input: {
    /** Label to venue id, straight from the user's profile. */
    readonly explicit: Readonly<Record<string, string>>;
    readonly history: readonly VenueHistoryEntry[];
    /** The vertical the Concierge already worked out, if it did. */
    readonly vertical?: string | null;
  },
): StandingMatch | null {
  const matched = PHRASES.find((p) => p.pattern.test(text));
  if (!matched) return null;

  const phrase = text.match(matched.pattern)?.[0] ?? '';
  const vertical = matched.vertical ?? input.vertical ?? null;

  // The user's own label wins over anything we inferred.
  for (const [label, venueId] of Object.entries(input.explicit)) {
    if (
      matched.pattern.test(label) ||
      (vertical !== null && label.toLowerCase().includes(vertical))
    ) {
      const venue = input.history.find((h) => h.venueId === venueId);
      return {
        venueId,
        venueName: venue?.venueName ?? 'your usual',
        source: 'explicit',
        phrase,
      };
    }
  }

  // A bare "the usual" with no vertical to narrow it down is genuinely
  // ambiguous, and guessing across categories would be wrong more often
  // than not.
  if (vertical === null) return null;

  const inferred = inferStanding(input.history, vertical);
  if (!inferred) return null;

  return {
    venueId: inferred.venueId,
    venueName: inferred.venueName,
    source: 'inferred',
    phrase,
  };
}
