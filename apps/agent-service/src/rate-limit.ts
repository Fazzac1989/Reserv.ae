import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * Rate limiting.
 *
 * Two different exposures, and they need different answers:
 *
 *   - The **model endpoints** cost real money per call. A stuck client retrying
 *     a failed request in a loop is not malicious and will still run up a bill,
 *     so the limit is per user rather than per IP — everyone behind one office
 *     NAT should not share a budget.
 *   - The **webhook** is a public URL. It is authenticated by signature, but an
 *     unauthenticated flood still costs us the verification work, so it is
 *     limited by IP before any of that happens.
 *
 * Keyed on the authenticated user where there is one. Falling back to IP for
 * signed-out traffic is the right default: a shared IP throttling several users
 * is annoying, but an unauthenticated caller getting a per-request budget is a
 * hole.
 */

function userOrIp(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    // The token itself, not the user id: identifying the user would mean
    // verifying the token against the auth server on every request, which is
    // the work the limit exists to protect.
    return `token:${header.slice(7, 47)}`;
  }
  return `ip:${request.ip}`;
}

export async function registerRateLimits(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: false,
    keyGenerator: userOrIp,
    // In-memory, which means per-instance. Correct for the pilot on one box;
    // running several instances needs the Redis store, and the limits below
    // would then be per-instance rather than per-user until it is added.
    errorResponseBuilder: (_request, context) => ({
      // statusCode has to be on the object itself. The plugin throws this, and
      // an error without a status reads as an unknown failure to the handler —
      // which would tell a throttled client the server is broken and invite it
      // to retry harder.
      statusCode: 429,
      error: `Too many requests. Try again in ${Math.ceil(context.ttl / 1000)}s.`,
      expose: true,
    }),
  });
}

/** Every model call goes through one of these. */
export const MODEL_LIMIT = {
  config: {
    rateLimit: {
      max: 20,
      timeWindow: '1 minute',
    },
  },
};

/** Cheap authenticated reads and writes. */
export const STANDARD_LIMIT = {
  config: {
    rateLimit: {
      max: 120,
      timeWindow: '1 minute',
    },
  },
};

/**
 * Public and unauthenticated. Generous, because a busy venue thread is real
 * traffic and dropping a genuine venue reply is worse than absorbing a flood.
 */
export const WEBHOOK_LIMIT = {
  config: {
    rateLimit: {
      max: 300,
      timeWindow: '1 minute',
      keyGenerator: (request: FastifyRequest) => `ip:${request.ip}`,
    },
  },
};
