'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '../supabase/server';
import { requireOps } from '../auth';
import { agentServiceUrl } from '../env';
import type { ActionResult } from '../venues/actions';

/**
 * Approving what we say to a venue.
 *
 * Like every booking action, this goes through the agent service rather than
 * the database. The console holds the operator's judgement; the service holds
 * the rail, the BSP credentials and the state machine.
 */

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
    return {
      ok: false,
      message: 'The agent service is not reachable. Nothing was sent.',
    };
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, message: detail?.error ?? `Refused (${response.status}).` };
  }

  return { ok: true };
}

/** Send the draft, optionally with the operator's edits. */
export async function approveMessage(messageId: string, body?: string): Promise<ActionResult> {
  await requireOps();

  const edited = body?.trim();
  if (edited !== undefined && edited.length > 0) {
    const parsed = z.string().min(1).max(4000).safeParse(edited);
    if (!parsed.success) return { ok: false, message: 'That message is too long to send.' };
  }

  const result = await callAgent(
    `/whatsapp/messages/${messageId}/approve`,
    edited ? { body: edited } : {},
  );

  revalidatePath('/messages');
  revalidatePath('/bookings');
  return result;
}

/** Discard a draft. A reason is required — it is what tunes the prompt later. */
export async function rejectMessage(messageId: string, reason: string): Promise<ActionResult> {
  await requireOps();

  const parsed = z.string().min(3).max(500).safeParse(reason.trim());
  if (!parsed.success) {
    return { ok: false, message: 'Say why — it is what tells us how the drafting is going wrong.' };
  }

  const result = await callAgent(`/whatsapp/messages/${messageId}/reject`, {
    reason: parsed.data,
  });

  revalidatePath('/messages');
  return result;
}
