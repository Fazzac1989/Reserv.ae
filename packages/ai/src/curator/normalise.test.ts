import { describe, expect, it } from 'vitest';
import { normaliseRanking } from './normalise';
import type { CuratorOutput } from './schema';

const CANDIDATES = [
  { id: 'venue-a', name: 'A' },
  { id: 'venue-b', name: 'B' },
  { id: 'venue-c', name: 'C' },
  { id: 'venue-d', name: 'D' },
];

const WINDOW = { starts_at: '2026-02-07T15:00:00.000Z', ends_at: '2026-02-07T17:00:00.000Z' };

function ranking(overrides: Partial<CuratorOutput['rankings'][number]> = {}) {
  return {
    venue_id: 'venue-a',
    rank: 1,
    rationale: 'The terrace tables are the quiet ones.',
    proposed_start: '2026-02-07T15:30:00.000Z',
    ...overrides,
  };
}

function run(rankings: CuratorOutput['rankings']) {
  return normaliseRanking({ rankings }, CANDIDATES, WINDOW, 'restaurant');
}

describe('a well-behaved ranking', () => {
  it('passes through in rank order with an end time derived from the vertical', () => {
    const result = run([
      ranking({ venue_id: 'venue-b', rank: 2 }),
      ranking({ venue_id: 'venue-a', rank: 1 }),
    ]);

    expect(result.suggestions.map((s) => [s.rank, s.venueId])).toEqual([
      [1, 'venue-a'],
      [2, 'venue-b'],
    ]);
    // Restaurants are assumed to occupy two hours.
    expect(result.suggestions[0]?.proposedEnd).toBe('2026-02-07T17:30:00.000Z');
    expect(result.discarded).toEqual([]);
  });

  it('uses a shorter default for a barber', () => {
    const result = normaliseRanking({ rankings: [ranking()] }, CANDIDATES, WINDOW, 'barber');
    expect(result.suggestions[0]?.proposedEnd).toBe('2026-02-07T16:15:00.000Z');
  });

  it('returns fewer than three when only two were worth it', () => {
    const result = run([ranking(), ranking({ venue_id: 'venue-b', rank: 2 })]);
    expect(result.suggestions).toHaveLength(2);
  });
});

describe('the model cannot invent a venue', () => {
  // The most important guard here. A venue nobody offered is somewhere we
  // cannot book — showing it would mean promising a user a table at a place
  // that is not in the directory.
  it('discards a venue that was not on the shortlist', () => {
    const result = run([
      ranking({ venue_id: 'nobu-dubai', rank: 1 }),
      ranking({ venue_id: 'venue-b', rank: 2 }),
    ]);

    expect(result.suggestions.map((s) => s.venueId)).toEqual(['venue-b']);
    expect(result.discarded).toEqual([
      { venueId: 'nobu-dubai', reason: 'not among the candidates' },
    ]);
  });

  it('discards every invented venue, even if that leaves nothing', () => {
    const result = run([ranking({ venue_id: 'made-up' })]);
    expect(result.suggestions).toEqual([]);
    expect(result.discarded).toHaveLength(1);
  });

  it('discards a venue ranked twice rather than showing it twice', () => {
    const result = run([ranking({ rank: 1 }), ranking({ rank: 2 })]);
    expect(result.suggestions).toHaveLength(1);
    expect(result.discarded).toEqual([{ venueId: 'venue-a', reason: 'ranked twice' }]);
  });
});

describe('the proposed time must be the time they asked for', () => {
  it('discards a proposal after the window', () => {
    const result = run([ranking({ proposed_start: '2026-02-07T18:30:00.000Z' })]);
    expect(result.suggestions).toEqual([]);
    expect(result.discarded[0]?.reason).toBe('proposed time outside the window');
  });

  it('discards a proposal before the window', () => {
    const result = run([ranking({ proposed_start: '2026-02-07T14:00:00.000Z' })]);
    expect(result.discarded[0]?.reason).toBe('proposed time outside the window');
  });

  it('accepts a proposal exactly on the boundary', () => {
    const result = run([ranking({ proposed_start: WINDOW.starts_at })]);
    expect(result.suggestions).toHaveLength(1);
  });

  it('discards an unreadable time', () => {
    const result = run([ranking({ proposed_start: 'about sevenish' })]);
    expect(result.discarded[0]?.reason).toBe('unreadable proposed time');
  });
});

describe('ranks are reassigned, not trusted', () => {
  it('closes gaps left by the model’s numbering', () => {
    const result = run([
      ranking({ venue_id: 'venue-a', rank: 1 }),
      ranking({ venue_id: 'venue-b', rank: 3 }),
    ]);
    expect(result.suggestions.map((s) => s.rank)).toEqual([1, 2]);
  });

  it('never produces two first choices', () => {
    const result = run([
      ranking({ venue_id: 'venue-a', rank: 1 }),
      ranking({ venue_id: 'venue-b', rank: 1 }),
      ranking({ venue_id: 'venue-c', rank: 1 }),
    ]);
    expect(result.suggestions.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  it('renumbers after a discard so there is no missing second choice', () => {
    const result = run([
      ranking({ venue_id: 'made-up', rank: 1 }),
      ranking({ venue_id: 'venue-b', rank: 2 }),
      ranking({ venue_id: 'venue-c', rank: 3 }),
    ]);
    expect(result.suggestions.map((s) => [s.rank, s.venueId])).toEqual([
      [1, 'venue-b'],
      [2, 'venue-c'],
    ]);
  });
});

describe('other guards', () => {
  it('discards a suggestion with no rationale', () => {
    const result = run([ranking({ rationale: '   ' })]);
    expect(result.discarded[0]?.reason).toBe('no rationale');
  });

  it('never returns more than three', () => {
    const result = run([
      ranking({ venue_id: 'venue-a', rank: 1 }),
      ranking({ venue_id: 'venue-b', rank: 2 }),
      ranking({ venue_id: 'venue-c', rank: 3 }),
      ranking({ venue_id: 'venue-d', rank: 3 }),
    ]);
    expect(result.suggestions).toHaveLength(3);
  });
});
