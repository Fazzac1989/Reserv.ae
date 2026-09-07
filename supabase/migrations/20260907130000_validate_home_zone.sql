-- ---------------------------------------------------------------------------
-- reservAI — validate home_zone and work_zone, as preferred_zones already is
--
-- When `zone` stopped being an enum and became a row in `places`, the array
-- column got a hand-written trigger to replace the foreign key it could no
-- longer have. The two scalar columns beside it got nothing, and they are
-- plain `text` — so `home_zone = 'downtown'` has been accepted ever since.
--
-- Nothing rejects it later either. It is read on almost every request, as the
-- default place to look when somebody does not say where they are, and an
-- unknown value there does not raise anything: it quietly matches no venue,
-- and the answer is "nothing near you" for a user who lives in the middle of
-- Dubai Marina.
--
-- onboarding-e2e.mjs has been asserting this was refused since before the enum
-- was dropped. The assertion was right and the schema was wrong.
-- ---------------------------------------------------------------------------

create or replace function public.assert_places_exist()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  unknown_slug text;
begin
  select z into unknown_slug
  from unnest(new.preferred_zones) as z
  where not exists (select 1 from public.places where slug = z)
  limit 1;

  if unknown_slug is not null then
    raise exception 'No such place: %', unknown_slug using errcode = 'foreign_key_violation';
  end if;

  -- The scalar pair, held to the same standard. Null is allowed — not knowing
  -- where somebody lives is a normal state and a different one from believing
  -- they live somewhere that does not exist.
  if new.home_zone is not null
     and not exists (select 1 from public.places where slug = new.home_zone) then
    raise exception 'No such place: %', new.home_zone using errcode = 'foreign_key_violation';
  end if;

  if new.work_zone is not null
     and not exists (select 1 from public.places where slug = new.work_zone) then
    raise exception 'No such place: %', new.work_zone using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

-- The old trigger fired only when `preferred_zones` was among the columns
-- being written, so an update touching only `home_zone` skipped it entirely.
drop trigger if exists user_preferences_places_exist on public.user_preferences;

create trigger user_preferences_places_exist
  before insert or update of preferred_zones, home_zone, work_zone
  on public.user_preferences
  for each row execute function public.assert_places_exist();

-- Anything already stored that does not name a real place is cleared rather
-- than left to fail on the next write. There is no correct value to guess.
update public.user_preferences
   set home_zone = null
 where home_zone is not null
   and not exists (select 1 from public.places where slug = home_zone);

update public.user_preferences
   set work_zone = null
 where work_zone is not null
   and not exists (select 1 from public.places where slug = work_zone);
