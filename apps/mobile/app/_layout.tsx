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
import { supabase } from '../src/lib/supabase';
import '../global.css';

/**
 * Nothing but the ground colour.
 *
 * A spinner on a cold start says the app is working; an empty page of the
 * right colour says it has already arrived. The wait is short and the second
 * reading is the one this product wants.
 */
function Splash() {
  return <View className="flex-1 bg-paper dark:bg-ink" />;
}

/** Groups a signed-out visitor is allowed to be in. */
const PUBLIC_GROUPS = ['(public)', '(auth)'];

/**
 * Routes between the states the app can be in: signed out and browsing,
 * signed out and signing in, signed in but not yet onboarded, and ready.
 *
 * Being signed out is no longer an error state. The directory is public, so a
 * visitor with no session lands in `(public)` and can look at everything;
 * `(auth)` is somewhere they choose to go, usually because they pressed a
 * button that books a table. The redirect below sends them to the directory
 * rather than to sign-in, which is the whole difference between a product with
 * a front door and one with a gate.
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

  /**
   * A session whose user no longer exists.
   *
   * The token is still on the device and still parses, so `session` is truthy,
   * but there is no profile behind it. It happens whenever an account is
   * deleted or purged while a device still holds a token.
   *
   * Keyed on the query having finished and found nothing, not on `isError`.
   * The first version of this checked `isError` and did not work: `single()`
   * made a missing row an exception, React Query retried it, and once any
   * result had been cached a later failure left `status` at 'success' — so
   * `isError` was false in exactly the situation this exists to catch. The
   * profile hook returns null for a missing row now, which is a fact rather
   * than a failure, and `isFetched` says the answer has actually arrived
   * rather than being still on its way.
   *
   * Treated as signed out, because that is what it is. Signing out clears the
   * stale token so the next launch starts clean rather than repeating this.
   */
  const orphaned = Boolean(session) && profile.isFetched && !profile.data;

  useEffect(() => {
    if (!orphaned) return;
    void supabase.auth.signOut();
  }, [orphaned]);

  useEffect(() => {
    if (resolving) return;

    if (!session || orphaned) {
      if (!PUBLIC_GROUPS.includes(group ?? '')) router.replace('/(public)');
      return;
    }

    if (onboarded === false) {
      if (group !== '(onboarding)') router.replace('/(onboarding)');
      return;
    }

    // Signed in and onboarded.
    //
    // The public *directory* is included, so somebody who browsed their way
    // in, signed up and came back does not sit on the signed-out version of a
    // screen they now have a better one of. A public *venue page* is not: that
    // is the page links point at, and a link that works for a stranger and
    // bounces a member to their home screen is a worse link. `segments` is
    // ['(public)'] for the directory and ['(public)', 'venue', '[id]'] for a
    // listing, so the length is the difference.
    const onPublicIndex = group === '(public)' && segments.length === 1;
    if (group === '(auth)' || group === '(onboarding)' || onPublicIndex) {
      router.replace('/(app)');
    }
  }, [resolving, session, orphaned, onboarded, group, segments.length, router]);

  if (resolving) return <Splash />;

  // The navigator paints its own default grey behind every screen, which shows
  // in the gap during a transition and behind anything translucent. Giving it
  // the page colour means there is only ever one ground.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // The tab navigator nested below measures itself against this
        // container, so it is given a definite height to fill rather than
        // being left to infer one.
        contentStyle: {
          flex: 1,
          backgroundColor: scheme === 'dark' ? '#1C1613' : '#F9E7DE',
        },
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
