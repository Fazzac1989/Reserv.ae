import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';
import { cn } from '../../lib/cn';

/**
 * `commit` is the one that carries the accent, and the name is the point: a
 * stray use is visible in the diff rather than only on the screen. Reserve a
 * table, confirm a time. Nothing else.
 *
 * The monochrome build spent full contrast here because it had no accent to
 * spend. Terracotta does the same job more warmly, and the discipline is
 * unchanged — this variant, the live indicator and the confirmed line, audited
 * for strays everywhere else. Every other control is still a hairline or a
 * word.
 */
type Variant = 'commit' | 'primary' | 'quiet';

interface Props extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: Variant;
  loading?: boolean;
  className?: string;
}

const CONTAINER: Record<Variant, string> = {
  // Solid, and the only solid colour on the screen when it appears.
  commit: 'bg-accent',
  // Outlined. Present, deliberately quieter than the commitment above it.
  primary: 'border border-grey-line',
  quiet: '',
};

const LABEL: Record<Variant, string> = {
  // White on terracotta in both schemes. The accent does not invert, because a
  // button that changes colour with the system theme stops being the one
  // recognisable thing on the screen.
  commit: 'text-white',
  primary: 'text-ink dark:text-paper',
  quiet: 'text-grey',
};

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  className,
  ...props
}: Props) {
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive), busy: loading }}
      disabled={inactive}
      className={cn(
        'h-14 flex-row items-center justify-center rounded-card px-6',
        CONTAINER[variant],
        // Dimming rather than greying keeps the shape stable, so the button
        // does not appear to change size as it becomes available.
        inactive && 'opacity-40',
        className,
      )}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'commit' ? '#A08A80' : '#A08A80'} />
      ) : (
        <Text className={cn('font-body-medium text-lead', LABEL[variant])}>{label}</Text>
      )}
    </Pressable>
  );
}
