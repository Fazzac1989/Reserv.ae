import { z } from 'zod';

/**
 * Environment parsing. Every boundary is zod-validated — process.env is a
 * boundary. A missing or malformed variable fails at boot, not at 2am inside a
 * booking attempt.
 */

export const RESERVAI_ENVS = ['demo', 'development', 'staging', 'production'] as const;
export type ReservaiEnv = (typeof RESERVAI_ENVS)[number];

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
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  REDIS_URL: z.string().url(),
  INTERNAL_API_SECRET: z.string().min(16),
});

/** The agent runtime: rails, queues, model calls. */
const agentServiceSchema = serverSchema.extend({
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
  SUPABASE_URL: z.string().url(),
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

export function loadAgentServiceEnv(source: NodeJS.ProcessEnv = process.env): AgentServiceEnv {
  return parse(agentServiceSchema.merge(flagSchema), source, 'agent-service');
}

export function loadServerEnv(
  source: NodeJS.ProcessEnv = process.env,
): ServerEnv & z.infer<typeof flagSchema> {
  return parse(serverSchema.merge(flagSchema), source, 'server');
}

export function loadPublicEnv(source: NodeJS.ProcessEnv = process.env): PublicEnv {
  return parse(publicSchema.merge(flagSchema), source, 'public');
}
