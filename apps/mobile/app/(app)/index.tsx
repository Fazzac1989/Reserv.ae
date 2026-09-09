import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { BRAND } from '@reservai/config';
import { Rule, ScreenScroll } from '../../src/components/ui/screen';
import { Body, Display, Lead, Meta, Muted, Title } from '../../src/components/ui/text';
import { Chip } from '../../src/components/ui/chip';
import { LiveStatus } from '../../src/components/booking-state';
import { listReservations, type Reservation } from '../../src/lib/agent';
import { useProfile } from '../../src/lib/profile';
import { statusCopy } from '../../src/components/reservation-card';
import { StatusPill, toneForCopy } from '../../src/components/ui/status-pill';

/**
 * Today.
 *
 * The promise is "your plans, taken care of", and this is the screen that has
 * to make that true in the first three seconds. It answers, in order: what is
 * happening today, what needs a decision from you, what is coming, and — only
 * then — somewhere to look if none of that was what you opened the app for.
 *
 * "Needs your decision" sits above everything except today's plans, and that
 * ordering is the whole point. A venue offering a different time is useless
 * information at the bottom of a page. It is the one thing on this screen that
 * is waiting on a person rather than on us.
 *
 * The rule the rest of the app follows holds here too: nothing appears unless
 * it is true. An empty day says the day is empty rather than filling itself
 * with tiles.
 */

/** What the person can do about a booking, when it is their move. */
const DECIDABLE = ['alternative_offered'];

function firstName(full: string | null): string | null {
  if (!full) return null;
  return full.trim().split(/\s+/)[0] ?? null;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * The week, as seven dots.
 *
 * Not a calendar. A calendar is a screen you go to; this is a glance that says
 * "there is something on Thursday" and gets out of the way. Days with nothing
 * on them are drawn anyway, because the shape of an empty week is information.
 */
function WeekStrip({ bookings }: { bookings: Reservation[] }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  return (
    <View className="flex-row justify-between">
      {days.map((d, i) => {
        const has = bookings.some(
          (b) => new Date(b.scheduled_for).toDateString() === d.toDateString(),
        );
        return (
          <View key={d.toISOString()} className="items-center gap-2">
            <Meta className={i === 0 ? 'text-ink dark:text-paper' : undefined}>
              {d.toLocaleDateString('en-GB', { weekday: 'narrow' })}
            </Meta>
            <Body className={i === 0 ? 'font-body-medium' : 'text-grey'}>{d.getDate()}</Body>
            <View
              className={has ? 'h-1.5 w-1.5 rounded-full bg-accent' : 'h-1.5 w-1.5 rounded-full'}
            />
          </View>
        );
      })}
    </View>
  );
}

function Entry({ booking, onPress }: { booking: Reservation; onPress: () => void }) {
  const status = statusCopy(booking);

  /*
   * Every row carries a pill, confirmed ones included.
   *
   * The previous build hid the label on a settled booking, on the reasoning
   * that a confirmed table needs no explanation. That is true when you read
   * the row and false when you scan the screen — and scanning is what this
   * screen is for. A green "Confirmed" beside a table is the reassurance
   * somebody opened the app to get.
   */
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${booking.venues?.name ?? 'Reservation'} at ${clock(booking.scheduled_for)}, ${status.label}`}
      className="min-h-[44px] flex-row gap-5 py-4"
    >
      <Meta className="w-14 pt-1.5">{clock(booking.scheduled_for)}</Meta>
      <View className="flex-1 gap-1.5">
        <Title>{booking.venues?.name ?? 'Reservation'}</Title>
        <Body className="text-grey">
          {booking.party_size === 1 ? 'Just you' : `Table for ${booking.party_size}`}
        </Body>
        <StatusPill tone={toneForCopy(status.tone)} label={status.short} />
      </View>
    </Pressable>
  );
}

export default function Today() {
  const router = useRouter();
  const profile = useProfile();
  const [draft, setDraft] = useState('');

  const reservations = useQuery({ queryKey: ['reservations'], queryFn: listReservations });

  const name = firstName(profile.data?.full_name ?? null);
  const upcoming = reservations.data?.upcoming ?? [];
  const today = upcoming.filter((b) => isToday(b.scheduled_for));
  const later = upcoming.filter((b) => !isToday(b.scheduled_for));
  const decisions = upcoming.filter((b) => DECIDABLE.includes(b.status));

  const nothingAtAll = !reservations.isLoading && !reservations.isError && upcoming.length === 0;

  function ask(text?: string) {
    const message = (text ?? draft).trim();
    router.push(message.length > 0 ? { pathname: '/suhail', params: { ask: message } } : '/suhail');
    setDraft('');
  }

  return (
    <ScreenScroll>
      <View className="flex-row items-start justify-between pt-4">
        <Display className="flex-1">
          {greeting()}
          {name ? `, ${name}` : ''}
        </Display>
        <Pressable
          onPress={() => router.push('/you')}
          accessibilityRole="button"
          accessibilityLabel="Your profile"
          className="min-h-[44px] w-11 items-end justify-center"
        >
          <Feather name="user" size={22} color="#8A8F86" />
        </Pressable>
      </View>

      {/*
        The request field, and the brief's words rather than mine. "What would
        you like me to arrange?" asks for a job; "what are you in the mood for?"
        asks for a preference. This product does the first.
      */}
      <View className="gap-3">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="What would you like me to arrange?"
          placeholderTextColor="#8A8F86"
          returnKeyType="send"
          onSubmitEditing={() => ask()}
          accessibilityLabel={`Ask ${BRAND.name} to arrange something`}
          className="rounded-input border border-grey-line bg-paper-raised px-5 py-4 font-body text-lead text-ink dark:bg-ink-raised dark:text-paper"
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          {['Plan my weekend', 'Book dinner', 'Family visiting'].map((quick) => (
            <Chip key={quick} label={quick} selected={false} onPress={() => ask(quick)} />
          ))}
        </ScrollView>
      </View>

      {reservations.isLoading ? <LiveStatus label="Checking your plans…" /> : null}

      {/*
        "Nothing booked" is a statement of fact and must only be made when it is
        one. A failed lookup rendering as an empty day is the app telling
        somebody with a table at eight that they have nowhere to be.
      */}
      {reservations.isError ? (
        <Lead className="text-grey">
          I could not check your plans just now. Pull down in a moment.
        </Lead>
      ) : null}

      {/*
        Above everything but today itself. A venue offering a different time is
        useless information at the bottom of a page, and it is the only thing
        here waiting on a person rather than on us.
      */}
      {decisions.length > 0 ? (
        <View className="gap-3 rounded-card border border-accent/40 bg-paper-raised p-5 dark:bg-ink-raised">
          <Meta className="text-accent">Needs your decision</Meta>
          {decisions.map((booking) => (
            <Pressable
              key={booking.id}
              onPress={() => router.push('/plans')}
              accessibilityRole="button"
              className="min-h-[44px] justify-center"
            >
              <Body className="font-body-medium">
                {booking.venues?.name ?? 'A booking'} has offered another time
              </Body>
              <Muted>Nothing is held until you say yes.</Muted>
            </Pressable>
          ))}
        </View>
      ) : null}

      {today.length > 0 ? (
        <View className="gap-2">
          <Meta>Today</Meta>
          <View>
            {today.map((booking, i) => (
              <View key={booking.id}>
                <Entry booking={booking} onPress={() => router.push('/plans')} />
                {i < today.length - 1 ? <Rule /> : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {upcoming.length > 0 ? (
        <View className="gap-4">
          <Meta>The week</Meta>
          <WeekStrip bookings={upcoming} />
        </View>
      ) : null}

      {later.length > 0 ? (
        <View className="gap-2">
          <Meta>Coming up</Meta>
          <View>
            {later.slice(0, 3).map((booking, i) => (
              <View key={booking.id}>
                <Entry booking={booking} onPress={() => router.push('/plans')} />
                {i < Math.min(later.length, 3) - 1 ? <Rule /> : null}
              </View>
            ))}
          </View>
          <Pressable
            onPress={() => router.push('/plans')}
            accessibilityRole="button"
            className="min-h-[44px] justify-center"
          >
            <Muted>
              {later.length > 3 ? `All ${later.length} in Plans` : 'Everything in Plans'}
            </Muted>
          </Pressable>
        </View>
      ) : null}

      {/*
        The empty state does something rather than explains something. The
        first request is the only thing that matters on a day with nothing in
        it, so it gets a real action rather than a paragraph about what Reserv
        can do.
      */}
      {nothingAtAll ? (
        <View className="gap-4">
          <Lead className="text-grey">
            Nothing arranged yet. Tell me what you need and I will sort it — a table, an afternoon,
            a weekend with people visiting.
          </Lead>
          <Pressable
            onPress={() => ask('Plan my weekend')}
            accessibilityRole="button"
            className="min-h-[44px] justify-center"
          >
            <Body className="font-body-medium">Start with the weekend</Body>
          </Pressable>
        </View>
      ) : null}

      <Rule />

      <Pressable
        onPress={() => router.push('/discover')}
        accessibilityRole="button"
        className="min-h-[44px] flex-row items-center justify-between"
      >
        <View className="gap-1">
          <Title>Have a look around</Title>
          <Muted>Places {BRAND.name} can actually get you into.</Muted>
        </View>
        <Feather name="chevron-right" size={20} color="#8A8F86" />
      </Pressable>
    </ScreenScroll>
  );
}
