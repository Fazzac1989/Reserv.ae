/**
 * What a reservation platform has to do to be bookable.
 *
 * SevenRooms, Eat App and Fresha all answer the same four questions in
 * different words, and the rail should not know which vendor it is talking to.
 * An adapter translates; it decides nothing.
 *
 * Written before any partner has said yes, deliberately. The webhook signature
 * and idempotency questions are where API integrations actually go wrong, and
 * they are answerable now against a stub rather than under time pressure once
 * a contract exists.
 */

export interface AvailabilityQuery {
  readonly externalVenueId: string;
  /** ISO-8601. The earliest and latest the guest would accept. */
  readonly earliest: string;
  readonly latest: string;
  readonly partySize: number;
}

export interface AvailableSlot {
  readonly startsAt: string;
  /**
   * The platform's own handle for this slot, where it has one. Some require it
   * back when booking, and inventing it is not possible.
   */
  readonly slotRef?: string;
}

export interface ReservationRequest {
  readonly externalVenueId: string;
  readonly startsAt: string;
  readonly partySize: number;
  readonly guestName: string;
  readonly specialRequests: string | null;
  /**
   * Ours, not theirs. Sent so a retry cannot double-book: a platform that
   * honours it returns the original reservation rather than making a second.
   */
  readonly idempotencyKey: string;
  readonly slotRef?: string;
}

/**
 * What placing a reservation returned.
 *
 * `pending` is not a failure. Several platforms accept a request and confirm
 * it asynchronously, which is why the rail never treats its own return value
 * as confirmation — the webhook does that, or nothing does.
 */
export type ReservationOutcome =
  | { readonly status: 'confirmed'; readonly externalRef: string }
  | { readonly status: 'pending'; readonly externalRef: string }
  | { readonly status: 'declined'; readonly reason: string }
  | { readonly status: 'unavailable'; readonly alternatives: readonly AvailableSlot[] };

/** A webhook, once its signature has been checked and its body parsed. */
export interface PlatformEvent {
  /** The platform's id for this delivery, for de-duplication. */
  readonly eventId: string;
  readonly externalRef: string;
  readonly kind: 'confirmed' | 'cancelled' | 'changed' | 'declined' | 'unknown';
  /** Present on `changed`. */
  readonly startsAt?: string;
  readonly partySize?: number;
}

export class PlatformError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'PlatformError';
  }
}

export interface BookingPlatformAdapter {
  /** Matches `booking_platform` in the schema: sevenrooms, eat_app, fresha. */
  readonly platform: string;

  /**
   * Whether this adapter can run at all — credentials present, and configured.
   * A platform that cannot be reached must say so rather than throwing on the
   * first call, so the rail selector can fall through to a slower path.
   */
  isConfigured(): boolean;

  /**
   * Null where the platform has no availability endpoint. That is common, and
   * it is not an error: the rail then books optimistically and lets the
   * platform decline, which is what a person phoning up would do anyway.
   */
  checkAvailability(query: AvailabilityQuery): Promise<AvailableSlot[] | null>;

  reserve(request: ReservationRequest): Promise<ReservationOutcome>;

  cancel(externalRef: string, reason: string): Promise<void>;

  /**
   * Verify and parse a webhook.
   *
   * Verification and parsing are one call on purpose. Two calls is an
   * interface where somebody eventually parses without verifying, and a
   * forged confirmation is the worst thing that can happen to this product —
   * `api_webhook` evidence carries no confidence score and is trusted
   * absolutely by the state machine.
   *
   * Returns null when the signature does not check out.
   */
  parseWebhook(rawBody: string, headers: Record<string, string | undefined>): PlatformEvent | null;
}
