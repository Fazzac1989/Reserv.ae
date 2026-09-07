import { createHmac, timingSafeEqual } from 'node:crypto';
import type { EmailProvider, InboundEmail, OutboundEmail, SentEmail } from './provider';

/**
 * An email provider that records instead of sending.
 *
 * This is not a mock in the testing sense and it is not a placeholder that
 * pretends to work. It is the implementation the service runs on until a real
 * transactional email account exists, and it is honest about that in the only
 * way that matters: `isConfigured()` returns false unless something explicitly
 * turns it on, so the rail selector treats email as unavailable and falls
 * through to the next channel rather than believing a message was delivered.
 *
 * Turned on, it holds every message in memory and can be inspected. That makes
 * the two things that are actually hard about email testable now: matching a
 * reply to the booking it belongs to, and refusing an inbound message we
 * cannot prove came from the provider.
 */
export class RecordedEmailProvider implements EmailProvider {
  readonly name = 'recorded';

  private readonly sent: OutboundEmail[] = [];

  constructor(
    private readonly enabled: boolean,
    /** Shared secret the fake inbound webhook is signed with. */
    private readonly signingSecret: string | null = null,
  ) {}

  isConfigured(): boolean {
    return this.enabled;
  }

  async send(email: OutboundEmail): Promise<SentEmail> {
    this.sent.push(email);
    return { messageId: `recorded-${this.sent.length}` };
  }

  /** Everything this provider was asked to send, in order. */
  outbox(): readonly OutboundEmail[] {
    return this.sent;
  }

  /**
   * Verify and parse, exactly as a real provider would.
   *
   * The signature check is real rather than skipped, because the point of
   * having this implementation is that the verification path is exercised
   * before a vendor is chosen. A provider whose signature check is only
   * written on the day the credentials arrive is a provider whose signature
   * check has never been run.
   */
  parseInbound(
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): InboundEmail | null {
    if (!this.signingSecret) return null;

    const provided = headers['x-reserv-signature'];
    if (!provided) return null;

    const expected = createHmac('sha256', this.signingSecret).update(rawBody).digest('hex');

    // Length first: timingSafeEqual throws on a mismatch rather than returning
    // false, and an exception here would read as a malformed body rather than
    // as a bad signature.
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    try {
      const parsed = JSON.parse(rawBody) as Record<string, unknown>;
      const from = typeof parsed.from === 'string' ? parsed.from : null;
      const text = typeof parsed.text === 'string' ? parsed.text : null;
      if (!from || text === null) return null;

      return {
        messageId: typeof parsed.messageId === 'string' ? parsed.messageId : 'unknown',
        // Null rather than invented. A reply we cannot tie to a booking is an
        // ops task, not a guess at which of today's bookings it might be.
        threadRef: typeof parsed.threadRef === 'string' ? parsed.threadRef : null,
        from,
        subject: typeof parsed.subject === 'string' ? parsed.subject : '',
        text,
        receivedAt:
          typeof parsed.receivedAt === 'string' ? parsed.receivedAt : new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
}
