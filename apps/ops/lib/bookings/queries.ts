import type { Database } from '@reservai/db';
import { createClient } from '../supabase/server';

export type BookingState = Database['public']['Enums']['booking_state'];

export interface QueueRow {
  id: string;
  status: BookingState;
  party_size: number;
  scheduled_for: string;
  special_requests: string | null;
  venue: { id: string; name: string; zone: string } | null;
  user: { full_name: string | null; email: string; phone_e164: string | null } | null;
  channels: { kind: string; priority: number; is_enabled: boolean; config: unknown }[];
  task: { id: string; kind: string; priority: number; detail: string | null } | null;
}

/** Bookings that are not yet at rest, soonest first. */
const OPEN_STATES: BookingState[] = [
  'draft',
  'user_approved',
  'attempting',
  'pending_venue',
  'escalated',
];

export async function listQueue(includeSettled = false): Promise<QueueRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from('bookings')
    .select(
      'id, status, party_size, scheduled_for, special_requests, venues(id, name, zone), users(full_name, email, phone_e164), ops_tasks(id, kind, priority, detail, status)',
    )
    .order('scheduled_for');

  if (!includeSettled) query = query.in('status', OPEN_STATES);

  const { data, error } = await query;
  if (error) throw error;

  const venueIds = [...new Set((data ?? []).map((b) => b.venues?.id).filter(Boolean))] as string[];

  // The rails for each venue, so an operator can see how they are meant to
  // reach it without opening another tab.
  const { data: channels } = venueIds.length
    ? await supabase
        .from('venue_booking_channels')
        .select('venue_id, kind, priority, is_enabled, config')
        .in('venue_id', venueIds)
        .order('priority')
    : { data: [] };

  const byVenue = new Map<string, QueueRow['channels']>();
  for (const c of channels ?? []) {
    const list = byVenue.get(c.venue_id) ?? [];
    list.push({ kind: c.kind, priority: c.priority, is_enabled: c.is_enabled, config: c.config });
    byVenue.set(c.venue_id, list);
  }

  return (data ?? []).map((b) => {
    const tasks = (b.ops_tasks ?? []).filter(
      (t) => t.status === 'open' || t.status === 'in_progress',
    );
    const task = tasks[0] ?? null;
    return {
      id: b.id,
      status: b.status,
      party_size: b.party_size,
      scheduled_for: b.scheduled_for,
      special_requests: b.special_requests,
      venue: b.venues ? { id: b.venues.id, name: b.venues.name, zone: b.venues.zone } : null,
      user: b.users ?? null,
      channels: b.venues ? (byVenue.get(b.venues.id) ?? []) : [],
      task: task
        ? { id: task.id, kind: task.kind, priority: task.priority, detail: task.detail }
        : null,
    };
  });
}

export async function bookingHistory(bookingId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('events_log')
    .select('id, event, actor, from_state, to_state, reason, occurred_at')
    .eq('entity_type', 'booking')
    .eq('entity_id', bookingId)
    .order('occurred_at');
  return data ?? [];
}
