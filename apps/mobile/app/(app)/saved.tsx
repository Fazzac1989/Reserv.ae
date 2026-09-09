import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Rule, ScreenScroll } from '../../src/components/ui/screen';
import { Body, Display, Lead, Meta, Muted, Title } from '../../src/components/ui/text';
import { LiveStatus } from '../../src/components/booking-state';
import { useSavedVenues } from '../../src/lib/saved';

/**
 * What you kept.
 *
 * Its own destination now rather than a list at the bottom of Profile. The
 * difference is what it is for: Profile is where you go to change something
 * about yourself, and this is where you go to find somewhere you already
 * decided you liked. Those are different errands and they were sharing a
 * screen.
 */
export default function Saved() {
  const router = useRouter();
  const saved = useSavedVenues();
  const venues = saved.data ?? [];

  return (
    <ScreenScroll>
      <View className="gap-3 pt-4">
        <Display>Saved</Display>
        <Lead className="text-grey">Places you kept for later.</Lead>
      </View>

      {saved.isLoading ? <LiveStatus label="Looking…" /> : null}

      {saved.isError ? (
        <Body className="text-alert">I could not read your saved places just now.</Body>
      ) : null}

      {/*
        An empty state that does something, rather than an empty state that
        explains. The way out of an empty list is the list somewhere else.
      */}
      {!saved.isLoading && !saved.isError && venues.length === 0 ? (
        <View className="gap-4">
          <Muted>
            Nothing kept yet. Anything you save while browsing shows up here, and Reserv uses it
            when it suggests somewhere.
          </Muted>
          <Pressable
            onPress={() => router.push('/discover')}
            accessibilityRole="button"
            className="min-h-[44px] justify-center"
          >
            <Body className="font-body-medium">Go and look around</Body>
          </Pressable>
        </View>
      ) : null}

      {venues.length > 0 ? (
        <View>
          {venues.map((venue, i) => (
            <View key={venue.id}>
              <Pressable
                onPress={() => router.push(`/venue/${venue.slug ?? venue.id}`)}
                accessibilityRole="button"
                accessibilityLabel={venue.name}
                className="min-h-[44px] justify-center py-4"
              >
                <Title numberOfLines={1}>{venue.name}</Title>
                <Meta className="mt-1">
                  {[venue.neighbourhood, venue.tags?.[0]].filter(Boolean).join(' · ')}
                </Meta>
              </Pressable>
              {i < venues.length - 1 ? <Rule /> : null}
            </View>
          ))}
        </View>
      ) : null}
    </ScreenScroll>
  );
}
