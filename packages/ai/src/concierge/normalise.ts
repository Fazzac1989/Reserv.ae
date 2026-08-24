import type { ConciergeContext } from './prompt';
import { missingRequiredFields, type ConciergeIntent, type ConciergeOutput } from './schema';

/**
 * The deterministic layer between what the model said and what we store.
 *
 * The agent drives the conversation; code owns the truth. Anything here that
 * looks like second-guessing the model is deliberate: these are the rules the
 * product depends on, and a prompt is a request, not a guarantee.
 */

export interface NormalisedIntent {
  vertical: ConciergeIntent['vertical'];
  zones: ConciergeIntent['zones'];
  window: { starts_at: string; ends_at: string } | null;
  party_size: number | null;
  price_band_max: number | null;
  occasion: string | null;
  constraints: string[];
  named_venue_id: null;
  missing_fields: string[];
}

export interface NormalisedTurn {
  reply: string;
  clarifyingQuestion: string | null;
  intent: NormalisedIntent;
  /** Fields we filled from the profile rather than from what they said. */
  defaulted: string[];
  /** True when the request has everything it needs to reach the Curator. */
  ready: boolean;
}

function isValidIso(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

/**
 * A window the model produced can be malformed in ways the schema cannot catch:
 * unparseable dates, an end before a start, or a single bound. Any of those
 * means we do not have a usable time, which is a required field — so it becomes
 * a question rather than a bad booking.
 */
function readWindow(intent: ConciergeIntent): { starts_at: string; ends_at: string } | null {
  const { window_start: start, window_end: end } = intent;
  if (start === null || end === null) return null;
  if (!isValidIso(start) || !isValidIso(end)) return null;
  if (Date.parse(start) >= Date.parse(end)) return null;
  return { starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() };
}

export function normaliseTurn(output: ConciergeOutput, context: ConciergeContext): NormalisedTurn {
  const defaulted: string[] = [];

  const window = readWindow(output.intent);

  // Zones fall back to where they live, then to everywhere they will travel.
  let zones = [...new Set(output.intent.zones)];
  if (zones.length === 0) {
    if (context.homeZone) {
      zones = [context.homeZone as ConciergeIntent['zones'][number]];
      defaulted.push('zones');
    } else if (context.preferredZones.length > 0) {
      zones = [...context.preferredZones] as ConciergeIntent['zones'];
      defaulted.push('zones');
    }
  }

  // Party size is never guessed by the model — it comes from the profile, and
  // we record that it was assumed so the reply can say so.
  let partySize = output.intent.party_size;
  if (partySize === null) {
    partySize = context.defaultPartySize;
    defaulted.push('party_size');
  }

  let priceBandMax = output.intent.price_band_max;
  if (priceBandMax === null) {
    priceBandMax = context.priceBandMax;
    defaulted.push('price_band_max');
  }

  const intent: NormalisedIntent = {
    vertical: output.intent.vertical,
    zones,
    window,
    party_size: partySize,
    price_band_max: priceBandMax,
    occasion: output.intent.occasion,
    constraints: [...new Set(output.intent.constraints.map((c) => c.trim()).filter(Boolean))],
    named_venue_id: null,
    missing_fields: [],
  };

  const missing = missingRequiredFields({
    ...output.intent,
    window_start: window?.starts_at ?? null,
    window_end: window?.ends_at ?? null,
  });
  intent.missing_fields = missing;

  // Two ways the model can get the clarifying question wrong, and both matter.
  // Asking when nothing is missing wastes the user's turn; not asking when
  // something is missing sends an unusable request downstream.
  let clarifyingQuestion = output.clarifying_question?.trim() || null;
  if (missing.length === 0) {
    clarifyingQuestion = null;
  } else if (clarifyingQuestion === null) {
    clarifyingQuestion = questionFor(missing[0]!);
  }

  return {
    reply: output.reply.trim(),
    clarifyingQuestion,
    intent,
    defaulted,
    ready: missing.length === 0,
  };
}

/** Fallback wording when the model knew a field was missing but did not ask. */
function questionFor(field: string): string {
  switch (field) {
    case 'vertical':
      return 'Is this a table somewhere, or an appointment — hair, nails, barber?';
    case 'window':
      return 'When were you thinking?';
    default:
      return 'Could you tell me a little more?';
  }
}

/** The status to store on the `requests` row for this turn. */
export function requestStatusFor(turn: NormalisedTurn): 'parsed' | 'needs_clarification' {
  return turn.ready ? 'parsed' : 'needs_clarification';
}
