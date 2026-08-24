'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@reservai/db';
import { publicEnv } from '../env';

/**
 * Browser client. Persists the session in cookies so server components and
 * middleware see the same session without a second sign-in.
 */
export function createClient() {
  return createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
