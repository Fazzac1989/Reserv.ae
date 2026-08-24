import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { runConciergeTurn } from './agent';
import { CONCIERGE_SYSTEM } from './prompt';
import type { ConciergeContext } from './prompt';
import { ModelOutputError, type ModelProvider } from '../provider';
import type { ConciergeOutput } from './schema';

const CONTEXT: ConciergeContext = {
  now: '2026-02-05T14:00:00.000Z',
  timezone: 'Asia/Dubai',
  homeZone: 'jbr',
  preferredZones: ['jbr', 'dubai_marina'],
  defaultPartySize: 2,
  priceBandMin: 1,
  priceBandMax: 3,
  cuisinesLoved: ['Italian'],
  cuisinesAvoided: ['Mexican'],
  dietary: ['Pescatarian'],
  allergies: ['Nuts'],
};

const OUTPUT: ConciergeOutput = {
  reply: 'Right — a barber near JBR on Saturday morning. Let me look.',
  clarifying_question: null,
  intent: {
    vertical: 'barber',
    zones: ['jbr'],
    window_start: '2026-02-07T04:00:00.000Z',
    window_end: '2026-02-07T08:00:00.000Z',
    party_size: 1,
    price_band_max: null,
    occasion: null,
    constraints: ['beard trim as well'],
  },
};

/**
 * A provider that returns a fixed answer. Mocks live in tests only — the
 * production path always talks to a real model, and a rail or agent that is not
 * wired up says so rather than pretending.
 */
function stubProvider(output: ConciergeOutput = OUTPUT): ModelProvider & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    name: 'stub',
    calls,
    complete: vi.fn(),
    stream: vi.fn(),
    parse: vi.fn(async (request) => {
      calls.push(request);
      return {
        value: output,
        model: 'stub-model',
        usage: {
          inputTokens: 1200,
          outputTokens: 180,
          cacheReadTokens: 1000,
          cacheCreationTokens: 0,
        },
      };
    }),
  } as unknown as ModelProvider & { calls: unknown[] };
}

describe('runConciergeTurn', () => {
  it('sends the frozen system prompt, so the cache prefix stays stable', async () => {
    const provider = stubProvider();
    await runConciergeTurn(provider, {
      context: CONTEXT,
      history: [],
      message: 'haircut saturday morning near jbr, beard too',
      correlationId: 'conv-1',
    });

    const request = provider.calls[0] as { system: string; tier: string };
    expect(request.system).toBe(CONCIERGE_SYSTEM);
    // The fast tier is the Concierge's declared tier: parsing intent is not
    // the expensive reasoning step.
    expect(request.tier).toBe('fast');
  });

  it('puts the volatile profile in the messages, never in the system prompt', async () => {
    const provider = stubProvider();
    await runConciergeTurn(provider, {
      context: CONTEXT,
      history: [],
      message: 'a table tonight',
      correlationId: 'conv-1',
    });

    const request = provider.calls[0] as { system: string; messages: Anthropic.MessageParam[] };
    expect(request.system).not.toContain('Asia/Dubai');
    expect(request.messages[0]?.content).toContain('Current time: 2026-02-05T14:00:00.000Z');
    expect(request.messages[0]?.content).toContain('Allergies: Nuts');
    expect(request.messages[0]?.content).toContain('Home zone: jbr');
  });

  it('replays the conversation with the new message last', async () => {
    const provider = stubProvider();
    await runConciergeTurn(provider, {
      context: CONTEXT,
      history: [
        { role: 'user', content: 'somewhere for dinner' },
        { role: 'assistant', content: 'When were you thinking?' },
      ],
      message: 'friday about eight',
      correlationId: 'conv-1',
    });

    const { messages } = provider.calls[0] as { messages: Anthropic.MessageParam[] };
    expect(messages.map((m) => m.role)).toEqual(['user', 'user', 'assistant', 'user']);
    expect(messages.at(-1)?.content).toBe('friday about eight');
  });

  it('caps replayed history so a long thread cannot grow without bound', async () => {
    const provider = stubProvider();
    const history = Array.from({ length: 60 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `turn ${i}`,
    }));

    await runConciergeTurn(provider, {
      context: CONTEXT,
      history,
      message: 'and now this',
      correlationId: 'conv-1',
    });

    const { messages } = provider.calls[0] as { messages: Anthropic.MessageParam[] };
    // profile + 20 replayed turns + the new message
    expect(messages).toHaveLength(22);
    expect(messages[1]?.content).toBe('turn 40');
  });

  it('returns the normalised intent, not the raw model output', async () => {
    const provider = stubProvider();
    const turn = await runConciergeTurn(provider, {
      context: CONTEXT,
      history: [],
      message: 'haircut saturday morning',
      correlationId: 'conv-1',
    });

    expect(turn.ready).toBe(true);
    expect(turn.intent.window).toEqual({
      starts_at: '2026-02-07T04:00:00.000Z',
      ends_at: '2026-02-07T08:00:00.000Z',
    });
    // Unstated spend ceiling came from the profile, and that is reported.
    expect(turn.intent.price_band_max).toBe(3);
    expect(turn.defaulted).toEqual(['price_band_max']);
    expect(turn.model).toBe('stub-model');
    expect(turn.usage).toEqual({ inputTokens: 1200, outputTokens: 180 });
  });

  it('turns a model that could not answer into a thrown error, not an empty reply', async () => {
    const provider = {
      name: 'stub',
      complete: vi.fn(),
      stream: vi.fn(),
      parse: vi.fn(async () => {
        throw new ModelOutputError('The model declined to answer.');
      }),
    } as unknown as ModelProvider;

    await expect(
      runConciergeTurn(provider, {
        context: CONTEXT,
        history: [],
        message: 'anything',
        correlationId: 'conv-1',
      }),
    ).rejects.toBeInstanceOf(ModelOutputError);
  });
});
