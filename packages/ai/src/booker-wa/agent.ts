import { AGENTS } from '../agents';
import type { ModelProvider } from '../provider';
import {
  DRAFT_SYSTEM,
  PARSE_SYSTEM,
  renderDraftContext,
  renderParseContext,
  type DraftContext,
  type ParseContext,
} from './prompt';
import { draftOutputSchema, parseOutputSchema } from './schema';
import { checkDraft, normaliseReply, type DraftCheck, type NormalisedReply } from './normalise';

export interface DraftResult {
  readonly message: string;
  readonly check: DraftCheck;
  readonly model: string;
  readonly usage: { inputTokens: number; outputTokens: number };
}

/** Writes the message we would send. Sending is a separate, gated decision. */
export async function draftVenueMessage(
  provider: ModelProvider,
  input: {
    context: DraftContext;
    /** Strings that must not appear — surname, phone, email. */
    forbiddenTerms?: readonly string[];
    correlationId: string;
  },
): Promise<DraftResult> {
  const definition = AGENTS.booker_wa;

  const result = await provider.parse(
    {
      tier: definition.tier,
      effort: definition.effort,
      system: DRAFT_SYSTEM,
      messages: [{ role: 'user', content: renderDraftContext(input.context) }],
      correlationId: input.correlationId,
    },
    draftOutputSchema,
  );

  const message = result.value.message.trim();

  return {
    message,
    check: checkDraft(message, {
      clientFirstName: input.context.clientFirstName,
      ...(input.forbiddenTerms ? { forbiddenTerms: input.forbiddenTerms } : {}),
    }),
    model: result.model,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    },
  };
}

export interface ReplyParseResult extends NormalisedReply {
  readonly model: string;
  readonly usage: { inputTokens: number; outputTokens: number };
}

/**
 * Reads a venue reply.
 *
 * Uses the strong tier deliberately. This is the judgement that decides whether
 * someone is told their table is booked, and it is the wrong place to save a
 * fraction of a cent.
 */
export async function parseVenueReply(
  provider: ModelProvider,
  input: { context: ParseContext; correlationId: string },
): Promise<ReplyParseResult> {
  const result = await provider.parse(
    {
      tier: 'strong',
      effort: 'medium',
      system: PARSE_SYSTEM,
      messages: [{ role: 'user', content: renderParseContext(input.context) }],
      correlationId: input.correlationId,
    },
    parseOutputSchema,
  );

  return {
    ...normaliseReply(result.value),
    model: result.model,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    },
  };
}
