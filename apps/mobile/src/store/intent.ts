import { create } from 'zustand';

/**
 * What the visitor was trying to do when we asked them to sign in.
 *
 * The whole point of opening the directory to the public is that somebody can
 * arrive, find a restaurant, and only then be asked who they are. That is only
 * true if we put them back where they were afterwards — an app that makes you
 * sign in and then drops you on a home screen has not deferred the sign-up,
 * it has just moved it and lost your place.
 *
 * In memory rather than on disk, deliberately. The whole journey — enter an
 * email, read the six-digit code, come back, give a name — happens inside one
 * run of the app, because the code is typed in rather than followed from a
 * link. A persisted intent would outlive its usefulness and one day drop
 * somebody into a booking they started last week.
 */
interface BookingIntent {
  venueId: string;
  venueName: string;
}

interface IntentState {
  intent: BookingIntent | null;
  setIntent: (intent: BookingIntent | null) => void;
}

export const useIntentStore = create<IntentState>((set) => ({
  intent: null,
  setIntent: (intent) => set({ intent }),
}));

export const useBookingIntent = () => useIntentStore((s) => s.intent);

/** Remember what they were about to book, then send them to sign in. */
export function rememberIntent(venueId: string, venueName: string): void {
  useIntentStore.getState().setIntent({ venueId, venueName });
}

/** Read it once and clear it, so a back button cannot replay it. */
export function takeIntent(): BookingIntent | null {
  const { intent, setIntent } = useIntentStore.getState();
  if (intent) setIntent(null);
  return intent;
}
