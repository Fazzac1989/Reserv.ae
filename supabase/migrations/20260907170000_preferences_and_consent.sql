-- ---------------------------------------------------------------------------
-- reservAI — the rest of the preference profile, and consent as a record
--
-- `user_preferences` already holds cuisines, price band, dietary needs,
-- allergies, areas and party size. The brief asks for the rest of what a
-- concierge would actually need to know before speaking to a venue on
-- somebody's behalf: where they like to sit, whether smoking matters, whether
-- alcohol matters, what the family needs, what they usually celebrate, and
-- when they would rather not be messaged.
--
-- Additive throughout. Every column is nullable or defaulted.
--
-- One thing deliberately NOT inferred, ever: allergies. The brief says so and
-- it is worth restating next to the schema — an allergy guessed from browsing
-- behaviour is a medical claim made from a click, and this column is only ever
-- written by the person it belongs to.
-- ---------------------------------------------------------------------------

alter table public.user_preferences
  add column if not exists seating_preference text,
  add column if not exists smoking_preference text,
  add column if not exists alcohol_preference text,
  add column if not exists accessibility_needs text[] not null default '{}',
  add column if not exists family_needs text[] not null default '{}',
  add column if not exists occasions text[] not null default '{}',
  -- Local time, no zone: "do not message me between 22:00 and 08:00" means the
  -- clock on their wall, and `users.timezone` says which wall.
  add column if not exists quiet_hours_start time,
  add column if not exists quiet_hours_end time;

alter table public.user_preferences
  add constraint user_preferences_seating_check
  check (seating_preference is null or seating_preference in ('indoor', 'outdoor', 'either'));

alter table public.user_preferences
  add constraint user_preferences_smoking_check
  check (smoking_preference is null or smoking_preference in ('smoking', 'non_smoking', 'either'));

alter table public.user_preferences
  add constraint user_preferences_alcohol_check
  check (alcohol_preference is null
         or alcohol_preference in ('served', 'not_required', 'none'));

-- Both or neither. A window with one end open is not a window, and the code
-- reading it would have to invent the other end.
alter table public.user_preferences
  add constraint user_preferences_quiet_hours_pair
  check ((quiet_hours_start is null) = (quiet_hours_end is null));

comment on column public.user_preferences.allergies is
  'Only ever written by the person it belongs to. Never inferred from '
  'behaviour: an allergy guessed from a click is a medical claim made from a '
  'click, and it would be passed to a kitchen as fact.';

-- --- Consent ----------------------------------------------------------------
--
-- A row rather than a boolean on `users`, because consent is a legal artefact
-- and "true" is not one. What matters later is which version of what wording
-- somebody agreed to, when, and from where — a boolean answers none of that,
-- and cannot answer it retrospectively either.
--
-- Current state lives here; the history lives in `events_log`, which is
-- append-only and already the audit trail for everything else.

create table if not exists public.user_consents (
  user_id uuid not null references public.users (id) on delete cascade,
  -- 'marketing' — may we send you things you did not ask for.
  -- 'data_sharing' — may we pass your details to a venue in order to book.
  -- 'whatsapp' — may we message you on WhatsApp rather than only in the app.
  kind text not null,
  granted boolean not null,
  -- Which wording they saw. Bump when the wording changes materially, so an
  -- old grant is visibly a grant of the old thing.
  version text not null default 'v1',
  decided_at timestamptz not null default now(),
  primary key (user_id, kind),
  constraint user_consents_kind_check
    check (kind in ('marketing', 'data_sharing', 'whatsapp'))
);

comment on table public.user_consents is
  'What each person has agreed to, and which version of the wording they saw.';

-- No `set_updated_at` trigger here, and not by omission.
--
-- Every other table in this schema carries one, so it went on by reflex and
-- then failed on the first update: the trigger assigns `new.updated_at` and
-- this table has no such column. Adding the column would have made the error
-- go away and left two timestamps meaning almost the same thing.
--
-- `decided_at` is the one that matters and it is not a modification time — it
-- is when this person decided this. Writers set it explicitly with the
-- decision, so a row cannot be touched without saying when the decision was
-- made, which is exactly the property a consent record needs.

alter table public.user_consents enable row level security;

create policy user_consents_own on public.user_consents
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Ops may read whether somebody consented — a support question about why a
-- venue was told a name needs an answer — but may never grant it for them.
create policy user_consents_ops_read on public.user_consents
  for select to authenticated
  using (public.is_ops());

grant select, insert, update, delete on public.user_consents to authenticated;

-- --- The audit log has to outlive the account -------------------------------
--
-- `events_log.actor_id` referenced `auth.users` with ON DELETE SET NULL, and
-- `events_log` refuses UPDATE because it is append-only. Those two facts are
-- individually reasonable and jointly make it impossible to delete a user at
-- all: Postgres tries to null the column, the append-only guard raises, and
-- the whole delete rolls back. Found by running the deletion rather than by
-- reading either definition.
--
-- The constraint is what gives way, not the append-only rule. An audit trail
-- whose rows change when somebody leaves is not an audit trail — the record
-- "ops confirmed this booking at 19:04" should still say that afterwards. The
-- column stays a uuid and keeps pointing at an id that no longer resolves,
-- which is the correct state of affairs: the actor is gone, the fact that they
-- acted is not.
--
-- Nothing personal is retained by this. Once the user row is deleted the uuid
-- identifies no one and carries no name, address or contact detail.
--
-- The other seven such constraints are on ordinary tables that accept updates,
-- so they keep their ON DELETE SET NULL and keep nulling cleanly.

alter table public.events_log drop constraint if exists events_log_actor_id_fkey;

comment on column public.events_log.actor_id is
  'Who acted. Deliberately not a foreign key: this table is append-only, and a '
  'reference that rewrites history when an account is deleted would make both '
  'the deletion and the audit trail impossible at once.';

-- --- Deleting yourself ------------------------------------------------------

/**
 * Delete the caller's account and everything hanging off it.
 *
 * SECURITY DEFINER because `auth.users` is not the application's to write, and
 * every table that matters cascades from it. The function takes no argument
 * naming whose account to delete: it reads `auth.uid()`, so a caller cannot
 * ask for somebody else's — the one mistake that would matter here.
 *
 * An event is written before the delete rather than after, because after,
 * there is no user to attribute it to and a foreign key would null the actor
 * out. What survives is the fact that an account was deleted and when, with no
 * personal detail in the payload — which is the point of the exercise.
 */
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Sign in first.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.events_log (entity_type, entity_id, event, actor, actor_id, payload)
  values ('user', caller, 'account_deleted', 'user', caller, '{}'::jsonb);

  delete from auth.users where id = caller;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account is
  'Irreversible. Deletes the calling user and everything that cascades from '
  'them. Reads auth.uid() rather than taking an id, so it cannot be aimed.';
