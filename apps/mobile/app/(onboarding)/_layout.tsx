import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  // No gestures and no header: onboarding is a linear flow with its own
  // back control, and a swipe-back would skip a step silently.
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />;
}
