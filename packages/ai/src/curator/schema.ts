// See the note in provider.ts: schemas handed to the Anthropic SDK use zod's
// v4 API, which ships alongside v3 in zod 3.25+.
import { z } from 'zod/v4';

/**
 * What the Curator is allowed to return.
 *
 * Note what is absent: no price, no availability, no opening hours, no venue
 * name. The model ranks candidates it was given and explains why; every fact
 * about a venue comes from the directory, so there is nothing here for it to
 * get wrong about the real world.
 */
export const curatorOutputSchema = z.object({
  rankings: z
    .array(
      z.object({
        /** Must be one of the candidate ids it was given. Checked in code. */
        venue_id: z.string(),
        rank: z.number().int().min(1).max(3),
        /** Shown to the user as our opinion. Second person, one sentence. */
        rationale: z.string().min(1).max(280),
        /** ISO-8601, inside the requested window. Checked in code. */
        proposed_start: z.string(),
      }),
    )
    .max(3),
});

export type CuratorOutput = z.infer<typeof curatorOutputSchema>;
export type CuratorRanking = CuratorOutput['rankings'][number];
