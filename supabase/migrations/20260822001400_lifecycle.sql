-- ---------------------------------------------------------------------------
-- reservAI — the rest of a booking's life
--
-- Everything after "confirmed": the reminder that stops someone forgetting, the
-- calendar entry, the cancellation, and the rating that teaches the Curator
-- what they actually liked.
-- ---------------------------------------------------------------------------

-- --- Push tokens ------------------------------------------------------------

create table public.push_tokens (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  /** Expo push token. Belongs to a device, not a person — one user, many. */
  token text not null unique,
  platform text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint push_tokens_platform_check check (platform in ('ios', 'android'))
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create policy push_tokens_own on public.push_tokens
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- --- Reminders --------------------------------------------------------------
-- One row per reminder actually delivered. The unique constraint is what makes
-- the sweep idempotent: it can run every minute, or twice at once, and nobody
-- gets told about their dinner three times.

create type public.reminder_kind as enum ('day_before', 'two_hours', 'rate_visit');

create table public.booking_reminders (
  id uuid primary key default extensions.gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  kind public.reminder_kind not null,
  sent_at timestamptz not null default now(),
  /** How many devices it actually reached. Zero is worth knowing about. */
  delivered_to integer not null default 0,
  error_message text,
  unique (booking_id, kind)
);

create index booking_reminders_booking_idx on public.booking_reminders (booking_id);

alter table public.booking_reminders enable row level security;

create policy booking_reminders_select_own on public.booking_reminders
  for select to authenticated
  using (
    public.is_ops()
    or exists (
      select 1 from public.bookings b
      where b.id = booking_reminders.booking_id and b.user_id = (select auth.uid())
    )
  );

-- --- Calendar and rating ----------------------------------------------------

alter table public.bookings
  /** The device calendar event, so we can update or remove it later. */
  add column calendar_event_id text,
  add column rated_at timestamptz,
  /** Free text from the rating prompt. Feeds preference learning in Phase 10. */
  add column rating_note text,
  add column completed_at timestamptz;

alter table public.bookings
  add constraint bookings_rating_pair_check
    check ((rating is null) = (rated_at is null));

comment on column public.bookings.no_show is
  'Set when the user did not turn up. An attribute of a completed booking, never a state.';

-- --- The sweep --------------------------------------------------------------
-- What needs doing right now, in one query, so the scheduler does not walk the
-- whole booking table every minute.

create or replace function public.bookings_needing_reminder(
  p_kind public.reminder_kind,
  p_window_start timestamptz,
  p_window_end timestamptz
)
returns table (
  booking_id uuid,
  user_id uuid,
  scheduled_for timestamptz,
  party_size smallint,
  venue_name text
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select b.id, b.user_id, b.scheduled_for, b.party_size, v.name
  from public.bookings b
  join public.venues v on v.id = b.venue_id
  where b.status in ('confirmed', 'reminded')
    and b.scheduled_for >= p_window_start
    and b.scheduled_for < p_window_end
    -- Already sent is the common case, so it is the cheapest thing to exclude.
    and not exists (
      select 1 from public.booking_reminders r
      where r.booking_id = b.id and r.kind = p_kind
    );
$$;

revoke execute on function public.bookings_needing_reminder(
  public.reminder_kind, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.bookings_needing_reminder(
  public.reminder_kind, timestamptz, timestamptz
) to service_role;

/**
 * Bookings whose venue has gone quiet past the channel's SLA.
 *
 * The escalation rule from the build plan: WhatsApp 20 minutes, voice after two
 * failed calls. A booking sitting in `pending_venue` past its SLA is not
 * progressing, and the user is owed an honest update rather than silence.
 */
create or replace function public.bookings_past_sla(p_now timestamptz)
returns table (
  booking_id uuid,
  status public.booking_state,
  waited_minutes integer,
  sla_minutes smallint,
  rail public.rail_kind
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    b.id,
    b.status,
    (extract(epoch from (p_now - b.updated_at)) / 60)::integer,
    c.sla_minutes,
    c.kind
  from public.bookings b
  join public.venue_booking_channels c
    on c.venue_id = b.venue_id and c.is_enabled
  where b.status = 'pending_venue'
    and p_now - b.updated_at > make_interval(mins => c.sla_minutes)
$$;

revoke execute on function public.bookings_past_sla(timestamptz)
  from public, anon, authenticated;
grant execute on function public.bookings_past_sla(timestamptz) to service_role;
