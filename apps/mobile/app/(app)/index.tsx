import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { BRAND } from '@reservai/config';
import { Rule } from '../../src/components/ui/screen';
import { Body, Display, Lead, Meta, Muted, Title } from '../../src/components/ui/text';
import { Directory } from '../../src/components/directory';
import { listReservations, type Reservation } from '../../src/lib/agent';
import { useProfile } from '../../src/lib/profile';
import { statusCopy } from '../../src/components/reservation-card';

/**
 * Discover, and the first thing anybody sees.
 *
 * This screen used to be Home: a greeting, a place to ask, and what was on
 * today. Discover was a separate tab of shelves. Two tabs, and the top one
 * answered "what is happening" while the one below answered "where should I
 * go" — which is the question people actually open this app with. They are one
 * screen now, in that order: who you are, what you want, what is already
 * arranged, and then somewhere to go.
 *
 * The rule that keeps it calm survives the merge: nothing appears unless it is
 * true. An empty day says the day is empty rather than filling the space with
 * a card inviting you to explore.
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
        <Body className="text-grey">
          {booking.party_size === 1 ? 'Just you' : `Table for ${booking.party_size}`}
        </Body>
        {/*
          A confirmed booking today needs no label. Anything else is a state
          worth naming on the screen someone checks first.
        */}
        {settled ? null : <Meta className="mt-1 text-grey">{status.label}</Meta>}
      </View>
    </View>
  );
}

export default function Discover() {
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

  const header = (
    <View className="gap-8 px-7 pt-4">
      <Display>
        {greeting()}
        {name ? `, ${name}` : ''}
      </Display>

      {/*
        One field doing two jobs, because to the person typing they are the
        same job. "Italian near Downtown" is a search; "somewhere quiet for my
        anniversary" is a question; nobody wants to decide which they are
        about to type before they type it.
      */}
      <View className="gap-3">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          // Short enough to survive a 375px screen, which the longer version
          // did not — it truncated mid-sentence, which is worse than a shorter
          // prompt. It also happens to be the better invitation: a search box
          // asks for a keyword, and this asks for the thing people actually
          // arrive with.
          placeholder="What are you in the mood for?"
          placeholderTextColor="#8A8A8E"
          returnKeyType="search"
          onSubmitEditing={ask}
          accessibilityLabel={`Search restaurants or ask ${BRAND.assistant}`}
          className="rounded-input border border-grey-line px-5 py-4 font-body text-lead text-ink dark:text-paper"
        />
        <Pressable onPress={ask} accessibilityRole="button" className="min-h-[44px] justify-center">
          <Muted>{draft.trim().length > 0 ? 'Ask' : 'Or just start talking'}</Muted>
        </Pressable>
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
        <Lead className="text-grey">
          I could not check your bookings just now. Pull down in a moment.
        </Lead>
      ) : null}

      {later.length > 0 ? (
        <View className="gap-2">
          <Meta>Coming up</Meta>
          <View>
            {later.slice(0, 2).map((booking, i) => (
              <View key={booking.id}>
                <Entry booking={booking} />
                {i < Math.min(later.length, 2) - 1 ? <Rule /> : null}
              </View>
            ))}
          </View>
          <Pressable
            onPress={() => router.push('/plans')}
            accessibilityRole="button"
            className="min-h-[44px] justify-center"
          >
            <Muted>
              {later.length > 2 ? `All ${later.length} in My Plans` : 'Everything in My Plans'}
            </Muted>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <Directory
      header={header}
      onOpen={(listing) =>
        router.push({ pathname: '/suhail', params: { ask: `Tell me about ${listing.name}` } })
      }
    />
  );
}
