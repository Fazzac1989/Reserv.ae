# Reserv — architecture review against the Personal Operator brief

This answers the fifteen questions in the brief. [AUDIT.md](AUDIT.md) is the
prior audit and still stands; this covers what has changed since and where I
disagree with the proposed architecture.

The brief asks to be challenged. Sections 10 to 15 do that.

---

## 1. Existing architecture

| Layer    | What it is                                                   |
| -------- | ------------------------------------------------------------ |
| Monorepo | pnpm 11 workspaces + Turborepo                               |
| Consumer | Expo 54 / expo-router / NativeWind — native and a web export |
| Admin    | Next 15 App Router, shadcn/ui, at `reserv.ae/admin`          |
| Runtime  | Fastify 5 on Fly.io, one machine, an every-minute sweep      |
| Data     | Supabase Postgres, RLS throughout, append-only `events_log`  |
| AI       | Anthropic SDK, structured output, five named agents          |

27 tables, 23 migrations, ~22,000 lines. Auth is email OTP on both apps.

## 2. Existing functionality

Working end to end: sign-in, conversational onboarding, the concierge chat,
deterministic venue filtering, model ranking, suggestion → approval → booking,
the manual rail, reminders, SLA escalation, ops console (venues, bookings,
approvals, metrics), plans, preference learning, and a transparency screen.

Built and switched off: the WhatsApp rail, awaiting a provider account.

Specified and unbuilt: the API rail, the voice rail.

## 3. Existing AI implementation

Five agents in `packages/ai/src/agents.ts` — concierge, curator, booker_wa,
booker_voice, ops_copilot — each with a tier, an effort level and explicit
capabilities. Every call goes through `messages.parse()` with a zod schema, so
output is validated before it reaches any code.

**The property worth protecting: no model decision is load-bearing.**

- `filterCandidates` decides what is bookable. Deterministic, tested.
- `normaliseRanking` discards anything the model invented — a venue not on the
  shortlist, a time outside the window, a duplicate.
- `confirmed` is unreachable without evidence. The state machine has no edge a
  model can take.
- `packages/ai` touches no database table. It returns values; the service
  decides what to do with them.

That is unusual and it is the reason this product can claim a confirmation
means something. Everything below is written to preserve it.

## 4. Supplier and admin architecture

`venues` with `venue_contacts`, `venue_booking_channels`, `venue_policies`.
Channels carry kind, priority, SLA and config; the rail selector walks them in
order. Consent is gated: a venue cannot go live without
`booking_consent_obtained_at`, and the curator refuses one anyway.

Categories and places are reference tables as of this week, so the directory can
hold hotels and golf clubs without a migration.

## 5. Existing integrations

Anthropic (live). Supabase (live). Fly (live). Expo push (built, unexercised).
WhatsApp via BSP (built, flag off). Twilio voice (specified only). Stripe
(dormant behind a flag).

None of Google, Microsoft, or any calendar or email provider. No OAuth of any
kind beyond Supabase's own.

## 6. What can remain untouched

- The booking state machine and its audit trail
- `filterCandidates` and `normaliseRanking`
- The rail abstraction and selector
- RLS policies and the roles model
- `events_log`
- The environment guards in `packages/config`
- The design system

## 7. What should be refactored

**The concierge output schema is booking-shaped.** It returns a vertical, zones,
a window and a party size. That is the right shape for a restaurant and the
wrong shape for "reply to Sarah". Before any second domain lands it needs to
become intent-shaped, with the booking fields as one variant.

**`AGENTS` needs a capability-to-tool mapping.** The capabilities are declared
as strings and enforced nowhere. When there is more than one tool, that becomes
the authorisation boundary and has to be real.

**`ops_tasks` is a task table for one domain.** A general task engine should
wrap it rather than replace it — see section 11.

## 8. What is currently missing

Everything in the brief that is not dining: calendar, email, contacts,
messaging, calls, travel, flights, hotels. Also missing: a permission model, a
user-facing activity log, a daily brief, and any notion of a multi-step task
that outlives one request.

**And the thing that matters more than all of it: there is one venue in
production, marked demo, with no photographs.**

## 9. Security and permission gaps

Real, in order of severity:

1. **No per-domain permission model.** The brief is right and this must exist
   before the first integration, not after. A single "connected" boolean per
   provider is the failure mode to avoid.
2. **No user-facing audit.** `events_log` is complete and ops-facing. A person
   cannot see what was done on their behalf, which is the thing they will want
   to see first when they start trusting this with an inbox.
3. **Direct-to-Supabase paths have no rate limit.** The app reads memory and
   plans straight from Postgres under RLS. Authorisation is right; abuse
   control is absent. The agent service has rate limiting and these paths
   bypass it.
4. **`INTERNAL_API_SECRET` has a 16-character floor and no rotation story.**
   Adequate today, wrong once there is a second service.
5. **No encryption at rest beyond Postgres defaults.** Fine for venue data,
   not fine for the contents of somebody's inbox.

Not gaps, and worth stating because they are usually the problem: no key is
client-side, service-role never leaves the server, every boundary is
zod-validated, and RLS is on every table.

---

## 10. Recommended agent architecture — and where I disagree

**Do not build the orchestrator yet.**

The brief's diagram puts an LLM at the top, routing between email, calendar,
booking, travel and contacts agents. Today exactly one of those exists. An
orchestrator routing to one tool is a switch statement with a language model
attached, and it costs a round trip, a failure mode and a category of bug that
is very hard to test.

**Build it when there are three genuinely different tools.** Two is a
conditional. The shape below is what it should be when it arrives:

```
USER
  ↓
CLASSIFY INTENT          model, typed enum out, nothing else
  ↓
ROUTE                    deterministic. a switch, in code, tested
  ↓
TOOL                     typed input, server-side, permission-checked
  ↓
STATE MACHINE            the tool proposes; the machine decides
  ↓
RESPOND                  model writes prose over a structured result
```

**The disagreement that matters:** the brief has the model choosing tools and
composing actions. That moves decisions into the model, which is precisely what
this codebase does not do and is the reason it can be trusted with a booking.

A model that picks between `send_email` and `draft_email` will eventually pick
wrong, and the failure is silent and outbound. A model that returns
`{intent: "email.reply", confidence: 0.9}` into a switch statement cannot.

Same capability. One is testable.

**Where the model should be used freely:** understanding language, extracting
structure, ranking on taste, writing the reply. All of it non-destructive.

**Where it should never be:** deciding that something is confirmed, deciding
that an action is permitted, deciding what an ambiguous instruction meant when
the action is irreversible.

## 11. Recommended task-state architecture

The brief is right that one request must become one task with several steps,
and that the user must be able to leave and come back.

`bookings` + `booking_attempts` already is that, for one domain, with a proper
state machine. **Wrap it; do not replace it.**

```
tasks
  id, user_id, objective, kind, status,
  approval_required, current_step, created_at, completed_at

task_steps
  id, task_id, position, kind, status,
  tool, input, output, error,
  booking_id        -- when the step is a booking, the existing row is the truth
```

A booking step holds a `booking_id` and reads its state from the machine rather
than duplicating it. Two sources of truth for whether a table is confirmed is
the bug that ends this product.

Statuses stay coarse — `planned`, `running`, `waiting_user`, `waiting_external`,
`done`, `failed`. Anything finer belongs to the step's own domain.

## 12. Recommended memory architecture

**Already built this week.** `preference_signals` with source, counts and
direction; `relationships` for household; confidence derived in
`packages/core`, never stored, so it cannot drift from its evidence. Rejected
inferences are kept rather than deleted so the same conclusion is not drawn
again next month.

What the brief adds that is worth taking: **categories**. The current schema is
`subject / attribute / value`, which already expresses "restaurant / atmosphere
/ lively" and will express "travel / airline / emirates" unchanged. No
migration needed — it needs writers for the new domains.

What I would not take: storing confidence, and inferring anything sensitive.
The brief says this too and it is worth repeating in code review.

## 13. Recommended integration architecture

Every integration gets: an OAuth grant with the narrowest scope that works, a
row in a `connections` table with its scopes recorded, a per-domain permission
row, and a token stored encrypted server-side and never sent to a client.

**The thing the brief under-estimates, badly:**

Gmail's `gmail.readonly` and `gmail.send` are Restricted Scopes. Using them in
production requires a **CASA Tier 2 security assessment** — an annual
third-party audit, in the region of several thousand dollars, typically six to
twelve weeks end to end. Google Calendar's `calendar.events` is Sensitive
rather than Restricted, which is a verification review but not an audit.

This is not a Phase 2 checkbox. If email matters this year, **the assessment
starts before the code does**, and calendar should ship first because it is a
far lighter approval.

Microsoft Graph is materially easier and worth doing first if the early users
are on Outlook.

## 14. Proposed UI and UX

Largely built, and the brief mostly agrees with what is there: one universal
input, the assistant as the hero, no dashboard.

Two changes I would make from the brief:

**Take the circular waveform.** It is a good idea and this product has nowhere
that expresses state. Implement it in **SVG with a CSS or Reanimated driver**,
not Three.js and not WebGL — a breathing ring is a handful of paths, it must
run inside an Expo web export, and `prefers-reduced-motion` has to turn it off
cleanly. Three.js for this would be a 600KB dependency to draw a circle.

**Do not add the tab bar's sixth destination.** The brief lists Home, and the
existing app now has Home, Riva, Plans, Discover, You. Every new domain should
land inside those five, or the "less interface as it grows more powerful"
principle in the brief loses to the pressure to expose each new capability.

## 15. Phased implementation — and why I would reorder it

**The brief's Phase 1 is "The Brain". I think that is the wrong first move.**

The brain has nothing to think about. One venue, no calendar, no inbox, no
bookings. An orchestrator built now would be tested against fixtures, tuned
against nothing, and rebuilt the moment a second real tool arrived.

What the product actually lacks is not intelligence. It is **inputs**.

### Recommended order

**0 — Supply, and one real booking end to end.**
Five or six venues with photographs and consent. One booking made, confirmed
and completed against a real restaurant. Until this happens, nothing built can
be evaluated, and every later phase is guesswork. This is not engineering work,
which is exactly why it keeps being deferred.

**1 — Calendar.**
The lightest OAuth of the lot, and the single biggest jump in what Riva can
say. "You have a meeting until 7:30" changes every dinner suggestion. Read-only
first, then create, then move.

**2 — Permissions and the user activity log.**
Before the second integration, not after. Per-domain scopes, a real approval
policy, and a screen where somebody can see what was done for them.

**3 — Email.**
Start the CASA assessment at the beginning of Phase 1, not here. This is where
"booking by communication" becomes genuinely powerful: the email reservation
workflow in the brief is the best idea in it, and it is what makes a venue with
no API bookable.

**4 — The task engine and the orchestrator.**
By this point there are three real tools and the routing problem is a real
problem. Build it then, against real traffic.

**5 — Voice, supplier calls only.**
`booker_voice` is specced. Calling a restaurant is tractable. Answering the
user's own incoming calls is not a Twilio feature — it needs either porting
their number to a VoIP carrier or conditional forwarding, and UAE call
recording consent applies to both. Do the valuable half.

**6 — Travel.**
Needs the domain widening that is now done, plus supplier relationships that do
not exist yet.

**7 — Proactive.**
The nudge rules are written and switched off. Turn them on when there is enough
history for them to be right, which is a function of phase 0.

### What every phase must preserve

- No claimed action without a tool result that says it happened
- No model on the path to an irreversible decision
- A rail that is off says so, rather than failing quietly
- Every recommendation knows where its information came from
