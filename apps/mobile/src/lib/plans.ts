import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { listReservations, type Reservation } from './agent';

/**
 * Plans, and the bookings that do not belong to one.
 *
 * A booking with no plan is not homeless — most of them will never need one.
 * "Dinner tonight" is a complete outcome by itself, and wrapping it in a plan
 * called "Dinner tonight" would be ceremony for its own sake. So the screen
 * shows both, and a plan is what you make when something genuinely has parts.
 */

export interface PlanItem {
  id: string;
  booking_id: string | null;
  title: string;
  category: string | null;
}

export interface Plan {
  id: string;
  title: string;
  starts_on: string | null;
  ends_on: string | null;
  plan_items: PlanItem[];
}

export function usePlans() {
  return useQuery({
    queryKey: ['plans'],
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabase
        .from('plans')
        .select('id, title, starts_on, ends_on, plan_items(id, booking_id, title, category)')
        .is('archived_at', null)
        .order('starts_on', { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });
}

/** Bookings, with the ones already inside a plan taken out. */
export function useLooseBookings() {
  return useQuery({
    queryKey: ['loose-bookings'],
    queryFn: async (): Promise<Reservation[]> => {
      const [reservations, items] = await Promise.all([
        listReservations(),
        supabase.from('plan_items').select('booking_id').not('booking_id', 'is', null),
      ]);
      const claimed = new Set((items.data ?? []).map((i) => i.booking_id));
      return reservations.upcoming.filter((b) => !claimed.has(b.id));
    },
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (title: string) => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) throw new Error('Sign in required.');

      const { error } = await supabase
        .from('plans')
        .insert({ user_id: userId, title: title.trim() });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plans'] }),
  });
}

export function useAddToPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { planId: string; booking: Reservation }) => {
      const { error } = await supabase.from('plan_items').insert({
        plan_id: input.planId,
        booking_id: input.booking.id,
        title: input.booking.venues?.name ?? 'Reservation',
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['plans'] });
      await queryClient.invalidateQueries({ queryKey: ['loose-bookings'] });
    },
  });
}

export function useArchivePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Archived rather than deleted: the bookings inside it happened, and a
      // plan is the only record of why they belonged together.
      const { error } = await supabase
        .from('plans')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['plans'] });
      await queryClient.invalidateQueries({ queryKey: ['loose-bookings'] });
    },
  });
}
