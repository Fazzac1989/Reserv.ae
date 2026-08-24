-- ---------------------------------------------------------------------------
-- reservAI — identity: profiles, roles, taste preferences
-- ---------------------------------------------------------------------------

-- --- Roles ------------------------------------------------------------------
-- Ops staff are identified by a row here, not by an email domain or a JWT claim
-- the client could influence. Only the service role and admins may write it.

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

comment on table public.user_roles is
  'Role grants. Ops access is decided here and nowhere else.';

-- SECURITY DEFINER so RLS policies can call it without recursing into
-- user_roles'' own policies. search_path is pinned to defeat shadowing.
create or replace function public.is_ops()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.user_roles r
    where r.user_id = auth.uid()
      and r.role in ('ops', 'admin')
  );
$$;

comment on function public.is_ops is
  'True when the caller holds the ops or admin role. Used by every ops policy.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role = 'admin'
  );
$$;

-- --- Profiles ---------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  phone_e164 text,
  full_name text,
  locale text not null default 'en',
  timezone text not null default 'Asia/Dubai',
  calendar_sync_enabled boolean not null default false,
  notification_prefs jsonb not null default jsonb_build_object(
    'push_enabled', true,
    'whatsapp_enabled', true,
    'reminder_24h', true,
    'reminder_2h', true,
    'proactive_suggestions', false
  ),
  -- The pilot is invite-only.
  invite_code text,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_check check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint users_phone_e164_check check (phone_e164 is null or phone_e164 ~ '^\+[1-9]\d{7,14}$'),
  constraint users_locale_check check (locale in ('en', 'ar')),
  constraint users_full_name_check check (full_name is null or char_length(full_name) between 1 and 120)
);

comment on table public.users is
  'Profile row per auth user. Created automatically on sign-up.';

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- --- Taste profile ----------------------------------------------------------

create table public.user_preferences (
  user_id uuid primary key references public.users (id) on delete cascade,
  cuisines_loved text[] not null default '{}',
  cuisines_avoided text[] not null default '{}',
  price_band_min smallint not null default 1,
  price_band_max smallint not null default 4,
  -- Free text, so we never silently drop an allergy we lack an enum for.
  dietary text[] not null default '{}',
  allergies text[] not null default '{}',
  home_zone public.zone,
  work_zone public.zone,
  preferred_zones public.zone[] not null default '{}',
  default_party_size smallint not null default 2,
  favourite_venue_ids uuid[] not null default '{}',
  -- Standing entities: "my barber", "our usual place". Label -> venue id.
  standing_providers jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_preferences_price_band_check
    check (price_band_min between 1 and 4
       and price_band_max between 1 and 4
       and price_band_min <= price_band_max),
  constraint user_preferences_party_size_check check (default_party_size between 1 and 20),
  constraint user_preferences_standing_providers_check
    check (jsonb_typeof(standing_providers) = 'object')
);

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- --- Sign-up wiring ---------------------------------------------------------
-- A profile and an empty taste profile exist from the first second of the
-- account, so nothing downstream has to cope with a half-created user.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.users (id, email, full_name, phone_e164)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone_e164', '')
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
