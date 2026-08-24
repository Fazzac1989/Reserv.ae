import { createClient } from '../supabase/server';

export interface PendingMessage {
  id: string;
  body: string;
  error_message: string | null;
  created_at: string;
  booking_id: string | null;
  venue: { name: string } | null;
  booking: { scheduled_for: string; party_size: number; status: string } | null;
}

/**
 * The approval queue.
 *
 * Read straight from the database rather than through the agent service: this
 * is ops reading ops data under RLS, and it should keep working for review even
 * if the rail itself is down.
 */
export async function listPendingMessages(): Promise<PendingMessage[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('venue_messages')
    .select(
      'id, body, error_message, created_at, booking_id, venues(name), bookings(scheduled_for, party_size, status)',
    )
    .eq('status', 'awaiting_approval')
    .order('created_at');
  if (error) throw error;

  return (data ?? []).map((m) => ({
    id: m.id,
    body: m.body,
    error_message: m.error_message,
    created_at: m.created_at,
    booking_id: m.booking_id,
    venue: m.venues ? { name: m.venues.name } : null,
    booking: m.bookings
      ? {
          scheduled_for: m.bookings.scheduled_for,
          party_size: m.bookings.party_size,
          status: m.bookings.status,
        }
      : null,
  }));
}

export async function threadFor(bookingId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('venue_messages')
    .select(
      'id, direction, status, body, parsed_outcome, parsed_confidence, sent_at, created_at, error_message',
    )
    .eq('booking_id', bookingId)
    .order('created_at');
  return data ?? [];
}
