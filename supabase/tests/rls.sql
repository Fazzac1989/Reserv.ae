\set ON_ERROR_STOP off
\pset pager off

\echo '=== A. RLS AS A NORMAL USER (alice) ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';
select 'profiles visible (expect 1)      : ' || count(*) from public.users;
select 'preferences visible (expect 1)   : ' || count(*) from public.user_preferences;
select 'venues visible (expect 15)       : ' || count(*) from public.venues;
select 'venue policies visible (expect 15): ' || count(*) from public.venue_policies;
select 'venue CONTACTS (expect 0)        : ' || count(*) from public.venue_contacts;
select 'venue CHANNELS (expect 0)        : ' || count(*) from public.venue_booking_channels;
select 'booking_attempts (expect 0)      : ' || count(*) from public.booking_attempts;
select 'ops_tasks (expect 0)             : ' || count(*) from public.ops_tasks;
select 'events_log (expect 0)            : ' || count(*) from public.events_log;
select 'own bookings (expect 1)          : ' || count(*) from public.bookings;
rollback;

\echo ''
\echo '=== B. ANOTHER USER CANNOT SEE ALICE (mallory) ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}';
select 'profiles visible (expect 1, hers): ' || count(*) from public.users;
select 'bookings visible (expect 0)      : ' || count(*) from public.bookings;
select 'requests visible (expect 0)      : ' || count(*) from public.requests;
rollback;

\echo ''
\echo '=== C. A USER CANNOT MUTATE A BOOKING ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';
with attempted as (
  update public.bookings set party_size = 99
   where id = '11111111-0000-4000-8000-000000000010'
  returning 1
)
select 'rows a user could update (expect 0): ' || count(*) from attempted;
rollback;

\echo ''
\echo '=== D. A USER CANNOT INSERT A BOOKING (expect ERROR) ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.bookings (user_id, venue_id, status, party_size, scheduled_for)
values ('aaaaaaaa-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000001', 'draft', 2, now() + interval '1 day');
rollback;

\echo ''
\echo '=== E. A USER CANNOT SELF-GRANT OPS (expect ERROR) ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}';
insert into public.user_roles (user_id, role)
values ('cccccccc-0000-4000-8000-000000000003', 'ops');
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}';
select public.grant_role_by_email('mallory@example.invalid', 'ops');
rollback;

\echo ''
\echo '=== F. RLS AS OPS ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';
select 'profiles visible (expect 3)      : ' || count(*) from public.users;
select 'venue CHANNELS (expect 35)       : ' || count(*) from public.venue_booking_channels;
select 'venue CONTACTS (expect 15)       : ' || count(*) from public.venue_contacts;
select 'events_log (expect >0)           : ' || count(*) from public.events_log;
select 'all bookings (expect 1)          : ' || count(*) from public.bookings;
rollback;

\echo ''
\echo '=== G. OPS CANNOT REWRITE THE AUDIT LOG (expect 0 rows / ERROR) ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';
insert into public.events_log (entity_type, entity_id, event, actor)
values ('booking', '11111111-0000-4000-8000-000000000010', 'forged', 'ops');
rollback;

\echo ''
\echo '=== H. ANON SEES NOTHING ==='
begin;
set local role anon;
select 'anon venues (expect 0)           : ' || count(*) from public.venues;
select 'anon profiles (expect 0)         : ' || count(*) from public.users;
rollback;

\echo ''
\echo '=== I. RLS ENABLED ON EVERY PUBLIC TABLE ==='
select tablename || ': rls=' || rowsecurity
  from pg_tables
 where schemaname = 'public'
 order by tablename;

\echo '=== DONE ==='
