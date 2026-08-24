/**
 * The life of a booking after it is confirmed.
 *
 * Reminders that fire once and only when they are still useful, SLA escalation
 * when a venue goes quiet, cancellation that unwinds with the venue, and the
 * rating that closes it out.
 */

import { execFileSync } from 'node:child_process';

const API = 'http://127.0.0.1:54421';
const MAIL = 'http://127.0.0.1:54424';
const AGENT = process.env.AGENT_SERVICE_URL ?? 'http://127.0.0.1:3941';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? '0123456789abcdef0123';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(54)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`,
  );
}

async function signIn(email) {
  await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: svc,
    body: JSON.stringify({ email, email_confirm: true }),
  });
  await fetch(`${API}/auth/v1/otp`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, create_user: false }),
  });

  let id = null;
  for (let i = 0; i < 30; i += 1) {
    const res = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`);
    if (res.ok) {
      const json = await res.json();
      id = json.messages?.[0]?.ID ?? null;
      if (id) break;
    }
    await sleep(400);
  }
  const msg = await (await fetch(`${MAIL}/api/v1/message/${id}`)).json();
  const code = `${msg.Text ?? ''}${msg.HTML ?? ''}`.match(/\b\d{6}\b/)?.[0];
  const verify = await (
    await fetch(`${API}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token: code, type: 'email' }),
    })
  ).json();
  return { token: verify.access_token, userId: verify.user.id };
}

function sql(statement) {
  return execFileSync(
    'docker',
    ['exec', '-i', 'supabase_db_reservai', 'psql', '-U', 'postgres', '-d', 'postgres', '-qtA', '-c', statement],
    { encoding: 'utf8' },
  ).trim();
}

/** Creates a booking already in a given state, without walking the whole flow. */
function makeBooking({ userId, venueId, scheduledOffsetHours, confirmedOffsetHours, status }) {
  const id = sql(`
    insert into public.bookings (user_id, venue_id, status, party_size, scheduled_for, confirmed_at, confirmation_evidence)
    values (
      '${userId}', '${venueId}', '${status}', 2,
      now() + interval '${scheduledOffsetHours} hours',
      ${confirmedOffsetHours === null ? 'null' : `now() - interval '${confirmedOffsetHours} hours'`},
      ${confirmedOffsetHours === null ? 'null' : `'{"kind":"ops_action","opsUserId":"00000000-0000-4000-8000-000000000000","note":"seeded for the lifecycle test"}'::jsonb`}
    ) returning id;`);
  return id;
}

async function sweep() {
  const res = await fetch(`${AGENT}/internal/sweep`, {
    method: 'POST',
    headers: { 'x-internal-secret': INTERNAL_SECRET },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const reachable = await fetch(`${AGENT}/health`).then((r) => r.ok).catch(() => false);
if (!reachable) {
  console.log(`SKIP  no agent service at ${AGENT}`);
  process.exit(0);
}

console.log('=== provisioning ===');
const user = await signIn('lifecycle-diner@example.invalid');
const venueId = sql("select id from public.venues where is_demo limit 1;");
sql(`delete from public.bookings where user_id = '${user.userId}';`);

// Confirmed two days ago, happening in 23 hours: the day-before reminder is due.
const dueTomorrow = makeBooking({
  userId: user.userId, venueId, scheduledOffsetHours: 23, confirmedOffsetHours: 48, status: 'confirmed',
});
// Happening in 30 hours: its moment has not arrived.
const notYet = makeBooking({
  userId: user.userId, venueId, scheduledOffsetHours: 30, confirmedOffsetHours: 48, status: 'confirmed',
});
// Confirmed six hours ago, happening in 90 minutes: the two-hour reminder is
// due, but "tomorrow" is long past and must not fire.
const soon = makeBooking({
  userId: user.userId, venueId, scheduledOffsetHours: 1.5, confirmedOffsetHours: 6, status: 'confirmed',
});
// Confirmed ten minutes ago for something 90 minutes away: every reminder
// moment had already passed when it was booked, so none of them are useful.
const lastMinute = makeBooking({
  userId: user.userId, venueId, scheduledOffsetHours: 1.5, confirmedOffsetHours: 0.16, status: 'confirmed',
});
console.log('four bookings seeded');

console.log('\n=== the sweep sends what is due, and nothing else ===');
const first = await sweep();
check('the sweep runs', first.status, 200);

check(
  'the booking happening tomorrow was reminded',
  sql(`select count(*) from public.booking_reminders where booking_id='${dueTomorrow}' and kind='day_before';`),
  '1',
);
check(
  'and its status moved to reminded',
  sql(`select status from public.bookings where id='${dueTomorrow}';`),
  'reminded',
);
check(
  'the booking 30 hours out was left alone',
  sql(`select count(*) from public.booking_reminders where booking_id='${notYet}';`),
  '0',
);
check(
  'the imminent booking got its two-hour reminder',
  sql(`select count(*) from public.booking_reminders where booking_id='${soon}' and kind='two_hours';`),
  '1',
);
// The case that would otherwise produce a nonsense notification.
check(
  'but not a "tomorrow" one whose moment is long past',
  sql(`select count(*) from public.booking_reminders where booking_id='${soon}' and kind='day_before';`),
  '0',
);
check(
  'a booking confirmed after every reminder moment gets none',
  sql(`select count(*) from public.booking_reminders where booking_id='${lastMinute}';`),
  '0',
);
// No device is registered, so nothing was delivered — and that is recorded
// honestly rather than counted as a success.
check(
  'delivery to zero devices is recorded as zero',
  sql(`select delivered_to from public.booking_reminders where booking_id='${dueTomorrow}';`),
  '0',
);

console.log('\n=== running it again changes nothing ===');
await sweep();
check(
  'still one reminder per booking',
  sql(`select count(*) from public.booking_reminders where booking_id='${dueTomorrow}';`),
  '1',
);
check(
  'and no duplicate audit entries',
  sql(`select count(*) from public.events_log where entity_id='${dueTomorrow}' and event='remind';`),
  '1',
);

console.log('\n=== a venue that goes quiet is escalated ===');
const quiet = makeBooking({
  userId: user.userId, venueId, scheduledOffsetHours: 72, confirmedOffsetHours: null, status: 'pending_venue',
});
// The WhatsApp SLA on the demo venues is 20 minutes. The clock runs from the
// audited moment we asked, so that is what the test has to create.
sql(`insert into public.events_log (entity_type, entity_id, event, actor, from_state, to_state, occurred_at)
     values ('booking', '${quiet}', 'await_venue', 'system', 'attempting', 'pending_venue', now() - interval '45 minutes');`);
sql(`update public.venue_booking_channels set is_enabled = true where venue_id='${venueId}' and kind='whatsapp';`);

await sweep();
check('the booking was escalated', sql(`select status from public.bookings where id='${quiet}';`), 'escalated');
check(
  'and a person was given the job',
  sql(`select count(*) from public.ops_tasks where booking_id='${quiet}' and kind='sla_breach';`),
  '1',
);
check(
  'with the wait recorded honestly',
  sql(`select reason ~ 'No reply from the venue in 4[0-9] minutes' from public.events_log where entity_id='${quiet}' and event='escalate';`),
  't',
);

console.log('\n=== the user cancels ===');
const cancelRes = await fetch(`${AGENT}/bookings/${dueTomorrow}/cancel`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
  body: JSON.stringify({ reason: 'Something came up' }),
});
const cancelBody = await cancelRes.json();
check('the cancellation is accepted', cancelRes.status, 200);
check('the booking is cancelled', sql(`select status from public.bookings where id='${dueTomorrow}';`), 'cancelled');
// It was confirmed, so the venue has to be told — and with no automated rail
// live, that is a person's job rather than something quietly skipped.
check('the venue is told', cancelBody.venueTold, 'ops');
check(
  'a task exists to tell them',
  sql(`select count(*) from public.ops_tasks where booking_id='${dueTomorrow}' and title like 'Cancel with%';`),
  '1',
);

console.log('\n=== another user cannot cancel it ===');
const other = await signIn('lifecycle-other@example.invalid');
const intrusion = await fetch(`${AGENT}/bookings/${notYet}/cancel`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other.token}` },
  body: JSON.stringify({}),
});
check('a stranger is refused', intrusion.status, 404);
check('and the booking is untouched', sql(`select status from public.bookings where id='${notYet}';`), 'confirmed');

console.log('\n=== rating closes it out ===');
sql(`update public.bookings set scheduled_for = now() - interval '3 hours' where id='${soon}';`);
const rateRes = await fetch(`${AGENT}/bookings/${soon}/rate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
  body: JSON.stringify({ rating: 4, note: 'Terrace was as good as promised' }),
});
check('the rating is accepted', rateRes.status, 200);
check('it is stored', sql(`select rating from public.bookings where id='${soon}';`), '4');
check('the booking is completed', sql(`select status from public.bookings where id='${soon}';`), 'completed');
check(
  'and completing it is in the audit trail',
  sql(`select count(*) from public.events_log where entity_id='${soon}' and event='complete';`),
  '1',
);

console.log('\n=== a booking that never happened cannot be rated ===');
const rateCancelled = await fetch(`${AGENT}/bookings/${dueTomorrow}/rate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
  body: JSON.stringify({ rating: 5 }),
});
check('rating a cancelled booking is refused', rateCancelled.status, 409);

console.log('\n=== the sweep endpoint is not public ===');
const noSecret = await fetch(`${AGENT}/internal/sweep`, { method: 'POST' });
check('no secret is refused', noSecret.status, 403);

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ===`);
process.exit(failures === 0 ? 0 : 1);
