import { describe, expect, it } from 'vitest';
import { aed } from '../money/index';
import {
  accessibilityStatusOf,
  availabilityLabelOf,
  availabilityStateOf,
  breakdownOf,
  canApprove,
  type OptionFacts,
} from './index';

const NOW = new Date('2026-09-12T18:00:00.000Z');

/** Nobody has asked the venue anything. The honest default, and today the usual one. */
const unasked: OptionFacts = { slotIsVerified: false, availabilityCheckedAt: null };

describe('what we may say about availability', () => {
  it('says available on request when nobody has asked', () => {
    expect(availabilityStateOf(unasked)).toBe('on_request');
    expect(availabilityLabelOf(unasked, NOW)).toBe('Available on request');
  });

  it('never says checked without a time', () => {
    // "Checked" with no "when" is the same claim as "checked" with no check.
    // The database refuses this pairing too; this is the second lock.
    const claimed: OptionFacts = { slotIsVerified: true, availabilityCheckedAt: null };
    expect(availabilityStateOf(claimed)).toBe('on_request');
  });

  it('says when a slot was checked, to the minute', () => {
    const checked: OptionFacts = {
      slotIsVerified: true,
      availabilityCheckedAt: '2026-09-12T14:20:00.000Z',
    };
    expect(availabilityStateOf(checked)).toBe('checked');
    expect(availabilityLabelOf(checked, NOW)).toMatch(/^Availability checked at \d{2}:\d{2}$/);
  });

  it('dates a check made on another day', () => {
    // "Checked at 14:20" reads as today to anybody skimming.
    const yesterday: OptionFacts = {
      slotIsVerified: true,
      availabilityCheckedAt: '2026-09-10T14:20:00.000Z',
    };
    expect(availabilityLabelOf(yesterday, NOW)).toMatch(/^Availability checked \d+ \w+$/);
  });

  it('distinguishes waiting on a venue from never having asked', () => {
    const waiting: OptionFacts = { ...unasked, awaitingVenue: true };
    expect(availabilityStateOf(waiting)).toBe('awaiting');
    expect(availabilityLabelOf(waiting, NOW)).toBe('Awaiting the venue');
  });

  it('lets confirmed outrank everything', () => {
    const confirmed: OptionFacts = {
      slotIsVerified: false,
      availabilityCheckedAt: null,
      awaitingVenue: true,
      confirmedAt: '2026-09-12T15:00:00.000Z',
    };
    expect(availabilityStateOf(confirmed)).toBe('confirmed');
    expect(availabilityLabelOf(confirmed, NOW)).toBe('Confirmed');
  });
});

describe('whether somebody may be asked to approve', () => {
  it('allows a plain table with no charges at all', () => {
    // The case that must not be blocked. A restaurant table usually has no
    // price to agree to — refusing to book one because dinner cannot be
    // predicted would make the product useless.
    expect(canApprove(unasked).ok).toBe(true);
  });

  it('refuses when a deposit is required and its size is unknown', () => {
    const check = canApprove({ ...unasked, requiresDeposit: true, deposit: null });
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.reason).toContain('do not know how much');
  });

  it('refuses a deposit with no cancellation terms', () => {
    // A deposit with no terms is money with no way back.
    const check = canApprove({ ...unasked, deposit: aed(200), cancellationTerms: null });
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.reason).toContain('AED 200');
  });

  it('allows a deposit whose terms are known', () => {
    const check = canApprove({
      ...unasked,
      requiresDeposit: true,
      deposit: aed(200),
      cancellationTerms: '24 hours notice or the deposit is retained.',
    });
    expect(check.ok).toBe(true);
  });

  it('does not block on an unknown price', () => {
    // Deliberately not a blocker. What blocks is a charge we know exists and
    // cannot quantify, not the ordinary case of not knowing what dinner costs.
    expect(canApprove({ ...unasked, price: null, requiresDeposit: false }).ok).toBe(true);
  });

  it('does not block when the venue takes no deposit', () => {
    expect(canApprove({ ...unasked, requiresDeposit: false }).ok).toBe(true);
  });
});

describe('the breakdown', () => {
  it('splits the brief’s example into now and later', () => {
    const b = breakdownOf({
      ...unasked,
      price: { amount: aed(1120), source: 'estimate' },
      deposit: aed(200),
    });
    expect(b.total!.fils).toBe(112_000);
    expect(b.dueNow!.fils).toBe(20_000);
    expect(b.dueLater!.fils).toBe(92_000);
  });

  it('treats the whole total as due later when there is no deposit', () => {
    const b = breakdownOf({ ...unasked, price: { amount: aed(760), source: 'menu' } });
    expect(b.dueNow).toBeNull();
    expect(b.dueLater!.fils).toBe(76_000);
  });

  it('returns nulls rather than zeros when the price is unknown', () => {
    // A zero is a price. Null is the absence of one, and the screen has to be
    // able to tell them apart to say "I do not know" instead of "free".
    const b = breakdownOf(unasked);
    expect(b.total).toBeNull();
    expect(b.dueLater).toBeNull();
  });
});

describe('accessibility', () => {
  it('calls an empty list unknown rather than none', () => {
    // Somebody who needs step-free access cannot act on "no information"
    // presented as "no access".
    expect(accessibilityStatusOf([])).toBe('unknown');
    expect(accessibilityStatusOf(null)).toBe('unknown');
    expect(accessibilityStatusOf(['step-free entrance'])).toBe('recorded');
  });
});
