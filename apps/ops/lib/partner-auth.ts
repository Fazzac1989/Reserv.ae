import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';

export interface PartnerVenue {
  id: string;
  name: string;
  role: 'owner' | 'manager' | 'staff';
}

export interface PartnerUser {
  id: string;
  email: string;
  fullName: string | null;
  venues: PartnerVenue[];
}

/**
 * Gate for every partner page.
 *
 * Membership comes from `venue_members` through RLS, exactly as ops access
 * comes from `user_roles` — not from a claim, not from the email domain, and
 * not from anything the browser sends.
 *
 * `redeem_venue_invites()` runs first, on every request. It is what turns an
 * invitation into membership, and doing it here rather than in the sign-in form
 * means an invited person simply signs in and is already inside: there is no
 * link to click, no second step to get wrong, and no window in which they have
 * an account but not their venue. With no pending invitation it is one indexed
 * lookup that matches nothing.
 */
export const requireVenueMember = cache(async (): Promise<PartnerUser> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/sign-in');

  await supabase.rpc('redeem_venue_invites');

  const { data: memberships, error } = await supabase
    .from('venue_members')
    .select('role, venues(id, name)')
    .order('created_at');

  if (error) throw error;

  const venues: PartnerVenue[] = (memberships ?? [])
    .map((row) => {
      const venue = Array.isArray(row.venues) ? row.venues[0] : row.venues;
      return venue ? { id: venue.id, name: venue.name, role: row.role } : null;
    })
    .filter((v): v is PartnerVenue => v !== null);

  if (venues.length === 0) redirect('/no-access');

  const { data: profile } = await supabase
    .from('users')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? '',
    fullName: profile?.full_name ?? null,
    venues,
  };
});

/**
 * The venue a partner page is about.
 *
 * Most partners will have exactly one. When they have several the choice is a
 * query parameter, and an unrecognised one falls back to the first rather than
 * erroring — the parameter can only ever name a venue they already manage,
 * because the list it is checked against came from their own memberships.
 */
export function selectVenue(partner: PartnerUser, requested?: string): PartnerVenue {
  const match = requested ? partner.venues.find((v) => v.id === requested) : undefined;
  // Non-null: requireVenueMember redirects when the list is empty.
  return match ?? partner.venues[0]!;
}
