import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from '@reservai/db';
import { supabase } from './supabase';
import { useSession } from '../store/session';

export type Profile = Database['public']['Tables']['users']['Row'];
export type Preferences = Database['public']['Tables']['user_preferences']['Row'];
export type PreferencesUpdate = Database['public']['Tables']['user_preferences']['Update'];

/**
 * Profile and taste-profile access.
 *
 * Both rows are created by a database trigger the moment the account exists, so
 * these read paths never have to cope with a half-created user.
 */

/**
 * The signed-in person's profile row, or null if there isn't one.
 *
 * `maybeSingle` rather than `single`, and the difference matters. `single`
 * turns "no such row" into an HTTP 406 and an exception, which React Query
 * then treats as a failure to retry — and a failure that is retried is a
 * failure the app is waiting on rather than an answer it has. Worse, once a
 * successful result has been cached, a later refetch that fails leaves
 * `status` at 'success' and `isError` false, so a caller checking `isError`
 * to notice a deleted account never notices it.
 *
 * A missing row is not an error. It is a definite answer to a reasonable
 * question — is there a profile for this token? — and it means the account
 * behind the token is gone. Returning null says so unambiguously, and the
 * caller can act on it without having to interpret query metadata.
 */
export function useProfile() {
  const session = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function usePreferences() {
  const session = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['preferences', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Preferences> => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useSavePreferences() {
  const session = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: PreferencesUpdate) => {
      const { error } = await supabase
        .from('user_preferences')
        .update(patch)
        .eq('user_id', userId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['preferences', userId] }),
  });
}

export function useSaveProfile() {
  const session = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Database['public']['Tables']['users']['Update']) => {
      const { error } = await supabase.from('users').update(patch).eq('id', userId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
  });
}

/**
 * Writes the whole taste profile and marks onboarding complete.
 *
 * `onboarded_at` is set last: if the preferences write fails, the user lands
 * back in the wizard rather than in an app that thinks it knows them.
 */
export function useCompleteOnboarding() {
  const session = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { fullName: string; preferences: PreferencesUpdate }) => {
      const { error: prefError } = await supabase
        .from('user_preferences')
        .update(input.preferences)
        .eq('user_id', userId!);
      if (prefError) throw prefError;

      const { error: profileError } = await supabase
        .from('users')
        .update({
          full_name: input.fullName.trim() || null,
          onboarded_at: new Date().toISOString(),
        })
        .eq('id', userId!);
      if (profileError) throw profileError;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile', userId] });
      await queryClient.invalidateQueries({ queryKey: ['preferences', userId] });
    },
  });
}
