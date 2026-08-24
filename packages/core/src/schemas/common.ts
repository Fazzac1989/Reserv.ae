import { z } from 'zod';

/**
 * Shared primitives. These schemas mirror database columns, so field names are
 * snake_case throughout — one shape from Postgres to the client, no mapping
 * layer to drift.
 */

export const uuid = z.string().uuid();
export const isoDateTime = z.string().datetime({ offset: true });
/** HH:MM, 24h, venue-local. */
export const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');
export const e164 = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Expected E.164, e.g. +9715XXXXXXX');

export const VERTICALS = ['restaurant', 'salon', 'barber'] as const;
export const verticalSchema = z.enum(VERTICALS);
export type Vertical = z.infer<typeof verticalSchema>;

/** Pilot geography only. Widening this is a product decision, not a config change. */
export const ZONES = ['dubai_marina', 'jbr', 'bluewaters'] as const;
export const zoneSchema = z.enum(ZONES);
export type Zone = z.infer<typeof zoneSchema>;

/** 1 = everyday, 4 = special occasion. */
export const priceBandSchema = z.number().int().min(1).max(4);

export const RAIL_KINDS = ['api', 'whatsapp', 'voice', 'manual'] as const;
export const railKindSchema = z.enum(RAIL_KINDS);
export type RailKindSchema = z.infer<typeof railKindSchema>;

export const BOOKING_PLATFORMS = ['sevenrooms', 'eat_app', 'fresha', 'other'] as const;
export const bookingPlatformSchema = z.enum(BOOKING_PLATFORMS);

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const dayOfWeekSchema = z.enum(DAYS);

export const openingHoursSchema = z.object({
  day: dayOfWeekSchema,
  opens_at: clockTime,
  closes_at: clockTime,
});
export type OpeningHours = z.infer<typeof openingHoursSchema>;

export const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** Every row carries these. `created_at`/`updated_at` are set by Postgres. */
export const timestamps = {
  created_at: isoDateTime,
  updated_at: isoDateTime,
};

/** A half-open window. Used for both user asks and venue availability. */
export const timeWindowSchema = z
  .object({
    starts_at: isoDateTime,
    ends_at: isoDateTime,
  })
  .refine((w) => new Date(w.starts_at) < new Date(w.ends_at), {
    message: 'starts_at must precede ends_at',
  });
export type TimeWindow = z.infer<typeof timeWindowSchema>;
