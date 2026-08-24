\set ON_ERROR_STOP off
\pset pager off
\timing off

\echo '=== 1. SEED ==='
select 'demo venues: ' || count(*) from public.venues where is_demo;
select 'live venues: ' || count(*) from public.venues where onboarding_status = 'live';
select 'booking channels: ' || count(*) from public.venue_booking_channels;
select 'enabled channels (manual only expected): '
       || string_agg(distinct kind::text, ',')
  from public.venue_booking_channels where is_enabled;
select 'venue policies: ' || count(*) from public.venue_policies;

\echo ''
\echo '=== 2. SIGN-UP TRIGGER ==='
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_user_meta_data)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alice@example.invalid', 'x',
   now(), now(), now(), '{"full_name":"Alice Demo"}'::jsonb),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'opsuser@example.invalid', 'x',
   now(), now(), now(), '{}'::jsonb),
  ('cccccccc-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'mallory@example.invalid', 'x',
   now(), now(), now(), '{}'::jsonb);

select 'profile rows created: ' || count(*) from public.users;
select 'preference rows created: ' || count(*) from public.user_preferences;
select 'default role rows: ' || count(*) from public.user_roles where role = 'user';
select 'alice full_name from metadata: ' || coalesce(full_name, 'NULL')
  from public.users where id = 'aaaaaaaa-0000-4000-8000-000000000001';

\echo ''
\echo '=== 3. ROLE GRANT ==='
select 'granted ops to: ' || public.grant_role_by_email('opsuser@example.invalid', 'ops')::text;
select 'ops role rows: ' || count(*) from public.user_roles where role = 'ops';

\echo ''
\echo '=== 4. VENUE CANNOT GO LIVE WITHOUT CONSENT (expect ERROR) ==='
insert into public.venues (name, vertical, zone, price_band, onboarding_status)
values ('No Consent Venue', 'restaurant', 'jbr', 2, 'live');

\echo ''
\echo '=== 5. CHANNEL CONFIG MUST MATCH KIND (expect ERROR) ==='
insert into public.venue_booking_channels (venue_id, kind, priority, config, sla_minutes)
values ('d0000000-0000-4000-8000-000000000002', 'voice', 30,
        '{"kind":"whatsapp","phone_e164":"+971500000099"}'::jsonb, 20);

\echo ''
\echo '=== 6. BOOKING: CONFIRMED WITHOUT EVIDENCE (expect ERROR) ==='
insert into public.bookings (id, user_id, venue_id, status, party_size, scheduled_for)
values ('11111111-0000-4000-8000-000000000001',
        'aaaaaaaa-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000001',
        'confirmed', 2, now() + interval '3 days');

\echo ''
\echo '=== 7. BOOKING: LOW-CONFIDENCE PARSED CONFIRMATION (expect ERROR) ==='
insert into public.bookings (id, user_id, venue_id, status, party_size, scheduled_for,
                             confirmed_at, confirmation_evidence)
values ('11111111-0000-4000-8000-000000000002',
        'aaaaaaaa-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000001',
        'confirmed', 2, now() + interval '3 days', now(),
        '{"kind":"parsed_confirmation","attemptId":"22222222-0000-4000-8000-000000000001",
          "confidence":0.62,"transcriptRef":"storage://x"}'::jsonb);

\echo ''
\echo '=== 8. BOOKING: BOGUS EVIDENCE KIND (expect ERROR) ==='
insert into public.bookings (id, user_id, venue_id, status, party_size, scheduled_for,
                             confirmed_at, confirmation_evidence)
values ('11111111-0000-4000-8000-000000000003',
        'aaaaaaaa-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000001',
        'confirmed', 2, now() + interval '3 days', now(),
        '{"kind":"the_model_said_so","confidence":1}'::jsonb);

\echo ''
\echo '=== 9. HAPPY PATH: DRAFT BOOKING ==='
insert into public.bookings (id, user_id, venue_id, status, party_size, scheduled_for)
values ('11111111-0000-4000-8000-000000000010',
        'aaaaaaaa-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000001',
        'draft', 2, now() + interval '3 days');
select 'draft booking status: ' || status from public.bookings
 where id = '11111111-0000-4000-8000-000000000010';

\echo ''
\echo '=== 10. TRANSITION WITHOUT AUDIT ROW (expect ERROR at COMMIT) ==='
begin;
update public.bookings set status = 'user_approved'
 where id = '11111111-0000-4000-8000-000000000010';
commit;

\echo ''
\echo '=== 11. TRANSITION WITH AUDIT ROW (expect OK) ==='
begin;
update public.bookings set status = 'user_approved'
 where id = '11111111-0000-4000-8000-000000000010';
insert into public.events_log (entity_type, entity_id, event, actor, from_state, to_state)
values ('booking', '11111111-0000-4000-8000-000000000010', 'user_approve', 'user',
        'draft', 'user_approved');
commit;
select 'status after audited transition: ' || status from public.bookings
 where id = '11111111-0000-4000-8000-000000000010';

\echo ''
\echo '=== 12. TERMINAL STATES ARE TERMINAL (expect ERROR) ==='
begin;
update public.bookings set status = 'cancelled', cancelled_at = now()
 where id = '11111111-0000-4000-8000-000000000010';
insert into public.events_log (entity_type, entity_id, event, actor, from_state, to_state)
values ('booking', '11111111-0000-4000-8000-000000000010', 'cancel', 'user',
        'user_approved', 'cancelled');
commit;
update public.bookings set status = 'attempting'
 where id = '11111111-0000-4000-8000-000000000010';

\echo ''
\echo '=== 13. EVENTS LOG IS APPEND-ONLY (expect TWO ERRORS) ==='
update public.events_log set reason = 'tampered' where entity_type = 'booking';
delete from public.events_log where entity_type = 'booking';


\echo ''
\echo '=== 14. OPS EVENT RECORDING: BOOKING IS REFUSED (expect ERROR) ==='
-- Booking transitions are written by the service layer alongside the status
-- change. If the console could append them, the deferred trigger's proof that a
-- transition happened legally would be forgeable.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';
select public.record_ops_event('booking', '11111111-0000-4000-8000-000000000010', 'forged');
rollback;

\echo ''
\echo '=== 15. OPS EVENT RECORDING: NON-OPS IS REFUSED (expect ERROR) ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}';
select public.record_ops_event('venue', 'd0000000-0000-4000-8000-000000000001', 'sneaky');
rollback;

\echo ''
\echo '=== 16. OPS EVENT RECORDING: OPS SUCCEEDS ==='
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';
select 'recorded: ' || (public.record_ops_event(
  'venue', 'd0000000-0000-4000-8000-000000000001', 'onboarding_status_changed',
  'verification run', '{"from":"agreed","to":"live"}'::jsonb) is not null)::text;
rollback;

\echo '=== DONE (guards) ==='
