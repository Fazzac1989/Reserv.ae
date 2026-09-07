/**
 * Runs the database verification suite against the local stack.
 *
 * Assumes `supabase db reset --local` has just run, because schema-guards.sql
 * creates fixture users and bookings and expects to be the only thing that has.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const tests = join(here, '..', 'supabase', 'tests');
const CONTAINER = 'supabase_db_reservai';

function psql(file) {
  const sql = readFileSync(join(tests, file), 'utf8');
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-q'],
    { input: sql, encoding: 'utf8' },
  );
}

let failed = false;

for (const file of ['schema-guards.sql', 'rls.sql', 'venue-back-office.sql', 'saved-venues.sql', 'preferences-consent.sql']) {
  console.log(`\n${'='.repeat(60)}\n${file}\n${'='.repeat(60)}`);
  try {
    const output = psql(file);
    console.log(output);

    // The two older files assert by printing a count next to the number they
    // expect, which only fails if a human reads it. Newer ones print PASS or
    // FAIL, and a FAIL anywhere fails the run.
    const fails = output.split('\n').filter((line) => line.includes('FAIL'));
    if (fails.length > 0) {
      failed = true;
      console.error(`${file} reported ${fails.length} failed assertion(s):`);
      for (const line of fails) console.error(`  ${line.trim()}`);
    }
  } catch (error) {
    failed = true;
    console.error(`${file} could not run:`, error.message);
  }
}

for (const script of [
  'public-directory.mjs',
  'auth-e2e.mjs',
  'onboarding-e2e.mjs',
  'concierge-e2e.mjs',
  'booking-e2e.mjs',
  'whatsapp-e2e.mjs',
  'lifecycle-e2e.mjs',
  'metrics-e2e.mjs',
  'memory-e2e.mjs',
  'partner-e2e.mjs',
]) {
  console.log(`\n${'='.repeat(60)}\n${script}\n${'='.repeat(60)}`);
  try {
    execFileSync(process.execPath, [join(tests, script)], { stdio: 'inherit' });
  } catch {
    failed = true;
  }
}

if (failed) {
  console.error('\nVerification suite reported failures.');
  process.exit(1);
}
console.log('\nVerification suite finished. Review the expected-ERROR assertions above.');
