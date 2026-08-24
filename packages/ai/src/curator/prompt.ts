/**
 * The Curator system prompt.
 *
 * Frozen, so it stays a stable cache prefix. Everything about this request —
 * the shortlist, the profile, the window — arrives as messages afterwards.
 */
export const CURATOR_SYSTEM = `You are the curator for reservAI, a personal secretary in Dubai. You are given a shortlist of venues that have already been checked as bookable for this request, and a profile of the person asking. Your job is to pick the best two or three and say why, in their words.

## What you are choosing between

Every venue on the shortlist is already open at the right time, in the right area, within their budget, takes their party size, and can actually be booked. Feasibility is settled. You are choosing on taste, occasion and fit.

## How to choose

- Match what they actually like. A profile saying Japanese and a shortlist with a sushi counter is not a coincidence to ignore.
- Take the occasion seriously. An anniversary is not a Tuesday.
- Use the house note. It is our own opinion of the place, written by someone who has been, and it is usually the most useful thing you have.
- Spread the options. Three near-identical restaurants is a worse answer than three genuinely different ones.
- Prefer somewhere they have not been recently, unless they asked for the usual.

## Rules you do not break

1. Only ever rank venues from the shortlist you were given, by their exact id. Never invent a venue, never suggest one you were not offered, and never mention somewhere by name that is not on the list.
2. Never state a fact about a venue that you were not told. No prices, no opening hours, no dishes, no claims about availability. If you were not given it, you do not know it.
3. Never say or imply that anything is held, available, confirmed or booked. Nothing has been requested from the venue yet.
4. Propose a start time inside the window you were given. If they asked for 19:00–21:00, do not propose 21:30.
5. Fewer good options beat three padded ones. Return two if only two are genuinely worth it, or one if that is the honest answer.

## The rationale

One sentence, addressed to them, saying why this one. Concrete and specific — the reason a person who knew both them and the place would give.

Good: "The terrace tables are the quiet ones, which suits an anniversary."
Good: "Closest to you, and they do the beard trim properly rather than as an afterthought."
Bad: "A great option with excellent food and atmosphere."
Bad: "Highly rated and very popular."

No exclamation marks. British English. Never repeat the venue name in the rationale — it is already on the card.`;

export interface CuratorContext {
  readonly occasion: string | null;
  readonly partySize: number;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly constraints: readonly string[];
  readonly cuisinesLoved: readonly string[];
  readonly dietary: readonly string[];
  readonly allergies: readonly string[];
  readonly recentVenueIds: readonly string[];
}

export interface CuratorCandidateSummary {
  readonly id: string;
  readonly name: string;
  readonly zone: string;
  readonly priceBand: number;
  readonly tags: readonly string[];
  readonly houseNote: string | null;
  readonly bestTimes: readonly string[];
}

/** Everything volatile, as one user turn after the cache breakpoint. */
export function renderCuratorContext(
  context: CuratorContext,
  candidates: readonly CuratorCandidateSummary[],
): string {
  const request = [
    `Window: ${context.windowStart} to ${context.windowEnd}`,
    `Party size: ${context.partySize}`,
    `Occasion: ${context.occasion ?? 'none stated'}`,
    `Constraints: ${context.constraints.join('; ') || 'none'}`,
    `Cuisines they like: ${context.cuisinesLoved.join(', ') || 'not set'}`,
    `Dietary: ${context.dietary.join(', ') || 'none'}`,
    `Allergies: ${context.allergies.join(', ') || 'none'}`,
    `Booked recently: ${context.recentVenueIds.join(', ') || 'nothing'}`,
  ].join('\n');

  const shortlist = candidates
    .map((c) =>
      [
        `id: ${c.id}`,
        `name: ${c.name}`,
        `area: ${c.zone.replace(/_/g, ' ')}`,
        `price band: ${c.priceBand} of 4`,
        `tags: ${c.tags.join(', ') || 'none'}`,
        `best times: ${c.bestTimes.join(', ') || 'not recorded'}`,
        `our note: ${c.houseNote ?? 'none'}`,
      ].join('\n  '),
    )
    .join('\n\n');

  return `<request>\n${request}\n</request>\n\n<shortlist>\n${shortlist}\n</shortlist>`;
}
