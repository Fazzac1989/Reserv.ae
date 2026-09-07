-- ---------------------------------------------------------------------------
-- reservAI — the venue back office
--
-- Until now there was one kind of privileged account: ops, which can see
-- everything. This adds a second, much narrower one: a person who works at a
-- venue, who may manage that venue's own listing and see that venue's own
-- bookings, and who must not be able to see anything else in the system.
--
-- The distinction this file introduces is between a venue that is LISTED and
-- one that is CLAIMED. Anyone can be listed — a listing is factual information
-- about a business. A venue is claimed when a real person from it holds a
-- login, and only then does anyone outside ops get to edit the record or read
-- its bookings. `venue_members` is the whole of that claim; there is no other
-- way to obtain venue access, and no email-domain shortcut.
--
-- Everything here is ADDITIVE to the existing policies. No `is_ops()` policy is
-- weakened, replaced or dropped. Permissive policies OR together, so a venue
-- member gains exactly the rows named below and nothing else.
-- ---------------------------------------------------------------------------

-- The `venue` actor this file writes to `events_log` is added by the migration
-- immediately before this one, because Postgres will not accept a new enum
-- value and a use of it in the same transaction.

-- --- Membership -------------------------------------------------------------

create type public.venue_member_role as enum ('owner', 'manager', 'staff');

comment on type public.venue_member_role is
  'Rank within one venue. Today all three can read and edit; the distinction '
  'exists so that owner-invites-staff can be switched on without a migration.';

create table public.venue_members (
  venue_id uuid not null references public.venues (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role public.venue_member_role not null default 'manager',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (venue_id, user_id)
);

comment on table public.venue_members is
  'Who may act for a venue. A row here is what "claimed" means.';

create index venue_members_user_idx on public.venue_members (user_id);

create trigger venue_members_set_updated_at
  before update on public.venue_members
  for each row execute function public.set_updated_at();

-- SECURITY DEFINER for the same reason `is_ops()` is: policies on other tables
-- call it, and it must not recurse into venue_members'' own policies.
create or replace function public.manages_venue(target_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.venue_members m
    where m.venue_id = target_venue_id
      and m.user_id = auth.uid()
  );
$$;

comment on function public.manages_venue is
  'True when the caller is a member of that venue. Used by every partner policy.';

create or replace function public.my_venue_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select m.venue_id from public.venue_members m where m.user_id = auth.uid();
$$;

comment on function public.my_venue_ids is
  'Every venue the caller may act for. Empty for ops staff and for end users.';

-- --- Invitations ------------------------------------------------------------
--
-- An invitation carries no token. Sign-in is already a six-digit code sent to
-- an email address, so possession of that address is proven by the auth flow
-- itself; a second bearer secret sitting in an inbox indefinitely would widen
-- the attack surface without narrowing anything. The invite is therefore a
-- statement that "whoever proves control of this address may manage this
-- venue", and it expires.

create table public.venue_invites (
  id uuid primary key default extensions.gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  email text not null,
  role public.venue_member_role not null default 'manager',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  constraint venue_invites_email_check check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint venue_invites_accepted_pair check ((accepted_at is null) = (accepted_by is null))
);

comment on table public.venue_invites is
  'Pending back-office access. Redeemed on the invitee''s first sign-in.';

-- One live invitation per address per venue. A redeemed or revoked one may be
-- superseded, which is what lets ops re-invite someone who lost access.
create unique index venue_invites_pending_idx
  on public.venue_invites (venue_id, lower(email))
  where accepted_at is null and revoked_at is null;

create index venue_invites_email_idx on public.venue_invites (lower(email))
  where accepted_at is null and revoked_at is null;

/**
 * Turn every valid invitation for the caller's own email address into
 * membership. Called once after sign-in.
 *
 * SECURITY DEFINER because the invitee is, by definition, not yet a member of
 * anything, so no policy would let them read the invitation that is about to
 * grant them access. The function is careful to read the address from the JWT
 * rather than from an argument — a caller cannot ask to redeem somebody else's
 * invitation, because they cannot name one.
 */
create or replace function public.redeem_venue_invites()
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
  redeemed integer := 0;
  invite record;
begin
  if caller_id is null then
    raise exception 'Sign in first.' using errcode = 'insufficient_privilege';
  end if;

  select lower(email) into caller_email from auth.users where id = caller_id;

  if caller_email is null then
    return 0;
  end if;

  for invite in
    select * from public.venue_invites
    where lower(email) = caller_email
      and accepted_at is null
      and revoked_at is null
      and expires_at > now()
    for update
  loop
    insert into public.venue_members (venue_id, user_id, role, invited_by)
    values (invite.venue_id, caller_id, invite.role, invite.invited_by)
    on conflict (venue_id, user_id) do nothing;

    update public.venue_invites
       set accepted_at = now(), accepted_by = caller_id
     where id = invite.id;

    insert into public.events_log (entity_type, entity_id, event, actor, actor_id, payload)
    values ('venue_member', invite.venue_id, 'venue_access_granted', 'venue', caller_id,
            jsonb_build_object('role', invite.role, 'invite_id', invite.id));

    redeemed := redeemed + 1;
  end loop;

  return redeemed;
end;
$$;

revoke execute on function public.redeem_venue_invites() from public, anon;
grant execute on function public.redeem_venue_invites() to authenticated, service_role;

comment on function public.redeem_venue_invites is
  'Redeem any invitation matching the signed-in address. Returns how many.';

-- --- The name the venue is given -------------------------------------------
--
-- A restaurant needs a name to put in its book, and it is the one piece of the
-- guest's identity we pass on. Stored on the booking rather than read from the
-- profile at display time: it is what was said to this venue on this occasion,
-- it must not change retroactively when somebody edits their profile, and
-- keeping it here means the partner console never needs read access to
-- `users` at all.

alter table public.bookings add column guest_name text;

comment on column public.bookings.guest_name is
  'The name given to the venue for this booking. The only guest detail a '
  'partner sees — deliberately not the email or the phone number.';

-- --- What a member may read -------------------------------------------------

-- Their own venue, at any onboarding status. A partner setting up a listing
-- that is not live yet still has to be able to see it.
create policy venues_select_member on public.venues
  for select to authenticated
  using (public.manages_venue(id));

create policy venues_update_member on public.venues
  for update to authenticated
  using (public.manages_venue(id))
  with check (public.manages_venue(id));

-- The contact details a venue gave us are that venue's own data. Its members
-- may see and correct them; nobody else outside ops ever sees them.
create policy venue_contacts_member on public.venue_contacts
  for all to authenticated
  using (public.manages_venue(venue_id))
  with check (public.manages_venue(venue_id));

create policy venue_policies_member on public.venue_policies
  for all to authenticated
  using (public.manages_venue(venue_id))
  with check (public.manages_venue(venue_id));

-- Booking channels stay ops-only even for members. They encode how our rails
-- reach the venue, and a member editing one could redirect our booking traffic.
-- Changing a channel is a support conversation, not a form.

-- Note what is deliberately absent: there is NO policy granting a venue member
-- access to `public.bookings`. A partner reads bookings only through the
-- `venue_bookings` view below, and the reason is written out there.
--
-- Read-only either way for now. A venue confirming its own booking is worth
-- more than anything else in this file, but it is a booking state transition
-- and belongs in the state machine rather than in an RLS policy. See the
-- `venue` actor, which exists here and deliberately has no edges yet.

create policy venue_members_select_own on public.venue_members
  for select to authenticated
  using (public.manages_venue(venue_id) or public.is_ops());

create policy venue_members_ops_write on public.venue_members
  for all to authenticated
  using (public.is_ops())
  with check (public.is_ops());

create policy venue_invites_ops on public.venue_invites
  for all to authenticated
  using (public.is_ops())
  with check (public.is_ops());

-- A member may see the pending invitations for their own venue, so an owner
-- can tell who else has been asked. They cannot create or revoke them yet.
create policy venue_invites_select_member on public.venue_invites
  for select to authenticated
  using (public.manages_venue(venue_id));

alter table public.venue_members enable row level security;
alter table public.venue_invites enable row level security;

-- --- What a member may NOT change -------------------------------------------
--
-- RLS is row-level; these are columns. A member gets UPDATE on their venue row
-- above, and this trigger is what stops that becoming a way to edit the things
-- the platform is responsible for.
--
-- The split is: the venue owns how it describes itself, we own how it is
-- classified and whether it is live.
--
--   theirs — description, tags, opening_hours, best_times, photo_urls,
--            address, lat, lng
--   ours   — name, vertical, zone, price_band, house_note, onboarding_status,
--            booking_consent_obtained_at, is_demo
--
-- `house_note` is our editorial line and the Curator may quote it, so it is not
-- the venue's to write. `name`, `zone` and `price_band` decide whether a venue
-- appears in a given search, which makes them ranking inputs and therefore
-- ours. `booking_consent_obtained_at` is the record that a venue agreed we may
-- book on its behalf; a venue granting itself that would defeat the point of
-- recording it.

create or replace function public.guard_venue_member_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  changed text[] := '{}';
begin
  -- Ops and the service role keep the run of the table.
  if public.is_ops() or auth.uid() is null then
    return new;
  end if;

  if new.name is distinct from old.name then changed := array_append(changed, 'name'); end if;
  if new.vertical is distinct from old.vertical then changed := array_append(changed, 'vertical'); end if;
  if new.zone is distinct from old.zone then changed := array_append(changed, 'zone'); end if;
  if new.price_band is distinct from old.price_band then changed := array_append(changed, 'price_band'); end if;
  if new.house_note is distinct from old.house_note then changed := array_append(changed, 'house_note'); end if;
  if new.onboarding_status is distinct from old.onboarding_status
    then changed := array_append(changed, 'onboarding_status'); end if;
  if new.booking_consent_obtained_at is distinct from old.booking_consent_obtained_at
    then changed := array_append(changed, 'booking_consent_obtained_at'); end if;
  if new.is_demo is distinct from old.is_demo then changed := array_append(changed, 'is_demo'); end if;

  if array_length(changed, 1) is not null then
    raise exception
      'A venue may not change %. Ask Reserv to change it.', array_to_string(changed, ', ')
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger venues_guard_member_columns
  before update on public.venues
  for each row execute function public.guard_venue_member_columns();

comment on function public.guard_venue_member_columns is
  'Column-level protection for the venue row, which RLS cannot express.';

-- --- The partner''s view of its bookings ------------------------------------
--
-- The column list is the point of this view: what a restaurant needs in order
-- to seat somebody, and nothing more. No user_id, no email, no phone number,
-- no taste profile, no rating, no internal state history.
--
-- It is a SECURITY DEFINER view — the default — and that is load-bearing.
--
-- The obvious construction is `security_invoker = true` plus an RLS policy
-- letting a member select their venue's rows from `bookings`. That was the
-- first attempt and it is wrong, because security_invoker means the reader
-- needs privileges on the underlying table, and a reader with privileges on
-- the table can simply query the table. The narrow column list then protects
-- nobody: `GET /venue_bookings` returns thirteen columns and `GET /bookings`
-- returns all of them, to the same person, with the same token. An end-to-end
-- test asking PostgREST directly is what caught it; the console's own UI
-- looked perfectly correct throughout, because the UI was never the thing
-- keeping anyone out.
--
-- So: no policy on `bookings` for members at all, and the scope lives in this
-- view's WHERE clause instead. A definer view bypasses RLS on `bookings`,
-- which means this predicate is the only thing standing between one venue and
-- another's guest list. It is one line, it is here, and partner-e2e.mjs
-- attacks it directly rather than trusting it.

create view public.venue_bookings as
  select
    b.id,
    b.venue_id,
    b.status,
    b.scheduled_for,
    b.party_size,
    coalesce(b.guest_name, 'Guest') as guest_name,
    b.special_requests,
    b.service_name,
    b.provider_name,
    b.confirmed_at,
    b.cancelled_at,
    b.no_show,
    b.external_ref,
    b.created_at
  from public.bookings b
  where (public.manages_venue(b.venue_id) or public.is_ops())
    -- A draft is a suggestion the user has not approved. Nothing has been
    -- asked of the venue, and it may never be. Showing it would tell a
    -- restaurant that somebody is considering them, which is the user's
    -- business rather than theirs, and would fill the book with tables that
    -- were never requested.
    and b.status <> 'draft';

comment on view public.venue_bookings is
  'What a venue sees of a booking. Deliberately excludes every way to contact '
  'the guest directly.';

-- --- Grants -----------------------------------------------------------------

grant select, insert, update, delete on public.venue_members to authenticated;
grant select, insert, update, delete on public.venue_invites to authenticated;
grant select on public.venue_bookings to authenticated;
