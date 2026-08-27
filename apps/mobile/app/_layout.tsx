import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Fraunces_400Regular, Fraunces_500Medium } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import { initSessionListener, useSession, useSessionLoading } from '../src/store/session';
import { useProfile } from '../src/lib/profile';
import '../global.css';

/**
 * Nothing but the ground colour.
 *
 * A spinner on a cold start says the app is working; an empty page of the
 * right colour says it has already arrived. The wait is short and the second
 * reading is the one this product wants.
 */
function Splash() {
  return <View className="flex-1 bg-porcelain dark:bg-ink" />;
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
  const scheme = useColorScheme();
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

  // The navigator paints its own default grey behind every screen, which shows
  // in the gap during a transition and behind anything translucent. Giving it
  // the page colour means there is only ever one ground.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: scheme === 'dark' ? '#14161A' : '#F7F5F1' },
      }}
    />
  );
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

  // The serif is the register. Rendering the app in a system fallback and
  // swapping a moment later would show the wrong product first, so the ground
  // colour holds until both faces are ready.
  const [fontsReady] = useFonts({
    Fraunces_400Regular,
    Fraunces_500Medium,
    Inter_400Regular,
    Inter_500Medium,
  });

  useEffect(() => initSessionListener(), []);

  if (!fontsReady) return <Splash />;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        <AuthGate />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
