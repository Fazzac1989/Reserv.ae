-- ---------------------------------------------------------------------------
-- reservAI — the pilot scorecard
--
-- These functions compute exactly the metrics the 90-day pilot is judged on,
-- and nothing else. A dashboard of generic charts would be easy to build and
-- useless in week 12; these are the six numbers that decide whether this works.
--
-- The denominator is stated explicitly everywhere it matters. "60% of requests
-- convert" is meaningless until you have agreed whether a request nobody could
-- serve counts against you, and that argument is much cheaper to have now than
-- at the end of the pilot.
-- ---------------------------------------------------------------------------

/**
 * Request → suggestion → approval → confirmed.
 *
 * Two conversion rates, deliberately:
 *
 *   - `confirmed_of_all` counts every request, including ones the directory
 *     could not serve. This is the honest measure of the product a user
 *     experiences, and it is the one to report.
 *   - `confirmed_of_served` counts only requests that got as far as options.
 *     It isolates how well the rails work from how thin the directory is, which
 *     is what tells you whether to sign more venues or fix the booking flow.
 */
create or replace function public.pilot_funnel(p_from timestamptz, p_to timestamptz)
returns table (
  requests bigint,
  clarified bigint,
  suggested bigint,
  approved bigint,
  confirmed bigint,
  completed bigint,
  confirmed_of_all numeric,
  confirmed_of_served numeric
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with r as (
    select
      req.id,
      req.status,
      -- A request is "served" once it produced at least one real option.
      exists (select 1 from public.suggestions s where s.request_id = req.id) as had_options,
      exists (
        select 1 from public.bookings b
        where b.request_id = req.id and b.status <> 'draft'
      ) as approved,
      exists (
        select 1 from public.bookings b
        where b.request_id = req.id
          and b.status in ('confirmed', 'reminded', 'completed')
      ) as confirmed,
      exists (
        select 1 from public.bookings b
        where b.request_id = req.id and b.status = 'completed' and not b.no_show
      ) as completed
    from public.requests req
    where req.created_at >= p_from and req.created_at < p_to
  )
  select
    count(*),
    count(*) filter (where status = 'needs_clarification'),
    count(*) filter (where had_options),
    count(*) filter (where approved),
    count(*) filter (where confirmed),
    count(*) filter (where completed),
    round(100.0 * count(*) filter (where confirmed) / nullif(count(*), 0), 1),
    round(
      100.0 * count(*) filter (where confirmed) / nullif(count(*) filter (where had_options), 0),
      1
    )
  from r;
$$;

/**
 * How long a confirmation actually takes, by rail.
 *
 * Measured from the user approving to the venue confirming — the wait the user
 * experiences, not the time our code spent working. Median and p90, because the
 * mean of a distribution with a few multi-hour escalations tells you nothing.
 */
create or replace function public.time_to_confirmation(p_from timestamptz, p_to timestamptz)
returns table (
  rail public.rail_kind,
  bookings bigint,
  median_minutes numeric,
  p90_minutes numeric,
  target_minutes integer
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with confirmations as (
    select
      coalesce(a.rail, 'manual'::public.rail_kind) as rail,
      extract(epoch from (b.confirmed_at - approved.at)) / 60 as minutes
    from public.bookings b
    join lateral (
      select min(e.occurred_at) as at
      from public.events_log e
      where e.entity_type = 'booking' and e.entity_id = b.id and e.to_state = 'user_approved'
    ) approved on approved.at is not null
    left join lateral (
      select ba.rail
      from public.booking_attempts ba
      where ba.booking_id = b.id and ba.outcome = 'confirmed'
      order by ba.sequence desc
      limit 1
    ) a on true
    where b.confirmed_at is not null
      and b.confirmed_at >= p_from and b.confirmed_at < p_to
  )
  select
    rail,
    count(*),
    round(percentile_cont(0.5) within group (order by minutes)::numeric, 1),
    round(percentile_cont(0.9) within group (order by minutes)::numeric, 1),
    -- The pilot targets: API under 2 minutes, WhatsApp under 30, voice under 45.
    case rail
      when 'api' then 2
      when 'whatsapp' then 30
      when 'voice' then 45
      else 120
    end
  from confirmations
  group by rail;
$$;

/**
 * The retention signal that matters: a second booking within 14 days.
 *
 * Cohorted by the week of the first booking, because a pilot that improves will
 * show it here before it shows anywhere else.
 */
create or replace function public.retention_cohorts()
returns table (
  cohort_week date,
  users bigint,
  returned bigint,
  returned_pct numeric
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with firsts as (
    select b.user_id, min(b.created_at) as first_at
    from public.bookings b
    where b.status <> 'draft'
    group by b.user_id
  ),
  seconds as (
    select
      f.user_id,
      f.first_at,
      exists (
        select 1 from public.bookings b2
        where b2.user_id = f.user_id
          and b2.status <> 'draft'
          and b2.created_at > f.first_at
          and b2.created_at <= f.first_at + interval '14 days'
      ) as returned
    from firsts f
  )
  select
    date_trunc('week', first_at)::date,
    count(*),
    count(*) filter (where returned),
    round(100.0 * count(*) filter (where returned) / nullif(count(*), 0), 1)
  from seconds
  group by 1
  order by 1 desc;
$$;

/**
 * Per-venue reliability.
 *
 * The trust metric: a venue that confirms and then has no record of the booking
 * is worse for us than one that declines quickly. `no_show_at_venue` counts
 * bookings we told a user were confirmed that turned out not to be.
 */
create or replace function public.venue_reliability()
returns table (
  venue_id uuid,
  venue_name text,
  bookings bigint,
  confirmed bigint,
  failed bigint,
  no_show_at_venue bigint,
  median_response_minutes numeric
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    v.id,
    v.name,
    count(b.id),
    count(b.id) filter (where b.status in ('confirmed', 'reminded', 'completed')),
    count(b.id) filter (where b.status = 'failed'),
    count(b.id) filter (where b.no_show),
    round(
      percentile_cont(0.5) within group (
        order by extract(epoch from (b.confirmed_at - b.created_at)) / 60
      )::numeric,
      1
    )
  from public.venues v
  join public.bookings b on b.venue_id = v.id
  group by v.id, v.name
  having count(b.id) > 0
  order by count(b.id) desc;
$$;

/**
 * How much human time each booking costs.
 *
 * The number that decides whether this is a business or a concierge service
 * with extra steps. Measured as ops tasks per booking and how long they stay
 * open — a proxy for minutes, until someone times themselves properly.
 */
create or replace function public.ops_effort(p_from timestamptz, p_to timestamptz)
returns table (
  week date,
  bookings bigint,
  ops_tasks bigint,
  tasks_per_booking numeric,
  median_open_minutes numeric
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with weeks as (
    select date_trunc('week', b.created_at)::date as week, count(*) as bookings
    from public.bookings b
    where b.created_at >= p_from and b.created_at < p_to and b.status <> 'draft'
    group by 1
  ),
  tasks as (
    select
      date_trunc('week', t.created_at)::date as week,
      count(*) as tasks,
      percentile_cont(0.5) within group (
        order by extract(epoch from (coalesce(t.resolved_at, now()) - t.created_at)) / 60
      ) as median_minutes
    from public.ops_tasks t
    where t.created_at >= p_from and t.created_at < p_to
    group by 1
  )
  select
    w.week,
    w.bookings,
    coalesce(t.tasks, 0),
    round(coalesce(t.tasks, 0)::numeric / nullif(w.bookings, 0), 2),
    round(t.median_minutes::numeric, 1)
  from weeks w
  left join tasks t on t.week = w.week
  order by w.week desc;
$$;

-- Ops reads these; nothing else does.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'pilot_funnel(timestamptz, timestamptz)',
    'time_to_confirmation(timestamptz, timestamptz)',
    'retention_cohorts()',
    'venue_reliability()',
    'ops_effort(timestamptz, timestamptz)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end;
$$;
