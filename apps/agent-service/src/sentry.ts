import * as Sentry from '@sentry/node';
import type { AgentServiceEnv } from '@reservai/config';

let initialised = false;

export function initSentry(env: AgentServiceEnv): void {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.RESERVAI_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    // Booking payloads carry venue contacts and user details — keep them out.
    sendDefaultPii: false,
  });
  initialised = true;
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!initialised) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Ties Sentry events to the booking or job that produced them. */
export function withCorrelation<T>(correlationId: string, fn: () => T): T {
  if (!initialised) return fn();
  return Sentry.withScope((scope) => {
    scope.setTag('correlation_id', correlationId);
    return fn();
  });
}
