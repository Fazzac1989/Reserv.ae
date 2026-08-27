import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';
import { cn } from '../../lib/cn';

/**
 * `commit` is the champagne one, and the name is the point: it is the only
 * variant allowed to wear the accent, so a stray use is visible in the diff
 * rather than only on the screen. Reserve a table, confirm a time. Nothing
 * else.
 */
type Variant = 'commit' | 'primary' | 'quiet';

interface Props extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: Variant;
  loading?: boolean;
  className?: string;
}

const CONTAINER: Record<Variant, string> = {
  commit: 'bg-champagne',
  primary: 'bg-ink dark:bg-porcelain',
  quiet: '',
};

const LABEL: Record<Variant, string> = {
  // Ink on champagne, always. The accent is never a background for light text.
  commit: 'text-ink',
  primary: 'text-porcelain dark:text-ink',
  quiet: 'text-stone',
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
        <ActivityIndicator color={variant === 'primary' ? '#F7F5F1' : '#14161A'} />
      ) : (
        <Text className={cn('font-body-medium text-lead', LABEL[variant])}>{label}</Text>
      )}
    </Pressable>
  );
}
