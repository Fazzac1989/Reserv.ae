-- ---------------------------------------------------------------------------
-- reservAI — saved venues are private
--
-- What somebody is considering is as personal as what they booked. Runs after
-- schema-guards.sql, which creates alice and mallory.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP off
\pset pager off

\set alice '''aaaaaaaa-0000-4000-8000-000000000001'''
\set mallory '''cccccccc-0000-4000-8000-000000000003'''
\set venue_a '''d0000000-0000-4000-8000-000000000001'''
\set venue_b '''d0000000-0000-4000-8000-000000000002'''

\echo '=== 0. FIXTURES ==='
delete from public.saved_venues where user_id in (:alice, :mallory);
insert into public.saved_venues (user_id, venue_id) values (:alice, :venue_a);

\echo ''
\echo '=== 1. A PERSON SEES THEIR OWN, AND ONLY THEIR OWN ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';
select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || ' — alice sees the one she kept (got ' || count(*) || ')'
  from public.saved_venues;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}';
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — mallory sees none of alice''s (got ' || count(*) || ')'
  from public.saved_venues;
rollback;

\echo ''
\echo '=== 2. NOBODY CAN SAVE ON SOMEBODY ELSE''S BEHALF (expect ERROR) ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}';
\echo '--- expect ERROR: mallory inserting a row owned by alice'
insert into public.saved_venues (user_id, venue_id) values (:alice, :venue_b);
rollback;

\echo ''
\echo '=== 3. NOBODY CAN DELETE SOMEBODY ELSE''S ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}';
with attempted as (
  delete from public.saved_venues where user_id = :alice returning 1
)
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — rows of alice''s mallory could delete (expect 0)' from attempted;
rollback;

\echo ''
\echo '=== 4. SAVING TWICE IS NOT AN ERROR, AND NOT A SECOND ROW ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.saved_venues (user_id, venue_id) values (:alice, :venue_a)
  on conflict (user_id, venue_id) do nothing;
select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || ' — still one row after saving the same venue twice (got ' || count(*) || ')'
  from public.saved_venues;
rollback;

\echo ''
\echo '=== 5. OPS HAS NO WINDOW INTO IT EITHER ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';
-- Deliberately not readable by ops. There is no support question that needs
-- the list of places somebody was thinking about, and the policy says so.
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — ops sees no saved venues (got ' || count(*) || ')'
  from public.saved_venues;
rollback;

\echo ''
\echo '=== 6. A STRANGER IS REFUSED THE TABLE (expect ERROR) ==='
-- Written as an expected error rather than an expected count of zero, because
-- that is what actually happens and it is the stronger result: `anon` holds no
-- grant on this table at all, so PostgREST refuses before RLS is consulted.
-- The count version would have passed either way and told us less.
begin;
set local role anon;
\echo '--- expect ERROR: permission denied for table saved_venues'
select count(*) from public.saved_venues;
rollback;

\echo '=== DONE ==='
