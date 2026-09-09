import { fils, type Money, type PriceSource } from '@reservai/core';
import { supabase } from './supabase';

/**
 * The options for one request, with everything a person needs to choose.
 *
 * One query rather than several: an option is only comparable next to the
 * others, so a screen that loads them one at a time shows a list that
 * rearranges itself while somebody is reading it.
 */

export interface VenueOption {
  id: string;
  rank: number;
  venueId: string;
  name: string;
  slug: string | null;
  photo: string | null;
  neighbourhood: string | null;
  zone: string;
  tags: string[];
  accessibility: string[];
  rationale: string;
  proposedStart: string;
  proposedEnd: string;

  slotIsVerified: boolean;
  availabilityCheckedAt: string | null;

  price: { amount: Money; source: PriceSource } | null;
  priceCheckedAt: string | null;
  deposit: Money | null;
  travelMinutes: number | null;

  requiresDeposit: boolean | null;
  cancellationTerms: string | null;
}

interface Row {
  id: string;
  rank: number;
  venue_id: string;
  rationale: string;
  proposed_starts_at: string;
  proposed_ends_at: string;
  slot_is_verified: boolean;
  availability_checked_at: string | null;
  price_fils: number | null;
  price_source: PriceSource | null;
  price_checked_at: string | null;
  deposit_fils: number | null;
  travel_minutes: number | null;
  venues: {
    name: string;
    slug: string | null;
    photo_urls: string[];
    neighbourhood: string | null;
    zone: string;
    tags: string[];
    accessibility: string[];
  } | null;
}

export async function listOptions(requestId: string): Promise<VenueOption[]> {
  const { data, error } = await supabase
    .from('suggestions')
    .select(
      'id, rank, venue_id, rationale, proposed_starts_at, proposed_ends_at, slot_is_verified, availability_checked_at, price_fils, price_source, price_checked_at, deposit_fils, travel_minutes, venues(name, slug, photo_urls, neighbourhood, zone, tags, accessibility)',
    )
    .eq('request_id', requestId)
    .order('rank', { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as unknown as Row[];
  const venueIds = rows.map((r) => r.venue_id);

  /*
   * Policies in a second query rather than a join.
   *
   * `venue_policies` is a separate table with its own RLS, and PostgREST
   * cannot embed it through `suggestions` without the join being visible to
   * that policy in a way that is fiddly to reason about. Two clear queries
   * beat one clever one where the second is about permissions.
   */
  const policies = venueIds.length
    ? await supabase
        .from('venue_policies')
        .select('venue_id, requires_deposit, cancellation_terms')
        .in('venue_id', venueIds)
    : { data: [], error: null };

  const policyFor = new Map((policies.data ?? []).map((p) => [p.venue_id, p] as const));

  return rows.map((r) => {
    const policy = policyFor.get(r.venue_id);
    return {
      id: r.id,
      rank: r.rank,
      venueId: r.venue_id,
      name: r.venues?.name ?? 'A venue',
      slug: r.venues?.slug ?? null,
      photo: r.venues?.photo_urls?.[0] ?? null,
      neighbourhood: r.venues?.neighbourhood ?? null,
      zone: r.venues?.zone ?? '',
      tags: r.venues?.tags ?? [],
      accessibility: r.venues?.accessibility ?? [],
      rationale: r.rationale,
      proposedStart: r.proposed_starts_at,
      proposedEnd: r.proposed_ends_at,
      slotIsVerified: r.slot_is_verified,
      availabilityCheckedAt: r.availability_checked_at,
      price:
        r.price_fils !== null && r.price_source !== null
          ? { amount: fils(r.price_fils), source: r.price_source }
          : null,
      priceCheckedAt: r.price_checked_at,
      deposit: r.deposit_fils !== null ? fils(r.deposit_fils) : null,
      travelMinutes: r.travel_minutes,
      requiresDeposit: policy?.requires_deposit ?? null,
      cancellationTerms: policy?.cancellation_terms ?? null,
    };
  });
}
