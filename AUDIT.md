# Reserv — audit against the Lifestyle Assistant brief

Written before any code was changed. 21,000 lines, 19 migrations, three apps,
four packages. What follows is what is actually here, what the brief asks for,
and the distance between them.

## The stack, as built

| Layer    | What it is                                                         |
| -------- | ------------------------------------------------------------------ |
| Monorepo | pnpm 11 workspaces + Turborepo                                     |
| Consumer | Expo 54 / expo-router / NativeWind — native **and** a web export   |
| Admin    | Next 15 App Router, shadcn/ui, served at `reserv.ae/admin`         |
| Runtime  | Fastify 5 on Fly.io, one machine, an every-minute sweep            |
| Data     | Supabase Postgres, RLS throughout, append-only `events_log`        |
| AI       | Anthropic SDK, `packages/ai`, five named agents, structured output |

Auth is Supabase email OTP on both apps. Roles are `user | ops | admin`.

## What is genuinely strong

**The booking state machine.** Ten states, twenty-five edges, held at 100%
coverage by a test that re-specifies the table by hand. `confirmed` is
unreachable without deterministic evidence — no model can assert it. Anything
the brief adds that _executes_ something should route through this rather than
inventing a parallel path.

**Deterministic-first curation.** `filterCandidates` decides what is bookable
as a matter of fact; a model only ranks what survives, and `normaliseRanking`
throws away anything it invented. This is already the "less choice, better
choice" architecture the brief asks for.

**An agent registry.** `packages/ai/src/agents.ts` defines concierge, curator,
booker_wa, booker_voice and ops_copilot with tiers, effort and explicit
capabilities. The orchestration layer the brief describes is an extension of
this, not a replacement.

**Real inference, in small doses.** `memory/standing.ts` will not call
somewhere "your usual barber" without three visits and two-to-one dominance.
`memory/nudges.ts` holds every anti-spam rule in one place. The instinct the
brief wants is present; the surface area is small.

## The map

### EXISTING — works, keep

- Email OTP auth, roles, RLS
- Venue directory: contacts, channels, policies, opening hours, consent gating
- Request → suggestion → booking flow, end to end
- Booking state machine and audit log
- Reminders, SLA escalation, the every-minute sweep
- Ops console: venues, bookings, approvals, metrics
- Manual rail (a human rings the venue, the console records it)
- Proactive nudge _logic_ (behind `FLAG_PROACTIVE_SUGGESTIONS`, off)

### PARTIAL — foundation exists, brief wants much more

| Area        | Today                                                       | Brief wants                                                |
| ----------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| Preferences | One flat table: cuisines, price band, zones, dietary, party | Explicit + inferred + behavioural + contextual, scored     |
| Memory      | `standing_providers`, visit history                         | Episodic, semantic, behavioural, relationship, situational |
| Personality | Unnamed "concierge for reservAI"                            | Riva, named, configurable, context-aware                   |
| Proactivity | Nudge rules written, flag off, no surface                   | Daily Brief, Riva Suggests, contextual prompts             |
| Calendar    | `expo-calendar` writes one event to the device              | Read, summarise, find gaps, reschedule                     |
| Onboarding  | Four-step wizard, saves preferences                         | Conversational, progressive, "I'll learn the rest"         |

### MISSING — no foundation at all

- **Plans.** No concept of an outcome composed of several bookings.
- **Discover.** No browse surface of any kind.
- **Household and relationships.** No way to say Joanna is your wife.
- **Preference signals.** No table, no confidence, no source, no decay.
- **Email.** No integration, no summarisation.
- **Calendar accounts.** No Google, no Outlook, no OAuth.
- **Flights, hotels, travel.** No supplier types, no APIs, no quote workflow.
- **Permissions centre.** Nothing scoped per capability.
- **Activity log for the user.** `events_log` exists but is ops-facing.
- **Riva orb.** No visual identity for the assistant.
- **Call assistant.** `booker_voice` is defined and unbuilt.

### SHOULD IMPROVE

- Concierge prompt: correct, characterless. The brief's voice is unwritten.
- Onboarding: a form wearing a wizard's clothes.
- Ops console: fine for a pilot, thin on supplier content management.

### SHOULD DEPRECATE

Nothing. There is no dead weight in here worth removing.

## The finding that matters most

**The domain is enumerated, and it is narrow.**

```sql
create type public.vertical as enum ('restaurant', 'salon', 'barber');
create type public.zone     as enum ('dubai_marina', 'jbr', 'bluewaters');
```

Those two enums are referenced by venues, requests, suggestions, bookings,
preferences, the curator's filter and a dozen RLS policies. The brief asks for
hotels, airlines, golf clubs, spas, clinics, florists, tour operators and
transfers, in destinations that are not Dubai Marina.

This is not a blocker, but it is the foundation everything else in the brief
stands on, and it has to be done before Plans, Discover or travel mean
anything. Postgres enums are awkward to extend safely; the sound move is a
`categories` reference table and a migration that widens the columns, done once
and carefully, rather than six features each working around it.

**Done, at the database.** `20260828120000_categories_and_places.sql` replaces
both enums with reference tables — 21 categories, 12 places nested
neighbourhood to city to country — and every migration reapplies from scratch
with all 15 seeded venues intact. A hotel in Downtown now inserts; a venue in
Narnia does not.

**Not done in the application.** Fourteen files still speak the narrower
vocabulary through zod, and one of them is the model's own output schema, which
has to stay a closed list or Riva will invent slugs. The right split is a
pattern check at storage and a closed list — built from what is actually
bookable — at the model boundary. Nothing is broken meanwhile: every value the
app knows is still valid.

**Second finding: there is no supply.** One venue, marked demo, no photographs.
"Connect the existing supplier database to Riva" reads differently once you know
the database has a single row in it. Recommendation quality cannot be judged,
Discover has nothing to show, and the design's only decoration is absent.

## A conflict in the brief, stated plainly

Yesterday's design brief and this one disagree on the shape of the app.

> **Yesterday:** "Chat-first, single surface. The conversation IS the app."
> "No tab bar in v1." "Bookings — reachable by a single top-right word."

> **Today:** "Recommended primary navigation: Home, Ask Riva, Plans, Discover,
> You." "Potential bottom navigation." "Home should become a personal command
> centre."

Both are coherent products. They are not the same product, and the one built
yesterday is the first. This needs a decision before Home is designed, because
the answer changes what Home _is_: the whole app, or one of five places.

## Proposed information architecture

Assuming the five-destination shape:

| Destination  | What moves there                                                | State             |
| ------------ | --------------------------------------------------------------- | ----------------- |
| **Home**     | Greeting, today's timeline, Riva Suggests, the input            | NEW               |
| **Ask Riva** | Today's conversation screen, unchanged in substance             | EXISTING          |
| **Plans**    | Bookings become plan items; a Plan wraps them                   | NEW               |
| **Discover** | Curated venue browsing                                          | NEW, needs supply |
| **You**      | Profile, What Riva Knows, Permissions, Activity, Connected apps | PARTIAL           |

The admin console is untouched by all of this and stays where it is.

## What Phase 1 should actually be

The brief's Phase 1 lists fourteen items. Against this codebase, in dependency
order, the honest sequence is:

1. **Widen the domain model.** Categories instead of two enums. Everything else
   waits on this.
2. **Riva as configuration.** `assistantName`, `brandName`, `brandTagline` in
   `packages/config`, threaded through prompts and copy. Cheap, and it changes
   how the product feels immediately.
3. **Rewrite the concierge prompt** against the voice the brief specifies.
4. **The memory foundation.** `preference_signals` with source and confidence,
   `relationships`, `user_memories`. Write to it from the flows that already
   exist — a booking made, a suggestion rejected, a rating given.
5. **What Riva Knows.** Read the above back, editable. This is the trust
   feature and it is worth building early, while the data is small.
6. **Navigation and Home**, once the shape is decided.
7. **Plans**, wrapping bookings.

Discover, Daily Brief, email and calendar are Phase 2 and 3 as the brief has
them, and they are correctly ordered there.

## What must not be pretended

The brief is explicit and this codebase already agrees with it: never claim an
action happened without a tool confirming it. Two rules already hold and should
extend to everything new —

- `confirmed` requires evidence, not a model's word
- a rail that is switched off says so rather than failing quietly

Anything added for travel, email or calendar inherits both.
