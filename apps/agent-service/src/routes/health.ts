import type { FastifyInstance } from 'fastify';
import type { AgentServiceEnv } from '@reservai/config';
import { enabledRails } from '@reservai/config';
import { isTranscriptionConfigured } from '../transcription';
import { whatsappUnavailableReason } from '../rails/whatsapp';

interface Options {
  env: AgentServiceEnv;
}

export async function registerHealthRoutes(app: FastifyInstance, { env }: Options): Promise<void> {
  app.get('/health', async () => ({ status: 'ok' }));

  /**
   * What is actually live. The apps read this so they can show a feature as
   * unavailable rather than offering a control that silently does nothing —
   * the microphone is hidden when transcription is not configured.
   */
  app.get('/capabilities', async () => ({
    environment: env.RESERVAI_ENV,
    rails: enabledRails(env),
    whatsapp_bsp: env.WHATSAPP_BSP,
    concierge_chat: true,
    voice_notes: isTranscriptionConfigured(env),
    // Why the rail is off, in words, rather than just a false.
    whatsapp_rail: whatsappUnavailableReason(env) === null,
    whatsapp_unavailable_reason: whatsappUnavailableReason(env),
    // Free during the pilot. The app reads this rather than assuming.
    subscriptions: env.FLAG_STRIPE_SUBSCRIPTIONS,
  }));

  // Kept for the ops console, which already reads it.
  app.get('/health/rails', async () => ({
    environment: env.RESERVAI_ENV,
    enabled: enabledRails(env),
    whatsapp_bsp: env.WHATSAPP_BSP,
  }));
}
