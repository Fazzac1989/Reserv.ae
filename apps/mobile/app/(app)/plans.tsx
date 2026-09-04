import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Rule, ScreenScroll } from '../../src/components/ui/screen';
import { Button } from '../../src/components/ui/button';
import { TextField } from '../../src/components/ui/field';
import { Body, Display, Lead, Meta, Muted, Title } from '../../src/components/ui/text';
import { LiveStatus } from '../../src/components/booking-state';
import { ReservationCard } from '../../src/components/reservation-card';
import { addToCalendar, removeFromCalendar } from '../../src/lib/calendar';
import { cancelBooking, rateBooking, saveCalendarEventId } from '../../src/lib/agent';
import {
  useAddToPlan,
  useArchivePlan,
  useCreatePlan,
  useLooseBookings,
  usePlans,
  type Plan,
} from '../../src/lib/plans';
import type { Reservation } from '../../src/lib/agent';

/**
 * What is arranged, and what it is for.
 *
 * Most bookings never need a plan — dinner tonight is a complete outcome on
 * its own, and wrapping it in a plan called "Dinner tonight" is ceremony. A
 * plan earns its place when something genuinely has parts: a trip, a birthday,
 * a weekend with three things in it that fail independently.
 */

function dateRange(plan: Plan): string | null {
  if (!plan.starts_on) return null;
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  const start = new Date(plan.starts_on).toLocaleDateString('en-GB', opts);
  if (!plan.ends_on || plan.ends_on === plan.starts_on) return start;
  return `${start} – ${new Date(plan.ends_on).toLocaleDateString('en-GB', opts)}`;
}

export default function Plans() {
  const router = useRouter();
  const plans = usePlans();
  const loose = useLooseBookings();
  const createPlan = useCreatePlan();
  const addToPlan = useAddToPlan();
  const archive = useArchivePlan();

  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [naming, setNaming] = useState(false);
  const [assigning, setAssigning] = useState<Reservation | null>(null);

  function refresh() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['loose-bookings'] }),
      queryClient.invalidateQueries({ queryKey: ['reservations'] }),
    ]);
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
        endsAt: new Date(Date.parse(booking.scheduled_for) + 2 * 3600_000),
        location: booking.venues?.address ?? null,
        notes: booking.special_requests,
      });
      if (!result.ok) throw new Error(result.reason);
      await saveCalendarEventId(booking.id, result.eventId);
      return result.message;
    },
    onSuccess: async (message) => {
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
  const all = plans.data ?? [];
  const bookings = loose.data ?? [];
  const nothing = !plans.isLoading && !loose.isLoading && all.length === 0 && bookings.length === 0;

  return (
    <ScreenScroll>
      <View className="gap-4 pt-4">
        <Display>Plans</Display>
        <Lead className="text-stone">Everything arranged, and what it is for.</Lead>
      </View>

      {plans.isLoading || loose.isLoading ? <LiveStatus label="Looking…" /> : null}
      {notice ? <Muted>{notice}</Muted> : null}
      {error ? <Body className="text-clay">{error}</Body> : null}

      {nothing ? (
        <Muted>
          Nothing arranged yet. Ask Suhail for something and it will appear here — a plan is for
          when one occasion needs several bookings.
        </Muted>
      ) : null}

      {all.map((plan) => (
        <View key={plan.id} className="gap-3">
          <View className="gap-1">
            <Title>{plan.title}</Title>
            {dateRange(plan) ? <Meta>{dateRange(plan)}</Meta> : null}
          </View>

          {plan.plan_items.length === 0 ? (
            <Muted>Nothing in it yet.</Muted>
          ) : (
            plan.plan_items.map((item) => (
              <Body key={item.id} className="text-stone">
                {item.title}
              </Body>
            ))
          )}

          <Pressable
            onPress={() => archive.mutate(plan.id)}
            disabled={archive.isPending}
            accessibilityRole="button"
            className="min-h-[44px] justify-center"
          >
            <Muted>Archive this plan</Muted>
          </Pressable>
          <Rule />
        </View>
      ))}

      {bookings.length > 0 ? (
        <View className="gap-2">
          <Meta>{all.length > 0 ? 'Not in a plan' : 'Booked'}</Meta>
          {bookings.map((booking) => (
            <View key={booking.id}>
              <ReservationCard
                reservation={booking}
                busy={busy}
                onCancel={() => cancel.mutate(booking)}
                onAddToCalendar={() => calendar.mutate(booking)}
                onRate={(rating) => rate.mutate({ booking, rating })}
              />
              {all.length > 0 ? (
                assigning?.id === booking.id ? (
                  <View className="gap-2 pb-4">
                    <Meta>Add to</Meta>
                    {all.map((plan) => (
                      <Pressable
                        key={plan.id}
                        onPress={() => {
                          addToPlan.mutate({ planId: plan.id, booking });
                          setAssigning(null);
                        }}
                        accessibilityRole="button"
                        className="min-h-[44px] justify-center"
                      >
                        <Body>{plan.title}</Body>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setAssigning(booking)}
                    accessibilityRole="button"
                    className="min-h-[44px] justify-center pb-4"
                  >
                    <Muted>Add to a plan</Muted>
                  </Pressable>
                )
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {naming ? (
        <View className="gap-3">
          <TextField
            label="What is it for"
            value={title}
            onChangeText={setTitle}
            placeholder="Joanna's birthday"
          />
          <View className="flex-row gap-2.5">
            <Button
              label="Create"
              className="flex-1"
              disabled={title.trim().length === 0}
              loading={createPlan.isPending}
              onPress={() =>
                createPlan.mutate(title, {
                  onSuccess: () => {
                    setTitle('');
                    setNaming(false);
                  },
                })
              }
            />
            <Button
              label="Cancel"
              variant="quiet"
              className="flex-1"
              onPress={() => setNaming(false)}
            />
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setNaming(true)}
          accessibilityRole="button"
          className="min-h-[44px] justify-center"
        >
          <Body>Start a plan</Body>
        </Pressable>
      )}

      <Pressable
        onPress={() => router.push('/suhail')}
        accessibilityRole="button"
        className="min-h-[44px] justify-center"
      >
        <Muted>Ask Suhail for something</Muted>
      </Pressable>
    </ScreenScroll>
  );
}
