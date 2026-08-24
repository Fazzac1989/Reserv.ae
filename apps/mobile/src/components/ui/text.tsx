import { Platform, Text as RNText, type TextProps } from 'react-native';
import { cn } from '../../lib/cn';

/**
 * The platform serif for display type. It carries the "quiet luxury" register
 * without shipping a font file, and it is already on the device, so nothing
 * blocks first paint.
 */
const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

export function Display({ className, style, ...props }: TextProps) {
  return (
    <RNText
      style={[{ fontFamily: SERIF }, style]}
      className={cn('text-display text-ink dark:text-paper', className)}
      {...props}
    />
  );
}

export function Title({ className, style, ...props }: TextProps) {
  return (
    <RNText
      style={[{ fontFamily: SERIF }, style]}
      className={cn('text-title text-ink dark:text-paper', className)}
      {...props}
    />
  );
}

export function Body({ className, ...props }: TextProps) {
  return (
    <RNText
      className={cn('text-base leading-6 text-ink-soft dark:text-paper/70', className)}
      {...props}
    />
  );
}

export function Caption({ className, ...props }: TextProps) {
  return (
    <RNText
      className={cn('text-sm leading-5 text-ink-muted dark:text-ink-faint', className)}
      {...props}
    />
  );
}

export function Eyebrow({ className, ...props }: TextProps) {
  return (
    <RNText
      className={cn(
        'text-[11px] uppercase tracking-[3px] text-ink-muted dark:text-ink-faint',
        className,
      )}
      {...props}
    />
  );
}
