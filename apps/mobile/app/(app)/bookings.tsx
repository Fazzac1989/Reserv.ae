import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenScroll } from '../../src/components/ui/screen';
import { Body, Display, Meta, Muted } from '../../src/components/ui/text';
import { LiveStatus } from '../../src/components/booking-state';
import { ReservationCard } from '../../src/components/reservation-card';
import {
  cancelBooking,
  listReservations,
  rateBooking,
  saveCalendarEventId,
  type Reservation,
} from '../../src/lib/agent';
import { addToCalendar, removeFromCalendar } from '../../src/lib/calendar';

/**
 * A calm list. Upcoming first, past greyed back to stone.
 *
 * No tab bar in v1, so this is reached by one word in the corner of the
 * conversation and left by one word here.
 */
export default function Bookings() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reservations = useQuery({ queryKey: ['reservations'], queryFn: listReservations });

  function refresh() {
    return queryClient.invalidateQueries({ queryKey: ['reservations'] });
  }

  const cancel = useMutation({
    mutationFn: (booking: Reservation) => cancelBooking(booking.id),
    onSuccess: async (result, booking) => {
      // The calendar entry goes with it. A cancelled booking still sitting in
      // someone's calendar is worse than never having added it.
      if (booking.calendar_event_id) {
        await removeFromCalendar(booking.calendar_event_id);
        await saveCalendarEventId(booking.id, null).catch(() => undefined);
      }
      setNotice(result.message);
      setError(null);
      await refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not cancel that.'),
  });

  const calendar = useMutation({
    mutationFn: async (booking: Reservation) => {
      const result = await addToCalendar({
        title: `${booking.venues?.name ?? 'Reservation'} — table for ${booking.party_size}`,
        startsAt: new Date(booking.scheduled_for),
        // Two hours is the assumption the Curator makes for a restaurant; it is
        // a placeholder in a calendar, not a promise to the venue.
        endsAt: new Date(Date.parse(booking.scheduled_for) + 2 * 3600_000),
        location: booking.venues?.address ?? null,
        notes: booking.special_requests,
      });
      if (!result.ok) throw new Error(result.reason);
      await saveCalendarEventId(booking.id, result.eventId);
      return result.message;
    },
    onSuccess: async (message) => {
      // The web build can only hand over a file, so what happened is worth
      // saying accurately rather than assuming an event was written.
      setNotice(message);
      setError(null);
      await refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not add it.'),
  });

  const rate = useMutation({
    mutationFn: (input: { booking: Reservation; rating: number }) =>
      rateBooking(input.booking.id, { rating: input.rating }),
    onSuccess: async () => {
      setNotice('Noted — that helps me pick better next time.');
      setError(null);
      await refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not save that.'),
  });

  const busy = cancel.isPending || calendar.isPending || rate.isPending;
  const upcoming = reservations.data?.upcoming ?? [];
  const past = reservations.data?.past ?? [];
  const nothing = !reservations.isLoading && upcoming.length === 0 && past.length === 0;

  return (
    <ScreenScroll>
      <View className="gap-6">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          className="min-h-[44px] justify-center"
        >
          <Meta>Back</Meta>
        </Pressable>
        <Display>Bookings</Display>
      </View>

      {reservations.isLoading ? <LiveStatus label="Fetching your bookings…" /> : null}

      {reservations.isError ? (
        <Body className="text-clay">
          {reservations.error instanceof Error
            ? reservations.error.message
            : 'Could not load your bookings.'}
        </Body>
      ) : null}

      {notice ? <Muted>{notice}</Muted> : null}
      {error ? <Body className="text-clay">{error}</Body> : null}

      {nothing ? (
        <View className="gap-5">
          <Muted>Nothing booked yet.</Muted>
          <Link href="/" asChild>
            <Pressable accessibilityRole="link" className="min-h-[44px] justify-center">
              <Body>Ask for something</Body>
            </Pressable>
          </Link>
        </View>
      ) : null}

      {upcoming.length > 0 ? (
        <View>
          {upcoming.map((reservation) => (
            <ReservationCard
              key={reservation.id}
              reservation={reservation}
              busy={busy}
              onCancel={() => cancel.mutate(reservation)}
              onAddToCalendar={() => calendar.mutate(reservation)}
              onRate={(rating) => rate.mutate({ booking: reservation, rating })}
            />
          ))}
        </View>
      ) : null}

      {past.length > 0 ? (
        <View className="gap-4">
          <Meta>Earlier</Meta>
          <View>
            {past.map((reservation) => (
              <ReservationCard
                key={reservation.id}
                reservation={reservation}
                past
                busy={busy}
                onCancel={() => cancel.mutate(reservation)}
                onAddToCalendar={() => calendar.mutate(reservation)}
                onRate={(rating) => rate.mutate({ booking: reservation, rating })}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View className="gap-1">
        <Link href="/knows" asChild>
          <Pressable accessibilityRole="link" className="min-h-[44px] justify-center">
            <Meta>What Riva knows</Meta>
          </Pressable>
        </Link>
        <Link href="/profile" asChild>
          <Pressable accessibilityRole="link" className="min-h-[44px] justify-center">
            <Meta>Profile</Meta>
          </Pressable>
        </Link>
      </View>
    </ScreenScroll>
  );
}
