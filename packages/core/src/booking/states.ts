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
] as const;

export type BookingEvent = (typeof BOOKING_EVENTS)[number];

/**
 * Who is applying the event. This is not a user role — it is the *provenance*
 * of the fact. `api_webhook` and `parsed_confirmation` are machine sources
 * whose evidence must be attached; `system` is our own scheduler and may never
 * confirm anything.
 */
export const ACTORS = ['user', 'ops', 'system', 'api_webhook', 'parsed_confirmation'] as const;
export type Actor = (typeof ACTORS)[number];

/**
 * Below this, a parsed venue reply is not truth. Tuned deliberately high:
 * the cost of a false confirmation (user turns up, no table) is far worse than
 * the cost of an ops task.
 */
export const CONFIRMATION_CONFIDENCE_THRESHOLD = 0.9;
