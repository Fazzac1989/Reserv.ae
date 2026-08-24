import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenScroll } from '../../src/components/ui/screen';
import { Body, Caption, Display, Eyebrow } from '../../src/components/ui/text';
import { ReservationCard } from '../../src/components/reservation-card';
import {
  cancelBooking,
  listReservations,
  rateBooking,
  saveCalendarEventId,
  type Reservation,
} from '../../src/lib/agent';
import { addToCalendar, removeFromCalendar } from '../../src/lib/calendar';

export default function Reservations() {
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
    },
    onSuccess: async () => {
      setNotice('Added to your calendar.');
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

  return (
    <ScreenScroll>
      <View className="gap-3 pt-6">
        <Eyebrow>Your reservations</Eyebrow>
        <Display>What is booked</Display>
      </View>

      {reservations.isLoading ? (
        <View className="items-center py-16">
          <ActivityIndicator />
        </View>
      ) : null}

      {reservations.isError ? (
        <Caption className="text-danger">
          {reservations.error instanceof Error
            ? reservations.error.message
            : 'Could not load your reservations.'}
        </Caption>
      ) : null}

      {notice ? <Caption>{notice}</Caption> : null}
      {error ? <Caption className="text-danger">{error}</Caption> : null}

      {!reservations.isLoading && upcoming.length === 0 && past.length === 0 ? (
        <View className="items-center gap-3 rounded-2xl border border-dashed border-paper-line px-6 py-12 dark:border-night-line">
          <Body className="text-center">Nothing booked yet.</Body>
          <Pressable
            onPress={() => router.push('/(app)/chat')}
            accessibilityRole="button"
            className="h-12 items-center justify-center rounded-xl bg-ink px-6 dark:bg-paper"
          >
            <Body className="font-medium text-paper dark:text-ink">Ask for something</Body>
          </Pressable>
        </View>
      ) : null}

      {upcoming.length > 0 ? (
        <View className="gap-3">
          <Caption>Coming up</Caption>
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
        <View className="gap-3">
          <Caption>Been and gone</Caption>
          {past.map((reservation) => (
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

      <Pressable onPress={() => router.back()} accessibilityRole="button" className="py-2">
        <Caption>Back</Caption>
      </Pressable>
    </ScreenScroll>
  );
}
