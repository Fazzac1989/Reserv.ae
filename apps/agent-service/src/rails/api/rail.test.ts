import { describe, expect, it, vi } from 'vitest';
import type { AttemptContext } from '@reservai/core';
import { ApiRail } from './rail';
import { PlatformError, type BookingPlatformAdapter } from './adapter';

/**
 * The rail's own rules, with the platform mocked.
 *
 * The stub adapter is tested separately; this is about what the rail does with
 * what a platform says — and above all that it never turns an accepted request
 * into a confirmed booking.
 */

vi.mock('../../supabase', () => ({
  serviceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { full_name: 'Chris Farrell' } }) }),
      }),
    }),
  }),
}));

const env = { FLAG_RAIL_API: true } as never;

function adapter(over: Partial<BookingPlatformAdapter> = {}): BookingPlatformAdapter {
  return {
    platform: 'other',
    isConfigured: () => true,
    checkAvailability: async () => null,
    reserve: async () => ({ status: 'pending', externalRef: 'ext-1' }),
    cancel: async () => undefined,
    parseWebhook: () => null,
    ...over,
  };
}

function context(over: Record<string, unknown> = {}): AttemptContext {
  return {
    booking: {
      id: 'b1',
      user_id: 'u1',
      venue_id: 'v1',
      scheduled_for: '2026-09-04T18:30:00.000Z',
      party_size: 2,
      special_requests: null,
    },
    channel: {
      id: 'c1',
      kind: 'api',
      is_enabled: true,
      config: { kind: 'api', platform: 'other', external_venue_id: 'venue-1' },
    },
    sequence: 1,
    correlationId: 'corr-1',
    ...over,
  } as unknown as AttemptContext;
}

describe('isAvailable', () => {
  it('is false with the flag off', async () => {
    const rail = new ApiRail({ FLAG_RAIL_API: false } as never, { other: adapter() });
    expect(await rail.isAvailable(context())).toBe(false);
  });

  it('is false when there is no adapter for the platform', async () => {
    // Not "temporarily down" — it cannot run, and saying so lets the selector
    // fall through to a slower rail rather than stalling the booking.
    const rail = new ApiRail(env, {});
    expect(await rail.isAvailable(context())).toBe(false);
  });

  it('is false when the adapter has no credentials', async () => {
    const rail = new ApiRail(env, { other: adapter({ isConfigured: () => false }) });
    expect(await rail.isAvailable(context())).toBe(false);
  });

  it('is true when everything is in place', async () => {
    const rail = new ApiRail(env, { other: adapter() });
    expect(await rail.isAvailable(context())).toBe(true);
  });
});

describe('attempt', () => {
  it('does not report a confirmation, even when the platform says confirmed', async () => {
    // The single most important assertion here. A platform saying "confirmed"
    // over HTTP means it accepted the request; the webhook is what makes a
    // table real, and a rail that could shortcut that would be the first thing
    // in this system able to confirm a booking on its own say-so.
    const rail = new ApiRail(env, {
      other: adapter({ reserve: async () => ({ status: 'confirmed', externalRef: 'ext-9' }) }),
    });
    const result = await rail.attempt(context());
    expect(result.outcome).not.toBe('confirmed');
    expect(result.outcome).toBe('no_response');
    expect(result.awaitingVenue).toBe(true);
    expect(result.externalRef).toBe('ext-9');
  });

  it('keeps the same idempotency key across retries of one attempt', async () => {
    const seen: string[] = [];
    const rail = new ApiRail(env, {
      other: adapter({
        reserve: async (r) => {
          seen.push(r.idempotencyKey);
          return { status: 'pending', externalRef: 'ext-1' };
        },
      }),
    });
    await rail.attempt(context());
    await rail.attempt(context());
    expect(seen[0]).toBe(seen[1]);
  });

  it('uses a different key for the next attempt in the chain', async () => {
    const seen: string[] = [];
    const rail = new ApiRail(env, {
      other: adapter({
        reserve: async (r) => {
          seen.push(r.idempotencyKey);
          return { status: 'pending', externalRef: 'ext-1' };
        },
      }),
    });
    await rail.attempt(context());
    await rail.attempt(context({ sequence: 2 }));
    expect(seen[0]).not.toBe(seen[1]);
  });

  it('passes on a decline with its reason', async () => {
    const rail = new ApiRail(env, {
      other: adapter({ reserve: async () => ({ status: 'declined', reason: 'Fully committed.' }) }),
    });
    const result = await rail.attempt(context());
    expect(result).toMatchObject({ outcome: 'declined', errorMessage: 'Fully committed.' });
  });

  it('turns no availability into an alternative', async () => {
    const rail = new ApiRail(env, {
      other: adapter({
        reserve: async () => ({
          status: 'unavailable',
          alternatives: [{ startsAt: '2026-09-04T19:30:00.000Z' }],
        }),
      }),
    });
    const result = await rail.attempt(context());
    expect(result.outcome).toBe('alternative_offered');
    expect(result.offeredAlternative?.scheduledFor).toBe('2026-09-04T19:30:00.000Z');
  });

  it('skips the availability call where the platform does not offer one', async () => {
    const checkAvailability = vi.fn();
    const rail = new ApiRail(env, { other: adapter({ checkAvailability }) });
    await rail.attempt(context());
    expect(checkAvailability).not.toHaveBeenCalled();
  });

  it('offers the nearest slot when the requested one is not in the book', async () => {
    const rail = new ApiRail(env, {
      other: adapter({
        checkAvailability: async () => [{ startsAt: '2026-09-04T19:00:00.000Z' }],
        reserve: async () => {
          throw new Error('should not have tried to reserve');
        },
      }),
    });
    const result = await rail.attempt(
      context({
        channel: {
          id: 'c1',
          kind: 'api',
          is_enabled: true,
          config: {
            kind: 'api',
            platform: 'other',
            external_venue_id: 'venue-1',
            supports_availability_lookup: true,
          },
        },
      }),
    );
    expect(result.outcome).toBe('alternative_offered');
  });

  it('keeps a timed-out attempt open rather than falling through', async () => {
    // The dangerous case: the reservation may exist while we believe it does
    // not. Falling straight to another rail here books the table twice.
    const rail = new ApiRail(env, {
      other: adapter({
        reserve: async () => {
          throw new PlatformError('socket hang up', true);
        },
      }),
    });
    const result = await rail.attempt(context());
    expect(result.outcome).toBe('error');
    expect(result.awaitingVenue).toBe(true);
  });

  it('closes an attempt that failed permanently', async () => {
    const rail = new ApiRail(env, {
      other: adapter({
        reserve: async () => {
          throw new PlatformError('unknown venue id', false);
        },
      }),
    });
    const result = await rail.attempt(context());
    expect(result.awaitingVenue).toBe(false);
  });
});
