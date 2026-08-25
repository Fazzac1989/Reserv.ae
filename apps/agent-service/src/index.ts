import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import { loadEnvFile } from './load-env';
import { loadAgentServiceEnv, enabledRails } from '@reservai/config';
import { initSentry, captureException } from './sentry';
import { registerHealthRoutes } from './routes/health';
import { registerWebhookRoutes } from './routes/webhooks';
import { registerConciergeRoutes } from './routes/concierge';
import { registerSuggestionRoutes } from './routes/suggestions';
import { registerBookingRoutes } from './routes/bookings';
import { registerWhatsAppRoutes } from './routes/whatsapp';
import { registerLifecycleRoutes } from './routes/lifecycle';
import { registerPricingRoutes } from './routes/pricing';
import { startScheduler } from './scheduler';
import { registerRateLimits } from './rate-limit';
import { isExposable } from './errors';

/**
 * The agent runtime: webhook ingestion, BullMQ workers and the booking rails.
 *
 * Phase 0 boots the server, validates its environment and exposes health. The
 * rails themselves arrive in Phases 5, 6, 8 and 9 — until then their routes
 * answer honestly that they are disabled rather than pretending to work.
 */

// Read .env before validating, so a missing key is reported as a missing key
// rather than as a service that will not start for no stated reason.
const envFile = loadEnvFile();
const env = loadAgentServiceEnv();
initSentry(env);

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    // Never log a venue phone number, a user token or a webhook signature.
    redact: [
      'req.headers.authorization',
      'req.headers["x-hub-signature-256"]',
      'req.headers["x-internal-secret"]',
      '*.phone_e164',
      '*.access_token',
    ],
  },
  // WhatsApp and Twilio need the raw body for signature verification.
  bodyLimit: 5 * 1024 * 1024,
});

app.setErrorHandler((error: FastifyError, request, reply) => {
  // A plugin may have set the reply code before throwing — the rate limiter
  // does exactly this. Reading it back means a 429 stays a 429 instead of
  // being reported as an unknown server failure.
  const replyStatus = reply.statusCode >= 400 ? reply.statusCode : undefined;
  const status = error.statusCode ?? replyStatus ?? 500;

  // Deliberate errors carry a message written for a person; an unexpected one
  // could carry anything, so only its status leaves the process. A feature that
  // is switched off has to be able to say so, whatever its status code.
  const exposed = isExposable(error) || status < 500;

  if (!exposed) {
    captureException(error, { path: request.url, method: request.method });
    request.log.error({ err: error }, 'Unhandled request error');
  } else {
    request.log.info({ err: error, status }, 'Request refused');
  }

  reply.status(status).send({ error: exposed ? error.message : 'Internal Server Error' });
});

// The phone app sends no Origin header, so this changes nothing for it. The
// web build is a browser client and cannot reach a service that never answers
// a preflight — but only the origins named in the environment get an answer.
if (env.WEB_ORIGINS.length > 0) {
  await app.register(cors, {
    origin: env.WEB_ORIGINS,
    // The session travels in an Authorization header, not a cookie, so the
    // browser never needs to attach credentials to a cross-origin request.
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  });
  app.log.info({ origins: env.WEB_ORIGINS }, 'Browser origins allowed');
}

await registerRateLimits(app);

await app.register(registerHealthRoutes, { env });
await app.register(registerWebhookRoutes, { env });
await app.register(registerConciergeRoutes, { env });
await app.register(registerSuggestionRoutes, { env });
await app.register(registerBookingRoutes, { env });
await app.register(registerWhatsAppRoutes, { env });
await app.register(registerLifecycleRoutes, { env });
await app.register(registerPricingRoutes, { env });

if (envFile) app.log.info({ envFile }, 'Loaded environment file');

// Reminders and SLA escalation. Started after the routes so a failing sweep
// cannot stop the service from accepting requests.
const stopScheduler = startScheduler(env, app.log);

const rails = enabledRails(env);
app.log.info({ rails, environment: env.RESERVAI_ENV }, 'Enabled booking rails');

try {
  await app.listen({ port: env.AGENT_SERVICE_PORT, host: '0.0.0.0' });
} catch (error) {
  captureException(error);
  app.log.error({ err: error }, 'Failed to start agent-service');
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info({ signal }, 'Shutting down');
    stopScheduler();
    void app.close().then(() => process.exit(0));
  });
}
