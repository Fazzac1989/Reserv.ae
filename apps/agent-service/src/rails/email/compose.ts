import { BRAND } from '@reservai/config';

export interface ReservationEmailInput {
  readonly venueName: string;
  readonly guestName: string;
  /** Local time, already formatted for the venue's own clock. */
  readonly dateLabel: string;
  readonly timeLabel: string;
  readonly partySize: number;
  /** The window the guest authorised, where they gave one. */
  readonly alternativeLabel?: string;
  readonly guestPhone?: string;
  readonly seating?: string;
  readonly occasion?: string;
  readonly specialRequests?: string;
  readonly threadRef: string;
}

/**
 * The message a venue actually receives.
 *
 * Written as a person would write it, because a person reads it. A restaurant
 * manager scanning their inbox between services needs the date, the time and
 * the number of people in the first two lines, and everything else underneath.
 *
 * Three rules hold it together.
 *
 * It says who is asking and on whose behalf, in the first sentence. An email
 * that hides that it is from a service reads as spam and gets deleted; one
 * that admits it and names the guest reads as a concierge and gets answered.
 *
 * It never states a time as booked. The subject is a request, the body asks,
 * and the closing line asks for a confirmation and a reference. Nothing here
 * can be misread as us telling them what has been arranged.
 *
 * It asks for one thing. A message that asks three questions gets one answer,
 * and the answer is to whichever question was easiest.
 */
export function composeReservationEmail(input: ReservationEmailInput): {
  subject: string;
  body: string;
} {
  const subject = `Table request — ${input.dateLabel}, ${input.timeLabel}, ${input.partySize} ${
    input.partySize === 1 ? 'guest' : 'guests'
  }`;

  const details: string[] = [
    `Date: ${input.dateLabel}`,
    `Time: ${input.timeLabel}`,
    `Guests: ${input.partySize}`,
    `Name: ${input.guestName}`,
  ];

  if (input.guestPhone) details.push(`Mobile: ${input.guestPhone}`);
  if (input.seating) details.push(`Preference: ${input.seating}`);
  if (input.occasion) details.push(`Occasion: ${input.occasion}`);
  if (input.specialRequests) details.push(`Notes: ${input.specialRequests}`);
  if (input.alternativeLabel) {
    details.push(`Also acceptable: ${input.alternativeLabel}`);
  }

  const body = [
    `Hello,`,
    ``,
    `This is ${BRAND.name}, making a reservation on behalf of ${input.guestName}.`,
    ``,
    ...details,
    ``,
    input.alternativeLabel
      ? `If that exact time is unavailable, anything within the window above is fine and needs no further approval.`
      : `If that exact time is unavailable, please let us know what you can do and we will check with the guest.`,
    ``,
    `Could you confirm whether you can hold this, and send a reference if you use one?`,
    ``,
    `Thank you,`,
    `${BRAND.name}`,
    // The marker a reply is matched on. Kept visible rather than hidden in a
    // header, because a venue replying from a phone will quote the body and
    // strip everything else — and a reply nobody can match becomes an ops task.
    `Ref: ${input.threadRef}`,
  ].join('\n');

  return { subject, body };
}
