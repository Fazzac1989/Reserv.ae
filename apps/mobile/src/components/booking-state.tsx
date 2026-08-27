import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { Body, Meta, Muted, Title } from './ui/text';
import { Rule } from './ui/screen';
import { useMotion } from '../lib/motion';

/**
 * The app working, shown honestly.
 *
 * A concierge ringing a restaurant on your behalf is the moment the promise is
 * either kept or not, and hiding it behind a spinner wastes the only proof the
 * product has. The champagne pulse is one of three uses of the accent: a
 * booking is genuinely at stake while this is on screen.
 */
export function LiveStatus({ label }: { label: string }) {
  const animate = useMotion();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animate) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.25,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, pulse]);

  return (
    <View
      className="flex-row items-center gap-3 rounded-card border border-stone-line px-5 py-4"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <Animated.View className="h-2 w-2 rounded-full bg-champagne" style={{ opacity: pulse }} />
      <Body className="flex-1">{label}</Body>
    </View>
  );
}

/**
 * The moment people screenshot.
 *
 * The one orchestrated animation in the app: the card settles rather than
 * arrives, which is the difference between a receipt and a confirmation.
 */
export function ConfirmationCard({
  venueName,
  when,
  partyLine,
  reference,
  onAddToCalendar,
  onDirections,
}: {
  venueName: string;
  when: string;
  partyLine: string;
  reference?: string | null;
  onAddToCalendar?: () => void;
  onDirections?: () => void;
}) {
  const animate = useMotion();
  const settle = useRef(new Animated.Value(animate ? 0 : 1)).current;

  useEffect(() => {
    if (!animate) return;
    Animated.timing(settle, {
      toValue: 1,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [animate, settle]);

  return (
    <Animated.View
      style={{
        opacity: settle,
        transform: [{ scale: settle.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
      }}
      className="gap-6 rounded-card border border-stone-line bg-porcelain-raised p-7 dark:bg-ink-raised"
    >
      <View className="flex-row items-center gap-2.5">
        {/*
          Moss, not champagne. The commitment already happened; this is its
          quiet aftermath, and the accent has to keep meaning "at stake".
        */}
        <View className="h-1.5 w-1.5 rounded-full bg-moss" />
        <Meta className="text-moss">Confirmed</Meta>
      </View>

      <View className="gap-1.5">
        <Title>{venueName}</Title>
        <Body className="text-stone">
          {when} · {partyLine}
        </Body>
      </View>

      <Rule className="bg-champagne/40" />

      <View className="flex-row gap-7">
        {onAddToCalendar ? (
          <Pressable
            onPress={onAddToCalendar}
            accessibilityRole="button"
            className="min-h-[44px] justify-center"
          >
            <Body>Add to calendar</Body>
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
      </View>

      {reference ? <Meta>{reference}</Meta> : null}
    </Animated.View>
  );
}

/** A booking that did not happen, said without alarm. */
export function DeclinedCard({ venueName, message }: { venueName: string; message: string }) {
  return (
    <View className="gap-2 rounded-card border border-stone-line p-6">
      <Meta className="text-clay">Not available</Meta>
      <Title>{venueName}</Title>
      <Muted>{message}</Muted>
    </View>
  );
}
