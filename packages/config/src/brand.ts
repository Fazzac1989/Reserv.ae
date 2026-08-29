/**
 * Who the assistant is, in one place.
 *
 * The name appears in the system prompt, in the app's copy and in every email
 * a venue receives. Renaming an assistant your users have been talking to for
 * a year is a product decision, not a find-and-replace, so it is a value here
 * rather than a string typed out in forty files.
 *
 * Frozen because the concierge prompt is a cached prefix: a name that could
 * change at runtime would be a name that invalidates the cache.
 */
export const BRAND = Object.freeze({
  /** The company and the app. */
  name: 'Reserv',
  tagline: 'Life, handled.',
  /** The assistant the user actually talks to. */
  assistant: 'Riva',
  /** What the assistant is, said once, for prompts and onboarding. */
  assistantRole: 'personal AI lifestyle assistant',
  /** Where the pilot operates. Used for phrasing, not for filtering. */
  city: 'Dubai',
} as const);

export type Brand = typeof BRAND;
