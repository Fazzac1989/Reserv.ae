import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './generated/database.types';

export type ReservaiClient = SupabaseClient<Database>;

export interface ClientOptions {
  url: string;
  key: string;
}

/** Where the SDK persists the session. React Native supplies its own. */
export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface AnonClientOptions extends ClientOptions {
  storage?: SessionStorage;
  /**
   * PKCE for anything that completes a redirect (mobile deep links, the ops
   * console's email links). Implicit is only for environments that cannot hold
   * a code verifier.
   */
  flowType?: 'pkce' | 'implicit';
  /** React Native has no URL to read a session out of. */
  detectSessionInUrl?: boolean;
}

/**
 * Anon-key client. Used by the mobile app and the ops console browser bundle.
 * Every table it touches is protected by RLS — authorization is enforced in
 * Postgres, not in the caller.
 */
export function createAnonClient(options: AnonClientOptions): ReservaiClient {
  const { url, key, storage, flowType = 'pkce', detectSessionInUrl = true } = options;
  return createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl,
      flowType,
      ...(storage ? { storage } : {}),
    },
  });
}

/**
 * Service-role client. Bypasses RLS entirely, so it is confined to the agent
 * service and ops server routes, and every caller must do its own
 * authorization check first.
 *
 * Never construct this in code that can be bundled for a browser or a device.
 */
export function createServiceClient({ url, key }: ClientOptions): ReservaiClient {
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-reservai-client': 'service' } },
  });
}

/** Client bound to an end user's access token: RLS applies as that user. */
export function createUserScopedClient(
  options: ClientOptions,
  accessToken: string,
): ReservaiClient {
  return createClient<Database>(options.url, options.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
