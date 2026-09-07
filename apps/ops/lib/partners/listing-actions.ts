'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '../supabase/server';
import { requireVenueMember, selectVenue } from '../partner-auth';
import type { ActionResult } from '../venues/actions';

/**
 * A venue editing its own listing.
 *
 * Three independent things refuse a partner who reaches past their own venue,
 * and they are deliberately not the same mechanism:
 *
 *   1. `requireVenueMember` here, which only knows venues they are a member of
 *   2. the RLS policy on `venues`, which the operator's own session is subject to
 *   3. the column guard trigger, which is what stops an UPDATE they *are*
 *      allowed to make from touching a column they are not
 *
 * The third is the one that matters most, because the first two would both pass
 * for a member editing their own row — the question is which columns.
 */

const listing = z.object({
  description: z.string().trim().max(2000).nullable(),
  address: z.string().trim().max(300).nullable(),
  tags: z.array(z.string().min(1).max(60)).max(30),
  best_times: z.array(z.string().min(1).max(60)).max(20),
});

function toList(value: FormDataEntryValue | null): string[] {
  if (typeof value !== 'string' || value.trim() === '') return [];
  return [
    ...new Set(
      value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

function toNullableString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export async function updateListing(
  venueId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const partner = await requireVenueMember();

  // Not "is this their venue" as a boolean — resolve it against their own
  // membership list, so an id they do not hold cannot select anything.
  const venue = selectVenue(partner, venueId);
  if (venue.id !== venueId) {
    return { ok: false, message: 'That is not one of your venues.' };
  }

  const parsed = listing.safeParse({
    description: toNullableString(formData.get('description')),
    address: toNullableString(formData.get('address')),
    tags: toList(formData.get('tags')),
    best_times: toList(formData.get('best_times')),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check those details.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('venues').update(parsed.data).eq('id', venueId);

  if (error) {
    // The column guard raises insufficient_privilege. It should be unreachable
    // from this form, which submits only the four fields above — if it fires,
    // the form and the trigger disagree and the trigger is right.
    if (error.code === '42501') {
      return { ok: false, message: `${error.message} Ask Reserv and we will change it for you.` };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath('/partner/listing');
  revalidatePath('/partner');
  return { ok: true };
}
