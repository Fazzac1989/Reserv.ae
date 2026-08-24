import { describe, expect, it } from 'vitest';
import { inferStanding, resolveStanding } from './standing';
import type { VenueHistoryEntry } from './standing';

function entry(overrides: Partial<VenueHistoryEntry> = {}): VenueHistoryEntry {
  return {
    venueId: 'v1',
    venueName: 'Thornbury Barbers',
    vertical: 'barber',
    visits: 5,
    lastVisit: '2026-01-20T10:00:00.000Z',
    avgRating: 5,
    ...overrides,
  };
}

describe('inferring a favourite', () => {
  it('picks a clear leader', () => {
    const result = inferStanding(
      [entry({ venueId: 'a', visits: 6 }), entry({ venueId: 'b', visits: 2 })],
      'barber',
    );
    expect(result?.venueId).toBe('a');
  });

  // The rule that matters. Three visits somewhere means nothing if they have
  // been to another barber just as often, and booking the wrong barber is
  // worse than asking which one.
  it('refuses when there is no clear favourite', () => {
    expect(
      inferStanding(
        [entry({ venueId: 'a', visits: 4 }), entry({ venueId: 'b', visits: 3 })],
        'barber',
      ),
    ).toBeNull();
  });

  it('needs at least three visits before anything counts', () => {
    expect(inferStanding([entry({ visits: 2 })], 'barber')).toBeNull();
  });

  it('does not cross verticals', () => {
    expect(inferStanding([entry({ vertical: 'restaurant' })], 'barber')).toBeNull();
  });

  it('has nothing to say about someone with no history', () => {
    expect(inferStanding([], 'barber')).toBeNull();
  });
});

describe('resolving what they said', () => {
  const history = [
    entry({ venueId: 'barber-1', venueName: 'Thornbury Barbers', visits: 6 }),
    entry({
      venueId: 'rest-1',
      venueName: 'Saffron & Slate',
      vertical: 'restaurant',
      visits: 4,
    }),
  ];

  it('finds nothing in an ordinary request', () => {
    expect(resolveStanding('book me a table on friday', { explicit: {}, history })).toBeNull();
  });

  it('resolves "my barber" from behaviour', () => {
    const match = resolveStanding('haircut at my barber saturday', { explicit: {}, history });
    expect(match).toMatchObject({
      venueId: 'barber-1',
      venueName: 'Thornbury Barbers',
      source: 'inferred',
    });
  });

  it('resolves "our usual place" for a restaurant', () => {
    const match = resolveStanding('our usual place, friday at eight', {
      explicit: {},
      history,
    });
    expect(match?.venueId).toBe('rest-1');
  });

  // What the user set beats anything we worked out.
  it('prefers a label the user set themselves', () => {
    const match = resolveStanding('my barber, saturday morning', {
      explicit: { 'my barber': 'barber-2' },
      history: [
        ...history,
        entry({ venueId: 'barber-2', venueName: 'The Marina Chair', visits: 1 }),
      ],
    });
    expect(match).toMatchObject({ venueId: 'barber-2', source: 'explicit' });
  });

  // "The usual" on its own could mean anything. Guessing across categories
  // would be wrong more often than right, so the Concierge asks instead.
  it('refuses a bare "the usual" with nothing to narrow it', () => {
    expect(resolveStanding('the usual please', { explicit: {}, history })).toBeNull();
  });

  it('resolves a bare "the usual" once the vertical is known', () => {
    const match = resolveStanding('the usual please', {
      explicit: {},
      history,
      vertical: 'restaurant',
    });
    expect(match?.venueId).toBe('rest-1');
  });

  it('refuses when the favourite is ambiguous', () => {
    expect(
      resolveStanding('my barber on saturday', {
        explicit: {},
        history: [entry({ venueId: 'a', visits: 4 }), entry({ venueId: 'b', visits: 3 })],
      }),
    ).toBeNull();
  });

  it('reports the phrase it matched, so the reply can echo it back', () => {
    const match = resolveStanding('Can I get my usual barber on Saturday?', {
      explicit: {},
      history,
    });
    expect(match?.phrase.toLowerCase()).toBe('my usual barber');
  });
});
