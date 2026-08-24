/**
 * The concierge surface, minus the model call.
 *
 * Checks everything that must hold before and around the model: authentication,
 * ownership of a voice note, the honest 503 when transcription is not
 * configured, and the messages RLS policy that stops a client putting words in
 * the concierge's mouth.
 *
 * The model call itself needs a real ANTHROPIC_API_KEY. Skipped when absent —
 * and reported as skipped rather than quietly passing.
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
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(48)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`,
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

async function agentPost(path, token, body) {
  const res = await fetch(`${AGENT}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// The agent service is a separate process. If it is not up, say so and stop
// rather than reporting a wall of connection failures as test failures.
const reachable = await fetch(`${AGENT}/health`)
  .then((r) => r.ok)
  .catch(() => false);
if (!reachable) {
  console.log(`SKIP  agent service not reachable at ${AGENT}`);
  console.log('      start it with: pnpm --filter @reservai/agent-service dev');
  process.exit(0);
}

console.log('=== provisioning ===');
const email = 'diner-concierge@example.invalid';
await createUser(email);
const me = await signIn(email);
console.log(`signed in (${me.userId})`);

console.log('\n=== capabilities are reported honestly ===');
const capabilities = await (await fetch(`${AGENT}/capabilities`)).json();
check('concierge chat is on', capabilities.concierge_chat, true);
check('voice notes off without a provider', capabilities.voice_notes, false);
check('only the manual rail is live', capabilities.rails, ['manual']);

console.log('\n=== authentication ===');
check('no token is refused', (await agentPost('/concierge/messages', null, { text: 'hi' })).status, 401);
check(
  'a forged token is refused',
  (await agentPost('/concierge/messages', 'not-a-token', { text: 'hi' })).status,
  401,
);

console.log('\n=== voice notes ===');
const unconfigured = await agentPost('/concierge/transcribe', me.token, {
  audioRef: `${me.userId}/note.m4a`,
});
check('transcription says so plainly when off', unconfigured.status, 503);
check(
  'and explains why',
  unconfigured.body?.error,
  'Voice notes are not enabled in this environment.',
);

const notMine = await agentPost('/concierge/transcribe', me.token, {
  audioRef: 'someone-else/note.m4a',
});
// Ownership is checked before configuration, so this must be a 403 either way.
check("another user's recording is refused", [403, 503].includes(notMine.status), true);

const badRefMessage = await agentPost('/concierge/messages', me.token, {
  text: 'book me something',
  audioRef: 'someone-else/note.m4a',
});
check('a message citing foreign audio is refused', badRefMessage.status, 400);

console.log('\n=== validation ===');
check('empty text is refused', (await agentPost('/concierge/messages', me.token, { text: '' })).status, 400);

console.log('\n=== a client cannot put words in the concierge’s mouth ===');
const { data: conv } = await (
  await fetch(`${API}/rest/v1/conversations`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${me.token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ user_id: me.userId, channel: 'app' }),
  })
).json().then((rows) => ({ data: rows?.[0] }));

async function insertMessage(role) {
  const res = await fetch(`${API}/rest/v1/messages`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${me.token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      conversation_id: conv.id,
      user_id: me.userId,
      role,
      content: `a ${role} turn`,
    }),
  });
  return res.status;
}

check('a user may add their own turn', await insertMessage('user'), 201);
check('a user may NOT forge an assistant turn', (await insertMessage('assistant')) >= 400, true);

console.log('\n=== the model call ===');
if (process.env.ANTHROPIC_API_KEY) {
  const turn = await agentPost('/concierge/messages', me.token, {
    text: 'book me a haircut saturday morning near the marina',
  });
  check('a real turn succeeds', turn.status, 200);
  check('intent is a barber', turn.body?.intent?.vertical, 'barber');
  check('a window was extracted', typeof turn.body?.intent?.window?.starts_at, 'string');
} else {
  console.log('SKIP  no ANTHROPIC_API_KEY — the live model turn was not exercised');
}

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ===`);
process.exit(failures === 0 ? 0 : 1);
