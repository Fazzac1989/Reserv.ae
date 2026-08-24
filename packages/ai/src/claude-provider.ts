import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod/v4';
import {
  ModelOutputError,
  type CompletionRequest,
  type CompletionResult,
  type ModelProvider,
  type ModelTier,
  type ParseResult,
} from './provider';

export interface ClaudeProviderOptions {
  readonly apiKey: string;
  /** Concrete model id per tier, from config. */
  readonly models: Record<ModelTier, string>;
}

/** Non-streaming default keeps responses inside the SDK HTTP timeout. */
const DEFAULT_MAX_TOKENS = 16_000;
/** Streaming has no timeout pressure, so give the model room. */
const DEFAULT_STREAM_MAX_TOKENS = 64_000;

function usageOf(usage: Anthropic.Usage): CompletionResult['usage'] {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

export class ClaudeProvider implements ModelProvider {
  readonly name = 'anthropic';
  readonly #client: Anthropic;
  readonly #models: Record<ModelTier, string>;

  constructor(options: ClaudeProviderOptions) {
    this.#client = new Anthropic({ apiKey: options.apiKey });
    this.#models = options.models;
  }

  /**
   * The stable system prefix carries a cache breakpoint. Agent instructions are
   * long and identical across calls, so this is where most of the saving is —
   * but only while nothing volatile is appended to `system`.
   */
  #params(request: CompletionRequest, maxTokens: number) {
    return {
      model: this.#models[request.tier],
      max_tokens: request.maxTokens ?? maxTokens,
      system: [
        {
          type: 'text' as const,
          text: request.system,
          cache_control: { type: 'ephemeral' as const },
        },
      ],
      messages: request.messages,
      thinking: { type: 'adaptive' as const },
      output_config: { effort: request.effort ?? (request.tier === 'fast' ? 'low' : 'high') },
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const response = await this.#client.messages.create(this.#params(request, DEFAULT_MAX_TOKENS));

    return {
      text: textOf(response.content),
      model: response.model,
      stopReason: response.stop_reason,
      usage: usageOf(response.usage),
      refused: response.stop_reason === 'refusal',
    };
  }

  async stream(
    request: CompletionRequest,
    onDelta: (text: string) => void,
  ): Promise<CompletionResult> {
    const stream = this.#client.messages.stream(this.#params(request, DEFAULT_STREAM_MAX_TOKENS));

    stream.on('text', onDelta);
    const response = await stream.finalMessage();

    return {
      text: textOf(response.content),
      model: response.model,
      stopReason: response.stop_reason,
      usage: usageOf(response.usage),
      refused: response.stop_reason === 'refusal',
    };
  }
  /**
   * Structured output. The schema is enforced by the API rather than by parsing
   * whatever prose came back, so a malformed answer is a rejected request
   * instead of a plausible-looking object with the wrong fields.
   */
  async parse<T extends z.ZodTypeAny>(
    request: CompletionRequest,
    schema: T,
  ): Promise<ParseResult<z.infer<T>>> {
    const { output_config, ...rest } = this.#params(request, DEFAULT_MAX_TOKENS);

    const response = await this.#client.messages.parse({
      ...rest,
      output_config: { ...output_config, format: zodOutputFormat(schema) },
    });

    if (response.stop_reason === 'refusal') {
      throw new ModelOutputError('The model declined to answer.', response.stop_details);
    }
    if (response.parsed_output === null || response.parsed_output === undefined) {
      throw new ModelOutputError('The model returned no parsable output.', response.stop_reason);
    }

    return {
      value: response.parsed_output as z.infer<T>,
      model: response.model,
      usage: usageOf(response.usage),
    };
  }
}
