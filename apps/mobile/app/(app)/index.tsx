import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { ScreenScroll } from '../../src/components/ui/screen';
import { Body, Caption, Display, Eyebrow } from '../../src/components/ui/text';
import { useProfile } from '../../src/lib/profile';
import { useQuery } from '@tanstack/react-query';
import { listReservations } from '../../src/lib/agent';

/**
 * Home before there is anything to show.
 *
 * The empty state carries the product's promise rather than apologising for
 * having no data: these are the things you will be able to say once the
 * concierge chat lands in Phase 4.
 */
const EXAMPLES = [
  'Book me a haircut Saturday morning near the Marina',
  'Anniversary dinner next Friday, somewhere special',
  'Quiet table for two tonight, walking distance',
];

function firstName(full: string | null): string | null {
  if (!full) return null;
  return full.trim().split(/\s+/)[0] ?? null;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const profile = useProfile();
  const name = firstName(profile.data?.full_name ?? null);
  const reservations = useQuery({ queryKey: ['reservations'], queryFn: listReservations });
  const upcomingCount = reservations.data?.upcoming.length ?? 0;

  return (
    <ScreenScroll>
      <View className="gap-3 pt-6">
        <Eyebrow>reservAI</Eyebrow>
        <Display>
          {greeting()}
          {name ? `, ${name}` : ''}
        </Display>
        <Body>Nothing booked yet. Tell me what you want and I will find it, then book it.</Body>
      </View>

      <View className="gap-3">
        <Caption>Try something like</Caption>
        {EXAMPLES.map((example) => (
          <View
            key={example}
            className="rounded-2xl border border-paper-line bg-paper-raised px-5 py-4 dark:border-night-line dark:bg-night-raised"
          >
            <Body className="text-ink dark:text-paper">“{example}”</Body>
          </View>
        ))}
        <Link href="/(app)/chat" asChild>
          <Pressable
            accessibilityRole="button"
            className="mt-1 h-14 flex-row items-center justify-center rounded-2xl bg-ink px-6 dark:bg-paper"
          >
            <Body className="font-medium text-paper dark:text-ink">Ask for something</Body>
          </Pressable>
        </Link>
      </View>

      <View className="gap-3">
        <Caption>Your reservations</Caption>
        <Link href="/(app)/reservations" asChild>
          <Pressable
            accessibilityRole="button"
            className="rounded-2xl border border-paper-line px-5 py-4 dark:border-night-line"
          >
            <Body className="font-medium text-ink dark:text-paper">
              {upcomingCount === 0
                ? 'Nothing booked yet'
                : upcomingCount === 1
                  ? 'One booking coming up'
                  : `${upcomingCount} bookings coming up`}
            </Body>
            <Caption>
              {upcomingCount === 0
                ? 'Once I book something it lands here, with a calendar entry and a reminder.'
                : 'Tap to see them, add to your calendar, or cancel.'}
            </Caption>
          </Pressable>
        </Link>
      </View>

      <Link href="/(app)/profile" asChild>
        <Pressable
          accessibilityRole="button"
          className="rounded-2xl border border-paper-line px-5 py-4 dark:border-night-line"
        >
          <Body className="font-medium text-ink dark:text-paper">Your profile</Body>
          <Caption>Tastes, dietary needs, usual party size</Caption>
        </Pressable>
      </Link>
    </ScreenScroll>
  );
}
