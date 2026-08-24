/** Base for every error the domain layer raises deliberately. */
export class ReservaiError extends Error {
  readonly code: string;
  readonly context: Record<string, unknown>;

  constructor(code: string, message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.context = context;
  }
}

/** The (state, event) pair is not in the transition table. */
export class IllegalTransitionError extends ReservaiError {
  constructor(context: { from: string; event: string; bookingId?: string }) {
    super(
      'ILLEGAL_TRANSITION',
      `Illegal booking transition: cannot apply "${context.event}" to a booking in state "${context.from}".`,
      context,
    );
  }
}

/** The transition exists but this actor may not perform it. */
export class UnauthorizedActorError extends ReservaiError {
  constructor(context: { from: string; event: string; actor: string; allowed: readonly string[] }) {
    super(
      'UNAUTHORIZED_ACTOR',
      `Actor "${context.actor}" may not apply "${context.event}" from state "${context.from}". Allowed: ${context.allowed.join(', ')}.`,
      context,
    );
  }
}

/**
 * Principle 1. A booking reached `confirm` without a deterministic confirmation
 * event behind it. This is the single most important guard in the codebase.
 */
export class MissingConfirmationEvidenceError extends ReservaiError {
  constructor(context: { actor: string; bookingId?: string; reason: string }) {
    super(
      'MISSING_CONFIRMATION_EVIDENCE',
      `Refusing to confirm booking: ${context.reason}`,
      context,
    );
  }
}

/** A parsed venue reply was not confident enough to be treated as truth. */
export class InsufficientConfidenceError extends ReservaiError {
  constructor(context: { confidence: number; threshold: number; bookingId?: string }) {
    super(
      'INSUFFICIENT_CONFIDENCE',
      `Parsed venue confirmation scored ${context.confidence.toFixed(2)}, below the ${context.threshold.toFixed(2)} threshold. Escalate to ops instead of guessing.`,
      context,
    );
  }
}
