import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost';

interface Props extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: Variant;
  loading?: boolean;
  className?: string;
}

const CONTAINER: Record<Variant, string> = {
  primary: 'bg-ink dark:bg-paper',
  secondary: 'border border-paper-line dark:border-night-line',
  ghost: '',
};

const LABEL: Record<Variant, string> = {
  primary: 'text-paper dark:text-ink',
  secondary: 'text-ink dark:text-paper',
  ghost: 'text-ink-muted dark:text-ink-faint',
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
        'h-14 flex-row items-center justify-center rounded-2xl px-6',
        CONTAINER[variant],
        // Dimming rather than greying keeps the shape stable, so the button
        // does not appear to change size as it becomes available.
        inactive && 'opacity-40',
        className,
      )}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#faf9f7' : '#78716c'} />
      ) : (
        <Text className={cn('text-base font-medium', LABEL[variant])}>{label}</Text>
      )}
    </Pressable>
  );
}
