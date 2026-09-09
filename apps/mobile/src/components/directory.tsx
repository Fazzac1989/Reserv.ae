import { ImageBackground, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Body, Display, Lead, Meta, Muted, Title } from './ui/text';
import { COLUMN, COLUMN_MAX } from './ui/screen';
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

/**
 * How many venues a shelf shows before it stops.
 *
 * A collection can hold as many as ops likes — "Tonight" is currently every
 * restaurant in the directory — but a horizontal rail nobody reaches the end
 * of is a rail nobody scrolls twice. Ten is enough to feel deep without being
 * a list pretending to be a shelf.
 */
const SHELF_LIMIT = 10;

interface Collection {
  slug: string;
  title: string;
  blurb: string | null;
  sort_order: number;
}

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

  /*
   * Two shapes, and the difference is deliberate.
   *
   * The opener is full-bleed photography with the name over a scrim — the
   * thing at the top of a page that makes somebody want dinner. A shelf card
   * is a white card with the photograph inside it and the name underneath,
   * which is what the reference does and what reads correctly at a third of
   * the size: text over a small photograph is a caption fighting an image,
   * and text under one is a label.
   *
   * White rather than sand, on purpose. The ground is tinted and a photograph
   * on a tinted ground picks up the tint; on white it keeps its own colour,
   * which is the whole reason the cards are a different surface from the page.
   */
  if (large) {
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
            // Ink underneath, so the moment before a photograph arrives reads
            // as a dark card rather than as a broken one.
            style={{ height, backgroundColor: '#171A16' }}
            className="justify-end"
            resizeMode="cover"
          >
            {/*
              One gradient rather than three stacked boxes. Stacked opacities
              leave a visible edge wherever one ends, which a dark photograph
              hides and a bright one does not — and which every photograph
              shows in the moment before it loads.
            */}
            <LinearGradient
              colors={['transparent', 'rgba(23,26,22,0.35)', 'rgba(23,26,22,0.88)']}
              locations={[0.35, 0.68, 1]}
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '75%' }}
            />
            <View className="p-6">
              <Title className="text-white">{listing.name}</Title>
              <Meta className="mt-1.5 text-white/75">{meta}</Meta>
            </View>
          </ImageBackground>
        ) : (
          <TextCard
            name={listing.name}
            meta={meta}
            note={listing.house_note ?? listing.description}
            tags={listing.tags ?? []}
            height={height}
            large
          />
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${listing.name}, ${meta}`}
      style={{ width }}
      className="overflow-hidden rounded-card bg-paper-raised dark:bg-ink-raised"
    >
      {photo ? (
        <ImageBackground
          source={{ uri: photo }}
          style={{ height: height - 92, backgroundColor: '#171A16' }}
          resizeMode="cover"
        />
      ) : (
        <View style={{ height: height - 92 }} className="items-center justify-center bg-paper">
          <Meta>{(listing.tags?.[0] ?? '').toUpperCase()}</Meta>
        </View>
      )}

      <View className="gap-1 p-4">
        <Title numberOfLines={1}>{listing.name}</Title>
        <Meta numberOfLines={1}>{meta}</Meta>
      </View>
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
  /*
   * The column the shelves sit in, not the window they are drawn on.
   *
   * Cards are measured rather than flowed — a hero is `width - 56` and a shelf
   * card a third of that — so on a laptop a card sized from the window came out
   * over a thousand pixels wide and hung out of the column it belonged to.
   *
   * `useWindowDimensions` rather than `Dimensions.get` because the second is
   * read once and never again: on the web build, dragging the window narrower
   * left every card at the width it had when the page loaded.
   */
  const window = useWindowDimensions();
  const width = Math.min(window.width, COLUMN_MAX);

  const listings = useQuery({
    queryKey: ['discover'],
    queryFn: async () => {
      const [venues, categories, places, collectionList, collectionMembers] = await Promise.all([
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
        // The shelves, as rows. They used to be a constant in this file, which
        // meant "add a Brunch shelf" was a deploy rather than an edit.
        supabase
          .from('collections')
          .select('slug, title, blurb, sort_order')
          .order('sort_order', { ascending: true }),
        supabase
          .from('collection_venues')
          .select('collection_slug, venue_id, sort_order')
          .order('sort_order', { ascending: true }),
      ]);
      if (venues.error) throw venues.error;

      const labels: Record<string, string> = {};
      const kindOf: Record<string, string> = {};
      for (const c of categories.data ?? []) {
        labels[c.slug] = c.label;
        kindOf[c.slug] = c.kind;
      }
      for (const p of places.data ?? []) labels[p.slug] = p.label;

      // Grouped once here rather than filtered per shelf while rendering.
      const members: Record<string, string[]> = {};
      for (const row of collectionMembers.data ?? []) {
        (members[row.collection_slug] ??= []).push(row.venue_id);
      }

      return {
        venues: (venues.data ?? []) as Listing[],
        labels,
        kindOf,
        collections: (collectionList.data ?? []) as Collection[],
        members,
      };
    },
  });

  const venues = listings.data?.venues ?? [];
  const labels = listings.data?.labels ?? {};
  const kindOf = listings.data?.kindOf ?? {};
  const byId = new Map(venues.map((v) => [v.id, v]));

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

  return (
    <View className="flex-1 bg-paper dark:bg-ink">
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerClassName={`gap-10 pb-16 ${COLUMN}`}
        >
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

          {(listings.data?.collections ?? []).map((shelf) => {
            /*
             * A shelf is whatever ops put in it, minus the opener.
             *
             * `members` holds ids in the order ops chose; they are looked up
             * rather than filtered so that order survives. A venue that has
             * been unpublished since it was added to a collection simply is
             * not in `byId`, so it drops out here rather than rendering as a
             * gap — which is also what stops a collection outliving its
             * contents.
             */
            const items = (listings.data?.members[shelf.slug] ?? [])
              .filter((id) => id !== lead?.id)
              .map((id) => byId.get(id))
              .filter((v): v is Listing => v !== undefined)
              .slice(0, SHELF_LIMIT);

            if (items.length === 0) return null;

            return (
              <View key={shelf.slug} className="gap-4">
                <View className="gap-1.5 px-7">
                  <Meta>{shelf.title}</Meta>
                  {shelf.blurb ? <Muted>{shelf.blurb}</Muted> : null}
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
