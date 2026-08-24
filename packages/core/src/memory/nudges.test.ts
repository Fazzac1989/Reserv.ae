import { describe, expect, it } from 'vitest';
import { decideNudge, isQuietHour, nudgeCopy, NUDGE_RULES, pickBest } from './nudges';
import type { NudgeCandidate } from './nudges';

// 14:00 Dubai on a Thursday — a civilised hour to be messaged.
const NOW = new Date('2026-02-05T10:00:00.000Z');

function candidate(overrides: Partial<NudgeCandidate> = {}): NudgeCandidate {
  return {
    userId: 'u1',
    venueId: 'v1',
    venueName: 'Thornbury Barbers',
    vertical: 'barber',
    visits: 4,
    lastVisit: '2026-01-11T10:00:00.000Z',
    medianGapDays: 21,
    avgRating: 5,
    worstRating: 5,
    daysSinceVisit: 25,
    lastNudgeAt: null,
    nudgesLast30Days: 0,
    hasUpcoming: false,
    ...overrides,
  };
}

describe('someone genuinely due', () => {
  it('is nudged', () => {
    const decision = decideNudge(candidate(), NOW);
    expect(decision.send).toBe(true);
    expect(decision.reason).toBe('due');
  });

  it('reports how overdue they are', () => {
    // 25 days against a 21-day habit.
    expect(decideNudge(candidate(), NOW).overdueRatio).toBeCloseTo(1.19, 2);
  });
});

describe('the rules that stop it being annoying', () => {
  it('says nothing when they have already booked', () => {
    expect(decideNudge(candidate({ hasUpcoming: true }), NOW)).toMatchObject({
      send: false,
      reason: 'already_booked',
    });
  });

  // Two visits is a coincidence. Nudging on it would mean pestering someone
  // who happened to go twice.
  it('needs a habit, not a coincidence', () => {
    expect(decideNudge(candidate({ visits: 2 }), NOW).reason).toBe('not_a_pattern');
  });

  it('needs a measurable gap between visits', () => {
    expect(decideNudge(candidate({ medianGapDays: null }), NOW).reason).toBe('not_a_pattern');
  });

  it('waits until they are properly due, not the instant the gap elapses', () => {
    // Exactly on their usual gap — still early.
    expect(decideNudge(candidate({ daysSinceVisit: 21 }), NOW).reason).toBe('not_due_yet');
    // Ten percent past it.
    expect(decideNudge(candidate({ daysSinceVisit: 23.2 }), NOW).send).toBe(true);
  });

  // Somebody who last went six months ago has moved on. Reminding them is not
  // a service, it is a re-engagement campaign.
  it('gives up once they have clearly moved on', () => {
    expect(decideNudge(candidate({ daysSinceVisit: 70 }), NOW).reason).toBe('too_long_ago');
  });

  it('never mentions the same place twice in three weeks', () => {
    expect(decideNudge(candidate({ lastNudgeAt: '2026-01-25T10:00:00.000Z' }), NOW).reason).toBe(
      'nudged_recently',
    );
    // Three weeks and a day later is fine.
    expect(decideNudge(candidate({ lastNudgeAt: '2026-01-14T10:00:00.000Z' }), NOW).send).toBe(
      true,
    );
  });

  it('caps how many nudges of any kind a month can hold', () => {
    expect(decideNudge(candidate({ nudgesLast30Days: NUDGE_RULES.monthlyCap }), NOW).reason).toBe(
      'monthly_cap',
    );
    expect(decideNudge(candidate({ nudgesLast30Days: 3 }), NOW).send).toBe(true);
  });

  // Suggesting somewhere they disliked reads as not having listened.
  it('never suggests a place they rated badly', () => {
    expect(decideNudge(candidate({ worstRating: 2, avgRating: 4 }), NOW).reason).toBe(
      'rated_poorly',
    );
  });

  it('judges on the worst visit, not the average', () => {
    // A good average hiding one bad night is still a bad night.
    expect(decideNudge(candidate({ avgRating: 4.5, worstRating: 1 }), NOW).reason).toBe(
      'rated_poorly',
    );
  });

  it('is not put off by a place they have never rated', () => {
    expect(decideNudge(candidate({ avgRating: null, worstRating: null }), NOW).send).toBe(true);
  });
});

describe('quiet hours', () => {
  it('says nothing before nine or after nine, Dubai time', () => {
    // 03:00 Dubai.
    expect(isQuietHour(new Date('2026-02-05T23:00:00.000Z'))).toBe(true);
    // 23:00 Dubai.
    expect(isQuietHour(new Date('2026-02-05T19:00:00.000Z'))).toBe(true);
    // 14:00 Dubai.
    expect(isQuietHour(new Date('2026-02-05T10:00:00.000Z'))).toBe(false);
  });

  it('defers rather than drops — a due nudge is still due tomorrow', () => {
    const decision = decideNudge(candidate(), new Date('2026-02-05T23:00:00.000Z'));
    expect(decision.reason).toBe('quiet_hours');
    // The overdue figure is still reported, so nothing is lost by waiting.
    expect(decision.overdueRatio).toBeGreaterThan(1);
  });

  // A single-city pilot can assume one offset. This test is here so the day
  // reservAI opens somewhere else, it fails rather than quietly messaging
  // people at 4am.
  it('assumes a single timezone, which will need revisiting', () => {
    expect(isQuietHour(new Date('2026-02-05T10:00:00.000Z'), 4)).toBe(false);
    expect(isQuietHour(new Date('2026-02-05T10:00:00.000Z'), -5)).toBe(true);
  });
});

describe('picking one thing to say', () => {
  it('sends nothing when nothing is due', () => {
    expect(pickBest([candidate({ hasUpcoming: true })], NOW)).toBeNull();
  });

  it('picks the most overdue place', () => {
    const best = pickBest(
      [
        candidate({ venueId: 'a', daysSinceVisit: 24 }),
        candidate({ venueId: 'b', daysSinceVisit: 40, medianGapDays: 21 }),
        candidate({ venueId: 'c', daysSinceVisit: 23.5 }),
      ],
      NOW,
    );
    expect(best?.candidate.venueId).toBe('b');
  });

  it('breaks a tie towards the place they go to most', () => {
    const best = pickBest(
      [candidate({ venueId: 'a', visits: 3 }), candidate({ venueId: 'b', visits: 9 })],
      NOW,
    );
    expect(best?.candidate.venueId).toBe('b');
  });

  // One nudge about one place. A list is a newsletter.
  it('returns a single candidate, never a list', () => {
    const best = pickBest(
      [candidate({ venueId: 'a' }), candidate({ venueId: 'b' }), candidate({ venueId: 'c' })],
      NOW,
    );
    expect(best).not.toBeNull();
    expect(Array.isArray(best)).toBe(false);
  });
});

describe('what it says', () => {
  it('sounds like someone who noticed, not a campaign', () => {
    const copy = nudgeCopy(candidate({ daysSinceVisit: 28 }));
    expect(copy.title).toBe('Due at Thornbury Barbers?');
    expect(copy.body).toContain('4 weeks ago');
    // No urgency, no scarcity, no offer.
    expect(copy.body).not.toMatch(/now|today only|limited|deal|offer|!/i);
  });

  it('phrases a restaurant differently from a barber', () => {
    const copy = nudgeCopy(candidate({ vertical: 'restaurant', venueName: 'Saffron & Slate' }));
    expect(copy.title).toBe('Saffron & Slate again?');
    expect(copy.body).toContain('table');
  });
});
