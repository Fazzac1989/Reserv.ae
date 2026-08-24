/**
 * End-to-end auth + RLS check through the real HTTP stack (GoTrue + PostgREST),
 * not psql — the exact path the mobile app and ops console take.
 */
import { execFileSync } from 'node:child_process';

const API = 'http://127.0.0.1:54421';
const MAIL = 'http://127.0.0.1:54424';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

function check(label, actual, expected) {
  const ok = String(actual) === String(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} got=${actual} want=${expected}`);
}

async function createUser(email) {
  await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
    },
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
    const res = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`);
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

  if (!verify.access_token) {
    throw new Error(`verify failed for ${email}: ${JSON.stringify(verify)}`);
  }
  return { token: verify.access_token, userId: verify.user.id };
}

async function countRows(table, token) {
  const res = await fetch(`${API}/rest/v1/${table}?select=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, Prefer: 'count=exact' },
  });
  if (!res.ok) return `HTTP ${res.status}`;
  const range = res.headers.get('content-range') ?? '';
  const total = range.split('/')[1];
  return total === '*' ? 'unknown' : total;
}

console.log('=== provisioning ===');
await createUser('ops2@example.invalid');
await createUser('diner@example.invalid');
execFileSync(
  'docker',
  [
    'exec', '-i', 'supabase_db_reservai',
    'psql', '-U', 'postgres', '-d', 'postgres', '-qt',
    '-c', "select public.grant_role_by_email('ops2@example.invalid','ops');",
  ],
  { stdio: 'ignore' },
);
console.log('created two users; granted ops to ops2@example.invalid');

console.log('\n=== email OTP sign-in via GoTrue + Mailpit ===');
const ops = await signIn('ops2@example.invalid');
console.log(`ops   token acquired (${ops.token.length} chars)`);
const diner = await signIn('diner@example.invalid');
console.log(`diner token acquired (${diner.token.length} chars)`);

console.log('\n=== PostgREST reads as DINER ===');
check('venues visible', await countRows('venues', diner.token), 15);
check('venue_booking_channels hidden', await countRows('venue_booking_channels', diner.token), 0);
check('venue_contacts hidden', await countRows('venue_contacts', diner.token), 0);
check('booking_attempts hidden', await countRows('booking_attempts', diner.token), 0);
check('ops_tasks hidden', await countRows('ops_tasks', diner.token), 0);
check('events_log hidden', await countRows('events_log', diner.token), 0);
check('own profile only', await countRows('users', diner.token), 1);

console.log('\n=== PostgREST reads as OPS ===');
check('venues visible', await countRows('venues', ops.token), 15);
check('venue_booking_channels visible', await countRows('venue_booking_channels', ops.token), 35);
check('venue_contacts visible', await countRows('venue_contacts', ops.token), 15);

console.log('\n=== anon has no surface ===');
const anonRes = await fetch(`${API}/rest/v1/venues?select=id&limit=1`, { headers: { apikey: ANON } });
const anonBody = await anonRes.text();
check('anon read refused', anonRes.status >= 400 || anonBody === '[]', true);
console.log(`      (status ${anonRes.status}, body ${anonBody.slice(0, 80)})`);

console.log('\n=== a diner cannot write a booking ===');
const write = await fetch(`${API}/rest/v1/bookings`, {
  method: 'POST',
  headers: {
    apikey: ANON,
    Authorization: `Bearer ${diner.token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    user_id: diner.userId,
    venue_id: 'd0000000-0000-4000-8000-000000000001',
    status: 'confirmed',
    party_size: 2,
    scheduled_for: '2026-09-01T19:00:00Z',
  }),
});
check('insert refused', write.status >= 400, true);
console.log(`      (status ${write.status}, ${(await write.text()).slice(0, 120)})`);

console.log('\n=== sign-up is closed on the console path ===');
const noCreate = await fetch(`${API}/auth/v1/otp`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'stranger@example.invalid', create_user: false }),
});
check('unknown email rejected', noCreate.status >= 400, true);

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ===`);
process.exit(failures === 0 ? 0 : 1);
