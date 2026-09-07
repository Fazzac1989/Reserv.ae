import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useSession } from '../store/session';
import { VENUE_CARD_COLUMNS, type VenueCardData } from './venues';

/**
 * The venues someone kept.
 *
 * Two queries rather than one. The set of ids is what a save control needs in
 * order to know whether it is filled, and it is read on every screen that
 * shows a venue; the full rows are needed only where saved venues are being
 * listed. Fetching the rows to answer "is this one saved" would mean every
 * card on Discover waiting on a join it does not use.
 */
export function useSavedIds() {
  const session = useSession();

  return useQuery({
    queryKey: ['saved-ids', session?.user.id ?? null],
    // Signed out there is nothing to fetch and no one to fetch it for. The
    // control still renders; pressing it asks them to sign in.
    enabled: Boolean(session),
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from('saved_venues').select('venue_id');
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.venue_id));
    },
  });
}

export function useSavedVenues() {
  const session = useSession();

  return useQuery({
    queryKey: ['saved-venues', session?.user.id ?? null],
    enabled: Boolean(session),
    queryFn: async (): Promise<VenueCardData[]> => {
      // Newest first: the one you just kept is the one you are looking for.
      const { data, error } = await supabase
        .from('saved_venues')
        .select(`created_at, venues (${VENUE_CARD_COLUMNS})`)
        .order('created_at', { ascending: false });
      if (error) throw error;

      return (data ?? [])
        .map((row) => row.venues as unknown as VenueCardData | null)
        .filter((v): v is VenueCardData => v !== null);
    },
  });
}

/**
 * Save and unsave, with the button updating before the round trip.
 *
 * A save is the smallest possible commitment and it should feel like one. The
 * optimistic update is rolled back on failure rather than left standing,
 * because a heart that fills and then quietly does not persist is worse than
 * one that never filled.
 */
export function useToggleSaved() {
  const client = useQueryClient();
  const session = useSession();
  const key = ['saved-ids', session?.user.id ?? null];

  return useMutation({
    mutationFn: async ({ venueId, saved }: { venueId: string; saved: boolean }) => {
      if (!session) throw new Error('Sign in to keep a venue.');

      if (saved) {
        const { error } = await supabase
          .from('saved_venues')
          .delete()
          .eq('venue_id', venueId)
          .eq('user_id', session.user.id);
        if (error) throw error;
        return;
      }

      /*
       * Insert, ignoring a duplicate — not an upsert.
       *
       * `upsert` sends ON CONFLICT DO UPDATE, which needs UPDATE privilege on
       * the table, and `saved_venues` is granted SELECT, INSERT and DELETE
       * only. It returned 403 rather than saving, which is the grant doing its
       * job: a row here is a primary key and a timestamp, so there is nothing
       * an update could legitimately change, and widening the grant to make
       * the call work would have handed out a privilege the feature does not
       * need.
       *
       * `ignoreDuplicates` sends ON CONFLICT DO NOTHING instead, so a double
       * tap is still a no-op rather than an error.
       */
      const { error } = await supabase
        .from('saved_venues')
        .upsert(
          { venue_id: venueId, user_id: session.user.id },
          { onConflict: 'user_id,venue_id', ignoreDuplicates: true },
        );
      if (error) throw error;
    },

    onMutate: async ({ venueId, saved }) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<Set<string>>(key);
      const next = new Set(previous ?? []);
      if (saved) next.delete(venueId);
      else next.add(venueId);
      client.setQueryData(key, next);
      return { previous };
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },

    onSettled: () => {
      void client.invalidateQueries({ queryKey: key });
      void client.invalidateQueries({ queryKey: ['saved-venues', session?.user.id ?? null] });
    },
  });
}
