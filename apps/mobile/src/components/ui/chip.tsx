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
 * The workhorse of onboarding, and the time pills on a venue sheet.
 *
 * Selection is a filled surface rather than a tick, so a screenful reads as a
 * pattern at a glance. Deliberately not the commit treatment: choosing a
 * cuisine is not a commitment, and full contrast has to still mean something
 * by the time a real booking is on offer.
 */
export function Chip({ label, selected, onPress, tone = 'default' }: Props) {
  const selectedClass = tone === 'negative' ? 'bg-alert/15' : 'bg-ink dark:bg-paper';

  const selectedLabel = tone === 'negative' ? 'text-alert' : 'text-paper dark:text-ink';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      // 44px minimum touch target, met by the padding rather than a fixed
      // height, so a long label still wraps sensibly.
      className={cn(
        'min-h-[44px] justify-center rounded-input px-4 py-2.5',
        selected ? selectedClass : 'border border-grey-line',
      )}
    >
      <Text className={cn('font-body text-body', selected ? selectedLabel : 'text-grey')}>
        {label}
      </Text>
    </Pressable>
  );
}
