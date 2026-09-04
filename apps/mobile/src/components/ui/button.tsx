import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';
import { cn } from '../../lib/cn';

/**
 * `commit` is the one that goes to full contrast, and the name is the point:
 * a stray use is visible in the diff rather than only on the screen. Reserve a
 * table, confirm a time. Nothing else.
 *
 * In a palette of three greys, contrast is the scarce thing — scarcer than any
 * hue would be — so it is what the moment of commitment is spent on. Every
 * other control is a hairline or a word.
 */
type Variant = 'commit' | 'primary' | 'quiet';

interface Props extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: Variant;
  loading?: boolean;
  className?: string;
}

const CONTAINER: Record<Variant, string> = {
  // Solid, and the only solid thing on the screen when it appears.
  commit: 'bg-ink dark:bg-paper',
  // Outlined. Present, deliberately quieter than the commitment above it.
  primary: 'border border-grey-line',
  quiet: '',
};

const LABEL: Record<Variant, string> = {
  commit: 'text-paper dark:text-ink',
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
        <ActivityIndicator color={variant === 'commit' ? '#8A8A8E' : '#8A8A8E'} />
      ) : (
        <Text className={cn('font-body-medium text-lead', LABEL[variant])}>{label}</Text>
      )}
    </Pressable>
  );
}
