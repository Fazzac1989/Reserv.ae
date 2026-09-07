import type { Database } from '@reservai/db';
import { createClient } from '../supabase/server';

export type VenueMemberRole = Database['public']['Enums']['venue_member_role'];

export interface VenueMemberRow {
  userId: string;
  email: string;
  fullName: string | null;
  role: VenueMemberRole;
  since: string;
}

export interface VenueInviteRow {
  id: string;
  email: string;
  role: VenueMemberRole;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

/**
 * Who can get into a venue's back office, and who has been asked.
 *
 * The member list joins `users` for a display name, which only resolves for
 * ops: a partner reading its own membership list through the same table sees
 * the rows but not the profiles behind them. That asymmetry is deliberate and
 * this query is only ever called from an ops page.
 */
export async function listVenueAccess(venueId: string): Promise<{
  members: VenueMemberRow[];
  invites: VenueInviteRow[];
}> {
  const supabase = await createClient();

  const [members, invites] = await Promise.all([
    supabase
      .from('venue_members')
      .select('user_id, role, created_at, users(email, full_name)')
      .eq('venue_id', venueId)
      .order('created_at'),
    supabase
      .from('venue_invites')
      .select('id, email, role, created_at, expires_at')
      .eq('venue_id', venueId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false }),
  ]);

  if (members.error) throw members.error;
  if (invites.error) throw invites.error;

  const now = Date.now();

  return {
    members: (members.data ?? []).map((row) => {
      // PostgREST types a to-one embed as possibly-an-array. It is one row.
      const profile = Array.isArray(row.users) ? row.users[0] : row.users;
      return {
        userId: row.user_id,
        email: profile?.email ?? 'unknown',
        fullName: profile?.full_name ?? null,
        role: row.role,
        since: row.created_at,
      };
    }),
    invites: (invites.data ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      expired: new Date(row.expires_at).getTime() < now,
    })),
  };
}
