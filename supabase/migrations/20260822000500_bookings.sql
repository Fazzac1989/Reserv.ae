-- ---------------------------------------------------------------------------
-- reservAI — bookings and rail attempts
--
-- The application owns the full transition table
-- (packages/core/src/booking/transitions.ts). The database owns the two rules
-- that must survive a bug, a bad migration or a direct psql session:
--
--   1. `confirmed` is unreachable without deterministic evidence.
--   2. Terminal states are terminal.
--
-- Duplicating the whole table here would guarantee drift. These two do not
-- change, and they are the ones that would hurt a real person standing outside
-- a restaurant.
-- ---------------------------------------------------------------------------

create table public.bookings (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete restrict,
  request_id uuid references public.requests (id) on delete set null,
  suggestion_id uuid references public.suggestions (id) on delete set null,
  status public.booking_state not null default 'draft',
  party_size smallint not null,
  -- A booking is a point in time, not a window.
  scheduled_for timestamptz not null,
  -- Salons and barbers: which service, and with whom.
  service_name text,
  provider_name text,
  special_requests text,
  confirmed_at timestamptz,
  confirmation_evidence jsonb,
  external_ref text,
  cancelled_at timestamptz,
  cancellation_reason text,
  -- Attributes of a completed booking, not lifecycle states.
  no_show boolean not null default false,
  rating smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_party_size_check check (party_size between 1 and 20),
  constraint bookings_rating_check check (rating is null or rating between 1 and 5),
  constraint bookings_evidence_object_check
    check (confirmation_evidence is null or jsonb_typeof(confirmation_evidence) = 'object'),
  -- Rule 1, as a table constraint so it also holds for inserts.
  constraint bookings_confirmed_requires_evidence check (
    status not in ('confirmed', 'reminded', 'completed')
    or (confirmed_at is not null and confirmation_evidence is not null)
  ),
  constraint bookings_cancelled_requires_timestamp check (
    status <> 'cancelled' or cancelled_at is not null
  )
);

comment on constraint bookings_confirmed_requires_evidence on public.bookings is
  'Principle 1: a booking the user can rely on must be backed by a deterministic confirmation event.';

create index bookings_user_scheduled_idx on public.bookings (user_id, scheduled_for desc);
create index bookings_status_idx on public.bookings (status)
  where status not in ('completed', 'cancelled', 'failed');
create index bookings_venue_idx on public.bookings (venue_id, scheduled_for desc);
create index bookings_upcoming_idx on public.bookings (scheduled_for)
  where status in ('confirmed', 'reminded');

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- --- Evidence and terminality guards ----------------------------------------

create or replace function public.check_booking_evidence()
returns trigger
language plpgsql
as $$
declare
  evidence_kind text;
  confidence numeric;
begin
  if new.confirmation_evidence is not null then
    evidence_kind := new.confirmation_evidence ->> 'kind';

    if evidence_kind is null
       or evidence_kind not in ('api_webhook', 'parsed_confirmation', 'ops_action') then
      raise exception
        'Refusing to accept confirmation evidence of kind %. Expected api_webhook, parsed_confirmation or ops_action.',
        coalesce(evidence_kind, 'null')
        using errcode = 'check_violation';
    end if;

    -- A venue reply we are not sure about is not a confirmation. Escalate to
    -- ops instead of guessing. Threshold mirrors
    -- CONFIRMATION_CONFIDENCE_THRESHOLD in packages/core.
    if evidence_kind = 'parsed_confirmation' then
      confidence := (new.confirmation_evidence ->> 'confidence')::numeric;
      if confidence is null or confidence < 0.9 then
        raise exception
          'Parsed venue confirmation scored %, below the 0.90 threshold. Create an ops task instead.',
          coalesce(confidence::text, 'null')
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger bookings_check_evidence
  before insert or update on public.bookings
  for each row execute function public.check_booking_evidence();

create or replace function public.check_booking_terminality()
returns trigger
language plpgsql
as $$
begin
  if old.status = new.status then
    return new;
  end if;

  if old.status in ('completed', 'cancelled', 'failed') then
    raise exception
      'Booking % is in terminal state % and cannot move to %.',
      old.id, old.status, new.status
      using errcode = 'check_violation';
  end if;

  if new.status = 'draft' then
    raise exception 'Booking % cannot return to draft from %.', old.id, old.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger bookings_check_terminality
  before update on public.bookings
  for each row execute function public.check_booking_terminality();

-- --- Rail attempts ----------------------------------------------------------
-- One row per rail attempt. Transcripts and recordings are storage pointers,
-- never inlined, so this table stays cheap to query and the media stays behind
-- signed URLs.

create table public.booking_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  venue_channel_id uuid references public.venue_booking_channels (id) on delete set null,
  rail public.rail_kind not null,
  -- 1-based across all rails, so the fallback chain reads in order.
  sequence smallint not null,
  outcome public.attempt_outcome,
  -- Below the confirmation threshold this must produce an ops task.
  outcome_confidence numeric(4, 3),
  offered_alternative jsonb,
  transcript_ref text,
  recording_ref text,
  thread_ref text,
  error_message text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_attempts_sequence_check check (sequence >= 1),
  constraint booking_attempts_confidence_check
    check (outcome_confidence is null or outcome_confidence between 0 and 1),
  constraint booking_attempts_alternative_check
    check (offered_alternative is null or jsonb_typeof(offered_alternative) = 'object'),
  constraint booking_attempts_window_check
    check (ended_at is null or ended_at >= started_at),
  unique (booking_id, sequence)
);

create index booking_attempts_booking_idx on public.booking_attempts (booking_id, sequence);
create index booking_attempts_open_idx on public.booking_attempts (started_at)
  where outcome is null;

create trigger booking_attempts_set_updated_at
  before update on public.booking_attempts
  for each row execute function public.set_updated_at();
