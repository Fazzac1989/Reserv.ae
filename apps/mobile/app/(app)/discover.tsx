import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable } from 'react-native';
import { ScreenScroll } from '../../src/components/ui/screen';
import { Body, Display, Lead, Meta, Muted, Title } from '../../src/components/ui/text';
import { LiveStatus } from '../../src/components/booking-state';
import { supabase } from '../../src/lib/supabase';

/**
 * The directory, as somewhere to browse rather than a list to search.
 *
 * Deliberately small. A marketplace of thousands is the thing this product is
 * defined against — "less choice, better choice" — so this shows what is
 * genuinely bookable and says how many that is, rather than padding the page
 * to look like a category has depth it does not have yet.
 */

interface Listing {
  id: string;
  name: string;
  vertical: string;
  zone: string;
  price_band: number;
  house_note: string | null;
  photo_urls: string[];
}

export default function Discover() {
  const router = useRouter();

  const listings = useQuery({
    queryKey: ['discover'],
    queryFn: async (): Promise<{ venues: Listing[]; labels: Record<string, string> }> => {
      const [venues, categories, places] = await Promise.all([
        supabase
          .from('venues')
          .select('id, name, vertical, zone, price_band, house_note, photo_urls')
          .eq('onboarding_status', 'live')
          .order('name'),
        supabase.from('categories').select('slug, label'),
        supabase.from('places').select('slug, label'),
      ]);
      if (venues.error) throw venues.error;

      const labels: Record<string, string> = {};
      for (const row of [...(categories.data ?? []), ...(places.data ?? [])]) {
        labels[row.slug] = row.label;
      }
      return { venues: (venues.data ?? []) as Listing[], labels };
    },
  });

  const venues = listings.data?.venues ?? [];
  const labels = listings.data?.labels ?? {};

  return (
    <ScreenScroll>
      <View className="gap-4 pt-4">
        <Display>Discover</Display>
        <Lead className="text-stone">Places Riva can actually get you into.</Lead>
      </View>

      {listings.isLoading ? <LiveStatus label="Looking…" /> : null}

      {listings.isError ? (
        <Body className="text-clay">I could not read the directory just now.</Body>
      ) : null}

      {/*
        Honest about being early. A curated list is a promise about quality; an
        empty one dressed up as curation is a promise about quantity that is
        about to be broken.
      */}
      {!listings.isLoading && venues.length === 0 ? (
        <Muted>
          Nothing here yet. Riva only lists places that have agreed to take bookings, so this fills
          up as they do.
        </Muted>
      ) : null}

      {venues.map((venue) => (
        <Pressable
          key={venue.id}
          onPress={() => router.push({ pathname: '/riva', params: { ask: `Book ${venue.name}` } })}
          accessibilityRole="button"
          className="gap-1.5 py-4"
        >
          <Title>{venue.name}</Title>
          <Meta>
            {[labels[venue.vertical] ?? venue.vertical, labels[venue.zone] ?? venue.zone]
              .filter(Boolean)
              .join(' · ')}
          </Meta>
          {venue.house_note ? <Body className="mt-1 text-stone">{venue.house_note}</Body> : null}
        </Pressable>
      ))}
    </ScreenScroll>
  );
}
