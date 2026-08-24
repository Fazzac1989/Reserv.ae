/**
 * The WhatsApp rail's edges.
 *
 * Two things are checked here that cannot be checked by unit tests: that a
 * rail which is switched off says so rather than failing obscurely, and that
 * the live webhook endpoint refuses an unsigned request.
 *
 * The endpoint is a public URL that can move a booking to `confirmed`, so an
 * unsigned payload is an unauthenticated instruction to lie to a user.
 */

import { createHmac } from 'node:crypto';

const OFF = process.env.AGENT_OFF_URL ?? 'http://127.0.0.1:3941';
const ON = process.env.AGENT_ON_URL ?? 'http://127.0.0.1:3942';
const AUTH_TOKEN = 'test-auth-token';

let failures = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`,
  );
}

async function reachable(base) {
  return fetch(`${base}/health`)
    .then((r) => r.ok)
    .catch(() => false);
}

function twilioSignature(url, body) {
  const params = [...new URLSearchParams(body).entries()].sort(([a], [b]) => a.localeCompare(b));
  return createHmac('sha1', AUTH_TOKEN)
    .update(url + params.map(([k, v]) => k + v).join(''), 'utf8')
    .digest('base64');
}

// --- The rail switched off ---------------------------------------------------

if (!(await reachable(OFF))) {
  console.log(`SKIP  no agent service at ${OFF}`);
  process.exit(0);
}

console.log('=== with the rail off, the service says so ===');
const capabilities = await (await fetch(`${OFF}/capabilities`)).json();
check('whatsapp_rail is false', capabilities.whatsapp_rail, false);
check(
  'and the reason is a sentence, not a flag',
  capabilities.whatsapp_unavailable_reason,
  'The WhatsApp rail is switched off in this environment.',
);

const offPost = await fetch(`${OFF}/webhooks/whatsapp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
check('an inbound webhook is refused', offPost.status, 503);
check(
  'and explains why',
  (await offPost.json()).error,
  'The WhatsApp rail is switched off in this environment.',
);

const offVerify = await fetch(`${OFF}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=x`);
check('the subscribe handshake is refused too', offVerify.status, 503);

// --- The rail switched on ----------------------------------------------------

if (!(await reachable(ON))) {
  console.log(`\nSKIP  no rail-on instance at ${ON}`);
  console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

console.log('\n=== with the rail on, the webhook is authenticated ===');
const onCapabilities = await (await fetch(`${ON}/capabilities`)).json();
check('whatsapp_rail is true', onCapabilities.whatsapp_rail, true);
check('no reason is given', onCapabilities.whatsapp_unavailable_reason, null);

const body = 'MessageSid=SM-e2e-1&From=whatsapp%3A%2B971509999999&Body=Yes%2C+confirmed';
const url = `http://127.0.0.1:3942/webhooks/whatsapp`;

const unsigned = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body,
});
check('an unsigned webhook is rejected', unsigned.status, 401);

const wrongSig = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Twilio-Signature': 'AAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  },
  body,
});
check('a forged signature is rejected', wrongSig.status, 401);

// The exact attack the signature exists to stop: a real signed body replayed
// with the venue's words swapped for a confirmation.
const tampered = body.replace('Yes%2C+confirmed', 'Yes+confirmed+for+9pm');
const tamperedRes = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Twilio-Signature': twilioSignature(url, body),
  },
  body: tampered,
});
check('a tampered body is rejected', tamperedRes.status, 401);

const signed = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Twilio-Signature': twilioSignature(url, body),
  },
  body,
});
check('a properly signed webhook is accepted', signed.status, 200);

// BSPs retry. The same delivery must not be acted on twice.
const replay = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Twilio-Signature': twilioSignature(url, body),
  },
  body,
});
check('a replay is accepted but not re-processed', replay.status, 200);

console.log('\n=== the approval queue is ops-only ===');
const anon = await fetch(`${ON}/whatsapp/pending`);
check('no token is refused', anon.status, 401);

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ===`);
process.exit(failures === 0 ? 0 : 1);
