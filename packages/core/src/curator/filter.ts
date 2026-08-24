import type { OpeningHours, Vertical, Zone } from '../schemas/common';

/**
 * Deterministic candidate filtering.
 *
 * This runs before any model sees anything, and it is the half of the Curator
 * that must be right: a venue that survives here is genuinely bookable for this
 * request. Ranking is a matter of taste and an LLM does it well; feasibility is
 * a matter of fact and an LLM should never be asked.
 *
 * Every rejection carries a reason, because "why was nothing suggested" is a
 * question ops will need answered on a real user's request.
 */

export interface CandidateVenue {
  readonly id: string;
  readonly name: string;
  readonly vertical: Vertical;
  readonly zone: Zone;
  readonly price_band: number;
  readonly tags: readonly string[];
  readonly opening_hours: readonly OpeningHours[];
  readonly onboarding_status: string;
  readonly booking_consent_obtained_at: string | null;
  /** Rails configured for this venue that are enabled and globally switched on. */
  readonly reachableRails: readonly string[];
  readonly policy: {
    readonly min_lead_time_minutes: number;
    readonly max_lead_time_days: number;
    readonly min_party_size: number;
    readonly max_party_size: number;
  } | null;
}

export interface CuratorRequest {
  readonly vertical: Vertical;
  readonly zones: readonly Zone[];
  readonly window: { readonly starts_at: string; readonly ends_at: string };
  readonly partySize: number;
  readonly priceBandMax: number;
  readonly cuisinesAvoided: readonly string[];
  /** Evaluated against, not guessed from — the caller supplies it. */
  readonly now: string;
}

export type RejectionReason =
  | 'not_live'
  | 'no_booking_consent'
  | 'wrong_vertical'
  | 'outside_zones'
  | 'too_expensive'
  | 'party_too_large'
  | 'party_too_small'
  | 'not_enough_notice'
  | 'too_far_ahead'
  | 'closed_during_window'
  | 'unreachable'
  | 'avoided_cuisine';

export interface Rejection {
  readonly venueId: string;
  readonly name: string;
  readonly reason: RejectionReason;
}

export interface FilterResult {
  readonly candidates: CandidateVenue[];
  readonly rejected: Rejection[];
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function minutesOfDay(clock: string): number {
  const [h, m] = clock.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * Does the venue's week overlap the requested window at all?
 *
 * Opening hours are venue-local wall-clock; the window is an instant range. The
 * pilot is a single city on one offset, so the day and time are read in Dubai
 * time rather than pretending to handle arbitrary timezones badly.
 */
const DUBAI_OFFSET_MINUTES = 4 * 60;

function localParts(iso: string): { day: (typeof DAYS)[number]; minutes: number } {
  const shifted = new Date(Date.parse(iso) + DUBAI_OFFSET_MINUTES * 60_000);
  return {
    day: DAYS[shifted.getUTCDay()]!,
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

export function isOpenDuring(
  hours: readonly OpeningHours[],
  window: { starts_at: string; ends_at: string },
): boolean {
  // No recorded hours means we cannot rule it out. Ops fills these in; until
  // then the venue stays a candidate rather than silently disappearing.
  if (hours.length === 0) return true;

  const start = localParts(window.starts_at);
  const end = localParts(window.ends_at);

  // A window spanning midnight is checked against both days it touches.
  const days = start.day === end.day ? [start.day] : [start.day, end.day];

  return hours.some((entry) => {
    if (!days.includes(entry.day)) return false;
    const opens = minutesOfDay(entry.opens_at);
    let closes = minutesOfDay(entry.closes_at);
    // Closing "after midnight" is written as a smaller number than opening.
    if (closes <= opens) closes += 24 * 60;

    const from = entry.day === start.day ? start.minutes : 0;
    const to = entry.day === end.day ? end.minutes : 24 * 60;
    const requestEnd = to <= from ? to + 24 * 60 : to;

    return from < closes && requestEnd > opens;
  });
}

function rejectionFor(venue: CandidateVenue, request: CuratorRequest): RejectionReason | null {
  if (venue.onboarding_status !== 'live') return 'not_live';
  // Belt and braces: the database will not let a venue be live without this,
  // but the Curator must never be the thing that books somewhere unconsenting.
  if (venue.booking_consent_obtained_at === null) return 'no_booking_consent';
  if (venue.vertical !== request.vertical) return 'wrong_vertical';
  if (request.zones.length > 0 && !request.zones.includes(venue.zone)) return 'outside_zones';
  if (venue.price_band > request.priceBandMax) return 'too_expensive';

  // Nowhere to send the request is the same as no availability.
  if (venue.reachableRails.length === 0) return 'unreachable';

  const avoided = request.cuisinesAvoided.map((c) => c.toLowerCase());
  if (venue.tags.some((tag) => avoided.includes(tag.toLowerCase()))) return 'avoided_cuisine';

  if (venue.policy) {
    if (request.partySize > venue.policy.max_party_size) return 'party_too_large';
    if (request.partySize < venue.policy.min_party_size) return 'party_too_small';

    const noticeMinutes = (Date.parse(request.window.starts_at) - Date.parse(request.now)) / 60_000;
    if (noticeMinutes < venue.policy.min_lead_time_minutes) return 'not_enough_notice';

    const aheadDays = noticeMinutes / (60 * 24);
    if (aheadDays > venue.policy.max_lead_time_days) return 'too_far_ahead';
  }

  if (!isOpenDuring(venue.opening_hours, request.window)) return 'closed_during_window';

  return null;
}

export function filterCandidates(
  venues: readonly CandidateVenue[],
  request: CuratorRequest,
): FilterResult {
  const candidates: CandidateVenue[] = [];
  const rejected: Rejection[] = [];

  for (const venue of venues) {
    const reason = rejectionFor(venue, request);
    if (reason === null) candidates.push(venue);
    else rejected.push({ venueId: venue.id, name: venue.name, reason });
  }

  return { candidates, rejected };
}

/** Reads as a sentence in the ops console when a request found nothing. */
export const REJECTION_LABELS: Record<RejectionReason, string> = {
  not_live: 'not live yet',
  no_booking_consent: 'has not agreed to bookings',
  wrong_vertical: 'wrong kind of venue',
  outside_zones: 'outside the requested area',
  too_expensive: 'above their spend band',
  party_too_large: 'party too large',
  party_too_small: 'party too small',
  not_enough_notice: 'not enough notice',
  too_far_ahead: 'too far ahead',
  closed_during_window: 'closed then',
  unreachable: 'no working booking channel',
  avoided_cuisine: 'a cuisine they avoid',
};
