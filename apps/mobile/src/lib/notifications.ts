import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { registerPushToken } from './agent';

/**
 * Push registration.
 *
 * Deliberately quiet about failure. Notifications are a convenience — a booking
 * is no less confirmed because someone declined the permission prompt — so
 * nothing here throws into the UI.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPush(): Promise<{ ok: boolean; reason?: string }> {
  // A simulator has no push token to give, and asking produces a confusing
  // error rather than a useful one.
  if (!Device.isDevice) return { ok: false, reason: 'Push needs a real device.' };

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Booking reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== 'granted') {
    // Only ask once. iOS will not show the prompt again, and asking on every
    // launch is how an app teaches someone to say no.
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return { ok: false, reason: 'Notifications are turned off.' };

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;

  try {
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await registerPushToken(token.data, Platform.OS === 'ios' ? 'ios' : 'android');
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Could not register.' };
  }
}
