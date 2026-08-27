import { useEffect, useRef } from 'react';
import { Animated, Easing, ImageBackground, Pressable, View } from 'react-native';
import { Body, Display, Meta, Muted } from './ui/text';
import { useMotion } from '../lib/motion';
import { share } from '../lib/share';
import type { Reservation } from '../lib/agent';

/**
 * The moment the product exists for.
 *
 * Anything can suggest a restaurant. What nobody else does is ring one on your
 * behalf and come back with a table, so this is the one screen built to be
 * shown to someone else — and the one place the design stops being quiet.
 *
 * Everything on it is evidence rather than decoration: the venue's own
 * photograph, the time they gave, and how long they took to give it. A card
 * that only said "Confirmed" would be a receipt. The gap between asking and
 * being answered is the part that is actually remarkable.
 */

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function dayWord(iso: string): string {
  const when = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (when.toDateString() === today.toDateString()) return 'tonight';
  if (when.toDateString() === tomorrow.toDateString()) return 'tomorrow';
  return when.toLocaleDateString('en-GB', { weekday: 'long' });
}

/**
 * How long the venue took to answer, in the words a person would use.
 *
 * Under a minute is the number worth printing; past an hour it stops being
 * impressive and starts being a wait, so it is not dwelt on.
 */
export function turnaround(reservation: Reservation): string | null {
  if (!reservation.confirmed_at) return null;
  const ms = Date.parse(reservation.confirmed_at) - Date.parse(reservation.created_at);
  if (!Number.isFinite(ms) || ms < 0) return null;

  const seconds = Math.round(ms / 1000);
  if (seconds < 90) return `Asked and answered in ${seconds} seconds.`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60)
    return `Asked at ${clock(reservation.created_at)}. Answered ${minutes} minutes later.`;
  return `Asked at ${clock(reservation.created_at)}, confirmed at ${clock(reservation.confirmed_at)}.`;
}

export function Confirmation({
  reservation,
  onAddToCalendar,
  onDirections,
}: {
  reservation: Reservation;
  onAddToCalendar?: () => void;
  onDirections?: () => void;
}) {
  const animate = useMotion();
  const settle = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const photo = reservation.venues?.photo_urls?.[0];
  const name = reservation.venues?.name ?? 'Your table';
  const story = turnaround(reservation);

  useEffect(() => {
    if (!animate) return;
    Animated.timing(settle, {
      toValue: 1,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [animate, settle]);

  const headline = (
    <>
      {/*
        Champagne, and one of only three places it appears. A table that has
        actually been given is the thing the accent was reserved for.
      */}
      <Meta className="text-champagne">
        Confirmed · {clock(reservation.scheduled_for)} {dayWord(reservation.scheduled_for)}
      </Meta>
      <Display className={photo ? 'mt-2 text-porcelain' : 'mt-2'}>{name}</Display>
      <Body className={photo ? 'mt-1 text-porcelain/75' : 'mt-1 text-stone'}>
        {reservation.party_size === 1 ? 'A table for you' : `Table for ${reservation.party_size}`}
      </Body>
    </>
  );

  return (
    <Animated.View
      style={{
        opacity: settle,
        transform: [{ scale: settle.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
      }}
      className="overflow-hidden rounded-card border border-stone-line"
      accessibilityRole="summary"
      accessibilityLabel={`Confirmed at ${clock(reservation.scheduled_for)} ${dayWord(reservation.scheduled_for)}, ${name}`}
    >
      {photo ? (
        <ImageBackground source={{ uri: photo }} className="h-80 justify-end" resizeMode="cover">
          <View className="absolute inset-x-0 bottom-0 h-2/3 bg-ink/25" />
          <View className="absolute inset-x-0 bottom-0 h-1/2 bg-ink/55" />
          <View className="absolute inset-x-0 bottom-0 h-1/3 bg-ink/75" />
          <View className="p-7">{headline}</View>
        </ImageBackground>
      ) : (
        <View className="bg-porcelain-raised p-7 dark:bg-ink-raised">{headline}</View>
      )}

      <View className="gap-5 bg-porcelain-raised p-7 dark:bg-ink-raised">
        {/*
          The proof. Not that a table exists, but that something went and got
          it — which is the whole of what this app claims to do.
        */}
        {story ? <Muted>{story}</Muted> : null}

        <View className="flex-row flex-wrap gap-x-7 gap-y-3">
          {onAddToCalendar ? (
            <Pressable
              onPress={onAddToCalendar}
              accessibilityRole="button"
              className="min-h-[44px] justify-center"
            >
              <Body>{reservation.calendar_event_id ? 'In your calendar' : 'Add to calendar'}</Body>
            </Pressable>
          ) : null}
          {onDirections ? (
            <Pressable
              onPress={onDirections}
              accessibilityRole="button"
              className="min-h-[44px] justify-center"
            >
              <Body>Directions</Body>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() =>
              void share(
                `${clock(reservation.scheduled_for)} ${dayWord(reservation.scheduled_for)} at ${name}. ` +
                  `${reservation.party_size === 1 ? 'A table for me' : `Table for ${reservation.party_size}`}` +
                  `${story ? ` ${story}` : ''}`,
              )
            }
            accessibilityRole="button"
            className="min-h-[44px] justify-center"
          >
            <Body>Share</Body>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}
