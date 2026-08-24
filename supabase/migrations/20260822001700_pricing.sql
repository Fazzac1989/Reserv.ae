-- ---------------------------------------------------------------------------
-- reservAI — willingness to pay, and dormant billing
--
-- Two different things, deliberately kept apart.
--
-- The pilot metric is "≥30% of surveyed users say they would pay AED 99+/month".
-- That is answered by asking them, not by charging them, and it is the only
-- part of this that runs during the pilot.
--
-- The Stripe tables exist so the subscription tier is a config change later
-- rather than a migration under time pressure. Nothing writes to them while
-- FLAG_STRIPE_SUBSCRIPTIONS is off, and the service refuses the endpoints
-- outright — a billing flow that half-works is worse than one that says no.
-- ---------------------------------------------------------------------------

create table public.pricing_signals (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  /** The monthly price in AED they were asked about. */
  price_aed integer not null,
  /** yes | no | maybe — three options, because two forces a false choice. */
  answer text not null,
  /** Their words. The most useful column here by some distance. */
  comment text,
  /** How many confirmed bookings they had when asked. Context for the answer. */
  bookings_at_time integer not null default 0,
  created_at timestamptz not null default now(),
  constraint pricing_signals_answer_check check (answer in ('yes', 'no', 'maybe')),
  constraint pricing_signals_price_check check (price_aed between 0 and 10000),
  constraint pricing_signals_comment_check
    check (comment is null or char_length(comment) <= 2000),
  -- Asked once per price point. Re-asking the same question is a survey with a
  -- thumb on the scale.
  unique (user_id, price_aed)
);

create index pricing_signals_created_idx on public.pricing_signals (created_at desc);

alter table public.pricing_signals enable row level security;

create policy pricing_signals_insert_own on public.pricing_signals
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy pricing_signals_select on public.pricing_signals
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_ops());

/**
 * The pilot metric, with its denominator stated.
 *
 * `asked` is how many people answered, not how many users exist — a 30% figure
 * from four replies is not a signal, and the dashboard needs to be able to say
 * so.
 */
create or replace function public.willingness_to_pay(p_price integer default 99)
returns table (
  price_aed integer,
  asked bigint,
  yes bigint,
  maybe bigint,
  no bigint,
  yes_pct numeric,
  yes_or_maybe_pct numeric
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    p_price,
    count(*),
    count(*) filter (where answer = 'yes'),
    count(*) filter (where answer = 'maybe'),
    count(*) filter (where answer = 'no'),
    round(100.0 * count(*) filter (where answer = 'yes') / nullif(count(*), 0), 1),
    round(100.0 * count(*) filter (where answer in ('yes', 'maybe')) / nullif(count(*), 0), 1)
  from public.pricing_signals
  where price_aed = p_price;
$$;

revoke execute on function public.willingness_to_pay(integer) from public, anon;
grant execute on function public.willingness_to_pay(integer) to authenticated, service_role;

-- --- Dormant billing --------------------------------------------------------

create type public.subscription_status as enum (
  'none', 'trialing', 'active', 'past_due', 'cancelled'
);

create table public.subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  status public.subscription_status not null default 'none',
  /** Stripe ids. Null everywhere until the flag is switched on. */
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  price_aed integer,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_ops());

-- No insert or update policy on purpose. Subscriptions are written by the
-- service role from verified Stripe webhooks, never from a client.

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

comment on table public.subscriptions is
  'Dormant until FLAG_STRIPE_SUBSCRIPTIONS. Written only by verified Stripe webhooks.';
