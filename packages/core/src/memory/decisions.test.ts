import { describe, expect, it } from 'vitest';
import { signalsFromDecision, type DecisionVenue } from './decisions';

function venue(overrides: Partial<DecisionVenue> = {}): DecisionVenue {
  return {
    venueId: 'a',
    vertical: 'restaurant',
    zone: 'dubai_marina',
    priceBand: 3,
    tags: ['japanese'],
    ...overrides,
  };
}

describe('signalsFromDecision', () => {
  it('records everything about the venue chosen', () => {
    const result = signalsFromDecision(venue({ tags: ['japanese', 'lively'] }), []);
    expect(result.every((o) => o.agreed)).toBe(true);
    expect(result.map((o) => `${o.attribute}:${o.value}`).sort()).toEqual([
      'price_band:3',
      'tag:japanese',
      'tag:lively',
      'zone:dubai_marina',
    ]);
  });

  it('does not count a shared attribute as a rejection', () => {
    // Three Japanese restaurants shown, one booked. Nobody rejected Japanese
    // food — and recording that they did, twice, teaches the exact opposite of
    // what happened.
    const result = signalsFromDecision(venue({ venueId: 'a', tags: ['japanese'] }), [
      venue({ venueId: 'b', tags: ['japanese'] }),
      venue({ venueId: 'c', tags: ['japanese'] }),
    ]);
    expect(result.filter((o) => o.value === 'japanese' && !o.agreed)).toEqual([]);
  });

  it('records the attributes that genuinely differed', () => {
    const result = signalsFromDecision(venue({ tags: ['japanese'] }), [
      venue({ venueId: 'b', tags: ['italian'] }),
    ]);
    const rejected = result.filter((o) => !o.agreed);
    expect(rejected).toEqual([
      { subject: 'restaurant', attribute: 'tag', value: 'italian', agreed: false },
    ]);
  });

  it('counts one difference once, however many venues shared it', () => {
    const result = signalsFromDecision(venue({ tags: ['japanese'] }), [
      venue({ venueId: 'b', tags: ['italian'] }),
      venue({ venueId: 'c', tags: ['italian'] }),
      venue({ venueId: 'd', tags: ['italian'] }),
    ]);
    // One decision is one observation. Three would be evidence this person
    // dislikes Italian, from a single evening.
    expect(result.filter((o) => o.value === 'italian')).toHaveLength(1);
  });

  it('notices a difference of zone or price, not just cuisine', () => {
    const result = signalsFromDecision(venue({ zone: 'difc', priceBand: 2 }), [
      venue({ venueId: 'b', zone: 'jbr', priceBand: 4 }),
    ]);
    const rejected = result.filter((o) => !o.agreed).map((o) => `${o.attribute}:${o.value}`);
    expect(rejected).toContain('zone:jbr');
    expect(rejected).toContain('price_band:4');
  });

  it('is case-insensitive about tags', () => {
    // The directory is typed by hand; "Japanese" and "japanese" are the same
    // preference and must not become two half-confident ones.
    const result = signalsFromDecision(venue({ tags: ['Japanese'] }), [
      venue({ venueId: 'b', tags: ['japanese'] }),
    ]);
    expect(result.filter((o) => !o.agreed)).toEqual([]);
  });

  it('attributes the signal to the category it was about', () => {
    const result = signalsFromDecision(venue({ vertical: 'barber', tags: ['fade'] }), []);
    expect(result.every((o) => o.subject === 'barber')).toBe(true);
  });
});
