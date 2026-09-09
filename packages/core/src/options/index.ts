import { formatMoney, freshnessOf, type Money, type PriceSource } from '../money/index';

/**
 * What we may honestly say about an option, and whether it can be approved.
 *
 * The rule underneath everything here: a venue name and a photograph do not
 * establish availability. Most of this file exists to stop a screen implying
 * otherwise, because the implication is free and the correction is expensive —
 * it happens at a door, to somebody who dressed up.
 */

export interface OptionFacts {
  /** True only once a rail actually asked the venue and got a yes. */
  readonly slotIsVerified: boolean;
  /** When a rail last asked about this slot. Null means never. */
  readonly availabilityCheckedAt: string | null;
  /** Set once the booking behind this option reached `confirmed`. */
  readonly confirmedAt?: string | null;
  /** True while a request is out and the venue has not answered. */
  readonly awaitingVenue?: boolean;

  readonly price?: { readonly amount: Money; readonly source: PriceSource } | null;
  readonly deposit?: Money | null;
  /** From the venue's policy: do they take one at all? Null means unknown. */
  readonly requiresDeposit?: boolean | null;
  readonly cancellationTerms?: string | null;
}

/**
 * The four states the brief asks the interface to distinguish.
 *
 * They are genuinely different promises and collapsing any two of them is how
 * a product ends up saying "available" about a table nobody has asked for.
 */
export type AvailabilityState =
  /** The venue said yes and we have evidence. The only one anybody may rely on. */
  | 'confirmed'
  /** A rail asked and the slot was free at a specific moment. */
  | 'checked'
  /** We have asked and they have not replied. */
  | 'awaiting'
  /** Nobody has asked. The honest default, and today the usual one. */
  | 'on_request';

export function availabilityStateOf(facts: OptionFacts): AvailabilityState {
  if (facts.confirmedAt) return 'confirmed';
  if (facts.slotIsVerified && facts.availabilityCheckedAt) return 'checked';
  if (facts.awaitingVenue) return 'awaiting';
  return 'on_request';
}

export function availabilityLabelOf(facts: OptionFacts, now: Date = new Date()): string {
  const state = availabilityStateOf(facts);

  switch (state) {
    case 'confirmed':
      return 'Confirmed';
    case 'checked': {
      const at = new Date(facts.availabilityCheckedAt!);
      const label = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      // A check that has aged past the day it was made is worth dating, because
      // "checked at 14:20" reads as today to anybody skimming.
      const sameDay = at.toDateString() === now.toDateString();
      return sameDay
        ? `Availability checked at ${label}`
        : `Availability checked ${at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
    }
    case 'awaiting':
      return 'Awaiting the venue';
    case 'on_request':
    default:
      return 'Available on request';
  }
}

/**
 * Whether somebody may be asked to approve this.
 *
 * The brief's rule, and a good one: acceptance is disabled when a required
 * term or charge is unknown. The point is not to be cautious for its own sake
 * — it is that approving is the moment a person takes on an obligation, and an
 * obligation whose size we cannot state is one they cannot consent to.
 *
 * Note what does NOT block approval: not knowing the price. A restaurant table
 * usually has no price to agree to — you pay for what you eat — and refusing
 * to book a table because we cannot predict dinner would make the product
 * useless. What blocks is a charge we know exists and cannot quantify.
 */
export type ApprovalCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export function canApprove(facts: OptionFacts): ApprovalCheck {
  // They take a deposit and we do not know how much. This is the case the rule
  // is for: the person would be agreeing to pay an amount nobody has named.
  if (facts.requiresDeposit === true && !facts.deposit) {
    return {
      ok: false,
      reason:
        'They take a deposit and I do not know how much yet. I will find out before you commit to anything.',
    };
  }

  // A deposit exists but nothing says what happens if plans change. A deposit
  // with no cancellation terms is money with no way back.
  if (facts.deposit && !facts.cancellationTerms) {
    return {
      ok: false,
      reason: `There is a ${formatMoney(facts.deposit)} deposit and no cancellation terms on record. I will get those first.`,
    };
  }

  return { ok: true };
}

/**
 * What the person is actually agreeing to pay now, and later.
 *
 * Returned as three separate numbers rather than one, because "AED 1,120" on
 * its own answers none of the questions somebody asks at this moment: how much
 * leaves my account today, and how much do I owe on the night.
 */
export interface Breakdown {
  readonly total: Money | null;
  readonly dueNow: Money | null;
  readonly dueLater: Money | null;
}

export function breakdownOf(facts: OptionFacts): Breakdown {
  const total = facts.price?.amount ?? null;
  const dueNow = facts.deposit ?? null;

  if (!total) return { total: null, dueNow, dueLater: null };
  if (!dueNow) return { total, dueNow: null, dueLater: total };

  return { total, dueNow, dueLater: { fils: total.fils - dueNow.fils } };
}

/**
 * Whether the accessibility answer is a fact, a blank, or not applicable.
 *
 * Three states rather than a boolean for the same reason the venue answers
 * module has three: "no step-free access" is something somebody recorded, and
 * an empty list is nobody having asked. Somebody who needs step-free access
 * cannot act on the difference unless we show it.
 */
export type AccessibilityStatus = 'recorded' | 'unknown';

export function accessibilityStatusOf(
  accessibility: readonly string[] | null,
): AccessibilityStatus {
  return accessibility && accessibility.length > 0 ? 'recorded' : 'unknown';
}

/** Freshness re-exported so a screen needs one import rather than two. */
export { freshnessOf };
