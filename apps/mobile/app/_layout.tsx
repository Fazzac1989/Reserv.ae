import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { initSessionListener, useSession, useSessionLoading } from '../src/store/session';
import { useProfile } from '../src/lib/profile';
import '../global.css';

function Splash() {
  return (
    <View className="flex-1 items-center justify-center bg-paper dark:bg-night">
      <ActivityIndicator />
    </View>
  );
}

/**
 * Routes between the three states the app can be in: signed out, signed in but
 * not yet onboarded, and ready.
 *
 * Nothing renders until each answer is known. Showing sign-in for a frame on a
 * cold start reads as being logged out, and flashing the wizard at someone who
 * finished it months ago is worse.
 */
function AuthGate() {
  const session = useSession();
  const sessionLoading = useSessionLoading();
  const profile = useProfile();
  const segments = useSegments();
  const router = useRouter();

  const group = segments[0];
  const onboarded = profile.data ? profile.data.onboarded_at !== null : null;
  // A profile row is created by a trigger at sign-up, so a failure here is a
  // real error rather than a missing row. Send them on instead of trapping
  // them behind a spinner; the wizard's own save will surface the problem.
  const resolving = sessionLoading || (Boolean(session) && profile.isLoading);

  useEffect(() => {
    if (resolving) return;

    if (!session) {
      if (group !== '(auth)') router.replace('/(auth)/sign-in');
      return;
    }

    if (onboarded === false) {
      if (group !== '(onboarding)') router.replace('/(onboarding)');
      return;
    }

    if (group === '(auth)' || group === '(onboarding)') {
      router.replace('/(app)');
    }
  }, [resolving, session, onboarded, group, router]);

  if (resolving) return <Splash />;

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Booking state is authoritative on the server; never serve a stale
            // "confirmed" from cache for long.
            staleTime: 15_000,
            retry: 2,
          },
        },
      }),
  );

  useEffect(() => initSessionListener(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <AuthGate />
    </QueryClientProvider>
  );
}
