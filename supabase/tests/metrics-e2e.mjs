/**
 * The pilot scorecard, against a dataset with known answers.
 *
 * Analytics that quietly compute the wrong number are worse than no analytics:
 * nobody checks a dashboard the way they check a booking, and a wrong
 * conversion rate would be believed for weeks. So the fixture below has answers
 * that can be worked out by hand, and the test asserts them exactly.
 */

import { execFileSync } from 'node:child_process';

const AGENT = process.env.AGENT_SERVICE_URL ?? 'http://127.0.0.1:3941';
const API = 'http://127.0.0.1:54421';
const MAIL = 'http://127.0.0.1:54424';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(50)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`,
  );
}

function sql(statement) {
  return execFileSync(
    'docker',
    ['exec', '-i', 'supabase_db_reservai', 'psql', '-U', 'postgres', '-d', 'postgres', '-qtA', '-c', statement],
    { encoding: 'utf8' },
  ).trim();
}

async function signIn(email) {
  await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
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

const reachable = await fetch(`${AGENT}/health`).then((r) => r.ok).catch(() => false);
if (!reachable) {
  console.log(`SKIP  no agent service at ${AGENT}`);
  process.exit(0);
}

console.log('=== a fixture whose answers can be worked out by hand ===');
const user = await signIn('metrics-diner@example.invalid');
const venueId = sql('select id from public.venues where is_demo limit 1;');

// Start from nothing so the numbers below are exactly what this test created.
sql(`delete from public.requests where user_id = '${user.userId}';`);
sql(`delete from public.bookings where user_id = '${user.userId}';`);
sql(`delete from public.pricing_signals where user_id = '${user.userId}';`);

/**
 * Five requests:
 *   1. needed a clarifying question, went no further
 *   2. got options, nobody approved one
 *   3. approved, still waiting on the venue
 *   4. approved and confirmed
 *   5. approved, confirmed, and they went
 *
 * So: 5 requests, 1 clarified, 4 with options, 3 approved, 2 confirmed, 1 completed.
 * Confirmed of all requests = 2/5 = 40.0%. Of those we could serve = 2/4 = 50.0%.
 */
function makeRequest(status) {
  return sql(`insert into public.requests (user_id, input, status)
    values ('${user.userId}', '{"kind":"text","text":"fixture"}'::jsonb, '${status}') returning id;`);
}

function addSuggestion(requestId) {
  return sql(`insert into public.suggestions
    (request_id, venue_id, rank, proposed_starts_at, proposed_ends_at, rationale)
    values ('${requestId}', '${venueId}', 1, now() + interval '2 days',
            now() + interval '2 days 2 hours', 'fixture') returning id;`);
}

function addBooking(requestId, status, { confirmed = false, completed = false } = {}) {
  return sql(`insert into public.bookings
    (user_id, venue_id, request_id, status, party_size, scheduled_for, confirmed_at, confirmation_evidence, completed_at)
    values ('${user.userId}', '${venueId}', '${requestId}', '${status}', 2,
            now() + interval '2 days',
            ${confirmed ? "now() - interval '10 minutes'" : 'null'},
            ${confirmed ? `'{"kind":"ops_action","opsUserId":"00000000-0000-4000-8000-000000000000","note":"fixture"}'::jsonb` : 'null'},
            ${completed ? 'now()' : 'null'})
    returning id;`);
}

const r1 = makeRequest('needs_clarification');
const r2 = makeRequest('suggested');
addSuggestion(r2);
const r3 = makeRequest('converted');
addSuggestion(r3);
addBooking(r3, 'pending_venue');
const r4 = makeRequest('converted');
addSuggestion(r4);
const b4 = addBooking(r4, 'confirmed', { confirmed: true });
const r5 = makeRequest('converted');
addSuggestion(r5);
addBooking(r5, 'completed', { confirmed: true, completed: true });
console.log(`five requests seeded (${r1.slice(0, 8)}…)`);

console.log('\n=== the funnel counts what it says it counts ===');
const funnel = JSON.parse(
  sql(`select row_to_json(f) from public.pilot_funnel(now() - interval '1 day', now() + interval '1 day') f;`),
);
check('requests', funnel.requests, 5);
check('needed a question back', funnel.clarified, 1);
check('got options', funnel.suggested, 4);
check('approved one', funnel.approved, 3);
check('confirmed by the venue', funnel.confirmed, 2);
check('actually went', funnel.completed, 1);

// The two denominators, which is the whole point of computing both.
check('confirmed as a share of all requests', Number(funnel.confirmed_of_all), 40.0);
check('confirmed as a share of those we served', Number(funnel.confirmed_of_served), 50.0);

console.log('\n=== time to confirmation is measured from the user saying yes ===');
// Approved 40 minutes ago, confirmed 10 minutes ago: a 30-minute wait.
sql(`insert into public.events_log (entity_type, entity_id, event, actor, from_state, to_state, occurred_at)
     values ('booking', '${b4}', 'user_approve', 'user', 'draft', 'user_approved', now() - interval '40 minutes');`);

const timings = sql(`select rail || ':' || median_minutes
  from public.time_to_confirmation(now() - interval '1 day', now() + interval '1 day');`);
check('the manual rail median is the real wait', timings, 'manual:30.0');

console.log('\n=== a venue that never had the booking is counted against it ===');
sql(`update public.bookings set no_show = true where id = '${b4}';`);
const reliability = JSON.parse(
  sql(`select row_to_json(v) from public.venue_reliability() v where v.venue_id = '${venueId}';`),
);
check('the failure is attributed to the venue', reliability.no_show_at_venue, 1);

console.log('\n=== willingness to pay ===');
const promptBefore = await (
  await fetch(`${AGENT}/pricing/prompt`, { headers: { Authorization: `Bearer ${user.token}` } })
).json();
// Two confirmed bookings is the bar: an opinion from someone who has never had
// one is not a signal.
check('a user with two confirmed bookings is asked', promptBefore.shouldAsk, true);
check('at the pilot price', promptBefore.priceAed, 99);

const answer = await fetch(`${AGENT}/pricing/signal`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
  body: JSON.stringify({ answer: 'yes', comment: 'Worth it if it keeps working' }),
});
check('the answer is accepted', answer.status, 200);

const promptAfter = await (
  await fetch(`${AGENT}/pricing/prompt`, { headers: { Authorization: `Bearer ${user.token}` } })
).json();
check('and they are not asked twice', promptAfter.shouldAsk, false);

const wtp = JSON.parse(sql("select row_to_json(w) from public.willingness_to_pay(99) w;"));
check('the yes is counted', wtp.yes, 1);
check('with the denominator stated', wtp.asked, 1);

console.log('\n=== billing is dormant, and says so ===');
const billing = await (
  await fetch(`${AGENT}/billing/status`, { headers: { Authorization: `Bearer ${user.token}` } })
).json();
check('subscriptions are off', billing.enabled, false);
check('and the app is told why', billing.message, 'reservAI is free during the pilot.');

const checkout = await fetch(`${AGENT}/billing/checkout`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
  body: '{}',
});
// Refusing outright beats returning a checkout URL that goes nowhere.
check('checkout refuses rather than half-working', checkout.status, 503);

console.log('\n=== a client cannot write its own subscription ===');
const forge = await fetch(`${API}/rest/v1/subscriptions`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: user.userId, status: 'active' }),
});
check('inserting a subscription is refused', forge.status >= 400, true);

console.log('\n=== the model endpoints are rate limited ===');
// Twenty a minute. The 21st must be refused rather than costing another call.
let limited = 0;
let lastStatus = 0;
for (let i = 0; i < 25; i += 1) {
  const res = await fetch(`${AGENT}/concierge/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
    body: JSON.stringify({ text: 'rate limit probe' }),
  });
  lastStatus = res.status;
  if (res.status === 429) limited += 1;
}
check('the limit bites before 25 model calls', limited > 0, true);
check('and says so as 429, not as a server error', lastStatus, 429);

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ===`);
process.exit(failures === 0 ? 0 : 1);
