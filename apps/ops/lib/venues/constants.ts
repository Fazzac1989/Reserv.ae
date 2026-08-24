import type { Database } from '@reservai/db';

/**
 * Enum values shared by server queries and client forms.
 *
 * Kept apart from queries.ts because that module imports the server Supabase
 * client, which must never be pulled into a client bundle.
 */
export type OnboardingStatus = Database['public']['Enums']['venue_onboarding_status'];
export type Vertical = Database['public']['Enums']['vertical'];
export type Zone = Database['public']['Enums']['zone'];
export type RailKind = Database['public']['Enums']['rail_kind'];
export type BookingPlatform = Database['public']['Enums']['booking_platform'];

export const ONBOARDING_STATUSES = [
  'lead',
  'contacted',
  'agreed',
  'live',
  'paused',
  'lost',
] as const satisfies readonly OnboardingStatus[];

export const VERTICALS = ['restaurant', 'salon', 'barber'] as const satisfies readonly Vertical[];
export const ZONES = ['dubai_marina', 'jbr', 'bluewaters'] as const satisfies readonly Zone[];
export const RAIL_KINDS = [
  'api',
  'whatsapp',
  'voice',
  'manual',
] as const satisfies readonly RailKind[];
export const BOOKING_PLATFORMS = [
  'sevenrooms',
  'eat_app',
  'fresha',
  'other',
] as const satisfies readonly BookingPlatform[];

/** The acquisition pipeline, in the order the founder walks it. */
export const PIPELINE: readonly OnboardingStatus[] = ['lead', 'contacted', 'agreed', 'live'];

export function labelFor(value: string): string {
  return value.replace(/_/g, ' ');
}

/** Default SLA per rail, in minutes — the escalation clock from the build plan. */
export const DEFAULT_SLA_MINUTES: Record<RailKind, number> = {
  api: 5,
  whatsapp: 20,
  voice: 45,
  manual: 60,
};

/** Lower runs first. Sensible starting order for a new venue. */
export const DEFAULT_PRIORITY: Record<RailKind, number> = {
  api: 10,
  whatsapp: 20,
  voice: 30,
  manual: 90,
};
