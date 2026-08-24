-- ---------------------------------------------------------------------------
-- reservAI — what we learn from a user's history
--
-- "Preference learning" here means statistics over bookings, not a model
-- forming opinions. Which venues someone returns to, how often, what they
-- accepted and what they scrolled past — all of it is countable, and counting
-- it is both cheaper and more defensible than asking an LLM to intuit it.
--
-- The Curator still does the judging. This just gives it better evidence.
-- ---------------------------------------------------------------------------

create type public.nudge_kind as enum ('rebook_cadence', 'favourite_idle');

/**
 * Every proactive message we have sent, and what came of it.
 *
 * The table exists mainly to stop us sending a second one. Frequency capping
 * and "did this ever work" both read from here, and a nudge nobody acted on is
 * as important to record as one that landed.
 */
create table public.proactive_nudges (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind public.nudge_kind not null,
  venue_id uuid references public.venues (id) on delete cascade,
  sent_at timestamptz not null default now(),
  delivered_to integer not null default 0,
  /** Set when the user opened it. */
  opened_at timestamptz,
  /** Set when a booking followed within the week — the only success measure. */
  acted_at timestamptz,
  created_at timestamptz not null default now()
);

create index proactive_nudges_user_idx on public.proactive_nudges (user_id, sent_at desc);
create index proactive_nudges_venue_idx on public.proactive_nudges (user_id, venue_id, sent_at desc);

alter table public.proactive_nudges enable row level security;

create policy proactive_nudges_select_own on public.proactive_nudges
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_ops());

grant select on public.proactive_nudges to authenticated;

/**
 * A user's relationship with each venue they have been to.
 *
 * `median_gap_days` is the interval between visits — the number that says "you
 * get a haircut about every three weeks" without anyone having to say it. It is
 * null until there are at least two visits, because one visit is not a pattern.
 */
create or replace function public.user_venue_history(p_user_id uuid)
returns table (
  venue_id uuid,
  venue_name text,
  vertical public.vertical,
  visits integer,
  last_visit timestamptz,
  median_gap_days numeric,
  avg_rating numeric,
  worst_rating smallint
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with visits as (
    select
      b.venue_id,
      b.scheduled_for,
      b.rating,
      -- The gap to the previous visit at the same venue.
      extract(epoch from (
        b.scheduled_for - lag(b.scheduled_for) over (
          partition by b.venue_id order by b.scheduled_for
        )
      )) / 86400 as gap_days
    from public.bookings b
    where b.user_id = p_user_id
      and b.status in ('confirmed', 'reminded', 'completed')
      and not b.no_show
  )
  select
    v.venue_id,
    ven.name,
    ven.vertical,
    count(*)::integer,
    max(v.scheduled_for),
    round(percentile_cont(0.5) within group (order by v.gap_days)::numeric, 1),
    round(avg(v.rating)::numeric, 2),
    min(v.rating)
  from visits v
  join public.venues ven on ven.id = v.venue_id
  group by v.venue_id, ven.name, ven.vertical;
$$;

revoke execute on function public.user_venue_history(uuid) from public, anon;
grant execute on function public.user_venue_history(uuid) to authenticated, service_role;

/**
 * What a user's accepted and rejected suggestions say about their taste.
 *
 * Rejections are the more interesting half. Every suggestion shown was already
 * feasible, so choosing one over two others is a preference rather than a
 * constraint — and it is the only signal we get that is not self-reported.
 */
create or replace function public.user_taste_signals(p_user_id uuid)
returns table (
  tag text,
  shown integer,
  accepted integer,
  acceptance_rate numeric
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with shown as (
    select unnest(v.tags) as tag, s.outcome
    from public.suggestions s
    join public.requests r on r.id = s.request_id
    join public.venues v on v.id = s.venue_id
    where r.user_id = p_user_id
      and s.outcome in ('accepted', 'rejected')
  )
  select
    tag,
    count(*)::integer,
    count(*) filter (where outcome = 'accepted')::integer,
    round(100.0 * count(*) filter (where outcome = 'accepted') / nullif(count(*), 0), 1)
  from shown
  group by tag
  -- Below three sightings a rate is noise, not a signal.
  having count(*) >= 3
  order by count(*) filter (where outcome = 'accepted') desc;
$$;

revoke execute on function public.user_taste_signals(uuid) from public, anon;
grant execute on function public.user_taste_signals(uuid) to authenticated, service_role;

/**
 * Everyone who might be due a nudge, with the history to decide.
 *
 * Deliberately generous: this narrows the sweep to users with a repeat visit
 * somewhere and notifications switched on, and the real judgement — whether a
 * nudge would be welcome or annoying — happens in code where it can be tested.
 */
create or replace function public.proactive_candidates(p_now timestamptz)
returns table (
  user_id uuid,
  venue_id uuid,
  venue_name text,
  vertical public.vertical,
  visits integer,
  last_visit timestamptz,
  median_gap_days numeric,
  avg_rating numeric,
  worst_rating smallint,
  days_since_visit numeric,
  last_nudge_at timestamptz,
  nudges_last_30d integer,
  has_upcoming boolean
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with per_user as (
    select u.id as user_id
    from public.users u
    where coalesce((u.notification_prefs ->> 'push_enabled')::boolean, true)
      and coalesce((u.notification_prefs ->> 'proactive_suggestions')::boolean, false)
  ),
  history as (
    select p.user_id, h.*
    from per_user p
    cross join lateral public.user_venue_history(p.user_id) h
    where h.visits >= 2
  )
  select
    h.user_id,
    h.venue_id,
    h.venue_name,
    h.vertical,
    h.visits,
    h.last_visit,
    h.median_gap_days,
    h.avg_rating,
    h.worst_rating,
    round(extract(epoch from (p_now - h.last_visit)) / 86400, 1),
    (select max(n.sent_at) from public.proactive_nudges n
      where n.user_id = h.user_id),
    (select count(*)::integer from public.proactive_nudges n
      where n.user_id = h.user_id and n.sent_at > p_now - interval '30 days'),
    exists (
      select 1 from public.bookings b
      where b.user_id = h.user_id
        and b.venue_id = h.venue_id
        and b.scheduled_for > p_now
        and b.status not in ('cancelled', 'failed')
    )
  from history h;
$$;

revoke execute on function public.proactive_candidates(timestamptz) from public, anon, authenticated;
grant execute on function public.proactive_candidates(timestamptz) to service_role;
