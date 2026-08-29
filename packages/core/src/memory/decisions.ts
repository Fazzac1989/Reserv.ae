/**
 * What choosing one option over another actually tells you.
 *
 * Every suggestion shown was already feasible — the filter guaranteed it — so
 * picking one is a preference rather than a constraint, and it is the only
 * signal this product gets that nobody self-reported.
 *
 * The care needed here is in what a rejection does *not* mean. If someone is
 * shown three Japanese restaurants and books one, they did not reject Japanese
 * food twice. Recording it that way would teach the assistant the opposite of
 * what happened, and it would do it confidently, three observations at a time.
 * So only attributes that actually differed between the chosen and the passed
 * over are counted at all.
 */

export interface DecisionVenue {
  readonly venueId: string;
  readonly vertical: string;
  readonly zone: string;
  readonly priceBand: number;
  readonly tags: readonly string[];
}

export interface Observation {
  readonly subject: string;
  readonly attribute: string;
  readonly value: string;
  readonly agreed: boolean;
}

/** Attributes that carry meaning when they differ. */
function attributesOf(venue: DecisionVenue): { attribute: string; value: string }[] {
  return [
    { attribute: 'zone', value: venue.zone },
    { attribute: 'price_band', value: String(venue.priceBand) },
    ...venue.tags.map((tag) => ({ attribute: 'tag', value: tag.toLowerCase() })),
  ];
}

function key(a: { attribute: string; value: string }): string {
  return `${a.attribute}:${a.value}`;
}

/**
 * The observations to record from one decision.
 *
 * The chosen venue's attributes are all evidence for it. A passed-over venue
 * only contributes the attributes the chosen one did not share — those are the
 * differences the person actually chose between.
 */
export function signalsFromDecision(
  chosen: DecisionVenue,
  passedOver: readonly DecisionVenue[],
): Observation[] {
  const chosenAttributes = attributesOf(chosen);
  const chosenKeys = new Set(chosenAttributes.map(key));

  const observations: Observation[] = chosenAttributes.map((a) => ({
    subject: chosen.vertical,
    attribute: a.attribute,
    value: a.value,
    agreed: true,
  }));

  // One row per distinct difference, however many of the passed-over venues
  // happened to share it. Three rejections of the same thing in one decision
  // is one decision, not three.
  const seen = new Set<string>();

  for (const venue of passedOver) {
    for (const a of attributesOf(venue)) {
      const k = key(a);
      if (chosenKeys.has(k) || seen.has(k)) continue;
      seen.add(k);
      observations.push({
        subject: venue.vertical,
        attribute: a.attribute,
        value: a.value,
        agreed: false,
      });
    }
  }

  return observations;
}
