'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '../supabase/server';
import { requireOps } from '../auth';

/**
 * Venue CRM mutations.
 *
 * Every action does three things in the same order: authorize (`requireOps`),
 * validate the whole payload with zod, then write. The Supabase client here
 * carries the operator's own session, so RLS is a second line of defence rather
 * than the only one — a bug in `requireOps` still cannot grant access the
 * database has not granted.
 */

export type ActionResult =
  | { ok: true }
  /**
   * On failure the submitted values come back with the message. React resets an
   * uncontrolled form once its action settles, so without this an operator
   * loses everything they typed the moment one field is wrong — which in a
   * data-entry console is worse than the original mistake.
   */
  | { ok: false; message: string; values?: Record<string, string> };

const RAIL_KINDS = ['api', 'whatsapp', 'voice', 'manual'] as const;
const e164 = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Expected E.164, e.g. +9715XXXXXXX');

function fail(message: string): ActionResult {
  return { ok: false, message };
}

/** Every string field the operator submitted, so the form can be rebuilt. */
function failWith(message: string, formData: FormData): ActionResult {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') values[key] = value;
  }
  return { ok: false, message, values };
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'That input was not valid.';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

/** Comma-separated free text into a clean array. */
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

// --- Venue ------------------------------------------------------------------

const venueInput = z.object({
  name: z.string().min(1).max(160),
  vertical: z.enum(['restaurant', 'salon', 'barber']),
  zone: z.enum(['dubai_marina', 'jbr', 'bluewaters']),
  price_band: z.coerce.number().int().min(1).max(4),
  address: z.string().max(300).nullable(),
  description: z.string().max(2000).nullable(),
  house_note: z.string().max(500).nullable(),
  tags: z.array(z.string().min(1)).max(40),
  best_times: z.array(z.string().min(1)).max(20),
  lat: z.coerce.number().min(-90).max(90).nullable(),
  lng: z.coerce.number().min(-180).max(180).nullable(),
});

function readVenue(formData: FormData) {
  const rawLat = toNullableString(formData.get('lat'));
  const rawLng = toNullableString(formData.get('lng'));

  return venueInput.safeParse({
    name: formData.get('name'),
    vertical: formData.get('vertical'),
    zone: formData.get('zone'),
    price_band: formData.get('price_band'),
    address: toNullableString(formData.get('address')),
    description: toNullableString(formData.get('description')),
    house_note: toNullableString(formData.get('house_note')),
    tags: toList(formData.get('tags')),
    best_times: toList(formData.get('best_times')),
    lat: rawLat,
    lng: rawLng,
  });
}

export async function createVenue(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireOps();

  const parsed = readVenue(formData);
  if (!parsed.success) return failWith(firstIssue(parsed.error), formData);

  // The column pair is constrained together; half a coordinate is not a location.
  if ((parsed.data.lat === null) !== (parsed.data.lng === null)) {
    return failWith('Give both latitude and longitude, or neither.', formData);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('venues')
    .insert({ ...parsed.data, onboarding_status: 'lead' })
    .select('id')
    .single();

  if (error) return failWith(error.message, formData);

  await supabase.rpc('record_ops_event', {
    p_entity_type: 'venue',
    p_entity_id: data.id,
    p_event: 'venue_created',
    p_payload: { name: parsed.data.name },
  });

  revalidatePath('/venues');
  redirect(`/venues/${data.id}`);
}

export async function updateVenue(
  venueId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireOps();

  const parsed = readVenue(formData);
  if (!parsed.success) return failWith(firstIssue(parsed.error), formData);
  if ((parsed.data.lat === null) !== (parsed.data.lng === null)) {
    return failWith('Give both latitude and longitude, or neither.', formData);
  }

  const supabase = await createClient();
  const { error } = await supabase.from('venues').update(parsed.data).eq('id', venueId);
  if (error) return failWith(error.message, formData);

  await supabase.rpc('record_ops_event', {
    p_entity_type: 'venue',
    p_entity_id: venueId,
    p_event: 'venue_updated',
    p_payload: { name: parsed.data.name },
  });

  revalidatePath(`/venues/${venueId}`);
  revalidatePath('/venues');
  return { ok: true } as const;
}

/**
 * Records that the venue agreed we may book on their behalf.
 *
 * This is a separate, deliberate act rather than a side effect of going live.
 * The database refuses `onboarding_status = 'live'` without it, and the pilot's
 * legal position rests on being able to say when each venue agreed.
 */
export async function recordBookingConsent(venueId: string, note: string): Promise<ActionResult> {
  await requireOps();

  const parsedNote = z.string().min(3).max(500).safeParse(note);
  if (!parsedNote.success) {
    return fail('Record how consent was obtained — who agreed, and when.');
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('venues')
    .update({ booking_consent_obtained_at: new Date().toISOString() })
    .eq('id', venueId);
  if (error) return fail(error.message);

  await supabase.rpc('record_ops_event', {
    p_entity_type: 'venue',
    p_entity_id: venueId,
    p_event: 'booking_consent_recorded',
    p_reason: parsedNote.data,
  });

  revalidatePath(`/venues/${venueId}`);
  return { ok: true };
}

const ONBOARDING = ['lead', 'contacted', 'agreed', 'live', 'paused', 'lost'] as const;

export async function setOnboardingStatus(
  venueId: string,
  status: string,
  reason?: string,
): Promise<ActionResult> {
  await requireOps();

  const parsed = z.enum(ONBOARDING).safeParse(status);
  if (!parsed.success) return fail(`Unknown onboarding status "${status}".`);

  const supabase = await createClient();

  const { data: venue, error: readError } = await supabase
    .from('venues')
    .select('onboarding_status, booking_consent_obtained_at')
    .eq('id', venueId)
    .single();
  if (readError) return fail(readError.message);

  // Say why up front rather than letting the check constraint surface as a
  // wall of Postgres text.
  if (parsed.data === 'live' && !venue.booking_consent_obtained_at) {
    return fail('Record booking consent before taking this venue live.');
  }

  const { error } = await supabase
    .from('venues')
    .update({ onboarding_status: parsed.data })
    .eq('id', venueId);
  if (error) return fail(error.message);

  await supabase.rpc('record_ops_event', {
    p_entity_type: 'venue',
    p_entity_id: venueId,
    p_event: 'onboarding_status_changed',
    p_reason: reason,
    p_payload: { from: venue.onboarding_status, to: parsed.data },
  });

  revalidatePath(`/venues/${venueId}`);
  revalidatePath('/venues');
  return { ok: true };
}

// --- Channels ---------------------------------------------------------------

const channelConfig = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('api'),
    platform: z.enum(['sevenrooms', 'eat_app', 'fresha', 'other']),
    external_venue_id: z.string().min(1).max(200),
    credentials_ref: z.string().min(1).max(200),
    supports_availability_lookup: z.boolean(),
  }),
  z.object({
    kind: z.literal('whatsapp'),
    phone_e164: e164,
    contact_name: z.string().max(120).nullable(),
    human_approval_required: z.boolean(),
  }),
  z.object({
    kind: z.literal('voice'),
    phone_e164: e164,
    recording_consent_obtained: z.boolean(),
    preferred_language: z.enum(['en', 'ar']),
  }),
  z.object({ kind: z.literal('manual'), instructions: z.string().min(1).max(1000) }),
]);

function readChannelConfig(kind: string, formData: FormData) {
  switch (kind) {
    case 'api':
      return {
        kind,
        platform: formData.get('platform'),
        external_venue_id: toNullableString(formData.get('external_venue_id')) ?? '',
        credentials_ref: toNullableString(formData.get('credentials_ref')) ?? '',
        supports_availability_lookup: formData.get('supports_availability_lookup') === 'on',
      };
    case 'whatsapp':
      return {
        kind,
        phone_e164: toNullableString(formData.get('phone_e164')) ?? '',
        contact_name: toNullableString(formData.get('contact_name')),
        human_approval_required: formData.get('human_approval_required') === 'on',
      };
    case 'voice':
      return {
        kind,
        phone_e164: toNullableString(formData.get('phone_e164')) ?? '',
        recording_consent_obtained: formData.get('recording_consent_obtained') === 'on',
        preferred_language: formData.get('preferred_language') ?? 'en',
      };
    default:
      return {
        kind: 'manual',
        instructions: toNullableString(formData.get('instructions')) ?? '',
      };
  }
}

export async function upsertChannel(
  venueId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireOps();

  const kind = String(formData.get('kind') ?? '');
  if (!(RAIL_KINDS as readonly string[]).includes(kind))
    return failWith('Pick a channel type.', formData);

  const config = channelConfig.safeParse(readChannelConfig(kind, formData));
  if (!config.success) return failWith(firstIssue(config.error), formData);

  const meta = z
    .object({
      priority: z.coerce.number().int().min(0).max(100),
      sla_minutes: z.coerce.number().int().min(1).max(1440),
      is_enabled: z.boolean(),
    })
    .safeParse({
      priority: formData.get('priority'),
      sla_minutes: formData.get('sla_minutes'),
      is_enabled: formData.get('is_enabled') === 'on',
    });
  if (!meta.success) return failWith(firstIssue(meta.error), formData);

  // The voice rail records calls. UAE consent rules are an open legal question,
  // so a voice channel cannot be switched on until someone has ticked that the
  // venue agreed to being recorded.
  if (
    meta.data.is_enabled &&
    config.data.kind === 'voice' &&
    !config.data.recording_consent_obtained
  ) {
    return failWith(
      'A voice channel cannot be enabled until recording consent is recorded.',
      formData,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from('venue_booking_channels').upsert(
    {
      venue_id: venueId,
      kind: config.data.kind,
      priority: meta.data.priority,
      sla_minutes: meta.data.sla_minutes,
      is_enabled: meta.data.is_enabled,
      config: config.data,
      last_verified_at: new Date().toISOString(),
    },
    { onConflict: 'venue_id,kind' },
  );
  if (error) return failWith(error.message, formData);

  await supabase.rpc('record_ops_event', {
    p_entity_type: 'venue',
    p_entity_id: venueId,
    p_event: 'channel_saved',
    p_payload: {
      kind: config.data.kind,
      priority: meta.data.priority,
      enabled: meta.data.is_enabled,
    },
  });

  revalidatePath(`/venues/${venueId}`);
  revalidatePath('/venues');
  return { ok: true };
}

/**
 * Reorders the fallback chain by swapping priorities with the neighbour.
 *
 * A swap rather than a renumber: priorities carry meaning to whoever set them,
 * and rewriting the whole list on every nudge would churn rows the rail
 * selector reads.
 */
export async function moveChannel(
  venueId: string,
  channelId: string,
  direction: 'up' | 'down',
): Promise<ActionResult> {
  await requireOps();

  const supabase = await createClient();
  const { data: channels, error } = await supabase
    .from('venue_booking_channels')
    .select('id, priority, kind')
    .eq('venue_id', venueId)
    .order('priority');
  if (error) return fail(error.message);

  const index = (channels ?? []).findIndex((c) => c.id === channelId);
  if (index === -1) return fail('That channel is no longer there.');

  const neighbourIndex = direction === 'up' ? index - 1 : index + 1;
  const current = channels[index];
  const neighbour = channels[neighbourIndex];
  if (!current || !neighbour) return fail('Already at the end of the chain.');

  // Equal priorities would make the swap a no-op and leave the order ambiguous.
  const currentPriority = current.priority;
  const neighbourPriority =
    neighbour.priority === currentPriority
      ? currentPriority + (direction === 'up' ? -1 : 1)
      : neighbour.priority;

  const results = await Promise.all([
    supabase
      .from('venue_booking_channels')
      .update({ priority: neighbourPriority })
      .eq('id', current.id),
    supabase
      .from('venue_booking_channels')
      .update({ priority: currentPriority })
      .eq('id', neighbour.id),
  ]);
  const firstError = results.find((r) => r.error)?.error;
  if (firstError) return fail(firstError.message);

  revalidatePath(`/venues/${venueId}`);
  return { ok: true };
}

export async function setChannelEnabled(
  venueId: string,
  channelId: string,
  enabled: boolean,
): Promise<ActionResult> {
  await requireOps();

  const supabase = await createClient();

  if (enabled) {
    const { data: channel } = await supabase
      .from('venue_booking_channels')
      .select('kind, config')
      .eq('id', channelId)
      .single();

    const config = channel?.config as { recording_consent_obtained?: boolean } | null;
    if (channel?.kind === 'voice' && !config?.recording_consent_obtained) {
      return fail('A voice channel cannot be enabled until recording consent is recorded.');
    }
  }

  const { error } = await supabase
    .from('venue_booking_channels')
    .update({ is_enabled: enabled })
    .eq('id', channelId);
  if (error) return fail(error.message);

  revalidatePath(`/venues/${venueId}`);
  revalidatePath('/venues');
  return { ok: true };
}

export async function deleteChannel(venueId: string, channelId: string): Promise<ActionResult> {
  await requireOps();

  const supabase = await createClient();
  const { error } = await supabase.from('venue_booking_channels').delete().eq('id', channelId);
  if (error) return fail(error.message);

  revalidatePath(`/venues/${venueId}`);
  revalidatePath('/venues');
  return { ok: true };
}

// --- Policies ---------------------------------------------------------------

const policyInput = z
  .object({
    min_lead_time_minutes: z.coerce.number().int().min(0).max(20160),
    max_lead_time_days: z.coerce.number().int().min(0).max(365),
    min_party_size: z.coerce.number().int().min(1).max(50),
    max_party_size: z.coerce.number().int().min(1).max(200),
    cancellation_notice_hours: z.coerce.number().int().min(0).max(336),
    cancellation_terms: z.string().max(1000).nullable(),
    requires_deposit: z.boolean(),
    notes: z.string().max(2000).nullable(),
  })
  .refine((p) => p.min_party_size <= p.max_party_size, {
    message: 'Minimum party size cannot exceed the maximum',
    path: ['min_party_size'],
  });

export async function upsertPolicy(
  venueId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireOps();

  const parsed = policyInput.safeParse({
    min_lead_time_minutes: formData.get('min_lead_time_minutes'),
    max_lead_time_days: formData.get('max_lead_time_days'),
    min_party_size: formData.get('min_party_size'),
    max_party_size: formData.get('max_party_size'),
    cancellation_notice_hours: formData.get('cancellation_notice_hours'),
    cancellation_terms: toNullableString(formData.get('cancellation_terms')),
    requires_deposit: formData.get('requires_deposit') === 'on',
    notes: toNullableString(formData.get('notes')),
  });
  if (!parsed.success) return failWith(firstIssue(parsed.error), formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from('venue_policies')
    .upsert({ venue_id: venueId, ...parsed.data }, { onConflict: 'venue_id' });
  if (error) return failWith(error.message, formData);

  await supabase.rpc('record_ops_event', {
    p_entity_type: 'venue',
    p_entity_id: venueId,
    p_event: 'policy_saved',
  });

  revalidatePath(`/venues/${venueId}`);
  revalidatePath('/venues');
  return { ok: true };
}

// --- Contacts ---------------------------------------------------------------

const contactInput = z.object({
  name: z.string().min(1).max(120),
  role: z.string().max(120).nullable(),
  phone_e164: e164.nullable(),
  email: z.string().email().max(200).nullable(),
  notes: z.string().max(2000).nullable(),
});

export async function createContact(
  venueId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireOps();

  const parsed = contactInput.safeParse({
    name: formData.get('name'),
    role: toNullableString(formData.get('role')),
    phone_e164: toNullableString(formData.get('phone_e164')),
    email: toNullableString(formData.get('email')),
    notes: toNullableString(formData.get('notes')),
  });
  if (!parsed.success) return failWith(firstIssue(parsed.error), formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from('venue_contacts')
    .insert({ venue_id: venueId, ...parsed.data });
  if (error) return failWith(error.message, formData);

  revalidatePath(`/venues/${venueId}`);
  return { ok: true };
}

export async function deleteContact(venueId: string, contactId: string): Promise<ActionResult> {
  await requireOps();

  const supabase = await createClient();
  const { error } = await supabase.from('venue_contacts').delete().eq('id', contactId);
  if (error) return fail(error.message);

  revalidatePath(`/venues/${venueId}`);
  return { ok: true };
}
