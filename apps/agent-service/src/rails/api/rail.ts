import { createHash } from 'node:crypto';
import type { AttemptContext, AttemptResult, BookingRail } from '@reservai/core';
import type { AgentServiceEnv } from '@reservai/config';
import { serviceClient } from '../../supabase';
import { PlatformError, type BookingPlatformAdapter } from './adapter';

/**
 * The API rail.
 *
 * The fastest path and the only one that produces a confirmation nobody has to
 * interpret: the platform returns its own reservation id, and the state
 * machine trusts `api_webhook` evidence absolutely — no confidence threshold,
 * because there is no reading between lines to be done.
 *
 * Which is exactly why this rail does not confirm anything itself. `attempt`
 * places a request and reports what the platform said about placing it. The
 * confirmation arrives later, by webhook, and goes through the machine. A
 * platform that answers "confirmed" synchronously is the one case where the
 * two happen close together, and it still travels the same road.
 */
export class ApiRail implements BookingRail {
  readonly kind = 'api' as const;

  constructor(
    private readonly env: AgentServiceEnv,
    /** Keyed by `booking_platform`: sevenrooms, eat_app, fresha, other. */
    private readonly adapters: Record<string, BookingPlatformAdapter>,
  ) {}

  #adapterFor(context: AttemptContext): BookingPlatformAdapter | null {
    if (context.channel.kind !== 'api') return null;
    const config = context.channel.config as { platform?: string };
    if (!config.platform) return null;
    return this.adapters[config.platform] ?? null;
  }

  async isAvailable(context: AttemptContext): Promise<boolean> {
    if (!this.env.FLAG_RAIL_API) return false;
    if (!context.channel.is_enabled) return false;

    const adapter = this.#adapterFor(context);
    // A platform we have no adapter for, or no credentials for, is not a rail
    // that is "temporarily down" — it cannot run, and saying so lets the
    // selector fall through to WhatsApp or a person rather than stalling.
    if (!adapter || !adapter.isConfigured()) return false;

    const config = context.channel.config as { external_venue_id?: string };
    return Boolean(config.external_venue_id);
  }

  /**
   * Stable across retries of the same attempt, and different for a genuinely
   * new one.
   *
   * A network timeout on the platform's side is the dangerous case: the
   * reservation may exist while we believe it does not. Sending the same key
   * on the retry lets the platform hand back what it already made rather than
   * seating the same party twice.
   */
  #idempotencyKey(context: AttemptContext): string {
    return createHash('sha256')
      .update([context.booking.id, context.channel.id, context.sequence].join(':'))
      .digest('hex');
  }

  async attempt(context: AttemptContext): Promise<AttemptResult> {
    const adapter = this.#adapterFor(context);
    if (!adapter) {
      return {
        outcome: 'error',
        confidence: 0,
        awaitingVenue: false,
        errorMessage: 'No adapter for this platform.',
      };
    }

    const config = context.channel.config as {
      external_venue_id: string;
      supports_availability_lookup?: boolean;
    };

    const supabase = serviceClient(this.env);
    const { data: user } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', context.booking.user_id)
      .single();

    const guestName = user?.full_name?.trim() || 'Reserv guest';

    try {
      // Only where the platform actually offers it. Where it does not, the
      // booking is placed optimistically and the platform declines if it must,
      // which is what phoning up amounts to anyway.
      let slotRef: string | undefined;
      if (config.supports_availability_lookup) {
        const slots = await adapter.checkAvailability({
          externalVenueId: config.external_venue_id,
          earliest: context.booking.scheduled_for,
          latest: context.booking.scheduled_for,
          partySize: context.booking.party_size,
        });

        const match = slots?.find(
          (s) => Date.parse(s.startsAt) === Date.parse(context.booking.scheduled_for),
        );
        if (slots !== null && slots.length > 0 && !match) {
          // The platform can see its own book and this slot is not in it.
          // Offering the nearest is more useful than reporting a failure.
          const nearest = slots[0]!;
          return {
            outcome: 'alternative_offered',
            confidence: 1,
            awaitingVenue: false,
            offeredAlternative: { scheduledFor: nearest.startsAt },
          };
        }
        slotRef = match?.slotRef;
      }

      const result = await adapter.reserve({
        externalVenueId: config.external_venue_id,
        startsAt: context.booking.scheduled_for,
        partySize: context.booking.party_size,
        guestName,
        specialRequests: context.booking.special_requests,
        idempotencyKey: this.#idempotencyKey(context),
        ...(slotRef ? { slotRef } : {}),
      });

      switch (result.status) {
        case 'confirmed':
        case 'pending':
          /**
           * Both report `no_response`, and the difference is deliberate.
           *
           * A platform saying "confirmed" in an HTTP response is telling us it
           * accepted the request. The thing that makes a booking real here is
           * the webhook, whose signature we verified, carrying evidence the
           * machine can act on. Returning `confirmed` from this method would
           * hand the rail a power it must not have, and would mean a booking
           * confirmed by nothing but our own optimism if the webhook never
           * arrived.
           */
          return {
            outcome: 'no_response',
            confidence: 0,
            // The literal truth of it: the request is with them and the answer
            // is not ours to give. The SLA sweep escalates if it never comes.
            awaitingVenue: true,
            externalRef: result.externalRef,
          };

        case 'declined':
          return {
            outcome: 'declined',
            confidence: 1,
            awaitingVenue: false,
            errorMessage: result.reason,
          };

        case 'unavailable': {
          const alternative = result.alternatives[0];
          if (!alternative) {
            return {
              outcome: 'declined',
              confidence: 1,
              awaitingVenue: false,
              errorMessage: 'No availability offered.',
            };
          }
          return {
            outcome: 'alternative_offered',
            confidence: 1,
            awaitingVenue: false,
            offeredAlternative: { scheduledFor: alternative.startsAt },
          };
        }
      }
    } catch (error) {
      /**
       * A timeout is the dangerous one: the reservation may exist while we
       * believe it does not. `awaitingVenue` keeps the attempt open so the
       * sweep chases it, rather than falling straight through to another rail
       * and booking the same table twice.
       */
      const retryable = error instanceof PlatformError ? error.retryable : true;
      return {
        outcome: 'error',
        confidence: 0,
        awaitingVenue: retryable,
        errorMessage: error instanceof Error ? error.message : 'The platform could not be reached.',
      };
    }
  }

  async cancel(context: AttemptContext): Promise<AttemptResult> {
    const adapter = this.#adapterFor(context);
    if (!adapter) {
      return {
        outcome: 'error',
        confidence: 0,
        awaitingVenue: false,
        errorMessage: 'No adapter for this platform.',
      };
    }

    const supabase = serviceClient(this.env);
    const { data: booking } = await supabase
      .from('bookings')
      .select('external_ref')
      .eq('id', context.booking.id)
      .single();

    if (!booking?.external_ref) {
      // Nothing was ever placed with the platform, so there is nothing to
      // withdraw. Reporting an error here would put a booking into a failed
      // state over a cancellation that had already succeeded.
      return { outcome: 'confirmed', confidence: 1, awaitingVenue: false };
    }

    try {
      await adapter.cancel(booking.external_ref, 'Cancelled by the guest.');
      return {
        outcome: 'confirmed',
        confidence: 1,
        awaitingVenue: false,
        externalRef: booking.external_ref,
      };
    } catch (error) {
      return {
        outcome: 'error',
        confidence: 0,
        awaitingVenue: false,
        errorMessage: error instanceof Error ? error.message : 'The platform could not be reached.',
      };
    }
  }
}
