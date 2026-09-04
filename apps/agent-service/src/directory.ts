import type { AgentServiceEnv } from '@reservai/config';
import { serviceClient } from './supabase';

/**
 * The places the concierge is allowed to name.
 *
 * Neighbourhoods only: a request for "Dubai" is not something the venue filter
 * can narrow on, and a country is not a place anyone books dinner in. Ops adds
 * a neighbourhood and Suhail understands it on the next cache expiry, which is
 * the point of having moved these out of an enum.
 *
 * Cached because it is read on every message and changes about once a month.
 */

const TTL_MS = 5 * 60 * 1000;

/** The pilot's three, used until the first load succeeds. */
const FALLBACK: [string, ...string[]] = ['dubai_marina', 'jbr', 'bluewaters'];

let cached: { zones: [string, ...string[]]; at: number } | null = null;

export async function bookableZones(env: AgentServiceEnv): Promise<readonly [string, ...string[]]> {
  if (cached !== null && Date.now() - cached.at < TTL_MS) return cached.zones;

  const { data, error } = await serviceClient(env)
    .from('places')
    .select('slug')
    .eq('kind', 'neighbourhood')
    .order('sort_order');

  // A directory lookup failing is not a reason to refuse to talk. The pilot's
  // own zones still resolve, and the alternative is a 500 on "dinner tonight".
  if (error || !data || data.length === 0) return cached?.zones ?? FALLBACK;

  const slugs = data.map((p) => p.slug);
  const zones: [string, ...string[]] = [slugs[0]!, ...slugs.slice(1)];
  cached = { zones, at: Date.now() };
  return zones;
}

/** Test seam. */
export function resetDirectoryCache(): void {
  cached = null;
}
