import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TwilioWhatsAppProvider } from './twilio';
import { Dialog360Provider } from './dialog360';

/**
 * A webhook endpoint is a public URL that can move a booking to `confirmed`.
 * An unverified payload is therefore an unauthenticated instruction, and these
 * are the tests that stop one being obeyed.
 */

const TWILIO = new TwilioWhatsAppProvider({
  accountSid: 'AC00000000000000000000000000000000',
  authToken: 'test-auth-token',
  fromE164: '+971500000001',
});

const URL_POSTED_TO = 'https://agent.reservai.ae/webhooks/whatsapp';

function twilioSignature(url: string, body: string, token = 'test-auth-token'): string {
  const params = [...new URLSearchParams(body).entries()].sort(([a], [b]) => a.localeCompare(b));
  const payload = url + params.map(([k, v]) => k + v).join('');
  return createHmac('sha1', token).update(payload, 'utf8').digest('base64');
}

describe('Twilio signature verification', () => {
  const body = 'MessageSid=SM123&From=whatsapp%3A%2B971509999999&Body=Yes%2C+confirmed+for+8pm';

  it('accepts a genuine signature', () => {
    expect(
      TWILIO.verifySignature({
        rawBody: body,
        url: URL_POSTED_TO,
        headers: { 'x-twilio-signature': twilioSignature(URL_POSTED_TO, body) },
      }),
    ).toBe(true);
  });

  it('rejects a missing signature', () => {
    expect(TWILIO.verifySignature({ rawBody: body, url: URL_POSTED_TO, headers: {} })).toBe(false);
  });

  it('rejects a signature made with the wrong auth token', () => {
    expect(
      TWILIO.verifySignature({
        rawBody: body,
        url: URL_POSTED_TO,
        headers: { 'x-twilio-signature': twilioSignature(URL_POSTED_TO, body, 'not-our-token') },
      }),
    ).toBe(false);
  });

  // The attack this stops: replaying a real signed body against our endpoint
  // with the message text swapped for a confirmation.
  it('rejects a tampered body', () => {
    const signature = twilioSignature(URL_POSTED_TO, body);
    const tampered = body.replace('Yes%2C+confirmed+for+8pm', 'Yes+confirmed+for+9pm');
    expect(
      TWILIO.verifySignature({
        rawBody: tampered,
        url: URL_POSTED_TO,
        headers: { 'x-twilio-signature': signature },
      }),
    ).toBe(false);
  });

  it('rejects a signature made for a different URL', () => {
    expect(
      TWILIO.verifySignature({
        rawBody: body,
        url: URL_POSTED_TO,
        headers: {
          'x-twilio-signature': twilioSignature('https://evil.example/webhooks/whatsapp', body),
        },
      }),
    ).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    expect(
      TWILIO.verifySignature({
        rawBody: body,
        url: URL_POSTED_TO,
        headers: { 'x-twilio-signature': 'short' },
      }),
    ).toBe(false);
  });
});

const DIALOG = new Dialog360Provider({ apiKey: 'key', appSecret: 'test-app-secret' });

function metaSignature(body: string, secret = 'test-app-secret'): string {
  return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

describe('360dialog signature verification', () => {
  const body = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { id: 'wamid.1', from: '971509999999', type: 'text', text: { body: 'Confirmed' } },
              ],
            },
          },
        ],
      },
    ],
  });

  it('accepts a genuine signature', () => {
    expect(
      DIALOG.verifySignature({
        rawBody: body,
        url: URL_POSTED_TO,
        headers: { 'x-hub-signature-256': metaSignature(body) },
      }),
    ).toBe(true);
  });

  it('rejects the wrong app secret', () => {
    expect(
      DIALOG.verifySignature({
        rawBody: body,
        url: URL_POSTED_TO,
        headers: { 'x-hub-signature-256': metaSignature(body, 'wrong') },
      }),
    ).toBe(false);
  });

  // Why the raw bytes are threaded through from the route rather than
  // re-serialised: the same object with different key order hashes differently.
  it('rejects a re-serialised body with identical content', () => {
    const signature = metaSignature(body);
    const reserialised = JSON.stringify(JSON.parse(body), Object.keys(JSON.parse(body)).reverse());
    expect(
      DIALOG.verifySignature({
        rawBody: reserialised,
        url: URL_POSTED_TO,
        headers: { 'x-hub-signature-256': signature },
      }),
    ).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(DIALOG.verifySignature({ rawBody: body, url: URL_POSTED_TO, headers: {} })).toBe(false);
  });
});

describe('Twilio webhook parsing', () => {
  it('reads an inbound venue reply', () => {
    const { messages, receipts } = TWILIO.parseWebhook(
      'MessageSid=SM123&From=whatsapp%3A%2B971509999999&Body=Yes%2C+confirmed',
    );
    expect(receipts).toEqual([]);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.fromE164).toBe('+971509999999');
    expect(messages[0]?.body).toBe('Yes, confirmed');
  });

  it('reads a delivery receipt and keys it by status', () => {
    const { messages, receipts } = TWILIO.parseWebhook('MessageSid=SM123&MessageStatus=delivered');
    expect(messages).toEqual([]);
    // The same message id reports several statuses in turn, so the event id
    // must distinguish them or de-duplication would swallow the later ones.
    expect(receipts[0]).toMatchObject({ eventId: 'SM123:delivered', status: 'delivered' });
  });

  it('ignores a payload with nothing in it', () => {
    expect(TWILIO.parseWebhook('')).toEqual({ messages: [], receipts: [] });
  });
});

describe('360dialog webhook parsing', () => {
  it('reads an inbound venue reply', () => {
    const { messages } = DIALOG.parseWebhook(
      JSON.stringify({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid.1',
                      from: '971509999999',
                      timestamp: '1770000000',
                      type: 'text',
                      text: { body: 'تم الحجز' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.body).toBe('تم الحجز');
    expect(messages[0]?.fromE164).toBe('+971509999999');
  });

  // A venue replying with a voice note must not vanish. It becomes a message a
  // person has to read, which is the honest outcome.
  it('surfaces a non-text message rather than dropping it', () => {
    const { messages } = DIALOG.parseWebhook(
      JSON.stringify({
        entry: [
          { changes: [{ value: { messages: [{ id: 'w2', from: '9715', type: 'audio' }] } }] },
        ],
      }),
    );
    expect(messages[0]?.body).toBe('[audio message]');
  });

  it('survives a malformed payload without throwing', () => {
    expect(DIALOG.parseWebhook('not json')).toEqual({ messages: [], receipts: [] });
    expect(DIALOG.parseWebhook('{}')).toEqual({ messages: [], receipts: [] });
  });
});
