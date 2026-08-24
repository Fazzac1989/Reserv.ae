'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '../supabase/server';
import { requireOps } from '../auth';
import { agentServiceUrl } from '../env';
import type { ActionResult } from '../venues/actions';

/**
 * Booking actions from the console.
 *
 * The console does not write `bookings.status`. RLS would let it, but the
 * deferred audit trigger refuses any status change without a matching
 * events_log row — and ops cannot write that table. So every action here is a
 * call to the agent service, which owns the transition table and writes both
 * rows in one transaction.
 *
 * That is not an inconvenience to work around. It is the mechanism that makes
 * "the state machine owns bookings" true rather than aspirational.
 */

const OPS_EVENTS = [
  'start_attempt',
  'await_venue',
  'confirm',
  'decline',
  'escalate',
  'complete',
  'cancel',
] as const;

async function callAgent(path: string, body: unknown): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return { ok: false, message: 'Your session expired. Sign in again.' };

  let response: Response;
  try {
    response = await fetch(`${agentServiceUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    // Being specific matters here: an operator needs to know the difference
    // between "the venue said no" and "our own service is down".
    return {
      ok: false,
      message: 'The agent service is not reachable. Bookings cannot be moved until it is back.',
    };
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    return {
      ok: false,
      message: detail?.error ?? `The agent service refused that (${response.status}).`,
    };
  }

  return { ok: true };
}

export async function transitionBooking(
  bookingId: string,
  event: string,
  reason?: string,
): Promise<ActionResult> {
  // Authorize here as well as in the agent service. Two independent checks on
  // the one action that changes what a user believes about their evening.
  await requireOps();

  const parsed = z.enum(OPS_EVENTS).safeParse(event);
  if (!parsed.success) return { ok: false, message: `Ops cannot apply "${event}" from here.` };

  const result = await callAgent(`/bookings/${bookingId}/transition`, {
    event: parsed.data,
    ...(reason ? { reason } : {}),
  });

  revalidatePath('/bookings');
  return result;
}

/**
 * Marking a booking confirmed by hand.
 *
 * A note is mandatory. `confirmed` is the one state a user relies on, and a
 * human action only counts as evidence if there is a record of what the human
 * actually did — "spoke to Layla, table held under Farrell, 8pm".
 */
export async function confirmBooking(
  bookingId: string,
  note: string,
  externalRef?: string,
): Promise<ActionResult> {
  const user = await requireOps();

  const parsedNote = z.string().min(5).max(1000).safeParse(note.trim());
  if (!parsedNote.success) {
    return {
      ok: false,
      message: 'Say what you did to confirm it — who you spoke to, and what they agreed.',
    };
  }

  const result = await callAgent(`/bookings/${bookingId}/transition`, {
    event: 'confirm',
    evidence: { kind: 'ops_action', opsUserId: user.id, note: parsedNote.data },
    ...(externalRef ? { externalRef } : {}),
  });

  revalidatePath('/bookings');
  revalidatePath('/');
  return result;
}
