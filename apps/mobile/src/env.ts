import { z } from 'zod';
import {
  isHeaderSafeKey,
  keyMatchesProject,
  MASKED_KEY_MESSAGE,
  wrongProjectMessage,
} from '@reservai/config';

/**
 * Client-side environment. Only EXPO_PUBLIC_* values reach the device bundle,
 * and only the Supabase anon key is ever safe to put here.
 *
 * Inlined by Metro at build time, so these must be referenced as full literal
 * property accesses rather than destructured from process.env.
 */
const schema = z
  .object({
    supabaseUrl: z.string().url(),
    supabaseAnonKey: z
      .string()
      .min(1)
      // A masked value copied as bullets looks right and fails only in the
      // browser, long after the build that could have caught it.
      .refine(isHeaderSafeKey, { message: MASKED_KEY_MESSAGE }),
    agentServiceUrl: z.string().url(),
    /** Sign in with Apple is iOS-only and needs no client id of our own. */
    googleClientId: z.string().min(1).optional(),
  })
  // A key from another of your own Supabase projects is a valid key pointed at
  // the wrong place. Supabase calls it "Invalid API key", which sends you to
  // check the characters rather than which dashboard they came from — and in a
  // built app the answer only appears when someone tries to sign in.
  .refine(
    (value) => keyMatchesProject(value.supabaseUrl, value.supabaseAnonKey),
    (value) => ({
      path: ['supabaseAnonKey'],
      message: wrongProjectMessage(value.supabaseUrl, value.supabaseAnonKey),
    }),
  );

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
