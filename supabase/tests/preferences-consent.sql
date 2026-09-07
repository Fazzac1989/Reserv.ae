-- ---------------------------------------------------------------------------
-- reservAI — preferences, consent, and deleting yourself
--
-- Runs after schema-guards.sql. The deletion test creates its own user rather
-- than borrowing one, because it ends by destroying it.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP off
\pset pager off

\set alice '''aaaaaaaa-0000-4000-8000-000000000001'''
\set mallory '''cccccccc-0000-4000-8000-000000000003'''
\set doomed '''eeeeeeee-0000-4000-8000-000000000009'''

\echo '=== 1. PREFERENCES ACCEPT ONLY THE VALUES THEY DEFINE (expect 2 ERRORs) ==='
begin;
\echo '--- expect ERROR: seating_preference outside the three allowed'
update public.user_preferences set seating_preference = 'balcony' where user_id = :alice;
rollback;

begin;
\echo '--- expect ERROR: one end of quiet hours without the other'
update public.user_preferences set quiet_hours_start = '22:00', quiet_hours_end = null
 where user_id = :alice;
rollback;

begin;
update public.user_preferences
   set seating_preference = 'either', quiet_hours_start = '22:00', quiet_hours_end = '08:00'
 where user_id = :alice;
select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || ' — a valid seating preference and a complete quiet window are accepted'
  from public.user_preferences
 where user_id = :alice and seating_preference = 'either' and quiet_hours_start is not null;
rollback;

\echo ''
\echo '=== 2. CONSENT IS PRIVATE TO THE PERSON WHO GAVE IT ==='
delete from public.user_consents where user_id in (:alice, :mallory);
insert into public.user_consents (user_id, kind, granted) values (:alice, 'marketing', true);

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}';
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — mallory cannot read alice''s consent (got ' || count(*) || ')'
  from public.user_consents;
rollback;

\echo '--- expect ERROR or 0 rows: mallory granting consent as alice'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}';
insert into public.user_consents (user_id, kind, granted) values (:alice, 'whatsapp', true);
rollback;

\echo ''
\echo '=== 3. WITHDRAWAL IS A DECISION, NOT A DELETION ==='
begin;
update public.user_consents set granted = false, decided_at = now()
 where user_id = :alice and kind = 'marketing';
select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || ' — the refusal is still a row, so we know they were asked'
  from public.user_consents where user_id = :alice and kind = 'marketing' and not granted;
rollback;

\echo ''
\echo '=== 4. OPS MAY READ CONSENT BUT NEVER GRANT IT ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';
select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || ' — ops can see that consent exists (got ' || count(*) || ')'
  from public.user_consents;
rollback;

\echo '--- expect ERROR or 0 rows: ops granting consent on somebody''s behalf'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';
insert into public.user_consents (user_id, kind, granted) values (:alice, 'data_sharing', true);
rollback;

\echo ''
\echo '=== 5. DELETING YOURSELF TAKES EVERYTHING WITH IT ==='
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_user_meta_data)
values (:doomed, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'doomed@example.invalid', 'x', now(), now(), now(), '{}'::jsonb)
on conflict (id) do nothing;

insert into public.user_consents (user_id, kind, granted) values (:doomed, 'marketing', true)
  on conflict (user_id, kind) do nothing;
insert into public.saved_venues (user_id, venue_id)
  select :doomed, id from public.venues limit 1
  on conflict (user_id, venue_id) do nothing;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-4000-8000-000000000009","role":"authenticated"}';
select public.delete_my_account();
commit;

select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — the profile is gone (got ' || count(*) || ')'
  from public.users where id = :doomed;
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — their consents are gone (got ' || count(*) || ')'
  from public.user_consents where user_id = :doomed;
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — what they kept is gone (got ' || count(*) || ')'
  from public.saved_venues where user_id = :doomed;
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — the auth user is gone (got ' || count(*) || ')'
  from auth.users where id = :doomed;

-- The point of the exercise: the account goes, the audit trail does not.
-- events_log is append-only, so a foreign key nulling actor_id on delete would
-- have made this deletion impossible rather than merely lossy.
select case when count(*) >= 1 then 'PASS' else 'FAIL' end
       || ' — the audit record of the deletion survives it'
  from public.events_log where event = 'account_deleted';

\echo '=== DONE ==='
