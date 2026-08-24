import type { FastifyBaseLogger } from 'fastify';
import type { AgentServiceEnv } from '@reservai/config';
import {
  REMINDERS,
  isReminderUseful,
  reminderCopy,
  reminderWindow,
  type ReminderKind,
} from '@reservai/core';
import { serviceClient } from './supabase';
import { sendPush } from './notifications/push';
import { applyTransition } from './bookings/transition';
import { sweepNudges } from './memory';

/**
 * The periodic sweep: reminders that are due, and venues that have gone quiet.
 *
 * Deliberately a database-backed sweep rather than a BullMQ job per booking.
 * The stack calls for BullMQ, and that is still the right tool for booking
 * *attempts*, which need retries and backoff. Reminders are different: the
 * question "who needs telling right now" is a query, the answer is idempotent
 * because of the unique constraint on `booking_reminders`, and nothing is lost
 * if the process dies mid-sweep. A queue would add a component that can lose
 * jobs to a problem that does not have that failure mode.
 */

export interface SweepResult {
  readonly remindersSent: number;
  readonly escalated: number;
  readonly nudgesSent: number;
  readonly errors: string[];
}

async function sweepReminders(
  env: AgentServiceEnv,
  log: FastifyBaseLogger,
  now: Date,
): Promise<{ sent: number; errors: string[] }> {
  const supabase = serviceClient(env);
  const errors: string[] = [];
  let sent = 0;

  for (const spec of REMINDERS) {
    const window = reminderWindow(spec, now);

    const { data: due, error } = await supabase.rpc('bookings_needing_reminder', {
      p_kind: spec.kind,
      p_window_start: window.from,
      p_window_end: window.to,
    });

    if (error) {
      errors.push(`${spec.kind}: ${error.message}`);
      continue;
    }

    for (const booking of due ?? []) {
      // The window is coarse; this is the per-booking judgement, and it is what
      // stops a "tomorrow" reminder going out for something confirmed an hour
      // before it starts.
      const { data: detail } = await supabase
        .from('bookings')
        .select('confirmed_at, status')
        .eq('id', booking.booking_id)
        .single();

      if (!detail?.confirmed_at) continue;
      if (
        !isReminderUseful(spec, new Date(booking.scheduled_for), new Date(detail.confirmed_at), now)
      ) {
        continue;
      }

      const copy = reminderCopy(spec.kind as ReminderKind, {
        venueName: booking.venue_name,
        scheduledFor: new Date(booking.scheduled_for),
        partySize: booking.party_size,
      });

      const push = await sendPush(env, booking.user_id, {
        title: copy.title,
        body: copy.body,
        data: { bookingId: booking.booking_id, kind: spec.kind },
      });

      // Recorded whether or not it reached a device. The row is what stops it
      // being tried again every minute; `delivered_to: 0` is the honest record
      // of a user with notifications off.
      const { error: writeError } = await supabase.from('booking_reminders').insert({
        booking_id: booking.booking_id,
        kind: spec.kind,
        delivered_to: push.delivered,
        error_message: push.errors.length > 0 ? push.errors.join('; ') : null,
        sent_at: now.toISOString(),
      });

      if (writeError) {
        // Another sweep got there first. That is the constraint doing its job.
        if (writeError.code !== '23505') errors.push(`${spec.kind}: ${writeError.message}`);
        continue;
      }

      sent += 1;

      // The first reminder is a state change: `confirmed` becomes `reminded`.
      if (spec.kind === 'day_before' && detail.status === 'confirmed') {
        await applyTransition(env, {
          bookingId: booking.booking_id,
          event: 'remind',
          actor: 'system',
          reason: 'Day-before reminder sent.',
          metadata: { kind: spec.kind, delivered: push.delivered },
        }).catch((error: unknown) => {
          log.warn({ err: error, bookingId: booking.booking_id }, 'Could not record the reminder');
        });
      }
    }
  }

  return { sent, errors };
}

/**
 * Venues that have gone quiet past their channel's SLA.
 *
 * The rule from the build plan: WhatsApp 20 minutes, voice after two failed
 * calls. Escalating creates work for a person and, in Phase 10, lets us tell
 * the user something honest rather than leaving them wondering.
 */
async function sweepSla(
  env: AgentServiceEnv,
  log: FastifyBaseLogger,
  now: Date,
): Promise<{ escalated: number; errors: string[] }> {
  const supabase = serviceClient(env);
  const errors: string[] = [];
  let escalated = 0;

  const { data: breached, error } = await supabase.rpc('bookings_past_sla', {
    p_now: now.toISOString(),
  });

  if (error) return { escalated: 0, errors: [error.message] };

  for (const row of breached ?? []) {
    try {
      await applyTransition(env, {
        bookingId: row.booking_id,
        event: 'escalate',
        actor: 'system',
        reason: `No reply from the venue in ${row.waited_minutes} minutes (${row.rail} SLA is ${row.sla_minutes}).`,
        metadata: { rail: row.rail, waitedMinutes: row.waited_minutes },
      });

      await supabase.from('ops_tasks').insert({
        kind: 'sla_breach',
        priority: 2,
        booking_id: row.booking_id,
        title: 'Venue has not replied',
        detail: `${row.waited_minutes} minutes with no answer on ${row.rail}. Chase or try another channel.`,
      });

      escalated += 1;
    } catch (transitionError) {
      // A booking that moved between the query and the write is not an error;
      // the state machine refusing a stale transition is the point.
      log.debug({ err: transitionError, bookingId: row.booking_id }, 'SLA escalation skipped');
    }
  }

  return { escalated, errors };
}

export async function runSweep(
  env: AgentServiceEnv,
  log: FastifyBaseLogger,
  now = new Date(),
): Promise<SweepResult> {
  const [reminders, sla, nudges] = await Promise.all([
    sweepReminders(env, log, now),
    sweepSla(env, log, now),
    sweepNudges(env, now),
  ]);

  return {
    remindersSent: reminders.sent,
    escalated: sla.escalated,
    nudgesSent: nudges.sent,
    errors: [...reminders.errors, ...sla.errors, ...nudges.errors],
  };
}

const SWEEP_INTERVAL_MS = 60_000;

/**
 * Starts the sweep loop. Returns a stop function for a clean shutdown.
 *
 * `setTimeout` rather than `setInterval`, so a slow sweep delays the next one
 * instead of overlapping with it.
 */
export function startScheduler(env: AgentServiceEnv, log: FastifyBaseLogger): () => void {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const result = await runSweep(env, log);
      if (
        result.remindersSent > 0 ||
        result.escalated > 0 ||
        result.nudgesSent > 0 ||
        result.errors.length > 0
      ) {
        log.info({ result }, 'Sweep finished');
      }
    } catch (error) {
      log.error({ err: error }, 'Sweep failed');
    } finally {
      if (!stopped) timer = setTimeout(() => void tick(), SWEEP_INTERVAL_MS);
    }
  };

  timer = setTimeout(() => void tick(), 5_000);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
