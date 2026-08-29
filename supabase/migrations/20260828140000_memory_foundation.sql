/**
 * What Riva learns, as opposed to what it was told.
 *
 * `user_preferences` already holds the stated layer: what someone typed during
 * onboarding, which is true on the day and slowly stops being. This adds the
 * two things a lifestyle assistant needs beside it — what their behaviour says,
 * and who the other people in their life are.
 *
 * Confidence is not stored. It is derived from the counts below by a rule in
 * packages/core, which is testable and cannot drift away from its own evidence.
 * A number written into a column at insert time is a number nobody can explain
 * six months later, and this is a product whose whole claim is that it can.
 */

-- --------------------------------------------------------------------------
-- Preference signals
-- --------------------------------------------------------------------------

create table public.preference_signals (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,

  /**
   * What the signal is about. A category slug where it is specific to one —
   * someone can like a lively restaurant and a quiet salon — and null where it
   * holds across everything, like the hour they prefer to eat.
   */
  subject text references public.categories (slug),

  /** What was observed: cuisine, atmosphere, zone, price_band, time_of_day. */
  attribute text not null,
  /** The observed value: 'japanese', 'lively', 'difc', '3', '20:00'. */
  value text not null,

  /**
   * How many times this has been seen, and how many of those were positive.
   *
   * A rejection is evidence too, and the more useful half: every suggestion
   * shown was already feasible, so passing over one is a preference rather
   * than a constraint.
   */
  observations integer not null default 1,
  agreements integer not null default 1,

  /** Where the evidence came from, most recently. */
  source text not null,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  /**
   * Set when the user says the inference is wrong. The row is kept rather than
   * deleted so the same conclusion is not drawn again next week from the same
   * behaviour, which is how a corrected assistant earns its correction.
   */
  rejected_at timestamptz,

  constraint preference_signals_attribute_check
    check (attribute ~ '^[a-z][a-z0-9_]*$' and char_length(attribute) <= 40),
  constraint preference_signals_value_check check (char_length(value) between 1 and 120),
  constraint preference_signals_source_check
    check (source in ('booking', 'rating', 'rejection', 'chat', 'stated')),
  constraint preference_signals_counts_check
    check (observations >= 1 and agreements >= 0 and agreements <= observations),
  -- One row per thing observed, reinforced rather than repeated.
  constraint preference_signals_unique unique (user_id, subject, attribute, value)
);

create index preference_signals_user_idx
  on public.preference_signals (user_id, attribute)
  where rejected_at is null;

comment on table public.preference_signals is
  'What behaviour suggests, counted. Confidence is derived in packages/core, never stored.';

-- --------------------------------------------------------------------------
-- Relationships
-- --------------------------------------------------------------------------

/**
 * The people a booking might be for.
 *
 * "Dinner for me and Joanna" is only answerable if Joanna is someone we know
 * about, and knowing she is his wife is what turns a table for two into the
 * right table for two.
 */
create table public.relationships (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  /** What they are called, as the user would say it. */
  name text not null,
  /** wife, husband, partner, son, daughter, friend, colleague, and so on. */
  relation text not null,
  /**
   * Anything that must reach a venue when this person is at the table. Kept
   * beside the person rather than in the request, because an allergy is a fact
   * about them and not about one dinner.
   */
  dietary text[] not null default '{}',
  allergies text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint relationships_name_check check (char_length(name) between 1 and 80),
  constraint relationships_relation_check
    check (relation ~ '^[a-z][a-z_ ]*$' and char_length(relation) <= 40),
  constraint relationships_notes_check check (notes is null or char_length(notes) <= 500),
  -- Two people with the same name in one household is a problem for the user
  -- to solve by naming them differently, not one to resolve silently.
  constraint relationships_unique unique (user_id, name)
);

create trigger relationships_updated_at
  before update on public.relationships
  for each row execute function public.set_updated_at();

comment on table public.relationships is
  'Household and companions. Lets "me and Joanna" resolve to a party size and a dietary need.';

-- --------------------------------------------------------------------------
-- Access
-- --------------------------------------------------------------------------

alter table public.preference_signals enable row level security;
alter table public.relationships enable row level security;

/**
 * A person can read and correct everything inferred about them, which is the
 * whole point of the transparency screen. Writing a signal is the system's
 * job: a client that could invent its own evidence is a client that can lie
 * to the assistant about its owner.
 */
create policy preference_signals_read_own on public.preference_signals
  for select to authenticated using (user_id = auth.uid());

create policy preference_signals_correct_own on public.preference_signals
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy relationships_read_own on public.relationships
  for select to authenticated using (user_id = auth.uid());

create policy relationships_write_own on public.relationships
  for insert to authenticated with check (user_id = auth.uid());

create policy relationships_update_own on public.relationships
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy relationships_delete_own on public.relationships
  for delete to authenticated using (user_id = auth.uid());

grant select, update on public.preference_signals to authenticated;
grant select, insert, update, delete on public.relationships to authenticated;

-- --------------------------------------------------------------------------
-- Recording
-- --------------------------------------------------------------------------

/**
 * Record one observation, reinforcing whatever is already there.
 *
 * Called by the service as things actually happen — a booking confirmed, a
 * suggestion passed over, a rating given. Upsert rather than insert so a
 * preference held for a year is one row with a high count, not three hundred
 * rows nobody can summarise.
 *
 * A signal the user has rejected stays rejected. Re-deriving it from the same
 * behaviour that produced it the first time is precisely the thing that makes
 * a correction feel unheard.
 */
create or replace function public.record_preference_signal(
  p_user_id uuid,
  p_subject text,
  p_attribute text,
  p_value text,
  p_source text,
  p_agreed boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.preference_signals
    (user_id, subject, attribute, value, source, observations, agreements)
  values
    (p_user_id, p_subject, p_attribute, p_value, p_source, 1, case when p_agreed then 1 else 0 end)
  on conflict (user_id, subject, attribute, value) do update
    set observations = public.preference_signals.observations + 1,
        agreements = public.preference_signals.agreements + case when p_agreed then 1 else 0 end,
        source = excluded.source,
        last_seen_at = now()
    where public.preference_signals.rejected_at is null;
end;
$$;

revoke execute on function
  public.record_preference_signal(uuid, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function
  public.record_preference_signal(uuid, text, text, text, text, boolean)
  to service_role;

comment on function public.record_preference_signal is
  'Record one observation. Reinforces an existing signal; never revives a rejected one.';
