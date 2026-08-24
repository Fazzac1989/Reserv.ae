-- ---------------------------------------------------------------------------
-- reservAI — extensions, enums and shared helpers
--
-- Every enum here mirrors a `const` array in packages/core/src/schemas. If you
-- add a value in one place, add it in the other; the zod schemas are what the
-- application validates against and these are what the database will accept.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto" with schema extensions;

-- --- Domain enums -----------------------------------------------------------

create type public.vertical as enum ('restaurant', 'salon', 'barber');

-- Pilot geography only. Widening this is a product decision.
create type public.zone as enum ('dubai_marina', 'jbr', 'bluewaters');

create type public.rail_kind as enum ('api', 'whatsapp', 'voice', 'manual');

create type public.booking_platform as enum ('sevenrooms', 'eat_app', 'fresha', 'other');

create type public.venue_onboarding_status as enum (
  'lead', 'contacted', 'agreed', 'live', 'paused', 'lost'
);

create type public.day_of_week as enum ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');

-- --- Booking lifecycle ------------------------------------------------------
-- The authoritative transition table lives in
-- packages/core/src/booking/transitions.ts. The database enforces the two rules
-- that must hold even if the service layer is bypassed: a booking cannot become
-- `confirmed` without evidence, and terminal states never change.

create type public.booking_state as enum (
  'draft',
  'user_approved',
  'attempting',
  'pending_venue',
  'escalated',
  'confirmed',
  'reminded',
  'completed',
  'cancelled',
  'failed'
);

create type public.booking_event as enum (
  'user_approve',
  'start_attempt',
  'await_venue',
  'retry_next_rail',
  'confirm',
  'decline',
  'escalate',
  'remind',
  'complete',
  'cancel'
);

-- Provenance of a fact, not a user role. `system` is our own scheduler and may
-- never be the actor on a confirmation.
create type public.actor as enum (
  'user', 'ops', 'system', 'api_webhook', 'parsed_confirmation'
);

create type public.request_status as enum (
  'received', 'needs_clarification', 'parsed', 'suggested', 'converted', 'abandoned'
);

create type public.suggestion_outcome as enum ('pending', 'accepted', 'rejected', 'expired');

create type public.attempt_outcome as enum (
  'confirmed', 'alternative_offered', 'declined', 'no_response', 'unclear', 'error'
);

create type public.ops_task_kind as enum (
  'manual_booking',
  'approve_outbound_message',
  'sla_breach',
  'unclear_venue_reply',
  'out_of_bounds_negotiation',
  'venue_data_gap'
);

create type public.ops_task_status as enum ('open', 'in_progress', 'resolved', 'dismissed');

create type public.app_role as enum ('user', 'ops', 'admin');

-- --- Shared helpers ---------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'Maintains updated_at on write. Attached to every table that has the column.';

-- Append-only enforcement for the audit trail.
create or replace function public.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Table %.% is append-only; % is not permitted.',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

comment on function public.forbid_mutation is
  'Blocks UPDATE and DELETE. Used to keep events_log immutable.';
