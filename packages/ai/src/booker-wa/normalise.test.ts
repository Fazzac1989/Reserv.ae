import { describe, expect, it } from 'vitest';
import {
  ACTIONABLE_THRESHOLD,
  CONFIRMATION_THRESHOLD,
  checkDraft,
  normaliseReply,
} from './normalise';
import type { ParseOutput } from './schema';

function reply(overrides: Partial<ParseOutput> = {}): ParseOutput {
  return {
    outcome: 'confirmed',
    confidence: 0.97,
    summary: 'Venue confirmed the table.',
    alternative: null,
    question_for_ops: null,
    ...overrides,
  };
}

describe('confirmations are held to a high bar', () => {
  it('confirms when the venue clearly said yes', () => {
    const result = normaliseReply(reply());
    expect(result.decision.kind).toBe('confirm');
    expect(result.outcome).toBe('confirmed');
  });

  // The asymmetry that matters. Being wrong towards "escalate" costs an ops
  // task; being wrong towards "confirmed" costs a client standing outside a
  // restaurant that never had a table.
  it('refuses a confirmation just below the threshold', () => {
    const result = normaliseReply(reply({ confidence: CONFIRMATION_THRESHOLD - 0.01 }));
    expect(result.decision.kind).toBe('escalate');
    expect(result.outcome).toBe('unclear');
    if (result.decision.kind === 'escalate') {
      expect(result.decision.reason).toMatch(/89% sure/);
    }
  });

  it('accepts a confirmation exactly at the threshold', () => {
    expect(normaliseReply(reply({ confidence: CONFIRMATION_THRESHOLD })).decision.kind).toBe(
      'confirm',
    );
  });

  it('never confirms when the venue asked a question, however confident', () => {
    const result = normaliseReply(
      reply({ confidence: 1, question_for_ops: 'Do you want the terrace or inside?' }),
    );
    expect(result.decision.kind).toBe('escalate');
    expect(result.outcome).toBe('unclear');
    if (result.decision.kind === 'escalate') {
      expect(result.decision.reason).toContain('terrace or inside');
    }
  });
});

describe('alternatives go to the user, not to us', () => {
  it('carries the proposed time and party size through', () => {
    const result = normaliseReply(
      reply({
        outcome: 'alternative_offered',
        confidence: 0.9,
        alternative: {
          scheduled_for: '2026-02-07T18:30:00+04:00',
          party_size: 2,
          note: 'Only 6.30 left that evening',
        },
      }),
    );

    expect(result.decision.kind).toBe('alternative');
    if (result.decision.kind === 'alternative') {
      expect(result.decision.scheduledFor).toBe('2026-02-07T14:30:00.000Z');
      expect(result.decision.partySize).toBe(2);
      expect(result.decision.note).toBe('Only 6.30 left that evening');
    }
  });

  it('keeps the words but drops an unparseable time', () => {
    const result = normaliseReply(
      reply({
        outcome: 'alternative_offered',
        confidence: 0.85,
        alternative: { scheduled_for: 'later that evening', party_size: null, note: 'after 9ish' },
      }),
    );

    if (result.decision.kind === 'alternative') {
      expect(result.decision.scheduledFor).toBeNull();
      expect(result.decision.note).toBe('after 9ish');
    } else {
      throw new Error('expected an alternative');
    }
  });

  it('escalates an alternative that is too ambiguous to act on', () => {
    const result = normaliseReply(
      reply({ outcome: 'alternative_offered', confidence: ACTIONABLE_THRESHOLD - 0.01 }),
    );
    expect(result.decision.kind).toBe('escalate');
    expect(result.outcome).toBe('unclear');
  });
});

describe('declines', () => {
  it('accepts a clear decline', () => {
    const result = normaliseReply(reply({ outcome: 'declined', confidence: 0.95 }));
    expect(result.decision.kind).toBe('declined');
  });

  it('escalates a decline that is not clear enough', () => {
    const result = normaliseReply(reply({ outcome: 'declined', confidence: 0.5 }));
    expect(result.decision.kind).toBe('escalate');
  });
});

describe('anything unclear goes to a person', () => {
  it('escalates regardless of confidence', () => {
    const result = normaliseReply(reply({ outcome: 'unclear', confidence: 0.99 }));
    expect(result.decision.kind).toBe('escalate');
    expect(result.outcome).toBe('unclear');
  });

  it('always carries a summary an operator can read', () => {
    const result = normaliseReply(reply({ outcome: 'unclear', confidence: 0.4, summary: '  ' }));
    expect(result.decision.summary).toBe('Venue replied.');
  });
});

describe('outbound drafts are checked before anyone sees them', () => {
  const context = { clientFirstName: 'Chris', forbiddenTerms: ['Farrell', '+971501234567'] };

  it('passes a good message', () => {
    const message =
      "Good morning — I'd like to book a table for two on Saturday at 8pm, under the name Chris. Could you confirm if that works? Thank you, reservAI";
    expect(checkDraft(message, context)).toEqual({ ok: true, problems: [] });
  });

  // The prompt forbids this. This is what catches the day it does not hold.
  it('refuses a message claiming the booking is already made', () => {
    const result = checkDraft('Hello, the table for Chris is now booked for 8pm.', context);
    expect(result.ok).toBe(false);
    expect(result.problems).toContain('claims the booking is already made');
  });

  it('refuses a message that discloses being an AI', () => {
    const result = checkDraft('Hi, as an AI assistant I am booking for Chris at 8pm.', context);
    expect(result.problems).toContain('mentions being an AI');
  });

  it('refuses a message leaking the client’s surname', () => {
    const result = checkDraft('Hello — a table for Chris Farrell at 8pm please.', context);
    expect(result.problems).toContain('includes a personal detail that should not be shared');
  });

  it('refuses a message leaking the client’s phone number', () => {
    const result = checkDraft('Table for Chris at 8pm, reach them on +971501234567.', context);
    expect(result.problems).toContain('includes a personal detail that should not be shared');
  });

  it('refuses a message that never says who it is for', () => {
    const result = checkDraft('Hello, a table for two at 8pm on Saturday please.', context);
    expect(result.problems).toContain('does not name who the booking is for');
  });

  it('refuses a message too long for a venue to read on a phone', () => {
    const result = checkDraft(`Hello Chris ${'x'.repeat(1000)}`, context);
    expect(result.problems).toContain('too long for a venue to read on a phone');
  });

  it('reports every problem at once rather than one at a time', () => {
    const result = checkDraft('As an AI, I have booked a table for Chris Farrell.', context);
    expect(result.problems.length).toBeGreaterThanOrEqual(3);
  });
});
