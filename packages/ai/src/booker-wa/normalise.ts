import type { ParseOutput } from './schema';

/**
 * The deterministic layer over a parsed venue reply.
 *
 * This is the most consequential piece of judgement in the product: it decides
 * whether a booking becomes `confirmed`, which is the one state a user acts on.
 * The model classifies; this decides what happens next, and it is deliberately
 * biased towards asking a human.
 */

/** Mirrors CONFIRMATION_CONFIDENCE_THRESHOLD in packages/core. */
export const CONFIRMATION_THRESHOLD = 0.9;

/**
 * Anything else that changes a booking — an alternative time, a decline —
 * needs less certainty than a confirmation, because getting it wrong costs an
 * ops task rather than an empty table.
 */
export const ACTIONABLE_THRESHOLD = 0.7;

export type ReplyDecision =
  /** High-confidence confirmation. May move the booking to `confirmed`. */
  | { kind: 'confirm'; confidence: number; summary: string }
  /** The venue proposed something else. The user decides, not us. */
  | {
      kind: 'alternative';
      confidence: number;
      summary: string;
      scheduledFor: string | null;
      partySize: number | null;
      note: string | null;
    }
  | { kind: 'declined'; confidence: number; summary: string }
  /** A person must look at it. Carries why, for the ops task. */
  | { kind: 'escalate'; confidence: number; summary: string; reason: string };

export interface NormalisedReply {
  readonly decision: ReplyDecision;
  /** The raw outcome, stored on the attempt regardless of what we do about it. */
  readonly outcome: 'confirmed' | 'alternative_offered' | 'declined' | 'unclear';
  readonly confidence: number;
}

function isValidIso(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export function normaliseReply(output: ParseOutput): NormalisedReply {
  const confidence = output.confidence;
  const summary = output.summary.trim() || 'Venue replied.';

  // A question always goes to a person, however confident the classification.
  // Answering a venue's question is not something an agent should improvise
  // mid-booking.
  if (output.question_for_ops && output.question_for_ops.trim().length > 0) {
    return {
      decision: {
        kind: 'escalate',
        confidence,
        summary,
        reason: `The venue asked: ${output.question_for_ops.trim()}`,
      },
      outcome: output.outcome === 'confirmed' ? 'unclear' : output.outcome,
      confidence,
    };
  }

  switch (output.outcome) {
    case 'confirmed': {
      if (confidence < CONFIRMATION_THRESHOLD) {
        // The expensive mistake in one direction is an ops task; in the other
        // it is a client standing outside a restaurant that never had a table.
        return {
          decision: {
            kind: 'escalate',
            confidence,
            summary,
            reason: `Read as a confirmation but only ${(confidence * 100).toFixed(0)}% sure. Check the thread before telling the client.`,
          },
          outcome: 'unclear',
          confidence,
        };
      }
      return {
        decision: { kind: 'confirm', confidence, summary },
        outcome: 'confirmed',
        confidence,
      };
    }

    case 'alternative_offered': {
      if (confidence < ACTIONABLE_THRESHOLD) {
        return {
          decision: {
            kind: 'escalate',
            confidence,
            summary,
            reason: 'Looks like an alternative was offered, but the reply is ambiguous.',
          },
          outcome: 'unclear',
          confidence,
        };
      }

      const proposed = output.alternative?.scheduled_for ?? null;
      // A time we cannot parse is not a time. Keep the words, drop the claim.
      const scheduledFor =
        proposed && isValidIso(proposed) ? new Date(proposed).toISOString() : null;

      return {
        decision: {
          kind: 'alternative',
          confidence,
          summary,
          scheduledFor,
          partySize: output.alternative?.party_size ?? null,
          note: output.alternative?.note?.trim() || null,
        },
        outcome: 'alternative_offered',
        confidence,
      };
    }

    case 'declined': {
      if (confidence < ACTIONABLE_THRESHOLD) {
        return {
          decision: {
            kind: 'escalate',
            confidence,
            summary,
            reason: 'Looks like a decline, but not clearly enough to act on.',
          },
          outcome: 'unclear',
          confidence,
        };
      }
      return {
        decision: { kind: 'declined', confidence, summary },
        outcome: 'declined',
        confidence,
      };
    }

    default:
      return {
        decision: {
          kind: 'escalate',
          confidence,
          summary,
          reason: 'The reply could not be read confidently.',
        },
        outcome: 'unclear',
        confidence,
      };
  }
}

/**
 * Last line of defence on an outbound draft.
 *
 * The prompt forbids these; this catches the case where it did not hold. A
 * message that leaks a client's details or claims a booking is already made
 * must never reach a venue, so it is held for a human instead.
 */
export interface DraftCheck {
  readonly ok: boolean;
  readonly problems: string[];
}

const FORBIDDEN_CLAIMS = [
  /\bis (?:now )?(?:booked|confirmed|reserved)\b/i,
  /\bhave (?:booked|reserved)\b/i,
  /\bi(?:'ve| have) confirmed\b/i,
];

const AI_DISCLOSURE = /\b(?:as an ai|i am an ai|ai assistant|language model|chatbot)\b/i;

export function checkDraft(
  message: string,
  context: { clientFirstName: string; forbiddenTerms?: readonly string[] },
): DraftCheck {
  const problems: string[] = [];

  if (FORBIDDEN_CLAIMS.some((p) => p.test(message))) {
    problems.push('claims the booking is already made');
  }
  if (AI_DISCLOSURE.test(message)) {
    problems.push('mentions being an AI');
  }

  // Personal data beyond the first name. The client's surname, number and email
  // are ours to hold, not the venue's to receive.
  for (const term of context.forbiddenTerms ?? []) {
    const trimmed = term.trim();
    if (trimmed.length > 2 && message.toLowerCase().includes(trimmed.toLowerCase())) {
      problems.push('includes a personal detail that should not be shared');
      break;
    }
  }

  if (!message.toLowerCase().includes(context.clientFirstName.toLowerCase())) {
    problems.push('does not name who the booking is for');
  }
  if (message.length > 900) {
    problems.push('too long for a venue to read on a phone');
  }

  return { ok: problems.length === 0, problems };
}
