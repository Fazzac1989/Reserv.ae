# reservAI — MVP Scope & Claude Code Build Plan

**Working name:** reservAI (replaceable)
**One-liner:** Your AI personal secretary for Dubai — it suggests, then it books.
**Form factor:** Mobile app (iOS + Android) + WhatsApp channel + internal ops console
**Pilot:** 90 days, Dubai Marina / JBR / Bluewaters, restaurants + salons/barbers

---

## 1. Product Definition

reservAI is a concierge agent, not a directory. The user speaks or types a request ("book me a haircut Saturday morning near the Marina", "anniversary dinner next Friday, somewhere special"), the AI proposes 2–3 opinionated options based on the user's profile, and on approval it **executes the booking** through one of three rails:

1. **API rail** — direct integration with booking platforms (SevenRooms, Eat App, Fresha, Playtomic partner APIs where accessible).
2. **WhatsApp rail** — the agent messages the venue's WhatsApp Business number as a professional PA would, negotiates the slot, confirms.
3. **Voice rail** — an AI voice agent phones the venue (English + Arabic), makes the reservation, escalates ambiguity back to the user.

Every booking, regardless of rail, lands as a confirmed reservation card in the app + calendar entry + reminder.

**Hard rules (mirror TravelOS principles):**
- The AI never invents availability, prices, or confirmations. A booking is only "confirmed" when a deterministic confirmation event exists (API response, venue WhatsApp confirmation parsed + human-verifiable, or voice-call confirmation with recording).
- Booking state is a deterministic state machine. AI drives conversation; code owns truth.
- Every venue interaction is logged and auditable (transcripts, recordings, message threads).
- Human ops fallback is a first-class feature in the MVP, not a failure mode. Do it manually, automate what repeats.

---

## 2. MVP Scope

### In scope (90 days)
- Mobile app: onboarding + taste profile, chat interface (text + voice notes), suggestion cards, booking approval flow, reservations list, calendar sync, push notifications.
- Two verticals: **restaurants** and **salons/barbers**.
- One geography: Marina / JBR / Bluewaters (walking-distance density, high expat spend).
- All three booking rails, with the WhatsApp rail as primary and human-in-the-loop on every non-API booking initially.
- Ops console (web): live booking queue, intervention tools, venue CRM, transcript review, rail performance metrics.
- Venue directory of 50 curated venues with structured data (cuisine/services, price band, booking channel, policies, best times).
- User memory: preferences, favourites, booking history, standing details (party size defaults, allergies, usual barber).
- Payments: none for bookings in MVP (reserve only, no prepayment). Stripe wired for the future subscription tier behind a feature flag.

### Explicitly out of scope (MVP)
- Consumer subscription billing (free during pilot; collect willingness-to-pay signals).
- Venue-side dashboard/self-serve.
- Events, hotels, government services (askDubai territory — later).
- Group coordination, split payments, deposits.
- Android/iOS feature parity beyond Expo defaults.
- Arabic UI (voice agent handles Arabic calls; app UI English-first).

---

## 3. The First 50 Venues

Target mix (curate for quality + booking-channel diversity):

| Segment | Count | Rail expectation |
|---|---|---|
| Restaurants — premium/date-night (Pier 7, Bluewaters, JBR beachfront) | 15 | Mostly SevenRooms/Eat App API or widget; some WhatsApp |
| Restaurants — casual favourites (Marina walk, JBR The Walk) | 10 | WhatsApp / phone |
| Restaurants — brunch & lifestyle venues | 5 | Mixed |
| Barbers — men's grooming (Marina/JBR clusters) | 10 | Fresha API or WhatsApp |
| Salons — women's hair/nails/beauty | 10 | Fresha / WhatsApp / phone |

**Acquisition playbook (weeks 1–4, founder-led):**
1. Walk in / call each venue. Pitch: "We send you confirmed, high-intent customers at zero cost during our pilot. No software to install. We book through your existing channel."
2. Capture per venue: booking channel + contact, response SLAs, policies (cancellation, party size limits, peak blackouts), a named contact, and permission to book on behalf of clients.
3. Prioritise venues already on SevenRooms/Eat App/Fresha — the API rail gives instant, reliable coverage while the messy rails mature.
4. Log everything in the ops console venue CRM from day one. Venue relationship data is the moat — treat it like gold.

Success threshold: 50 onboarded, of which ≥20 API-bookable, ≥20 WhatsApp-responsive within 15 minutes during business hours.

---

## 4. Tech Stack

Consistent with your other builds so Claude Code context transfers:

- **Monorepo:** TypeScript, pnpm workspaces + Turborepo.
- **Mobile app:** React Native + Expo (EAS builds), expo-router, NativeWind (Tailwind), React Query, Zustand for local state.
- **Backend:** Next.js (App Router) API routes / route handlers for the ops console + a dedicated Node service (Fastify) for the agent runtime and webhook ingestion (WhatsApp, telephony, platform callbacks).
- **Database/auth/storage:** Supabase (Postgres + RLS, Auth, Storage for voice recordings/transcripts), Redis (Upstash) for queues and rate limiting.
- **Job queue:** BullMQ on Redis — every booking attempt is a job with retries, timeouts, and escalation rules.
- **AI:** Claude API via a provider-abstraction layer (same pattern as TravelOS). Models: fast model for intent parsing and WhatsApp drafting; stronger model for suggestion generation and negotiation reasoning. Whisper or equivalent for voice-note transcription.
- **Voice rail:** telephony via Twilio (or regional alternative) + a realtime voice-agent layer; record all calls; feature-flag this rail — it ships in week 7+, not week 1.
- **WhatsApp:** WhatsApp Business Cloud API through a BSP (e.g. Twilio/360dialog). One number for user-facing concierge chat, a second for outbound venue bookings.
- **Payments (dormant):** Stripe behind a feature flag.
- **Observability:** Sentry + structured logs; every agent decision traceable to a conversation/job ID.

---

## 5. Core Data Model (summary)

- `users` — profile, contact, calendar link, notification prefs.
- `user_preferences` — structured taste graph: cuisines, price band, dietary, favourite venues, usual providers ("my barber = X"), default party size, home/work zones.
- `venues` — identity, geo, segment, price band, structured attributes, media.
- `venue_booking_channels` — ordered list per venue: `api | whatsapp | voice | manual`, with credentials/contact, SLAs, operating hours.
- `venue_policies` — cancellation, lead times, blackout periods, party size rules.
- `requests` — a user ask (raw text/voice, parsed intent, constraints).
- `suggestions` — generated options per request, with reasoning snapshot and rank.
- `bookings` — the state machine entity. States: `draft → user_approved → attempting → pending_venue → confirmed → reminded → completed | cancelled | failed | escalated`. Only webhook/parsed-confirmation/ops-console events may move a booking to `confirmed`.
- `booking_attempts` — one row per rail attempt with full transcript/recording reference and outcome.
- `ops_tasks` — human escalation queue items.
- `events_log` — append-only audit trail.

---

## 6. AI Architecture

Named agents with explicit permissions (your established pattern):

- **Concierge** (user-facing): parses intent from text/voice, asks the minimum clarifying question, presents suggestions with an opinion, confirms approval. May read user profile + venue directory. May NOT confirm bookings.
- **Curator** (suggestion engine): ranks venues against request + taste profile + policies + time feasibility. Deterministic filters first (open, bookable, within zone, policy-compatible), LLM ranking and rationale second.
- **Booker-WA**: drafts and conducts venue WhatsApp threads from templated, professional-PA style. Parses venue replies into structured outcomes. Confidence below threshold → escalate to ops, never guess.
- **Booker-Voice** (phase 2 of pilot): conducts calls with a strict script + negotiation bounds (acceptable time window ±45 min, party size fixed). Anything outside bounds → put user in the loop.
- **Ops Copilot** (console): summarises stuck bookings, drafts venue follow-ups for human approval.

Escalation rule: any rail attempt exceeding its SLA (e.g. WhatsApp 20 min, voice 2 failed calls) creates an `ops_task` and notifies the user honestly ("Still confirming with the venue — I'll update you within the hour").

---

## 7. 90-Day Pilot Plan

**Weeks 1–2 — Foundations.** Monorepo, Supabase schema, auth, venue CRM in ops console. Founder starts venue signups in parallel. Claude Code Phases 0–2.
**Weeks 3–4 — Concierge core.** App chat UI (text + voice notes), intent parsing, Curator suggestions from the seeded directory. Bookings run **fully manually** through the ops console (you are the booking agent). First 10 real users (friendlies). Phases 3–5.
**Weeks 5–6 — WhatsApp rail.** Outbound venue WhatsApp automation with human approval on every send; confirmation parsing; booking state machine live end-to-end; calendar sync + reminders. Phases 6–7.
**Weeks 7–8 — API rail + voice alpha.** SevenRooms/Eat App/Fresha integrations for covered venues; voice agent behind feature flag on 5 friendly venues. 50 users. Phases 8–9.
**Weeks 9–10 — Polish + memory.** Taste profile learning from history, proactive suggestions ("your barber has Saturday slots"), push notifications, no-show/cancellation flows. Phase 10.
**Weeks 11–12 — Scale test.** 150–250 users via Marina/JBR community channels; measure everything; venue check-in round; decide on subscription pricing test. Phase 11.

**Pilot success metrics:**
- ≥60% of requests → confirmed booking (target 75% by week 12)
- Median time-to-confirmation: API <2 min, WhatsApp <30 min, voice <45 min
- ≥40% of users make a 2nd booking within 14 days (the retention signal that matters)
- <5% booking failures discovered at venue (the trust metric — must stay near zero)
- Ops minutes per booking trending down week-over-week
- ≥30% of surveyed users say they'd pay AED 99+/month

---

## 8. Claude Code Master Build Prompt

Run Phase 0 first, review, then proceed one phase at a time.

---

### MASTER CONTEXT PROMPT (paste at the start of every session)

You are building **reservAI**, an AI concierge for Dubai that suggests and executes real-world bookings (restaurants, salons/barbers) on behalf of users via three rails: platform APIs, WhatsApp Business messaging to venues, and AI voice calls.

Non-negotiable principles:
1. **Deterministic truth.** The AI never fabricates availability, prices, or confirmations. `bookings.status = confirmed` can only be set by: a platform API confirmation webhook, a parsed venue confirmation message flagged high-confidence AND mirrored to the events log, or a human ops action. Enforce this at the service layer, not just in prompts.
2. **State machine owns bookings.** Implement booking states as an explicit transition table; illegal transitions throw. Every transition writes to `events_log`.
3. **Human-in-the-loop is a feature.** Every automated venue interaction must be pausable, reviewable, and manually completable from the ops console.
4. **No fake integrations.** If a platform API is not yet connected, the rail must be visibly disabled, never mocked as working in production paths. Mocks live only in tests and a clearly-flagged demo mode.
5. **Audit everything.** All venue messages, call recordings, transcripts, and AI reasoning snapshots are stored and linkable from the booking record.
6. **Multi-rail abstraction.** `BookingRail` is an interface (`attempt(booking): AttemptResult`) with `ApiRail`, `WhatsAppRail`, `VoiceRail`, `ManualRail` implementations selected by venue channel config, in priority order with fallback.

Stack: TypeScript monorepo (pnpm + Turborepo). Apps: `mobile` (Expo + expo-router + NativeWind + React Query), `ops` (Next.js App Router + Tailwind + shadcn/ui), `agent-service` (Fastify: webhooks, BullMQ workers, rail implementations). Packages: `db` (Supabase client + generated types + migrations), `core` (domain logic, state machine, zod schemas), `ai` (provider-abstracted Claude client, prompt templates, agent definitions), `config`.

Infra: Supabase (Postgres/Auth/Storage/RLS), Upstash Redis + BullMQ, WhatsApp Business Cloud API via BSP, Twilio voice (feature-flagged), Stripe (feature-flagged, dormant), Sentry.

Environments: `demo` seed data must be clearly fictional. Never seed real venue contact details into repos.

Code standards: strict TypeScript, zod validation at every boundary, no `any`, service-layer authorization, RLS on all user-facing tables, integration tests for the state machine and every rail's outcome parsing.

---

### PHASE 0 — Repo & Foundations
Scaffold the monorepo exactly as specified in the master context. Set up Supabase project config, migration tooling, CI (typecheck, lint, test), Sentry, and environment handling (`.env.example` for all apps). Create the `core` package with the booking state machine (transition table + tests) and zod schemas for all entities in the data model. Deliver: running skeleton apps, passing CI, state machine with 100% transition test coverage.

### PHASE 1 — Database & Auth
Implement full Supabase schema: users, user_preferences, venues, venue_booking_channels, venue_policies, requests, suggestions, bookings, booking_attempts, ops_tasks, events_log. RLS: users see only their own data; ops role sees all. Seed script with 15 fictional demo venues. Mobile + ops auth flows (email OTP + Apple/Google on mobile).

### PHASE 2 — Ops Console: Venue CRM
Build the ops console venue management: create/edit venues, booking channels with priority ordering, policies, contacts, notes, onboarding status pipeline (lead → contacted → agreed → live). Search/filter. This ships before the consumer app because venue acquisition starts immediately.

### PHASE 3 — Mobile App Shell & Onboarding
Expo app: auth, onboarding wizard capturing taste profile (cuisines, price band, dietary, zones, defaults), profile management, empty-state home. Polished, fast, native-feeling. Design direction: premium-minimal, dark-capable, "quiet luxury PA" — no clichéd concierge/bellhop imagery.

### PHASE 4 — Concierge Chat & Intent
Chat interface: text + voice notes (record → transcribe → show transcript for confirmation). `ai` package: Concierge agent parses requests into structured `requests` rows (vertical, zone, datetime window, party size, constraints, occasion). Max one clarifying question when a required field is missing. Full conversation persistence.

### PHASE 5 — Curator: Suggestions
Deterministic candidate filtering (vertical, zone, open hours, policy feasibility) then LLM ranking with taste profile; return top 3 as suggestion cards (why-this-fits rationale, price band, distance, proposed time). Approval flow creates a `draft` booking and moves it to `user_approved`. Manual rail: ops console booking queue where a human executes and confirms — the pilot's first end-to-end path.

### PHASE 6 — WhatsApp Rail
Webhook ingestion + outbound via BSP. Two numbers: concierge (user-facing, mirrors in-app chat) and booker (venue-facing). Booker-WA agent: templated professional booking messages, reply parsing into structured outcomes (confirmed / alternative offered / declined / unclear) with confidence scores. Below-threshold → ops_task. Human-approval mode toggle per venue (default ON). Full thread visible on the booking record.

### PHASE 7 — Booking Lifecycle
Confirmation cards, calendar integration (device calendar via Expo), reminders (24h + 2h push), cancellation/modification flows (user-initiated → rail executes cancellation with venue), no-show tracking, post-visit rating prompt feeding user_preferences.

### PHASE 8 — API Rail
`ApiRail` implementations behind a common interface for SevenRooms, Eat App, and Fresha (build against sandbox/partner docs; feature-flag each). Availability lookup where supported feeds Curator with real slots for API venues. Webhook confirmation handling. Graceful per-venue fallback to WhatsApp rail.

### PHASE 9 — Voice Rail (Alpha)
Twilio-based outbound calling with realtime voice agent: strict script, negotiation bounds (time window ±45min, fixed party size), Arabic + English. Record + transcribe every call; attach to booking_attempts. Feature-flagged per venue, ops live-monitor view with barge-in/takeover. Out-of-bounds → pause + user prompt.

### PHASE 10 — Memory & Proactivity
Preference learning from booking history (frequency patterns, accepted vs rejected suggestions). Standing entities ("my barber", "our usual place"). Proactive suggestion engine (rule-triggered, not spammy: rebooking cadence detection, favourite-venue availability). Notification preference controls.

### PHASE 11 — Metrics, Hardening & Pricing Test
Analytics dashboard in ops: funnel (request → suggestion → approval → confirmed), time-to-confirmation by rail, ops minutes per booking, retention cohorts, per-venue reliability scores. Load/failure testing on the job queue. Stripe subscription flow behind flag for a pricing-test cohort (AED 99/mo tier). App Store / Play submission prep.

---

## 9. Open Decisions (flag before Phase 0)

1. Final name + domain (reservai.ae availability check; consider whether this merges with the Concierge API B2B play under one brand).
2. BSP choice for WhatsApp (Twilio vs 360dialog — pricing and template approval speed differ).
3. Voice provider (Twilio vs regional; DIFC/TDRA compliance check for call recording consent flows in the UAE).
4. Legal: T&Cs around booking on behalf of users, cancellation liability, and venue consent documentation under your RAK media license.
5. Whether pilot users are invite-only (recommended: yes, waitlist + invite codes — scarcity helps in Dubai).
