import { createClient } from '../supabase/server';

/**
 * The pilot scorecard.
 *
 * Every number here maps to a target in section 7 of the build plan. Anything
 * that does not answer one of those questions has been left out on purpose — a
 * dashboard nobody acts on is worse than no dashboard.
 */

export interface Funnel {
  requests: number;
  clarified: number;
  suggested: number;
  approved: number;
  confirmed: number;
  completed: number;
  confirmed_of_all: number | null;
  confirmed_of_served: number | null;
}

export interface RailTiming {
  rail: string;
  bookings: number;
  median_minutes: number | null;
  p90_minutes: number | null;
  target_minutes: number;
}

export interface Cohort {
  cohort_week: string;
  users: number;
  returned: number;
  returned_pct: number | null;
}

export interface VenueReliability {
  venue_id: string;
  venue_name: string;
  bookings: number;
  confirmed: number;
  failed: number;
  no_show_at_venue: number;
  median_response_minutes: number | null;
}

export interface OpsEffort {
  week: string;
  bookings: number;
  ops_tasks: number;
  tasks_per_booking: number | null;
  median_open_minutes: number | null;
}

export interface WillingnessToPay {
  price_aed: number;
  asked: number;
  yes: number;
  maybe: number;
  no: number;
  yes_pct: number | null;
  yes_or_maybe_pct: number | null;
}

export interface Scorecard {
  funnel: Funnel;
  timings: RailTiming[];
  cohorts: Cohort[];
  venues: VenueReliability[];
  effort: OpsEffort[];
  pricing: WillingnessToPay;
  liveVenues: number;
  since: string;
}

export async function loadScorecard(days: number): Promise<Scorecard> {
  const supabase = await createClient();
  const from = new Date(Date.now() - days * 86400_000).toISOString();
  const to = new Date(Date.now() + 86400_000).toISOString();

  const [funnel, timings, cohorts, venues, effort, pricing, live] = await Promise.all([
    supabase.rpc('pilot_funnel', { p_from: from, p_to: to }),
    supabase.rpc('time_to_confirmation', { p_from: from, p_to: to }),
    supabase.rpc('retention_cohorts'),
    supabase.rpc('venue_reliability'),
    supabase.rpc('ops_effort', { p_from: from, p_to: to }),
    supabase.rpc('willingness_to_pay', { p_price: 99 }),
    supabase
      .from('venues')
      .select('id', { count: 'exact', head: true })
      .eq('onboarding_status', 'live'),
  ]);

  const emptyFunnel: Funnel = {
    requests: 0,
    clarified: 0,
    suggested: 0,
    approved: 0,
    confirmed: 0,
    completed: 0,
    confirmed_of_all: null,
    confirmed_of_served: null,
  };

  const emptyPricing: WillingnessToPay = {
    price_aed: 99,
    asked: 0,
    yes: 0,
    maybe: 0,
    no: 0,
    yes_pct: null,
    yes_or_maybe_pct: null,
  };

  return {
    funnel: (funnel.data?.[0] as Funnel) ?? emptyFunnel,
    timings: (timings.data as RailTiming[]) ?? [],
    cohorts: (cohorts.data as Cohort[]) ?? [],
    venues: (venues.data as VenueReliability[]) ?? [],
    effort: (effort.data as OpsEffort[]) ?? [],
    pricing: (pricing.data?.[0] as WillingnessToPay) ?? emptyPricing,
    liveVenues: live.count ?? 0,
    since: from,
  };
}
