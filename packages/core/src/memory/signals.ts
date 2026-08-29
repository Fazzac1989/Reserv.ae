/**
 * Turning counted observations into something worth saying out loud.
 *
 * The database records what happened. This decides what it means, and it is
 * deliberately conservative: an assistant that tells you it has noticed
 * something, when it has seen it twice, is an assistant you stop believing.
 *
 * Nothing here stores a number. Confidence is derived from the evidence every
 * time it is asked for, so a signal can never claim a certainty its own counts
 * do not support.
 */

export interface PreferenceSignal {
  readonly subject: string | null;
  readonly attribute: string;
  readonly value: string;
  readonly observations: number;
  readonly agreements: number;
  readonly lastSeenAt: string;
  readonly rejectedAt: string | null;
}

export interface Inference extends PreferenceSignal {
  /** 0–1. What the evidence supports, not what we would like to believe. */
  readonly confidence: number;
}

/**
 * Below this, a rate is noise. Three is the same floor the taste signals in
 * the database use, and it is the smallest number at which a majority means
 * anything at all.
 */
export const MIN_OBSERVATIONS = 3;

/** Only say it out loud above this. */
export const CONFIDENT_ENOUGH = 0.6;

/** After this long with no reinforcement, a preference is a memory. */
export const STALE_AFTER_DAYS = 240;

/**
 * Confidence in one signal.
 *
 * Two things pull it down. A small sample, because four out of five is a
 * weaker claim than forty out of fifty and should read as one. And age, because
 * someone who loved a place last January may have moved, changed job, or simply
 * moved on — the evidence has not changed, but its relevance has.
 */
export function confidenceOf(signal: PreferenceSignal, now: Date): number {
  if (signal.rejectedAt !== null) return 0;
  if (signal.observations < MIN_OBSERVATIONS) return 0;

  const rate = signal.agreements / signal.observations;

  // Approaches 1 as observations grow; at the floor of three it holds the
  // claim to roughly half of what the raw rate would say.
  const sampleWeight = signal.observations / (signal.observations + MIN_OBSERVATIONS);

  const days = (now.getTime() - Date.parse(signal.lastSeenAt)) / 86_400_000;
  // Linear rather than exponential: a preference does not become worthless on
  // a particular day, it just stops being the first thing worth mentioning.
  const freshness = Number.isFinite(days) ? Math.max(0, 1 - days / STALE_AFTER_DAYS) : 1;

  return Math.round(rate * sampleWeight * freshness * 100) / 100;
}

export function toInference(signal: PreferenceSignal, now: Date): Inference {
  return { ...signal, confidence: confidenceOf(signal, now) };
}

/**
 * What Riva may act on without being asked.
 *
 * Sorted by confidence so a caller taking the top few gets the ones it is most
 * entitled to. Anything the user has corrected is gone entirely — a rejected
 * inference is not a weak one, it is a wrong one.
 */
export function actionable(signals: readonly PreferenceSignal[], now: Date): Inference[] {
  return signals
    .map((s) => toInference(s, now))
    .filter((s) => s.confidence >= CONFIDENT_ENOUGH)
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * What to show on the transparency screen.
 *
 * A lower bar than acting: seeing "I think you prefer outdoor seating, and I
 * am not sure yet" is how someone corrects an assistant before it has acted on
 * a half-formed idea. Rejected signals stay hidden — they have been dealt with.
 */
export function worthShowing(signals: readonly PreferenceSignal[], now: Date): Inference[] {
  return signals
    .filter((s) => s.rejectedAt === null && s.observations >= MIN_OBSERVATIONS)
    .map((s) => toInference(s, now))
    .sort((a, b) => b.confidence - a.confidence);
}

/** How sure Riva is, said the way a person would say it. */
export function confidenceWord(confidence: number): string {
  if (confidence >= 0.8) return 'Confident';
  if (confidence >= CONFIDENT_ENOUGH) return 'Fairly sure';
  return 'Still learning';
}
