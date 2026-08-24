import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  ensurePlus,
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

export interface TwilioConfig {
  readonly accountSid: string;
  readonly authToken: string;
  /** The booker number, in E.164. Distinct from the user-facing concierge number. */
  readonly fromE164: string;
}

/**
 * Twilio's WhatsApp API.
 *
 * Twilio posts form-encoded webhooks and signs them with HMAC-SHA1 over the
 * full URL concatenated with the POST parameters sorted by key — not over the
 * raw body, which is why `verifySignature` re-derives the string rather than
 * hashing what arrived.
 */
export class TwilioWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'twilio';

  constructor(private readonly config: TwilioConfig) {
    if (!config.accountSid || !config.authToken || !config.fromE164) {
      throw new WhatsAppNotConfiguredError('Twilio needs an account SID, auth token and number.');
    }
  }

  #endpoint(): string {
    return `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;
  }

  #auth(): string {
    return `Basic ${Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64')}`;
  }

  async #post(params: URLSearchParams): Promise<SendResult> {
    const response = await fetch(this.#endpoint(), {
      method: 'POST',
      headers: {
        Authorization: this.#auth(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => `HTTP ${response.status}`);
      // 429 and 5xx are worth another go; a 400 means the message itself is
      // wrong and retrying would send the same broken thing again.
      const retryable = response.status === 429 || response.status >= 500;
      throw new WhatsAppSendError(`Twilio refused the message: ${detail.slice(0, 300)}`, retryable);
    }

    const json = (await response.json()) as { sid?: unknown };
    if (typeof json.sid !== 'string') {
      throw new WhatsAppSendError('Twilio accepted the message but returned no id.', false);
    }
    return { messageId: json.sid };
  }

  async sendText(message: OutboundText): Promise<SendResult> {
    return this.#post(
      new URLSearchParams({
        From: `whatsapp:${this.config.fromE164}`,
        To: `whatsapp:${ensurePlus(message.toE164)}`,
        Body: message.body,
      }),
    );
  }

  async sendTemplate(message: OutboundTemplate): Promise<SendResult> {
    return this.#post(
      new URLSearchParams({
        From: `whatsapp:${this.config.fromE164}`,
        To: `whatsapp:${ensurePlus(message.toE164)}`,
        ContentSid: message.templateName,
        ContentVariables: JSON.stringify(
          Object.fromEntries(message.variables.map((v, i) => [String(i + 1), v])),
        ),
      }),
    );
  }

  verifySignature(input: WebhookVerification): boolean {
    const provided = input.headers['x-twilio-signature'];
    if (!provided) return false;

    // Twilio signs URL + each POST parameter, sorted by key, concatenated as
    // key then value with no separators.
    const params = new URLSearchParams(input.rawBody);
    const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const payload = input.url + sorted.map(([k, v]) => k + v).join('');

    const expected = createHmac('sha1', this.config.authToken)
      .update(payload, 'utf8')
      .digest('base64');

    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    // Length must be compared first: timingSafeEqual throws on a mismatch.
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(rawBody: string): ParsedWebhook {
    const params = new URLSearchParams(rawBody);
    const messages: InboundMessage[] = [];
    const receipts: DeliveryReceipt[] = [];

    const sid = params.get('MessageSid') ?? params.get('SmsSid');
    if (!sid) return { messages, receipts };

    const status = params.get('MessageStatus') ?? params.get('SmsStatus');
    const body = params.get('Body');

    if (body !== null && body !== '') {
      messages.push({
        eventId: sid,
        fromE164: ensurePlus((params.get('From') ?? '').replace('whatsapp:', '')),
        body,
        receivedAt: new Date().toISOString(),
        replyToMessageId: null,
      });
    } else if (status) {
      const mapped =
        status === 'delivered' || status === 'read'
          ? 'delivered'
          : status === 'failed' || status === 'undelivered'
            ? 'failed'
            : 'sent';
      receipts.push({
        // A delivery receipt for the same message arrives more than once as the
        // status advances, so the event id has to include the status.
        eventId: `${sid}:${status}`,
        messageId: sid,
        status: mapped,
        error: params.get('ErrorMessage'),
      });
    }

    return { messages, receipts };
  }
}
