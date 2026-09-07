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
 * Matched by looking at each one rather than by trusting the file name. The
 * first attempt put spa products on a steakhouse, which is what assuming gets
 * you when the app is built around the picture.
 *
 * Replaced by the venue's own photographs the moment a real one is onboarded.
 */
photos as (
  select * from (values
    ('d0000000-0000-4000-8000-000000000001'::uuid, '1414235077428-338989a2e8c0'),
    ('d0000000-0000-4000-8000-000000000002'::uuid, '1590846406792-0adc7f938f1d'),
    ('d0000000-0000-4000-8000-000000000003'::uuid, '1552566626-52f8b828add9'),
    ('d0000000-0000-4000-8000-000000000004'::uuid, '1514933651103-005eec06c04b'),
    ('d0000000-0000-4000-8000-000000000005'::uuid, '1466978913421-dad2ebd01d17'),
    ('d0000000-0000-4000-8000-000000000006'::uuid, '1517248135467-4c7edcad34c4'),
    ('d0000000-0000-4000-8000-000000000007'::uuid, '1424847651672-bf20a4b0982b'),
    ('d0000000-0000-4000-8000-000000000008'::uuid, '1555396273-367ea4eb4db5'),
    ('d0000000-0000-4000-8000-000000000009'::uuid, '1585747860715-2ba37e788b70'),
    ('d0000000-0000-4000-8000-00000000000a'::uuid, '1585747860715-2ba37e788b70'),
    ('d0000000-0000-4000-8000-00000000000b'::uuid, '1560066984-138dadb4c035'),
    ('d0000000-0000-4000-8000-00000000000c'::uuid, '1585747860715-2ba37e788b70'),
    ('d0000000-0000-4000-8000-00000000000d'::uuid, '1560066984-138dadb4c035'),
    ('d0000000-0000-4000-8000-00000000000e'::uuid, '1540555700478-4be289fbecef'),
    ('d0000000-0000-4000-8000-00000000000f'::uuid, '1600334089648-b0d9d3028eb2')
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

-- ---------------------------------------------------------------------------
-- Wider demo set: Downtown, DIFC, Palm Jumeirah and Business Bay
--
-- STILL ENTIRELY FICTIONAL. The first fifteen venues sat in three marina-side
-- areas, which meant search, filters and any collection mentioning Downtown or
-- a Burj Khalifa view had nothing to return — the features would have looked
-- finished while being untestable.
--
-- Photography is reused from the verified set above rather than newly chosen.
-- These are stock images standing in for invented venues, and a repeated
-- interior across a demo directory is a smaller problem than an image nobody
-- has actually looked at: the last time photographs were assigned from memory,
-- spa products ended up on a steakhouse.
-- ---------------------------------------------------------------------------

with more_venues as (
  select * from (values
    ('d0000000-0000-4000-8000-000000000010'::uuid, 'Aster & Ash', 'restaurant', 'downtown', 4,
     array['modern european','tasting menu','burj view'], 'Souk Al Bahar',
     'Ask for a terrace table facing the fountain. The others are a different restaurant.',
     '1414235077428-338989a2e8c0'),
    ('d0000000-0000-4000-8000-000000000011'::uuid, 'The Reading Room', 'restaurant', 'downtown', 3,
     array['british','business lunch','quiet'], 'Boulevard',
     'Two-course lunch lands in under an hour, which is the entire point.',
     '1517248135467-4c7edcad34c4'),
    ('d0000000-0000-4000-8000-000000000012'::uuid, 'Marmalade Lane', 'restaurant', 'downtown', 2,
     array['brunch','cafe','family friendly'], 'Old Town',
     'Weekend brunch without the DJ. Highchairs without asking.',
     '1466978913421-dad2ebd01d17'),
    ('d0000000-0000-4000-8000-000000000013'::uuid, 'Palazzo Nove', 'restaurant', 'downtown', 3,
     array['italian','family friendly','outdoor'], 'Boulevard',
     'The kind of Italian where nobody minds a five-year-old.',
     '1590846406792-0adc7f938f1d'),
    ('d0000000-0000-4000-8000-000000000014'::uuid, 'Gate Twelve', 'restaurant', 'difc', 4,
     array['steakhouse','business lunch','wine list'], 'Gate Village',
     'Booths at the back are the ones people book to talk in.',
     '1555396273-367ea4eb4db5'),
    ('d0000000-0000-4000-8000-000000000015'::uuid, 'Shoji DIFC', 'restaurant', 'difc', 4,
     array['japanese','sushi','quiet'], 'Gate Avenue',
     'Counter for two, tables for a conversation. Rarely loud.',
     '1424847651672-bf20a4b0982b'),
    ('d0000000-0000-4000-8000-000000000016'::uuid, 'Corner Ledger', 'restaurant', 'difc', 2,
     array['cafe','business lunch','vegetarian friendly'], 'Central Park Towers',
     'Fast, and good enough that nobody feels short-changed.',
     '1552566626-52f8b828add9'),
    ('d0000000-0000-4000-8000-000000000017'::uuid, 'Salt Flat', 'restaurant', 'palm_jumeirah', 4,
     array['seafood','beachfront','sunset'], 'West Crescent',
     'Sunset is the booking. Anything after nine is a different evening.',
     '1514933651103-005eec06c04b'),
    ('d0000000-0000-4000-8000-000000000018'::uuid, 'Driftwood Club', 'restaurant', 'palm_jumeirah', 3,
     array['brunch','beachfront','family friendly'], 'East Crescent',
     'Saturday brunch with somewhere for children to actually go.',
     '1590846406792-0adc7f938f1d'),
    ('d0000000-0000-4000-8000-000000000019'::uuid, 'Canal House', 'restaurant', 'business_bay', 3,
     array['levantine','waterfront','date night'], 'Marasi Drive',
     'Water on one side, quiet on the other. Ask which table you are getting.',
     '1517248135467-4c7edcad34c4'),
    ('d0000000-0000-4000-8000-00000000001a'::uuid, 'Gate Twelve Barbers', 'barber', 'difc', 3,
     array['mens cut','hot towel shave','express'], 'Gate Village',
     'Books out at lunchtime. Mornings are wide open.',
     '1585747860715-2ba37e788b70'),
    ('d0000000-0000-4000-8000-00000000001b'::uuid, 'Atrium Hair', 'salon', 'downtown', 4,
     array['colour','blow dry','bridal'], 'Boulevard',
     'Colour appointments run long. Do not book anything after.',
     '1560066984-138dadb4c035')
  ) as v (id, name, vertical, zone, price_band, tags, neighbourhood, house_note, photo)
)
insert into public.venues (
  id, name, vertical, zone, neighbourhood, address, price_band, tags, description, house_note,
  opening_hours, best_times, photo_urls, onboarding_status, booking_consent_obtained_at, is_demo
)
select
  v.id, v.name, v.vertical, v.zone, v.neighbourhood,
  'Demo address, ' || v.neighbourhood || ', Dubai',
  v.price_band, v.tags,
  'A sample listing while Reserv onboards real venues in Dubai.',
  v.house_note,
  (
    select jsonb_agg(jsonb_build_object(
      'day', d,
      'opens_at', case when v.vertical = 'restaurant' then '12:00' else '10:00' end,
      'closes_at', case when v.vertical = 'restaurant' then '23:30' else '21:00' end
    ))
    from unnest(array['mon','tue','wed','thu','fri','sat','sun']) as d
  ),
  case when v.vertical = 'restaurant' then array['early evening', 'weeknights']
       else array['weekday mornings'] end,
  array['https://images.unsplash.com/photo-' || v.photo ||
        '?auto=format&fit=crop&w=1200&q=70'],
  'live', now(), true
from more_venues v
on conflict (id) do nothing;

-- --- Content fields for every demo venue ------------------------------------
--
-- Derived from the tags and price band rather than typed out per venue, so the
-- demo data stays internally consistent: a venue tagged 'beachfront' has
-- outdoor seating and a sea view, and one at band 4 dresses smarter than one
-- at band 2.
--
-- `verified_at` is deliberately left null on all of them. Nothing here has
-- been checked with a venue, because there is no venue to check it with, and a
-- demo row claiming verification is exactly the kind of fiction that ends up
-- being believed.

update public.venues v set
  avg_spend_aed = case v.vertical
    when 'restaurant' then (array[0, 90, 180, 340, 620])[v.price_band + 1]
    else (array[0, 70, 130, 240, 420])[v.price_band + 1]
  end,
  neighbourhood = coalesce(v.neighbourhood,
    replace(initcap(replace(v.zone, '_', ' ')), 'Jbr', 'JBR')),
  dress_code = case
    when v.vertical <> 'restaurant' then null
    when v.price_band >= 4 then 'Smart casual. No beachwear after 7pm.'
    when v.price_band = 3 then 'Smart casual.'
    else 'Come as you are.'
  end,
  ambience = case
    when 'quiet' = any (v.tags) then array['quiet', 'conversation']
    when 'date night' = any (v.tags) then array['intimate', 'low lit']
    when 'beachfront' = any (v.tags) then array['relaxed', 'outdoor']
    when 'business lunch' = any (v.tags) then array['efficient', 'quiet enough to talk']
    when v.price_band >= 4 then array['refined', 'occasion']
    else array['relaxed']
  end,
  has_indoor = true,
  has_outdoor = (v.tags && array['outdoor', 'beachfront', 'waterfront', 'burj view', 'sunset']),
  has_view = case
    when 'burj view' = any (v.tags) then 'Burj Khalifa'
    when 'beachfront' = any (v.tags) or 'sunset' = any (v.tags) then 'Sea'
    when 'waterfront' = any (v.tags) then 'Marina'
    else null
  end,
  private_space = (v.price_band >= 4),
  children_policy = case
    when 'family friendly' = any (v.tags)
      then 'Children welcome. Highchairs and a children''s menu.'
    when v.vertical <> 'restaurant' then 'Children welcome with an adult.'
    when v.price_band >= 4 then 'Children welcome until 8pm.'
    else 'Children welcome.'
  end,
  -- Null for salons and barbers, where the question does not arise. For the
  -- restaurants this is a fictional answer to a real question.
  alcohol_policy = case
    when v.vertical <> 'restaurant' then null
    when v.price_band >= 3 then 'Licensed. Full bar.'
    else 'No alcohol served.'
  end,
  smoking_policy = case
    when v.tags && array['outdoor', 'beachfront', 'waterfront']
      then 'Smoking on the terrace only.'
    else 'Non-smoking throughout.'
  end,
  dietary_options = case
    when 'vegetarian friendly' = any (v.tags)
      then array['vegetarian', 'vegan', 'gluten free on request']
    when v.vertical = 'restaurant' then array['vegetarian', 'gluten free on request']
    else '{}'::text[]
  end,
  accessibility = array['step-free entrance', 'accessible toilet'],
  parking = case
    when v.price_band >= 4 then array['valet', 'on-site']
    when v.zone in ('downtown', 'difc', 'business_bay') then array['mall parking']
    else array['on-site']
  end
where v.is_demo;

-- --- Collections ------------------------------------------------------------
--
-- The Discover shelves, as rows ops can edit rather than a constant compiled
-- into the app. Membership is derived from tags here; in production it is an
-- editorial choice made in the console.

insert into public.collections (slug, title, blurb, sort_order, vertical) values
  ('tonight', 'Tonight', 'Open this evening, and worth the trip.', 10, 'restaurant'),
  ('date-night', 'Date night', 'Quiet enough to hear each other.', 20, 'restaurant'),
  ('business-lunch', 'Business lunch', 'In and out, without it feeling rushed.', 30, 'restaurant'),
  ('beachfront', 'By the water', 'Sand, sea, or a view of one of them.', 40, 'restaurant'),
  ('family', 'With the children', 'Highchairs, patience, and somewhere to move.', 50, 'restaurant'),
  ('brunch', 'Brunch', 'The weekend institution, done properly.', 60, 'restaurant'),
  ('hidden-gems', 'Hidden gems', 'Places people keep to themselves.', 70, 'restaurant'),
  ('chairs', 'Chairs', 'Barbers and salons worth keeping.', 80, null),
  ('quiet', 'Quiet', 'Somewhere to disappear for an hour.', 90, null)
on conflict (slug) do update set
  title = excluded.title, blurb = excluded.blurb, sort_order = excluded.sort_order;

insert into public.collection_venues (collection_slug, venue_id, sort_order)
select c.slug, v.id, v.price_band
from public.venues v
cross join lateral (values
  ('tonight', v.vertical = 'restaurant'),
  ('date-night', v.tags && array['date night', 'tasting menu', 'burj view']),
  ('business-lunch', v.tags && array['business lunch']),
  ('beachfront', v.tags && array['beachfront', 'waterfront', 'sunset']),
  ('family', v.tags && array['family friendly']),
  ('brunch', v.tags && array['brunch']),
  ('hidden-gems', v.tags && array['quiet'] and v.price_band <= 3),
  ('chairs', v.vertical in ('barber', 'salon')),
  ('quiet', v.tags && array['quiet'])
) as c(slug, member)
where v.is_demo and c.member
on conflict (collection_slug, venue_id) do nothing;

-- --- Policies and contacts for the venues added above -----------------------
--
-- The blocks earlier in this file ran before these venues existed. Scoped to
-- rows that have none rather than re-running wholesale, because
-- `venue_contacts` has no unique key and a second pass would duplicate every
-- contact it already created.

insert into public.venue_policies (
  venue_id, min_lead_time_minutes, max_lead_time_days, min_party_size, max_party_size,
  cancellation_notice_hours, cancellation_terms
)
select v.id, 60, 60, 1, 12,
  case when v.price_band >= 4 then 24 else 4 end,
  case when v.price_band >= 4
    then 'Fictional policy: 24 hours notice, otherwise the table is released.'
    else 'Fictional policy: let them know if plans change.' end
from public.venues v
where v.is_demo
  and not exists (select 1 from public.venue_policies p where p.venue_id = v.id);

insert into public.venue_contacts (venue_id, name, role, phone_e164, email, notes)
select v.id, 'Demo Contact', 'Reservations',
  '+97150001' || lpad((row_number() over (order by v.name))::text, 4, '0'),
  'reservations@example.invalid',
  'Fictional contact. Real venue contacts are never committed to the repository.'
from public.venues v
where v.is_demo
  and not exists (select 1 from public.venue_contacts c where c.venue_id = v.id);
