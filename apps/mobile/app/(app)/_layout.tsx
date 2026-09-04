import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Meta } from '../../src/components/ui/text';
import { registerForPush } from '../../src/lib/notifications';

/**
 * Five places, named in words.
 *
 * Icons are what a tab bar reaches for when it has more destinations than it
 * can label, and this one has exactly as many as it can. A word says which of
 * Plans and Discover you are about to open; two small pictograms would not,
 * and would need learning first.
 *
 * The screens below it are not the whole app — the conversation is still where
 * anything actually gets done, and Home exists to hand you to it already
 * knowing what you were looking at.
 */

const DESTINATIONS = [
  { name: 'index', label: 'Home' },
  { name: 'suhail', label: 'Suhail' },
  { name: 'plans', label: 'Plans' },
  { name: 'discover', label: 'Discover' },
  { name: 'you', label: 'You' },
] as const;

function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{ paddingBottom: Math.max(insets.bottom, 10) }}
      className="flex-row border-t border-stone-line bg-porcelain px-3 pt-2.5 dark:bg-ink"
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
              The current place is ink; the others are stone. No pill, no
              underline, no accent — champagne means a booking is at stake and
              nothing else, least of all which tab you are on.
            */}
            <Meta className={focused ? 'text-ink dark:text-porcelain' : undefined}>
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
      {/* Reached from You, not from the bar. */}
      <Tabs.Screen name="knows" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
