/**
 * Answering a question about a venue from what we actually hold.
 *
 * Deterministic on purpose, and it is the same split the Curator uses: the
 * database knows the facts, the model is only ever allowed taste. "Is it
 * suitable for children?" is not a question of judgement — either
 * `children_policy` says something or it does not — and handing it to a model
 * introduces the one failure this product cannot afford, which is a confident
 * answer about a venue nobody has asked.
 *
 * The three outcomes are deliberately distinct, because they are three
 * different things to say to a person:
 *
 *   answered   — we hold this, and here it is.
 *   unknown    — we do not hold it. Say so, and offer to ask.
 *   not_asked  — the question does not apply to this kind of venue at all.
 *
 * Collapsing `unknown` into `answered` with a cheerful default is how an app
 * tells somebody a restaurant is child-friendly because nobody said otherwise.
 */

export interface VenueFacts {
  readonly vertical: string;
  readonly name: string;
  readonly children_policy?: string | null;
  readonly alcohol_policy?: string | null;
  readonly smoking_policy?: string | null;
  readonly dress_code?: string | null;
  readonly dietary_options?: readonly string[] | null;
  readonly accessibility?: readonly string[] | null;
  readonly parking?: readonly string[] | null;
  readonly has_outdoor?: boolean | null;
  readonly has_indoor?: boolean | null;
  readonly has_view?: string | null;
  readonly private_space?: boolean | null;
  readonly verified_at?: string | null;
}

export type VenueQuestion =
  | 'children'
  | 'outdoor'
  | 'dress_code'
  | 'dietary'
  | 'alcohol'
  | 'parking'
  | 'accessibility'
  | 'private'
  | 'view';

export type VenueAnswer =
  | { readonly kind: 'answered'; readonly text: string; readonly verified: boolean }
  | { readonly kind: 'unknown'; readonly text: string }
  | { readonly kind: 'not_asked'; readonly text: string };

function list(values: readonly string[] | null | undefined): string | null {
  if (!values || values.length === 0) return null;
  if (values.length === 1) return values[0]!;
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

/**
 * Alcohol does not arise for a barber or a salon.
 *
 * Distinguished from "we do not know" because they are not the same sentence.
 * "I do not know whether the barber serves alcohol" is a strange thing to say
 * and makes the assistant look like it is guessing at categories.
 */
function applies(question: VenueQuestion, vertical: string): boolean {
  if (vertical === 'restaurant') return true;
  return !['alcohol', 'dietary'].includes(question);
}

export function answerVenueQuestion(question: VenueQuestion, facts: VenueFacts): VenueAnswer {
  if (!applies(question, facts.vertical)) {
    return {
      kind: 'not_asked',
      text: `That is not something ${facts.name} would be asked about.`,
    };
  }

  const verified = Boolean(facts.verified_at);
  const answered = (text: string): VenueAnswer => ({ kind: 'answered', text, verified });

  // "I will ask" rather than "I do not know", because the second is where a
  // concierge stops being useful and the first is what it is for.
  const unknown = (): VenueAnswer => ({
    kind: 'unknown',
    text: `I do not have that on record for ${facts.name}. I can ask them when I book — say the word and I will.`,
  });

  switch (question) {
    case 'children':
      return facts.children_policy ? answered(facts.children_policy) : unknown();

    case 'dress_code':
      return facts.dress_code ? answered(facts.dress_code) : unknown();

    case 'alcohol':
      return facts.alcohol_policy ? answered(facts.alcohol_policy) : unknown();

    case 'outdoor': {
      // A boolean that is false is an answer; a boolean that is null is not.
      if (facts.has_outdoor === true) {
        return answered(
          facts.has_indoor === true
            ? 'Yes — there is seating outside as well as in.'
            : 'Yes, the seating is outside.',
        );
      }
      if (facts.has_outdoor === false) return answered('No, the seating is all indoors.');
      return unknown();
    }

    case 'view':
      return facts.has_view
        ? answered(`Yes — it looks out over the ${facts.has_view.toLowerCase()}.`)
        : unknown();

    case 'private':
      if (facts.private_space === true) {
        return answered('Yes, there is a private space. It is on request rather than guaranteed.');
      }
      if (facts.private_space === false) return answered('No private space, no.');
      return unknown();

    case 'dietary': {
      const options = list(facts.dietary_options);
      return options ? answered(`They list ${options}.`) : unknown();
    }

    case 'parking': {
      const options = list(facts.parking);
      return options ? answered(`Parking: ${options}.`) : unknown();
    }

    case 'accessibility': {
      const options = list(facts.accessibility);
      return options ? answered(`They list ${options}.`) : unknown();
    }

    default:
      return unknown();
  }
}

/**
 * What to add after an answer we hold but nobody has checked.
 *
 * Every listing starts unverified, and an answer read confidently off an
 * unverified record is the same overreach as inventing one — the only
 * difference is that the sentence came from a spreadsheet rather than a model.
 * Returns null when there is nothing to add, so callers can render nothing
 * rather than a disclaimer on every line.
 */
export function caveatFor(answer: VenueAnswer): string | null {
  if (answer.kind !== 'answered') return null;
  if (answer.verified) return null;
  return 'That is from our listing rather than from the venue. I will confirm it when I book.';
}
