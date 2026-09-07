-- ---------------------------------------------------------------------------
-- reservAI — the content model discovery needs
--
-- `venues` today holds what a concierge needed in order to *book*: a name, a
-- zone, a price band and a way to reach them. Discovery needs what a person
-- needs in order to *choose*, which is a different and much longer list —
-- whether there is a table outside, whether the children can come, what to
-- wear, where to park, what it actually costs.
--
-- Everything here is additive. No column is dropped, no type is narrowed, and
-- every new column is nullable or defaulted, so existing rows stay valid and
-- the running application keeps working while this lands.
--
-- The fields are chosen to serve all three verticals rather than restaurants
-- alone. A barber has a dress code the way a restaurant does (usually none), a
-- salon has parking and step-free access, and all three have opening hours and
-- an average spend. Where something genuinely applies to one vertical it is
-- nullable and null means "not applicable" rather than "unknown" — the one
-- exception being `alcohol_policy`, which is null for every salon and barber
-- and should be read that way.
-- ---------------------------------------------------------------------------

-- --- Identity and place -----------------------------------------------------

alter table public.venues add column if not exists slug text;
alter table public.venues add column if not exists neighbourhood text;
alter table public.venues add column if not exists parent_venue text;
alter table public.venues add column if not exists video_urls text[] not null default '{}';

comment on column public.venues.slug is
  'Stable URL segment. The public venue page prefers it over the id.';
comment on column public.venues.neighbourhood is
  'Finer than `zone`: "Pier 7", "Souk Al Bahar". Free text because the list is long and local.';
comment on column public.venues.parent_venue is
  'The hotel, mall or resort this sits inside, when it does.';

-- --- What it costs ----------------------------------------------------------

alter table public.venues add column if not exists avg_spend_aed integer;

comment on column public.venues.avg_spend_aed is
  'Typical spend per person in AED. `price_band` stays the ranking input; this '
  'is the number shown to a person deciding, and the two must not disagree.';

alter table public.venues
  add constraint venues_avg_spend_check
  check (avg_spend_aed is null or avg_spend_aed between 1 and 100000) not valid;

-- --- What it is like --------------------------------------------------------

alter table public.venues add column if not exists dress_code text;
alter table public.venues add column if not exists ambience text[] not null default '{}';
alter table public.venues add column if not exists has_indoor boolean;
alter table public.venues add column if not exists has_outdoor boolean;
alter table public.venues add column if not exists has_view text;
alter table public.venues add column if not exists private_space boolean;

comment on column public.venues.has_view is
  'What you can see from it — "Burj Khalifa", "marina", "sea". Null means nothing worth naming.';
comment on column public.venues.private_space is
  'Private dining room, private treatment room, or a bookable area.';

-- --- Who may come, and on what terms ----------------------------------------

alter table public.venues add column if not exists children_policy text;
alter table public.venues add column if not exists alcohol_policy text;
alter table public.venues add column if not exists smoking_policy text;
alter table public.venues add column if not exists dietary_options text[] not null default '{}';
alter table public.venues add column if not exists accessibility text[] not null default '{}';
alter table public.venues add column if not exists parking text[] not null default '{}';

comment on column public.venues.alcohol_policy is
  'Null for salons and barbers, where the question does not arise. For a '
  'restaurant, null means we have not asked — which is not the same as "no", '
  'and the UI must say so rather than guessing.';

-- --- Whether we believe any of it -------------------------------------------

alter table public.venues add column if not exists verified_at timestamptz;
alter table public.venues add column if not exists verified_by uuid references auth.users (id) on delete set null;

comment on column public.venues.verified_at is
  'When a human last checked this listing against the venue. A profile with '
  'no verification date is shown as unverified rather than as fact.';

-- --- Slugs ------------------------------------------------------------------
--
-- Derived from the name by a trigger, not by a one-time backfill.
--
-- The backfill below is still needed for rows that already exist, but on its
-- own it was wrong in a way worth recording: `db reset` applies migrations to
-- an empty database and runs the seed afterwards, so locally the backfill
-- updated nothing and every seeded venue arrived with a null slug. The same
-- would have been true of every venue ops created from then on. A column
-- filled once by a migration is a column that is correct exactly until the
-- next insert.

create or replace function public.set_venue_slug()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  base text;
  candidate text;
  n integer := 1;
begin
  if new.slug is not null and new.slug <> '' then
    return new;
  end if;

  base := trim(both '-' from regexp_replace(lower(trim(new.name)), '[^a-z0-9]+', '-', 'g'));
  if base = '' then
    base := 'venue';
  end if;

  candidate := base;
  -- Two venues may legitimately share a name — a chain with two branches — so
  -- collision is expected rather than exceptional, and gets a suffix.
  while exists (select 1 from public.venues v where v.slug = candidate and v.id <> new.id) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;

  new.slug := candidate;
  return new;
end;
$$;

create trigger venues_set_slug
  before insert or update of name, slug on public.venues
  for each row execute function public.set_venue_slug();

comment on function public.set_venue_slug is
  'Fills `venues.slug` from the name when it is not given, uniquely.';

update public.venues
   set slug = regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')
 where slug is null;

-- Deduplicate anything that collided, oldest keeps the clean slug.
with numbered as (
  select id, slug, row_number() over (partition by slug order by created_at, id) as n
    from public.venues
)
update public.venues v
   set slug = v.slug || '-' || numbered.n
  from numbered
 where numbered.id = v.id and numbered.n > 1;

update public.venues set slug = trim(both '-' from slug);

create unique index if not exists venues_slug_idx on public.venues (slug);

-- --- Indexes discovery will actually use ------------------------------------
--
-- Search is name, tags and description; the first is a prefix match and the
-- other two are containment, so they want different index types.

create index if not exists venues_neighbourhood_idx on public.venues (neighbourhood)
  where onboarding_status = 'live';
create index if not exists venues_avg_spend_idx on public.venues (avg_spend_aed)
  where onboarding_status = 'live';
create index if not exists venues_dietary_idx on public.venues using gin (dietary_options);
create index if not exists venues_ambience_idx on public.venues using gin (ambience);

-- --- Saved venues -----------------------------------------------------------

create table if not exists public.saved_venues (
  user_id uuid not null references public.users (id) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, venue_id)
);

comment on table public.saved_venues is
  'A venue someone kept. Private to that person: what you are considering is '
  'as personal as what you booked.';

create index if not exists saved_venues_user_idx on public.saved_venues (user_id, created_at desc);

alter table public.saved_venues enable row level security;

create policy saved_venues_own on public.saved_venues
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, delete on public.saved_venues to authenticated;

-- --- Collections ------------------------------------------------------------
--
-- The shelves on Discover, as rows rather than as a constant in the app. The
-- brief lists a dozen — date night, business lunch, beachfront, hidden gems —
-- and every one of them is an editorial judgement that ops should be able to
-- make without a deploy.

create table if not exists public.collections (
  slug text primary key,
  title text not null,
  blurb text,
  -- Where it belongs on the page, and whether it is shown at all.
  sort_order smallint not null default 100,
  is_active boolean not null default true,
  -- A collection can be pinned to one vertical, or span all of them when null.
  -- Text with a foreign key rather than an enum: `vertical` stopped being an
  -- enum when categories became rows, so that a vertical added by ops is one
  -- the app understands the same day.
  vertical text references public.categories (slug) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collections_slug_check check (slug ~ '^[a-z0-9-]{2,60}$'),
  constraint collections_title_check check (char_length(title) between 1 and 80)
);

create table if not exists public.collection_venues (
  collection_slug text not null references public.collections (slug) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete cascade,
  sort_order smallint not null default 100,
  created_at timestamptz not null default now(),
  primary key (collection_slug, venue_id)
);

create index if not exists collection_venues_venue_idx on public.collection_venues (venue_id);

create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

alter table public.collections enable row level security;
alter table public.collection_venues enable row level security;

create policy collections_read on public.collections
  for select to authenticated using (is_active or public.is_ops());
create policy collections_read_anon on public.collections
  for select to anon using (is_active);
create policy collections_ops_write on public.collections
  for all to authenticated using (public.is_ops()) with check (public.is_ops());

create policy collection_venues_read on public.collection_venues
  for select to authenticated using (true);
create policy collection_venues_read_anon on public.collection_venues
  for select to anon using (true);
create policy collection_venues_ops_write on public.collection_venues
  for all to authenticated using (public.is_ops()) with check (public.is_ops());

grant select, insert, update, delete on public.collections to authenticated;
grant select, insert, update, delete on public.collection_venues to authenticated;
grant select on public.collections to anon;
grant select on public.collection_venues to anon;

-- --- Menus, offers and experiences ------------------------------------------
--
-- One shape for all three verticals. A restaurant's menu and a salon's price
-- list are the same object: a titled document you can look at before deciding.

create table if not exists public.venue_menus (
  id uuid primary key default extensions.gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  title text not null,
  -- A link out, or a file we hold. One of the two must be present.
  url text,
  storage_path text,
  sort_order smallint not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_menus_source_check check (url is not null or storage_path is not null)
);

create table if not exists public.venue_offers (
  id uuid primary key default extensions.gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  -- 'offer' is a discount; 'experience' is a thing you book rather than a price.
  kind text not null default 'offer',
  title text not null,
  description text,
  terms text,
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_offers_kind_check check (kind in ('offer', 'experience')),
  constraint venue_offers_dates_check check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index if not exists venue_menus_venue_idx on public.venue_menus (venue_id, sort_order);
create index if not exists venue_offers_venue_idx on public.venue_offers (venue_id)
  where is_active;

create trigger venue_menus_set_updated_at
  before update on public.venue_menus
  for each row execute function public.set_updated_at();
create trigger venue_offers_set_updated_at
  before update on public.venue_offers
  for each row execute function public.set_updated_at();

alter table public.venue_menus enable row level security;
alter table public.venue_offers enable row level security;

-- Readable by anyone who can see the venue, which is what makes them part of
-- the listing rather than something behind a login.
create policy venue_menus_read on public.venue_menus
  for select to authenticated using (true);
create policy venue_menus_read_anon on public.venue_menus
  for select to anon using (true);
create policy venue_menus_write on public.venue_menus
  for all to authenticated
  using (public.is_ops() or public.manages_venue(venue_id))
  with check (public.is_ops() or public.manages_venue(venue_id));

create policy venue_offers_read on public.venue_offers
  for select to authenticated using (is_active or public.is_ops() or public.manages_venue(venue_id));
create policy venue_offers_read_anon on public.venue_offers
  for select to anon using (is_active);
create policy venue_offers_write on public.venue_offers
  for all to authenticated
  using (public.is_ops() or public.manages_venue(venue_id))
  with check (public.is_ops() or public.manages_venue(venue_id));

grant select, insert, update, delete on public.venue_menus to authenticated;
grant select, insert, update, delete on public.venue_offers to authenticated;
grant select on public.venue_menus to anon;
grant select on public.venue_offers to anon;

-- --- The public column grant, extended --------------------------------------
--
-- New columns on `venues` are private until named here, which is the whole
-- point of the column-level grant. These are the ones a person choosing a
-- venue needs; `verified_by` is not among them, because who on our staff
-- checked a listing is our business rather than the reader's.

grant select (
  slug, neighbourhood, parent_venue, video_urls, avg_spend_aed,
  dress_code, ambience, has_indoor, has_outdoor, has_view, private_space,
  children_policy, alcohol_policy, smoking_policy,
  dietary_options, accessibility, parking, verified_at
) on public.venues to anon;

-- --- The same assertion, with the surface it is now allowed to have ---------

do $$
declare
  leaked text;
  allowed text[] := array['venues', 'categories', 'places', 'collections',
                          'collection_venues', 'venue_menus', 'venue_offers'];
begin
  select string_agg(distinct entry, ', ')
    into leaked
    from (
      select table_name || ' (' || privilege_type || ')' as entry, table_name
        from information_schema.role_table_grants
       where grantee = 'anon' and table_schema = 'public'
      union all
      select table_name || '.' || column_name || ' (' || privilege_type || ')', table_name
        from information_schema.role_column_grants
       where grantee = 'anon' and table_schema = 'public'
    ) held
   where not (table_name = any (allowed) and entry like '%(SELECT)');

  if leaked is not null then
    raise exception
      'anon holds % — the public surface is the directory and nothing else.', leaked
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;
