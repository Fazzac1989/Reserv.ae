import { z } from 'zod';

/**
 * Environment parsing. Every boundary is zod-validated — process.env is a
 * boundary. A missing or malformed variable fails at boot, not at 2am inside a
 * booking attempt.
 */

export const RESERVAI_ENVS = ['demo', 'development', 'staging', 'production'] as const;
export type ReservaiEnv = (typeof RESERVAI_ENVS)[number];

/**
 * A Supabase project URL is an origin and nothing more.
 *
 * The client appends its own `/auth/v1`, `/rest/v1` and `/storage/v1`. Pasting
 * the REST URL from the dashboard — which ends in `/rest/v1/` — produces
 * requests to paths like `/rest/v1/auth/v1/otp`, and the resulting error
 * mentions neither the setting nor what is wrong with it.
 */
const supabaseUrl = z
  .string()
  .url()
  .refine(
    (value) => {
      const { pathname } = new URL(value);
      return pathname === '' || pathname === '/';
    },
    {
      message:
        'must be the project address only, with nothing after it — ' +
        'https://YOUR-REF.supabase.co, not .../rest/v1/',
    },
  );

/**
 * The local development keys that ship with the Supabase CLI.
 *
 * Every install has the same ones, signed by `supabase-demo`. They sit in the
 * repository's own .env files for local work, which makes them the nearest
 * thing to hand when a deployment asks for a key — and pointing one at a real
 * project produces "Invalid API key" from Supabase, which says nothing about
 * why.
 */
export function isLocalDemoKey(key: string): boolean {
  const payload = key.split('.')[1];
  if (payload === undefined) return false;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    return (
      typeof decoded === 'object' &&
      decoded !== null &&
      (decoded as { iss?: unknown }).iss === 'supabase-demo'
    );
  } catch {
    // Not a JWT at all — the newer sb_publishable_ keys, for instance.
    return false;
  }
}

/** Whether the URL points at a Supabase running on this machine. */
export function isLocalSupabaseUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

export const DEMO_KEY_MESSAGE =
  'is the local development key that ships with the Supabase CLI, not your ' +
  'project key. Copy it from Supabase: Project Settings > API.';

const boolish = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

/** Variables every process needs, regardless of app. */
const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  RESERVAI_ENV: z.enum(RESERVAI_ENVS).default('development'),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
});

/** Anything that touches Postgres with elevated rights. */
const serverSchema = baseSchema.extend({
  SUPABASE_URL: supabaseUrl,
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  REDIS_URL: z.string().url(),
  INTERNAL_API_SECRET: z.string().min(16),
});

/**
 * Browser origins allowed to call this service.
 *
 * The phone app sends no Origin header and is unaffected by any of this. The
 * web build is a browser client, so without an entry here its requests fail as
 * "Failed to fetch" — a message that names neither CORS nor the setting.
 *
 * Empty by default: a service that talks to a browser should say which one.
 */
const webOrigins = z
  .string()
  .optional()
  .transform((value) =>
    value === undefined
      ? []
      : value
          .split(',')
          .map((o) => o.trim())
          .filter((o) => o.length > 0),
  )
  .refine(
    (origins) =>
      origins.every((o) => {
        try {
          const url = new URL(o);
          return (
            (url.protocol === 'https:' || url.protocol === 'http:') &&
            ['', '/'].includes(url.pathname) &&
            url.search === '' &&
            url.hash === ''
          );
        } catch {
          return false;
        }
      }),
    {
      message:
        'must be a comma-separated list of origins with nothing after the host — ' +
        'https://app.reserv.ae, not https://app.reserv.ae/chat',
    },
  );

/** The agent runtime: rails, queues, model calls. */
const agentServiceSchema = serverSchema.extend({
  WEB_ORIGINS: webOrigins,
  AGENT_SERVICE_PORT: z.coerce.number().int().positive().default(3030),
  ANTHROPIC_API_KEY: z.string().min(1),
  AI_MODEL_FAST: z.string().min(1),
  AI_MODEL_STRONG: z.string().min(1),
  AI_TRANSCRIPTION_PROVIDER: z.string().optional(),
  AI_TRANSCRIPTION_API_KEY: z.string().optional(),
  WHATSAPP_BSP: z.enum(['unset', 'twilio', '360dialog']).default('unset'),
  WHATSAPP_CONCIERGE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BOOKER_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_CALLER_NUMBER: z.string().optional(),
  // Dormant until FLAG_STRIPE_SUBSCRIPTIONS. Optional so the service starts
  // without them, which is the state it will be in for the whole pilot.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

/** Client bundles: only ever the anon key. */
const publicSchema = baseSchema.extend({
  SUPABASE_URL: supabaseUrl,
  SUPABASE_ANON_KEY: z.string().min(1),
  AGENT_SERVICE_URL: z.string().url(),
});

export const flagSchema = z.object({
  FLAG_RAIL_API: boolish.default('false'),
  FLAG_RAIL_WHATSAPP: boolish.default('false'),
  FLAG_RAIL_VOICE: boolish.default('false'),
  FLAG_RAIL_MANUAL: boolish.default('true'),
  FLAG_STRIPE_SUBSCRIPTIONS: boolish.default('false'),
  FLAG_PROACTIVE_SUGGESTIONS: boolish.default('false'),
});

export type BaseEnv = z.infer<typeof baseSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;
export type AgentServiceEnv = z.infer<typeof agentServiceSchema> & z.infer<typeof flagSchema>;
export type PublicEnv = z.infer<typeof publicSchema> & z.infer<typeof flagSchema>;

function parse<T extends z.ZodTypeAny>(
  schema: T,
  source: NodeJS.ProcessEnv,
  label: string,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid ${label} environment:\n${issues}\n\n` +
        'Set these in .env at the repository root — copy .env.example if it is missing.\n' +
        'Deployed environments set them in the hosting platform instead.',
    );
  }
  return result.data;
}

function assertKeysMatchProject(env: {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}): void {
  if (isLocalSupabaseUrl(env.SUPABASE_URL)) return;

  const offenders = [
    ['SUPABASE_ANON_KEY', env.SUPABASE_ANON_KEY],
    ['SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY],
  ].filter(([, value]) => typeof value === 'string' && isLocalDemoKey(value));

  if (offenders.length === 0) return;

  throw new Error(
    ['Invalid environment:', ...offenders.map(([name]) => `  - ${name}: ${DEMO_KEY_MESSAGE}`)].join(
      '\n',
    ),
  );
}

export function loadAgentServiceEnv(source: NodeJS.ProcessEnv = process.env): AgentServiceEnv {
  const env = parse(agentServiceSchema.merge(flagSchema), source, 'agent-service');
  assertKeysMatchProject(env);
  return env;
}

export function loadServerEnv(
  source: NodeJS.ProcessEnv = process.env,
): ServerEnv & z.infer<typeof flagSchema> {
  const env = parse(serverSchema.merge(flagSchema), source, 'server');
  assertKeysMatchProject(env);
  return env;
}

export function loadPublicEnv(source: NodeJS.ProcessEnv = process.env): PublicEnv {
  return parse(publicSchema.merge(flagSchema), source, 'public');
}
