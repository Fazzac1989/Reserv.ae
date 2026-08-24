/**
 * The onboarding write path, exercised exactly as the mobile app performs it:
 * a real signed-in user, PostgREST, RLS applied as that user.
 *
 * Bundling the app proves it compiles. This proves the values the wizard
 * collects are values the database will actually accept — enum spellings, array
 * shapes and the check constraints that would otherwise fail on a real device
 * in front of a real person.
 */

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
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(44)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`,
  );
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
  if (!code) throw new Error(`no code in the email to ${email}`);

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

function authed(token, extra = {}) {
  return {
    apikey: ANON,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function patch(table, filter, token, body) {
  const res = await fetch(`${API}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: authed(token, { Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

console.log('=== provisioning ===');
const email = 'diner-onboarding@example.invalid';
await createUser(email);
const me = await signIn(email);
console.log(`signed in (${me.userId})`);

console.log('\n=== the trigger created both rows at sign-up ===');
const seeded = await (
  await fetch(`${API}/rest/v1/user_preferences?select=*&user_id=eq.${me.userId}`, {
    headers: authed(me.token),
  })
).json();
check('preferences row exists', seeded.length, 1);
check('default party size', seeded[0]?.default_party_size, 2);
check('starts un-onboarded', seeded[0]?.cuisines_loved, []);

console.log('\n=== the exact payload the wizard writes ===');
// Mirrors useCompleteOnboarding in apps/mobile/src/lib/profile.ts.
const written = await patch('user_preferences', `user_id=eq.${me.userId}`, me.token, {
  cuisines_loved: ['Japanese', 'Lebanese', 'Modern European'],
  cuisines_avoided: ['Mexican'],
  price_band_min: 2,
  price_band_max: 3,
  dietary: ['Pescatarian', 'No alcohol'],
  allergies: ['Shellfish'],
  home_zone: 'dubai_marina',
  preferred_zones: ['dubai_marina', 'jbr'],
  default_party_size: 4,
});
check('write accepted', written.status, 200);
check('cuisines stored', written.body?.[0]?.cuisines_loved, [
  'Japanese',
  'Lebanese',
  'Modern European',
]);
check('zones stored as enum array', written.body?.[0]?.preferred_zones, ['dubai_marina', 'jbr']);
check('home zone stored', written.body?.[0]?.home_zone, 'dubai_marina');
check('allergies stored', written.body?.[0]?.allergies, ['Shellfish']);
check('party size stored', written.body?.[0]?.default_party_size, 4);

const profile = await patch('users', `id=eq.${me.userId}`, me.token, {
  full_name: 'Test Diner',
  onboarded_at: new Date().toISOString(),
});
check('profile write accepted', profile.status, 200);
check('name stored', profile.body?.[0]?.full_name, 'Test Diner');
check('onboarded_at set', typeof profile.body?.[0]?.onboarded_at, 'string');

console.log('\n=== the constraints the wizard must respect ===');
const inverted = await patch('user_preferences', `user_id=eq.${me.userId}`, me.token, {
  price_band_min: 4,
  price_band_max: 2,
});
check('inverted price band refused', inverted.status >= 400, true);

const hugeParty = await patch('user_preferences', `user_id=eq.${me.userId}`, me.token, {
  default_party_size: 50,
});
check('party size over 20 refused', hugeParty.status >= 400, true);

const badZone = await patch('user_preferences', `user_id=eq.${me.userId}`, me.token, {
  home_zone: 'downtown',
});
check('unknown zone refused', badZone.status >= 400, true);

console.log('\n=== a user cannot edit anyone else ===');
const otherEmail = 'diner-other@example.invalid';
await createUser(otherEmail);
const other = await signIn(otherEmail);

const intrusion = await patch('user_preferences', `user_id=eq.${me.userId}`, other.token, {
  default_party_size: 20,
});
check('cross-user write affects no rows', intrusion.body?.length ?? 0, 0);

const stillMine = await (
  await fetch(`${API}/rest/v1/user_preferences?select=default_party_size&user_id=eq.${me.userId}`, {
    headers: authed(me.token),
  })
).json();
check('party size unchanged', stillMine[0]?.default_party_size, 4);

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ===`);
process.exit(failures === 0 ? 0 : 1);
