-- ---------------------------------------------------------------------------
-- reservAI — the Discover shelves belong in a migration, not in the seed
--
-- This fixes a regression that reached production.
--
-- Discover used to have four shelves compiled into the app. Phase 2d replaced
-- them with rows in `collections`, which is right — a shelf is an editorial
-- decision and ops should be able to change one without a deploy. But the rows
-- were created in `supabase/seed.sql`, and `supabase db push` applies
-- migrations without running the seed. So the moment the migrations landed on
-- production, Discover had no shelves at all: one opener card, and sixteen of
-- seventeen venues invisible.
--
-- The mistake was treating configuration as fixtures. `seed.sql` is for demo
-- data — invented venues, fake contacts, things no real environment should
-- have. The nine shelves are none of those. They are the structure of the
-- product's front page, they should exist in every environment including a
-- production database with entirely real venues in it, and that makes them a
-- migration.
--
-- Membership is seeded here too, derived from tags, and then left alone.
-- `on conflict do nothing` on both inserts means this is a starting point ops
-- curates from rather than a definition that overwrites their work on the next
-- deploy — the whole reason for moving shelves into the database was so that
-- somebody could change them.
-- ---------------------------------------------------------------------------

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
on conflict (slug) do nothing;

-- Every live venue gets a starting place on the shelves its tags imply. A
-- venue with no useful tags lands only in `tonight` if it is a restaurant, or
-- `chairs` if it is not, which is better than a directory where most of it
-- cannot be reached from the front page.
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
where c.member
on conflict (collection_slug, venue_id) do nothing;
