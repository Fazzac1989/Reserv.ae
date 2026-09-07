import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Meta } from '../../src/components/ui/text';
import { registerForPush } from '../../src/lib/notifications';

/**
 * Four places, named in words.
 *
 * It was five. Home and Discover were separate tabs, and the top one answered
 * "what is happening today" while the one below answered "where should I go" —
 * which is the question people open this app with. They are one screen now,
 * so the greeting and the shelves are no longer a tab apart.
 *
 * Icons are what a tab bar reaches for when it has more destinations than it
 * can label. At four it can label all of them, and a word says which of My
 * Plans and Discover you are about to open where two pictograms would not.
 *
 * The route names are unchanged even where the labels are not: `/suhail` and
 * `/you` are already linked to from inside the app and from notifications, and
 * renaming a working URL to match a label is a cost with no reader.
 */

const DESTINATIONS = [
  { name: 'index', label: 'Discover' },
  { name: 'suhail', label: 'Ask Reserv' },
  { name: 'plans', label: 'My Plans' },
  { name: 'you', label: 'Profile' },
] as const;

function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{ paddingBottom: Math.max(insets.bottom, 10) }}
      className="flex-row border-t border-grey-line bg-paper px-1 pt-2.5 dark:bg-ink"
    >
      {state.routes.map((route, index) => {
        const destination = DESTINATIONS.find((d) => d.name === route.name);
        if (!destination) return null;

        const focused = state.index === index;

        return (
          <Pressable
            key={route.key}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={destination.label}
            className="min-h-[44px] flex-1 items-center justify-center"
          >
            {/*
              The current place is ink; the others are grey. No pill, no
              underline, no fill. Full contrast is what a booking at stake is paid
              in, and which tab you are on is not that.
            */}
            {/*
              Tracking tightened from the 1.4px the meta size carries
              everywhere else. Two of these labels are two words, and at full
              tracking four of them sit shoulder to shoulder with no air
              between. This is the one place the type scale is overridden, and
              it is because the bar has a width rather than because it looks
              better in isolation.
            */}
            <Meta
              numberOfLines={1}
              className={`tracking-[0.6px] ${focused ? 'text-ink dark:text-paper' : ''}`}
            >
              {destination.label}
            </Meta>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function AppLayout() {
  // Asked for once the user is signed in and has a reason to want reminders,
  // rather than on first launch before they have booked anything.
  useEffect(() => {
    void registerForPush();
  }, []);

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      {DESTINATIONS.map((d) => (
        <Tabs.Screen key={d.name} name={d.name} options={{ title: d.label }} />
      ))}
      {/* Reached from a screen rather than the bar: search from Discover, the
          other two from Profile. */}
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="knows" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
