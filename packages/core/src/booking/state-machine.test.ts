import { describe, expect, it } from 'vitest';
import {
  ACTIVE_BOOKING_STATES,
  UNSETTLED_BOOKING_STATES,
  ACTORS,
  BOOKING_EVENTS,
  BOOKING_STATES,
  CONFIRMATION_CONFIDENCE_THRESHOLD,
  isTerminal,
  TERMINAL_STATES,
  type Actor,
  type BookingEvent,
  type BookingState,
} from './states';
import {
  assertConfirmationEvidence,
  canTransition,
  findRule,
  legalEvents,
  transition,
  TRANSITIONS,
  type ConfirmationEvidence,
  type TransitionInput,
} from './transitions';
import {
  IllegalTransitionError,
  InsufficientConfidenceError,
  MissingConfirmationEvidenceError,
  UnauthorizedActorError,
} from '../errors';

const AT = '2026-01-15T10:00:00.000Z';
const BOOKING_ID = 'bkg_test_0001';

/**
 * The expected lifecycle, written out by hand and independently of
 * transitions.ts. If the two ever disagree, one of them is a bug — and this
 * file is the specification, so the table is the one that moved.
 *
 * Key is `${from}:${event}`. Value is the destination and the exhaustive list
 * of actors permitted to drive it.
 */
const EXPECTED: Record<string, { to: BookingState; actors: Actor[] }> = {
  'draft:user_approve': { to: 'user_approved', actors: ['user'] },
  'draft:cancel': { to: 'cancelled', actors: ['user', 'ops'] },

  'user_approved:start_attempt': { to: 'attempting', actors: ['system', 'ops'] },
  'user_approved:cancel': { to: 'cancelled', actors: ['user', 'ops'] },

  'attempting:await_venue': { to: 'pending_venue', actors: ['system', 'ops'] },
  'attempting:confirm': {
    to: 'confirmed',
    actors: ['api_webhook', 'parsed_confirmation', 'ops'],
  },
  'attempting:retry_next_rail': { to: 'attempting', actors: ['system', 'ops'] },
  'attempting:decline': { to: 'failed', actors: ['system', 'ops'] },
  'attempting:escalate': { to: 'escalated', actors: ['system', 'ops'] },
  'attempting:cancel': { to: 'cancelled', actors: ['user', 'ops'] },
  'attempting:offer_alternative': {
    to: 'alternative_offered',
    actors: ['api_webhook', 'parsed_confirmation', 'ops'],
  },

  'pending_venue:confirm': {
    to: 'confirmed',
    actors: ['api_webhook', 'parsed_confirmation', 'ops'],
  },
  'pending_venue:retry_next_rail': { to: 'attempting', actors: ['system', 'ops'] },
  'pending_venue:decline': { to: 'failed', actors: ['system', 'ops'] },
  'pending_venue:escalate': { to: 'escalated', actors: ['system', 'ops'] },
  'pending_venue:cancel': { to: 'cancelled', actors: ['user', 'ops'] },
  'pending_venue:offer_alternative': {
    to: 'alternative_offered',
    actors: ['api_webhook', 'parsed_confirmation', 'ops'],
  },

  // Only the user may answer an offer. No 'system' on either decision edge:
  // accepting a different time on somebody's behalf is the authority this
  // product does not have, however obvious the answer looks.
  'alternative_offered:accept_alternative': { to: 'attempting', actors: ['user'] },
  'alternative_offered:decline_alternative': { to: 'attempting', actors: ['user'] },
  'alternative_offered:escalate': { to: 'escalated', actors: ['system', 'ops'] },
  'alternative_offered:cancel': { to: 'cancelled', actors: ['user', 'ops'] },

  // A cancellation is not done until the venue knows. The user asks; only a
  // venue acknowledgement or an ops action actually releases the table.
  'cancellation_requested:cancel': {
    to: 'cancelled',
    actors: ['api_webhook', 'parsed_confirmation', 'ops'],
  },
  'cancellation_requested:escalate': { to: 'escalated', actors: ['system', 'ops'] },

  'escalated:start_attempt': { to: 'attempting', actors: ['ops'] },
  'escalated:confirm': { to: 'confirmed', actors: ['ops'] },
  'escalated:decline': { to: 'failed', actors: ['ops'] },
  'escalated:cancel': { to: 'cancelled', actors: ['user', 'ops'] },

  'confirmed:request_cancellation': { to: 'cancellation_requested', actors: ['user', 'ops'] },
  'confirmed:remind': { to: 'reminded', actors: ['system'] },
  'confirmed:complete': { to: 'completed', actors: ['system', 'ops'] },
  // Ops only from here on. A user cancelling a table the venue is holding
  // goes through request_cancellation, so the venue hears about it before the
  // booking calls itself cancelled.
  'confirmed:cancel': { to: 'cancelled', actors: ['ops'] },

  'reminded:remind': { to: 'reminded', actors: ['system'] },
  'reminded:complete': { to: 'completed', actors: ['system', 'ops'] },
  'reminded:request_cancellation': { to: 'cancellation_requested', actors: ['user', 'ops'] },
  'reminded:cancel': { to: 'cancelled', actors: ['ops'] },
};

const key = (from: BookingState, event: BookingEvent) => `${from}:${event}`;

/** Evidence that satisfies the guard for a given confirming actor. */
function evidenceFor(actor: Actor): ConfirmationEvidence | undefined {
  switch (actor) {
    case 'api_webhook':
      return {
        kind: 'api_webhook',
        provider: 'sevenrooms',
        externalRef: 'SR-99213',
        payloadRef: 'storage://webhooks/sr-99213.json',
      };
    case 'parsed_confirmation':
      return {
        kind: 'parsed_confirmation',
        attemptId: 'att_0001',
        confidence: 0.97,
        transcriptRef: 'storage://wa-threads/att_0001.json',
      };
    case 'ops':
      return { kind: 'ops_action', opsUserId: 'ops_chris', note: 'Called the venue, table held.' };
    default:
      return undefined;
  }
}

function input(
  from: BookingState,
  event: BookingEvent,
  actor: Actor,
  overrides: Partial<TransitionInput> = {},
): TransitionInput {
  const evidence = event === 'confirm' ? evidenceFor(actor) : undefined;
  return {
    bookingId: BOOKING_ID,
    from,
    event,
    actor,
    occurredAt: AT,
    ...(evidence ? { evidence } : {}),
    ...overrides,
  };
}

describe('transition table — exhaustive matrix', () => {
  // Every state × every event × every actor. Nothing in the lifecycle is
  // untested and nothing can be added to the table unnoticed.
  for (const from of BOOKING_STATES) {
    for (const event of BOOKING_EVENTS) {
      const expected = EXPECTED[key(from, event)];

      if (!expected) {
        it(`rejects "${event}" from "${from}" for every actor`, () => {
          expect(findRule(from, event)).toBeUndefined();
          for (const actor of ACTORS) {
            expect(() => transition(input(from, event, actor))).toThrow(IllegalTransitionError);
            expect(canTransition(input(from, event, actor))).toBe(false);
          }
        });
        continue;
      }

      it(`allows "${event}" from "${from}" → "${expected.to}" for ${expected.actors.join('/')}`, () => {
        for (const actor of expected.actors) {
          const result = transition(input(from, event, actor));
          expect(result.to).toBe(expected.to);
          expect(result.event).toMatchObject({
            bookingId: BOOKING_ID,
            from,
            to: expected.to,
            event,
            actor,
            occurredAt: AT,
          });
        }
      });

      const forbidden = ACTORS.filter((a) => !expected.actors.includes(a));
      if (forbidden.length > 0) {
        it(`refuses "${event}" from "${from}" for ${forbidden.join('/')}`, () => {
          for (const actor of forbidden) {
            expect(() => transition(input(from, event, actor))).toThrow(UnauthorizedActorError);
          }
        });
      }
    }
  }

  /**
   * The matrix above already proves this state by state, but only as a side
   * effect of `venue` not appearing in any `actors` list. Stated here directly
   * so that adding the first venue edge has to delete a test that says, in
   * words, that venues cannot move bookings — rather than silently flipping a
   * generated case.
   */
  it('gives a venue no way to move a booking at all', () => {
    for (const from of BOOKING_STATES) {
      for (const event of BOOKING_EVENTS) {
        expect(canTransition(input(from, event, 'venue'))).toBe(false);
        expect(() => transition(input(from, event, 'venue'))).toThrow();
      }
    }

    const edgesNamingVenue = Object.values(TRANSITIONS).flatMap((events) =>
      Object.values(events).filter((rule) => rule.actors.includes('venue')),
    );
    expect(edgesNamingVenue).toEqual([]);
  });

  it('contains no edges beyond the specification', () => {
    const actual: string[] = [];
    for (const from of BOOKING_STATES) {
      for (const event of legalEvents(from)) {
        actual.push(key(from, event));
      }
    }
    expect(actual.sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('declares a destination and at least one actor on every edge', () => {
    for (const from of BOOKING_STATES) {
      for (const event of legalEvents(from)) {
        const rule = TRANSITIONS[from][event];
        expect(rule).toBeDefined();
        expect(BOOKING_STATES).toContain(rule?.to);
        expect(rule?.actors.length).toBeGreaterThan(0);
        expect(rule?.note.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('terminal states', () => {
  it('classifies exactly completed, cancelled and failed as terminal', () => {
    for (const state of BOOKING_STATES) {
      expect(isTerminal(state)).toBe((TERMINAL_STATES as readonly string[]).includes(state));
    }
  });

  it('accepts no further events once terminal', () => {
    for (const state of TERMINAL_STATES) {
      expect(legalEvents(state)).toEqual([]);
    }
  });
});

describe('reachability', () => {
  // A state nobody can reach is dead code pretending to be a lifecycle.
  it('reaches every state from draft', () => {
    const seen = new Set<BookingState>(['draft']);
    const queue: BookingState[] = ['draft'];
    while (queue.length > 0) {
      const current = queue.shift() as BookingState;
      for (const event of legalEvents(current)) {
        const next = TRANSITIONS[current][event]?.to;
        if (next && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect([...seen].sort()).toEqual([...BOOKING_STATES].sort());
  });
});

describe('confirmation guard — principle 1', () => {
  const confirmingStates: BookingState[] = ['attempting', 'pending_venue'];

  it('never lets the system confirm a booking by itself', () => {
    for (const from of [...confirmingStates, 'escalated' as BookingState]) {
      expect(() => transition(input(from, 'confirm', 'system'))).toThrow(UnauthorizedActorError);
    }
  });

  it('never lets the user confirm their own booking', () => {
    for (const from of [...confirmingStates, 'escalated' as BookingState]) {
      expect(() => transition(input(from, 'confirm', 'user'))).toThrow(UnauthorizedActorError);
    }
  });

  it('rejects a confirm with no evidence at all', () => {
    for (const from of confirmingStates) {
      expect(() =>
        transition({
          bookingId: BOOKING_ID,
          from,
          event: 'confirm',
          actor: 'api_webhook',
          occurredAt: AT,
        }),
      ).toThrow(MissingConfirmationEvidenceError);
    }
  });

  it('rejects evidence that does not match the claimed actor', () => {
    expect(() =>
      transition(
        input('pending_venue', 'confirm', 'api_webhook', {
          evidence: { kind: 'ops_action', opsUserId: 'ops_chris', note: 'looks fine' },
        }),
      ),
    ).toThrow(MissingConfirmationEvidenceError);

    expect(() =>
      transition(
        input('pending_venue', 'confirm', 'ops', {
          evidence: {
            kind: 'api_webhook',
            provider: 'fresha',
            externalRef: 'F-1',
            payloadRef: 'storage://x',
          },
        }),
      ),
    ).toThrow(MissingConfirmationEvidenceError);
  });

  it('rejects a parsed venue reply below the confidence threshold', () => {
    expect(() =>
      transition(
        input('pending_venue', 'confirm', 'parsed_confirmation', {
          evidence: {
            kind: 'parsed_confirmation',
            attemptId: 'att_0002',
            confidence: CONFIRMATION_CONFIDENCE_THRESHOLD - 0.01,
            transcriptRef: 'storage://wa-threads/att_0002.json',
          },
        }),
      ),
    ).toThrow(InsufficientConfidenceError);
  });

  it('accepts a parsed venue reply exactly at the threshold', () => {
    const result = transition(
      input('pending_venue', 'confirm', 'parsed_confirmation', {
        evidence: {
          kind: 'parsed_confirmation',
          attemptId: 'att_0003',
          confidence: CONFIRMATION_CONFIDENCE_THRESHOLD,
          transcriptRef: 'storage://wa-threads/att_0003.json',
        },
      }),
    );
    expect(result.to).toBe('confirmed');
  });

  it('carries the evidence through onto the audit event', () => {
    const result = transition(input('attempting', 'confirm', 'api_webhook'));
    expect(result.event.evidence).toEqual({
      kind: 'api_webhook',
      provider: 'sevenrooms',
      externalRef: 'SR-99213',
      payloadRef: 'storage://webhooks/sr-99213.json',
    });
  });

  it('is reusable on its own by the service layer', () => {
    expect(() =>
      assertConfirmationEvidence(input('pending_venue', 'confirm', 'ops')),
    ).not.toThrow();
    expect(() =>
      assertConfirmationEvidence({
        bookingId: BOOKING_ID,
        from: 'pending_venue',
        event: 'confirm',
        actor: 'system',
        occurredAt: AT,
        evidence: { kind: 'ops_action', opsUserId: 'ops_chris', note: 'n/a' },
      }),
    ).toThrow(MissingConfirmationEvidenceError);
  });
});

describe('audit event payload', () => {
  it('records reason and metadata when supplied', () => {
    const result = transition(
      input('pending_venue', 'escalate', 'system', {
        reason: 'No venue reply within the 20 minute WhatsApp SLA.',
        metadata: { attemptId: 'att_0004', slaMinutes: 20 },
      }),
    );
    expect(result.event.reason).toBe('No venue reply within the 20 minute WhatsApp SLA.');
    expect(result.event.metadata).toEqual({ attemptId: 'att_0004', slaMinutes: 20 });
  });

  it('omits optional fields rather than writing undefined into the log', () => {
    const result = transition(input('draft', 'user_approve', 'user'));
    expect(Object.keys(result.event)).toEqual([
      'bookingId',
      'from',
      'to',
      'event',
      'actor',
      'occurredAt',
    ]);
  });

  it('reports feasibility without throwing, for ops UI affordances', () => {
    expect(canTransition(input('escalated', 'confirm', 'ops'))).toBe(true);
    expect(canTransition(input('escalated', 'confirm', 'parsed_confirmation'))).toBe(false);
    expect(canTransition(input('completed', 'cancel', 'user'))).toBe(false);
  });
});

describe('rail fallback path', () => {
  // The realistic pilot journey: WhatsApp goes quiet, we fall back, ops saves it.
  it('walks approve → attempt → venue → SLA breach → retry → escalate → ops confirm', () => {
    let state: BookingState = 'draft';
    const log: string[] = [];

    const step = (event: BookingEvent, actor: Actor, extra: Partial<TransitionInput> = {}) => {
      const result = transition(input(state, event, actor, extra));
      log.push(`${state} -${event}-> ${result.to}`);
      state = result.to;
    };

    step('user_approve', 'user');
    step('start_attempt', 'system');
    step('await_venue', 'system');
    step('retry_next_rail', 'system', { reason: 'WhatsApp SLA breach' });
    step('escalate', 'system', { reason: 'Second rail also silent' });
    step('start_attempt', 'ops');
    step('confirm', 'ops');
    step('remind', 'system');
    step('remind', 'system');
    step('complete', 'system');

    expect(state).toBe('completed');
    expect(isTerminal(state)).toBe(true);
    expect(log).toEqual([
      'draft -user_approve-> user_approved',
      'user_approved -start_attempt-> attempting',
      'attempting -await_venue-> pending_venue',
      'pending_venue -retry_next_rail-> attempting',
      'attempting -escalate-> escalated',
      'escalated -start_attempt-> attempting',
      'attempting -confirm-> confirmed',
      'confirmed -remind-> reminded',
      'reminded -remind-> reminded',
      'reminded -complete-> completed',
    ]);
  });
});

describe('the derived state lists', () => {
  /*
   * These exist because the same mistake happened twice. Two places listed
   * booking states by hand, a state was added, and both lists were left
   * behind — one of which meant a venue's counter-offer could never reach the
   * person it was for.
   */
  it('counts every non-terminal state as active', () => {
    for (const state of BOOKING_STATES) {
      const active = (ACTIVE_BOOKING_STATES as readonly BookingState[]).includes(state);
      expect(active, `${state}`).toBe(!isTerminal(state));
    }
  });

  it('includes the states most likely to be forgotten', () => {
    // Named rather than left to the derivation, so a future change that
    // narrows the list has to delete a test that says why they matter.
    expect(ACTIVE_BOOKING_STATES).toContain('alternative_offered');
    expect(ACTIVE_BOOKING_STATES).toContain('cancellation_requested');
    expect(UNSETTLED_BOOKING_STATES).toContain('alternative_offered');
    expect(UNSETTLED_BOOKING_STATES).toContain('cancellation_requested');
  });

  it('treats a confirmed booking as active but not as work', () => {
    expect(ACTIVE_BOOKING_STATES).toContain('confirmed');
    expect(UNSETTLED_BOOKING_STATES).not.toContain('confirmed');
    expect(UNSETTLED_BOOKING_STATES).not.toContain('reminded');
  });

  it('never counts a finished booking as either', () => {
    for (const state of TERMINAL_STATES) {
      expect(ACTIVE_BOOKING_STATES).not.toContain(state);
      expect(UNSETTLED_BOOKING_STATES).not.toContain(state);
    }
  });
});
