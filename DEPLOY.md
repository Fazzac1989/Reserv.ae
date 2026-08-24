# Deploying reservAI

Three things run in three places, and they are not interchangeable:

| Piece                   | Where    | Why there                                            |
| ----------------------- | -------- | ---------------------------------------------------- |
| `apps/ops`              | Vercel   | A Next.js app. Nothing unusual.                      |
| `apps/agent-service`    | Fly.io   | Holds a scheduler. Needs a process that stays alive. |
| Database, auth, storage | Supabase | —                                                    |
| `apps/mobile`           | Expo EAS | Later, once there are testers.                       |

## Why the agent service cannot go on Vercel

It sweeps every minute for reminders that are due, venues past their SLA, and
users due a proactive nudge. A serverless function does not stay running
between requests, so that loop would simply never fire: no reminders, no
escalation when a venue goes quiet.

Vercel Cron could call `/internal/sweep` on a schedule instead, but that means
an adapter layer and a second moving part for something a single small machine
already does. Fly runs the process as written.

---

## 1. Supabase

Create a project. **Region: `ap-south-1` (Mumbai)** — closest to Dubai; Frankfurt
is the alternative if Indian data residency ever matters.

Link it and push the schema:

```bash
npx supabase link --project-ref <your-project-ref>
```

```bash
npx supabase db push
```

Then seed the demo venues — **only if you want them.** They are fictional and
useful for a demo; skip this on a production project you intend to fill with
real venues.

```bash
npx supabase db execute --file supabase/seed.sql
```

Give yourself ops access. You must sign in through the console once first, so
the account exists:

```sql
select public.grant_role_by_email('you@yourdomain.com', 'admin');
```

Take these from **Project Settings → API**:

- Project URL
- `anon` key — safe in client bundles
- `service_role` key — **server only.** It bypasses RLS entirely.

---

## 2. Vercel — the ops console

In the project settings:

- **Root Directory:** `apps/ops`
- **Framework:** Next.js (detected)
- Install and build commands come from `apps/ops/vercel.json`

Environment variables:

| Name                            | Value                                          |
| ------------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Your Supabase project URL                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The `anon` key                                 |
| `AGENT_SERVICE_URL`             | `https://reservai-agent.fly.dev` (from step 3) |

That is all it needs. The console never holds the service-role key — it acts as
the signed-in operator, and booking changes go through the agent service.

Point `ops.reserv.ae` at it, or use the root domain and put the app elsewhere.

---

## 3. Fly.io — the agent service

```bash
fly launch --no-deploy --copy-config --name reservai-agent
```

Set the secrets. These never appear in a file or a build log:

```bash
fly secrets set SUPABASE_URL="https://<ref>.supabase.co" SUPABASE_ANON_KEY="<anon>" SUPABASE_SERVICE_ROLE_KEY="<service-role>" ANTHROPIC_API_KEY="<sk-ant-...>" INTERNAL_API_SECRET="$(openssl rand -hex 24)" AI_MODEL_FAST="claude-haiku-4-5" AI_MODEL_STRONG="claude-opus-5"
```

Flags are ordinary config, not secrets:

```bash
fly secrets set FLAG_RAIL_MANUAL=true FLAG_RAIL_WHATSAPP=false FLAG_RAIL_API=false FLAG_RAIL_VOICE=false FLAG_PROACTIVE_SUGGESTIONS=false FLAG_STRIPE_SUBSCRIPTIONS=false
```

Deploy from the repository root — the build context has to be the whole
workspace, because the service bundles `@reservai/*` from source:

```bash
fly deploy
```

Check it came up honest about what is switched on:

```bash
curl https://reservai-agent.fly.dev/capabilities
```

`REDIS_URL` is in the environment schema but nothing reads it yet. Set it to
anything valid — `redis://127.0.0.1:6379` — until Phase 8 needs a queue.

### Do not scale to more than one machine yet

`auto_stop_machines = false` and `min_machines_running = 1` are deliberate. A
stopped machine means no reminders and no SLA escalation until something
happens to wake it.

Two machines would be safe for correctness — every sweep is idempotent — but
rate limiting is in-memory and per-instance, so the effective limit would
double. Moving to the Redis store is the prerequisite for scaling out.

---

## 4. What to check once it is up

Sign into the console and confirm:

- `/venues` lists what you seeded
- `/metrics` renders (all zeros is correct on a fresh project)
- `/messages` says the WhatsApp rail is not live, and why

Then, from your machine against the deployed service:

```bash
AGENT_SERVICE_URL=https://reservai-agent.fly.dev pnpm db:verify
```

Some suites need a local database and will skip. The ones that exercise the
deployed API will not.

---

## Still not live, and why

**The rails.** `FLAG_RAIL_WHATSAPP` stays off until there is a BSP account, an
approved template and a booker number. `/capabilities` reports it as off with a
reason, and the console says so on the approvals page.

**Voice.** Blocked on the UAE call-recording consent question. The schema
already refuses to enable a voice channel without `recording_consent_obtained`.

**Billing.** `FLAG_STRIPE_SUBSCRIPTIONS` off, and `/billing/checkout` is
deliberately unimplemented even when on. Willingness to pay is measured by
asking, which needs no Stripe account at all.

**Push notifications** work without extra setup — Expo routes them — but only
from a real device build, not a simulator.
