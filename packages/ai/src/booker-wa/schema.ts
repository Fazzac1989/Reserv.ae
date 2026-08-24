// See the note in provider.ts: schemas handed to the Anthropic SDK use zod's
// v4 API, which ships alongside v3 in zod 3.25+.
import { z } from 'zod/v4';

export const draftOutputSchema = z.object({
  /** The message body exactly as it would be sent. */
  message: z.string().min(1).max(1200),
});
export type DraftOutput = z.infer<typeof draftOutputSchema>;

export const ATTEMPT_OUTCOMES = [
  'confirmed',
  'alternative_offered',
  'declined',
  'unclear',
] as const;

export const parseOutputSchema = z.object({
  outcome: z.enum(ATTEMPT_OUTCOMES),
  /** Honest probability the outcome is right. Read strictly for `confirmed`. */
  confidence: z.number().min(0).max(1),
  /** One line an operator can read without opening the thread. */
  summary: z.string().min(1).max(300),
  /** Present only when the venue proposed something other than what we asked. */
  alternative: z
    .object({
      /** ISO-8601, or null when they were vague. */
      scheduled_for: z.string().nullable(),
      party_size: z.number().int().min(1).max(20).nullable(),
      note: z.string().max(300).nullable(),
    })
    .nullable(),
  /** Set when the venue asked us something a person needs to answer. */
  question_for_ops: z.string().max(300).nullable(),
});
export type ParseOutput = z.infer<typeof parseOutputSchema>;
