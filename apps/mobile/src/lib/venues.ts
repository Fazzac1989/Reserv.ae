import { supabase } from './supabase';

/**
 * The columns a card or a profile actually renders.
 *
 * Listed rather than `select('*')` for two reasons. An anonymous visitor is
 * granted specific columns and asking for one outside that list fails the
 * whole query rather than omitting a field, so the list here has to stay
 * inside the list in the migration. And a column added to `venues` later
 * should not silently start crossing the wire to every client.
 */
// Written out in full rather than built by concatenation. The Supabase client
// infers the row type from the literal text of this string, and `a + b`
// produces a plain `string`, which collapses the result type to an error type
// and forces a cast at every call site. One long literal keeps the types.
export const VENUE_CARD_COLUMNS =
  'id, slug, name, vertical, zone, neighbourhood, parent_venue, price_band, avg_spend_aed, tags, ambience, house_note, description, photo_urls, has_outdoor, has_view, is_demo' as const;

export const VENUE_PROFILE_COLUMNS =
  'id, slug, name, vertical, zone, neighbourhood, parent_venue, price_band, avg_spend_aed, tags, ambience, house_note, description, photo_urls, has_outdoor, has_view, is_demo, address, lat, lng, opening_hours, best_times, video_urls, dress_code, has_indoor, private_space, children_policy, alcohol_policy, smoking_policy, dietary_options, accessibility, parking, verified_at' as const;

export interface VenueCardData {
  id: string;
  slug: string | null;
  name: string;
  vertical: string;
  zone: string;
  neighbourhood: string | null;
  parent_venue: string | null;
  price_band: number;
  avg_spend_aed: number | null;
  tags: string[];
  ambience: string[];
  house_note: string | null;
  description: string | null;
  photo_urls: string[];
  has_outdoor: boolean | null;
  has_view: string | null;
  is_demo: boolean;
}

export interface VenueFilters {
  /** Free text. Matched against the generated `search_text` column. */
  q?: string;
  vertical?: string;
  zone?: string;
  /** Inclusive band range, 1–4. */
  bandMax?: number;
  outdoor?: boolean;
  view?: boolean;
  dietary?: string;
}

/**
 * One query for the results page.
 *
 * Every filter is applied in the database rather than in the client. Filtering
 * 27 demo venues in JavaScript would work and would stop working at the first
 * real city's worth of them, and the indexes for this exist precisely so it
 * does not have to be rewritten later.
 */
export async function searchVenues(
  filters: VenueFilters,
  limit = 40,
): Promise<VenueCardData[]> {
  let query = supabase.from('venues').select(VENUE_CARD_COLUMNS);

  const q = filters.q?.trim();
  if (q) {
    // websearch syntax so a person can type "sushi difc" and mean both, and
    // quote a phrase if they want one.
    query = query.textSearch('search_text', q, { type: 'websearch', config: 'simple' });
  }
  if (filters.vertical) query = query.eq('vertical', filters.vertical);
  if (filters.zone) query = query.eq('zone', filters.zone);
  if (filters.bandMax) query = query.lte('price_band', filters.bandMax);
  if (filters.outdoor) query = query.eq('has_outdoor', true);
  if (filters.view) query = query.not('has_view', 'is', null);
  if (filters.dietary) query = query.contains('dietary_options', [filters.dietary]);

  const { data, error } = await query.order('price_band', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as VenueCardData[];
}

export async function venueBySlugOrId(key: string): Promise<Record<string, unknown> | null> {
  // A slug is what links carry; an id is what the app has in hand after a
  // list. Accepting both means one screen serves a shared link and an
  // in-app tap without the caller having to know which it holds.
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);

  const { data, error } = await supabase
    .from('venues')
    .select(VENUE_PROFILE_COLUMNS)
    .eq(looksLikeUuid ? 'id' : 'slug', key)
    .maybeSingle();

  if (error) throw error;
  return data as Record<string, unknown> | null;
}

/** Area slug to label, for anything that renders a zone. */
export async function placeLabels(): Promise<Record<string, string>> {
  const { data } = await supabase.from('places').select('slug, label');
  const labels: Record<string, string> = {};
  for (const p of data ?? []) labels[p.slug] = p.label;
  return labels;
}

/**
 * Compact on purpose.
 *
 * "About AED 620 a head" reads better in a sentence and does not fit on a
 * result card beside a cuisine and a 96px image — it truncated mid-number at
 * 375px, which is worse than terse. "pp" is unambiguous on a price in this
 * market.
 */
export function priceLabel(venue: VenueCardData): string | null {
  if (venue.avg_spend_aed) return `AED ${venue.avg_spend_aed} pp`;
  return null;
}

/**
 * What we may honestly say about getting a table.
 *
 * Nothing in this product currently reads live availability — no venue has a
 * reservation API connected — so the only truthful label is that we will ask.
 * The other states in the brief exist in the type because they are real states
 * a rail can report, and each will be returned by the availability check when
 * there is one to return it. Inventing "Available tonight" from an opening
 * time would be the one lie the product cannot afford.
 */
export type Availability =
  | 'available'
  | 'limited'
  | 'on_request'
  | 'checking'
  | 'unavailable';

export function availabilityLabel(state: Availability): string {
  switch (state) {
    case 'available':
      return 'Available';
    case 'limited':
      return 'Limited availability';
    case 'checking':
      return 'Checking availability';
    case 'unavailable':
      return 'Currently unavailable';
    case 'on_request':
    default:
      return 'Available on request';
  }
}
