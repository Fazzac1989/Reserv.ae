import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { BRAND } from '@reservai/config';
import { Rule, ScreenScroll } from '../../src/components/ui/screen';
import { Body, Display, Lead, Meta, Muted, Title } from '../../src/components/ui/text';
import { listReservations, type Reservation } from '../../src/lib/agent';
import { useProfile } from '../../src/lib/profile';
import { statusCopy } from '../../src/components/reservation-card';

/**
 * The first thing, and deliberately not a dashboard.
 *
 * Four things at most: who you are, somewhere to say what you want, what is
 * happening today, and — only when there is genuinely something — what Suhail
 * thinks you might want next. Everything else in this product is one tap away
 * and does not need a tile here advertising it.
 *
 * The rule that keeps it calm: nothing appears unless it is true. An empty day
 * says the day is empty. It does not fill the space with a card inviting you
 * to explore, which is what a screen does when it has been designed to look
 * busy rather than to be read.
 */

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

function Entry({ booking }: { booking: Reservation }) {
  const status = statusCopy(booking);
  const settled = ['confirmed', 'reminded'].includes(booking.status);

  return (
    <View className="flex-row gap-5 py-4">
      <Meta className="w-14 pt-1.5">{clock(booking.scheduled_for)}</Meta>
      <View className="flex-1 gap-0.5">
        <Title>{booking.venues?.name ?? 'Reservation'}</Title>
        <Body className="text-stone">
          {booking.party_size === 1 ? 'Just you' : `Table for ${booking.party_size}`}
        </Body>
        {/*
          A confirmed booking today needs no label. Anything else is a state
          worth naming on the screen someone checks first.
        */}
        {settled ? null : <Meta className="mt-1 text-stone">{status.label}</Meta>}
      </View>
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const profile = useProfile();
  const [draft, setDraft] = useState('');

  const reservations = useQuery({ queryKey: ['reservations'], queryFn: listReservations });

  const name = firstName(profile.data?.full_name ?? null);
  const today = (reservations.data?.upcoming ?? []).filter((b) => isToday(b.scheduled_for));
  const later = (reservations.data?.upcoming ?? []).filter((b) => !isToday(b.scheduled_for));

  function ask() {
    const text = draft.trim();
    if (text.length === 0) {
      router.push('/suhail');
      return;
    }
    // Handed over rather than answered here. One conversation, one place.
    router.push({ pathname: '/suhail', params: { ask: text } });
    setDraft('');
  }

  return (
    <ScreenScroll>
      <View className="gap-7 pt-4">
        <Display>
          {greeting()}
          {name ? `, ${name}` : ''}
        </Display>

        <View className="gap-3">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={`Ask ${BRAND.assistant} anything…`}
            placeholderTextColor="#8A8D93"
            returnKeyType="send"
            onSubmitEditing={ask}
            className="rounded-input border border-stone-line px-5 py-4 font-body text-lead text-ink dark:text-porcelain"
          />
          <Pressable
            onPress={ask}
            accessibilityRole="button"
            className="min-h-[44px] justify-center"
          >
            <Muted>{draft.trim().length > 0 ? 'Ask' : 'Or just start talking'}</Muted>
          </Pressable>
        </View>
      </View>

      {today.length > 0 ? (
        <View className="gap-2">
          <Meta>Today</Meta>
          <View>
            {today.map((booking, i) => (
              <View key={booking.id}>
                <Entry booking={booking} />
                {i < today.length - 1 ? <Rule /> : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/*
        "Nothing booked" is a statement of fact and must only be made when it
        is one. A failed lookup that renders as an empty day is the app telling
        someone with a table at eight that they have nowhere to be.
      */}
      {reservations.isError ? (
        <Lead className="text-stone">
          I could not check your bookings just now. Pull down in a moment.
        </Lead>
      ) : null}

      {!reservations.isLoading && !reservations.isError && today.length === 0 ? (
        <Lead className="text-stone">
          {later.length > 0
            ? 'Nothing today. Your next booking is further down.'
            : 'Nothing booked. Tell me what you need and I will sort it.'}
        </Lead>
      ) : null}

      {later.length > 0 ? (
        <View className="gap-2">
          <Meta>Coming up</Meta>
          <View>
            {later.slice(0, 3).map((booking, i) => (
              <View key={booking.id}>
                <Entry booking={booking} />
                {i < Math.min(later.length, 3) - 1 ? <Rule /> : null}
              </View>
            ))}
          </View>
          {later.length > 3 ? (
            <Pressable
              onPress={() => router.push('/plans')}
              accessibilityRole="button"
              className="min-h-[44px] justify-center"
            >
              <Muted>All {later.length} in Plans</Muted>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </ScreenScroll>
  );
}
