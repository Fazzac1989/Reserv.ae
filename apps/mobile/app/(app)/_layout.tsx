import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Meta } from '../../src/components/ui/text';
import { registerForPush } from '../../src/lib/notifications';

/**
 * Today, Plans, Ask, Saved.
 *
 * Discover is not here any more and Profile never was a destination — both are
 * reached from Today. The change follows the promise: "your plans, taken care
 * of" means the first screen answers what is happening and what needs deciding,
 * and a bar whose first stop is a restaurant list answers a question nobody
 * opened the app to ask. Discovery supports that; it does not lead it.
 *
 * Ask sits third rather than last because it is the thing people reach for when
 * the other three did not have the answer, and the middle of a bar is where a
 * thumb rests.
 *
 * The route names are unchanged where they already worked: `/suhail` is linked
 * from notifications and from half a dozen screens, and renaming a working URL
 * to match a label is a cost with no reader.
 */

const DESTINATIONS = [
  { name: 'index', label: 'Today', icon: 'sun' },
  { name: 'plans', label: 'Plans', icon: 'calendar' },
  { name: 'suhail', label: 'Ask', icon: 'message-circle' },
  { name: 'saved', label: 'Saved', icon: 'bookmark' },
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
              The accent marks the current tab, which is the fourth thing it is
              spent on and the reason the old "commitment only" rule no longer
              holds. Everything else in the bar is grey.

              Tracking is tightened from the 1.4px the meta size carries
              everywhere else: two of these labels are two words, and at full
              tracking four sit shoulder to shoulder with no air between.
            */}
            <Feather
              name={destination.icon}
              size={20}
              color={focused ? '#DE8B63' : '#A08A80'}
            />
            <Meta
              numberOfLines={1}
              className={`mt-1 tracking-[0.6px] ${focused ? 'text-accent-text' : ''}`}
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
      {/*
        Reached from a screen rather than the bar. Discover and Profile are one
        tap from Today; search is one tap from Discover; Household, Routines and
        preferences sit behind Profile. A bar with eight things in it is a menu.
      */}
      <Tabs.Screen name="discover" options={{ href: null }} />
      <Tabs.Screen name="compare" options={{ href: null }} />
      <Tabs.Screen name="you" options={{ href: null }} />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="knows" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
