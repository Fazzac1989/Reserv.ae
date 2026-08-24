import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Body, Caption, Title } from './ui/text';
import type { Reservation } from '../lib/agent';

/**
 * A reservation, as the user sees it.
 *
 * The status line is the important part. Only `confirmed` and `reminded` mean
 * the venue has actually agreed — everything before that is us still working,
 * and the card says so in plain words rather than showing a green tick and
 * hoping.
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
  settled: 'text-ink dark:text-paper',
  working: 'text-bronze',
  attention: 'text-danger',
  closed: 'text-ink-faint',
};

export function ReservationCard({
  reservation,
  onCancel,
  onAddToCalendar,
  onRate,
  busy,
}: {
  reservation: Reservation;
  onCancel: () => void;
  onAddToCalendar: () => void;
  onRate: (rating: number) => void;
  busy: boolean;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const status = statusCopy(reservation);
  const when = new Date(reservation.scheduled_for);
  const isSettled = ['confirmed', 'reminded'].includes(reservation.status);
  const isOver = Date.parse(reservation.scheduled_for) < Date.now();
  const cancellable = !['cancelled', 'failed', 'completed'].includes(reservation.status) && !isOver;

  return (
    <View className="gap-3 rounded-2xl border border-paper-line bg-paper-raised p-5 dark:border-night-line dark:bg-night-raised">
      <View className="gap-1">
        <Title>{reservation.venues?.name ?? 'Venue'}</Title>
        <Caption>
          {when.toLocaleString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          · {reservation.party_size === 1 ? 'just you' : `${reservation.party_size} people`}
        </Caption>
      </View>

      <View className="gap-0.5">
        <Body className={`font-medium ${TONE_CLASS[status.tone]}`}>{status.label}</Body>
        {status.detail ? <Caption>{status.detail}</Caption> : null}
      </View>

      {reservation.special_requests ? (
        <View className="rounded-xl bg-paper-sunken px-3 py-2 dark:bg-night">
          <Caption>Passed to the venue: {reservation.special_requests}</Caption>
        </View>
      ) : null}

      {/* Only offer a calendar entry for something that is genuinely happening. */}
      {isSettled && !isOver ? (
        <Pressable
          onPress={onAddToCalendar}
          disabled={busy}
          accessibilityRole="button"
          className="h-11 items-center justify-center rounded-xl border border-paper-line dark:border-night-line"
        >
          <Body className="font-medium text-ink dark:text-paper">
            {reservation.calendar_event_id ? 'In your calendar' : 'Add to calendar'}
          </Body>
        </Pressable>
      ) : null}

      {/*
        The rating prompt. Only for something that actually happened, and only
        once — a second ask is nagging, not learning.
      */}
      {isOver && isSettled && reservation.rated_at === null ? (
        <View className="gap-2 border-t border-paper-line pt-3 dark:border-night-line">
          <Caption>How was it?</Caption>
          <View className="flex-row gap-2">
            {[1, 2, 3, 4, 5].map((score) => (
              <Pressable
                key={score}
                onPress={() => onRate(score)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`${score} out of 5`}
                className="h-11 flex-1 items-center justify-center rounded-xl border border-paper-line dark:border-night-line"
              >
                <Body className="text-ink dark:text-paper">{score}</Body>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {reservation.rated_at !== null ? (
        <Caption className="text-ink-faint">You rated this {reservation.rating}/5.</Caption>
      ) : null}

      {cancellable ? (
        confirmingCancel ? (
          <View className="gap-2 border-t border-paper-line pt-3 dark:border-night-line">
            <Caption>
              {isSettled
                ? 'I will let the venue know. Cancellation terms may apply.'
                : 'Nothing has been asked of the venue yet.'}
            </Caption>
            <View className="flex-row gap-2">
              <Pressable
                onPress={onCancel}
                disabled={busy}
                accessibilityRole="button"
                className="h-11 flex-1 items-center justify-center rounded-xl bg-danger"
              >
                <Body className="font-medium text-paper">Yes, cancel it</Body>
              </Pressable>
              <Pressable
                onPress={() => setConfirmingCancel(false)}
                accessibilityRole="button"
                className="h-11 flex-1 items-center justify-center rounded-xl border border-paper-line dark:border-night-line"
              >
                <Body className="text-ink dark:text-paper">Keep it</Body>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setConfirmingCancel(true)}
            accessibilityRole="button"
            className="items-center py-1"
          >
            <Caption>Cancel this booking</Caption>
          </Pressable>
        )
      ) : null}
    </View>
  );
}
