import type { CalendarEntry, CalendarResult } from './calendar';

/**
 * The calendar, in a browser.
 *
 * A web page cannot write to someone's calendar. What it can do is hand over a
 * standard .ics file, which every calendar app understands — so the booking
 * still lands in the calendar they already look at, with one extra tap.
 *
 * Nothing is recorded against the booking afterwards: we did not create an
 * event, so there is none of ours to delete if they cancel. Saying we had one
 * would leave the reservation looking filed away when it is not.
 */

function stamp(date: Date): string {
  // iCalendar UTC form: 20260824T173000Z, no punctuation.
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** iCalendar gives commas, semicolons and backslashes meaning of their own. */
function escape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/[;,]/g, (m) => `\\${m}`)
    .replace(/\r?\n/g, '\\n');
}

function icsFor(entry: CalendarEntry, uid: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Reserv//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(entry.startsAt)}`,
    `DTSTART:${stamp(entry.startsAt)}`,
    `DTEND:${stamp(entry.endsAt)}`,
    `SUMMARY:${escape(entry.title)}`,
  ];
  if (entry.location !== null) lines.push(`LOCATION:${escape(entry.location)}`);
  if (entry.notes !== null) lines.push(`DESCRIPTION:${escape(entry.notes)}`);
  lines.push(
    // The same hour's notice the native build asks for.
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  );
  return lines.join('\r\n');
}

export async function addToCalendar(entry: CalendarEntry): Promise<CalendarResult> {
  try {
    const uid = `${stamp(entry.startsAt)}-${Math.round(entry.endsAt.getTime())}@reserv.ae`;
    const blob = new Blob([icsFor(entry, uid)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'reservation.ics';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoking immediately can cancel the download in Safari.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);

    return {
      ok: true,
      eventId: null,
      message: 'Calendar file downloaded — open it to add the booking.',
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Could not add it.' };
  }
}

export async function removeFromCalendar(_eventId: string): Promise<void> {
  // Nothing of ours was created, so there is nothing to remove.
}

export type { CalendarEntry, CalendarResult };
