import { describe, expect, it } from 'vitest';
import { answerVenueQuestion, caveatFor, type VenueFacts, type VenueQuestion } from './answers';

const restaurant: VenueFacts = {
  vertical: 'restaurant',
  name: 'Aster & Ash',
  children_policy: 'Children welcome until 8pm.',
  alcohol_policy: 'Licensed. Full bar.',
  dress_code: 'Smart casual.',
  dietary_options: ['vegetarian', 'vegan', 'gluten free on request'],
  accessibility: ['step-free entrance'],
  parking: ['valet', 'on-site'],
  has_indoor: true,
  has_outdoor: true,
  has_view: 'Burj Khalifa',
  private_space: true,
  verified_at: null,
};

/** Everything we might know, known about nothing. */
const empty: VenueFacts = { vertical: 'restaurant', name: 'The Unknown' };

const ALL: VenueQuestion[] = [
  'children',
  'outdoor',
  'dress_code',
  'dietary',
  'alcohol',
  'parking',
  'accessibility',
  'private',
  'view',
];

describe('answering from the record', () => {
  it('gives back what is stored, verbatim', () => {
    const answer = answerVenueQuestion('children', restaurant);
    expect(answer.kind).toBe('answered');
    expect(answer.text).toBe('Children welcome until 8pm.');
  });

  it('reads a list as a sentence', () => {
    const answer = answerVenueQuestion('dietary', restaurant);
    expect(answer.text).toBe('They list vegetarian, vegan and gluten free on request.');
  });

  it('distinguishes seating outside as well as in', () => {
    expect(answerVenueQuestion('outdoor', restaurant).text).toContain('as well as in');
    expect(answerVenueQuestion('outdoor', { ...restaurant, has_indoor: false }).text).toBe(
      'Yes, the seating is outside.',
    );
  });
});

describe('refusing to answer what it does not hold', () => {
  it('says so for every question when the record is empty', () => {
    // The whole point of the module. Nothing here may become a cheerful
    // default: an app that says "children welcome" because nobody said
    // otherwise is worse than one that says nothing.
    for (const question of ALL) {
      const answer = answerVenueQuestion(question, empty);
      expect(answer.kind, `${question} should be unknown`).toBe('unknown');
      expect(answer.text).toContain('do not have that on record');
    }
  });

  it('offers to ask rather than only apologising', () => {
    // "I do not know" is where a concierge stops being useful.
    expect(answerVenueQuestion('parking', empty).text).toContain('I can ask them when I book');
  });

  it('treats an empty list as not knowing, not as none', () => {
    const answer = answerVenueQuestion('dietary', { ...empty, dietary_options: [] });
    expect(answer.kind).toBe('unknown');
  });

  it('treats a false boolean as an answer and a null one as not knowing', () => {
    // The distinction that matters: "no outdoor seating" is a fact somebody
    // recorded; a null is nobody having looked.
    const no = answerVenueQuestion('outdoor', { ...empty, has_outdoor: false });
    expect(no.kind).toBe('answered');
    expect(no.text).toBe('No, the seating is all indoors.');

    expect(answerVenueQuestion('outdoor', { ...empty, has_outdoor: null }).kind).toBe('unknown');
  });
});

describe('questions that do not arise', () => {
  it('does not pretend to wonder whether a barber serves alcohol', () => {
    const barber: VenueFacts = { vertical: 'barber', name: 'Gate Twelve Barbers' };
    expect(answerVenueQuestion('alcohol', barber).kind).toBe('not_asked');
    expect(answerVenueQuestion('dietary', barber).kind).toBe('not_asked');
  });

  it('still answers the questions that do apply to a barber', () => {
    const barber: VenueFacts = {
      vertical: 'barber',
      name: 'Gate Twelve Barbers',
      parking: ['on-site'],
    };
    expect(answerVenueQuestion('parking', barber).kind).toBe('answered');
    expect(answerVenueQuestion('children', barber).kind).toBe('unknown');
  });
});

describe('the caveat', () => {
  it('marks an answer nobody has checked with the venue', () => {
    // An unverified record read out confidently is the same overreach as an
    // invented answer; the only difference is where the sentence came from.
    const answer = answerVenueQuestion('children', restaurant);
    expect(caveatFor(answer)).toContain('from our listing rather than from the venue');
  });

  it('says nothing extra once a human has verified the listing', () => {
    const verified = { ...restaurant, verified_at: '2026-09-01T00:00:00.000Z' };
    expect(caveatFor(answerVenueQuestion('children', verified))).toBeNull();
  });

  it('adds nothing to an answer that was never given', () => {
    expect(caveatFor(answerVenueQuestion('children', empty))).toBeNull();
  });
});
