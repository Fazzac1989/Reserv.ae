/**
 * Sending an email to a venue, and reading what comes back.
 *
 * The same shape as the WhatsApp providers: an interface the rail talks to,
 * and one implementation per vendor. The rail never learns which one it has.
 *
 * Written before any transactional email account exists, deliberately. The
 * questions that actually go wrong here — how a reply is matched back to the
 * booking it belongs to, and what happens when somebody replies from a
 * different address than the one we wrote to — are answerable now against a
 * recorded implementation rather than under time pressure later.
 */

export interface OutboundEmail {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  /**
   * Ours. Goes out as a header and comes back on the reply, which is how a
   * response is matched to a booking without guessing from the subject line.
   */
  readonly threadRef: string;
  /**
   * The address replies should go to. Per-booking where the provider supports
   * it, so a reply carries the booking id even when the venue's mail client
   * strips headers — which many do.
   */
  readonly replyTo: string;
}

export interface SentEmail {
  /** The provider's id for this send, for de-duplication and support. */
  readonly messageId: string;
}

/** An inbound reply, once its authenticity has been established. */
export interface InboundEmail {
  readonly messageId: string;
  readonly threadRef: string | null;
  readonly from: string;
  readonly subject: string;
  readonly text: string;
  readonly receivedAt: string;
}

export class EmailProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'EmailProviderError';
  }
}

export interface EmailProvider {
  readonly name: string;

  /**
   * Whether this provider can send at all — credentials present and a sending
   * domain configured. A provider that cannot send must say so rather than
   * throwing on the first attempt, so the rail selector falls through to the
   * next channel instead of burning the booking's only chance.
   */
  isConfigured(): boolean;

  send(email: OutboundEmail): Promise<SentEmail>;

  /**
   * Verify and parse an inbound webhook in one call.
   *
   * One call for the same reason the platform adapter does it: two calls is an
   * interface where somebody eventually parses without verifying. An email
   * saying "confirmed" that we did not prove came from the provider is a
   * forged confirmation, and a parsed confirmation is evidence the state
   * machine will act on.
   *
   * Returns null when the signature does not check out.
   */
  parseInbound(rawBody: string, headers: Record<string, string | undefined>): InboundEmail | null;
}
