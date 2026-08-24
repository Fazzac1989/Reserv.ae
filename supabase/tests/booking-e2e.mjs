/**
 * The booking lifecycle, driven through the agent service.
 *
 * This is the path the pilot depends on: a user approves, ops works it by hand,
 * and the booking only becomes `confirmed` when a human records what the venue
 * actually agreed. Every move goes through the state machine and lands in the
 * audit trail, or it does not happen at all.
 */

const API = 'http://127.0.0.1:54421';
const MAIL = 'http://127.0.0.1:54424';
const AGENT = process.env.AGENT_SERVICE_URL ?? 'http://127.0.0.1:3941';
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

const svc = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
};

async function createUser(email) {
  await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: svc,
    body: JSON.stringify({ email, email_confirm: true }),
  });
}

async function signIn(email) {
  await fetch(`${API}/auth/v1/otp`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, create_user: false }),
  });

  let id = null;
  for (let i = 0; i < 30; i += 1) {
    const res = await fetch(
      `${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`,
    );
    if (res.ok) {
      const json = await res.json();
      id = json.messages?.[0]?.ID ?? null;
      if (id) break;
    }
    await sleep(400);
  }
  if (!id) throw new Error(`no OTP email for ${email}`);

  const msg = await (await fetch(`${MAIL}/api/v1/message/${id}`)).json();
  const code = `${msg.Text ?? ''}${msg.HTML ?? ''}`.match(/\b\d{6}\b/)?.[0];
  const verify = await (
    await fetch(`${API}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token: code, type: 'email' }),
    })
  ).json();
  if (!verify.access_token) throw new Error(`verify failed: ${JSON.stringify(verify)}`);
  return { token: verify.access_token, userId: verify.user.id };
}

async function transitionAs(token, bookingId, body) {
  const res = await fetch(`${AGENT}/bookings/${bookingId}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function statusOf(bookingId) {
  const rows = await (
    await fetch(
      `${API}/rest/v1/bookings?select=status,confirmed_at,confirmation_evidence&id=eq.${bookingId}`,
      { headers: svc },
    )
  ).json();
  return rows[0];
}

async function auditFor(bookingId) {
  return (
    await fetch(
      `${API}/rest/v1/events_log?select=event,from_state,to_state,actor,reason&entity_type=eq.booking&entity_id=eq.${bookingId}&order=occurred_at`,
      { headers: svc },
    )
  ).json();
}

const reachable = await fetch(`${AGENT}/health`)
  .then((r) => r.ok)
  .catch(() => false);
if (!reachable) {
  console.log(`SKIP  agent service not reachable at ${AGENT}`);
  process.exit(0);
}

console.log('=== provisioning ===');
await createUser('booker-ops@example.invalid');
await createUser('booker-diner@example.invalid');
const ops = await signIn('booker-ops@example.invalid');
const diner = await signIn('booker-diner@example.invalid');

// Grant ops through the same admin path the console documents.
const { execFileSync } = await import('node:child_process');
execFileSync(
  'docker',
  [
    'exec', '-i', 'supabase_db_reservai',
    'psql', '-U', 'postgres', '-d', 'postgres', '-qt',
    '-c', "select public.grant_role_by_email('booker-ops@example.invalid','ops');",
  ],
  { stdio: 'ignore' },
);
console.log('ops role granted');

const venue = (
  await (
    await fetch(`${API}/rest/v1/venues?select=id&is_demo=eq.true&limit=1`, { headers: svc })
  ).json()
)[0];

const booking = (
  await (
    await fetch(`${API}/rest/v1/bookings`, {
      method: 'POST',
      headers: { ...svc, Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: diner.userId,
        venue_id: venue.id,
        status: 'draft',
        party_size: 2,
        scheduled_for: new Date(Date.now() + 5 * 86400_000).toISOString(),
        special_requests: 'Allergy: Shellfish',
      }),
    })
  ).json()
)[0];
console.log(`booking ${booking.id} created as draft`);

console.log('\n=== only ops may move a booking ===');
const asDiner = await transitionAs(diner.token, booking.id, { event: 'start_attempt' });
check('a diner is refused', asDiner.status, 403);
check('and told why', asDiner.body?.error, 'Ops access required.');

console.log('\n=== illegal transitions are refused by the state machine ===');
// draft has no `confirm` edge at all.
const illegal = await transitionAs(ops.token, booking.id, { event: 'confirm' });
check('confirm straight from draft is refused', illegal.status >= 400, true);
check('booking did not move', (await statusOf(booking.id)).status, 'draft');

console.log('\n=== the user approves ===');
// draft -> user_approved is a `user` edge, so ops cannot make it either.
const opsApprove = await transitionAs(ops.token, booking.id, { event: 'user_approve' });
check('ops cannot approve on the user’s behalf', opsApprove.status >= 400, true);

await fetch(`${API}/rest/v1/rpc/apply_booking_transition`, {
  method: 'POST',
  headers: svc,
  body: JSON.stringify({
    p_booking_id: booking.id,
    p_from: 'draft',
    p_to: 'user_approved',
    p_event: 'user_approve',
    p_actor: 'user',
    p_actor_id: diner.userId,
  }),
});
check('approved', (await statusOf(booking.id)).status, 'user_approved');

console.log('\n=== ops works it by hand — the manual rail ===');
check(
  'start attempt',
  (await transitionAs(ops.token, booking.id, { event: 'start_attempt' })).status,
  200,
);
check(
  'sent to the venue',
  (await transitionAs(ops.token, booking.id, { event: 'await_venue' })).status,
  200,
);
check('now pending on the venue', (await statusOf(booking.id)).status, 'pending_venue');

console.log('\n=== confirmed needs evidence, not just a click ===');
const noEvidence = await transitionAs(ops.token, booking.id, { event: 'confirm' });
check('confirm without evidence is refused', noEvidence.status >= 400, true);
check('still pending', (await statusOf(booking.id)).status, 'pending_venue');

const confirmed = await transitionAs(ops.token, booking.id, {
  event: 'confirm',
  evidence: {
    kind: 'ops_action',
    opsUserId: ops.userId,
    note: 'Spoke to Layla — table for 2 held under Farrell, 8pm, terrace.',
  },
  externalRef: 'TBL-8812',
});
check('confirm with evidence succeeds', confirmed.status, 200);

const finalState = await statusOf(booking.id);
check('booking is confirmed', finalState.status, 'confirmed');
check('confirmed_at was stamped', typeof finalState.confirmed_at, 'string');
check('the evidence is stored', finalState.confirmation_evidence?.kind, 'ops_action');

console.log('\n=== the ops task closed itself ===');
const tasks = await (
  await fetch(`${API}/rest/v1/ops_tasks?select=status&booking_id=eq.${booking.id}`, {
    headers: svc,
  })
).json();
check('no task left open', tasks.filter((t) => t.status === 'open').length, 0);

console.log('\n=== every move is in the audit trail ===');
const audit = await auditFor(booking.id);
check(
  'the whole path was recorded',
  audit.map((e) => `${e.from_state}->${e.to_state}`),
  [
    'draft->user_approved',
    'user_approved->attempting',
    'attempting->pending_venue',
    'pending_venue->confirmed',
  ],
);
check('the approval is attributed to the user', audit[0]?.actor, 'user');
check('the confirmation is attributed to ops', audit[3]?.actor, 'ops');

console.log('\n=== terminal really is terminal ===');
await transitionAs(ops.token, booking.id, { event: 'complete' });
check('completed', (await statusOf(booking.id)).status, 'completed');
const afterTerminal = await transitionAs(ops.token, booking.id, { event: 'cancel' });
check('a completed booking cannot be cancelled', afterTerminal.status >= 400, true);

console.log('\n=== a stale transition is rejected, not silently applied ===');
// Ask to move from a state the booking left long ago.
const stale = await fetch(`${API}/rest/v1/rpc/apply_booking_transition`, {
  method: 'POST',
  headers: svc,
  body: JSON.stringify({
    p_booking_id: booking.id,
    p_from: 'pending_venue',
    p_to: 'confirmed',
    p_event: 'confirm',
    p_actor: 'ops',
  }),
});
check('the database refuses a stale read', stale.status >= 400, true);

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ===`);
process.exit(failures === 0 ? 0 : 1);
