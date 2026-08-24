import { z } from 'zod';
import { e164, isoDateTime, priceBandSchema, timestamps, uuid, zoneSchema } from './common';

export const notificationPrefsSchema = z.object({
  push_enabled: z.boolean().default(true),
  whatsapp_enabled: z.boolean().default(true),
  reminder_24h: z.boolean().default(true),
  reminder_2h: z.boolean().default(true),
  /** Phase 10. Off by default — proactivity has to be earned. */
  proactive_suggestions: z.boolean().default(false),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const userSchema = z.object({
  id: uuid,
  email: z.string().email(),
  phone_e164: e164.nullable(),
  full_name: z.string().min(1).max(120).nullable(),
  /** App UI is English-first for the pilot; the voice rail still handles Arabic. */
  locale: z.enum(['en', 'ar']).default('en'),
  timezone: z.string().default('Asia/Dubai'),
  /** Device calendar in the MVP, so this is a capability flag, not a token. */
  calendar_sync_enabled: z.boolean().default(false),
  notification_prefs: notificationPrefsSchema,
  /** Pilot is invite-only. */
  invite_code: z.string().min(4).max(32).nullable(),
  onboarded_at: isoDateTime.nullable(),
  ...timestamps,
});
export type User = z.infer<typeof userSchema>;

/**
 * The taste graph. Phase 3 captures it in onboarding; Phase 10 learns on top of
 * it. Kept as one row per user rather than an EAV table — it is read on every
 * suggestion and it is small.
 */
export const userPreferencesSchema = z.object({
  user_id: uuid,
  cuisines_loved: z.array(z.string().min(1)).max(30).default([]),
  cuisines_avoided: z.array(z.string().min(1)).max(30).default([]),
  price_band_min: priceBandSchema.default(1),
  price_band_max: priceBandSchema.default(4),
  /** Free text so we never silently drop an allergy we lack an enum for. */
  dietary: z.array(z.string().min(1)).max(20).default([]),
  allergies: z.array(z.string().min(1)).max(20).default([]),
  home_zone: zoneSchema.nullable(),
  work_zone: zoneSchema.nullable(),
  preferred_zones: z.array(zoneSchema).default([]),
  default_party_size: z.number().int().min(1).max(20).default(2),
  favourite_venue_ids: z.array(uuid).max(100).default([]),
  /**
   * Standing entities — "my barber", "our usual place". Label to venue id.
   * Resolved by the Concierge before the Curator ever runs.
   */
  standing_providers: z.record(z.string().min(1), uuid).default({}),
  notes: z.string().max(2000).nullable(),
  ...timestamps,
});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

export const userPreferencesUpdateSchema = userPreferencesSchema
  .omit({ user_id: true, created_at: true, updated_at: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No preference fields supplied' })
  .refine(
    (v) =>
      v.price_band_min === undefined ||
      v.price_band_max === undefined ||
      v.price_band_min <= v.price_band_max,
    { message: 'price_band_min must not exceed price_band_max' },
  );
