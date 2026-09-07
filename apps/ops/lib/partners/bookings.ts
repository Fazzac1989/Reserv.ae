import type { Database } from '@reservai/db';
import { createClient } from '../supabase/server';

export type VenueBooking = Database['public']['Views']['venue_bookings']['Row'];

/**
 * A venue's own book, split the way a host actually reads it.
 *
 * Everything comes through the `venue_bookings` view rather than the table, so
 * the column list is enforced in the database rather than by remembering to
 * select carefully here. There is no way to widen it from this file.
 */
export interface VenueBook {
  upcoming: VenueBooking[];
  awaiting: VenueBooking[];
  past: VenueBooking[];
}

/** States where the guest believes they have a table. */
const LIVE = ['confirmed', 'reminded'];

/** States where we have asked the venue and are still waiting. */
const PENDING = ['user_approved', 'attempting', 'pending_venue', 'needs_ops'];

export async function getVenueBook(venueId: string): Promise<VenueBook> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('venue_bookings')
    .select('*')
    .eq('venue_id', venueId)
    .order('scheduled_for', { ascending: true });

  if (error) throw error;

  const rows = data ?? [];
  const now = Date.now();
  const isFuture = (row: VenueBooking) => new Date(row.scheduled_for!).getTime() >= now;

  return {
    upcoming: rows.filter((r) => LIVE.includes(r.status!) && isFuture(r)),
    awaiting: rows.filter((r) => PENDING.includes(r.status!)),
    past: rows
      .filter((r) => !PENDING.includes(r.status!) && !(LIVE.includes(r.status!) && isFuture(r)))
      .reverse(),
  };
}

export type PartnerVenueRow = Pick<
  Database['public']['Tables']['venues']['Row'],
  | 'id'
  | 'name'
  | 'description'
  | 'tags'
  | 'best_times'
  | 'photo_urls'
  | 'address'
  | 'opening_hours'
  | 'onboarding_status'
  | 'vertical'
  | 'zone'
  | 'price_band'
>;

export async function getPartnerVenue(venueId: string): Promise<PartnerVenueRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('venues')
    .select(
      'id, name, description, tags, best_times, photo_urls, address, opening_hours, onboarding_status, vertical, zone, price_band',
    )
    .eq('id', venueId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
