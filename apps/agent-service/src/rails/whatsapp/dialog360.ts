import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  ensurePlus,
  stripPlus,
  WhatsAppNotConfiguredError,
  WhatsAppSendError,
  type DeliveryReceipt,
  type InboundMessage,
  type OutboundTemplate,
  type OutboundText,
  type ParsedWebhook,
  type SendResult,
  type WebhookVerification,
  type WhatsAppProvider,
} from './provider';

export interface Dialog360Config {
  readonly apiKey: string;
  /** Meta app secret, used to verify the forwarded X-Hub-Signature-256. */
  readonly appSecret: string;
  readonly baseUrl?: string;
}

/**
 * 360dialog, which fronts the WhatsApp Business Cloud API.
 *
 * Payloads are Meta's Cloud API shape, so webhooks are JSON and signed with
 * HMAC-SHA256 over the raw request body. That signature is computed over the
 * exact bytes received — re-serialising the parsed JSON changes whitespace and
 * key order and produces a different digest, which is why the raw string is
 * threaded all the way through from the route.
 */
export class Dialog360Provider implements WhatsAppProvider {
  readonly name = '360dialog';
  readonly #baseUrl: string;

  constructor(private readonly config: Dialog360Config) {
    if (!config.apiKey) {
      throw new WhatsAppNotConfiguredError('360dialog needs an API key.');
    }
    this.#baseUrl = config.baseUrl ?? 'https://waba-v2.360dialog.io';
  }

  async #post(payload: Record<string, unknown>): Promise<SendResult> {
    const response = await fetch(`${this.#baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'D360-API-KEY': this.config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => `HTTP ${response.status}`);
      const retryable = response.status === 429 || response.status >= 500;
      throw new WhatsAppSendError(
        `360dialog refused the message: ${detail.slice(0, 300)}`,
        retryable,
      );
    }

    const json = (await response.json()) as { messages?: { id?: unknown }[] };
    const id = json.messages?.[0]?.id;
    if (typeof id !== 'string') {
      throw new WhatsAppSendError('360dialog accepted the message but returned no id.', false);
    }
    return { messageId: id };
  }

  async sendText(message: OutboundText): Promise<SendResult> {
    return this.#post({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: stripPlus(message.toE164),
      type: 'text',
      text: { body: message.body },
    });
  }

  async sendTemplate(message: OutboundTemplate): Promise<SendResult> {
    return this.#post({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: stripPlus(message.toE164),
      type: 'template',
      template: {
        name: message.templateName,
        language: { code: message.languageCode },
        components: [
          {
            type: 'body',
            parameters: message.variables.map((text) => ({ type: 'text', text })),
          },
        ],
      },
    });
  }

  verifySignature(input: WebhookVerification): boolean {
    const provided = input.headers['x-hub-signature-256'];
    if (!provided || !this.config.appSecret) return false;

    const expected =
      'sha256=' +
      createHmac('sha256', this.config.appSecret).update(input.rawBody, 'utf8').digest('hex');

    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(rawBody: string): ParsedWebhook {
    const messages: InboundMessage[] = [];
    const receipts: DeliveryReceipt[] = [];

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { messages, receipts };
    }

    const entries = (body as { entry?: unknown[] }).entry ?? [];
    for (const entry of entries) {
      const changes = (entry as { changes?: unknown[] }).changes ?? [];
      for (const change of changes) {
        const value = (change as { value?: Record<string, unknown> }).value ?? {};

        for (const raw of (value.messages as unknown[]) ?? []) {
          const m = raw as {
            id?: string;
            from?: string;
            timestamp?: string;
            type?: string;
            text?: { body?: string };
            context?: { id?: string };
          };
          // Only text is handled. A venue sending a voice note or an image is
          // something a person reads — it must not be silently dropped, so it
          // becomes an unclear inbound with an empty body upstream.
          if (!m.id || !m.from) continue;
          messages.push({
            eventId: m.id,
            fromE164: ensurePlus(m.from),
            body: m.type === 'text' ? (m.text?.body ?? '') : `[${m.type ?? 'unsupported'} message]`,
            receivedAt: m.timestamp
              ? new Date(Number(m.timestamp) * 1000).toISOString()
              : new Date().toISOString(),
            replyToMessageId: m.context?.id ?? null,
          });
        }

        for (const raw of (value.statuses as unknown[]) ?? []) {
          const s = raw as {
            id?: string;
            status?: string;
            errors?: { title?: string }[];
          };
          if (!s.id || !s.status) continue;
          const mapped =
            s.status === 'delivered' || s.status === 'read'
              ? 'delivered'
              : s.status === 'failed'
                ? 'failed'
                : 'sent';
          receipts.push({
            eventId: `${s.id}:${s.status}`,
            messageId: s.id,
            status: mapped,
            error: s.errors?.[0]?.title ?? null,
          });
        }
      }
    }

    return { messages, receipts };
  }
}
