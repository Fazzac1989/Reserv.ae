import { describe, expect, it } from 'vitest';
import { clockTime, e164, timeWindowSchema } from './common';
import { userPreferencesUpdateSchema } from './user';
import { venueBookingChannelSchema } from './venue';
import { bookingSchema, confirmationEvidenceSchema } from './booking';
import { parsedIntentSchema } from './request';

describe('primitive boundaries', () => {
  it('accepts UAE mobile numbers in E.164 and rejects local formats', () => {
    expect(e164.safeParse('+971501234567').success).toBe(true);
    expect(e164.safeParse('0501234567').success).toBe(false);
    expect(e164.safeParse('+0501234567').success).toBe(false);
    expect(e164.safeParse('971 50 123 4567').success).toBe(false);
  });

  it('accepts 24h clock times only', () => {
    expect(clockTime.safeParse('09:30').success).toBe(true);
    expect(clockTime.safeParse('23:59').success).toBe(true);
    expect(clockTime.safeParse('24:00').success).toBe(false);
    expect(clockTime.safeParse('9:30').success).toBe(false);
  });

  it('rejects a time window that ends before it starts', () => {
    expect(
      timeWindowSchema.safeParse({
        starts_at: '2026-02-01T19:00:00.000Z',
        ends_at: '2026-02-01T21:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      timeWindowSchema.safeParse({
        starts_at: '2026-02-01T21:00:00.000Z',
        ends_at: '2026-02-01T19:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('venue booking channels', () => {
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    venue_id: '22222222-2222-4222-8222-222222222222',
    priority: 10,
    sla_minutes: 20,
    responsive_hours: [],
    is_enabled: true,
    last_verified_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  it('rejects a channel whose config contradicts its kind', () => {
    const result = venueBookingChannelSchema.safeParse({
      ...base,
      kind: 'whatsapp',
      config: { kind: 'manual', instructions: 'Call the desk.' },
    });
    expect(result.success).toBe(false);
  });

  it('defaults WhatsApp channels to requiring human approval', () => {
    const result = venueBookingChannelSchema.parse({
      ...base,
      kind: 'whatsapp',
      config: { kind: 'whatsapp', phone_e164: '+971501234567', contact_name: null },
    });
    expect(result.config).toMatchObject({ human_approval_required: true });
  });

  it('defaults voice channels to no recording consent', () => {
    const result = venueBookingChannelSchema.parse({
      ...base,
      kind: 'voice',
      config: { kind: 'voice', phone_e164: '+971501234567' },
    });
    expect(result.config).toMatchObject({ recording_consent_obtained: false });
  });
});

describe('user preference updates', () => {
  it('rejects an empty update', () => {
    expect(userPreferencesUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an inverted price band', () => {
    expect(
      userPreferencesUpdateSchema.safeParse({ price_band_min: 4, price_band_max: 2 }).success,
    ).toBe(false);
    expect(
      userPreferencesUpdateSchema.safeParse({ price_band_min: 2, price_band_max: 4 }).success,
    ).toBe(true);
  });

  it('allows moving one bound on its own', () => {
    expect(userPreferencesUpdateSchema.safeParse({ price_band_max: 3 }).success).toBe(true);
  });
});

describe('parsed intent', () => {
  it('lets every field be null so the agent can admit it does not know', () => {
    const result = parsedIntentSchema.parse({
      vertical: null,
      window: null,
      party_size: null,
      price_band_max: null,
      occasion: null,
      named_venue_id: null,
      missing_fields: ['window'],
    });
    expect(result.zones).toEqual([]);
    expect(result.constraints).toEqual([]);
    expect(result.missing_fields).toEqual(['window']);
  });
});

describe('confirmation evidence', () => {
  it('accepts each deterministic source', () => {
    expect(
      confirmationEvidenceSchema.safeParse({
        kind: 'api_webhook',
        provider: 'fresha',
        externalRef: 'FR-1',
        payloadRef: 'storage://x',
      }).success,
    ).toBe(true);
    expect(
      confirmationEvidenceSchema.safeParse({
        kind: 'parsed_confirmation',
        attemptId: '33333333-3333-4333-8333-333333333333',
        confidence: 0.95,
        transcriptRef: 'storage://y',
      }).success,
    ).toBe(true);
  });

  it('rejects a made-up evidence kind', () => {
    expect(
      confirmationEvidenceSchema.safeParse({ kind: 'model_said_so', confidence: 1 }).success,
    ).toBe(false);
  });

  it('rejects a confidence outside 0..1', () => {
    expect(
      confirmationEvidenceSchema.safeParse({
        kind: 'parsed_confirmation',
        attemptId: '33333333-3333-4333-8333-333333333333',
        confidence: 1.4,
        transcriptRef: 'storage://y',
      }).success,
    ).toBe(false);
  });
});

describe('booking row', () => {
  const base = {
    id: '44444444-4444-4444-8444-444444444444',
    user_id: '55555555-5555-4555-8555-555555555555',
    venue_id: '66666666-6666-4666-8666-666666666666',
    request_id: null,
    suggestion_id: null,
    party_size: 2,
    scheduled_for: '2026-02-07T19:30:00.000Z',
    service_name: null,
    provider_name: null,
    special_requests: null,
    confirmed_at: null,
    confirmation_evidence: null,
    external_ref: null,
    cancelled_at: null,
    cancellation_reason: null,
    rating: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  it('only accepts a status the state machine knows about', () => {
    expect(bookingSchema.safeParse({ ...base, status: 'pending_venue' }).success).toBe(true);
    expect(bookingSchema.safeParse({ ...base, status: 'probably_fine' }).success).toBe(false);
  });

  it('treats no-show as an attribute, defaulting to false', () => {
    expect(bookingSchema.parse({ ...base, status: 'completed' }).no_show).toBe(false);
  });
});
