import { AGENTS } from '../agents';
import type { ModelProvider } from '../provider';
import {
  CURATOR_SYSTEM,
  renderCuratorContext,
  type CuratorCandidateSummary,
  type CuratorContext,
} from './prompt';
import { curatorOutputSchema } from './schema';
import { normaliseRanking, type RankingResult } from './normalise';

export interface CuratorRunInput {
  readonly context: CuratorContext;
  readonly candidates: readonly CuratorCandidateSummary[];
  readonly vertical: string;
  readonly correlationId: string;
}

export interface CuratorRunResult extends RankingResult {
  readonly model: string;
  readonly usage: { inputTokens: number; outputTokens: number };
}

/**
 * Ranks an already-feasible shortlist.
 *
 * The strong tier, unlike the Concierge: choosing well between six plausible
 * restaurants for someone's anniversary is the reasoning step, and it is what
 * the user will judge the product on.
 */
export async function runCurator(
  provider: ModelProvider,
  input: CuratorRunInput,
): Promise<CuratorRunResult> {
  const definition = AGENTS.curator;

  const result = await provider.parse(
    {
      tier: definition.tier,
      effort: definition.effort,
      system: CURATOR_SYSTEM,
      messages: [{ role: 'user', content: renderCuratorContext(input.context, input.candidates) }],
      correlationId: input.correlationId,
    },
    curatorOutputSchema,
  );

  return {
    ...normaliseRanking(
      result.value,
      input.candidates,
      { starts_at: input.context.windowStart, ends_at: input.context.windowEnd },
      input.vertical,
    ),
    model: result.model,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    },
  };
}
