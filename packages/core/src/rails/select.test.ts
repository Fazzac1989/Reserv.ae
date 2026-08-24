import { describe, expect, it } from 'vitest';
import { nextChannel, selectChannels } from './select';
import type { VenueBookingChannel } from '../schemas/venue';
import type { RailKindSchema } from '../schemas/common';

const VENUE_ID = '11111111-1111-4111-8111-111111111111';

function channel(kind: RailKindSchema, priority: number, is_enabled = true): VenueBookingChannel {
  const config: VenueBookingChannel['config'] =
    kind === 'api'
      ? {
          kind: 'api',
          platform: 'sevenrooms',
          external_venue_id: 'sr-1',
          credentials_ref: 'secret://sr',
          supports_availability_lookup: true,
        }
      : kind === 'whatsapp'
        ? {
            kind: 'whatsapp',
            phone_e164: '+971500000001',
            contact_name: null,
            human_approval_required: true,
          }
        : kind === 'voice'
          ? {
              kind: 'voice',
              phone_e164: '+971500000002',
              recording_consent_obtained: false,
              preferred_language: 'en',
            }
          : { kind: 'manual', instructions: 'Call the front desk.' };

  return {
    id: `${priority}`.padStart(8, '0') + '-2222-4222-8222-222222222222',
    venue_id: VENUE_ID,
    kind,
    priority,
    config,
    sla_minutes: 20,
    responsive_hours: [],
    is_enabled,
    last_verified_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

const ALL: RailKindSchema[] = ['api', 'whatsapp', 'voice', 'manual'];

describe('rail selection', () => {
  it('orders the fallback chain by venue priority', () => {
    const channels = [channel('voice', 30), channel('api', 10), channel('whatsapp', 20)];
    expect(selectChannels({ channels, enabledRails: ALL }).map((c) => c.kind)).toEqual([
      'api',
      'whatsapp',
      'voice',
    ]);
  });

  it('skips channels the venue has switched off', () => {
    const channels = [channel('api', 10, false), channel('whatsapp', 20)];
    expect(selectChannels({ channels, enabledRails: ALL }).map((c) => c.kind)).toEqual([
      'whatsapp',
    ]);
  });

  it('skips rails that are globally disabled — a dark rail is never silently used', () => {
    const channels = [channel('api', 10), channel('whatsapp', 20), channel('manual', 90)];
    expect(selectChannels({ channels, enabledRails: ['manual'] }).map((c) => c.kind)).toEqual([
      'manual',
    ]);
  });

  it('does not re-offer a rail already attempted', () => {
    const channels = [channel('api', 10), channel('whatsapp', 20), channel('manual', 90)];
    const remaining = selectChannels({
      channels,
      enabledRails: ALL,
      attemptedRails: ['api', 'whatsapp'],
    });
    expect(remaining.map((c) => c.kind)).toEqual(['manual']);
  });

  it('returns nothing when the venue is unreachable, so the caller escalates', () => {
    const channels = [channel('api', 10)];
    expect(selectChannels({ channels, enabledRails: ALL, attemptedRails: ['api'] })).toEqual([]);
    expect(nextChannel({ channels, enabledRails: ALL, attemptedRails: ['api'] })).toBeUndefined();
  });

  it('breaks priority ties deterministically', () => {
    const channels = [channel('whatsapp', 10), channel('api', 10)];
    expect(nextChannel({ channels, enabledRails: ALL })?.kind).toBe('api');
  });

  it('leaves the caller’s array untouched', () => {
    const channels = [channel('voice', 30), channel('api', 10)];
    selectChannels({ channels, enabledRails: ALL });
    expect(channels.map((c) => c.kind)).toEqual(['voice', 'api']);
  });
});
