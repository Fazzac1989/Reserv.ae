import {
  CONFIRMATION_CONFIDENCE_THRESHOLD,
  type Actor,
  type BookingEvent,
  type BookingState,
} from './states';
import {
  IllegalTransitionError,
  InsufficientConfidenceError,
  MissingConfirmationEvidenceError,
  UnauthorizedActorError,
} from '../errors';

export interface TransitionRule {
  readonly to: BookingState;
  readonly actors: readonly Actor[];
  /** Why this edge exists. Read by ops tooling and by whoever changes it next. */
  readonly note: string;
}

export type TransitionTable = {
  readonly [S in BookingState]: Partial<Record<BookingEvent, TransitionRule>>;
};

/**
 * The whole booking lifecycle, in one place. Anything not written here is
 * illegal and throws. Adding an edge is a deliberate act — the exhaustive
 * matrix test in state-machine.test.ts fails until the new edge is
 * acknowledged there too.
 */
export const TRANSITIONS: TransitionTable = {
  draft: {
    user_approve: {
      to: 'user_approved',
      actors: ['user'],
      note: 'Only the user may approve their own booking.',
    },
    cancel: {
      to: 'cancelled',
      actors: ['user', 'ops'],
      note: 'Abandoned before anything was said to the venue.',
    },
  },

  user_approved: {
    start_attempt: {
      to: 'attempting',
      actors: ['system', 'ops'],
      note: 'Queue worker picks up the highest-priority enabled rail.',
    },
    cancel: {
      to: 'cancelled',
      actors: ['user', 'ops'],
      note: 'User changed their mind before the rail fired.',
    },
  },

  attempting: {
    await_venue: {
      to: 'pending_venue',
      actors: ['system', 'ops'],
      note: 'Message sent or call placed; the venue now owes us an answer.',
    },
    confirm: {
      to: 'confirmed',
      actors: ['api_webhook', 'parsed_confirmation', 'ops'],
      note: 'API rails can confirm synchronously within a single attempt.',
    },
    retry_next_rail: {
      to: 'attempting',
      actors: ['system', 'ops'],
      note: 'This rail failed; fall back to the next channel in venue priority order.',
    },
    decline: {
      to: 'failed',
      actors: ['system', 'ops'],
      note: 'Venue said no and no rails remain.',
    },
    escalate: {
      to: 'escalated',
      actors: ['system', 'ops'],
      note: 'SLA breach or a reply we cannot parse confidently.',
    },
    cancel: {
      to: 'cancelled',
      actors: ['user', 'ops'],
      note: 'User pulled out mid-attempt; ops must still close the venue thread.',
    },
  },

  pending_venue: {
    confirm: {
      to: 'confirmed',
      actors: ['api_webhook', 'parsed_confirmation', 'ops'],
      note: 'The normal happy path for the WhatsApp and voice rails.',
    },
    retry_next_rail: {
      to: 'attempting',
      actors: ['system', 'ops'],
      note: 'Venue went quiet past SLA; try the next channel.',
    },
    decline: {
      to: 'failed',
      actors: ['system', 'ops'],
      note: 'Venue declined and no rails remain.',
    },
    escalate: {
      to: 'escalated',
      actors: ['system', 'ops'],
      note: 'SLA breach — WhatsApp 20 min, voice after 2 failed calls.',
    },
    cancel: {
      to: 'cancelled',
      actors: ['user', 'ops'],
      note: 'User pulled out while the venue was deciding.',
    },
  },

  escalated: {
    start_attempt: {
      to: 'attempting',
      actors: ['ops'],
      note: 'Ops unblocked it and put it back on a rail.',
    },
    confirm: {
      to: 'confirmed',
      actors: ['ops'],
      note: 'Ops booked it by hand. A human action is deterministic evidence.',
    },
    decline: {
      to: 'failed',
      actors: ['ops'],
      note: 'Ops could not place it. Tell the user honestly.',
    },
    cancel: {
      to: 'cancelled',
      actors: ['user', 'ops'],
      note: 'User gave up while we were still working it.',
    },
  },

  confirmed: {
    remind: {
      to: 'reminded',
      actors: ['system'],
      note: 'First reminder delivered (24h before).',
    },
    complete: {
      to: 'completed',
      actors: ['system', 'ops'],
      note: 'Booking time passed. No-show is recorded as an attribute, not a state.',
    },
    cancel: {
      to: 'cancelled',
      actors: ['user', 'ops'],
      note: 'Cancellation must still be executed against the venue by a rail.',
    },
  },

  reminded: {
    remind: {
      to: 'reminded',
      actors: ['system'],
      note: 'Second reminder (2h before). Callers dedupe by reminder kind.',
    },
    complete: {
      to: 'completed',
      actors: ['system', 'ops'],
      note: 'Booking time passed.',
    },
    cancel: {
      to: 'cancelled',
      actors: ['user', 'ops'],
      note: 'Late cancellation; the venue cancellation policy may apply.',
    },
  },

  completed: {},
  cancelled: {},
  failed: {},
};

/**
 * Deterministic proof that a booking really exists at the venue.
 * Principle 1: `confirmed` is unreachable without one of these.
 */
export type ConfirmationEvidence =
  | {
      readonly kind: 'api_webhook';
      /** e.g. sevenrooms | eat_app | fresha */
      readonly provider: string;
      /** The venue platform's own reservation id. */
      readonly externalRef: string;
      /** Storage pointer to the raw webhook body whose signature we verified. */
      readonly payloadRef: string;
    }
  | {
      readonly kind: 'parsed_confirmation';
      readonly attemptId: string;
      readonly confidence: number;
      /** Storage pointer to the message thread or call transcript. */
      readonly transcriptRef: string;
    }
  | {
      readonly kind: 'ops_action';
      readonly opsUserId: string;
      readonly note: string;
    };

export interface TransitionInput {
  readonly bookingId: string;
  readonly from: BookingState;
  readonly event: BookingEvent;
  readonly actor: Actor;
  /** ISO-8601. Supplied by the caller so this module stays pure and testable. */
  readonly occurredAt: string;
  readonly reason?: string;
  readonly evidence?: ConfirmationEvidence;
  readonly metadata?: Record<string, unknown>;
}

/** What the caller must append to `events_log`. Principle 2: every transition is audited. */
export interface TransitionEvent {
  readonly bookingId: string;
  readonly from: BookingState;
  readonly to: BookingState;
  readonly event: BookingEvent;
  readonly actor: Actor;
  readonly occurredAt: string;
  readonly reason?: string;
  readonly evidence?: ConfirmationEvidence;
  readonly metadata?: Record<string, unknown>;
}

export interface TransitionResult {
  readonly to: BookingState;
  readonly event: TransitionEvent;
}

export function findRule(from: BookingState, event: BookingEvent): TransitionRule | undefined {
  return TRANSITIONS[from][event];
}

/** Events that are legal from a state, ignoring actor and evidence. */
export function legalEvents(from: BookingState): BookingEvent[] {
  return Object.keys(TRANSITIONS[from]) as BookingEvent[];
}

/**
 * The confirmation guard, isolated so the service layer can reuse it and so it
 * reads as the standalone rule it is.
 *
 * `system` is deliberately absent from every `confirm` edge: our own scheduler
 * never has grounds to declare a venue booking real.
 */
export function assertConfirmationEvidence(input: TransitionInput): void {
  const { actor, evidence, bookingId } = input;

  if (!evidence) {
    throw new MissingConfirmationEvidenceError({
      actor,
      bookingId,
      reason: 'no confirmation evidence was supplied.',
    });
  }

  const expected: Partial<Record<Actor, ConfirmationEvidence['kind']>> = {
    api_webhook: 'api_webhook',
    parsed_confirmation: 'parsed_confirmation',
    ops: 'ops_action',
  };
  const required = expected[actor];

  if (!required || evidence.kind !== required) {
    throw new MissingConfirmationEvidenceError({
      actor,
      bookingId,
      reason: `actor "${actor}" cannot be backed by "${evidence.kind}" evidence.`,
    });
  }

  if (
    evidence.kind === 'parsed_confirmation' &&
    evidence.confidence < CONFIRMATION_CONFIDENCE_THRESHOLD
  ) {
    throw new InsufficientConfidenceError({
      confidence: evidence.confidence,
      threshold: CONFIRMATION_CONFIDENCE_THRESHOLD,
      bookingId,
    });
  }
}

/**
 * Apply an event to a booking state.
 *
 * Pure: it returns the next state plus the audit record to persist. It never
 * writes anything itself, so the caller owns the transaction that keeps
 * `bookings.status` and `events_log` in step.
 */
export function transition(input: TransitionInput): TransitionResult {
  const { from, event, actor, bookingId } = input;

  const rule = findRule(from, event);
  if (!rule) {
    throw new IllegalTransitionError({ from, event, bookingId });
  }

  if (!rule.actors.includes(actor)) {
    throw new UnauthorizedActorError({ from, event, actor, allowed: rule.actors });
  }

  if (event === 'confirm') {
    assertConfirmationEvidence(input);
  }

  return {
    to: rule.to,
    event: {
      bookingId,
      from,
      to: rule.to,
      event,
      actor,
      occurredAt: input.occurredAt,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.evidence !== undefined ? { evidence: input.evidence } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
  };
}

/** Non-throwing probe for UI affordances (which buttons ops may show). */
export function canTransition(input: TransitionInput): boolean {
  try {
    transition(input);
    return true;
  } catch {
    return false;
  }
}
