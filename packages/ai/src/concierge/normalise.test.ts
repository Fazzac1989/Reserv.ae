import { describe, expect, it } from 'vitest';
import { normaliseTurn, requestStatusFor } from './normalise';
import type { ConciergeContext } from './prompt';
import type { ConciergeOutput } from './schema';

const CONTEXT: ConciergeContext = {
  now: '2026-02-05T14:00:00.000Z',
  timezone: 'Asia/Dubai',
  homeZone: 'dubai_marina',
  preferredZones: ['dubai_marina', 'jbr'],
  defaultPartySize: 2,
  priceBandMin: 2,
  priceBandMax: 3,
  cuisinesLoved: ['Japanese'],
  cuisinesAvoided: [],
  dietary: [],
  allergies: ['Shellfish'],
};

function output(overrides: Partial<ConciergeOutput> = {}): ConciergeOutput {
  return {
    reply: 'Looking for a table now.',
    clarifying_question: null,
    intent: {
      vertical: 'restaurant',
      zones: ['dubai_marina'],
      window_start: '2026-02-07T18:00:00.000Z',
      window_end: '2026-02-07T21:00:00.000Z',
      party_size: 4,
      price_band_max: 3,
      occasion: null,
      constraints: [],
      ...overrides.intent,
    },
    ...('reply' in overrides ? { reply: overrides.reply! } : {}),
    ...('clarifying_question' in overrides
      ? { clarifying_question: overrides.clarifying_question! }
      : {}),
  };
}

describe('a complete request', () => {
  it('passes through and is ready for the Curator', () => {
    const turn = normaliseTurn(output(), CONTEXT);
    expect(turn.ready).toBe(true);
    expect(turn.clarifyingQuestion).toBeNull();
    expect(turn.intent.missing_fields).toEqual([]);
    expect(turn.intent.window).toEqual({
      starts_at: '2026-02-07T18:00:00.000Z',
      ends_at: '2026-02-07T21:00:00.000Z',
    });
    expect(requestStatusFor(turn)).toBe('parsed');
  });

  it('deduplicates and trims constraints', () => {
    const turn = normaliseTurn(
      output({ intent: { constraints: [' outdoor seating ', 'outdoor seating', ''] } as never }),
      CONTEXT,
    );
    expect(turn.intent.constraints).toEqual(['outdoor seating']);
  });
});

describe('the one-question rule', () => {
  // Asking when nothing is missing wastes the user's turn. A secretary who
  // interrogates you is worse than one who assumes sensibly and says so.
  it('drops a clarifying question when nothing is actually missing', () => {
    const turn = normaliseTurn(
      output({ clarifying_question: 'How many people will there be?' }),
      CONTEXT,
    );
    expect(turn.clarifyingQuestion).toBeNull();
    expect(turn.ready).toBe(true);
  });

  it('supplies a question when the model failed to ask for a required field', () => {
    const turn = normaliseTurn(
      output({ intent: { vertical: null } as never, clarifying_question: null }),
      CONTEXT,
    );
    expect(turn.ready).toBe(false);
    expect(turn.clarifyingQuestion).toMatch(/table somewhere, or an appointment/);
    expect(turn.intent.missing_fields).toEqual(['vertical']);
  });

  it('asks about time when the window is missing', () => {
    const turn = normaliseTurn(
      output({ intent: { window_start: null, window_end: null } as never }),
      CONTEXT,
    );
    expect(turn.ready).toBe(false);
    expect(turn.clarifyingQuestion).toBe('When were you thinking?');
  });

  it('keeps the model’s own question when one is genuinely needed', () => {
    const turn = normaliseTurn(
      output({
        intent: { window_start: null, window_end: null } as never,
        clarifying_question: 'Which evening suits you?',
      }),
      CONTEXT,
    );
    expect(turn.clarifyingQuestion).toBe('Which evening suits you?');
  });
});

describe('windows the schema cannot catch', () => {
  // The schema only checks these are strings. A window that does not parse, or
  // ends before it starts, is not a time — and time is a required field, so it
  // becomes a question rather than a booking at the wrong moment.
  it('rejects an unparseable window', () => {
    const turn = normaliseTurn(
      output({ intent: { window_start: 'saturday-ish', window_end: 'later' } as never }),
      CONTEXT,
    );
    expect(turn.intent.window).toBeNull();
    expect(turn.ready).toBe(false);
  });

  it('rejects a window that ends before it starts', () => {
    const turn = normaliseTurn(
      output({
        intent: {
          window_start: '2026-02-07T21:00:00.000Z',
          window_end: '2026-02-07T18:00:00.000Z',
        } as never,
      }),
      CONTEXT,
    );
    expect(turn.intent.window).toBeNull();
    expect(turn.ready).toBe(false);
  });

  it('rejects a window with only one bound', () => {
    const turn = normaliseTurn(output({ intent: { window_end: null } as never }), CONTEXT);
    expect(turn.intent.window).toBeNull();
    expect(turn.intent.missing_fields).toEqual(['window']);
  });

  it('normalises a valid window to ISO regardless of the offset given', () => {
    const turn = normaliseTurn(
      output({
        intent: {
          window_start: '2026-02-07T22:00:00+04:00',
          window_end: '2026-02-08T01:00:00+04:00',
        } as never,
      }),
      CONTEXT,
    );
    expect(turn.intent.window).toEqual({
      starts_at: '2026-02-07T18:00:00.000Z',
      ends_at: '2026-02-07T21:00:00.000Z',
    });
  });
});

describe('falling back to the profile', () => {
  it('never lets the model guess party size — it comes from the profile', () => {
    const turn = normaliseTurn(output({ intent: { party_size: null } as never }), CONTEXT);
    expect(turn.intent.party_size).toBe(2);
    expect(turn.defaulted).toContain('party_size');
  });

  it('uses the home zone when no zone was mentioned', () => {
    const turn = normaliseTurn(output({ intent: { zones: [] } as never }), CONTEXT);
    expect(turn.intent.zones).toEqual(['dubai_marina']);
    expect(turn.defaulted).toContain('zones');
  });

  it('falls back to every zone they will travel to when there is no home zone', () => {
    const turn = normaliseTurn(output({ intent: { zones: [] } as never }), {
      ...CONTEXT,
      homeZone: null,
    });
    expect(turn.intent.zones).toEqual(['dubai_marina', 'jbr']);
  });

  it('leaves zones empty when the profile has nothing either', () => {
    const turn = normaliseTurn(output({ intent: { zones: [] } as never }), {
      ...CONTEXT,
      homeZone: null,
      preferredZones: [],
    });
    expect(turn.intent.zones).toEqual([]);
    expect(turn.defaulted).not.toContain('zones');
  });

  it('does not report a default when the user stated the value', () => {
    const turn = normaliseTurn(output(), CONTEXT);
    expect(turn.defaulted).toEqual([]);
  });

  it('takes the spend ceiling from the profile when unstated', () => {
    const turn = normaliseTurn(output({ intent: { price_band_max: null } as never }), CONTEXT);
    expect(turn.intent.price_band_max).toBe(3);
    expect(turn.defaulted).toContain('price_band_max');
  });

  it('deduplicates zones the model repeated', () => {
    const turn = normaliseTurn(
      output({ intent: { zones: ['jbr', 'jbr', 'dubai_marina'] } as never }),
      CONTEXT,
    );
    expect(turn.intent.zones).toEqual(['jbr', 'dubai_marina']);
  });
});

describe('request status', () => {
  it('is needs_clarification while anything required is missing', () => {
    const turn = normaliseTurn(output({ intent: { vertical: null } as never }), CONTEXT);
    expect(requestStatusFor(turn)).toBe('needs_clarification');
  });
});
