import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  AvailabilityQuery,
  AvailableSlot,
  BookingPlatformAdapter,
  PlatformEvent,
  ReservationOutcome,
  ReservationRequest,
} from './adapter';

/**
 * A reservation platform that does not exist.
 *
 * Not a mock in a test file — a real adapter, behind a flag, that the whole
 * rail runs against end to end. That distinction matters: a mock proves the
 * code compiles against an interface, and this proves a booking can be placed,
 * confirmed by a signed webhook, de-duplicated on retry and cancelled, before
 * any partner has signed anything.
 *
 * Behaviour is deterministic from the request rather than random, so a test
 * that fails does so every time. The rules below are chosen to exercise the
 * paths that a real platform will actually take:
 *
 *   party of 13+   unavailable, with alternatives offered
 *   party of 1     declined
 *   otherwise      pending, confirmed by a webhook
 *
 * Nothing here should ever be reachable in production. `isConfigured` requires
 * a stub secret that has no reason to exist outside development.
 */
export class StubPlatform implements BookingPlatformAdapter {
  readonly platform = 'other';

  constructor(private readonly webhookSecret: string | undefined) {}

  isConfigured(): boolean {
    return typeof this.webhookSecret === 'string' && this.webhookSecret.length > 0;
  }

  async checkAvailability(query: AvailabilityQuery): Promise<AvailableSlot[] | null> {
    const earliest = Date.parse(query.earliest);
    if (!Number.isFinite(earliest)) return [];

    // On the half hour, through the window, as most platforms report.
    const slots: AvailableSlot[] = [];
    const latest = Date.parse(query.latest);
    for (let t = earliest; t <= latest && slots.length < 6; t += 30 * 60_000) {
      slots.push({ startsAt: new Date(t).toISOString(), slotRef: `stub-slot-${t}` });
    }
    return slots;
  }

  async reserve(request: ReservationRequest): Promise<ReservationOutcome> {
    if (request.partySize === 1) {
      return { status: 'declined', reason: 'The stub venue does not seat single covers.' };
    }

    if (request.partySize > 12) {
      const at = Date.parse(request.startsAt);
      return {
        status: 'unavailable',
        alternatives: [
          { startsAt: new Date(at + 60 * 60_000).toISOString(), slotRef: 'stub-slot-later' },
        ],
      };
    }

    // Derived from our idempotency key, so asking twice returns the same
    // reference — which is the property that stops a retry double-booking.
    return { status: 'pending', externalRef: `stub-${request.idempotencyKey.slice(0, 12)}` };
  }

  async cancel(): Promise<void> {
    // Nothing to undo. A real adapter calls the platform here.
  }

  parseWebhook(rawBody: string, headers: Record<string, string | undefined>): PlatformEvent | null {
    if (!this.webhookSecret) return null;

    const signature = headers['x-stub-signature'];
    if (typeof signature !== 'string') return null;

    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    const given = Buffer.from(signature);
    const want = Buffer.from(expected);
    // Length-checked first: timingSafeEqual throws on a mismatch, and a thrown
    // error inside a webhook is a 500 where a plain rejection was wanted.
    if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

    try {
      const body: unknown = JSON.parse(rawBody);
      if (typeof body !== 'object' || body === null) return null;
      const b = body as Record<string, unknown>;

      if (typeof b.event_id !== 'string' || typeof b.reservation_id !== 'string') return null;

      const kind = ((): PlatformEvent['kind'] => {
        switch (b.type) {
          case 'reservation.confirmed':
            return 'confirmed';
          case 'reservation.cancelled':
            return 'cancelled';
          case 'reservation.changed':
            return 'changed';
          case 'reservation.declined':
            return 'declined';
          default:
            // Named rather than dropped. A platform adding an event type
            // should show up in the logs, not vanish.
            return 'unknown';
        }
      })();

      return {
        eventId: b.event_id,
        externalRef: b.reservation_id,
        kind,
        ...(typeof b.starts_at === 'string' ? { startsAt: b.starts_at } : {}),
        ...(typeof b.party_size === 'number' ? { partySize: b.party_size } : {}),
      };
    } catch {
      return null;
    }
  }
}

/** The signature a caller must send. Exported so tests sign the way the stub verifies. */
export function stubSignature(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}
