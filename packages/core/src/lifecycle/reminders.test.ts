import { describe, expect, it } from 'vitest';
import {
  isReminderUseful,
  reminderCopy,
  reminderWindow,
  reminderWindows,
  REMINDERS,
} from './reminders';

const NOW = new Date('2026-02-06T12:00:00.000Z');
const spec = (kind: string) => REMINDERS.find((r) => r.kind === kind)!;

describe('reminder windows', () => {
  it('looks a day ahead for the day-before reminder', () => {
    const window = reminderWindow(spec('day_before'), NOW);
    // Bookings between 06:00 and 12:00 tomorrow are due now.
    expect(window.to).toBe('2026-02-07T12:00:00.000Z');
    expect(window.from).toBe('2026-02-07T06:00:00.000Z');
  });

  it('looks two hours ahead for the two-hour reminder', () => {
    const window = reminderWindow(spec('two_hours'), NOW);
    expect(window.to).toBe('2026-02-06T14:00:00.000Z');
    expect(window.from).toBe('2026-02-06T13:00:00.000Z');
  });

  // The rating prompt fires after the booking, so its window is in the past.
  it('looks backwards for the rating prompt', () => {
    const window = reminderWindow(spec('rate_visit'), NOW);
    expect(window.to).toBe('2026-02-06T09:00:00.000Z');
    expect(new Date(window.from).getTime()).toBeLessThan(new Date(window.to).getTime());
  });

  it('produces one window per reminder kind', () => {
    expect(reminderWindows(NOW).map((w) => w.kind)).toEqual([
      'day_before',
      'two_hours',
      'rate_visit',
    ]);
  });

  // A sweep that runs late must still find what it missed, which is why these
  // are ranges rather than instants.
  it('covers a booking whose moment passed within the grace period', () => {
    const window = reminderWindow(spec('two_hours'), NOW);
    const bookingIn90Minutes = new Date('2026-02-06T13:30:00.000Z').toISOString();
    expect(bookingIn90Minutes >= window.from && bookingIn90Minutes < window.to).toBe(true);
  });
});

describe('whether a reminder is worth sending at all', () => {
  const scheduled = new Date('2026-02-07T18:00:00.000Z');

  it('sends the day-before reminder at the right moment', () => {
    const confirmed = new Date('2026-02-01T10:00:00.000Z');
    const at = new Date('2026-02-06T18:05:00.000Z');
    expect(isReminderUseful(spec('day_before'), scheduled, confirmed, at)).toBe(true);
  });

  it('does not send one before its moment', () => {
    const confirmed = new Date('2026-02-01T10:00:00.000Z');
    const tooEarly = new Date('2026-02-06T12:00:00.000Z');
    expect(isReminderUseful(spec('day_before'), scheduled, confirmed, tooEarly)).toBe(false);
  });

  it('does not send one long after its moment', () => {
    const confirmed = new Date('2026-02-01T10:00:00.000Z');
    // Seven hours late, against a six-hour grace period.
    const tooLate = new Date('2026-02-07T01:00:00.000Z');
    expect(isReminderUseful(spec('day_before'), scheduled, confirmed, tooLate)).toBe(false);
  });

  // The case that would otherwise produce a nonsense notification: a booking
  // confirmed two hours before it starts must not fire a "tomorrow" reminder.
  it('never sends a reminder for a moment that had already passed when it was confirmed', () => {
    const confirmedLate = new Date('2026-02-07T16:00:00.000Z');
    const at = new Date('2026-02-07T16:05:00.000Z');
    expect(isReminderUseful(spec('day_before'), scheduled, confirmedLate, at)).toBe(false);
    // The two-hour one is still ahead of it, so that one is fine.
    expect(isReminderUseful(spec('two_hours'), scheduled, confirmedLate, at)).toBe(true);
  });

  it('sends the rating prompt only after the visit', () => {
    const confirmed = new Date('2026-02-01T10:00:00.000Z');
    expect(
      isReminderUseful(spec('rate_visit'), scheduled, confirmed, new Date('2026-02-07T19:00:00Z')),
    ).toBe(false);
    expect(
      isReminderUseful(spec('rate_visit'), scheduled, confirmed, new Date('2026-02-07T21:30:00Z')),
    ).toBe(true);
  });
});

describe('what the notification says', () => {
  const scheduledFor = new Date('2026-02-07T16:00:00.000Z'); // 20:00 Dubai

  it('names the venue and the time, so it can be acted on from the lock screen', () => {
    const copy = reminderCopy('day_before', {
      venueName: 'The Glasshouse Marina',
      scheduledFor,
      partySize: 2,
    });
    expect(copy.title).toBe('The Glasshouse Marina tomorrow');
    expect(copy.body).toContain('20:00');
    expect(copy.body).toContain('2 of you');
  });

  it('renders times in Dubai, not UTC', () => {
    const copy = reminderCopy('two_hours', {
      venueName: 'Thornbury Barbers',
      scheduledFor,
      partySize: 1,
    });
    expect(copy.title).toBe('Thornbury Barbers at 20:00');
    expect(copy.body).toContain('just you');
  });

  it('asks about the visit afterwards', () => {
    const copy = reminderCopy('rate_visit', {
      venueName: 'Saffron & Slate',
      scheduledFor,
      partySize: 4,
    });
    expect(copy.title).toBe('How was Saffron & Slate?');
  });
});
