-- ---------------------------------------------------------------------------
-- reservAI — venue back office: does a partner see only its own venue?
--
-- Runs after schema-guards.sql, which creates the fixture users and the
-- bookings at venue 1 that this file reads.
--
-- Unlike the two older files, every check here prints PASS or FAIL rather than
-- a count to be compared by eye. The runner greps for FAIL, so a policy that
-- stops holding fails the suite instead of scrolling past.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP off
\pset pager off

\set venue_a '''d0000000-0000-4000-8000-000000000001'''
\set venue_b '''d0000000-0000-4000-8000-000000000002'''
\set partner '''dddddddd-0000-4000-8000-000000000004'''
\set outsider '''dddddddd-0000-4000-8000-000000000005'''

\echo '=== 0. FIXTURES: a partner at venue A, and an outsider with no venue ==='

-- Re-runnable. Section 8 creates an invitation and section 9 expires it, so a
-- second run against the same database would otherwise collide on the pending
-- unique index and then read the expired row — which fails in a way that looks
-- like a broken policy rather than a dirty fixture. Clearing first costs
-- nothing and removes a confusing failure mode.
delete from public.venue_invites where email in ('partner@example.invalid', 'outsider@example.invalid');
delete from public.bookings where id = '11111111-0000-4000-8000-000000000020';
delete from auth.users where email in ('partner@example.invalid', 'outsider@example.invalid');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_user_meta_data)
values
  (:partner, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'partner@example.invalid', 'x',
   now(), now(), now(), '{"full_name":"Priya Partner"}'::jsonb),
  (:outsider, '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'outsider@example.invalid', 'x',
   now(), now(), now(), '{"full_name":"Omar Outsider"}'::jsonb);

-- A second booking, at venue B, so "sees only its own" has something to fail on.
insert into public.bookings (id, user_id, venue_id, status, party_size, scheduled_for, guest_name)
values ('11111111-0000-4000-8000-000000000020',
        'aaaaaaaa-0000-4000-8000-000000000001',
        :venue_b, 'draft', 4, now() + interval '2 days', 'Alice Demo');

update public.bookings set guest_name = 'Alice Demo'
 where id = '11111111-0000-4000-8000-000000000010';

insert into public.venue_members (venue_id, user_id, role)
values (:venue_a, :partner, 'owner');

\echo ''
\echo '=== 1. THE PARTNER SEES ITS OWN VENUE AND ITS OWN BOOKINGS ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated"}';

select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || ' — partner sees exactly its own venue''s bookings (got ' || count(*) || ')'
  from public.venue_bookings;

select case when bool_and(venue_id = :venue_a) then 'PASS' else 'FAIL' end
       || ' — every visible booking belongs to venue A'
  from public.venue_bookings;

select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || ' — partner sees its own venue row (got ' || count(*) || ')'
  from public.venues where id = :venue_a;

select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || ' — partner sees its own venue''s contacts (got ' || count(*) || ')'
  from public.venue_contacts where venue_id = :venue_a;

select case when guest_name = 'Alice Demo' then 'PASS' else 'FAIL' end
       || ' — partner sees the guest name it needs to seat them'
  from public.venue_bookings where id = '11111111-0000-4000-8000-000000000010';
rollback;

\echo ''
\echo '=== 2. THE PARTNER SEES NOTHING OF ANY OTHER VENUE ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated"}';

select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — no bookings from venue B (got ' || count(*) || ')'
  from public.venue_bookings where venue_id = :venue_b;

select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — no contact details from venue B (got ' || count(*) || ')'
  from public.venue_contacts where venue_id = :venue_b;

select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — no booking channels at all, not even its own (got ' || count(*) || ')'
  from public.venue_booking_channels;

select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — no other user''s profile (got ' || count(*) || ')'
  from public.users where id <> :partner;

select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — no ops tasks (got ' || count(*) || ')'
  from public.ops_tasks;

select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — no audit log (got ' || count(*) || ')'
  from public.events_log;
rollback;

\echo ''
\echo '=== 3. THE PARTNER MAY EDIT ITS DESCRIPTION ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated"}';

with edited as (
  update public.venues set description = 'We reopened the terrace.'
   where id = :venue_a returning 1
)
select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || ' — partner may rewrite its own description' from edited;
rollback;

\echo ''
\echo '=== 4. THE PARTNER MAY NOT EDIT WHAT IT DOES NOT OWN (expect 4 ERRORs) ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated"}';
\echo '--- expect ERROR: onboarding_status'
update public.venues set onboarding_status = 'paused' where id = :venue_a;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated"}';
\echo '--- expect ERROR: booking_consent_obtained_at'
update public.venues set booking_consent_obtained_at = now() where id = :venue_a;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated"}';
\echo '--- expect ERROR: price_band (a ranking input, not theirs)'
update public.venues set price_band = 1 where id = :venue_a;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated"}';
\echo '--- expect ERROR: house_note (our editorial line, not theirs)'
update public.venues set house_note = 'Best in Dubai!!!' where id = :venue_a;
rollback;

\echo ''
\echo '=== 5. THE PARTNER MAY NOT EDIT ANOTHER VENUE AT ALL ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated"}';
with attempted as (
  update public.venues set description = 'defaced' where id = :venue_b returning 1
)
select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — rows of venue B a partner could update (expect 0)' from attempted;
rollback;

\echo ''
\echo '=== 6. A USER WITH NO MEMBERSHIP IS NOT A PARTNER ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000005","role":"authenticated"}';

select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — outsider sees no venue bookings (got ' || count(*) || ')'
  from public.venue_bookings;

select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — outsider sees no memberships (got ' || count(*) || ')'
  from public.venue_members;

select case when public.manages_venue(:venue_a) = false then 'PASS' else 'FAIL' end
       || ' — manages_venue() is false for a non-member';
rollback;

\echo ''
\echo '=== 7. A PARTNER CANNOT MAKE ITSELF A MEMBER OF ANOTHER VENUE ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated"}';
\echo '--- expect ERROR or 0 rows: self-granting membership of venue B'
insert into public.venue_members (venue_id, user_id, role)
values (:venue_b, :partner, 'owner');
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated"}';
\echo '--- expect ERROR or 0 rows: inviting itself to venue B'
insert into public.venue_invites (venue_id, email, role)
values (:venue_b, 'partner@example.invalid', 'owner');
rollback;

\echo ''
\echo '=== 8. INVITATION REDEMPTION MATCHES ON THE SIGNED-IN ADDRESS ==='
insert into public.venue_invites (venue_id, email, role)
values (:venue_b, 'outsider@example.invalid', 'manager');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated"}';
-- The partner is not outsider@, so redeeming grants it nothing.
select case when public.redeem_venue_invites() = 0 then 'PASS' else 'FAIL' end
       || ' — a partner cannot redeem an invitation addressed to someone else';
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000005","role":"authenticated"}';
select case when public.redeem_venue_invites() = 1 then 'PASS' else 'FAIL' end
       || ' — the invited address redeems exactly one invitation';
select case when public.manages_venue(:venue_b) then 'PASS' else 'FAIL' end
       || ' — and is now a member of venue B';
select case when public.redeem_venue_invites() = 0 then 'PASS' else 'FAIL' end
       || ' — redeeming twice grants nothing the second time';
rollback;

\echo ''
\echo '=== 9. AN EXPIRED INVITATION IS NOT AN INVITATION ==='
update public.venue_invites set expires_at = now() - interval '1 day'
 where email = 'outsider@example.invalid' and accepted_at is null;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-4000-8000-000000000005","role":"authenticated"}';
select case when public.redeem_venue_invites() = 0 then 'PASS' else 'FAIL' end
       || ' — an expired invitation grants nothing';
rollback;

\echo ''
\echo '=== 10. OPS IS UNAFFECTED BY EVERYTHING ABOVE ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';

select case when count(*) >= 2 then 'PASS' else 'FAIL' end
       || ' — ops still sees every venue''s bookings (got ' || count(*) || ')'
  from public.venue_bookings;

with edited as (
  update public.venues set price_band = price_band where id = :venue_a returning 1
)
select case when count(*) = 1 then 'PASS' else 'FAIL' end
       || ' — ops is not caught by the member column guard' from edited;
rollback;

\echo ''
\echo '=== 11. AN END USER GAINS NOTHING FROM THE NEW SURFACE ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — a user sees no memberships (got ' || count(*) || ')'
  from public.venue_members;

select case when count(*) = 0 then 'PASS' else 'FAIL' end
       || ' — a user sees no invitations (got ' || count(*) || ')'
  from public.venue_invites;
rollback;

\echo ''
\echo '=== 12. RLS IS ON FOR THE NEW TABLES ==='
select case when bool_and(rowsecurity) then 'PASS' else 'FAIL' end
       || ' — RLS enabled on venue_members and venue_invites'
  from pg_tables
 where schemaname = 'public' and tablename in ('venue_members', 'venue_invites');

\echo '=== DONE ==='
