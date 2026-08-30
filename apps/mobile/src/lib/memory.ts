import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { worthShowing, type Inference, type PreferenceSignal } from '@reservai/core';
import { supabase } from './supabase';

/**
 * What Riva has worked out, read straight from the database.
 *
 * Not through the agent service: this is the user's own data and row-level
 * security already says so. Routing it through a service that would only add
 * its own filter on user_id is a hop that can fail for no benefit.
 */

interface SignalRow {
  id: string;
  subject: string | null;
  attribute: string;
  value: string;
  observations: number;
  agreements: number;
  last_seen_at: string;
  rejected_at: string | null;
  confirmed_at: string | null;
}

export interface ShownInference extends Inference {
  readonly id: string;
}

export interface Person {
  id: string;
  name: string;
  relation: string;
  dietary: string[];
  allergies: string[];
}

function toSignal(row: SignalRow): PreferenceSignal {
  return {
    subject: row.subject,
    attribute: row.attribute,
    value: row.value,
    observations: row.observations,
    agreements: row.agreements,
    lastSeenAt: row.last_seen_at,
    rejectedAt: row.rejected_at,
    confirmedAt: row.confirmed_at,
  };
}

/** slug -> label, from the reference tables. "difc" is DIFC, not Difc. */
export function useLabels() {
  return useQuery({
    queryKey: ['labels'],
    // These change about once a month and are read on every render here.
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const [categories, places] = await Promise.all([
        supabase.from('categories').select('slug, label'),
        supabase.from('places').select('slug, label'),
      ]);
      const labels: Record<string, string> = {};
      for (const row of [...(categories.data ?? []), ...(places.data ?? [])]) {
        labels[row.slug] = row.label;
      }
      return labels;
    },
  });
}

export function useInferences() {
  return useQuery({
    queryKey: ['inferences'],
    queryFn: async (): Promise<ShownInference[]> => {
      const { data, error } = await supabase
        .from('preference_signals')
        .select(
          'id, subject, attribute, value, observations, agreements, last_seen_at, rejected_at, confirmed_at',
        );
      if (error) throw error;

      const rows = (data ?? []) as SignalRow[];
      const byKey = new Map(rows.map((r) => [`${r.subject}:${r.attribute}:${r.value}`, r.id]));

      // The ranking rule lives in core, where it is tested, rather than in a
      // query that would have to reimplement it in SQL.
      return worthShowing(rows.map(toSignal), new Date()).map((inference) => ({
        ...inference,
        id: byKey.get(`${inference.subject}:${inference.attribute}:${inference.value}`) ?? '',
      }));
    },
  });
}

/**
 * Correcting Riva.
 *
 * A rejected signal is kept rather than deleted, so the same conclusion is not
 * drawn again next month from the same behaviour. Being corrected and then
 * repeating yourself is worse than never having been corrected.
 */
export function useJudgeInference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; correct: boolean }) => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('preference_signals')
        .update(
          input.correct
            ? { confirmed_at: now, rejected_at: null }
            : { rejected_at: now, confirmed_at: null },
        )
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inferences'] }),
  });
}

export function usePeople() {
  return useQuery({
    queryKey: ['people'],
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await supabase
        .from('relationships')
        .select('id, name, relation, dietary, allergies')
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as Person[];
    },
  });
}

export function useSavePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; relation: string }) => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) throw new Error('Sign in required.');

      const { error } = await supabase.from('relationships').insert({
        user_id: userId,
        name: input.name.trim(),
        relation: input.relation.trim().toLowerCase(),
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['people'] }),
  });
}

export function useForgetPerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('relationships').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['people'] }),
  });
}

const PRICE_BANDS = ['', 'Everyday places', 'Mid-range', 'Upmarket', 'Somewhere special'];

/** "tag: japanese" reads like a database. "Japanese" reads like a person. */
export function describeInference(
  inference: Inference,
  labels: Record<string, string> = {},
): string {
  const titled = (v: string) => v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

  switch (inference.attribute) {
    case 'zone':
      // The place knows what it is called; a slug does not.
      return labels[inference.value] ?? titled(inference.value);
    case 'price_band':
      return PRICE_BANDS[Number(inference.value)] ?? inference.value;
    case 'time_of_day':
      return `Eating around ${inference.value}`;
    default:
      return titled(inference.value);
  }
}
