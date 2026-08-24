import { z } from 'zod';

/**
 * Browser-visible configuration. Next inlines NEXT_PUBLIC_* at build time, so
 * these must be full literal property accesses rather than dynamic lookups.
 * Nothing secret belongs here — the service role key is read only in code that
 * never reaches the client bundle.
 */
const schema = z.object({
  supabaseUrl: z.string().url(),
  supabaseAnonKey: z.string().min(1),
});

export const publicEnv = schema.parse({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

/**
 * Server-only. The console never writes booking status itself — it asks the
 * agent service, which owns the state machine.
 */
export const agentServiceUrl =
  process.env.AGENT_SERVICE_URL ??
  process.env.NEXT_PUBLIC_AGENT_SERVICE_URL ??
  'http://127.0.0.1:3030';
