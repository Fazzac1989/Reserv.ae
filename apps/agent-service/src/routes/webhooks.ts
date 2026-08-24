import type { FastifyInstance } from 'fastify';
import type { AgentServiceEnv } from '@reservai/config';
import { ClaudeProvider } from '@reservai/ai';
import { createWhatsAppProvider, whatsappUnavailableReason } from '../rails/whatsapp';
import { handleInboundMessage } from '../rails/whatsapp/inbound';
import { serviceClient } from '../supabase';
import { WEBHOOK_LIMIT } from '../rate-limit';

interface Options {
  env: AgentServiceEnv;
}

/**
 * Webhook ingestion.
 *
 * A webhook endpoint is a public URL that can move a booking to `confirmed`.
 * Three things therefore happen before anything else: the rail must be on, the
 * signature must verify against the raw bytes, and the delivery must not have
 * been processed already.
 */
export async function registerWebhookRoutes(app: FastifyInstance, { env }: Options): Promise<void> {
  const bsp = createWhatsAppProvider(env);
  const model = bsp
    ? new ClaudeProvider({
        apiKey: env.ANTHROPIC_API_KEY,
        models: { fast: env.AI_MODEL_FAST, strong: env.AI_MODEL_STRONG },
      })
    : null;

  // Signatures are computed over the exact bytes received. Re-serialising the
  // parsed JSON changes whitespace and key order and produces a different
  // digest, so the raw body is kept alongside the parsed one.
  app.addContentTypeParser(
    ['application/json', 'application/x-www-form-urlencoded'],
    { parseAs: 'string' },
    (request, body, done) => {
      (request as { rawBody?: string }).rawBody = body as string;
      if (request.headers['content-type']?.includes('json')) {
        try {
          done(null, JSON.parse(body as string));
        } catch {
          done(null, {});
        }
      } else {
        done(null, Object.fromEntries(new URLSearchParams(body as string)));
      }
    },
  );

  /**
   * Meta's verification handshake, forwarded by the BSP.
   *
   * Answering this before the rail is wired up would subscribe us to deliveries
   * we cannot verify or process.
   */
  app.get('/webhooks/whatsapp', async (request, reply) => {
    const unavailable = whatsappUnavailableReason(env);
    if (unavailable) return reply.status(503).send({ error: unavailable });

    const query = request.query as Record<string, string | undefined>;
    if (
      query['hub.mode'] === 'subscribe' &&
      env.WHATSAPP_WEBHOOK_VERIFY_TOKEN &&
      query['hub.verify_token'] === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    ) {
      return reply.status(200).send(query['hub.challenge']);
    }
    return reply.status(403).send({ error: 'Verification failed.' });
  });

  app.post('/webhooks/whatsapp', WEBHOOK_LIMIT, async (request, reply) => {
    const unavailable = whatsappUnavailableReason(env);
    if (unavailable || !bsp || !model) {
      return reply.status(503).send({ error: unavailable ?? 'WhatsApp rail is not available.' });
    }

    const rawBody = (request as { rawBody?: string }).rawBody ?? '';

    const verified = bsp.verifySignature({
      rawBody,
      headers: request.headers as Record<string, string | undefined>,
      // Signed by Twilio, so it must be the URL the provider actually posted
      // to — behind a proxy that is the forwarded host, not the local one.
      url: `${request.headers['x-forwarded-proto'] ?? request.protocol}://${request.headers['x-forwarded-host'] ?? request.headers.host}${request.url}`,
    });

    if (!verified) {
      // Deliberately terse. An attacker probing this endpoint learns nothing
      // about why their signature was wrong.
      request.log.warn({ path: request.url }, 'Rejected an unsigned WhatsApp webhook');
      return reply.status(401).send({ error: 'Bad signature.' });
    }

    const parsed = bsp.parseWebhook(rawBody);

    // Acknowledge fast and process inline. WhatsApp retries on a slow response,
    // and each retry is de-duplicated by claim_webhook_event, so a slow model
    // call cannot cause a booking to be confirmed twice.
    for (const message of parsed.messages) {
      try {
        const outcome = await handleInboundMessage(env, model, bsp.name, message);
        request.log.info({ outcome, from: message.fromE164 }, 'Handled a venue reply');
      } catch (error) {
        request.log.error({ err: error, eventId: message.eventId }, 'Failed to handle venue reply');
      }
    }

    for (const receipt of parsed.receipts) {
      const supabase = serviceClient(env);
      const { data: claimed } = await supabase.rpc('claim_webhook_event', {
        p_provider: bsp.name,
        p_external_id: receipt.eventId,
      });
      if (claimed !== true) continue;

      await supabase
        .from('venue_messages')
        .update({
          status: receipt.status === 'failed' ? 'failed' : receipt.status,
          error_message: receipt.error,
        })
        .eq('bsp_message_id', receipt.messageId);
    }

    return reply.status(200).send({ received: true });
  });

  app.post('/webhooks/twilio/voice', async (_request, reply) =>
    reply.status(503).send({ error: 'Voice rail lands in Phase 9.' }),
  );

  app.post('/webhooks/platform/:provider', async (_request, reply) =>
    reply.status(503).send({ error: 'API rail lands in Phase 8.' }),
  );
}
