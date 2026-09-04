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
  /** Set when the user has said this is right. It stops being an inference. */
  readonly confirmedAt: string | null;
}

export interface Inference extends PreferenceSignal {
  /** 0–1. How strongly the evidence points, in whichever direction it points. */
  readonly confidence: number;
  /**
   * Which way it points.
   *
   * Passing something over repeatedly is evidence, and it is evidence of the
   * opposite thing. Collapsing both into one number reads as "we are not sure
   * you like Italian" when what actually happened is that Italian was offered
   * four times and declined three — a thing we are fairly sure of, about a
   * preference in the other direction.
   */
  readonly leaning: 'toward' | 'against';
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
 * How strongly the evidence points, whichever way it points.
 *
 * Measured from the halfway mark rather than from zero: one acceptance in four
 * is as informative as three in four, and in the same product both are worth
 * saying. An even split is the only genuinely uninformative result.
 *
 * Two things pull it down. A small sample, because four out of five is a
 * weaker claim than forty out of fifty and should read as one. And age, because
 * someone who loved a place last January may have moved, changed job, or simply
 * moved on — the evidence has not changed, but its relevance has.
 */
export function confidenceOf(signal: PreferenceSignal, now: Date): number {
  if (signal.rejectedAt !== null) return 0;
  // Confirmed by the person it is about. None of the hedging below applies to
  // something someone has told us directly, and continuing to hedge it is how
  // an assistant makes you repeat yourself.
  if (signal.confirmedAt !== null) return 1;
  if (signal.observations < MIN_OBSERVATIONS) return 0;

  const rate = signal.agreements / signal.observations;
  // Distance from an even split, scaled back to 0–1.
  const strength = Math.abs(rate - 0.5) * 2;

  // Approaches 1 as observations grow; at the floor of three it holds the
  // claim to roughly half of what the raw evidence would say.
  const sampleWeight = signal.observations / (signal.observations + MIN_OBSERVATIONS);

  const days = (now.getTime() - Date.parse(signal.lastSeenAt)) / 86_400_000;
  // Linear rather than exponential: a preference does not become worthless on
  // a particular day, it just stops being the first thing worth mentioning.
  const freshness = Number.isFinite(days) ? Math.max(0, 1 - days / STALE_AFTER_DAYS) : 1;

  return Math.round(strength * sampleWeight * freshness * 100) / 100;
}

export function leaningOf(signal: PreferenceSignal): 'toward' | 'against' {
  return signal.agreements * 2 >= signal.observations ? 'toward' : 'against';
}

export function toInference(signal: PreferenceSignal, now: Date): Inference {
  return { ...signal, confidence: confidenceOf(signal, now), leaning: leaningOf(signal) };
}

/**
 * What Suhail may act on without being asked.
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
    .filter(
      (s) =>
        s.rejectedAt === null && (s.confirmedAt !== null || s.observations >= MIN_OBSERVATIONS),
    )
    .map((s) => toInference(s, now))
    .sort((a, b) => b.confidence - a.confidence);
}

/** How sure Suhail is, said the way a person would say it. */
export function confidenceWord(confidence: number): string {
  // Distinct from the screen's own "You told me" heading, which is about the
  // preferences typed during onboarding rather than an inference confirmed.
  if (confidence >= 1) return 'Confirmed by you';
  if (confidence >= 0.8) return 'Confident';
  if (confidence >= CONFIDENT_ENOUGH) return 'Fairly sure';
  return 'Still learning';
}
