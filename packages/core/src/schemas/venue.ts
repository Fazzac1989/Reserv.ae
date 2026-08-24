import { z } from 'zod';
import {
  bookingPlatformSchema,
  clockTime,
  e164,
  geoPointSchema,
  openingHoursSchema,
  priceBandSchema,
  railKindSchema,
  timestamps,
  uuid,
  verticalSchema,
  zoneSchema,
} from './common';

/** Founder-led acquisition pipeline, tracked in the ops console from day one. */
export const VENUE_ONBOARDING_STATUSES = [
  'lead',
  'contacted',
  'agreed',
  'live',
  'paused',
  'lost',
] as const;
export const venueOnboardingStatusSchema = z.enum(VENUE_ONBOARDING_STATUSES);
export type VenueOnboardingStatus = z.infer<typeof venueOnboardingStatusSchema>;

export const venueSchema = z.object({
  id: uuid,
  name: z.string().min(1).max(160),
  vertical: verticalSchema,
  zone: zoneSchema,
  address: z.string().max(300).nullable(),
  geo: geoPointSchema.nullable(),
  price_band: priceBandSchema,
  /** Cuisines for restaurants, services for salons/barbers. */
  tags: z.array(z.string().min(1)).max(40).default([]),
  description: z.string().max(2000).nullable(),
  /** Editorial line the Curator may quote. Ours, not scraped. */
  house_note: z.string().max(500).nullable(),
  opening_hours: z.array(openingHoursSchema).default([]),
  /** Curator boost for "when is this place actually good". */
  best_times: z.array(z.string().min(1)).max(20).default([]),
  photo_urls: z.array(z.string().url()).max(20).default([]),
  onboarding_status: venueOnboardingStatusSchema.default('lead'),
  /** Documented permission to book on a user's behalf. No permission, no rail. */
  booking_consent_obtained_at: z.string().datetime({ offset: true }).nullable(),
  is_demo: z.boolean().default(false),
  ...timestamps,
});
export type Venue = z.infer<typeof venueSchema>;

/**
 * Per-rail configuration. Secrets are never stored here in plaintext — the
 * `credentials_ref` points at the secret store, and real venue phone numbers
 * live only in the database, never in a seed file or a repo.
 */
const apiChannelConfig = z.object({
  kind: z.literal('api'),
  platform: bookingPlatformSchema,
  external_venue_id: z.string().min(1),
  credentials_ref: z.string().min(1),
  supports_availability_lookup: z.boolean().default(false),
});

const whatsappChannelConfig = z.object({
  kind: z.literal('whatsapp'),
  phone_e164: e164,
  contact_name: z.string().max(120).nullable(),
  /** Human approval before every outbound send. Default ON per the build plan. */
  human_approval_required: z.boolean().default(true),
});

const voiceChannelConfig = z.object({
  kind: z.literal('voice'),
  phone_e164: e164,
  /** UAE call-recording consent is an open legal question — gate on it explicitly. */
  recording_consent_obtained: z.boolean().default(false),
  preferred_language: z.enum(['en', 'ar']).default('en'),
});

const manualChannelConfig = z.object({
  kind: z.literal('manual'),
  instructions: z.string().max(1000),
});

export const channelConfigSchema = z.discriminatedUnion('kind', [
  apiChannelConfig,
  whatsappChannelConfig,
  voiceChannelConfig,
  manualChannelConfig,
]);
export type ChannelConfig = z.infer<typeof channelConfigSchema>;

export const venueBookingChannelSchema = z
  .object({
    id: uuid,
    venue_id: uuid,
    kind: railKindSchema,
    /** Lower runs first. The rail fallback order for this venue. */
    priority: z.number().int().min(0).max(100),
    config: channelConfigSchema,
    /** Escalate to ops after this long with no outcome. */
    sla_minutes: z.number().int().min(1).max(1440),
    /** When this channel is actually watched by a human at the venue. */
    responsive_hours: z.array(openingHoursSchema).default([]),
    is_enabled: z.boolean().default(false),
    last_verified_at: z.string().datetime({ offset: true }).nullable(),
    ...timestamps,
  })
  .refine((c) => c.kind === c.config.kind, {
    message: 'channel.kind must match config.kind',
    path: ['config', 'kind'],
  });
export type VenueBookingChannel = z.infer<typeof venueBookingChannelSchema>;

export const venuePolicySchema = z.object({
  id: uuid,
  venue_id: uuid,
  /** Minimum notice the venue needs, in minutes. */
  min_lead_time_minutes: z.number().int().min(0).max(20160).default(0),
  /** How far ahead they will take a booking, in days. */
  max_lead_time_days: z.number().int().min(0).max(365).default(60),
  min_party_size: z.number().int().min(1).max(50).default(1),
  max_party_size: z.number().int().min(1).max(200).default(12),
  cancellation_notice_hours: z.number().int().min(0).max(336).default(0),
  cancellation_terms: z.string().max(1000).nullable(),
  /** Peak windows the venue will not take agent bookings for. */
  blackout_windows: z
    .array(z.object({ day: openingHoursSchema.shape.day, from: clockTime, to: clockTime }))
    .default([]),
  requires_deposit: z.boolean().default(false),
  notes: z.string().max(2000).nullable(),
  ...timestamps,
});
export type VenuePolicy = z.infer<typeof venuePolicySchema>;

export const venueCreateSchema = venueSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export const venueUpdateSchema = venueCreateSchema.partial();
