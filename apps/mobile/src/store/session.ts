import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface SessionState {
  session: Session | null;
  /** True until the persisted session has been read off the keychain. */
  loading: boolean;
  setSession: (session: Session | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  loading: true,
  setSession: (session) => set({ session, loading: false }),
}));

/**
 * Starts listening for auth changes. Called once from the root layout.
 * Returns an unsubscribe function.
 *
 * The initial getSession() read matters: without it the app renders the
 * sign-in screen for a frame before the stored session loads, which reads as a
 * logout every time you open the app.
 */
export function initSessionListener(): () => void {
  void supabase.auth.getSession().then(({ data }) => {
    useSessionStore.getState().setSession(data.session);
  });

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    useSessionStore.getState().setSession(session);
  });

  return () => data.subscription.unsubscribe();
}

export const useSession = () => useSessionStore((s) => s.session);
export const useSessionLoading = () => useSessionStore((s) => s.loading);
