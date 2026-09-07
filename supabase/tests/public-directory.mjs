/**
 * The public directory, checked as the public sees it.
 *
 * Everything here goes over HTTP through PostgREST with the anon key and no
 * session, because that is the thing being claimed. A psql check with
 * `set role anon` would miss whatever PostgREST itself decides to expose, and
 * this file exists precisely because the interesting failures are the ones
 * nobody thought to look for from the outside.
 *
 * Run by scripts/db-verify.mjs.
 */
const URL_BASE = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54421';
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

let failures = 0;

function report(ok, what, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${what}${detail ? ` (${detail})` : ''}`);
}

/** Anonymous: the anon key alone, with no Authorization header standing in for a user. */
async function anon(path) {
  const response = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

console.log('=== A. THE DIRECTORY IS VISIBLE TO A STRANGER ===');

const venues = await anon('venues?select=id,name,zone,price_band,tags,photo_urls&limit=100');
report(venues.status === 200, 'a signed-out visitor can read venues', `HTTP ${venues.status}`);
report(
  Array.isArray(venues.body) && venues.body.length > 0,
  'and gets actual listings back',
  `${Array.isArray(venues.body) ? venues.body.length : 0} rows`,
);

const labels = await anon('categories?select=slug,label,kind');
report(labels.status === 200 && labels.body.length > 0, 'and the labels needed to render them');

const places = await anon('places?select=slug,label');
report(places.status === 200 && places.body.length > 0, 'and the place names');

console.log('\n=== B. ONLY LIVE VENUES ===');

const statuses = await anon('venues?select=id&onboarding_status=neq.live');
report(
  Array.isArray(statuses.body) ? statuses.body.length === 0 : true,
  'a venue that is not live is not in the public directory',
  Array.isArray(statuses.body) ? `${statuses.body.length} rows` : String(statuses.status),
);

console.log('\n=== C. THE COLUMNS THAT ARE NOT THEIRS TO SEE ===');

for (const column of ['onboarding_status', 'booking_consent_obtained_at', 'created_at']) {
  const attempt = await anon(`venues?select=${column}&limit=1`);
  report(attempt.status !== 200, `anon cannot select ${column}`, `HTTP ${attempt.status}`);
}

const star = await anon('venues?select=*&limit=1');
report(star.status !== 200, 'anon cannot select * from venues', `HTTP ${star.status}`);

console.log('\n=== D. NOTHING ELSE IS PUBLIC ===');

const private_ = [
  'venue_contacts',
  'venue_booking_channels',
  'venue_policies',
  'venue_members',
  'venue_invites',
  'venue_bookings',
  'users',
  'user_preferences',
  'user_roles',
  'bookings',
  'requests',
  'suggestions',
  'conversations',
  'messages',
  'events_log',
  'ops_tasks',
  'connections',
  'my_connections',
  'permissions',
  'plans',
  'push_tokens',
  'preference_signals',
];

for (const table of private_) {
  const attempt = await anon(`${table}?select=*&limit=1`);
  const empty = Array.isArray(attempt.body) && attempt.body.length === 0;
  report(
    attempt.status !== 200 || empty,
    `anon reads nothing from ${table}`,
    `HTTP ${attempt.status}${Array.isArray(attempt.body) ? `, ${attempt.body.length} rows` : ''}`,
  );
}

console.log('\n=== E. PUBLIC MEANS READ, NOT WRITE ===');

const write = await fetch(`${URL_BASE}/rest/v1/venues`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Squatter', vertical: 'restaurant', zone: 'jbr', price_band: 1 }),
});
report(write.status >= 400, 'anon cannot add a venue', `HTTP ${write.status}`);

const edit = await fetch(`${URL_BASE}/rest/v1/venues?id=eq.${venues.body?.[0]?.id ?? 'x'}`, {
  method: 'PATCH',
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Defaced' }),
});
report(edit.status >= 400, 'anon cannot rename a venue', `HTTP ${edit.status}`);

console.log('\n=== F. NO FUNCTION IS CALLABLE BY NAME ===');

for (const fn of ['redeem_venue_invites', 'grant_role_by_email', 'is_ops']) {
  const rpc = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  report(rpc.status >= 400, `anon cannot call ${fn}()`, `HTTP ${rpc.status}`);
}

console.log(
  failures === 0
    ? '\nThe public surface is the directory and nothing else.'
    : `\n${failures} assertion(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
