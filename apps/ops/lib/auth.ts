import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';

export interface OpsUser {
  id: string;
  email: string;
  fullName: string | null;
}

/**
 * Gate for every console page.
 *
 * The role comes from `user_roles` via RLS, not from a JWT claim or an email
 * domain — the client cannot influence either the query or the answer.
 *
 * Wrapped in React's `cache` so the layout and the page it renders share one
 * set of queries per request instead of repeating them.
 */
export const requireOps = cache(async (): Promise<OpsUser> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/sign-in');

  const { data: roles, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  if (error) throw error;

  const isOps = (roles ?? []).some((r) => r.role === 'ops' || r.role === 'admin');
  if (!isOps) redirect('/no-access');

  const { data: profile } = await supabase
    .from('users')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? '',
    fullName: profile?.full_name ?? null,
  };
});
