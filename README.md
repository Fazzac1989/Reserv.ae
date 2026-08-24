# reservAI

Your AI personal secretary for Dubai — it suggests, then it books.

reservAI is a concierge agent, not a directory. A user asks in plain language, the
agent proposes two or three opinionated options, and on approval it **executes the
booking** through one of four rails: a platform API, WhatsApp to the venue, an AI
voice call, or a human in the ops console.

The full product scope and 90-day pilot plan live in
[reservai-mvp-build-plan.md](reservai-mvp-build-plan.md). This README covers the
repository.

---

## Non-negotiable principles

These are enforced in code, not just in prompts.

1. **Deterministic truth.** A booking is `confirmed` only when a deterministic
   confirmation event exists: a platform API webhook, a parsed venue reply above
   the confidence threshold, or a human ops action. See
   [`assertConfirmationEvidence`](packages/core/src/booking/transitions.ts).
2. **The state machine owns bookings.** Transitions live in an explicit table.
   Illegal transitions throw. Every transition produces an audit record for
   `events_log`.
3. **Human-in-the-loop is a feature.** Every automated venue interaction is
   pausable, reviewable and manually completable from the ops console.
4. **No fake integrations.** A rail that is not wired up is visibly disabled and
   answers honestly. Mocks live in tests and in a clearly-flagged demo mode —
   never in a production path.
5. **Audit everything.** Venue messages, call recordings, transcripts and agent
   reasoning snapshots are stored and linkable from the booking record.
6. **Multi-rail abstraction.** Every channel implements the same
   [`BookingRail`](packages/core/src/rails/rail.ts) interface, selected by venue
   channel config in priority order with fallback.

---

## Layout

```
apps/
  mobile/          Expo + expo-router + NativeWind + React Query + Zustand
  ops/             Next.js App Router + Tailwind — venue CRM, booking queue
  agent-service/   Fastify — webhooks, BullMQ workers, rail implementations
packages/
  core/            Booking state machine, zod schemas, rail interface
  db/              Supabase clients + generated database types
  ai/              Provider-abstracted Claude client, agent definitions
  config/          Typed environment parsing and feature flags
supabase/          Migrations and local seed data
```

Workspace packages ship TypeScript source rather than build output. Next
compiles them via `transpilePackages`, Metro through the monorepo resolver
config, and the agent service bundles them with tsup.

---

## Getting started

Requires Node 22+, pnpm 11+, and Docker (for local Supabase).

```bash
pnpm install
```

```bash
cp .env.example .env
```

Then open `.env` and set `ANTHROPIC_API_KEY`. The agent service reads this one
file from the repository root and refuses to start without it, naming what is
missing. Real environment variables always win over it, so deployed
environments set their secrets in the hosting platform and ship no `.env` at
all.

`AI_TRANSCRIPTION_API_KEY` is optional: without it voice notes stay off, the
microphone is hidden and `/capabilities` reports `voice_notes: false`.

Then run whichever surface you need:

```bash
pnpm --filter @reservai/ops dev
```

```bash
pnpm --filter @reservai/agent-service dev
```

```bash
pnpm --filter @reservai/mobile dev
```

Verify the whole workspace the way CI does:

```bash
pnpm typecheck && pnpm lint && pnpm test:coverage
```

---

## The booking state machine

Ten states, three of them terminal:

| State           | Meaning                                                               |
| --------------- | --------------------------------------------------------------------- |
| `draft`         | Created from an accepted suggestion, not yet approved                 |
| `user_approved` | The user said yes; nothing said to the venue yet                      |
| `attempting`    | A rail is actively working the booking                                |
| `pending_venue` | Sent to the venue; the SLA clock is running                           |
| `escalated`     | A human must intervene                                                |
| `confirmed`     | Deterministic confirmation exists — the only state a user may rely on |
| `reminded`      | Confirmed, with at least one reminder delivered                       |
| `completed`     | Terminal — the visit happened or its time passed                      |
| `cancelled`     | Terminal — called off by user, venue or ops                           |
| `failed`        | Terminal — every rail exhausted without a booking                     |

`transition()` is pure: it returns the next state plus the audit record to
persist, so the caller owns the transaction that keeps `bookings.status` and
`events_log` in step.

Actors carry the _provenance_ of a fact rather than a user role. `system` — our
own scheduler — appears on no `confirm` edge, because it never has grounds to
declare a venue booking real. No-show and rating are attributes of a completed
booking, not lifecycle states, because they do not change what the system may do
next.

The transition table is specified twice: once in
[`transitions.ts`](packages/core/src/booking/transitions.ts) and independently by
hand in [`state-machine.test.ts`](packages/core/src/booking/state-machine.test.ts).
The test walks every state × event × actor combination, so a new edge cannot be
added without acknowledging it in the specification. `packages/core/src/booking`
is held at 100% statement, branch, function and line coverage by a vitest
threshold; CI fails if it drops.

---

## Database

Local ports are shifted off the Supabase defaults (54321–54324) so this stack can
run alongside another local Supabase project.

| Service                      | URL                                                     |
| ---------------------------- | ------------------------------------------------------- |
| API                          | http://127.0.0.1:54421                                  |
| Postgres                     | postgresql://postgres:postgres@127.0.0.1:54422/postgres |
| Studio                       | http://127.0.0.1:54423                                  |
| Mailpit (catches OTP emails) | http://127.0.0.1:54424                                  |

```bash
pnpm db:start
```

```bash
pnpm db:reset
```

Regenerate `packages/db/src/generated/database.types.ts` after any migration:

```bash
pnpm db:types
```

### What the database enforces itself

The full transition table lives in `packages/core`. Replicating it in SQL would
guarantee drift, so the database holds only the rules that must survive a bug, a
bad migration or a direct psql session:

1. **`confirmed` requires evidence.** A check constraint demands
   `confirmed_at` and `confirmation_evidence`; a trigger rejects an unknown
   evidence kind and any parsed venue reply scoring below 0.90.
2. **Terminal states are terminal**, and nothing returns to `draft`.
3. **Every status change is audited.** A deferred constraint trigger aborts the
   commit unless a matching `events_log` row was written in the same
   transaction. `events_log` itself rejects UPDATE and DELETE.

Verify all of it, plus RLS and the real email-OTP sign-in flow:

```bash
pnpm db:verify
```

See [supabase/tests/README.md](supabase/tests/README.md) for what each check proves.

### Granting console access

Ops access comes from a row in `user_roles` — never an email domain or a JWT
claim the client could influence. The person must sign in once first, then:

```bash
docker exec -i supabase_db_reservai psql -U postgres -d postgres -c "select public.grant_role_by_email('you@example.com', 'ops');"
```

---

## Ops console

The console is the first surface built, because venue acquisition starts in
week 1 and the venue relationship data is the moat.

```bash
pnpm --filter @reservai/ops dev
```

| Route          | What it does                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `/`            | Progress against the pilot targets (50 venues, 20 API-bookable, 20 WhatsApp-reachable) and the acquisition pipeline |
| `/venues`      | Searchable, filterable venue list. Filters live in the URL, so a filtered view is shareable                         |
| `/venues/new`  | Create a venue — it starts as a lead                                                                                |
| `/venues/[id]` | Onboarding status, booking channels, policies, contacts, details and history                                        |

### Two gates worth knowing about

**A venue cannot go live without recorded booking consent.** Consent is its own
deliberate act with a note saying who agreed and how, not a side effect of
changing status. The console refuses first with a readable message; the database
refuses again with a check constraint.

**A voice channel cannot be enabled without recorded recording consent.** UAE
call-recording rules are still an open question for the pilot (Section 9 of the
build plan), so the switch is held shut until someone confirms the venue agreed.

### Channel ordering

Channels are the fallback chain the rail selector walks. They are reordered by
nudging rows up and down rather than by typing priority numbers — what matters
is _before_ and _after_. A nudge swaps two priorities rather than renumbering the
list, so values someone chose deliberately survive.

### Audit

Every venue change ops makes is appended to `events_log` through
`record_ops_event`, a SECURITY DEFINER function that ops may call and that
refuses `entity_type = 'booking'`. Booking transitions are written by the
service layer alongside the status change, and the deferred trigger on
`bookings` treats that row as proof the transition happened legally — if the
console could write those rows by hand, the proof would be forgeable.

---

## Mobile app

```bash
pnpm --filter @reservai/mobile dev
```

Three states, decided in the root layout before anything renders: signed out,
signed in but not yet onboarded, and ready. Nothing paints until each answer is
known — showing sign-in for a frame on a cold start reads as being logged out,
and flashing the wizard at someone who finished it months ago is worse.

| Route group    | Screens                               |
| -------------- | ------------------------------------- |
| `(auth)`       | Email code sign-in, code verification |
| `(onboarding)` | Five-step taste profile wizard        |
| `(app)`        | Home empty state, profile management  |

### Design direction

Premium-minimal, dark-capable, "quiet luxury PA". Near-black on warm off-white,
one restrained bronze accent, generous spacing, and the platform serif
(Georgia / `serif`) for display type — distinctive without shipping a font file
or blocking first paint. No gradients, no concierge gold, no bellhop imagery.

Tokens live in `apps/mobile/tailwind.config.js` as `ink`, `paper`, `night` and
`bronze`; primitives in `src/components/ui`.

### The taste profile

Five steps — name, zones, cuisines, spend and party size, dietary needs — held
in local state and written in one go at the end. Onboarding is short, and a
half-written profile would make the Curator confident about preferences the user
never finished expressing. `onboarded_at` is set last, so a failed preferences
write returns the user to the wizard rather than into an app that thinks it
knows them.

Everything is stored as free text rather than enums, because an allergy we lack
a chip for must never be silently dropped — the user can say it in chat instead.

---

## The concierge

The first phase where a model does real work. The call happens in
`agent-service`, never on the device — the Anthropic key must not ship in a
bundle, and the turn writes a message, a request row and an audit trail that
should not depend on a phone staying awake between two round trips.

```
POST /concierge/messages     { conversationId?, text, audioRef?, transcriptConfidence? }
POST /concierge/transcribe   { audioRef }
GET  /capabilities
```

Every call carries the user's Supabase session, verified against the auth server
rather than decoded locally. Reads and the user's own message go through a
user-scoped client so RLS applies as that user; only assistant turns and parsed
intent use the service role, because those are ours and a client may not write
them. The `messages` insert policy enforces `role = 'user'`, so a client
cannot put words in the concierge's mouth even in its own conversation.

### The agent extracts, code decides

`runConciergeTurn` gets a structured answer from the model; `normaliseTurn`
then settles everything the product actually depends on:

- **The one-question rule.** A clarifying question is dropped when nothing is
  missing, and supplied when something is missing and the model forgot to ask.
- **Windows the schema cannot catch.** A time that does not parse, ends before it
  starts, or has one bound is not a time — and time is required, so it becomes a
  question rather than a booking at the wrong moment.
- **Party size is never guessed.** The model returns null and the profile fills
  it, with `defaulted` telling the UI to say so.

Required fields are exactly _vertical_ and _a time window_. Everything else has
a fallback in the profile, because a secretary who interrogates you is worse
than one who assumes sensibly and says what they assumed.

### Voice notes

Record → upload to the private `voice-notes` bucket → transcribe → **show the
transcript for the user to read and correct** → send. That confirmation step is
the point: a booking made from a misheard request is exactly the failure it
prevents.

Transcription needs `AI_TRANSCRIPTION_API_KEY`. Without it `/capabilities`
reports `voice_notes: false`, the app hides the microphone, and the endpoint
answers 503 saying so. It never returns a plausible transcript nobody produced.

---

## The Curator and the manual rail

Phase 5 closes the loop: a request becomes options, an option becomes a
booking, and a human puts it through.

### Facts first, taste second

`filterCandidates` in `packages/core` decides what is _bookable_ — right
vertical, right area, open then, within the spend band, party size the venue
takes, enough notice, a rail that actually works, and recorded booking consent.
Only then does the model rank what survives.

That order is the point. Feasibility is a matter of fact and an LLM should never
be asked; ranking is a matter of taste and an LLM does it well. Every rejection
carries a reason, so "why did nothing come back" has an answer.

### The model cannot invent a venue

`normaliseRanking` drops anything the Curator returns that was not on the
shortlist it was given, any time outside the requested window, any venue ranked
twice, and any suggestion without a rationale. Ranks are then reassigned in
order rather than trusted, so a repeated `rank: 1` cannot produce two first
choices.

Suggestion cards say **"I will ask for 8pm"**, not "8pm is available".
`slot_is_verified` stays false until a rail has genuinely checked — only the
API rail will ever set it true.

### Every booking move goes through one door

```
applyTransition()  →  transition() in packages/core   (is this legal, by this actor, with this evidence?)
                   →  apply_booking_transition RPC    (status + audit row, one transaction)
                   →  database triggers               (evidence, terminality, audit-row-exists)
```

Nothing writes `bookings.status` directly. The ops console _cannot_ — RLS
grants it, but the deferred audit trigger refuses a status change without a
matching `events_log` row, and ops cannot write that table. So the console
calls the agent service, which is the only holder of the RPC.

The single-transaction property matters more than it looks. Two PostgREST calls
would appear to work, but a failed second call would leave an audit entry
describing a transition that never happened — and an audit trail that lies is
worse than none.

### Confirming by hand

The console's booking queue is the pilot's first end-to-end path. Confirming
requires a note saying what the venue actually agreed — "spoke to Layla, table
for 2 held under Farrell, 8pm". The action refuses a short note, the service
refuses missing evidence, and the database refuses `confirmed` without it.
Three independent locks on the one state a user acts on.

---

## The WhatsApp rail

Built and tested, **not live**. It stays behind `FLAG_RAIL_WHATSAPP` until
there is a BSP account, an approved template and a real booker number.

### The BSP is a config value, not a fork

Twilio and 360dialog do the same job with different wire formats and different
signature schemes, and which one reservAI uses is still open (Section 9). Both
are implemented behind one `WhatsAppProvider` interface and selected by
`WHATSAPP_BSP`, so making the decision is a config change rather than a
rewrite.

Both are written from the providers' documented shapes. **Verify the exact
endpoints and field names against the live docs when the account exists** — an
untested integration is not a working one, which is why the flag stays off.

### The webhook is the security boundary

It is a public URL that can move a booking to `confirmed`, so an unverified
payload is an unauthenticated instruction to lie to a user. Three gates, in
order:

1. **The rail must be on.** Off means 503 with the reason in words.
2. **The signature must verify against the raw bytes.** Twilio signs
   URL + sorted params with HMAC-SHA1; Meta signs the raw body with HMAC-SHA256.
   The raw string is threaded through from the route because re-serialising the
   parsed JSON changes key order and produces a different digest.
3. **The delivery must be new.** `claim_webhook_event` returns true exactly
   once per provider event, so a BSP retry cannot confirm a booking twice.

### A person reads every word

Every venue starts with `human_approval_required`. A draft that fails its own
checks is held regardless of that setting — the checks catch a leaked surname,
a phone number, a claim that the booking is already made, or a disclosure of
being an AI. Operators approve in `/messages`, and may edit first: what they
approve is what goes, not what the agent wrote.

### Reading a reply is where the risk is

`normaliseReply` decides what a venue's answer means. It is deliberately
asymmetric: **confirmed** needs 0.9 confidence, everything else needs 0.7, and
a venue asking a question escalates however confident the classification was.

Being wrong towards "escalate" costs an ops task. Being wrong towards
"confirmed" costs a client standing outside a restaurant that never had a table.

An alternative time is never accepted on the user's behalf — that is their
decision, so it escalates with the offer attached.

---

## After the booking is confirmed

### Reminders are a sweep, not a queue

The stack calls for BullMQ, and that is still the right tool for booking
_attempts_, which need retries and backoff. Reminders are a different shape:
"who needs telling right now" is a query, the answer is idempotent because of
the unique constraint on `booking_reminders`, and nothing is lost if the
process dies mid-sweep. A queue would add a component that can lose jobs to a
problem that does not have that failure mode.

The sweep runs every minute and asks two questions:

- **Which reminders are due?** Day-before, two-hour, and a rating prompt three
  hours after the visit. Each has a grace period, so a sweep that runs late — or
  catches up after an outage — still finds everything exactly once.
- **Which venues have gone quiet?** A booking past its channel's SLA escalates
  and creates an ops task.

`isReminderUseful` is the per-booking judgement that stops nonsense: a booking
confirmed ninety minutes before it starts never fires a "tomorrow" reminder,
because that moment had already passed when it was booked.

A reminder is recorded whether or not it reached a device. `delivered_to: 0` is
the honest record of a user with notifications off — not a failure to retry
forever.

### The SLA clock reads from the audit trail

It originally read `bookings.updated_at`, which was wrong in a way that only
shows up in production: the `set_updated_at` trigger fires on every write, so
editing a special request silently restarted the venue's SLA clock and a booking
could sit unanswered without ever escalating.

It now reads the audited moment the booking entered `pending_venue`, which
nothing else can reset.

### Cancelling unwinds properly

Cancelling moves the booking _and_ deals with the venue. If no automated rail is
live, telling them becomes a person's job rather than a silent omission — a
table nobody cancelled is the venue's problem and our fault. The calendar entry
goes too; one left behind is worse than never having added it.

### What the card says

Only `confirmed` and `reminded` show as confirmed. Everything before that says
what is actually happening — "I have asked and am waiting for them to confirm" —
rather than a green tick and hope.

---

## The pilot scorecard

`/metrics` in the console shows the six numbers from section 7 of the build
plan, each against its target, with the sample size next to it. A metric based
on fewer than ten observations is shown but not judged — "60%" from five
requests is not a result, and a dashboard that colours it green is worse than
one that says nothing.

### The denominator, settled

"≥60% of requests → confirmed" is meaningless until you have agreed whether a
request nobody could serve counts against you. Both are computed:

- **`confirmed_of_all`** — every request, including ones the directory could
  not serve. The honest measure of the product a user experiences, and the one
  to report.
- **`confirmed_of_served`** — only requests that got as far as options. This
  separates how well the rails work from how thin the directory is, which is
  what tells you whether to sign more venues or fix the booking flow.

Agreeing which one is "the" number now is much cheaper than arguing about it in
week 12.

### Willingness to pay is asked, not charged

The pilot metric is "≥30% would pay AED 99+/month", and that is answered by
asking. Only users with **two or more confirmed bookings** are asked — an
opinion on paying from someone who has never had a booking confirmed is not a
signal, it is noise that flatters the number. Asked once per price point.

Stripe tables and the flag exist so the subscription tier is a config change
later. While the flag is off, `/billing/checkout` returns 503 rather than a
checkout URL that goes nowhere. It is deliberately unimplemented: wiring a
payment flow against an unconfigured account would produce untested code in the
one area where an untested path takes someone's money.

### Rate limits

Model endpoints are 20/minute per user — a stuck client retrying in a loop is
not malicious and will still run up an Anthropic bill. Keyed per user rather
than per IP, so an office NAT does not share one budget. The public webhook is
300/minute per IP, limited before signature verification so a flood costs
nothing.

---

## Memory and proactivity

### Learning is arithmetic, not intuition

"Preference learning" here means counting: which venues someone returns to, how
often, and which suggestions they picked over the two beside them. All of it is
computed in Postgres, and all of it is cheaper and more defensible than asking a
model to intuit it. The Curator still does the judging — this just gives it
better evidence.

Rejections are the more interesting half. Every suggestion shown was already
feasible, so choosing one over two others is a preference rather than a
constraint, and it is the only signal we get that is not self-reported.

### Standing entities refuse to guess

"My barber" resolves from what the user set, then from behaviour. Inference
needs three visits **and** a clear favourite — twice the runner-up. Somebody who
alternates between two barbers resolves to neither, because booking the wrong
barber is worse than asking which one.

A bare "the usual" with no vertical to narrow it resolves to nothing at all.

### Not being annoying is the hard part

Every rule lives in `decideNudge` so they can be read together:

| Rule                        | Why                                                          |
| --------------------------- | ------------------------------------------------------------ |
| Three visits minimum        | Two is a coincidence, not a habit                            |
| 10% past their usual gap    | Not the instant it elapses                                   |
| Give up at 3× the gap       | They have moved on; this would be re-engagement, not service |
| 21-day cooldown per venue   | Never twice about the same place                             |
| 4 per month, any kind       | A hard ceiling regardless of how due they are                |
| Never below a 3-star rating | Judged on their _worst_ visit, not the average               |
| 09:00–21:00 Dubai only      | Deferred, not dropped — still due tomorrow                   |
| One nudge, one venue        | A list is a newsletter                                       |

Proactive suggestions are **opt-in**; reminders about bookings a user made are
on by default. The distinction is the point: they asked for one and not the
other.

A sweep given an "as of" time records that time on what it writes, so cooldowns
are measured against the same clock that made the decision.

---

## Data handling rules

- **Never commit real venue contact details.** Phone numbers, WhatsApp numbers
  and named contacts live only in the database of a running environment. Seed
  files contain clearly fictional data.
- **The service-role Supabase key never reaches a client bundle.** Mobile and the
  ops browser bundle use the anon key with RLS; server code uses
  `createServiceClient` and does its own authorization first.
- **`RESERVAI_ENV=demo`** forces fictional seed data and disables outbound rails.

---

## Phase status

| Phase | Scope                                  | Status                 |
| ----- | -------------------------------------- | ---------------------- |
| 0     | Monorepo, CI, state machine, schemas   | Done                   |
| 1     | Supabase schema, RLS, auth, demo seed  | Done                   |
| 2     | Ops console venue CRM                  | Done                   |
| 3     | Mobile shell and onboarding            | Done                   |
| 4     | Concierge chat and intent parsing      | Done                   |
| 5     | Curator suggestions + manual rail      | Done                   |
| 6     | WhatsApp rail                          | Built, not live        |
| 7     | Booking lifecycle, calendar, reminders | Done                   |
| 8     | API rail (SevenRooms, Eat App, Fresha) | Needs sandbox access   |
| 9     | Voice rail alpha                       | Needs UAE legal answer |
| 10    | Memory and proactivity                 | Done                   |
| 11    | Metrics, hardening, pricing test       | Done                   |
