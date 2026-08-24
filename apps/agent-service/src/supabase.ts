import { createServiceClient, createUserScopedClient, type ReservaiClient } from '@reservai/db';
import type { AgentServiceEnv } from '@reservai/config';

/**
 * Two clients, two different trust levels.
 *
 * The user-scoped client is the default for anything acting on a user's behalf:
 * RLS applies as that user, so a bug in this service cannot read or write
 * something the database would not have let the user touch themselves.
 *
 * The service client bypasses RLS and is reserved for the things the user
 * genuinely may not do — writing assistant turns, updating parsed intent, and
 * later, moving bookings through the state machine.
 */
export function serviceClient(env: AgentServiceEnv): ReservaiClient {
  return createServiceClient({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY });
}

export function userClient(env: AgentServiceEnv, accessToken: string): ReservaiClient {
  return createUserScopedClient({ url: env.SUPABASE_URL, key: env.SUPABASE_ANON_KEY }, accessToken);
}
