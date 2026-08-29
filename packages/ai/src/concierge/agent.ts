import type Anthropic from '@anthropic-ai/sdk';
import { AGENTS } from '../agents';
import type { ModelProvider } from '../provider';
import { CONCIERGE_SYSTEM, renderContext, type ConciergeContext } from './prompt';
import { buildConciergeOutputSchema } from './schema';
import { normaliseTurn, type NormalisedTurn } from './normalise';

export interface ConciergeTurnInput {
  readonly context: ConciergeContext;
  /** Prior turns, oldest first. The current message is not included. */
  readonly history: readonly { role: 'user' | 'assistant'; content: string }[];
  readonly message: string;
  /**
   * The places the model may name, from the directory. A closed list, because
   * a zone nobody has a venue in matches nothing and fails at the filter with
   * no explanation.
   */
  readonly allowedZones: readonly [string, ...string[]];
  readonly correlationId: string;
}

export interface ConciergeTurnResult extends NormalisedTurn {
  readonly model: string;
  readonly usage: { inputTokens: number; outputTokens: number };
}

/** Older turns are dropped rather than compacted — this is a short exchange. */
const MAX_HISTORY_TURNS = 20;

/**
 * One turn of the concierge conversation.
 *
 * The agent extracts; `normaliseTurn` decides. Everything the product depends
 * on — whether a clarifying question is warranted, what gets defaulted from the
 * profile, whether the request is ready — is settled in code afterwards, not
 * trusted from the model.
 */
export async function runConciergeTurn(
  provider: ModelProvider,
  input: ConciergeTurnInput,
): Promise<ConciergeTurnResult> {
  const definition = AGENTS.concierge;

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: renderContext(input.context) },
    ...input.history.slice(-MAX_HISTORY_TURNS).map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
    { role: 'user', content: input.message },
  ];

  const result = await provider.parse(
    {
      tier: definition.tier,
      effort: definition.effort,
      system: CONCIERGE_SYSTEM,
      messages,
      correlationId: input.correlationId,
    },
    buildConciergeOutputSchema(input.allowedZones),
  );

  return {
    ...normaliseTurn(result.value, input.context),
    model: result.model,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    },
  };
}
