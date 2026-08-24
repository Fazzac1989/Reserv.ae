import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { registerForPush } from '../../src/lib/notifications';

export default function AppLayout() {
  // Asked for once the user is signed in and has a reason to want reminders,
  // rather than on first launch before they have booked anything.
  useEffect(() => {
    void registerForPush();
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
