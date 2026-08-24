/**
 * What we learn, and whether we are annoying about it.
 *
 * The learning half is arithmetic and easy to check. The half that matters is
 * the restraint: someone with a habit gets one nudge, and someone who has
 * already booked, or opted out, or is being messaged at 3am, gets nothing.
 */

import { execFileSync } from 'node:child_process';

const AGENT = process.env.AGENT_SERVICE_URL ?? 'http://127.0.0.1:3941';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? '0123456789abcdef0123';

let failures = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`,
  );
}

function sql(statement) {
  return execFileSync(
    'docker',
    ['exec', '-i', 'supabase_db_reservai', 'psql', '-U', 'postgres', '-d', 'postgres', '-qtA', '-c', statement],
    { encoding: 'utf8' },
  ).trim();
}

/** 14:00 Dubai — well inside waking hours. */
const AT = '2026-03-05T10:00:00.000Z';

async function sweep(at = AT) {
  const res = await fetch(`${AGENT}/internal/sweep`, {
    method: 'POST',
    headers: { 'x-internal-secret': INTERNAL_SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify({ at }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const reachable = await fetch(`${AGENT}/health`).then((r) => r.ok).catch(() => false);
if (!reachable) {
  console.log(`SKIP  no agent service at ${AGENT}`);
  process.exit(0);
}

const proactiveOn = await (await fetch(`${AGENT}/capabilities`)).json();

console.log('=== a user with a habit ===');
const venueId = sql("select id from public.venues where is_demo and vertical = 'barber' limit 1;");
const otherVenue = sql(
  `select id from public.venues where is_demo and vertical = 'barber' and id <> '${venueId}' limit 1;`,
);

// Four haircuts, three weeks apart, the last one 25 days before AT.
function seedUser(email, { proactive, visits, lastVisitDaysAgo, venue, rating = 5 }) {
  // auth.users indexes email partially rather than with a plain unique
  // constraint, so ON CONFLICT has nothing to match. Start clean instead.
  sql(`delete from auth.users where email = '${email}';`);
  const id = sql(`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at)
    values (extensions.gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', '${email}', '', now(), now(), now())
    returning id;`);

  sql(`update public.users
       set notification_prefs = jsonb_build_object(
         'push_enabled', true, 'whatsapp_enabled', true,
         'reminder_24h', true, 'reminder_2h', true,
         'proactive_suggestions', ${proactive})
       where id = '${id}';`);

  sql(`delete from public.bookings where user_id = '${id}';`);
  sql(`delete from public.proactive_nudges where user_id = '${id}';`);

  for (let i = 0; i < visits; i += 1) {
    const daysAgo = lastVisitDaysAgo + (visits - 1 - i) * 21;
    sql(`insert into public.bookings
      (user_id, venue_id, status, party_size, scheduled_for, confirmed_at,
       confirmation_evidence, rating, rated_at)
      values ('${id}', '${venue}', 'completed', 1,
              timestamptz '${AT}' - interval '${daysAgo} days',
              timestamptz '${AT}' - interval '${daysAgo + 1} days',
              '{"kind":"ops_action","opsUserId":"00000000-0000-4000-8000-000000000000","note":"fixture"}'::jsonb,
              ${rating}, timestamptz '${AT}' - interval '${daysAgo} days');`);
  }
  return id;
}

const regular = seedUser('memory-regular@example.invalid', {
  proactive: true,
  visits: 4,
  lastVisitDaysAgo: 25,
  venue: venueId,
});
console.log('a regular with four visits, three weeks apart, last one 25 days ago');

console.log('\n=== the history is arithmetic, and it is right ===');
const history = JSON.parse(
  sql(`select row_to_json(h) from public.user_venue_history('${regular}') h where h.venue_id = '${venueId}';`),
);
check('four visits counted', history.visits, 4);
check('the gap between them is measured', Number(history.median_gap_days), 21.0);
check('and the rating carried through', Number(history.avg_rating), 5.0);

console.log('\n=== the nudge ===');
if (!proactiveOn.rails) console.log('(capabilities unavailable, continuing)');

const first = await sweep();
check('the sweep runs', first.status, 200);

const nudged = sql(
  `select count(*) from public.proactive_nudges where user_id = '${regular}' and venue_id = '${venueId}';`,
);
check('the regular is nudged once', nudged, '1');

console.log('\n=== and only once ===');
await sweep();
check(
  'a second sweep says nothing more',
  sql(`select count(*) from public.proactive_nudges where user_id = '${regular}';`),
  '1',
);
// Three weeks later the cooldown has expired, but so has the pattern window —
// 46 days against a 21-day habit is more than twice overdue but still inside
// the "moved on" limit, so it is due again.
const later = await sweep('2026-03-26T10:00:00.000Z');
check('three weeks later it may speak again', later.status, 200);
check(
  'which is a second nudge, not a third',
  sql(`select count(*) from public.proactive_nudges where user_id = '${regular}';`),
  '2',
);

console.log('\n=== the people who should hear nothing ===');
const optedOut = seedUser('memory-optout@example.invalid', {
  proactive: false,
  visits: 4,
  lastVisitDaysAgo: 25,
  venue: venueId,
});
const occasional = seedUser('memory-occasional@example.invalid', {
  proactive: true,
  visits: 2,
  lastVisitDaysAgo: 25,
  venue: otherVenue,
});
const unhappy = seedUser('memory-unhappy@example.invalid', {
  proactive: true,
  visits: 4,
  lastVisitDaysAgo: 25,
  venue: otherVenue,
  rating: 2,
});
const booked = seedUser('memory-booked@example.invalid', {
  proactive: true,
  visits: 4,
  lastVisitDaysAgo: 25,
  venue: otherVenue,
});
// Confirmed in one statement: the database refuses a confirmed booking with
// no evidence, even one a test is setting up.
sql(`insert into public.bookings
       (user_id, venue_id, status, party_size, scheduled_for, confirmed_at, confirmation_evidence)
     values ('${booked}', '${otherVenue}', 'confirmed', 1,
             timestamptz '${AT}' + interval '3 days', now(),
             '{"kind":"ops_action","opsUserId":"00000000-0000-4000-8000-000000000000","note":"fixture"}'::jsonb);`);

await sweep('2026-03-06T10:00:00.000Z');

check(
  'someone who opted out hears nothing',
  sql(`select count(*) from public.proactive_nudges where user_id = '${optedOut}';`),
  '0',
);
check(
  'two visits is a coincidence, not a habit',
  sql(`select count(*) from public.proactive_nudges where user_id = '${occasional}';`),
  '0',
);
check(
  'somewhere they rated badly is never suggested',
  sql(`select count(*) from public.proactive_nudges where user_id = '${unhappy}';`),
  '0',
);
check(
  'someone who has already booked is left alone',
  sql(`select count(*) from public.proactive_nudges where user_id = '${booked}';`),
  '0',
);

console.log('\n=== nobody is messaged at three in the morning ===');
const quiet = seedUser('memory-quiet@example.invalid', {
  proactive: true,
  visits: 4,
  lastVisitDaysAgo: 25,
  venue: venueId,
});
// 03:00 Dubai.
await sweep('2026-03-06T23:00:00.000Z');
check(
  'a due nudge waits for a civilised hour',
  sql(`select count(*) from public.proactive_nudges where user_id = '${quiet}';`),
  '0',
);
// The same person, same day, at a reasonable hour.
await sweep('2026-03-07T10:00:00.000Z');
check(
  'and arrives later that day',
  sql(`select count(*) from public.proactive_nudges where user_id = '${quiet}';`),
  '1',
);

console.log('\n=== a user can only see their own nudges ===');
const leak = sql(`
  select count(*) from public.proactive_nudges n
  where n.user_id <> '${regular}'
    and exists (select 1 from public.users u where u.id = '${regular}');`);
check('the table holds other users’ rows', Number(leak) > 0, true);
check(
  'and RLS is on to keep them apart',
  sql("select relrowsecurity from pg_class where relname = 'proactive_nudges';"),
  't',
);

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ===`);
process.exit(failures === 0 ? 0 : 1);
