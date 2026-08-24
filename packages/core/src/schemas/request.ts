import { z } from 'zod';
import {
  isoDateTime,
  priceBandSchema,
  timeWindowSchema,
  timestamps,
  uuid,
  verticalSchema,
  zoneSchema,
} from './common';

export const REQUEST_STATUSES = [
  'received',
  'needs_clarification',
  'parsed',
  'suggested',
  'converted',
  'abandoned',
] as const;
export const requestStatusSchema = z.enum(REQUEST_STATUSES);

export const requestInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().min(1).max(4000) }),
  z.object({
    kind: z.literal('voice'),
    /** Supabase Storage path. The audio is retained for audit. */
    audio_ref: z.string().min(1),
    /** Shown back to the user for confirmation before we act on it. */
    transcript: z.string().max(4000).nullable(),
    transcript_confidence: z.number().min(0).max(1).nullable(),
  }),
]);
export type RequestInput = z.infer<typeof requestInputSchema>;

/**
 * What the Concierge extracted. Every field is nullable because the agent must
 * be allowed to say "I don't know" — that is what drives the single clarifying
 * question, and it is strictly better than a confident guess.
 */
export const parsedIntentSchema = z.object({
  vertical: verticalSchema.nullable(),
  zones: z.array(zoneSchema).default([]),
  window: timeWindowSchema.nullable(),
  party_size: z.number().int().min(1).max(20).nullable(),
  price_band_max: priceBandSchema.nullable(),
  occasion: z.string().max(120).nullable(),
  /** e.g. "outdoor seating", "quiet", "beard trim not just cut". */
  constraints: z.array(z.string().min(1)).max(20).default([]),
  /** Resolved from user_preferences.standing_providers where present. */
  named_venue_id: uuid.nullable(),
  /** Fields the agent could not fill and considers required. */
  missing_fields: z.array(z.string().min(1)).max(10).default([]),
});
export type ParsedIntent = z.infer<typeof parsedIntentSchema>;

export const requestSchema = z.object({
  id: uuid,
  user_id: uuid,
  conversation_id: uuid,
  input: requestInputSchema,
  parsed_intent: parsedIntentSchema.nullable(),
  status: requestStatusSchema.default('received'),
  /** At most one clarifying question per the build plan. Tracked, not trusted. */
  clarifying_question: z.string().max(500).nullable(),
  ...timestamps,
});
export type Request = z.infer<typeof requestSchema>;

export const SUGGESTION_OUTCOMES = ['pending', 'accepted', 'rejected', 'expired'] as const;
export const suggestionOutcomeSchema = z.enum(SUGGESTION_OUTCOMES);

export const suggestionSchema = z.object({
  id: uuid,
  request_id: uuid,
  venue_id: uuid,
  /** 1 = the Curator's first choice. Top 3 are shown. */
  rank: z.number().int().min(1).max(10),
  proposed_window: timeWindowSchema,
  /**
   * For API venues with availability lookup this is a real slot we queried.
   * For every other venue it is a proposal we still have to negotiate — the UI
   * must not present the two as if they were the same thing.
   */
  slot_is_verified: z.boolean().default(false),
  /** User-facing "why this fits". Generated, and shown as our opinion. */
  rationale: z.string().min(1).max(600),
  /** Frozen copy of the inputs and scores behind this rank, for audit. */
  reasoning_snapshot: z.record(z.string(), z.unknown()).default({}),
  distance_metres: z.number().int().min(0).nullable(),
  outcome: suggestionOutcomeSchema.default('pending'),
  decided_at: isoDateTime.nullable(),
  ...timestamps,
});
export type Suggestion = z.infer<typeof suggestionSchema>;
