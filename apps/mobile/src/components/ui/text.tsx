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

/**
 * Whether the caller has already chosen a colour.
 *
 * These components used to hardcode one and let callers "override" it by
 * passing another, which is not a thing that works. On web NativeWind compiles
 * to real CSS, and two colour utilities of equal specificity are settled by the
 * order they appear in the stylesheet — not the order they appear in
 * `className`. `.text-grey` happens to be emitted after `.text-accent`, so
 * every accented Meta in the app rendered grey: the tab bar's current tab, the
 * "Needs your decision" heading, the word "Confirmed" beside a booked table.
 *
 * Dropping the default rather than trying to outrank it is the fix. There is no
 * cascade fight to lose if only one colour is ever emitted. A caller who names
 * a colour owns the colour, dark mode included — half an override is worse than
 * none, because it works in one scheme and not the other.
 */
const COLOURED = /(^|\s)(dark:)?text-(ink|paper|grey|accent|pending|alert|white|black)\b/;

function colour(className: string | undefined, fallback: string): string {
  return className && COLOURED.test(className) ? '' : fallback;
}

export function Display({ className, ...props }: TextProps) {
  return (
    <RNText
      className={cn(
        'font-display text-display',
        colour(className, 'text-ink dark:text-paper'),
        className,
      )}
      {...props}
    />
  );
}

/** Venue names, and the headline on a confirmation. */
export function Title({ className, ...props }: TextProps) {
  return (
    <RNText
      className={cn(
        'font-display text-title',
        colour(className, 'text-ink dark:text-paper'),
        className,
      )}
      {...props}
    />
  );
}

/** The concierge speaking. */
export function Lead({ className, ...props }: TextProps) {
  return (
    <RNText
      className={cn(
        'font-body text-lead',
        colour(className, 'text-ink dark:text-paper'),
        className,
      )}
      {...props}
    />
  );
}

export function Body({ className, ...props }: TextProps) {
  return (
    <RNText
      className={cn(
        'font-body text-body',
        colour(className, 'text-ink dark:text-paper'),
        className,
      )}
      {...props}
    />
  );
}

/** Anything secondary: rationale, helper text, the quieter half of a pair. */
export function Muted({ className, ...props }: TextProps) {
  return (
    <RNText
      className={cn('font-body text-body', colour(className, 'text-grey'), className)}
      {...props}
    />
  );
}

/**
 * Timestamps, neighbourhoods, booking references.
 *
 * Uppercase and letterspaced so a small size still reads as deliberate rather
 * than as body text that got away.
 */
export function Meta({ className, ...props }: TextProps) {
  return (
    <RNText
      className={cn('font-body text-meta uppercase', colour(className, 'text-grey'), className)}
      {...props}
    />
  );
}
