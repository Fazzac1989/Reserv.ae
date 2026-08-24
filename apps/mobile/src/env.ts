import { z } from 'zod';

/**
 * Client-side environment. Only EXPO_PUBLIC_* values reach the device bundle,
 * and only the Supabase anon key is ever safe to put here.
 *
 * Inlined by Metro at build time, so these must be referenced as full literal
 * property accesses rather than destructured from process.env.
 */
const schema = z.object({
  supabaseUrl: z.string().url(),
  supabaseAnonKey: z.string().min(1),
  agentServiceUrl: z.string().url(),
  /** Sign in with Apple is iOS-only and needs no client id of our own. */
  googleClientId: z.string().min(1).optional(),
});

const parsed = schema.safeParse({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  agentServiceUrl: process.env.EXPO_PUBLIC_AGENT_SERVICE_URL,
  googleClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(
    `Missing mobile environment configuration:\n${issues}\n\nSee apps/mobile/.env.example.`,
  );
}

export const env = parsed.data;
