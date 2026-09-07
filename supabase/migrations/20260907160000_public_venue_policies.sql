-- ---------------------------------------------------------------------------
-- reservAI — the terms, before you decide
--
-- `venue_policies` already carries a comment explaining why signed-in users
-- can read it: "Policies carry no personal or contact data, and users need
-- them to understand cancellation terms and party-size limits before
-- approving a booking."
--
-- That reasoning does not stop at the sign-in wall. A person deciding whether
-- to book needs to know the table is released after 24 hours' notice and that
-- a deposit is required, and making them create an account first in order to
-- find out is both worse for them and worse for us — it moves the bad news to
-- after the commitment rather than before it.
--
-- Not every column, though. `notes` is where ops writes what it thinks about a
-- venue, `blackout_windows` is operational scheduling, and the lead times are
-- how our own rails decide when to fire. The four granted below are the ones
-- that change a person's mind.
-- ---------------------------------------------------------------------------

create policy venue_policies_select_anon on public.venue_policies
  for select to anon
  using (
    exists (
      select 1 from public.venues v
      where v.id = venue_policies.venue_id and v.onboarding_status = 'live'
    )
  );

grant select (
  venue_id,
  min_party_size,
  max_party_size,
  cancellation_notice_hours,
  cancellation_terms,
  requires_deposit
) on public.venue_policies to anon;

-- The same assertion as the migrations before it, widened by one table. It has
-- caught something on two of the three occasions it has run, so it keeps
-- earning its place.
do $$
declare
  leaked text;
  allowed text[] := array['venues', 'categories', 'places', 'collections',
                          'collection_venues', 'venue_menus', 'venue_offers',
                          'venue_policies'];
begin
  select string_agg(distinct entry, ', ')
    into leaked
    from (
      select table_name || ' (' || privilege_type || ')' as entry, table_name
        from information_schema.role_table_grants
       where grantee = 'anon' and table_schema = 'public'
      union all
      select table_name || '.' || column_name || ' (' || privilege_type || ')', table_name
        from information_schema.role_column_grants
       where grantee = 'anon' and table_schema = 'public'
    ) held
   where not (table_name = any (allowed) and entry like '%(SELECT)');

  if leaked is not null then
    raise exception
      'anon holds % — the public surface is the directory and nothing else.', leaked
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;
