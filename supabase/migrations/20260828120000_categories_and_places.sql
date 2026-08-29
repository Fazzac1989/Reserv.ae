/**
 * Widening the domain.
 *
 * `vertical` and `zone` were Postgres enums of three values each — restaurant,
 * salon, barber, and three Dubai neighbourhoods. That was right for a pilot on
 * one street and is wrong for a lifestyle assistant that has to reason about
 * hotels in London and a golf tee time in Ras Al Khaimah.
 *
 * Enums are the wrong shape for this. Adding a value needs a migration, they
 * cannot be managed from the console, and they carry no label, ordering or
 * grouping. Reference tables can do all three, and a foreign key gives the same
 * guarantee the enum did: a venue cannot claim a category nobody defined.
 *
 * What is lost is compile-time narrowing in the generated types — `vertical`
 * becomes string rather than a union. Every boundary in this codebase already
 * validates with zod, so the check moves rather than disappears.
 */

-- --------------------------------------------------------------------------
-- Categories
-- --------------------------------------------------------------------------

/**
 * What a supplier is.
 *
 * `kind` groups categories for the places a person thinks in groups — a
 * Discover shelf, a preference question, an agent deciding which rail applies.
 * It is deliberately coarse; the slug carries the detail.
 */
create table public.categories (
  slug text primary key,
  label text not null,
  kind text not null,
  -- Whether this category can be booked today, as opposed to described. A
  -- category with no rail is still worth knowing about: it is how the app says
  -- "I know what a florist is, I just cannot book one yet" rather than
  -- pretending the request was understood.
  is_bookable boolean not null default false,
  sort_order smallint not null default 100,
  created_at timestamptz not null default now(),
  constraint categories_slug_check check (slug ~ '^[a-z][a-z0-9_]*$'),
  constraint categories_kind_check
    check (kind in ('dining', 'grooming', 'wellness', 'leisure', 'travel', 'home', 'health'))
);

comment on table public.categories is
  'What a supplier is. Replaces the vertical enum so the domain can widen without a migration.';

insert into public.categories (slug, label, kind, is_bookable, sort_order) values
  -- Bookable today. These are the three the pilot was built around.
  ('restaurant', 'Restaurant', 'dining', true, 10),
  ('salon', 'Salon', 'grooming', true, 20),
  ('barber', 'Barber', 'grooming', true, 30),
  -- Known but not yet bookable. Named so the assistant can recognise the
  -- request and say honestly that it cannot act on it yet.
  ('cafe', 'Cafe', 'dining', false, 40),
  ('beach_club', 'Beach club', 'leisure', false, 50),
  ('spa', 'Spa', 'wellness', false, 60),
  ('gym', 'Gym', 'wellness', false, 70),
  ('personal_trainer', 'Personal trainer', 'wellness', false, 80),
  ('golf_club', 'Golf club', 'leisure', false, 90),
  ('attraction', 'Attraction', 'leisure', false, 100),
  ('event_venue', 'Event venue', 'leisure', false, 110),
  ('hotel', 'Hotel', 'travel', false, 120),
  ('airline', 'Airline', 'travel', false, 130),
  ('travel_agency', 'Travel agency', 'travel', false, 140),
  ('tour_operator', 'Tour operator', 'travel', false, 150),
  ('car_rental', 'Car rental', 'travel', false, 160),
  ('transfer', 'Airport transfer', 'travel', false, 170),
  ('clinic', 'Clinic', 'health', false, 180),
  ('dentist', 'Dentist', 'health', false, 190),
  ('florist', 'Florist', 'home', false, 200),
  ('home_service', 'Home service', 'home', false, 210);

-- --------------------------------------------------------------------------
-- Places
-- --------------------------------------------------------------------------

/**
 * Where something is.
 *
 * A neighbourhood belongs to a city and a city to a country, so "somewhere in
 * Dubai" and "somewhere in the Marina" are the same question asked at
 * different depths. The pilot only ever asked the narrow one; travel asks the
 * wide one, and the assistant should not need two vocabularies for it.
 */
create table public.places (
  slug text primary key,
  label text not null,
  kind text not null,
  parent_slug text references public.places (slug),
  -- Dubai time for everything in the pilot, but a London hotel is not.
  timezone text not null default 'Asia/Dubai',
  sort_order smallint not null default 100,
  created_at timestamptz not null default now(),
  constraint places_slug_check check (slug ~ '^[a-z][a-z0-9_]*$'),
  constraint places_kind_check check (kind in ('neighbourhood', 'city', 'country')),
  -- A neighbourhood without a city is a place nobody can navigate to.
  constraint places_parent_check check (kind = 'country' or parent_slug is not null)
);

comment on table public.places is
  'Where something is, nested neighbourhood to city to country. Replaces the zone enum.';

insert into public.places (slug, label, kind, parent_slug, timezone, sort_order) values
  ('uae', 'United Arab Emirates', 'country', null, 'Asia/Dubai', 10),
  ('dubai', 'Dubai', 'city', 'uae', 'Asia/Dubai', 10),
  ('abu_dhabi', 'Abu Dhabi', 'city', 'uae', 'Asia/Dubai', 20),
  ('ras_al_khaimah', 'Ras Al Khaimah', 'city', 'uae', 'Asia/Dubai', 30),
  -- The three the pilot shipped with. Slugs unchanged, so every existing row
  -- and every stored parsed_intent still resolves.
  ('dubai_marina', 'Dubai Marina', 'neighbourhood', 'dubai', 'Asia/Dubai', 10),
  ('jbr', 'JBR', 'neighbourhood', 'dubai', 'Asia/Dubai', 20),
  ('bluewaters', 'Bluewaters', 'neighbourhood', 'dubai', 'Asia/Dubai', 30),
  ('difc', 'DIFC', 'neighbourhood', 'dubai', 'Asia/Dubai', 40),
  ('downtown', 'Downtown', 'neighbourhood', 'dubai', 'Asia/Dubai', 50),
  ('palm_jumeirah', 'Palm Jumeirah', 'neighbourhood', 'dubai', 'Asia/Dubai', 60),
  ('business_bay', 'Business Bay', 'neighbourhood', 'dubai', 'Asia/Dubai', 70),
  ('dubai_hills', 'Dubai Hills', 'neighbourhood', 'dubai', 'Asia/Dubai', 80);

-- Both tables are read by every signed-in user and written by nobody but ops.
alter table public.categories enable row level security;
alter table public.places enable row level security;

create policy categories_read on public.categories for select to authenticated using (true);
create policy places_read on public.places for select to authenticated using (true);

grant select on public.categories to authenticated, anon;
grant select on public.places to authenticated, anon;

-- --------------------------------------------------------------------------
-- Move the columns across
-- --------------------------------------------------------------------------

-- Three functions name the enum in a returns-table column, so all three go
-- before it can be dropped. Each is recreated below, unchanged apart from
-- that one column type.
drop function if exists public.user_venue_history(uuid);
drop function if exists public.user_taste_signals(uuid);
drop function if exists public.proactive_candidates(timestamptz);

alter table public.venues
  alter column vertical type text using vertical::text,
  alter column zone type text using zone::text;

alter table public.venues
  add constraint venues_vertical_fkey foreign key (vertical) references public.categories (slug),
  add constraint venues_zone_fkey foreign key (zone) references public.places (slug);

alter table public.user_preferences
  alter column home_zone type text using home_zone::text,
  alter column work_zone type text using work_zone::text,
  alter column preferred_zones type text[] using preferred_zones::text[];

-- Changing a column's type leaves its default behind, still written in the old
-- one. The empty array has to be restated as text[] or the enum cannot be
-- dropped and the default cannot be evaluated.
alter table public.user_preferences
  alter column preferred_zones set default '{}'::text[];

alter table public.user_preferences
  add constraint user_preferences_home_zone_fkey
    foreign key (home_zone) references public.places (slug),
  add constraint user_preferences_work_zone_fkey
    foreign key (work_zone) references public.places (slug);

/**
 * A foreign key cannot cover an array, so the same guarantee is written by
 * hand. Without it `preferred_zones` is the one column in the schema where a
 * typo survives, and it is read on every single request.
 */
create or replace function public.assert_places_exist()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  unknown_slug text;
begin
  select z into unknown_slug
  from unnest(new.preferred_zones) as z
  where not exists (select 1 from public.places where slug = z)
  limit 1;

  if unknown_slug is not null then
    raise exception 'No such place: %', unknown_slug using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger user_preferences_places_exist
  before insert or update of preferred_zones on public.user_preferences
  for each row execute function public.assert_places_exist();

drop type if exists public.vertical;
drop type if exists public.zone;

-- --------------------------------------------------------------------------
-- The three functions, restored
--
-- Copied verbatim from 20260822001900_memory.sql. The only change is the
-- return type of `vertical`, which no longer has an enum to be.
-- --------------------------------------------------------------------------

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
  vertical text,
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
  vertical text,
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
