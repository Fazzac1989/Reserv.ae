-- ---------------------------------------------------------------------------
-- reservAI — local/demo seed
--
-- EVERY VENUE BELOW IS INVENTED. The names, addresses, phone numbers and
-- contacts are fictional and exist only so the app has something to render.
--
-- Real venue data — especially the phone numbers and named contacts we collect
-- during founder-led acquisition — lives in the database of a running
-- environment and is never committed to this repository. If you find yourself
-- pasting a real number into this file, stop.
--
-- Phone numbers use a sequential +9715000000NN placeholder pattern precisely so
-- that a real one would look out of place.
-- ---------------------------------------------------------------------------

set local role postgres;

-- Deterministic ids so re-running the seed updates rather than duplicates.
with
/**
 * Photography for the demo venues.
 *
 * Stock, and openly so: these venues are fictional, so an image of a real
 * restaurant would be the one dishonest thing in an otherwise honest seed.
 * Matched by kind — a barber's chair on a barber, a dining room on a
 * restaurant — because the app is built around the picture and a mismatched
 * one looks like a bug rather than a placeholder.
 *
 * Replaced by the venue's own photographs the moment a real one is onboarded.
 */
photos as (
  select * from (values
    ('d0000000-0000-4000-8000-000000000001'::uuid, '1517248135467-4c7edcad34c4'),
    ('d0000000-0000-4000-8000-000000000002'::uuid, '1414235077428-338989a2e8c0'),
    ('d0000000-0000-4000-8000-000000000003'::uuid, '1552566626-52f8b828add9'),
    ('d0000000-0000-4000-8000-000000000004'::uuid, '1555396273-367ea4eb4db5'),
    ('d0000000-0000-4000-8000-000000000005'::uuid, '1424847651672-bf20a4b0982b'),
    ('d0000000-0000-4000-8000-000000000006'::uuid, '1540555700478-4be289fbecef'),
    ('d0000000-0000-4000-8000-000000000007'::uuid, '1466978913421-dad2ebd01d17'),
    ('d0000000-0000-4000-8000-000000000008'::uuid, '1514933651103-005eec06c04b'),
    ('d0000000-0000-4000-8000-000000000009'::uuid, '1590846406792-0adc7f938f1d'),
    ('d0000000-0000-4000-8000-000000000010'::uuid, '1585747860715-2ba37e788b70'),
    ('d0000000-0000-4000-8000-000000000011'::uuid, '1590846406792-0adc7f938f1d'),
    ('d0000000-0000-4000-8000-000000000012'::uuid, '1585747860715-2ba37e788b70'),
    ('d0000000-0000-4000-8000-000000000013'::uuid, '1560066984-138dadb4c035'),
    ('d0000000-0000-4000-8000-000000000014'::uuid, '1600334089648-b0d9d3028eb2'),
    ('d0000000-0000-4000-8000-000000000015'::uuid, '1560066984-138dadb4c035')
  ) as p(venue_id, unsplash_id)
),
demo_venues as (
  select * from (values
    -- id, name, vertical, zone, price_band, tags, house_note
    ('d0000000-0000-4000-8000-000000000001'::uuid, 'The Glasshouse Marina', 'restaurant', 'dubai_marina', 4,
     array['modern european','tasting menu','waterfront'],
     'Corner tables on the terrace are the only ones worth having. Ask for 12 or 14.'),
    ('d0000000-0000-4000-8000-000000000002'::uuid, 'Saffron & Slate', 'restaurant', 'dubai_marina', 3,
     array['north indian','vegetarian friendly','date night'],
     'Quiet enough to talk. The tasting thali is better than the a la carte.'),
    ('d0000000-0000-4000-8000-000000000003'::uuid, 'Blue Anchor Grill', 'restaurant', 'jbr', 3,
     array['seafood','grill','beachfront'],
     'Beachfront without the noise. Go before sunset or you will queue.'),
    ('d0000000-0000-4000-8000-000000000004'::uuid, 'Nine Yards Pier', 'restaurant', 'dubai_marina', 4,
     array['japanese','sushi','omakase'],
     'Counter seats only for omakase. Book two weeks out for a weekend.'),
    ('d0000000-0000-4000-8000-000000000005'::uuid, 'Little Tunis', 'restaurant', 'jbr', 2,
     array['north african','casual','family friendly'],
     'Unfussy and consistently good. Nobody regrets the lamb.'),
    ('d0000000-0000-4000-8000-000000000006'::uuid, 'Wheelhouse Bluewaters', 'restaurant', 'bluewaters', 4,
     array['steakhouse','wine list','special occasion'],
     'The room to book when someone is being congratulated.'),
    ('d0000000-0000-4000-8000-000000000007'::uuid, 'Morning Field', 'restaurant', 'jbr', 2,
     array['brunch','cafe','healthy'],
     'Weekday brunch is the secret. Saturdays are chaos.'),
    ('d0000000-0000-4000-8000-000000000008'::uuid, 'Copperline Kitchen', 'restaurant', 'dubai_marina', 3,
     array['levantine','sharing plates','outdoor'],
     'Order half what you think you need, then order again.'),
    -- Barbers
    ('d0000000-0000-4000-8000-000000000009'::uuid, 'Thornbury Barbers', 'barber', 'dubai_marina', 3,
     array['mens cut','hot towel shave','beard'],
     'Ask for the senior chair if you are growing something out.'),
    ('d0000000-0000-4000-8000-00000000000a'::uuid, 'The Marina Chair', 'barber', 'dubai_marina', 2,
     array['mens cut','walk-in friendly','quick trim'],
     'Reliable for a 30-minute tidy-up between meetings.'),
    ('d0000000-0000-4000-8000-00000000000b'::uuid, 'Eastwind Grooming', 'barber', 'jbr', 3,
     array['mens cut','skin fade','beard sculpt'],
     'The fade specialists. Worth the extra fifteen minutes of walking.'),
    ('d0000000-0000-4000-8000-00000000000c'::uuid, 'Bluewaters Blades', 'barber', 'bluewaters', 4,
     array['mens cut','traditional shave','grooming'],
     'Slow, precise and priced accordingly. Not a place to be in a hurry.'),
    -- Salons
    ('d0000000-0000-4000-8000-00000000000d'::uuid, 'Halcyon Hair Studio', 'salon', 'dubai_marina', 4,
     array['colour','cut','treatments'],
     'Book colour and cut together or you will be back within a fortnight.'),
    ('d0000000-0000-4000-8000-00000000000e'::uuid, 'Petal & Pumice', 'salon', 'jbr', 2,
     array['nails','pedicure','express'],
     'In and out in forty minutes. Good for a lunch-hour appointment.'),
    ('d0000000-0000-4000-8000-00000000000f'::uuid, 'The Long Mirror', 'salon', 'bluewaters', 3,
     array['blow dry','styling','bridal'],
     'Where people go the morning of something important.')
  ) as v (id, name, vertical, zone, price_band, tags, house_note)
)
insert into public.venues (
  id, name, vertical, zone, address, price_band, tags, description, house_note,
  opening_hours, best_times, photo_urls, onboarding_status, booking_consent_obtained_at, is_demo
)
select
  v.id,
  v.name,
  v.vertical,
  v.zone,
  'Demo address, ' || replace(initcap(replace(v.zone, '_', ' ')), 'Jbr', 'JBR') || ', Dubai',
  v.price_band,
  v.tags,
  'A sample listing while Reserv onboards real venues in Dubai.',
  v.house_note,
  -- Open Mon–Sun; salons and barbers start later and close earlier.
  (
    select jsonb_agg(jsonb_build_object(
      'day', d,
      'opens_at', case when v.vertical = 'restaurant' then '12:00' else '10:00' end,
      'closes_at', case when v.vertical = 'restaurant' then '23:30' else '21:00' end
    ))
    from unnest(array['mon','tue','wed','thu','fri','sat','sun']) as d
  ),
  case
    when v.vertical = 'restaurant' then array['early evening', 'weeknights']
    else array['weekday mornings']
  end,
  array[
    'https://images.unsplash.com/photo-' ||
      (select p.unsplash_id from photos p where p.venue_id = v.id) ||
      '?w=1400&q=80&auto=format&fit=crop'
  ],
  'live',
  now() - interval '30 days',
  true
from demo_venues v
on conflict (id) do update set
  name = excluded.name,
  tags = excluded.tags,
  house_note = excluded.house_note,
  onboarding_status = excluded.onboarding_status,
  booking_consent_obtained_at = excluded.booking_consent_obtained_at,
  photo_urls = excluded.photo_urls,
  is_demo = true;

-- --- Booking channels -------------------------------------------------------
-- A deliberate mix so the rail-selection logic has something real to chew on:
-- some venues are API-bookable, most are WhatsApp, all have a manual fallback.
-- Only the manual rail is enabled, matching FLAG_RAIL_MANUAL in .env.example —
-- a rail that is not built yet must not look available.

insert into public.venue_booking_channels (venue_id, kind, priority, config, sla_minutes, is_enabled)
select
  v.id,
  'api'::public.rail_kind,
  10,
  jsonb_build_object(
    'kind', 'api',
    'platform', case when v.vertical = 'restaurant' then 'sevenrooms' else 'fresha' end,
    'external_venue_id', 'demo-' || left(v.id::text, 8),
    'credentials_ref', 'secret://demo/not-a-real-credential',
    'supports_availability_lookup', true
  ),
  5,
  false
from public.venues v
where v.is_demo
  and v.id in (
    'd0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000004',
    'd0000000-0000-4000-8000-000000000006',
    'd0000000-0000-4000-8000-000000000009',
    'd0000000-0000-4000-8000-00000000000d'
  )
on conflict (venue_id, kind) do nothing;

insert into public.venue_booking_channels (venue_id, kind, priority, config, sla_minutes, is_enabled)
select
  v.id,
  'whatsapp'::public.rail_kind,
  20,
  jsonb_build_object(
    'kind', 'whatsapp',
    -- Placeholder numbers. Sequential on purpose.
    'phone_e164', '+97150000' || lpad((row_number() over (order by v.name))::text, 4, '0'),
    'contact_name', 'Demo Contact',
    'human_approval_required', true
  ),
  20,
  false
from public.venues v
where v.is_demo
on conflict (venue_id, kind) do nothing;

insert into public.venue_booking_channels (venue_id, kind, priority, config, sla_minutes, is_enabled)
select
  v.id,
  'manual'::public.rail_kind,
  90,
  jsonb_build_object(
    'kind', 'manual',
    'instructions', 'Demo venue. Ops confirms by hand from the booking queue.'
  ),
  60,
  true
from public.venues v
where v.is_demo
on conflict (venue_id, kind) do nothing;

-- --- Policies ---------------------------------------------------------------

insert into public.venue_policies (
  venue_id, min_lead_time_minutes, max_lead_time_days,
  min_party_size, max_party_size, cancellation_notice_hours, cancellation_terms
)
select
  v.id,
  case when v.vertical = 'restaurant' then 120 else 60 end,
  case when v.vertical = 'restaurant' then 60 else 30 end,
  1,
  case when v.vertical = 'restaurant' then 12 else 2 end,
  case when v.price_band >= 4 then 24 else 4 end,
  case
    when v.price_band >= 4
      then 'Fictional policy: 24 hours notice, otherwise the table is released.'
    else 'Fictional policy: let them know if plans change.'
  end
from public.venues v
where v.is_demo
on conflict (venue_id) do nothing;

-- --- Demo contacts ----------------------------------------------------------

insert into public.venue_contacts (venue_id, name, role, phone_e164, email, notes)
select
  v.id,
  'Demo Contact',
  'Reservations',
  '+97150000' || lpad((row_number() over (order by v.name))::text, 4, '0'),
  'reservations@example.invalid',
  'Fictional contact. Real venue contacts are never committed to the repository.'
from public.venues v
where v.is_demo
on conflict do nothing;
