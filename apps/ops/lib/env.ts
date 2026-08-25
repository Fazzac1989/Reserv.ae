import { z } from 'zod';
import {
  DEMO_KEY_MESSAGE,
  isLocalDemoKey,
  isHeaderSafeKey,
  isLocalSupabaseUrl,
  keyMatchesProject,
  MASKED_KEY_MESSAGE,
  wrongProjectMessage,
} from '@reservai/config';

/**
 * Browser-visible configuration. Next inlines NEXT_PUBLIC_* at build time, so
 * these must be full literal property accesses rather than dynamic lookups.
 * Nothing secret belongs here — the service role key is read only in code that
 * never reaches the client bundle.
 */
const schema = z
  .object({
    // The project address only. The client appends /auth/v1 and /rest/v1 itself,
    // so a URL with a path on the end produces requests to nonsense paths and an
    // error that names neither the setting nor the cause.
    supabaseUrl: z
      .string()
      .url()
      .refine((value) => ['', '/'].includes(new URL(value).pathname), {
        message:
          'must be the project address only, with nothing after it — ' +
          'https://YOUR-REF.supabase.co, not .../rest/v1/',
      }),
    supabaseAnonKey: z
      .string()
      .min(1)
      // A masked value copied as bullets looks right and fails only in the
      // browser, long after the build that could have caught it.
      .refine(isHeaderSafeKey, { message: MASKED_KEY_MESSAGE }),
  })
  // A demo key is correct against a local Supabase and wrong against a real
  // project, so the pair is what has to be checked rather than either value.
  .refine(
    (value) => isLocalSupabaseUrl(value.supabaseUrl) || !isLocalDemoKey(value.supabaseAnonKey),
    { path: ['supabaseAnonKey'], message: DEMO_KEY_MESSAGE },
  )
  // A key from another of your own Supabase projects is a valid key in the
  // wrong place, and Supabase reports it as "Invalid API key" — which reads as
  // a mistyped character rather than the wrong dashboard.
  .refine(
    (value) => keyMatchesProject(value.supabaseUrl, value.supabaseAnonKey),
    (value) => ({
      path: ['supabaseAnonKey'],
      message: wrongProjectMessage(value.supabaseUrl, value.supabaseAnonKey),
    }),
  );

const NAMES: Record<string, string> = {
  supabaseUrl: 'NEXT_PUBLIC_SUPABASE_URL',
  supabaseAnonKey: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
};

const parsed = schema.safeParse({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

if (!parsed.success) {
  // This runs during `next build`, where an unhandled zod error surfaces only
  // as "Failed to collect page data" — which says nothing about the cause.
  // Deploying to a host with a missing variable is the single most likely way
  // this build fails, so it has to name the variable.
  const problems = parsed.error.issues
    .map((issue) => {
      const key = String(issue.path[0] ?? '');
      const name = NAMES[key] ?? key;
      const missing = issue.code === 'invalid_type' && process.env[name] === undefined;
      return `  - ${name}: ${missing ? 'is not set' : issue.message}`;
    })
    .join('\n');

  throw new Error(
    `The ops console is missing its configuration:\n${problems}\n\n` +
      'Locally: set these in apps/ops/.env.local (copy apps/ops/.env.example).\n' +
      'On Vercel: Project Settings > Environment Variables, then redeploy.\n' +
      'Both values are in Supabase under Project Settings > API.',
  );
}

export const publicEnv = parsed.data;

/**
 * Server-only. The console never writes booking status itself — it asks the
 * agent service, which owns the state machine.
 */
export const agentServiceUrl =
  process.env.AGENT_SERVICE_URL ??
  process.env.NEXT_PUBLIC_AGENT_SERVICE_URL ??
  'http://127.0.0.1:3030';
