import { Text as RNText, type TextProps } from 'react-native';
import { cn } from '../../lib/cn';

/**
 * The five sizes in DESIGN.md, and nothing between them.
 *
 * Display is Fraunces and body is Inter; the split is what carries the
 * register, so neither face is used for the other's job. Weight never goes
 * past 500 — a heavy serif reads as a headline in a magazine, not as a name
 * spoken quietly.
 */

export function Display({ className, ...props }: TextProps) {
  return (
    <RNText
      className={cn('font-display text-display text-ink dark:text-porcelain', className)}
      {...props}
    />
  );
}

/** Venue names, and the headline on a confirmation. */
export function Title({ className, ...props }: TextProps) {
  return (
    <RNText
      className={cn('font-display text-title text-ink dark:text-porcelain', className)}
      {...props}
    />
  );
}

/** The concierge speaking. */
export function Lead({ className, ...props }: TextProps) {
  return (
    <RNText
      className={cn('font-body text-lead text-ink dark:text-porcelain', className)}
      {...props}
    />
  );
}

export function Body({ className, ...props }: TextProps) {
  return (
    <RNText
      className={cn('font-body text-body text-ink dark:text-porcelain', className)}
      {...props}
    />
  );
}

/** Anything secondary: rationale, helper text, the quieter half of a pair. */
export function Muted({ className, ...props }: TextProps) {
  return <RNText className={cn('font-body text-body text-stone', className)} {...props} />;
}

/**
 * Timestamps, neighbourhoods, booking references.
 *
 * Uppercase and letterspaced so a small size still reads as deliberate rather
 * than as body text that got away.
 */
export function Meta({ className, ...props }: TextProps) {
  return (
    <RNText className={cn('font-body text-meta uppercase text-stone', className)} {...props} />
  );
}
