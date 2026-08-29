/**
 * A place slug. The directory holds more of these than onboarding offers —
 * the list below is curated on purpose, because a neighbourhood without a
 * reason to pick it is a row nobody reads.
 */
type Zone = string;

/**
 * Onboarding vocabulary.
 *
 * These are the options we *offer*. Everything is stored as free text so the
 * Curator can also work with things a user says in chat that never appeared on
 * this list — an allergy we lack a chip for must never be silently dropped.
 */

export const ZONES: { value: Zone; label: string; blurb: string }[] = [
  { value: 'dubai_marina', label: 'Dubai Marina', blurb: 'The walk, Pier 7, the towers' },
  { value: 'jbr', label: 'JBR', blurb: 'The Beach, The Walk' },
  { value: 'bluewaters', label: 'Bluewaters', blurb: 'Ain Dubai, the island' },
];

export const CUISINES = [
  'Italian',
  'Japanese',
  'Sushi',
  'Lebanese',
  'Emirati',
  'Indian',
  'Persian',
  'Turkish',
  'Chinese',
  'Thai',
  'Greek',
  'French',
  'Spanish',
  'Mexican',
  'Seafood',
  'Steakhouse',
  'Modern European',
  'Brunch',
];

export const DIETARY = [
  'Vegetarian',
  'Vegan',
  'Pescatarian',
  'Halal only',
  'Gluten-free',
  'Dairy-free',
  'No pork',
  'No alcohol',
];

export const ALLERGIES = [
  'Nuts',
  'Peanuts',
  'Shellfish',
  'Fish',
  'Eggs',
  'Soy',
  'Sesame',
  'Gluten',
];

export const PRICE_BANDS: { value: number; label: string; blurb: string }[] = [
  { value: 1, label: 'Everyday', blurb: 'Casual, under AED 150 a head' },
  { value: 2, label: 'Comfortable', blurb: 'AED 150–300 a head' },
  { value: 3, label: 'Upmarket', blurb: 'AED 300–600 a head' },
  { value: 4, label: 'Occasion', blurb: 'AED 600+, worth planning around' },
];

export const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 8];
