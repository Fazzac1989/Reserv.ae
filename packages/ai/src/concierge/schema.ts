// See the note in provider.ts: schemas handed to the Anthropic SDK use zod's
// v4 API, which ships alongside v3 in zod 3.25+.
import { z } from 'zod/v4';

/**
 * What the Concierge is allowed to return.
 *
 * Every extracted field is nullable on purpose. The agent must be able to say
 * "I don't know" — that is what drives the single clarifying question, and a
 * null is always recoverable where a confident wrong guess is not.
 */

export const VERTICALS = ['restaurant', 'salon', 'barber'] as const;
export const ZONES = ['dubai_marina', 'jbr', 'bluewaters'] as const;

export const conciergeOutputSchema = z.object({
  /** What the user sees. One or two sentences. */
  reply: z.string().min(1).max(600),

  /**
   * The single clarifying question, when one is genuinely needed. Null means
   * the agent had enough to proceed.
   */
  clarifying_question: z.string().max(300).nullable(),

  intent: z.object({
    vertical: z.enum(VERTICALS).nullable(),
    zones: z.array(z.enum(ZONES)),
    /** ISO-8601. Both present or both null — a half window is not a window. */
    window_start: z.string().nullable(),
    window_end: z.string().nullable(),
    party_size: z.number().int().min(1).max(20).nullable(),
    price_band_max: z.number().int().min(1).max(4).nullable(),
    occasion: z.string().max(120).nullable(),
    constraints: z.array(z.string().min(1).max(160)),
  }),
});

export type ConciergeOutput = z.infer<typeof conciergeOutputSchema>;
export type ConciergeIntent = ConciergeOutput['intent'];

/** Fields with no fallback anywhere else. Everything else comes from the profile. */
export const REQUIRED_FIELDS = ['vertical', 'window'] as const;
export type RequiredField = (typeof REQUIRED_FIELDS)[number];

export function missingRequiredFields(intent: ConciergeIntent): RequiredField[] {
  const missing: RequiredField[] = [];
  if (intent.vertical === null) missing.push('vertical');
  if (intent.window_start === null || intent.window_end === null) missing.push('window');
  return missing;
}
