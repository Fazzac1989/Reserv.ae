import {
  transition,
  type Actor,
  type BookingEvent,
  type BookingState,
  type ConfirmationEvidence,
} from '@reservai/core';
import type { AgentServiceEnv } from '@reservai/config';
import { serviceClient } from '../supabase';
import { ServiceError } from '../errors';

/**
 * The only way a booking changes state.
 *
 * Three things happen in order and none may be skipped:
 *
 *   1. `transition()` from packages/core decides whether the move is legal,
 *      whether this actor may make it, and whether the evidence is good enough.
 *      It throws rather than returning a bad answer.
 *   2. `apply_booking_transition` writes the status change and its audit row in
 *      one database transaction.
 *   3. The database's own guards run anyway — evidence, terminality, and the
 *      deferred check that an audit row exists.
 *
 * Nothing in this service writes `bookings.status` directly, and nothing else
 * is granted the RPC.
 */

export interface TransitionRequest {
  readonly bookingId: string;
  readonly event: BookingEvent;
  readonly actor: Actor;
  /** The auth user behind an ops or user action, for the audit trail. */
  readonly actorId?: string;
  readonly reason?: string;
  readonly evidence?: ConfirmationEvidence;
  readonly metadata?: Record<string, unknown>;
  readonly correlationId?: string;
  readonly externalRef?: string;
}

export class BookingTransitionError extends ServiceError {
  constructor(message: string, status = 409) {
    super(status, message);
  }
}

export async function applyTransition(
  env: AgentServiceEnv,
  input: TransitionRequest,
): Promise<{ from: BookingState; to: BookingState }> {
  const supabase = serviceClient(env);

  const { data: booking, error: readError } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('id', input.bookingId)
    .single();

  if (readError || !booking) {
    throw new BookingTransitionError('No such booking.', 404);
  }

  const from = booking.status as BookingState;

  // Throws IllegalTransitionError, UnauthorizedActorError,
  // MissingConfirmationEvidenceError or InsufficientConfidenceError.
  const result = transition({
    bookingId: input.bookingId,
    from,
    event: input.event,
    actor: input.actor,
    occurredAt: new Date().toISOString(),
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    ...(input.evidence !== undefined ? { evidence: input.evidence } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  });

  const { error: rpcError } = await supabase.rpc('apply_booking_transition', {
    p_booking_id: input.bookingId,
    p_from: from,
    p_to: result.to,
    p_event: input.event,
    p_actor: input.actor,
    p_actor_id: input.actorId ?? undefined,
    p_reason: input.reason ?? undefined,
    p_evidence: input.evidence ? JSON.parse(JSON.stringify(input.evidence)) : undefined,
    p_metadata: JSON.parse(JSON.stringify(input.metadata ?? {})),
    p_correlation_id: input.correlationId ?? undefined,
    p_external_ref: input.externalRef ?? undefined,
  });

  if (rpcError) {
    // The row moved between our read and our write — another rail or an
    // operator got there first. The caller must re-read and decide again.
    if (rpcError.code === '40001' || rpcError.message.includes('stale read')) {
      throw new BookingTransitionError(
        'That booking changed while you were looking at it. Reload and try again.',
      );
    }
    throw rpcError;
  }

  return { from, to: result.to };
}
