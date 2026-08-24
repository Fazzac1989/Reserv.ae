-- ---------------------------------------------------------------------------
-- reservAI — table privileges
--
-- RLS decides *which rows* a caller may touch; GRANT decides whether it may
-- touch the table at all. Both are required, and the two work as a pair: the
-- grants below are deliberately no wider than the policies in the RLS
-- migration, so a missing policy fails closed rather than falling back to a
-- blanket table privilege.
--
-- `anon` receives nothing. There is no unauthenticated surface in reservAI —
-- not the venue directory, not anything.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated, service_role;

-- --- Profiles and roles -----------------------------------------------------

grant select, update on public.users to authenticated;
grant select, insert, update on public.user_preferences to authenticated;
-- Writes are still gated by the admin-only policy; the grant just permits the
-- attempt so the policy is what refuses it.
grant select, insert, update, delete on public.user_roles to authenticated;

-- --- Venue directory --------------------------------------------------------

grant select, insert, update, delete on public.venues to authenticated;
grant select, insert, update, delete on public.venue_contacts to authenticated;
grant select, insert, update, delete on public.venue_booking_channels to authenticated;
grant select, insert, update, delete on public.venue_policies to authenticated;

-- --- Conversations, requests, suggestions -----------------------------------

grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.requests to authenticated;
grant select, insert, update, delete on public.suggestions to authenticated;

-- --- Bookings ---------------------------------------------------------------
-- Note the shape: an end user has a SELECT policy and no write policy, so the
-- write grants here only ever resolve for ops. Bookings still change through
-- the service layer, which owns the transition table.

grant select, insert, update, delete on public.bookings to authenticated;
grant select, insert, update, delete on public.booking_attempts to authenticated;

-- --- Ops queue and audit ----------------------------------------------------

grant select, insert, update, delete on public.ops_tasks to authenticated;
-- SELECT only, and only for ops. The log is written by the service layer inside
-- the same transaction as the transition it records.
grant select on public.events_log to authenticated;

-- --- Service role -----------------------------------------------------------
-- Bypasses RLS. Every caller holding this key must do its own authorization
-- first; there is no second line of defence behind it.

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- Anything added by a later migration inherits the same shape.
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant all on functions to service_role;
