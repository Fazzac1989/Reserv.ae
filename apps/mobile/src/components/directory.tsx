import { Dimensions, ImageBackground, Pressable, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Body, Display, Lead, Meta, Muted, Title } from './ui/text';
import { TextCard } from './text-card';
import { LiveStatus } from './booking-state';
import { BRAND } from '@reservai/config';
import { supabase } from '../lib/supabase';

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

export interface Listing {
  id: string;
  slug: string | null;
  name: string;
  vertical: string;
  zone: string;
  price_band: number;
  house_note: string | null;
  description: string | null;
  tags: string[];
  photo_urls: string[];
  is_demo: boolean;
}

const BANDS = ['', 'Everyday', 'Comfortable', 'Upmarket', 'Occasion'];

/** Shelves, in the order somebody browsing would want them. */
const SHELVES: { kind: string; title: string; blurb: string }[] = [
  { kind: 'dining', title: 'Tables', blurb: 'Where Reserv would send you tonight.' },
  { kind: 'grooming', title: 'Chairs', blurb: 'Barbers and salons worth keeping.' },
  { kind: 'wellness', title: 'Quiet', blurb: 'Spas, and somewhere to disappear.' },
  { kind: 'leisure', title: 'Days out', blurb: 'Beach clubs, courses, evenings.' },
];

function Card({
  listing,
  labels,
  width,
  height,
  large = false,
  onPress,
}: {
  listing: Listing;
  labels: Record<string, string>;
  width: number;
  height: number;
  large?: boolean;
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
          // Ink underneath, so the moment before a photograph arrives reads as
          // a dark card rather than as a broken one.
          style={{ height, backgroundColor: '#0B0B0C' }}
          className="justify-end"
          resizeMode="cover"
        >
          {/*
            One gradient rather than three stacked boxes. Stacked opacities
            leave a visible edge wherever one ends, which a dark photograph
            hides and a bright one does not — and which every photograph shows
            in the moment before it loads.
          */}
          <LinearGradient
            colors={['transparent', 'rgba(11,11,12,0.35)', 'rgba(11,11,12,0.88)']}
            locations={[0.35, 0.68, 1]}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '75%' }}
          />
          <View className="p-6">
            <Title className="text-paper">{listing.name}</Title>
            <Meta className="mt-1.5 text-paper/70">{meta}</Meta>
          </View>
        </ImageBackground>
      ) : (
        <TextCard
          name={listing.name}
          meta={meta}
          note={listing.house_note ?? listing.description}
          tags={listing.tags ?? []}
          height={height}
          large={large}
        />
      )}
    </Pressable>
  );
}

export function Directory({
  onOpen,
  header,
}: {
  onOpen: (listing: Listing) => void;
  /**
   * What sits above the shelves.
   *
   * Signed in, this is the greeting, the search field and whatever is booked
   * today — the things the old Home screen carried before Discover absorbed
   * it. Signed out there is no name to greet and nothing booked, so the
   * default title stands in. Passing it rather than branching inside keeps
   * this component about the directory and nothing else.
   */
  header?: React.ReactNode;
}) {
  const width = Dimensions.get('window').width;

  const listings = useQuery({
    queryKey: ['discover'],
    queryFn: async () => {
      const [venues, categories, places] = await Promise.all([
        supabase
          .from('venues')
          .select(
            'id, slug, name, vertical, zone, price_band, house_note, description, tags, photo_urls, is_demo',
          )
          // No `.eq('onboarding_status', 'live')` here, deliberately.
          //
          // Postgres requires SELECT privilege on a column to filter by it,
          // not just to read it back, and `onboarding_status` is not granted
          // to anonymous visitors — it describes our commercial relationship
          // with a venue rather than anything about the venue. So a signed-out
          // visitor asking for live venues was refused the whole query.
          //
          // The filter was duplicating the RLS policy anyway, which is the
          // actual authority and applies to everyone. A client re-stating a
          // policy it cannot see is the kind of thing that quietly drifts out
          // of step with it.
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

  /**
   * The opener, chosen rather than taken.
   *
   * Sorting by price band put a barber's chair at the top of a screen whose
   * job is to make somebody want dinner. A table, with a photograph, is the
   * right thing to land on — and if there is no such thing, the screen opens
   * on shelves instead of on an apology.
   */
  const lead =
    venues.find((v) => kindOf[v.vertical] === 'dining' && v.photo_urls?.[0]) ??
    venues.find((v) => v.photo_urls?.[0]) ??
    venues[0];
  const rest = venues.filter((v) => v.id !== lead?.id);

  return (
    <View className="flex-1 bg-paper dark:bg-ink">
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-10 pb-16">
          {header ?? (
            <View className="gap-3 px-7 pt-4">
              <Display>Discover</Display>
              <Lead className="text-grey">Places {BRAND.assistant} can actually get you into.</Lead>
            </View>
          )}

          {listings.isLoading ? (
            <View className="px-7">
              <LiveStatus label="Looking…" />
            </View>
          ) : null}

          {listings.isError ? (
            <View className="px-7">
              <Body className="text-alert">I could not read the directory just now.</Body>
            </View>
          ) : null}

          {!listings.isLoading && venues.length === 0 ? (
            <View className="px-7">
              <Muted>
                Nothing here yet. Reserv only lists places that have agreed to take bookings, so
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
                large
                onPress={() => onOpen(lead)}
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
                      onPress={() => onOpen(listing)}
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
                Some of these are samples while Reserv onboards real venues. Reserv will tell you
                which before it books anything.
              </Muted>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
