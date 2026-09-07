import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { composeReservationEmail } from './compose';
import { RecordedEmailProvider } from './recorded';

const SECRET = 'test-signing-secret';

function signed(payload: Record<string, unknown>): {
  raw: string;
  headers: Record<string, string>;
} {
  const raw = JSON.stringify(payload);
  return {
    raw,
    headers: { 'x-reserv-signature': createHmac('sha256', SECRET).update(raw).digest('hex') },
  };
}

describe('the message a venue receives', () => {
  const base = {
    venueName: 'Aster & Ash',
    guestName: 'Chris Farrell',
    dateLabel: 'Saturday 12 September',
    timeLabel: '20:00',
    partySize: 4,
    threadRef: 'bkg_abc123',
  };

  it('says who is asking and on whose behalf, in the first sentence', () => {
    const { body } = composeReservationEmail(base);
    const opening = body.split('\n').slice(0, 4).join(' ');
    expect(opening).toContain('Reserv');
    expect(opening).toContain('on behalf of Chris Farrell');
  });

  it('never states the time as booked', () => {
    const { subject, body } = composeReservationEmail(base);
    // The words that would make this a statement rather than a request.
    for (const claim of ['is booked', 'is confirmed', 'we have booked', 'your table is']) {
      expect(subject.toLowerCase()).not.toContain(claim);
      expect(body.toLowerCase()).not.toContain(claim);
    }
    expect(subject).toContain('request');
  });

  it('asks for a confirmation and a reference', () => {
    const { body } = composeReservationEmail(base);
    expect(body).toContain('confirm');
    expect(body).toContain('reference');
  });

  it('carries the thread reference in the body, not only in a header', () => {
    // A venue replying from a phone quotes the body and strips headers. A
    // reply nobody can match to a booking becomes an ops task.
    const { body } = composeReservationEmail(base);
    expect(body).toContain('Ref: bkg_abc123');
  });

  it('tells the venue an alternative needs no further approval only when one was authorised', () => {
    const without = composeReservationEmail(base).body;
    expect(without).toContain('we will check with the guest');
    expect(without).not.toContain('needs no further approval');

    const withWindow = composeReservationEmail({
      ...base,
      alternativeLabel: '19:30 to 20:30',
    }).body;
    expect(withWindow).toContain('needs no further approval');
    expect(withWindow).toContain('19:30 to 20:30');
  });

  it('leaves out what it was not given rather than sending an empty label', () => {
    const { body } = composeReservationEmail(base);
    expect(body).not.toContain('Mobile:');
    expect(body).not.toContain('Occasion:');
    expect(body).not.toContain('Notes:');
  });
});

describe('the recorded provider', () => {
  it('reports itself unconfigured unless switched on', () => {
    // The important default. An email rail that claims it can send, and then
    // records into memory, is a booking silently going nowhere — the selector
    // has to be able to fall through to the next channel.
    expect(new RecordedEmailProvider(false).isConfigured()).toBe(false);
    expect(new RecordedEmailProvider(true).isConfigured()).toBe(true);
  });

  it('keeps what it was asked to send', async () => {
    const provider = new RecordedEmailProvider(true);
    const sent = await provider.send({
      to: 'reservations@example.invalid',
      subject: 'Table request',
      body: 'Hello',
      threadRef: 'bkg_1',
      replyTo: 'reply+bkg_1@example.invalid',
    });

    expect(sent.messageId).toBe('recorded-1');
    expect(provider.outbox()).toHaveLength(1);
    expect(provider.outbox()[0]!.threadRef).toBe('bkg_1');
  });

  it('refuses an inbound message it cannot verify', () => {
    const provider = new RecordedEmailProvider(true, SECRET);
    const { raw } = signed({ from: 'venue@example.invalid', text: 'Yes, confirmed' });

    expect(provider.parseInbound(raw, {})).toBeNull();
    expect(provider.parseInbound(raw, { 'x-reserv-signature': 'nonsense' })).toBeNull();
    // A signature for a different body must not verify this one.
    const other = signed({ from: 'venue@example.invalid', text: 'something else' });
    expect(provider.parseInbound(raw, other.headers)).toBeNull();
  });

  it('refuses everything when no signing secret is configured', () => {
    // Fail closed. A provider with no secret cannot prove anything came from
    // it, and an unverified "confirmed" is a forged confirmation.
    const provider = new RecordedEmailProvider(true, null);
    const { raw, headers } = signed({ from: 'v@example.invalid', text: 'Yes' });
    expect(provider.parseInbound(raw, headers)).toBeNull();
  });

  it('parses a properly signed reply', () => {
    const provider = new RecordedEmailProvider(true, SECRET);
    const { raw, headers } = signed({
      messageId: 'm-1',
      threadRef: 'bkg_abc123',
      from: 'reservations@example.invalid',
      subject: 'Re: Table request',
      text: 'We can do 20:30.',
      receivedAt: '2026-09-12T16:30:00.000Z',
    });

    const parsed = provider.parseInbound(raw, headers);
    expect(parsed).not.toBeNull();
    expect(parsed!.threadRef).toBe('bkg_abc123');
    expect(parsed!.text).toBe('We can do 20:30.');
  });

  it('returns a null thread reference rather than guessing one', () => {
    // A reply we cannot tie to a booking is an ops task. Picking whichever
    // booking looks closest is how a confirmation lands on the wrong table.
    const provider = new RecordedEmailProvider(true, SECRET);
    const { raw, headers } = signed({ from: 'v@example.invalid', text: 'Yes that is fine' });
    const parsed = provider.parseInbound(raw, headers);
    expect(parsed).not.toBeNull();
    expect(parsed!.threadRef).toBeNull();
  });
});
