import { View } from 'react-native';

/**
 * Segmented rather than a continuous bar: the user can see how many questions
 * remain, which is the thing that actually reduces drop-off.
 */
export function StepProgress({ total, current }: { total: number; current: number }) {
  return (
    <View
      className="flex-row gap-1.5"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: current + 1 }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          className={i <= current ? 'h-px flex-1 bg-ink dark:bg-paper' : 'h-px flex-1 bg-grey-line'}
        />
      ))}
    </View>
  );
}
