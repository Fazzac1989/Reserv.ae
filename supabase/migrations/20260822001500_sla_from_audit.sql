-- ---------------------------------------------------------------------------
-- reservAI — measure the SLA from when the venue was actually asked
--
-- The first version of this used `bookings.updated_at`, which is wrong in a way
-- that only shows up in production: the `set_updated_at` trigger fires on every
-- write to the row, so editing a special request — or any unrelated update —
-- silently restarted the venue's SLA clock and a booking could sit unanswered
-- for hours without ever escalating.
--
-- The audit trail already records the moment we asked. Reading the clock from
-- the transition into `pending_venue` cannot be reset by anything else.
-- ---------------------------------------------------------------------------

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
    (extract(epoch from (p_now - asked.at)) / 60)::integer,
    c.sla_minutes,
    c.kind
  from public.bookings b
  join public.venue_booking_channels c
    on c.venue_id = b.venue_id and c.is_enabled
  join lateral (
    -- The most recent time this booking entered `pending_venue`. A retried
    -- booking gets a fresh clock, which is the behaviour we want.
    select max(e.occurred_at) as at
    from public.events_log e
    where e.entity_type = 'booking'
      and e.entity_id = b.id
      and e.to_state = 'pending_venue'
  ) asked on asked.at is not null
  where b.status = 'pending_venue'
    and p_now - asked.at > make_interval(mins => c.sla_minutes)
$$;

comment on function public.bookings_past_sla is
  'Bookings whose venue has not replied within the channel SLA, measured from the audited moment we asked.';
