import type Anthropic from '@anthropic-ai/sdk';
// zod/v4 — the SDK's zodOutputFormat helper is typed against zod's v4 core,
// which ships inside zod 3.25+. Only model-output schemas use it; the rest of
// the monorepo stays on the classic v3 API.
import type { z } from 'zod/v4';

/**
 * Provider abstraction.
 *
 * Agents talk to this interface, never to a vendor SDK directly, so swapping or
 * adding a provider is a wiring change rather than a rewrite of every agent.
 */

/**
 * Which class of model to use, resolved to a concrete id by config. Agents ask
 * for a tier — they never hardcode a model string.
 */
export type ModelTier = 'fast' | 'strong';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface CompletionRequest {
  readonly tier: ModelTier;
  /**
   * Stable instructions. Cached as a prefix, so keep everything volatile
   * (timestamps, ids, the user's actual question) out of here.
   */
  readonly system: string;
  readonly messages: Anthropic.MessageParam[];
  readonly maxTokens?: number;
  readonly effort?: Effort;
  /** Ties every model call back to a booking, request or job. */
  readonly correlationId: string;
}

export interface CompletionUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
}

export interface CompletionResult {
  readonly text: string;
  readonly model: string;
  readonly stopReason: string | null;
  readonly usage: CompletionUsage;
  /**
   * True when the model declined. Callers must treat this as "no answer" and
   * escalate — never as an empty-but-valid result.
   */
  readonly refused: boolean;
}

export interface ParseResult<T> {
  readonly value: T;
  readonly model: string;
  readonly usage: CompletionUsage;
}

/**
 * Raised when the model returned something the schema rejects, or declined.
 * Callers must treat this as "no answer" and escalate — never as an empty but
 * valid result.
 */
export class ModelOutputError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'ModelOutputError';
  }
}

export interface ModelProvider {
  readonly name: string;
  complete(request: CompletionRequest): Promise<CompletionResult>;
  /** Streams text deltas. Resolves with the same result shape once complete. */
  stream(request: CompletionRequest, onDelta: (text: string) => void): Promise<CompletionResult>;
  /**
   * Returns a value validated against `schema`, or throws ModelOutputError.
   * There is no partial success: an agent that cannot produce its structured
   * output has not answered.
   */
  parse<T extends z.ZodTypeAny>(
    request: CompletionRequest,
    schema: T,
  ): Promise<ParseResult<z.infer<T>>>;
}
