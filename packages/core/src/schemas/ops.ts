import { z } from 'zod';
import { actorSchema, bookingEventSchema, bookingStateSchema } from './booking';
import { isoDateTime, timestamps, uuid } from './common';

export const OPS_TASK_KINDS = [
  'manual_booking',
  'approve_outbound_message',
  'sla_breach',
  'unclear_venue_reply',
  'out_of_bounds_negotiation',
  'venue_data_gap',
] as const;
export const opsTaskKindSchema = z.enum(OPS_TASK_KINDS);

export const OPS_TASK_STATUSES = ['open', 'in_progress', 'resolved', 'dismissed'] as const;
export const opsTaskStatusSchema = z.enum(OPS_TASK_STATUSES);

/** Human-in-the-loop is a feature. This is that feature's queue. */
export const opsTaskSchema = z.object({
  id: uuid,
  kind: opsTaskKindSchema,
  status: opsTaskStatusSchema.default('open'),
  /** 1 = drop everything. Driven by how close the booking time is. */
  priority: z.number().int().min(1).max(5).default(3),
  booking_id: uuid.nullable(),
  booking_attempt_id: uuid.nullable(),
  venue_id: uuid.nullable(),
  user_id: uuid.nullable(),
  title: z.string().min(1).max(200),
  detail: z.string().max(4000).nullable(),
  assigned_to: uuid.nullable(),
  due_at: isoDateTime.nullable(),
  resolved_at: isoDateTime.nullable(),
  resolution_note: z.string().max(2000).nullable(),
  ...timestamps,
});
export type OpsTask = z.infer<typeof opsTaskSchema>;

/**
 * Append-only. Every state transition writes one of these in the same
 * transaction that moves `bookings.status`, so the log and the row can never
 * disagree. Nothing updates or deletes rows in this table.
 */
export const eventsLogSchema = z.object({
  id: uuid,
  /** 'booking' for lifecycle events; other entities may log here too. */
  entity_type: z.string().min(1).max(60),
  entity_id: uuid,
  event: bookingEventSchema.or(z.string().min(1).max(60)),
  actor: actorSchema,
  actor_id: uuid.nullable(),
  from_state: bookingStateSchema.nullable(),
  to_state: bookingStateSchema.nullable(),
  reason: z.string().max(1000).nullable(),
  payload: z.record(z.string(), z.unknown()).default({}),
  /** Ties an event to the job or conversation that caused it. */
  correlation_id: z.string().max(120).nullable(),
  occurred_at: isoDateTime,
  created_at: timestamps.created_at,
});
export type EventsLogEntry = z.infer<typeof eventsLogSchema>;
