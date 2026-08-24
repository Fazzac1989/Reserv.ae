-- ---------------------------------------------------------------------------
-- reservAI — row level security
--
-- Two shapes of access:
--   * a user sees their own data, and the parts of the venue directory that are
--     safe to show;
--   * ops sees everything.
--
-- Nothing here lets an end user read venue contact details or the transcripts
-- of our conversations with venues. Booking mutations are deliberately absent
-- too: bookings change only through the service layer, which owns the state
-- machine. The service role bypasses RLS, so that path is unaffected.
--
-- auth.uid() is wrapped in a scalar subquery throughout so Postgres evaluates
-- it once per statement rather than once per row.
-- ---------------------------------------------------------------------------

alter table public.user_roles enable row level security;
alter table public.users enable row level security;
alter table public.user_preferences enable row level security;
alter table public.venues enable row level security;
alter table public.venue_contacts enable row level security;
alter table public.venue_booking_channels enable row level security;
alter table public.venue_policies enable row level security;
alter table public.conversations enable row level security;
alter table public.requests enable row level security;
alter table public.suggestions enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_attempts enable row level security;
alter table public.ops_tasks enable row level security;
alter table public.events_log enable row level security;

-- --- Roles ------------------------------------------------------------------

create policy user_roles_select_own on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_ops());

-- Granting a role is an admin action. Everyone else goes through support.
create policy user_roles_admin_write on public.user_roles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- --- Profiles ---------------------------------------------------------------

create policy users_select_own on public.users
  for select to authenticated
  using (id = (select auth.uid()) or public.is_ops());

create policy users_update_own on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy users_ops_update on public.users
  for update to authenticated
  using (public.is_ops())
  with check (public.is_ops());

create policy user_preferences_select_own on public.user_preferences
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_ops());

create policy user_preferences_upsert_own on public.user_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy user_preferences_update_own on public.user_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- --- Venue directory --------------------------------------------------------
-- Users see live venues only, and only the descriptive columns; contact details
-- live in separate tables that no user policy covers.

create policy venues_select_live on public.venues
  for select to authenticated
  using (onboarding_status = 'live' or public.is_ops());

create policy venues_ops_write on public.venues
  for all to authenticated
  using (public.is_ops())
  with check (public.is_ops());

-- Contact details: ops only. This is the data venues trusted us with.
create policy venue_contacts_ops_only on public.venue_contacts
  for all to authenticated
  using (public.is_ops())
  with check (public.is_ops());

create policy venue_booking_channels_ops_only on public.venue_booking_channels
  for all to authenticated
  using (public.is_ops())
  with check (public.is_ops());

-- Policies carry no personal or contact data, and users need them to understand
-- cancellation terms and party-size limits before approving a booking.
create policy venue_policies_select on public.venue_policies
  for select to authenticated
  using (
    public.is_ops()
    or exists (
      select 1 from public.venues v
      where v.id = venue_policies.venue_id and v.onboarding_status = 'live'
    )
  );

create policy venue_policies_ops_write on public.venue_policies
  for all to authenticated
  using (public.is_ops())
  with check (public.is_ops());

-- --- Conversations and requests ---------------------------------------------

create policy conversations_own on public.conversations
  for all to authenticated
  using (user_id = (select auth.uid()) or public.is_ops())
  with check (user_id = (select auth.uid()));

create policy requests_select_own on public.requests
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_ops());

create policy requests_insert_own on public.requests
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy requests_update_own on public.requests
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy requests_ops_write on public.requests
  for all to authenticated
  using (public.is_ops())
  with check (public.is_ops());

create policy suggestions_select_own on public.suggestions
  for select to authenticated
  using (
    public.is_ops()
    or exists (
      select 1 from public.requests r
      where r.id = suggestions.request_id and r.user_id = (select auth.uid())
    )
  );

create policy suggestions_ops_write on public.suggestions
  for all to authenticated
  using (public.is_ops())
  with check (public.is_ops());

-- --- Bookings ---------------------------------------------------------------
-- Read-only for users on purpose. Approving, cancelling and modifying all go
-- through the agent service so every change passes the transition table and
-- lands in events_log.

create policy bookings_select_own on public.bookings
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_ops());

create policy bookings_ops_write on public.bookings
  for all to authenticated
  using (public.is_ops())
  with check (public.is_ops());

-- Attempts contain venue transcripts and recordings. Ops only.
create policy booking_attempts_ops_only on public.booking_attempts
  for all to authenticated
  using (public.is_ops())
  with check (public.is_ops());

-- --- Ops queue and audit ----------------------------------------------------

create policy ops_tasks_ops_only on public.ops_tasks
  for all to authenticated
  using (public.is_ops())
  with check (public.is_ops());

-- Read-only even for ops: the log is written by the service layer inside the
-- same transaction as the transition it records.
create policy events_log_ops_select on public.events_log
  for select to authenticated
  using (public.is_ops());

-- --- Storage ----------------------------------------------------------------
-- Private buckets for the audit media. Signed URLs are minted server-side.

insert into storage.buckets (id, name, public)
values
  ('venue-media', 'venue-media', false),
  ('attempt-media', 'attempt-media', false),
  ('voice-notes', 'voice-notes', false)
on conflict (id) do nothing;

create policy storage_venue_media_ops on storage.objects
  for all to authenticated
  using (bucket_id = 'venue-media' and public.is_ops())
  with check (bucket_id = 'venue-media' and public.is_ops());

-- Call recordings and WhatsApp threads with venues.
create policy storage_attempt_media_ops on storage.objects
  for all to authenticated
  using (bucket_id = 'attempt-media' and public.is_ops())
  with check (bucket_id = 'attempt-media' and public.is_ops());

-- A user's own voice notes, filed under their user id.
create policy storage_voice_notes_own on storage.objects
  for all to authenticated
  using (
    bucket_id = 'voice-notes'
    and (public.is_ops() or (storage.foldername(name))[1] = (select auth.uid())::text)
  )
  with check (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
