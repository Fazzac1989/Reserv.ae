/**
 * The WhatsApp BSP abstraction.
 *
 * Twilio and 360dialog do the same job with different wire formats and
 * different signature schemes. Which one reservAI uses is still an open
 * decision (Section 9 of the build plan), so it is a config value rather than
 * a fork in the codebase: `WHATSAPP_BSP` selects an implementation and nothing
 * above this interface knows the difference.
 *
 * Both implementations are written from the providers' documented shapes.
 * Verify the exact endpoint and field names against the live docs when the
 * account is created — an untested integration is not a working one, and this
 * rail stays feature-flagged off until it has been.
 */

export interface OutboundText {
  readonly toE164: string;
  readonly body: string;
}

export interface OutboundTemplate {
  readonly toE164: string;
  readonly templateName: string;
  readonly languageCode: string;
  /** Positional variables, in the order the approved template declares them. */
  readonly variables: readonly string[];
}

export interface SendResult {
  /** The provider's id for this message, used to match delivery receipts. */
  readonly messageId: string;
}

export interface InboundMessage {
  /** The provider's id for this delivery, used to drop retries. */
  readonly eventId: string;
  readonly fromE164: string;
  readonly body: string;
  readonly receivedAt: string;
  /** Present when the provider tells us which of our messages this replies to. */
  readonly replyToMessageId: string | null;
}

export interface DeliveryReceipt {
  readonly eventId: string;
  readonly messageId: string;
  readonly status: 'sent' | 'delivered' | 'failed';
  readonly error: string | null;
}

export interface WebhookVerification {
  /** The exact bytes received. Signatures are computed over these, not over re-serialised JSON. */
  readonly rawBody: string;
  readonly headers: Record<string, string | undefined>;
  /** The full public URL the provider posted to. Twilio signs it. */
  readonly url: string;
}

export interface ParsedWebhook {
  readonly messages: InboundMessage[];
  readonly receipts: DeliveryReceipt[];
}

export interface WhatsAppProvider {
  readonly name: string;

  /**
   * A free-text message. WhatsApp only allows these inside a 24-hour window
   * opened by the venue's own last message; outside it, a template is required.
   */
  sendText(message: OutboundText): Promise<SendResult>;

  /** Opens a conversation with an approved template. */
  sendTemplate(message: OutboundTemplate): Promise<SendResult>;

  /**
   * Whether this delivery genuinely came from the provider.
   *
   * A webhook endpoint is a public URL that moves bookings, so an unverified
   * payload is an unauthenticated instruction. Returning false must drop the
   * request, not log a warning and continue.
   */
  verifySignature(input: WebhookVerification): boolean;

  parseWebhook(rawBody: string): ParsedWebhook;
}

export class WhatsAppNotConfiguredError extends Error {
  constructor(detail: string) {
    super(`WhatsApp is not configured: ${detail}`);
    this.name = 'WhatsAppNotConfiguredError';
  }
}

export class WhatsAppSendError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'WhatsAppSendError';
  }
}

/** WhatsApp addresses are E.164 without the leading plus in some APIs. */
export function stripPlus(e164: string): string {
  return e164.startsWith('+') ? e164.slice(1) : e164;
}

export function ensurePlus(value: string): string {
  return value.startsWith('+') ? value : `+${value}`;
}
