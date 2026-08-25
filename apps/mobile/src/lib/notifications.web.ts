/**
 * Push on the web.
 *
 * A browser can show notifications, but only through a service worker with its
 * own VAPID keys — a different delivery path from Expo's, and one the agent
 * service does not speak. Rather than half-register something that will never
 * deliver a booking reminder, this declines cleanly.
 *
 * Reminders still reach people: the sweep sends them, and the reservations
 * screen shows the same information whenever the app is open.
 */
export async function registerForPush(): Promise<{ ok: boolean; reason?: string }> {
  return { ok: false, reason: 'Push reminders need the phone app.' };
}
