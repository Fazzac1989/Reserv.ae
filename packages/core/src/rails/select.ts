import type { RailKindSchema } from '../schemas/common';
import type { VenueBookingChannel } from '../schemas/venue';

export interface RailSelectionInput {
  readonly channels: readonly VenueBookingChannel[];
  /** Rails switched on globally, from the feature flags. */
  readonly enabledRails: readonly RailKindSchema[];
  /** Rails already tried for this booking, so we do not loop. */
  readonly attemptedRails?: readonly RailKindSchema[];
}

/**
 * The fallback chain for one venue, in priority order.
 *
 * A channel is skipped when the venue has it switched off, when the rail is
 * globally disabled, or when we have already tried it. Returning an empty list
 * is a real answer: it means we cannot reach this venue and the booking should
 * escalate to ops rather than sit in a retry loop.
 */
export function selectChannels(input: RailSelectionInput): VenueBookingChannel[] {
  const attempted = new Set(input.attemptedRails ?? []);
  const enabled = new Set(input.enabledRails);

  return input.channels
    .filter((c) => c.is_enabled)
    .filter((c) => enabled.has(c.kind))
    .filter((c) => !attempted.has(c.kind))
    .slice()
    .sort((a, b) => a.priority - b.priority || a.kind.localeCompare(b.kind));
}

export function nextChannel(input: RailSelectionInput): VenueBookingChannel | undefined {
  return selectChannels(input)[0];
}
