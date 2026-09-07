import { ImageBackground, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Body, Display, Lead, Meta, Muted, Title } from '../../../src/components/ui/text';
import { Button } from '../../../src/components/ui/button';
import { Rule } from '../../../src/components/ui/screen';
import { LiveStatus } from '../../../src/components/booking-state';
import { placeLabels, venueBySlugOrId } from '../../../src/lib/venues';
import { useSession } from '../../../src/store/session';
import { rememberIntent } from '../../../src/store/intent';

const BANDS = ['', 'Everyday', 'Comfortable', 'Upmarket', 'Occasion'];

interface Venue {
  id: string;
  name: string;
  zone: string;
  price_band: number;
  tags: string[];
  address: string | null;
  description: string | null;
  house_note: string | null;
  best_times: string[];
  photo_urls: string[];
  is_demo: boolean;
}

/**
 * One venue, readable by anybody.
 *
 * This is the page a link points at, so it has to stand on its own for
 * somebody who has never heard of Reserv: what the place is, where it is, and
 * one button. Everything above that button is the same whether you are signed
 * in or not — the only thing sign-in changes is what happens when you press
 * it, and asking who somebody is before they have decided they want anything
 * is the mistake this whole change exists to undo.
 */
export default function PublicVenue() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = useSession();

  const venue = useQuery({
    queryKey: ['public-venue', id],
    enabled: Boolean(id),
    queryFn: () => venueBySlugOrId(id) as Promise<Venue | null>,
  });

  const places = useQuery({ queryKey: ['places'], queryFn: placeLabels });

  const v = venue.data;
  const photo = v?.photo_urls?.[0];
  const meta = v
    ? [places.data?.[v.zone] ?? v.zone, BANDS[v.price_band]].filter(Boolean).join(' · ')
    : '';

  function book() {
    if (!v) return;
    if (session) {
      router.push({ pathname: '/suhail', params: { ask: `A table at ${v.name}` } });
      return;
    }
    // Signed out: remember what they came for, then ask who they are. The
    // sign-in flow hands them back here rather than to a home screen.
    rememberIntent(v.id, v.name);
    router.push('/(auth)/sign-in');
  }

  return (
    <View className="flex-1 bg-paper dark:bg-ink">
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            className="px-7 pb-2 pt-4"
          >
            <Meta>Back</Meta>
          </Pressable>

          {venue.isLoading ? (
            <View className="px-7 pt-4">
              <LiveStatus label="Looking…" />
            </View>
          ) : null}

          {venue.isError ? (
            <View className="px-7 pt-4">
              <Body className="text-alert">I could not load this one just now.</Body>
            </View>
          ) : null}

          {!venue.isLoading && !v ? (
            <View className="gap-2 px-7 pt-4">
              <Title>Not here</Title>
              <Muted>This listing is not public, or it has been taken down.</Muted>
            </View>
          ) : null}

          {v ? (
            <>
              {photo ? (
                <ImageBackground
                  source={{ uri: photo }}
                  style={{ height: 380, backgroundColor: '#0B0B0C' }}
                  className="mx-7 justify-end overflow-hidden rounded-card"
                  resizeMode="cover"
                >
                  <LinearGradient
                    colors={['transparent', 'rgba(11,11,12,0.35)', 'rgba(11,11,12,0.88)']}
                    locations={[0.35, 0.68, 1]}
                    style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '75%' }}
                  />
                  <View className="p-6">
                    <Display className="text-paper">{v.name}</Display>
                    <Meta className="mt-2 text-paper/70">{meta}</Meta>
                  </View>
                </ImageBackground>
              ) : (
                <View className="gap-2 px-7">
                  <Meta>{meta}</Meta>
                  <Display>{v.name}</Display>
                </View>
              )}

              <View className="gap-7 px-7 pt-8">
                {v.house_note ?? v.description ? (
                  <Lead>{v.house_note ?? v.description}</Lead>
                ) : null}

                {v.tags.length > 0 ? <Meta>{v.tags.slice(0, 4).join(' · ')}</Meta> : null}

                {v.address ? (
                  <View className="gap-1.5">
                    <Meta>Where</Meta>
                    <Body>{v.address}</Body>
                  </View>
                ) : null}

                {v.best_times.length > 0 ? (
                  <View className="gap-1.5">
                    <Meta>Best times</Meta>
                    <Body>{v.best_times.join(' · ')}</Body>
                  </View>
                ) : null}

                <Rule />

                <Button variant="commit" label="Book a table" onPress={book} />

                {/*
                  Said before they commit to anything, not after. Somebody who
                  has not signed in is about to be asked to, and being told why
                  first is the difference between a request and an obstacle.
                */}
                {!session ? (
                  <Muted>
                    Reserv books this for you. I will ask for your name and an email — the name
                    because the restaurant needs one, the email so you can be told when it is
                    confirmed.
                  </Muted>
                ) : null}

                {v.is_demo ? (
                  <Muted>
                    This is a sample listing while Reserv onboards real venues. Nothing here will
                    be booked.
                  </Muted>
                ) : null}
              </View>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
