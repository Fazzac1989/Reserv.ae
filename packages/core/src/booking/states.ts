/**
 * Booking states, events and actors.
 *
 * The states are exactly those named in the build plan's data model. Nothing
 * else is a booking state — "no-show" and "rated" are attributes of a
 * completed booking, not lifecycle positions, because they do not change what
 * the system is allowed to do next.
 */

export const BOOKING_STATES = [
  /** Created from an accepted suggestion, not yet approved by the user. */
  'draft',
  /** The user said yes. Nothing has been said to the venue. */
  'user_approved',
  /** A rail is actively working the booking right now. */
  'attempting',
  /** Sent to the venue; waiting on them. The SLA clock runs here. */
  'pending_venue',
  /**
   * The venue cannot do what was asked but has offered something else, and the
   * person has to decide.
   *
   * A state rather than a flag on `pending_venue`, because what the system may
   * do next is completely different: nothing is owed by the venue any more,
   * the SLA clock stops, and the only move is the user's. It is also the state
   * the product exists to handle well — "they can do 8:30, shall I take it?"
   * is the moment a concierge earns its keep, and a booking sitting in
   * `pending_venue` while an offer goes unmentioned is the app quietly holding
   * on to the one message the person needed.
   */
  'alternative_offered',
  /**
   * The person has asked to cancel a table the venue is holding, and the venue
   * has not been told yet.
   *
   * Cancelling a confirmed booking is not instantaneous and pretending it is
   * would be the same lie as confirming one that is not. Until the venue has
   * been reached, the table is still theirs to hold and ours to release.
   */
  'cancellation_requested',
  /** A human must intervene. SLA breach, low confidence, out-of-bounds ask. */
  'escalated',
  /** Deterministic confirmation exists. The only state the user may rely on. */
  'confirmed',
  /** Confirmed and at least one reminder has been delivered. */
  'reminded',
  /** The visit happened (or its time passed). Terminal. */
  'completed',
  /** Called off by user, venue or ops. Terminal. */
  'cancelled',
  /** Every available rail was exhausted without a booking. Terminal. */
  'failed',
] as const;

export type BookingState = (typeof BOOKING_STATES)[number];

export const TERMINAL_STATES = [
  'completed',
  'cancelled',
  'failed',
] as const satisfies readonly BookingState[];
export type TerminalState = (typeof TERMINAL_STATES)[number];

export function isTerminal(state: BookingState): state is TerminalState {
  return (TERMINAL_STATES as readonly BookingState[]).includes(state);
}

export const BOOKING_EVENTS = [
  'user_approve',
  'start_attempt',
  'await_venue',
  'retry_next_rail',
  'confirm',
  'decline',
  'escalate',
  'remind',
  'complete',
  'cancel',
  /** The venue came back with a different time from the one asked for. */
  'offer_alternative',
  /** The person took the offer. It still has to be said back to the venue. */
  'accept_alternative',
  /** The person did not want it. Try elsewhere rather than book it anyway. */
  'decline_alternative',
  /** The person asked to cancel. The venue does not know yet. */
  'request_cancellation',
] as const;

export type BookingEvent = (typeof BOOKING_EVENTS)[number];

/**
 * Who is applying the event. This is not a user role — it is the *provenance*
 * of the fact. `api_webhook` and `parsed_confirmation` are machine sources
 * whose evidence must be attached; `system` is our own scheduler and may never
 * confirm anything.
 */
export const ACTORS = [
  'user',
  'ops',
  'system',
  'api_webhook',
  'parsed_confirmation',
  /**
   * A member of the venue itself, acting in the partner back office.
   *
   * Deliberately named by no edge in the transition table, so a venue can
   * currently move nothing: the exhaustive matrix test asserts that every
   * state × event pair rejects it. Letting a venue confirm its own booking is
   * the most valuable thing the back office could do — a venue pressing
   * "confirm" is better evidence than any reply our rails could parse — but it
   * is a new edge with its own evidence requirement, not a widening of an
   * existing one.
   */
  'venue',
] as const;
export type Actor = (typeof ACTORS)[number];

/**
 * Below this, a parsed venue reply is not truth. Tuned deliberately high:
 * the cost of a false confirmation (user turns up, no table) is far worse than
 * the cost of an ops task.
 */
export const CONFIRMATION_CONFIDENCE_THRESHOLD = 0.9;
