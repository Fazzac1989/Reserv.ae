import { Pressable, Text } from 'react-native';
import { cn } from '../../lib/cn';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Marks a negative choice — "avoid this" rather than "want this". */
  tone?: 'default' | 'negative';
}

/**
 * The workhorse of onboarding. Selection is shown by a filled surface rather
 * than a tick, so a screenful of chips reads as a pattern at a glance.
 */
export function Chip({ label, selected, onPress, tone = 'default' }: Props) {
  const selectedClass =
    tone === 'negative'
      ? 'border-danger bg-danger/10'
      : 'border-ink bg-ink dark:border-paper dark:bg-paper';

  const selectedLabel = tone === 'negative' ? 'text-danger' : 'text-paper dark:text-ink';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      className={cn(
        'rounded-full border px-4 py-2.5',
        selected ? selectedClass : 'border-paper-line dark:border-night-line',
      )}
    >
      <Text
        className={cn('text-[15px]', selected ? selectedLabel : 'text-ink-soft dark:text-paper/70')}
      >
        {label}
      </Text>
    </Pressable>
  );
}
