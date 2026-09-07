-- ---------------------------------------------------------------------------
-- reservAI — the directory, in public
--
-- This reverses a decision made deliberately at the start. The grants
-- migration says, in as many words: "`anon` receives nothing. There is no
-- unauthenticated surface in reservAI — not the venue directory, not
-- anything." That was right for a product whose front door was a concierge
-- you talked to. It is wrong for one whose front door is a directory: a
-- listing nobody can see until they have signed up is not a listing, it
-- cannot be linked to, and it cannot be found.
--
-- So exactly one thing becomes public — live venues, and the labels needed to
-- render them — and the rest of that sentence is made true for the first time.
--
-- Because it was not true. Writing the assertion at the foot of this file
-- turned up that `anon` already held TRUNCATE, REFERENCES and TRIGGER on all
-- 34 tables in `public`, inherited from the default privileges Supabase
-- installs. Nothing was exposed by it: PostgREST offers no way to truncate a
-- table, and every policy was `to authenticated`, so an anonymous caller read
-- nothing. But the grants migration's own stated model — "the grants below
-- are deliberately no wider than the policies, so a missing policy fails
-- closed rather than falling back to a blanket table privilege" — was a
-- description of intent, not of the database. There was a blanket table
-- privilege, and RLS does not restrain TRUNCATE.
--
-- It is fixed below before anything is opened up, because "anon can now read
-- the directory" is only a safe sentence in a database where anon's
-- privileges are the ones somebody chose.
-- ---------------------------------------------------------------------------

-- --- First, take away what was never meant to be given -----------------------

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Existing tables are handled above; this is for the next one somebody adds.
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

/**
 * An anonymous caller has no business executing anything by name.
 *
 * The functions that matter already revoke this one at a time, but they
 * revoke from `anon`, and Postgres grants EXECUTE to the pseudo-role PUBLIC by
 * default — so `is_ops()` and a dozen others stayed callable by a stranger
 * regardless. Nothing leaks through them (each answers a question about the
 * caller, and the answer for a stranger is "no"), but the reason they were
 * reachable is a default nobody chose, and the next function added would have
 * been reachable for the same reason.
 *
 * Revoking from PUBLIC takes it away from `authenticated` too, which would
 * break every RLS policy that calls `is_ops()`. Re-granting the lot to
 * `authenticated` is not the fix either: several functions here were
 * deliberately revoked from `authenticated` and left callable only by the
 * service role, and a blanket grant would hand ops analytics to every signed-in
 * user. So the set `authenticated` can call today is captured first and
 * restored exactly — this migration changes what `anon` can do and nothing
 * else.
 */
do $$
declare
  keep oid[];
  fn oid;
begin
  select array_agg(p.oid)
    into keep
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and has_function_privilege('authenticated', p.oid, 'EXECUTE');

  execute 'revoke execute on all functions in schema public from public, anon';

  foreach fn in array coalesce(keep, '{}'::oid[]) loop
    execute format('grant execute on function %s to authenticated', fn::regprocedure);
  end loop;
end;
$$;

alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;

-- --- Then, open exactly one thing -------------------------------------------
--
-- Two mechanisms, both required, because either alone would be a mistake:
--
--   RLS decides WHICH ROWS      — a policy limited to `onboarding_status = live`
--   GRANT decides WHICH COLUMNS — a column-level grant, so a column added to
--                                 `venues` later is private until someone
--                                 deliberately adds it to the list below

create policy venues_select_anon on public.venues
  for select to anon
  using (onboarding_status = 'live');

comment on policy venues_select_anon on public.venues is
  'The public directory. Live venues only; the column grant does the rest.';

-- Named one at a time on purpose. Anything absent here is unreadable by anon
-- even though the policy admits the row — which is what makes adding a column
-- to this table safe by default, and it is the reason this is a column grant
-- rather than a view. `venues` keeps growing; a `select *` view would quietly
-- publish each new column, and the default has to be "not public".
--
-- Deliberately NOT granted: onboarding_status and booking_consent_obtained_at,
-- which describe our commercial relationship with the venue rather than any
-- fact about it, and the timestamps, which say more about our operations than
-- about dinner.
grant select (
  id,
  name,
  vertical,
  zone,
  address,
  lat,
  lng,
  price_band,
  tags,
  description,
  house_note,
  opening_hours,
  best_times,
  photo_urls,
  is_demo
) on public.venues to anon;

-- These two already carried a grant to anon and a policy limited to
-- authenticated, so anon could reach the table and then read nothing from it.
-- That is the grants/policies pairing failing closed exactly as designed. Now
-- the policies are what need widening; the grants were already right.
create policy categories_read_anon on public.categories for select to anon using (true);
create policy places_read_anon on public.places for select to anon using (true);

-- ---------------------------------------------------------------------------
-- What did NOT change, as an assertion rather than a promise.
--
-- "We did not accidentally publish the phone numbers" is worth more as
-- something the migration refuses to run without. This is what caught the
-- inherited privileges above, so it has already paid for itself once.
-- `supabase/tests/public-directory.sql` proves the same thing from outside,
-- as a real anonymous client over the wire.
-- ---------------------------------------------------------------------------

do $$
declare
  leaked text;
begin
  select string_agg(distinct table_name || ' (' || privilege_type || ')', ', ')
    into leaked
    from information_schema.role_table_grants
   where grantee = 'anon'
     and table_schema = 'public'
     and not (privilege_type = 'SELECT'
              and table_name in ('venues', 'categories', 'places'));

  if leaked is not null then
    raise exception
      'anon holds % — the public surface is the directory and nothing else.', leaked
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;
