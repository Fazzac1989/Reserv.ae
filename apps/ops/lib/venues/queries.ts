import type { Database } from '@reservai/db';
import { createClient } from '../supabase/server';
import {
  ONBOARDING_STATUSES,
  type Choice,
  type OnboardingStatus,
  type Vertical,
  type Zone,
} from './constants';

export type Venue = Database['public']['Tables']['venues']['Row'];
export type VenueChannel = Database['public']['Tables']['venue_booking_channels']['Row'];
export type VenuePolicy = Database['public']['Tables']['venue_policies']['Row'];
export type VenueContact = Database['public']['Tables']['venue_contacts']['Row'];

export interface VenueFilters {
  q?: string;
  zone?: Zone;
  vertical?: Vertical;
  status?: OnboardingStatus;
  /** Venues whose only reachable channel is manual — the acquisition backlog. */
  needsChannel?: boolean;
}

export interface VenueListRow extends Venue {
  channelCount: number;
  enabledChannelCount: number;
  contactCount: number;
  hasPolicy: boolean;
}

/**
 * Venue list for the CRM table.
 *
 * Counts come back as PostgREST aggregate embeds rather than N+1 queries, and
 * `needsChannel` is applied in TypeScript because it is a property of the
 * embedded rows rather than of the venue itself.
 */
export async function listVenues(filters: VenueFilters = {}): Promise<VenueListRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from('venues')
    .select(
      'id, name, vertical, zone, address, lat, lng, price_band, tags, description, house_note, opening_hours, best_times, photo_urls, onboarding_status, booking_consent_obtained_at, is_demo, created_at, updated_at, venue_booking_channels(id, kind, is_enabled), venue_contacts(id), venue_policies(id)',
    )
    .order('name');

  if (filters.q) {
    // Escape the PostgREST wildcards so a search for "50%" is not a wildcard.
    const term = filters.q.replace(/[%_]/g, (m) => `\\${m}`);
    query = query.ilike('name', `%${term}%`);
  }
  if (filters.zone) query = query.eq('zone', filters.zone);
  if (filters.vertical) query = query.eq('vertical', filters.vertical);
  if (filters.status) query = query.eq('onboarding_status', filters.status);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map((row) => {
    const { venue_booking_channels, venue_contacts, venue_policies, ...venue } = row;
    const channels = venue_booking_channels ?? [];
    return {
      ...venue,
      channelCount: channels.length,
      enabledChannelCount: channels.filter((c) => c.is_enabled).length,
      contactCount: (venue_contacts ?? []).length,
      hasPolicy: Array.isArray(venue_policies)
        ? venue_policies.length > 0
        : venue_policies !== null,
      _kinds: channels.filter((c) => c.is_enabled).map((c) => c.kind),
    };
  });

  const filtered = filters.needsChannel
    ? rows.filter((r) => r._kinds.every((k) => k === 'manual'))
    : rows;

  return filtered.map(({ _kinds: _ignored, ...row }) => row) as VenueListRow[];
}

export async function countByStatus(): Promise<Record<OnboardingStatus, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('venues').select('onboarding_status');
  if (error) throw error;

  const empty = Object.fromEntries(ONBOARDING_STATUSES.map((s) => [s, 0])) as Record<
    OnboardingStatus,
    number
  >;
  for (const row of data ?? []) empty[row.onboarding_status] += 1;
  return empty;
}

export interface VenueDetail {
  venue: Venue;
  channels: VenueChannel[];
  policy: VenuePolicy | null;
  contacts: VenueContact[];
  events: Database['public']['Tables']['events_log']['Row'][];
}

export async function getVenue(id: string): Promise<VenueDetail | null> {
  const supabase = await createClient();

  const { data: venue, error } = await supabase
    .from('venues')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!venue) return null;

  const [channels, policy, contacts, events] = await Promise.all([
    supabase.from('venue_booking_channels').select('*').eq('venue_id', id).order('priority'),
    supabase.from('venue_policies').select('*').eq('venue_id', id).maybeSingle(),
    supabase.from('venue_contacts').select('*').eq('venue_id', id).order('created_at'),
    supabase
      .from('events_log')
      .select('*')
      .eq('entity_type', 'venue')
      .eq('entity_id', id)
      .order('occurred_at', { ascending: false })
      .limit(20),
  ]);

  return {
    venue,
    channels: channels.data ?? [],
    policy: policy.data ?? null,
    contacts: contacts.data ?? [],
    events: events.data ?? [],
  };
}

/**
 * Every category and place, for the forms and filters.
 *
 * Read on each render rather than cached: the console is the thing that adds
 * them, and a dropdown that does not show what you just created is worse than
 * a query.
 */
export async function listChoices(): Promise<{ categories: Choice[]; places: Choice[] }> {
  const supabase = await createClient();

  const [categories, places] = await Promise.all([
    supabase.from('categories').select('slug, label').order('sort_order'),
    // Neighbourhoods only. A venue sits in one; a country is not somewhere you
    // can be told to walk to.
    supabase.from('places').select('slug, label').eq('kind', 'neighbourhood').order('sort_order'),
  ]);

  // Deliberately not thrown. These fill dropdowns; the page's actual job is
  // listing venues, and taking the whole console down because a vocabulary
  // could not be read is out of proportion to what is missing. An empty list
  // shows as an empty select, which is visibly wrong without being fatal.
  if (categories.error || places.error) {
    console.error('Could not read the reference tables', categories.error ?? places.error);
  }

  return { categories: categories.data ?? [], places: places.data ?? [] };
}
