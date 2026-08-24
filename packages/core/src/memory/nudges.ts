/**
 * Whether to send someone a proactive suggestion.
 *
 * The build plan's constraint is "rule-triggered, not spammy", and the second
 * half is the hard one. A concierge who notices you are due a haircut is
 * useful; one who mentions it twice a week is an app you delete. Every rule
 * below exists to make the second thing impossible, and they are all here
 * rather than spread through the sweep so they can be reasoned about together.
 *
 * The bias throughout is towards silence. A nudge not sent costs a booking we
 * might have got; a nudge sent badly costs the user.
 */

export interface NudgeCandidate {
  readonly userId: string;
  readonly venueId: string;
  readonly venueName: string;
  readonly vertical: string;
  readonly visits: number;
  readonly lastVisit: string;
  /** Median days between visits. Null until there are two. */
  readonly medianGapDays: number | null;
  readonly avgRating: number | null;
  readonly worstRating: number | null;
  readonly daysSinceVisit: number;
  readonly lastNudgeAt: string | null;
  readonly nudgesLast30Days: number;
  /** Already has something booked there. */
  readonly hasUpcoming: boolean;
}

export type NudgeRefusal =
  | 'already_booked'
  | 'not_a_pattern'
  | 'not_due_yet'
  | 'too_long_ago'
  | 'nudged_recently'
  | 'monthly_cap'
  | 'rated_poorly'
  | 'quiet_hours';

export interface NudgeDecision {
  readonly send: boolean;
  readonly reason: NudgeRefusal | 'due';
  /** How overdue they are, as a multiple of their usual gap. */
  readonly overdueRatio?: number;
}

export const NUDGE_RULES = {
  /** Fewer than three visits is a coincidence, not a habit. */
  minVisits: 3,
  /** Nudge once they are 10% past their usual gap, not the instant it elapses. */
  dueAtRatio: 1.1,
  /**
   * Past this, they have moved on. Someone who last had a haircut six months
   * ago does not need reminding they used to go somewhere.
   */
  staleAtRatio: 3,
  /** Never twice about the same venue inside this. */
  perVenueCooldownDays: 21,
  /** Never more than this many nudges of any kind in 30 days. */
  monthlyCap: 4,
  /** A place they rated badly is not somewhere to suggest again. */
  minRating: 3,
  /** Local hours during which a notification is welcome. */
  quietHoursEnd: 9,
  quietHoursStart: 21,
} as const;

function daysBetween(a: string, b: Date): number {
  return (b.getTime() - Date.parse(a)) / 86_400_000;
}

/**
 * Dubai is UTC+4 year round, so the local hour is a fixed offset. This is a
 * deliberate simplification for a single-city pilot; it becomes wrong the day
 * reservAI opens somewhere else, and the test says so.
 */
export function localHour(now: Date, offsetHours = 4): number {
  return (now.getUTCHours() + offsetHours) % 24;
}

export function isQuietHour(now: Date, offsetHours = 4): boolean {
  const hour = localHour(now, offsetHours);
  return hour < NUDGE_RULES.quietHoursEnd || hour >= NUDGE_RULES.quietHoursStart;
}

export function decideNudge(candidate: NudgeCandidate, now: Date): NudgeDecision {
  // Cheapest and most obvious first: they have already booked.
  if (candidate.hasUpcoming) return { send: false, reason: 'already_booked' };

  if (candidate.visits < NUDGE_RULES.minVisits || candidate.medianGapDays === null) {
    return { send: false, reason: 'not_a_pattern' };
  }

  // Somewhere they did not enjoy. Suggesting it again reads as not listening.
  const rating = candidate.worstRating ?? candidate.avgRating;
  if (rating !== null && rating < NUDGE_RULES.minRating) {
    return { send: false, reason: 'rated_poorly' };
  }

  const overdueRatio = candidate.daysSinceVisit / candidate.medianGapDays;

  if (overdueRatio < NUDGE_RULES.dueAtRatio) {
    return { send: false, reason: 'not_due_yet', overdueRatio };
  }
  if (overdueRatio > NUDGE_RULES.staleAtRatio) {
    return { send: false, reason: 'too_long_ago', overdueRatio };
  }

  if (
    candidate.lastNudgeAt !== null &&
    daysBetween(candidate.lastNudgeAt, now) < NUDGE_RULES.perVenueCooldownDays
  ) {
    return { send: false, reason: 'nudged_recently', overdueRatio };
  }

  if (candidate.nudgesLast30Days >= NUDGE_RULES.monthlyCap) {
    return { send: false, reason: 'monthly_cap', overdueRatio };
  }

  // Checked last, so a candidate that is otherwise due is simply deferred to a
  // civilised hour rather than dropped.
  if (isQuietHour(now)) return { send: false, reason: 'quiet_hours', overdueRatio };

  return { send: true, reason: 'due', overdueRatio };
}

export interface NudgeCopy {
  readonly title: string;
  readonly body: string;
}

/**
 * What the nudge says.
 *
 * It has to sound like someone who noticed, not like a marketing push. It
 * names the place, says why now, and makes clear a person is not required to
 * do anything — no urgency, no scarcity, no offer.
 */
export function nudgeCopy(candidate: NudgeCandidate): NudgeCopy {
  const weeks = Math.round(candidate.daysSinceVisit / 7);
  const when = weeks <= 1 ? 'last week' : `${weeks} weeks ago`;

  if (candidate.vertical === 'barber' || candidate.vertical === 'salon') {
    return {
      title: `Due at ${candidate.venueName}?`,
      body: `You were last in ${when}. Say the word and I will get you booked.`,
    };
  }

  return {
    title: `${candidate.venueName} again?`,
    body: `It has been ${when}. I can get a table if you fancy it.`,
  };
}

/**
 * The best single candidate for a user.
 *
 * One nudge, about one place. Sending a list turns a helpful observation into
 * a newsletter, so the most overdue place a user actually likes wins and the
 * rest wait for another day.
 */
export function pickBest(
  candidates: readonly NudgeCandidate[],
  now: Date,
): { candidate: NudgeCandidate; decision: NudgeDecision } | null {
  const due = candidates
    .map((candidate) => ({ candidate, decision: decideNudge(candidate, now) }))
    .filter((entry) => entry.decision.send);

  if (due.length === 0) return null;

  return due.sort((a, b) => {
    // Most overdue first; then the place they go to most.
    const ratio = (b.decision.overdueRatio ?? 0) - (a.decision.overdueRatio ?? 0);
    if (ratio !== 0) return ratio;
    return b.candidate.visits - a.candidate.visits;
  })[0]!;
}
