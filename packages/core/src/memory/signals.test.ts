import { describe, expect, it } from 'vitest';
import {
  actionable,
  CONFIDENT_ENOUGH,
  confidenceOf,
  confidenceWord,
  MIN_OBSERVATIONS,
  STALE_AFTER_DAYS,
  worthShowing,
  type PreferenceSignal,
} from './signals';

const NOW = new Date('2026-08-28T12:00:00.000Z');

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function signal(overrides: Partial<PreferenceSignal> = {}): PreferenceSignal {
  return {
    subject: 'restaurant',
    attribute: 'atmosphere',
    value: 'lively',
    observations: 10,
    agreements: 9,
    lastSeenAt: daysAgo(1),
    rejectedAt: null,
    ...overrides,
  };
}

describe('confidenceOf', () => {
  it('is zero below the observation floor, however unanimous', () => {
    // Two out of two is a coincidence. Saying "I have noticed you like this"
    // on the strength of it is how an assistant stops being believed.
    const confidence = confidenceOf(
      signal({ observations: MIN_OBSERVATIONS - 1, agreements: MIN_OBSERVATIONS - 1 }),
      NOW,
    );
    expect(confidence).toBe(0);
  });

  it('is zero for anything the user has corrected', () => {
    expect(confidenceOf(signal({ rejectedAt: daysAgo(2) }), NOW)).toBe(0);
  });

  it('holds a small sample well below its raw rate', () => {
    // Three from three is 100% by rate. It should not read as certainty.
    const small = confidenceOf(signal({ observations: 3, agreements: 3 }), NOW);
    expect(small).toBeLessThan(0.6);
    expect(small).toBeGreaterThan(0);
  });

  it('lets a large sample approach its rate', () => {
    const large = confidenceOf(signal({ observations: 60, agreements: 60 }), NOW);
    expect(large).toBeGreaterThan(0.9);
  });

  it('grows with evidence at the same rate', () => {
    const few = confidenceOf(signal({ observations: 4, agreements: 3 }), NOW);
    const many = confidenceOf(signal({ observations: 40, agreements: 30 }), NOW);
    expect(many).toBeGreaterThan(few);
  });

  it('fades as the evidence ages', () => {
    const fresh = confidenceOf(signal({ lastSeenAt: daysAgo(1) }), NOW);
    const old = confidenceOf(signal({ lastSeenAt: daysAgo(STALE_AFTER_DAYS / 2) }), NOW);
    expect(old).toBeLessThan(fresh);
    expect(old).toBeGreaterThan(0);
  });

  it('reaches zero once the evidence is stale', () => {
    expect(confidenceOf(signal({ lastSeenAt: daysAgo(STALE_AFTER_DAYS + 1) }), NOW)).toBe(0);
  });

  it('counts disagreement against it', () => {
    const mostly = confidenceOf(signal({ observations: 20, agreements: 18 }), NOW);
    const evenly = confidenceOf(signal({ observations: 20, agreements: 10 }), NOW);
    expect(evenly).toBeLessThan(mostly);
  });

  it('survives an unparseable timestamp rather than returning NaN', () => {
    // A NaN confidence sorts unpredictably and compares false against every
    // threshold, which would silently drop the signal rather than show it.
    const confidence = confidenceOf(signal({ lastSeenAt: 'not a date' }), NOW);
    expect(Number.isFinite(confidence)).toBe(true);
  });
});

describe('actionable', () => {
  it('keeps only what clears the bar', () => {
    const result = actionable(
      [
        signal({ value: 'lively', observations: 40, agreements: 38 }),
        signal({ value: 'quiet', observations: 4, agreements: 2 }),
      ],
      NOW,
    );
    expect(result.map((s) => s.value)).toEqual(['lively']);
  });

  it('puts the strongest first', () => {
    const result = actionable(
      [
        signal({ value: 'outdoor', observations: 12, agreements: 9 }),
        signal({ value: 'lively', observations: 60, agreements: 59 }),
      ],
      NOW,
    );
    expect(result[0]?.value).toBe('lively');
  });

  it('drops a corrected signal entirely, however much evidence there was', () => {
    // The user has said this is wrong. Volume of past behaviour is not an
    // argument against them.
    const result = actionable(
      [signal({ observations: 90, agreements: 90, rejectedAt: daysAgo(1) })],
      NOW,
    );
    expect(result).toEqual([]);
  });
});

describe('worthShowing', () => {
  it('includes signals too weak to act on', () => {
    const weak = signal({ observations: 4, agreements: 2 });
    expect(actionable([weak], NOW)).toEqual([]);
    // Showing it is how someone corrects an assistant before it acts on a
    // half-formed idea.
    expect(worthShowing([weak], NOW)).toHaveLength(1);
  });

  it('still hides what has been corrected', () => {
    expect(worthShowing([signal({ rejectedAt: daysAgo(1) })], NOW)).toEqual([]);
  });

  it('hides anything below the observation floor', () => {
    expect(worthShowing([signal({ observations: 2, agreements: 2 })], NOW)).toEqual([]);
  });
});

describe('confidenceWord', () => {
  it('reads as a person would say it', () => {
    expect(confidenceWord(0.95)).toBe('Confident');
    expect(confidenceWord(CONFIDENT_ENOUGH)).toBe('Fairly sure');
    expect(confidenceWord(0.2)).toBe('Still learning');
  });
});
