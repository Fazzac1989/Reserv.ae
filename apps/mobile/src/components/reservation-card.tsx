import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Body, Meta, Muted, Title } from './ui/text';
import { Rule } from './ui/screen';
import type { Reservation } from '../lib/agent';

/**
 * A booking, as the user sees it.
 *
 * The status line is the important part. Only `confirmed` and `reminded` mean
 * the venue has actually agreed — everything before that is us still working,
 * and the row says so in plain words rather than showing a tick and hoping.
 *
 * At rest a row is four lines and nothing else. The things one does to a
 * booking — calendar, rating, cancelling — are all rarer than reading it, so
 * they wait behind a tap instead of crowding every row with controls.
 */

interface StatusCopy {
  label: string;
  detail: string;
  tone: 'settled' | 'working' | 'attention' | 'closed';
}

export function statusCopy(reservation: Reservation): StatusCopy {
  switch (reservation.status) {
    case 'confirmed':
    case 'reminded':
      return { label: 'Confirmed', detail: 'The venue has your table.', tone: 'settled' };
    case 'draft':
      return {
        label: 'Not confirmed yet',
        detail: 'Waiting for you to approve it.',
        tone: 'working',
      };
    case 'user_approved':
      return {
        label: 'Arranging',
        detail: 'I am getting in touch with the venue.',
        tone: 'working',
      };
    case 'attempting':
      return { label: 'Arranging', detail: 'Speaking to the venue now.', tone: 'working' };
    case 'pending_venue':
      return {
        label: 'Waiting on the venue',
        detail: 'I have asked and am waiting for them to confirm.',
        tone: 'working',
      };
    case 'escalated':
      return {
        label: 'Taking longer',
        detail: 'Someone is sorting this out by hand. I will update you.',
        tone: 'attention',
      };
    case 'cancelled':
      return { label: 'Cancelled', detail: 'This is no longer booked.', tone: 'closed' };
    case 'failed':
      return {
        label: 'Could not book it',
        detail: 'The venue could not take it. Ask me for somewhere else.',
        tone: 'attention',
      };
    default:
      return { label: 'Done', detail: '', tone: 'closed' };
  }
}

const TONE_CLASS: Record<StatusCopy['tone'], string> = {
  settled: 'text-moss',
  working: 'text-stone',
  attention: 'text-clay',
  closed: 'text-stone',
};

export function ReservationCard({
  reservation,
  onCancel,
  onAddToCalendar,
  onRate,
  busy,
  past = false,
}: {
  reservation: Reservation;
  onCancel: () => void;
  onAddToCalendar: () => void;
  onRate: (rating: number) => void;
  busy: boolean;
  past?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const status = statusCopy(reservation);
  const when = new Date(reservation.scheduled_for);
  const isSettled = ['confirmed', 'reminded'].includes(reservation.status);
  const isOver = Date.parse(reservation.scheduled_for) < Date.now();
  const cancellable = !['cancelled', 'failed', 'completed'].includes(reservation.status) && !isOver;

  return (
    <View className="gap-4 py-5">
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${reservation.venues?.name ?? 'Venue'}, ${status.label}`}
        className="gap-1.5"
      >
        <Meta>
          {when.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Meta>
        <Title className={past ? 'text-stone' : undefined}>
          {reservation.venues?.name ?? 'Venue'}
        </Title>
        <Body className="text-stone">
          {when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} ·{' '}
          {reservation.party_size === 1 ? 'just you' : `table for ${reservation.party_size}`}
        </Body>
        {/*
          A confirmed future booking needs no label — it is simply what a
          booking is. Everything else is a state worth naming.
        */}
        {isSettled && !isOver ? null : (
          <Meta className={`mt-0.5 ${TONE_CLASS[status.tone]}`}>{status.label}</Meta>
        )}
      </Pressable>

      {open ? (
        <View className="gap-4">
          {status.detail ? <Muted>{status.detail}</Muted> : null}

          {reservation.special_requests ? (
            <Muted>Passed to the venue: {reservation.special_requests}</Muted>
          ) : null}

          {/* Only offer a calendar entry for something genuinely happening. */}
          {isSettled && !isOver ? (
            <Pressable
              onPress={onAddToCalendar}
              disabled={busy}
              accessibilityRole="button"
              className="min-h-[44px] justify-center"
            >
              <Body>{reservation.calendar_event_id ? 'In your calendar' : 'Add to calendar'}</Body>
            </Pressable>
          ) : null}

          {/*
            Only for something that actually happened, and only once — a second
            ask is nagging, not learning.
          */}
          {isOver && isSettled && reservation.rated_at === null ? (
            <View className="gap-2.5">
              <Meta>How was it</Meta>
              <View className="flex-row gap-2">
                {[1, 2, 3, 4, 5].map((score) => (
                  <Pressable
                    key={score}
                    onPress={() => onRate(score)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`${score} out of 5`}
                    className="min-h-[44px] flex-1 items-center justify-center rounded-card border border-stone-line"
                  >
                    <Body>{score}</Body>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {reservation.rated_at !== null ? (
            <Muted>You rated this {reservation.rating}/5.</Muted>
          ) : null}

          {cancellable ? (
            confirmingCancel ? (
              <View className="gap-3">
                <Muted>
                  {isSettled
                    ? 'I will let the venue know. Cancellation terms may apply.'
                    : 'Nothing has been asked of the venue yet.'}
                </Muted>
                <View className="flex-row gap-5">
                  <Pressable
                    onPress={onCancel}
                    disabled={busy}
                    accessibilityRole="button"
                    className="min-h-[44px] justify-center"
                  >
                    <Body className="text-clay">Cancel booking</Body>
                  </Pressable>
                  <Pressable
                    onPress={() => setConfirmingCancel(false)}
                    accessibilityRole="button"
                    className="min-h-[44px] justify-center"
                  >
                    <Body>Keep it</Body>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setConfirmingCancel(true)}
                accessibilityRole="button"
                className="min-h-[44px] justify-center"
              >
                <Muted>Cancel this booking</Muted>
              </Pressable>
            )
          ) : null}
        </View>
      ) : null}

      <Rule />
    </View>
  );
}
