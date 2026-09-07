-- ---------------------------------------------------------------------------
-- reservAI — search
--
-- One generated tsvector rather than a pile of ILIKE clauses in the client.
--
-- The brief asks people to be able to search by name, cuisine, dish, hotel,
-- area, landmark, experience and occasion. Almost all of those already live in
-- `venues` — cuisine and occasion in `tags`, hotel in `parent_venue`, landmark
-- in `neighbourhood` and `has_view`. What was missing is a single column that
-- holds all of them in one searchable form.
--
-- Generated and stored, so it cannot drift from the row it describes: there is
-- no trigger to forget and no backfill to run again. Postgres recomputes it on
-- every write.
--
-- 'simple' rather than 'english' as the dictionary. English stemming would map
-- "dining" to "dine", which helps, but it also stems proper nouns and cuisine
-- words unpredictably, and this corpus is mostly names and places rather than
-- prose. Simple lexemes match what people type into a restaurant search.
-- ---------------------------------------------------------------------------

/**
 * `array_to_string` for text arrays, and immutable.
 *
 * The built-in is STABLE rather than IMMUTABLE because it must call the
 * element type's output function, and for an arbitrary type that need not be
 * immutable. A generated column requires IMMUTABLE, so the built-in cannot be
 * used in one.
 *
 * Narrowing the signature to `text[]` is what makes this honest rather than a
 * lie told to the planner: the output function for text is the identity, so
 * for this type the operation genuinely does depend on nothing but its
 * arguments. Written as `text[]` specifically so it cannot be reached with a
 * type where that stops being true.
 */
create or replace function public.text_array_to_string(arr text[])
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select coalesce(array_to_string(arr, ' '), '');
$$;

revoke execute on function public.text_array_to_string(text[]) from public, anon;
grant execute on function public.text_array_to_string(text[]) to authenticated, service_role;

alter table public.venues
  add column if not exists search_text tsvector
  generated always as (
    -- Cast to regconfig rather than passing the name as text. With a text
    -- argument the function is only STABLE, because the configuration could be
    -- looked up differently later, and a generated column requires IMMUTABLE.
    to_tsvector('simple'::regconfig,
      coalesce(name, '') || ' ' ||
      coalesce(neighbourhood, '') || ' ' ||
      coalesce(parent_venue, '') || ' ' ||
      coalesce(replace(zone, '_', ' '), '') || ' ' ||
      coalesce(vertical, '') || ' ' ||
      public.text_array_to_string(tags) || ' ' ||
      public.text_array_to_string(ambience) || ' ' ||
      public.text_array_to_string(dietary_options) || ' ' ||
      coalesce(has_view, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(house_note, '')
    )
  ) stored;

comment on column public.venues.search_text is
  'Everything searchable about a venue, in one lexeme set. Generated, so it '
  'cannot fall out of step with the row.';

create index if not exists venues_search_idx on public.venues using gin (search_text);

-- Filters the results page applies before anything else, so they get indexes
-- of their own rather than riding on a sequential scan of the whole table.
create index if not exists venues_vertical_zone_band_idx
  on public.venues (vertical, zone, price_band)
  where onboarding_status = 'live';

create index if not exists venues_outdoor_idx on public.venues (has_outdoor)
  where onboarding_status = 'live' and has_outdoor;

-- ---------------------------------------------------------------------------
-- The column has to be granted, not merely present.
--
-- Postgres requires SELECT privilege on a column in order to FILTER by it, not
-- only to return it — the same rule that broke the public directory when the
-- client filtered on a column anon could not read. A search that anonymous
-- visitors cannot run is not a public directory, so `search_text` is granted
-- alongside the rest.
-- ---------------------------------------------------------------------------

grant select (search_text) on public.venues to anon;
