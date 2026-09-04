import { describe, expect, it } from 'vitest';
import { StubPlatform, stubSignature } from './stub';

const SECRET = 'stub-secret-for-tests';
const platform = new StubPlatform(SECRET);

function body(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event_id: 'evt_1',
    reservation_id: 'stub-abc123',
    type: 'reservation.confirmed',
    ...over,
  });
}

function signed(raw: string) {
  return { 'x-stub-signature': stubSignature(raw, SECRET) };
}

describe('configuration', () => {
  it('is unusable without a secret', () => {
    // Which is what keeps it out of production: nothing sets this there.
    expect(new StubPlatform(undefined).isConfigured()).toBe(false);
    expect(new StubPlatform('').isConfigured()).toBe(false);
  });
});

describe('reserve', () => {
  const base = {
    externalVenueId: 'venue-1',
    startsAt: '2026-09-04T18:30:00.000Z',
    guestName: 'Chris Farrell',
    specialRequests: null,
    idempotencyKey: 'a'.repeat(64),
  };

  it('returns the same reference for the same idempotency key', async () => {
    // The property that stops a network timeout seating the same party twice.
    const first = await platform.reserve({ ...base, partySize: 2 });
    const second = await platform.reserve({ ...base, partySize: 2 });
    expect(first).toEqual(second);
  });

  it('returns a different reference for a different attempt', async () => {
    const first = await platform.reserve({ ...base, partySize: 2 });
    const second = await platform.reserve({
      ...base,
      partySize: 2,
      idempotencyKey: 'b'.repeat(64),
    });
    expect(first).not.toEqual(second);
  });

  it('is pending rather than confirmed', async () => {
    // A platform accepting a request is not a table existing. The webhook says
    // that, or nothing does.
    const result = await platform.reserve({ ...base, partySize: 2 });
    expect(result.status).toBe('pending');
  });

  it('offers an alternative for a party it cannot seat', async () => {
    const result = await platform.reserve({ ...base, partySize: 14 });
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.alternatives).toHaveLength(1);
    }
  });

  it('declines with a reason', async () => {
    const result = await platform.reserve({ ...base, partySize: 1 });
    expect(result.status).toBe('declined');
  });
});

describe('parseWebhook', () => {
  it('accepts a correctly signed body', () => {
    const raw = body();
    const event = platform.parseWebhook(raw, signed(raw));
    expect(event).toMatchObject({
      eventId: 'evt_1',
      externalRef: 'stub-abc123',
      kind: 'confirmed',
    });
  });

  it('refuses an unsigned body', () => {
    // The whole reason api_webhook evidence needs no confidence score is that
    // the signature already did the believing.
    expect(platform.parseWebhook(body(), {})).toBeNull();
  });

  it('refuses a body signed with the wrong secret', () => {
    const raw = body();
    expect(
      platform.parseWebhook(raw, { 'x-stub-signature': stubSignature(raw, 'wrong') }),
    ).toBeNull();
  });

  it('refuses a body altered after signing', () => {
    // A forged confirmation is the worst thing that can happen to this
    // product, so the signature covers the body and not just its existence.
    const raw = body();
    const headers = signed(raw);
    const tampered = body({ reservation_id: 'stub-someone-elses' });
    expect(platform.parseWebhook(tampered, headers)).toBeNull();
  });

  it('refuses a signature of the wrong length without throwing', () => {
    // timingSafeEqual throws on a length mismatch, and a throw inside a
    // webhook handler is a 500 where a rejection was wanted.
    expect(() => platform.parseWebhook(body(), { 'x-stub-signature': 'short' })).not.toThrow();
    expect(platform.parseWebhook(body(), { 'x-stub-signature': 'short' })).toBeNull();
  });

  it('refuses a body that is not JSON', () => {
    const raw = 'not json at all';
    expect(platform.parseWebhook(raw, signed(raw))).toBeNull();
  });

  it('refuses a body missing the fields it needs', () => {
    const raw = JSON.stringify({ type: 'reservation.confirmed' });
    expect(platform.parseWebhook(raw, signed(raw))).toBeNull();
  });

  it('names an unrecognised event type rather than dropping it', () => {
    // A platform adding an event should appear in the logs, not vanish.
    const raw = body({ type: 'reservation.something_new' });
    expect(platform.parseWebhook(raw, signed(raw))?.kind).toBe('unknown');
  });

  it('carries the new time on a change', () => {
    const raw = body({ type: 'reservation.changed', starts_at: '2026-09-04T19:00:00.000Z' });
    expect(platform.parseWebhook(raw, signed(raw))).toMatchObject({
      kind: 'changed',
      startsAt: '2026-09-04T19:00:00.000Z',
    });
  });
});
