-- ---------------------------------------------------------------------------
-- reservAI — venue directory, booking channels and policies
--
-- Venue relationship data is the moat. It is also the most sensitive data we
-- hold: `venue_booking_channels` carries the contact details a venue gave us on
-- the understanding we would use them to book, not publish them. Nothing in
-- this file is readable by an end user — see the RLS migration.
-- ---------------------------------------------------------------------------

create table public.venues (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  vertical public.vertical not null,
  zone public.zone not null,
  address text,
  lat double precision,
  lng double precision,
  price_band smallint not null,
  -- Cuisines for restaurants, services for salons and barbers.
  tags text[] not null default '{}',
  description text,
  -- Our own editorial line. The Curator may quote it; it is never scraped.
  house_note text,
  -- [{ day, opens_at, closes_at }]
  opening_hours jsonb not null default '[]'::jsonb,
  best_times text[] not null default '{}',
  photo_urls text[] not null default '{}',
  onboarding_status public.venue_onboarding_status not null default 'lead',
  -- Documented permission to book on a user's behalf. No permission, no rail.
  booking_consent_obtained_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venues_name_check check (char_length(name) between 1 and 160),
  constraint venues_price_band_check check (price_band between 1 and 4),
  constraint venues_lat_check check (lat is null or lat between -90 and 90),
  constraint venues_lng_check check (lng is null or lng between -180 and 180),
  constraint venues_geo_pair_check check ((lat is null) = (lng is null)),
  constraint venues_opening_hours_check check (jsonb_typeof(opening_hours) = 'array'),
  -- A venue cannot go live until someone recorded that it agreed to this.
  constraint venues_live_requires_consent
    check (onboarding_status <> 'live' or booking_consent_obtained_at is not null)
);

comment on column public.venues.booking_consent_obtained_at is
  'When the venue agreed we may book on behalf of users. Required to go live.';

create index venues_zone_vertical_idx on public.venues (zone, vertical)
  where onboarding_status = 'live';
create index venues_onboarding_status_idx on public.venues (onboarding_status);
create index venues_tags_idx on public.venues using gin (tags);
create index venues_name_lower_idx on public.venues (lower(name));

create trigger venues_set_updated_at
  before update on public.venues
  for each row execute function public.set_updated_at();

-- --- Contacts ---------------------------------------------------------------
-- Kept separate from `venues` so the directory can be read widely while contact
-- details stay behind an ops-only policy.

create table public.venue_contacts (
  id uuid primary key default extensions.gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  name text not null,
  role text,
  phone_e164 text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_contacts_phone_check
    check (phone_e164 is null or phone_e164 ~ '^\+[1-9]\d{7,14}$')
);

create index venue_contacts_venue_id_idx on public.venue_contacts (venue_id);

create trigger venue_contacts_set_updated_at
  before update on public.venue_contacts
  for each row execute function public.set_updated_at();

-- --- Booking channels -------------------------------------------------------

create table public.venue_booking_channels (
  id uuid primary key default extensions.gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  kind public.rail_kind not null,
  -- Lower runs first. This is the fallback order for this venue.
  priority smallint not null,
  -- Shape is validated by channelConfigSchema in packages/core. Credentials are
  -- never stored inline; `credentials_ref` points at the secret store.
  config jsonb not null,
  sla_minutes smallint not null,
  responsive_hours jsonb not null default '[]'::jsonb,
  is_enabled boolean not null default false,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_booking_channels_priority_check check (priority between 0 and 100),
  constraint venue_booking_channels_sla_check check (sla_minutes between 1 and 1440),
  constraint venue_booking_channels_config_object_check check (jsonb_typeof(config) = 'object'),
  -- The discriminant in the JSON must agree with the column.
  constraint venue_booking_channels_config_kind_check check (config ->> 'kind' = kind::text),
  unique (venue_id, kind)
);

comment on table public.venue_booking_channels is
  'Ordered rail configuration per venue. Contains venue contact details — ops only.';

create index venue_booking_channels_venue_priority_idx
  on public.venue_booking_channels (venue_id, priority)
  where is_enabled;

create trigger venue_booking_channels_set_updated_at
  before update on public.venue_booking_channels
  for each row execute function public.set_updated_at();

-- --- Policies ---------------------------------------------------------------

create table public.venue_policies (
  id uuid primary key default extensions.gen_random_uuid(),
  venue_id uuid not null unique references public.venues (id) on delete cascade,
  min_lead_time_minutes integer not null default 0,
  max_lead_time_days smallint not null default 60,
  min_party_size smallint not null default 1,
  max_party_size smallint not null default 12,
  cancellation_notice_hours smallint not null default 0,
  cancellation_terms text,
  -- [{ day, from, to }] — peak windows the venue will not take agent bookings.
  blackout_windows jsonb not null default '[]'::jsonb,
  requires_deposit boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_policies_lead_time_check
    check (min_lead_time_minutes between 0 and 20160 and max_lead_time_days between 0 and 365),
  constraint venue_policies_party_size_check
    check (min_party_size between 1 and 50
       and max_party_size between 1 and 200
       and min_party_size <= max_party_size),
  constraint venue_policies_cancellation_check
    check (cancellation_notice_hours between 0 and 336),
  constraint venue_policies_blackout_check check (jsonb_typeof(blackout_windows) = 'array')
);

create trigger venue_policies_set_updated_at
  before update on public.venue_policies
  for each row execute function public.set_updated_at();
