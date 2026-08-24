import { describe, expect, it } from 'vitest';
import { filterCandidates, isOpenDuring, type CandidateVenue, type CuratorRequest } from './filter';

const NOW = '2026-02-05T10:00:00.000Z';

function venue(overrides: Partial<CandidateVenue> = {}): CandidateVenue {
  return {
    id: 'v1',
    name: 'Test Venue',
    vertical: 'restaurant',
    zone: 'dubai_marina',
    price_band: 2,
    tags: ['italian'],
    opening_hours: [
      { day: 'sat', opens_at: '12:00', closes_at: '23:30' },
      { day: 'sun', opens_at: '12:00', closes_at: '23:30' },
    ],
    onboarding_status: 'live',
    booking_consent_obtained_at: '2026-01-01T00:00:00.000Z',
    reachableRails: ['manual'],
    policy: {
      min_lead_time_minutes: 120,
      max_lead_time_days: 60,
      min_party_size: 1,
      max_party_size: 8,
    },
    ...overrides,
  };
}

function request(overrides: Partial<CuratorRequest> = {}): CuratorRequest {
  return {
    vertical: 'restaurant',
    zones: ['dubai_marina'],
    // Saturday 7 Feb 2026, 19:00–21:00 Dubai time.
    window: { starts_at: '2026-02-07T15:00:00.000Z', ends_at: '2026-02-07T17:00:00.000Z' },
    partySize: 2,
    priceBandMax: 3,
    cuisinesAvoided: [],
    now: NOW,
    ...overrides,
  };
}

function reasonFor(v: Partial<CandidateVenue>, r: Partial<CuratorRequest> = {}) {
  const result = filterCandidates([venue(v)], request(r));
  return result.rejected[0]?.reason ?? null;
}

describe('a bookable venue survives', () => {
  it('passes every gate', () => {
    const result = filterCandidates([venue()], request());
    expect(result.candidates).toHaveLength(1);
    expect(result.rejected).toEqual([]);
  });
});

describe('gates that protect the venue relationship', () => {
  it('excludes venues that are not live', () => {
    expect(reasonFor({ onboarding_status: 'agreed' })).toBe('not_live');
  });

  // The database already refuses to mark a venue live without consent. This is
  // the second lock: the Curator must never be what books somewhere that has
  // not agreed to be booked.
  it('excludes venues that have not agreed to bookings', () => {
    expect(reasonFor({ booking_consent_obtained_at: null })).toBe('no_booking_consent');
  });

  it('excludes venues we have no way of reaching', () => {
    expect(reasonFor({ reachableRails: [] })).toBe('unreachable');
  });
});

describe('gates that come from the request', () => {
  it('excludes the wrong vertical', () => {
    expect(reasonFor({ vertical: 'barber' })).toBe('wrong_vertical');
  });

  it('excludes venues outside the requested zones', () => {
    expect(reasonFor({ zone: 'bluewaters' })).toBe('outside_zones');
  });

  it('keeps every zone when the request names none', () => {
    const result = filterCandidates([venue({ zone: 'bluewaters' })], request({ zones: [] }));
    expect(result.candidates).toHaveLength(1);
  });

  it('excludes venues above the spend ceiling', () => {
    expect(reasonFor({ price_band: 4 })).toBe('too_expensive');
  });

  it('excludes a cuisine the user avoids, whatever the casing', () => {
    expect(reasonFor({ tags: ['Italian'] }, { cuisinesAvoided: ['italian'] })).toBe(
      'avoided_cuisine',
    );
  });
});

describe('policy feasibility', () => {
  it('excludes a party larger than the venue takes', () => {
    expect(reasonFor({}, { partySize: 12 })).toBe('party_too_large');
  });

  it('excludes a party smaller than the venue takes', () => {
    expect(
      reasonFor({
        policy: {
          min_lead_time_minutes: 0,
          max_lead_time_days: 60,
          min_party_size: 4,
          max_party_size: 20,
        },
      }),
    ).toBe('party_too_small');
  });

  it('excludes a booking with less notice than the venue needs', () => {
    // 30 minutes from now, against a 120-minute minimum.
    expect(
      reasonFor(
        {},
        {
          window: {
            starts_at: '2026-02-05T10:30:00.000Z',
            ends_at: '2026-02-05T12:30:00.000Z',
          },
        },
      ),
    ).toBe('not_enough_notice');
  });

  it('excludes a booking further ahead than the venue will take', () => {
    expect(
      reasonFor(
        {},
        {
          window: {
            starts_at: '2026-08-07T15:00:00.000Z',
            ends_at: '2026-08-07T17:00:00.000Z',
          },
        },
      ),
    ).toBe('too_far_ahead');
  });

  it('keeps a venue with no policy recorded rather than guessing one', () => {
    const result = filterCandidates([venue({ policy: null })], request({ partySize: 19 }));
    expect(result.candidates).toHaveLength(1);
  });
});

describe('opening hours', () => {
  it('excludes a venue closed on the requested day', () => {
    expect(
      reasonFor({ opening_hours: [{ day: 'mon', opens_at: '12:00', closes_at: '23:00' }] }),
    ).toBe('closed_during_window');
  });

  it('excludes a venue whose day matches but whose hours do not', () => {
    expect(
      reasonFor({ opening_hours: [{ day: 'sat', opens_at: '08:00', closes_at: '11:00' }] }),
    ).toBe('closed_during_window');
  });

  it('keeps a venue with no recorded hours, since we cannot rule it out', () => {
    const result = filterCandidates([venue({ opening_hours: [] })], request());
    expect(result.candidates).toHaveLength(1);
  });

  it('handles a venue that closes after midnight', () => {
    // Saturday 23:00–00:30 Dubai time, against hours of 18:00–02:00.
    expect(
      isOpenDuring([{ day: 'sat', opens_at: '18:00', closes_at: '02:00' }], {
        starts_at: '2026-02-07T19:00:00.000Z',
        ends_at: '2026-02-07T20:30:00.000Z',
      }),
    ).toBe(true);
  });

  it('reads days in Dubai time, not UTC', () => {
    // 21:00 UTC on Friday is 01:00 Saturday in Dubai. A venue open Saturday
    // should match; reading this as Friday would wrongly exclude it.
    expect(
      isOpenDuring([{ day: 'sat', opens_at: '00:30', closes_at: '03:00' }], {
        starts_at: '2026-02-06T21:00:00.000Z',
        ends_at: '2026-02-06T22:00:00.000Z',
      }),
    ).toBe(true);
  });
});

describe('reporting', () => {
  it('says why each venue was dropped, so an empty result is explainable', () => {
    const result = filterCandidates(
      [
        venue({ id: 'a', name: 'Wrong Kind', vertical: 'barber' }),
        venue({ id: 'b', name: 'Too Dear', price_band: 4 }),
        venue({ id: 'c', name: 'Fine' }),
      ],
      request(),
    );

    expect(result.candidates.map((v) => v.id)).toEqual(['c']);
    expect(result.rejected).toEqual([
      { venueId: 'a', name: 'Wrong Kind', reason: 'wrong_vertical' },
      { venueId: 'b', name: 'Too Dear', reason: 'too_expensive' },
    ]);
  });
});
