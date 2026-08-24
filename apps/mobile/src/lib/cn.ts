/**
 * Join class names. NativeWind resolves conflicts at build time by class order,
 * so this stays a plain join rather than a tailwind-merge.
 */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
