/**
 * Money, and where a number came from.
 *
 * Two rules, and the second is the one that matters.
 *
 * Amounts are integer fils. Never floats: 0.1 + 0.2 is not 0.3, and a
 * reservation system that is a fraction of a fils out on a deposit is a
 * reservation system somebody eventually has to reconcile by hand. One AED is
 * one hundred fils and every amount in this product is an integer count of
 * them.
 *
 * A price carries its provenance. "AED 760" is not a fact on its own — it
 * matters enormously whether that came off a published menu, out of a venue's
 * mouth this morning, or from our own guess. The UI has to be able to say
 * "Estimated" or "Quoted, checked at 14:20", and it can only do that if the
 * number arrives with the answer attached.
 */

export const CURRENCY = 'AED' as const;
export const FILS_PER_AED = 100;

export interface Money {
  readonly fils: number;
}

/**
 * Where a number came from, worst to best.
 *
 * Ordered deliberately: combining prices takes the weakest source, because a
 * total is only as trustworthy as the softest number in it.
 */
export const PRICE_SOURCES = ['estimate', 'menu', 'venue_quote', 'platform'] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export interface Price {
  readonly amount: Money;
  readonly source: PriceSource;
  /** When somebody last checked this against the venue. Null means never. */
  readonly checkedAt: string | null;
}

export function aed(amount: number): Money {
  // Rounded rather than truncated, and asserted to be sane. A price arriving
  // as 12.005 is a bug upstream, but rounding it here is better than storing
  // 1200.4999999 fils and discovering it in a total three screens later.
  return { fils: Math.round(amount * FILS_PER_AED) };
}

export function fils(amount: number): Money {
  if (!Number.isInteger(amount)) {
    throw new RangeError(`Fils must be a whole number, got ${amount}.`);
  }
  return { fils: amount };
}

export function addMoney(...amounts: Money[]): Money {
  return { fils: amounts.reduce((sum, m) => sum + m.fils, 0) };
}

export function subtractMoney(a: Money, b: Money): Money {
  return { fils: a.fils - b.fils };
}

/**
 * "AED 1,120" or "AED 1,120.50".
 *
 * The minor unit is dropped when it is zero, because "AED 1,120.00" is how a
 * spreadsheet writes a price and not how a person says one. It is kept the
 * moment there is anything after the point, because rounding a real 50 fils
 * away is worse than an untidy line.
 */
export function formatMoney(money: Money): string {
  const whole = Math.trunc(money.fils / FILS_PER_AED);
  const minor = Math.abs(money.fils % FILS_PER_AED);
  const grouped = whole.toLocaleString('en-GB');
  return minor === 0
    ? `${CURRENCY} ${grouped}`
    : `${CURRENCY} ${grouped}.${String(minor).padStart(2, '0')}`;
}

export interface Total {
  readonly amount: Money;
  /**
   * True when any component was a guess.
   *
   * The rule this module exists for: a total containing one estimate is an
   * estimate. Presenting "AED 1,120" as a firm number because three of its
   * four parts were quoted is the arithmetic equivalent of confirming a
   * booking on partial evidence.
   */
  readonly estimated: boolean;
  /** The weakest provenance in the set. */
  readonly source: PriceSource;
  /**
   * The oldest check among the components, or null if anything was never
   * checked. A total is exactly as fresh as its stalest part.
   */
  readonly checkedAt: string | null;
}

export function totalOf(prices: readonly Price[]): Total {
  const amount = addMoney(...prices.map((p) => p.amount));

  if (prices.length === 0) {
    return { amount, estimated: false, source: 'platform', checkedAt: null };
  }

  // The weakest link, by the order PRICE_SOURCES is declared in.
  const source = prices.reduce<PriceSource>((worst, p) => {
    return PRICE_SOURCES.indexOf(p.source) < PRICE_SOURCES.indexOf(worst) ? p.source : worst;
  }, 'platform');

  // Null wins: one unchecked component makes the whole total unchecked, rather
  // than letting a recent check on another part vouch for it.
  const checkedAt = prices.some((p) => p.checkedAt === null)
    ? null
    : prices
        .map((p) => p.checkedAt!)
        .reduce((oldest, at) => (Date.parse(at) < Date.parse(oldest) ? at : oldest));

  return { amount, estimated: source === 'estimate', source, checkedAt };
}

/**
 * What is left to pay after a deposit.
 *
 * A deposit is part of the total, not an extra on top — the brief says so and
 * it is also how deposits actually work. Getting this backwards shows somebody
 * a bill AED 200 larger than the one they agreed to, which is the single
 * costliest arithmetic mistake this product could make.
 */
export function balanceAfterDeposit(total: Money, deposit: Money): Money {
  if (deposit.fils > total.fils) {
    throw new RangeError(
      `A deposit of ${formatMoney(deposit)} is larger than the total of ${formatMoney(total)}.`,
    );
  }
  return subtractMoney(total, deposit);
}

export type Freshness = 'checked' | 'stale' | 'unchecked';

/**
 * How much a checked price is still worth.
 *
 * Six hours, chosen because a restaurant's evening changes over a day and not
 * over a week. A price checked this morning is worth showing as checked; one
 * checked on Tuesday is worth showing with its date so a person can judge it
 * themselves.
 */
export const PRICE_FRESH_HOURS = 6;

export function freshnessOf(checkedAt: string | null, now: Date = new Date()): Freshness {
  if (checkedAt === null) return 'unchecked';
  const age = now.getTime() - Date.parse(checkedAt);
  return age <= PRICE_FRESH_HOURS * 3_600_000 ? 'checked' : 'stale';
}

/**
 * What to put next to a number, in words.
 *
 * Returns null when there is nothing worth saying — a platform price checked
 * ten minutes ago needs no caveat, and a label on every line trains people to
 * stop reading labels.
 */
export function priceCaveat(total: Total, now: Date = new Date()): string | null {
  if (total.estimated) return 'Estimated';
  const freshness = freshnessOf(total.checkedAt, now);
  if (freshness === 'unchecked') return 'Not checked with the venue';
  if (freshness === 'stale') {
    const when = new Date(total.checkedAt!).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
    return `Checked ${when}`;
  }
  return null;
}
