/**
 * The venue back office, through the real HTTP stack.
 *
 * The psql suite proves the policies hold when Postgres is asked directly.
 * This proves the thing that actually matters: that a partner holding a real
 * bearer token, talking to PostgREST the way any browser or script could,
 * cannot reach past their own venue — regardless of what the console's UI
 * chooses to render. Every hole a partner console can have is a hole here
 * first.
 */
const API = 'http://127.0.0.1:54421';
const MAIL = 'http://127.0.0.1:54424';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const VENUE_A = 'd0000000-0000-4000-8000-000000000001';
const VENUE_B = 'd0000000-0000-4000-8000-000000000002';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

function check(label, actual, expected) {
  const ok = String(actual) === String(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} got=${actual} want=${expected}`);
}

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

async function createUser(email) {
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: svc,
    body: JSON.stringify({ email, email_confirm: true }),
  });
  const json = await res.json();
  return json.id ?? null;
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
  if (!id) throw new Error(`no OTP email arrived for ${email}`);

  const msg = await (await fetch(`${MAIL}/api/v1/message/${id}`)).json();
  const code = `${msg.Text ?? ''}${msg.HTML ?? ''}`.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error(`no 6-digit code in the email to ${email}`);

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

/** As the partner: what does this request actually return? */
function as(token) {
  const headers = { apikey: ANON, Authorization: `Bearer ${token}` };

  return {
    async rows(path) {
      const res = await fetch(`${API}/rest/v1${path}`, { headers });
      if (!res.ok) return { status: res.status, rows: -1 };
      const body = await res.json();
      return { status: res.status, rows: Array.isArray(body) ? body.length : -1, body };
    },
    async patch(path, payload) {
      const res = await fetch(`${API}/rest/v1${path}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(payload),
      });
      const body = await res.text();
      let rows = -1;
      try {
        const j = JSON.parse(body);
        if (Array.isArray(j)) rows = j.length;
      } catch {
        /* an error object, not a row list */
      }
      return { status: res.status, rows, body };
    },
    async post(path, payload) {
      const res = await fetch(`${API}/rest/v1${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return { status: res.status, body: await res.text() };
    },
    async rpc(fn) {
      const res = await fetch(`${API}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{}',
      });
      return { status: res.status, body: await res.text() };
    },
  };
}


async function main() {
  const stamp = Date.now();
  const partnerEmail = `partner.${stamp}@example.invalid`;
  const strangerEmail = `stranger.${stamp}@example.invalid`;

  console.log('--- fixtures -------------------------------------------------');
  await createUser(partnerEmail);
  await createUser(strangerEmail);

  // Bookings at both venues, written with the service role.
  const guestId = await createUser(`guest.${stamp}@example.invalid`);
  const mkBooking = (venueId, name, requests, status) =>
    fetch(`${API}/rest/v1/bookings`, {
      method: 'POST',
      headers: { ...svc, Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: guestId,
        venue_id: venueId,
        status,
        party_size: 2,
        scheduled_for: new Date(Date.now() + 86_400_000).toISOString(),
        guest_name: name,
        special_requests: requests,
      }),
    });

  await mkBooking(VENUE_A, `Guest A ${stamp}`, 'window table', 'user_approved');
  // The user has not approved this one, so nothing has been asked of the
  // venue. It must not appear in their book.
  await mkBooking(VENUE_A, `Draft ${stamp}`, 'still only a suggestion', 'draft');
  await mkBooking(VENUE_B, `Guest B ${stamp}`, 'never seen by venue A', 'user_approved');

  // The invitation, created the way ops creates it.
  await fetch(`${API}/rest/v1/venue_invites`, {
    method: 'POST',
    headers: { ...svc, Prefer: 'return=minimal' },
    body: JSON.stringify({ venue_id: VENUE_A, email: partnerEmail, role: 'owner' }),
  });

  console.log('\n--- an invitation becomes membership on sign-in --------------');
  const partner = await signIn(partnerEmail);
  const p = as(partner.token);

  // Filtered to their own row. A member can also see who *else* has access to
  // the same venue, which is intended — an owner should be able to tell who
  // from their restaurant can get in — so an unfiltered count measures the
  // fixture's history rather than this sign-in.
  const mine = `/venue_members?user_id=eq.${partner.userId}&select=venue_id`;

  check('membership before redeeming', (await p.rows(mine)).rows, 0);

  const redeemed = await p.rpc('redeem_venue_invites');
  check('redeem_venue_invites() returns', redeemed.body.trim(), '1');

  check('membership after redeeming', (await p.rows(mine)).rows, 1);

  const twice = await p.rpc('redeem_venue_invites');
  check('redeeming a second time grants nothing', twice.body.trim(), '0');

  console.log('\n--- the partner sees its own venue ---------------------------');
  const own = await p.rows(`/venue_bookings?venue_id=eq.${VENUE_A}&select=id,guest_name,status`);
  check('bookings at its own venue', own.rows > 0, 'true');
  check(
    'but never a draft — nothing has been asked of them yet',
    own.body?.every((r) => r.status !== 'draft'),
    'true',
  );
  check(
    'and the guest name is there to seat them',
    own.body?.some((r) => typeof r.guest_name === 'string' && r.guest_name.length > 0),
    'true',
  );

  console.log('\n--- and nothing of anyone else ------------------------------');
  const all = await p.rows('/venue_bookings?select=id,venue_id');
  check(
    'every visible booking is its own venue',
    all.body?.every((r) => r.venue_id === VENUE_A),
    'true',
  );
  check('bookings at venue B', (await p.rows(`/venue_bookings?venue_id=eq.${VENUE_B}&select=id`)).rows, 0);
  check('rows in the raw bookings table', (await p.rows('/bookings?select=id')).rows, 0);
  check('other people’s profiles', (await p.rows(`/users?id=neq.${partner.userId}&select=id`)).rows, 0);
  check('contact details at venue B', (await p.rows(`/venue_contacts?venue_id=eq.${VENUE_B}&select=id`)).rows, 0);
  check('booking channels anywhere', (await p.rows('/venue_booking_channels?select=id')).rows, 0);
  check('ops tasks', (await p.rows('/ops_tasks?select=id')).rows, 0);
  check('the audit log', (await p.rows('/events_log?select=id')).rows, 0);

  console.log('\n--- what it may and may not change --------------------------');
  const ownEdit = await p.patch(`/venues?id=eq.${VENUE_A}`, {
    description: `Edited by the partner at ${stamp}.`,
  });
  check('may rewrite its own description', ownEdit.rows, 1);

  // Every value below must DIFFER from what the row already holds. Setting a
  // column to the value it already has changes nothing, so the guard never
  // fires and the refusal appears to pass for the wrong reason — which is
  // exactly how the first version of this list quietly asserted nothing about
  // `is_demo`, a column the seeded venues already have set.
  const current = (await p.rows(`/venues?id=eq.${VENUE_A}&select=is_demo,price_band`)).body?.[0];

  for (const [column, value] of [
    ['price_band', current?.price_band === 1 ? 2 : 1],
    ['onboarding_status', 'paused'],
    ['house_note', `Best in Dubai ${stamp}!!!`],
    ['booking_consent_obtained_at', new Date().toISOString()],
    ['name', `Totally Different Name ${stamp}`],
    ['is_demo', !current?.is_demo],
  ]) {
    const res = await p.patch(`/venues?id=eq.${VENUE_A}`, { [column]: value });
    check(`refuses to change ${column}`, res.status >= 400, 'true');
  }

  const otherEdit = await p.patch(`/venues?id=eq.${VENUE_B}`, { description: 'defaced' });
  check('changes nothing at venue B', otherEdit.rows, 0);

  console.log('\n--- and cannot let itself in anywhere else -------------------');
  const selfGrant = await p.post('/venue_members', {
    venue_id: VENUE_B,
    user_id: partner.userId,
    role: 'owner',
  });
  check('cannot grant itself membership of venue B', selfGrant.status >= 400, 'true');

  const selfInvite = await p.post('/venue_invites', {
    venue_id: VENUE_B,
    email: partnerEmail,
    role: 'owner',
  });
  check('cannot invite itself to venue B', selfInvite.status >= 400, 'true');

  const selfOps = await p.post('/user_roles', { user_id: partner.userId, role: 'ops' });
  check('cannot grant itself ops', selfOps.status >= 400, 'true');

  console.log('\n--- somebody with no invitation is nobody --------------------');
  const stranger = await signIn(strangerEmail);
  const s = as(stranger.token);
  await s.rpc('redeem_venue_invites');
  check('a stranger redeems nothing', (await s.rows('/venue_members?select=venue_id')).rows, 0);
  check('a stranger sees no venue bookings', (await s.rows('/venue_bookings?select=id')).rows, 0);

  console.log(`\n${failures === 0 ? 'All partner checks passed.' : `${failures} check(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
