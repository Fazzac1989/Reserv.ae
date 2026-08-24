/**
 * When a reminder is due, and what it should say.
 *
 * Pure, so the awkward cases — a booking made ninety minutes before it starts,
 * a sweep that runs late, one that runs twice — can be reasoned about without a
 * database or a clock.
 */

export type ReminderKind = 'day_before' | 'two_hours' | 'rate_visit';

export interface ReminderSpec {
  readonly kind: ReminderKind;
  /** How far before the booking it fires. Negative means afterwards. */
  readonly offsetMinutes: number;
  /**
   * How late it may still be sent. A reminder that missed its moment is only
   * worth sending if it can still change what someone does.
   */
  readonly graceMinutes: number;
}

export const REMINDERS: readonly ReminderSpec[] = [
  { kind: 'day_before', offsetMinutes: 24 * 60, graceMinutes: 6 * 60 },
  { kind: 'two_hours', offsetMinutes: 2 * 60, graceMinutes: 60 },
  // The rating prompt goes out afterwards, once they have actually been.
  { kind: 'rate_visit', offsetMinutes: -3 * 60, graceMinutes: 5 * 24 * 60 },
];

export interface ReminderWindow {
  readonly kind: ReminderKind;
  /** Bookings scheduled inside this range are due for this reminder now. */
  readonly from: string;
  readonly to: string;
}

/**
 * The window of booking times that this reminder is due for, given the moment
 * the sweep is running.
 *
 * Expressed as a range rather than a single instant so a sweep that runs every
 * few minutes — or catches up after an outage — still finds everything exactly
 * once. Idempotency comes from the unique constraint on `booking_reminders`,
 * not from the sweep being punctual.
 */
export function reminderWindow(spec: ReminderSpec, now: Date): ReminderWindow {
  const nowMs = now.getTime();
  const offsetMs = spec.offsetMinutes * 60_000;
  const graceMs = spec.graceMinutes * 60_000;

  // A booking is due when `scheduled_for - offset` has passed but the grace
  // period has not run out.
  return {
    kind: spec.kind,
    from: new Date(nowMs + offsetMs - graceMs).toISOString(),
    to: new Date(nowMs + offsetMs).toISOString(),
  };
}

export function reminderWindows(now: Date): ReminderWindow[] {
  return REMINDERS.map((spec) => reminderWindow(spec, now));
}

/**
 * Whether a reminder is worth sending for a booking at all.
 *
 * A booking approved two hours before it starts should not immediately fire a
 * "tomorrow" reminder — the moment for that has already gone, and sending it
 * would be confusing rather than helpful.
 */
export function isReminderUseful(
  spec: ReminderSpec,
  scheduledFor: Date,
  confirmedAt: Date,
  now: Date,
): boolean {
  const fireAt = scheduledFor.getTime() - spec.offsetMinutes * 60_000;

  // Confirmed after the moment had passed: never appropriate.
  if (confirmedAt.getTime() > fireAt) return false;

  const lateBy = now.getTime() - fireAt;
  if (lateBy < 0) return false;
  return lateBy <= spec.graceMinutes * 60_000;
}

export interface ReminderCopy {
  readonly title: string;
  readonly body: string;
}

/**
 * What the notification says.
 *
 * Specific enough to act on from the lock screen: the venue, the time, and the
 * party size. A reminder that just says "you have a booking" makes someone open
 * the app to find out what it is.
 */
export function reminderCopy(
  kind: ReminderKind,
  input: { venueName: string; scheduledFor: Date; partySize: number; timezone?: string },
): ReminderCopy {
  const time = input.scheduledFor.toLocaleString('en-GB', {
    timeZone: input.timezone ?? 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
  });
  const day = input.scheduledFor.toLocaleString('en-GB', {
    timeZone: input.timezone ?? 'Asia/Dubai',
    weekday: 'long',
  });
  const people = input.partySize === 1 ? 'just you' : `${input.partySize} of you`;

  switch (kind) {
    case 'day_before':
      return {
        title: `${input.venueName} tomorrow`,
        body: `${day} at ${time}, ${people}. Let me know if anything changes and I will sort it.`,
      };
    case 'two_hours':
      return {
        title: `${input.venueName} at ${time}`,
        body: `In about two hours, ${people}.`,
      };
    default:
      return {
        title: `How was ${input.venueName}?`,
        body: 'A quick rating helps me pick better next time.',
      };
  }
}
