import { describe, expect, it } from 'vitest';
import {
  aed,
  addMoney,
  balanceAfterDeposit,
  fils,
  formatMoney,
  freshnessOf,
  priceCaveat,
  totalOf,
  type Price,
} from './index';

const NOW = new Date('2026-09-12T18:00:00.000Z');
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000).toISOString();

const quoted = (amount: number, checkedAt: string): Price => ({
  amount: aed(amount),
  source: 'venue_quote',
  checkedAt,
});

const guessed = (amount: number): Price => ({
  amount: aed(amount),
  source: 'estimate',
  checkedAt: null,
});

describe('amounts are integers', () => {
  it('converts dirhams to whole fils', () => {
    expect(aed(360).fils).toBe(36_000);
    expect(aed(12.5).fils).toBe(1250);
  });

  it('rounds rather than truncating a fractional fils', () => {
    // 12.005 is a bug upstream, but storing 1200.4999 is a worse one: it
    // surfaces three screens later inside a total.
    expect(aed(12.005).fils).toBe(1201);
    expect(Number.isInteger(aed(0.1).fils + aed(0.2).fils)).toBe(true);
  });

  it('refuses a fractional fils outright', () => {
    expect(() => fils(1200.5)).toThrow(RangeError);
  });

  it('adds without floating point drift', () => {
    // The thing integer fils exist to prevent.
    const sum = addMoney(aed(0.1), aed(0.2));
    expect(sum.fils).toBe(30);
    expect(formatMoney(sum)).toBe('AED 0.30');
  });
});

describe('formatting', () => {
  it('drops the minor unit when it is zero', () => {
    // "AED 1,120.00" is how a spreadsheet writes a price, not a person.
    expect(formatMoney(aed(1120))).toBe('AED 1,120');
  });

  it('keeps the minor unit when there is one', () => {
    expect(formatMoney(aed(1120.5))).toBe('AED 1,120.50');
    expect(formatMoney(fils(112_005))).toBe('AED 1,120.05');
  });

  it('groups thousands', () => {
    expect(formatMoney(aed(1_250_000))).toBe('AED 1,250,000');
  });
});

describe('a total is only as good as its softest number', () => {
  it('adds the brief’s example correctly', () => {
    const total = totalOf([quoted(360, hoursAgo(1)), quoted(760, hoursAgo(2))]);
    expect(formatMoney(total.amount)).toBe('AED 1,120');
    expect(total.estimated).toBe(false);
  });

  it('is estimated when any single part was a guess', () => {
    // The rule this module exists for. Three quoted parts do not make a
    // guessed fourth firm.
    const total = totalOf([quoted(360, hoursAgo(1)), guessed(760)]);
    expect(total.estimated).toBe(true);
    expect(total.source).toBe('estimate');
  });

  it('takes the weakest provenance, not the most common one', () => {
    const total = totalOf([
      { amount: aed(100), source: 'platform', checkedAt: hoursAgo(1) },
      { amount: aed(100), source: 'platform', checkedAt: hoursAgo(1) },
      { amount: aed(100), source: 'menu', checkedAt: hoursAgo(1) },
    ]);
    expect(total.source).toBe('menu');
  });

  it('is as fresh as its stalest part', () => {
    const total = totalOf([quoted(100, hoursAgo(1)), quoted(100, hoursAgo(30))]);
    expect(freshnessOf(total.checkedAt, NOW)).toBe('stale');
  });

  it('is unchecked the moment one part was never checked', () => {
    // A recent check on one line must not vouch for a line nobody looked at.
    const total = totalOf([
      quoted(100, hoursAgo(1)),
      { amount: aed(100), source: 'menu', checkedAt: null },
    ]);
    expect(total.checkedAt).toBeNull();
    expect(freshnessOf(total.checkedAt, NOW)).toBe('unchecked');
  });

  it('handles nothing at all', () => {
    const total = totalOf([]);
    expect(total.amount.fils).toBe(0);
    expect(total.estimated).toBe(false);
  });
});

describe('deposits come out of the total, not on top of it', () => {
  it('works the brief’s example', () => {
    // 1,120 total, 200 deposit, 920 left to pay.
    const balance = balanceAfterDeposit(aed(1120), aed(200));
    expect(formatMoney(balance)).toBe('AED 920');
  });

  it('refuses a deposit larger than the total', () => {
    // Getting this backwards shows somebody a bill larger than the one they
    // agreed to, which is the costliest arithmetic mistake here.
    expect(() => balanceAfterDeposit(aed(200), aed(1120))).toThrow(RangeError);
  });

  it('allows a deposit that is the whole thing', () => {
    expect(balanceAfterDeposit(aed(200), aed(200)).fils).toBe(0);
  });
});

describe('what to say next to a number', () => {
  it('says nothing when the price is firm and recent', () => {
    // A label on every line trains people to stop reading labels.
    const total = totalOf([quoted(360, hoursAgo(1))]);
    expect(priceCaveat(total, NOW)).toBeNull();
  });

  it('says Estimated when anything was guessed', () => {
    expect(priceCaveat(totalOf([guessed(360)]), NOW)).toBe('Estimated');
  });

  it('says so when nobody has checked', () => {
    const total = totalOf([{ amount: aed(360), source: 'menu', checkedAt: null }]);
    expect(priceCaveat(total, NOW)).toBe('Not checked with the venue');
  });

  it('gives the date once a check has gone stale', () => {
    // Asserted by shape rather than by the exact month string. Node renders
    // September as "Sept" under en-GB and "Sep" under some ICU builds, and a
    // test that pins one of them fails on somebody else's machine for a reason
    // that has nothing to do with this code.
    const caveat = priceCaveat(totalOf([quoted(360, hoursAgo(48))]), NOW);
    expect(caveat).toMatch(/^Checked 10 \w+$/);
  });

  it('prefers Estimated over a freshness note', () => {
    // A guess checked this morning is still a guess, and that is the more
    // important of the two things to say.
    const total = totalOf([guessed(360), quoted(100, hoursAgo(48))]);
    expect(priceCaveat(total, NOW)).toBe('Estimated');
  });
});
