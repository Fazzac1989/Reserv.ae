import { ImageBackground, Linking, Pressable, ScrollView, View } from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BRAND } from '@reservai/config';
import { answerVenueQuestion, caveatFor, type VenueQuestion } from '@reservai/core';
import { Body, Display, Lead, Meta, Muted, Title } from '../../../src/components/ui/text';
import { Button } from '../../../src/components/ui/button';
import { Chip } from '../../../src/components/ui/chip';
import { Rule } from '../../../src/components/ui/screen';
import { LiveStatus } from '../../../src/components/booking-state';
import { SaveButton } from '../../../src/components/save-button';
import { BookingSheet } from '../../../src/components/booking-sheet';
import { availabilityLabel, placeLabels, venueBySlugOrId } from '../../../src/lib/venues';
import { supabase } from '../../../src/lib/supabase';
import { useSession } from '../../../src/store/session';
import { rememberIntent } from '../../../src/store/intent';

const BANDS = ['', 'Everyday', 'Comfortable', 'Upmarket', 'Occasion'];

interface Venue {
  id: string;
  slug: string | null;
  name: string;
  vertical: string;
  zone: string;
  neighbourhood: string | null;
  parent_venue: string | null;
  price_band: number;
  avg_spend_aed: number | null;
  tags: string[];
  ambience: string[];
  address: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  house_note: string | null;
  best_times: string[];
  opening_hours: { day: string; opens_at: string; closes_at: string }[] | null;
  photo_urls: string[];
  video_urls: string[];
  dress_code: string | null;
  has_indoor: boolean | null;
  has_outdoor: boolean | null;
  has_view: string | null;
  private_space: boolean | null;
  children_policy: string | null;
  alcohol_policy: string | null;
  smoking_policy: string | null;
  dietary_options: string[];
  accessibility: string[];
  parking: string[];
  verified_at: string | null;
  is_demo: boolean;
}

/** One labelled fact. Renders nothing at all when there is nothing to say. */
function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View className="gap-1.5">
      <Meta>{label}</Meta>
      <Body>{value}</Body>
    </View>
  );
}

/**
 * Questions worth a tap, chosen per venue.
 *
 * Only offered where the answer is genuinely in the record. Asking "is alcohol
 * served?" of a barber is noise, and asking it of a restaurant whose
 * `alcohol_policy` is null invites the assistant to guess at exactly the kind
 * of question it must never guess at.
 */
const QUESTION_LABELS: Record<VenueQuestion, string> = {
  children: 'Is it suitable for children?',
  outdoor: 'Can I sit outside?',
  dress_code: 'What should I wear?',
  dietary: 'Can they do gluten free?',
  alcohol: 'Is alcohol served?',
  parking: 'What is parking like?',
  accessibility: 'Is it step-free?',
  private: 'Is there a private room?',
  view: 'What is the view?',
};

/**
 * Which questions to offer, and in what order.
 *
 * Only the ones the record can actually answer are put first. Offering "is
 * alcohol served?" against a null field invites the assistant to guess at
 * exactly the kind of question it must never guess at — and offering it and
 * then saying "I do not know" wastes the tap. The unanswerable ones are not
 * hidden entirely, because "I will ask them" is a useful answer too; they just
 * do not lead.
 */
function contextualQuestions(v: Venue): VenueQuestion[] {
  const all = Object.keys(QUESTION_LABELS) as VenueQuestion[];
  const answerable = all.filter((q) => answerVenueQuestion(q, v).kind === 'answered');
  const rest = all.filter((q) => answerVenueQuestion(q, v).kind === 'unknown');
  return [...answerable, ...rest].slice(0, 5);
}

/**
 * One venue, readable by anybody.
 *
 * This is the page a link points at, so it has to stand on its own for
 * somebody who has never heard of Reserv: what the place is, what it costs,
 * what the rules are, and one button. Everything above that button is the same
 * whether you are signed in or not.
 *
 * The governing rule is the one the rest of the app follows: nothing appears
 * unless it is true. Every section renders only when it has something in it,
 * so a thin listing reads as a short page rather than a long page full of "not
 * specified" — and where we genuinely do not know, the page says to check with
 * the venue rather than implying an answer.
 */
export default function PublicVenue() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = useSession();
  const [booking, setBooking] = useState(false);
  const [asked, setAsked] = useState<VenueQuestion | null>(null);

  const venue = useQuery({
    queryKey: ['venue', id],
    enabled: Boolean(id),
    queryFn: () => venueBySlugOrId(id) as Promise<Venue | null>,
  });

  const places = useQuery({ queryKey: ['places'], queryFn: placeLabels });
  const v = venue.data;

  const extras = useQuery({
    queryKey: ['venue-extras', v?.id],
    enabled: Boolean(v?.id),
    queryFn: async () => {
      const venueId = v!.id;
      const [offers, menus, policy, similar] = await Promise.all([
        supabase
          .from('venue_offers')
          .select('id, kind, title, description, terms')
          .eq('venue_id', venueId)
          .eq('is_active', true),
        supabase.from('venue_menus').select('id, title, url').eq('venue_id', venueId),
        supabase
          .from('venue_policies')
          .select(
            'min_party_size, max_party_size, cancellation_notice_hours, cancellation_terms, requires_deposit',
          )
          .eq('venue_id', venueId)
          .maybeSingle(),
        // Same kind of place, same area, not this one. Anything cleverer would
        // be a recommendation, and a recommendation needs a reason we can show.
        supabase
          .from('venues')
          .select('id, slug, name, neighbourhood, price_band')
          .eq('vertical', v!.vertical)
          .eq('zone', v!.zone)
          .neq('id', venueId)
          .limit(4),
      ]);
      return {
        offers: offers.data ?? [],
        menus: menus.data ?? [],
        policy: policy.data,
        similar: similar.data ?? [],
      };
    },
  });

  const photo = v?.photo_urls?.[0];
  const where = v
    ? [v.parent_venue, v.neighbourhood ?? places.data?.[v.zone] ?? v.zone].filter(Boolean).join(' · ')
    : '';
  const meta = v ? [where, BANDS[v.price_band]].filter(Boolean).join(' · ') : '';
  const seating = v
    ? [v.has_indoor ? 'Indoor' : null, v.has_outdoor ? 'Outdoor' : null].filter(Boolean).join(' and ')
    : '';

  /*
   * A form, not a conversation.
   *
   * This used to hand "a table at X" to the assistant, which then had to ask
   * for the date, the time and the party size one message at a time. Somebody
   * who has already decided where they are going does not want an interview —
   * they want to say when, and be done. The assistant is still the right way
   * in when the question is which venue; it is the wrong way to fill in four
   * known fields.
   */
  function book() {
    if (!v) return;
    if (session) {
      setBooking(true);
      return;
    }
    rememberIntent(v.id, v.name);
    router.push('/(auth)/sign-in');
  }

  /*
   * Answered here, from the record, rather than handed to the assistant.
   *
   * "Is it suitable for children?" is not a question of judgement — either the
   * field says something or it does not. Sending it to a model would be asking
   * for a confident sentence about a venue nobody has checked, which is the
   * one failure this product cannot afford. It is also slower, and the answer
   * is already on the screen above.
   */

  return (
    <View className="flex-1 bg-paper dark:bg-ink">
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-8">
          <View className="flex-row items-center justify-between px-7 pb-2 pt-4">
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              className="min-h-[44px] justify-center"
            >
              <Meta>Back</Meta>
            </Pressable>
            {v ? <SaveButton venueId={v.id} venueName={v.name} /> : null}
          </View>

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

              {v.photo_urls.length > 1 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="gap-3 px-7 pt-3"
                >
                  {v.photo_urls.slice(1).map((url) => (
                    <ImageBackground
                      key={url}
                      source={{ uri: url }}
                      style={{ width: 200, height: 130, backgroundColor: '#0B0B0C' }}
                      className="overflow-hidden rounded-card"
                      resizeMode="cover"
                    />
                  ))}
                </ScrollView>
              ) : null}

              <View className="gap-7 px-7 pt-8">
                {v.house_note ?? v.description ? (
                  <Lead>{v.house_note ?? v.description}</Lead>
                ) : null}

                {v.tags.length > 0 ? <Meta>{v.tags.slice(0, 3).join(' · ')}</Meta> : null}

                {v.avg_spend_aed ? (
                  <Fact label="Typical spend" value={`AED ${v.avg_spend_aed} per person`} />
                ) : null}

                {extras.data?.offers.length ? (
                  <View className="gap-3">
                    <Meta>Offers</Meta>
                    {extras.data.offers.map((o) => (
                      <View key={o.id} className="gap-1">
                        <Body className="font-body-medium">{o.title}</Body>
                        {o.description ? <Muted>{o.description}</Muted> : null}
                        {o.terms ? <Muted>{o.terms}</Muted> : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                {extras.data?.menus.length ? (
                  <View className="gap-3">
                    <Meta>Menus</Meta>
                    {extras.data.menus.map((m) => (
                      <Pressable
                        key={m.id}
                        onPress={() => m.url && void Linking.openURL(m.url)}
                        accessibilityRole="link"
                        className="min-h-[44px] justify-center"
                      >
                        <Body className="font-body-medium">{m.title}</Body>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                <Rule />

                <Fact label="Where" value={v.address} />
                {v.address ? (
                  <Pressable
                    onPress={() =>
                      void Linking.openURL(
                        v.lat && v.lng
                          ? `https://maps.google.com/?q=${v.lat},${v.lng}`
                          : `https://maps.google.com/?q=${encodeURIComponent(`${v.name} ${v.address}`)}`,
                      )
                    }
                    accessibilityRole="link"
                    className="min-h-[44px] justify-center"
                  >
                    <Body className="font-body-medium">Directions</Body>
                  </Pressable>
                ) : null}

                {v.opening_hours?.length ? (
                  <Fact
                    label="Open"
                    value={`${v.opening_hours[0]!.opens_at} – ${v.opening_hours[0]!.closes_at}, every day`}
                  />
                ) : null}

                {v.best_times.length > 0 ? (
                  <Fact label="Best times" value={v.best_times.join(' · ')} />
                ) : null}

                <Rule />

                <Fact label="Seating" value={seating || null} />
                <Fact label="View" value={v.has_view} />
                {v.private_space ? (
                  <Fact label="Private dining" value="Available on request" />
                ) : null}
                <Fact label="Atmosphere" value={v.ambience.join(' · ') || null} />
                <Fact label="Dress code" value={v.dress_code} />
                <Fact label="Children" value={v.children_policy} />
                <Fact label="Alcohol" value={v.alcohol_policy} />
                <Fact label="Smoking" value={v.smoking_policy} />
                <Fact label="Dietary" value={v.dietary_options.join(' · ') || null} />
                <Fact label="Accessibility" value={v.accessibility.join(' · ') || null} />
                <Fact label="Parking" value={v.parking.join(' · ') || null} />

                {extras.data?.policy ? (
                  <>
                    <Fact
                      label="Party size"
                      value={`${extras.data.policy.min_party_size} to ${extras.data.policy.max_party_size} guests`}
                    />
                    <Fact label="Cancellation" value={extras.data.policy.cancellation_terms} />
                    {extras.data.policy.requires_deposit ? (
                      <Fact
                        label="Deposit"
                        value={`A deposit is required. ${BRAND.name} will always ask you before agreeing to one.`}
                      />
                    ) : null}
                  </>
                ) : null}

                {/*
                  Said once, plainly. Every field above came from our record
                  rather than from the venue's own mouth, and a listing nobody
                  has checked should not read with the authority of one
                  somebody has.
                */}
                {v.verified_at ? (
                  <Muted>
                    Checked with the venue on{' '}
                    {new Date(v.verified_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    .
                  </Muted>
                ) : (
                  <Muted>
                    Not yet confirmed with the venue. {BRAND.name} will check anything that matters
                    when it books — ask if something here needs to be certain.
                  </Muted>
                )}

                <Rule />

                <View className="gap-3">
                  <Meta>Ask {BRAND.name}</Meta>
                  <View className="flex-row flex-wrap gap-2">
                    {contextualQuestions(v).map((q) => (
                      <Chip
                        key={q}
                        label={QUESTION_LABELS[q]}
                        selected={asked === q}
                        onPress={() => setAsked(asked === q ? null : q)}
                      />
                    ))}
                  </View>

                  {asked ? (
                    <View className="gap-2 rounded-card border border-grey-line p-5">
                      <Body>{answerVenueQuestion(asked, v).text}</Body>
                      {caveatFor(answerVenueQuestion(asked, v)) ? (
                        <Muted>{caveatFor(answerVenueQuestion(asked, v))}</Muted>
                      ) : null}
                    </View>
                  ) : null}
                </View>

                <Rule />

                <View className="gap-3">
                  <Meta>{availabilityLabel('on_request')}</Meta>
                  <Button
                    variant="commit"
                    label={v.vertical === 'restaurant' ? 'Book a table' : 'Book an appointment'}
                    onPress={book}
                  />
                </View>

                {!session ? (
                  <Muted>
                    {BRAND.name} books this for you. I will ask for your name and an email — the
                    name because the venue needs one, the email so you can be told when it is
                    confirmed.
                  </Muted>
                ) : null}

                {v.is_demo ? (
                  <Muted>
                    This is a sample listing while {BRAND.name} onboards real venues. Nothing here
                    will be booked.
                  </Muted>
                ) : null}

                {extras.data?.similar.length ? (
                  <>
                    <Rule />
                    <View className="gap-3">
                      <Meta>Nearby</Meta>
                      {extras.data.similar.map((s) => (
                        <Pressable
                          key={s.id}
                          onPress={() => router.push(`/venue/${s.slug ?? s.id}`)}
                          accessibilityRole="button"
                          className="min-h-[44px] justify-center"
                        >
                          <Body className="font-body-medium">{s.name}</Body>
                          <Muted>
                            {[s.neighbourhood, BANDS[s.price_band]].filter(Boolean).join(' · ')}
                          </Muted>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}
              </View>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      {booking && v ? (
        <BookingSheet
          venueId={v.id}
          venueName={v.name}
          vertical={v.vertical}
          onClose={() => setBooking(false)}
          onBooked={(bookingId) => {
            setBooking(false);
            router.push({ pathname: '/plans', params: { highlight: bookingId } });
          }}
        />
      ) : null}
    </View>
  );
}
