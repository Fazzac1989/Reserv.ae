import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Body } from './ui/text';
import { useMotion } from '../lib/motion';

/**
 * The app working, shown honestly.
 *
 * A concierge ringing a restaurant on your behalf is the moment the promise is
 * either kept or not, and hiding it behind a spinner wastes the only proof the
 * product has. The dot is ink on paper and paper on ink — full contrast, the
 * same currency the commit button is paid in, because a booking is genuinely
 * at stake while this is on screen.
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
      className="flex-row items-center gap-3 rounded-card border border-grey-line px-5 py-4"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <Animated.View
        className="h-2 w-2 rounded-full bg-ink dark:bg-paper"
        style={{ opacity: pulse }}
      />
      <Body className="flex-1">{label}</Body>
    </View>
  );
}
