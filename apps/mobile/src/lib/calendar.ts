import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

/**
 * The device calendar.
 *
 * Written to the user's own default calendar rather than a reservAI one: a
 * dinner belongs in the calendar they already look at, not in a separate list
 * they have to remember to check.
 */

export interface CalendarEntry {
  readonly title: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly location: string | null;
  readonly notes: string | null;
}

async function defaultCalendarId(): Promise<string | null> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.filter((c) => c.allowsModifications);
  if (writable.length === 0) return null;

  if (Platform.OS === 'ios') {
    const preferred = await Calendar.getDefaultCalendarAsync().catch(() => null);
    if (preferred && writable.some((c) => c.id === preferred.id)) return preferred.id;
  }

  const primary = writable.find((c) => c.isPrimary) ?? writable[0];
  return primary?.id ?? null;
}

export async function addToCalendar(
  entry: CalendarEntry,
): Promise<{ ok: true; eventId: string } | { ok: false; reason: string }> {
  const permission = await Calendar.requestCalendarPermissionsAsync();
  if (permission.status !== 'granted') {
    return { ok: false, reason: 'I need calendar access to add it.' };
  }

  const calendarId = await defaultCalendarId();
  if (!calendarId) return { ok: false, reason: 'No calendar on this device can be written to.' };

  try {
    const eventId = await Calendar.createEventAsync(calendarId, {
      title: entry.title,
      startDate: entry.startsAt,
      endDate: entry.endsAt,
      location: entry.location ?? undefined,
      notes: entry.notes ?? undefined,
      // The app already reminds; this is the calendar's own nudge, kept short
      // so the two do not arrive together.
      alarms: [{ relativeOffset: -60 }],
    });
    return { ok: true, eventId };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Could not add it.' };
  }
}

export async function removeFromCalendar(eventId: string): Promise<void> {
  // A cancelled booking leaving a calendar entry behind is worse than never
  // having added one, so failure here is swallowed rather than surfaced.
  await Calendar.deleteEventAsync(eventId).catch(() => undefined);
}
