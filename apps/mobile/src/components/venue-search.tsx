import { useState } from 'react';
import { Image, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { BRAND } from '@reservai/config';
import { Body, Display, Meta, Muted, Title } from './ui/text';
import { Chip } from './ui/chip';
import { LiveStatus } from './booking-state';
import { SaveButton } from './save-button';
import {
  availabilityLabel,
  placeLabels,
  priceLabel,
  searchVenues,
  type VenueCardData,
  type VenueFilters,
} from '../lib/venues';

const BANDS = ['', 'Everyday', 'Comfortable', 'Upmarket', 'Occasion'];

/** The handful worth putting on the results page itself. The rest go in the panel. */
const PRIMARY_ZONES = ['dubai_marina', 'downtown', 'difc', 'jbr', 'palm_jumeirah', 'business_bay'];

function Result({
  venue,
  labels,
  onOpen,
}: {
  venue: VenueCardData;
  labels: Record<string, string>;
  onOpen: () => void;
}) {
  const photo = venue.photo_urls?.[0];
  const where = [venue.parent_venue, venue.neighbourhood ?? labels[venue.zone] ?? venue.zone]
    .filter(Boolean)
    .join(' · ');
  const cuisine = venue.tags?.[0];
  const spend = priceLabel(venue);

  // Two attributes at most. A row of six badges is how a results page stops
  // being readable, and the ones worth having are the ones that change a
  // decision rather than the ones we happen to store.
  const attributes = [
    venue.has_outdoor ? 'Outdoor tables' : null,
    venue.has_view ? `${venue.has_view} view` : null,
  ].filter(Boolean) as string[];

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${venue.name}, ${where}`}
      className="min-h-[44px] flex-row gap-4 py-4"
    >
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={{ width: 96, height: 96, backgroundColor: '#171A16' }}
          className="rounded-card"
          resizeMode="cover"
        />
      ) : (
        // The same reasoning as the text card on Discover: an empty frame with
        // an icon in it looks broken, and a quiet square does not.
        <View className="h-24 w-24 items-center justify-center rounded-card border border-grey-line">
          <Meta>{(BANDS[venue.price_band] ?? '').slice(0, 1)}</Meta>
        </View>
      )}

      <View className="flex-1 gap-1">
        <Title numberOfLines={1}>{venue.name}</Title>
        <Meta numberOfLines={1}>{where}</Meta>
        <Body className="text-grey" numberOfLines={1}>
          {[cuisine, spend].filter(Boolean).join(' · ')}
        </Body>
        {attributes.length > 0 ? (
          <Muted numberOfLines={1}>{attributes.join(' · ')}</Muted>
        ) : null}
        <View className="mt-0.5 flex-row items-center justify-between">
          {/*
            Honest, and the same for every venue until something can actually
            read a diary. "Available on request" is what it is.
          */}
          <Meta>{availabilityLabel('on_request')}</Meta>
          <SaveButton venueId={venue.id} venueName={venue.name} />
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Search and its results, in one screen.
 *
 * The filter state lives in this component and is handed back up on change,
 * so the screen that mounts it can put it in the URL — which is what makes
 * opening a venue and pressing back return you to the same results rather
 * than to an empty box.
 *
 * The primary filters are the three that change an answer most: where, how
 * much, and outside or not. Everything else the brief lists is real and
 * belongs behind "More", because a results page that opens with sixteen
 * controls is a form, not a search.
 */
export function VenueSearch({
  initial,
  onOpen,
  onAsk,
  onFiltersChange,
}: {
  initial: VenueFilters;
  onOpen: (venue: VenueCardData) => void;
  onAsk: (text: string) => void;
  onFiltersChange?: (filters: VenueFilters) => void;
}) {
  const [filters, setFilters] = useState<VenueFilters>(initial);
  const [draft, setDraft] = useState(initial.q ?? '');
  const [showMore, setShowMore] = useState(false);

  function update(next: Partial<VenueFilters>) {
    const merged = { ...filters, ...next };
    setFilters(merged);
    onFiltersChange?.(merged);
  }

  const places = useQuery({ queryKey: ['places'], queryFn: placeLabels });
  const results = useQuery({
    queryKey: ['venue-search', filters],
    queryFn: () => searchVenues(filters),
  });

  const labels = places.data ?? {};
  const venues = results.data ?? [];
  const activeCount = [
    filters.zone,
    filters.bandMax,
    filters.outdoor,
    filters.view,
    filters.dietary,
    filters.vertical,
  ].filter(Boolean).length;

  return (
    <View className="flex-1 bg-paper dark:bg-ink">
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View className="gap-4 px-7 pb-3 pt-4">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => update({ q: draft })}
            placeholder="Restaurant, cuisine, area…"
            placeholderTextColor="#8A8F86"
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search venues"
            className="rounded-input border border-grey-line px-5 py-4 font-body text-lead text-ink dark:text-paper"
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
          >
            {PRIMARY_ZONES.map((zone) => (
              <Chip
                key={zone}
                label={labels[zone] ?? zone}
                selected={filters.zone === zone}
                onPress={() => update({ zone: filters.zone === zone ? undefined : zone })}
              />
            ))}
          </ScrollView>

          <View className="flex-row items-center gap-2">
            <Chip
              label="Outside"
              selected={Boolean(filters.outdoor)}
              onPress={() => update({ outdoor: filters.outdoor ? undefined : true })}
            />
            <Chip
              label="Under 200"
              selected={filters.bandMax === 2}
              onPress={() => update({ bandMax: filters.bandMax === 2 ? undefined : 2 })}
            />
            <Pressable
              onPress={() => setShowMore((s) => !s)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showMore }}
              className="min-h-[44px] justify-center px-1"
            >
              <Meta className={activeCount > 0 ? 'text-ink dark:text-paper' : undefined}>
                {showMore ? 'Less' : activeCount > 0 ? `More · ${activeCount}` : 'More'}
              </Meta>
            </Pressable>
          </View>

          {showMore ? (
            <View className="gap-4 rounded-card border border-grey-line p-5">
              <View className="gap-2">
                <Meta>Looking for</Meta>
                <View className="flex-row flex-wrap gap-2">
                  {['restaurant', 'barber', 'salon'].map((v) => (
                    <Chip
                      key={v}
                      label={v === 'restaurant' ? 'A table' : v === 'barber' ? 'A barber' : 'A salon'}
                      selected={filters.vertical === v}
                      onPress={() => update({ vertical: filters.vertical === v ? undefined : v })}
                    />
                  ))}
                </View>
              </View>

              <View className="gap-2">
                <Meta>Dietary</Meta>
                <View className="flex-row flex-wrap gap-2">
                  {['vegetarian', 'vegan', 'gluten free on request'].map((d) => (
                    <Chip
                      key={d}
                      label={d === 'gluten free on request' ? 'Gluten free' : d}
                      selected={filters.dietary === d}
                      onPress={() => update({ dietary: filters.dietary === d ? undefined : d })}
                    />
                  ))}
                </View>
              </View>

              <View className="gap-2">
                <Meta>Setting</Meta>
                <View className="flex-row flex-wrap gap-2">
                  <Chip
                    label="Has a view"
                    selected={Boolean(filters.view)}
                    onPress={() => update({ view: filters.view ? undefined : true })}
                  />
                </View>
              </View>

              {activeCount > 0 ? (
                <Pressable
                  onPress={() => {
                    const cleared = { q: filters.q };
                    setFilters(cleared);
                    onFiltersChange?.(cleared);
                  }}
                  accessibilityRole="button"
                  className="min-h-[44px] justify-center"
                >
                  <Muted>Clear filters</Muted>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerClassName="px-7 pb-16"
          keyboardShouldPersistTaps="handled"
        >
          {results.isLoading ? <LiveStatus label="Looking…" /> : null}

          {results.isError ? (
            <Body className="text-alert">
              I could not run that search just now. Try again in a moment.
            </Body>
          ) : null}

          {!results.isLoading && !results.isError && venues.length === 0 ? (
            <View className="gap-4 pt-2">
              <Display>Nothing matched</Display>
              <Body className="text-grey">
                {activeCount > 0
                  ? 'Try removing a filter, or describe what you are after and I will look properly.'
                  : `Nothing here matches that. Describe what you are after and ${BRAND.name} will look properly.`}
              </Body>
              <Pressable
                onPress={() => onAsk(draft || (filters.q ?? ''))}
                accessibilityRole="button"
                className="min-h-[44px] justify-center"
              >
                <Body className="font-body-medium">Ask {BRAND.name} instead</Body>
              </Pressable>
            </View>
          ) : null}

          {venues.map((venue, i) => (
            <View key={venue.id}>
              <Result venue={venue} labels={labels} onOpen={() => onOpen(venue)} />
              {i < venues.length - 1 ? <View className="h-px w-full bg-grey-line" /> : null}
            </View>
          ))}

          {venues.length > 0 ? (
            <Pressable
              onPress={() => onAsk(draft || (filters.q ?? ''))}
              accessibilityRole="button"
              className="min-h-[44px] justify-center pt-6"
            >
              <Muted>Not quite it? Ask {BRAND.name}</Muted>
            </Pressable>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
