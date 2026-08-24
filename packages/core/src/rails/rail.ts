import type { AttemptOutcome, Booking, BookingAttempt } from '../schemas/booking';
import type { VenueBookingChannel } from '../schemas/venue';
import type { RailKindSchema } from '../schemas/common';

/**
 * Principle 6 — multi-rail abstraction.
 *
 * Every way of reaching a venue implements the same interface, so the booking
 * worker never branches on channel type. Rails report what happened; they do
 * not decide what the booking becomes. Only the state machine does that.
 */

export interface AttemptContext {
  readonly booking: Booking;
  readonly channel: VenueBookingChannel;
  /** 1-based position in this booking's fallback chain. */
  readonly sequence: number;
  /** Correlates every log line, job and event for this attempt. */
  readonly correlationId: string;
}

export interface AttemptResult {
  readonly outcome: AttemptOutcome;
  /** 0..1. Below the confirmation threshold, a `confirmed` outcome is not truth. */
  readonly confidence: number;
  /** Storage pointers and platform refs for the audit trail. */
  readonly transcriptRef?: string;
  readonly recordingRef?: string;
  readonly threadRef?: string;
  readonly externalRef?: string;
  readonly offeredAlternative?: {
    readonly scheduledFor?: string;
    readonly partySize?: number;
    readonly note?: string;
  };
  readonly errorMessage?: string;
  /** True when the rail is waiting on the venue rather than finished. */
  readonly awaitingVenue: boolean;
  /**
   * True when nothing has been sent yet because a human has to approve it
   * first. The booking has not been attempted, so it stays where it is and the
   * work moves to the ops queue — this is the default for every venue.
   */
  readonly awaitingApproval?: boolean;
}

export interface BookingRail {
  readonly kind: RailKindSchema;
  /**
   * Whether this rail can run at all right now: feature flag on, credentials
   * present, venue channel enabled and in its responsive hours. A rail that
   * returns false must be shown as disabled — never quietly mocked.
   */
  isAvailable(context: AttemptContext): Promise<boolean>;
  attempt(context: AttemptContext): Promise<AttemptResult>;
  /** Called when a user cancels a booking this rail placed. */
  cancel(context: AttemptContext, attempt: BookingAttempt): Promise<AttemptResult>;
}
