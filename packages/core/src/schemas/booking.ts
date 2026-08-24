import { z } from 'zod';
import { ACTORS, BOOKING_EVENTS, BOOKING_STATES } from '../booking/states';
import { isoDateTime, railKindSchema, timestamps, uuid } from './common';

export const bookingStateSchema = z.enum(BOOKING_STATES);
export const bookingEventSchema = z.enum(BOOKING_EVENTS);
export const actorSchema = z.enum(ACTORS);

/** Runtime mirror of the ConfirmationEvidence union in booking/transitions.ts. */
export const confirmationEvidenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('api_webhook'),
    provider: z.string().min(1),
    externalRef: z.string().min(1),
    payloadRef: z.string().min(1),
  }),
  z.object({
    kind: z.literal('parsed_confirmation'),
    attemptId: uuid,
    confidence: z.number().min(0).max(1),
    transcriptRef: z.string().min(1),
  }),
  z.object({
    kind: z.literal('ops_action'),
    opsUserId: uuid,
    note: z.string().min(1).max(1000),
  }),
]);

export const bookingSchema = z.object({
  id: uuid,
  user_id: uuid,
  venue_id: uuid,
  request_id: uuid.nullable(),
  suggestion_id: uuid.nullable(),
  status: bookingStateSchema,
  party_size: z.number().int().min(1).max(20),
  /** The exact time the user is holding. Not a window — a booking is a point. */
  scheduled_for: isoDateTime,
  /** For salons/barbers: which service, and with whom. */
  service_name: z.string().max(160).nullable(),
  provider_name: z.string().max(160).nullable(),
  special_requests: z.string().max(1000).nullable(),
  /**
   * Only ever written alongside a legal `confirm` transition. If this is set
   * and `status` is not `confirmed`, something bypassed the state machine.
   */
  confirmed_at: isoDateTime.nullable(),
  confirmation_evidence: confirmationEvidenceSchema.nullable(),
  /** The venue platform's reference, when a rail gives us one. */
  external_ref: z.string().max(200).nullable(),
  cancelled_at: isoDateTime.nullable(),
  cancellation_reason: z.string().max(500).nullable(),
  /** Attribute of a completed booking, not a lifecycle state. */
  no_show: z.boolean().default(false),
  rating: z.number().int().min(1).max(5).nullable(),
  ...timestamps,
});
export type Booking = z.infer<typeof bookingSchema>;

export const ATTEMPT_OUTCOMES = [
  'confirmed',
  'alternative_offered',
  'declined',
  'no_response',
  'unclear',
  'error',
] as const;
export const attemptOutcomeSchema = z.enum(ATTEMPT_OUTCOMES);
export type AttemptOutcome = z.infer<typeof attemptOutcomeSchema>;

/**
 * One row per rail attempt. This is the audit trail: every venue message,
 * recording and transcript hangs off it, and every one is linkable from the
 * booking record in the ops console.
 */
export const bookingAttemptSchema = z.object({
  id: uuid,
  booking_id: uuid,
  venue_channel_id: uuid.nullable(),
  rail: railKindSchema,
  /** 1-based, across all rails, so the fallback chain reads in order. */
  sequence: z.number().int().min(1),
  outcome: attemptOutcomeSchema.nullable(),
  /** How sure the parser was. Below the threshold this must produce an ops_task. */
  outcome_confidence: z.number().min(0).max(1).nullable(),
  /** What the venue offered instead, when outcome is `alternative_offered`. */
  offered_alternative: z
    .object({
      scheduled_for: isoDateTime.nullable(),
      party_size: z.number().int().min(1).max(20).nullable(),
      note: z.string().max(500).nullable(),
    })
    .nullable(),
  /** Storage pointers. Never inline transcripts or recordings in this row. */
  transcript_ref: z.string().max(500).nullable(),
  recording_ref: z.string().max(500).nullable(),
  thread_ref: z.string().max(500).nullable(),
  error_message: z.string().max(1000).nullable(),
  started_at: isoDateTime,
  ended_at: isoDateTime.nullable(),
  ...timestamps,
});
export type BookingAttempt = z.infer<typeof bookingAttemptSchema>;
