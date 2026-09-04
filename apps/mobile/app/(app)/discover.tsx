import { Dimensions, ImageBackground, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Display, Lead, Meta, Muted, Title } from '../../src/components/ui/text';
import { LiveStatus } from '../../src/components/booking-state';
import { supabase } from '../../src/lib/supabase';

/**
 * The directory, as something to look at.
 *
 * The design system says photography is the only decoration allowed, and this
 * is the screen that decoration was for — a list of names and price bands is a
 * spreadsheet, and no amount of typography rescues it.
 *
 * Deliberately few and large. A marketplace of thousands is the thing this
 * product is defined against, so the shelves are short and every card is big
 * enough to be worth looking at. Scrolling past six beautiful places beats
 * scanning sixty rows, and it is the same six the assistant would pick from.
 */

interface Listing {
  id: string;
  name: string;
  vertical: string;
  zone: string;
  price_band: number;
  house_note: string | null;
  description: string | null;
  photo_urls: string[];
  is_demo: boolean;
}

const BANDS = ['', 'Everyday', 'Comfortable', 'Upmarket', 'Occasion'];

/** Shelves, in the order somebody browsing would want them. */
const SHELVES: { kind: string; title: string; blurb: string }[] = [
  { kind: 'dining', title: 'Tables', blurb: 'Where Suhail would send you tonight.' },
  { kind: 'grooming', title: 'Chairs', blurb: 'Barbers and salons worth keeping.' },
  { kind: 'wellness', title: 'Quiet', blurb: 'Spas, and somewhere to disappear.' },
  { kind: 'leisure', title: 'Days out', blurb: 'Beach clubs, courses, evenings.' },
];

function Card({
  listing,
  labels,
  width,
  height,
  onPress,
}: {
  listing: Listing;
  labels: Record<string, string>;
  width: number;
  height: number;
  onPress: () => void;
}) {
  const photo = listing.photo_urls?.[0];
  const meta = [labels[listing.zone] ?? listing.zone, BANDS[listing.price_band]]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${listing.name}, ${meta}`}
      style={{ width }}
      className="overflow-hidden rounded-card"
    >
      {photo ? (
        <ImageBackground
          source={{ uri: photo }}
          style={{ height }}
          className="justify-end"
          resizeMode="cover"
        >
          {/*
            The scrim earns the serif its contrast. Three stops rather than two
            so it does not band on a wide-gamut screen.
          */}
          <View className="absolute inset-x-0 bottom-0 h-2/3 bg-ink/20" />
          <View className="absolute inset-x-0 bottom-0 h-1/2 bg-ink/45" />
          <View className="absolute inset-x-0 bottom-0 h-1/3 bg-ink/70" />
          <View className="p-6">
            <Title className="text-porcelain">{listing.name}</Title>
            <Meta className="mt-1.5 text-porcelain/70">{meta}</Meta>
          </View>
        </ImageBackground>
      ) : (
        <View
          style={{ height }}
          className="justify-end border border-stone-line bg-porcelain-raised p-6 dark:bg-ink-raised"
        >
          <Title>{listing.name}</Title>
          <Meta className="mt-1.5">{meta}</Meta>
        </View>
      )}
    </Pressable>
  );
}

export default function Discover() {
  const router = useRouter();
  const width = Dimensions.get('window').width;

  const listings = useQuery({
    queryKey: ['discover'],
    queryFn: async () => {
      const [venues, categories, places] = await Promise.all([
        supabase
          .from('venues')
          .select(
            'id, name, vertical, zone, price_band, house_note, description, photo_urls, is_demo',
          )
          .eq('onboarding_status', 'live')
          .order('price_band', { ascending: false }),
        supabase.from('categories').select('slug, label, kind'),
        supabase.from('places').select('slug, label'),
      ]);
      if (venues.error) throw venues.error;

      const labels: Record<string, string> = {};
      const kindOf: Record<string, string> = {};
      for (const c of categories.data ?? []) {
        labels[c.slug] = c.label;
        kindOf[c.slug] = c.kind;
      }
      for (const p of places.data ?? []) labels[p.slug] = p.label;

      return { venues: (venues.data ?? []) as Listing[], labels, kindOf };
    },
  });

  const venues = listings.data?.venues ?? [];
  const labels = listings.data?.labels ?? {};
  const kindOf = listings.data?.kindOf ?? {};

  const lead = venues[0];
  const rest = venues.slice(1);

  function open(listing: Listing) {
    router.push({ pathname: '/suhail', params: { ask: `Tell me about ${listing.name}` } });
  }

  return (
    <View className="flex-1 bg-porcelain dark:bg-ink">
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-10 pb-16">
          <View className="gap-3 px-7 pt-4">
            <Display>Discover</Display>
            <Lead className="text-stone">Places Suhail can actually get you into.</Lead>
          </View>

          {listings.isLoading ? (
            <View className="px-7">
              <LiveStatus label="Looking…" />
            </View>
          ) : null}

          {listings.isError ? (
            <View className="px-7">
              <Body className="text-clay">I could not read the directory just now.</Body>
            </View>
          ) : null}

          {!listings.isLoading && venues.length === 0 ? (
            <View className="px-7">
              <Muted>
                Nothing here yet. Suhail only lists places that have agreed to take bookings, so
                this fills up as they do.
              </Muted>
            </View>
          ) : null}

          {/*
            One full-bleed opener. A browse screen needs somewhere for the eye
            to land before it starts scanning, and the best thing in the
            directory is the honest choice for it.
          */}
          {lead ? (
            <View className="gap-3 px-7">
              <Card
                listing={lead}
                labels={labels}
                width={width - 56}
                height={420}
                onPress={() => open(lead)}
              />
              {lead.house_note ? <Lead>{lead.house_note}</Lead> : null}
            </View>
          ) : null}

          {SHELVES.map((shelf) => {
            const items = rest.filter((v) => kindOf[v.vertical] === shelf.kind);
            if (items.length === 0) return null;

            return (
              <View key={shelf.kind} className="gap-4">
                <View className="gap-1.5 px-7">
                  <Meta>{shelf.title}</Meta>
                  <Muted>{shelf.blurb}</Muted>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="gap-3 px-7"
                >
                  {items.map((listing) => (
                    <Card
                      key={listing.id}
                      listing={listing}
                      labels={labels}
                      width={Math.min(width - 110, 290)}
                      height={340}
                      onPress={() => open(listing)}
                    />
                  ))}
                </ScrollView>
              </View>
            );
          })}

          {/*
            Said once, at the bottom, where it informs without undermining the
            page. A sample listing that pretends to be a real restaurant is the
            one thing this product cannot afford to do.
          */}
          {venues.some((v) => v.is_demo) ? (
            <View className="px-7">
              <Muted>
                Some of these are samples while Reserv onboards real venues. Suhail will tell you
                which before it books anything.
              </Muted>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
