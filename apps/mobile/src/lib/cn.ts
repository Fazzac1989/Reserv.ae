/**
 * Join class names.
 *
 * Deliberately not a merge. It used to claim NativeWind resolved conflicting
 * utilities by the order they were written, which is false on web: the class
 * attribute's order is not consulted at all, and two rules of equal specificity
 * are settled by their order in the emitted stylesheet. Components must
 * therefore emit one colour rather than two and hope — see `ui/text.tsx`.
 */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
