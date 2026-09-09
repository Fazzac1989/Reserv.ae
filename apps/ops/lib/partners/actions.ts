'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '../supabase/server';
import { requireOps } from '../auth';
import type { ActionResult } from '../venues/actions';

/**
 * Granting and withdrawing back-office access.
 *
 * Same order as every other ops mutation: authorize, validate, then write with
 * the operator's own session so RLS is a second line of defence rather than the
 * only one.
 *
 * There is no action here that creates an account. An invitation names an
 * address; the person signs in with a code sent to it, exactly as an end user
 * does, and `redeem_venue_invites()` turns the invitation into membership at
 * that point. Nothing in this file can conjure a login.
 */

const invite = z.object({
  email: z.string().trim().toLowerCase().email('That does not look like an email address.'),
  role: z.enum(['owner', 'manager', 'staff']),
});

export async function inviteVenueMember(
  venueId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const ops = await requireOps();

  const parsed = invite.safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check that address.' };
  }

  const supabase = await createClient();

  const { error } = await supabase.from('venue_invites').insert({
    venue_id: venueId,
    email: parsed.data.email,
    role: parsed.data.role,
    invited_by: ops.id,
  });

  if (error) {
    // The partial unique index is what enforces one live invitation per
    // address per venue, so this is the expected collision rather than a bug.
    if (error.code === '23505') {
      return { ok: false, message: `${parsed.data.email} has already been invited.` };
    }
    return { ok: false, message: error.message };
  }

  await supabase.rpc('record_ops_event', {
    p_entity_type: 'venue',
    p_entity_id: venueId,
    p_event: 'venue_access_invited',
    p_payload: { email: parsed.data.email, role: parsed.data.role },
  });

  revalidatePath(`/venues/${venueId}`);
  return { ok: true };
}

/**
 * Withdraw an invitation that has not been accepted.
 *
 * Marked revoked rather than deleted: the partial unique index ignores revoked
 * rows, so the address can be invited again, and the record of having invited
 * them survives.
 */
export async function revokeVenueInvite(venueId: string, inviteId: string): Promise<ActionResult> {
  await requireOps();

  const supabase = await createClient();
  const { error } = await supabase
    .from('venue_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId)
    .eq('venue_id', venueId);

  if (error) return { ok: false, message: error.message };

  await supabase.rpc('record_ops_event', {
    p_entity_type: 'venue',
    p_entity_id: venueId,
    p_event: 'venue_access_invite_revoked',
    p_payload: { invite_id: inviteId },
  });

  revalidatePath(`/venues/${venueId}`);
  return { ok: true };
}

/**
 * Remove someone's access.
 *
 * Deletes the membership rather than flagging it, because the membership row
 * *is* the grant — leaving a revoked one behind would mean every policy had to
 * remember to check a second column, and one that forgot would be a silent
 * hole. The audit log keeps the history instead.
 */
export async function removeVenueMember(venueId: string, userId: string): Promise<ActionResult> {
  await requireOps();

  const supabase = await createClient();
  const { error } = await supabase
    .from('venue_members')
    .delete()
    .eq('venue_id', venueId)
    .eq('user_id', userId);

  if (error) return { ok: false, message: error.message };

  await supabase.rpc('record_ops_event', {
    p_entity_type: 'venue',
    p_entity_id: venueId,
    p_event: 'venue_access_removed',
    p_payload: { user_id: userId },
  });

  revalidatePath(`/venues/${venueId}`);
  return { ok: true };
}
