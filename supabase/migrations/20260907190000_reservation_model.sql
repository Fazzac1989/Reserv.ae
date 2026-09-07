-- ---------------------------------------------------------------------------
-- reservAI — the reservation model the booking sheet writes
--
-- `bookings` holds what a booking is. This adds what was *agreed* before it
-- was made: the window the person authorised us to work inside, the consent
-- they gave and to what wording, what we are waiting on them for, and the key
-- that stops a double tap becoming two tables.
--
-- Additive. Every column is nullable or defaulted.
-- ---------------------------------------------------------------------------

-- --- The window they authorised ---------------------------------------------
--
-- "8:00, and 7:30 to 8:30 is fine" is two different pieces of information, and
-- the second is what decides whether Reserv may accept an offer on its own or
-- has to come back and ask. Without it stored, every alternative is a
-- question — which is safe, and also means waking somebody at 19:50 to ask
-- about 20:15 when they already said that was fine.

alter table public.bookings
  add column if not exists earliest_acceptable timestamptz,
  add column if not exists latest_acceptable timestamptz;

comment on column public.bookings.earliest_acceptable is
  'Start of the window the user approved. Null means only the exact time will do.';

alter table public.bookings
  add constraint bookings_acceptable_pair
  check ((earliest_acceptable is null) = (latest_acceptable is null));

alter table public.bookings
  add constraint bookings_acceptable_order
  check (latest_acceptable is null or latest_acceptable >= earliest_acceptable);

-- The requested time has to sit inside the window, or the window is describing
-- some other booking.
alter table public.bookings
  add constraint bookings_acceptable_contains_scheduled
  check (
    earliest_acceptable is null
    or (scheduled_for >= earliest_acceptable and scheduled_for <= latest_acceptable)
  );

-- --- What they agreed to, and to which words --------------------------------

alter table public.bookings
  add column if not exists consent_version text,
  add column if not exists consent_at timestamptz,
  add column if not exists consent_shared jsonb;

comment on column public.bookings.consent_shared is
  'Exactly which fields the user authorised us to pass to the venue, as they '
  'were shown them. Stored per booking rather than read from the profile at '
  'send time, because the profile can change afterwards and this has to say '
  'what was agreed on the day.';

alter table public.bookings
  add constraint bookings_consent_pair
  check ((consent_version is null) = (consent_at is null));

alter table public.bookings
  add constraint bookings_consent_shared_object
  check (consent_shared is null or jsonb_typeof(consent_shared) = 'object');

-- There is deliberately NO constraint here yet requiring consent before a
-- booking may be worked, and the reason is worth writing down rather than
-- leaving as an absence.
--
-- It was written, as `status = 'draft' or consent_at is not null`, and it did
-- exactly what it said: it broke every existing path that creates a booking.
-- The agent service creates them from accepted suggestions and does not record
-- consent, because the screen that captures consent does not exist yet. A rule
-- the system cannot satisfy does not make the system safer — it stops it
-- working, and the constraint would have been dropped under pressure rather
-- than the callers fixed.
--
-- So the column lands first and the constraint follows in the migration that
-- accompanies the booking sheet, once every writer records consent. Until
-- then, `consent_at is null` on a worked booking means "made the old way",
-- which is true and visible, rather than impossible.

-- --- What we are waiting on them for ----------------------------------------

alter table public.bookings
  add column if not exists required_user_action text,
  add column if not exists offered_start timestamptz,
  add column if not exists offered_note text;

comment on column public.bookings.required_user_action is
  'What the person has to do before this can move: approve_alternative, '
  'approve_deposit, approve_terms. Null when the ball is not in their court.';

alter table public.bookings
  add constraint bookings_required_action_check
  check (
    required_user_action is null
    or required_user_action in ('approve_alternative', 'approve_deposit', 'approve_terms')
  );

-- An offer has to say what is being offered.
alter table public.bookings
  add constraint bookings_alternative_has_offer
  check (status <> 'alternative_offered' or offered_start is not null or offered_note is not null);

-- --- Idempotency ------------------------------------------------------------
--
-- A double tap, a retried request after a dropped connection, a webhook
-- delivered twice: all of them are the same booking arriving again, and all of
-- them would otherwise be a second table. The client sends a key it generated
-- once for the attempt; the unique index is what actually prevents it.

alter table public.bookings add column if not exists idempotency_key text;

create unique index if not exists bookings_idempotency_key_idx
  on public.bookings (user_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.bookings.idempotency_key is
  'Generated once by the client for one booking attempt and resent on retry. '
  'Scoped per user by the index, so two people cannot collide.';

-- --- The guest details given to the venue -----------------------------------

alter table public.bookings
  add column if not exists guest_phone_e164 text,
  add column if not exists accessibility_requests text,
  add column if not exists occasion text,
  add column if not exists seating_preference text;

alter table public.bookings
  add constraint bookings_guest_phone_check
  check (guest_phone_e164 is null or guest_phone_e164 ~ '^\+[1-9]\d{7,14}$');

alter table public.bookings
  add constraint bookings_seating_check
  check (seating_preference is null or seating_preference in ('indoor', 'outdoor', 'either'));

-- --- What the partner sees of all this --------------------------------------
--
-- The venue needs the seating preference and the occasion in order to seat
-- somebody properly, and the accessibility request because it changes which
-- table. It does not need the consent record, the approved window, or the
-- idempotency key — those are between the user and us.

drop view if exists public.venue_bookings;

create view public.venue_bookings as
  select
    b.id,
    b.venue_id,
    b.status,
    b.scheduled_for,
    b.party_size,
    coalesce(b.guest_name, 'Guest') as guest_name,
    b.special_requests,
    b.accessibility_requests,
    b.occasion,
    b.seating_preference,
    b.service_name,
    b.provider_name,
    b.confirmed_at,
    b.cancelled_at,
    b.no_show,
    b.external_ref,
    b.created_at
  from public.bookings b
  where (public.manages_venue(b.venue_id) or public.is_ops())
    and b.status <> 'draft';

comment on view public.venue_bookings is
  'What a venue sees of a booking. A definer view, so this WHERE clause is the '
  'only thing standing between one venue and another''s guest list — see the '
  'note in the back-office migration for why it is not a policy on `bookings`. '
  'Deliberately excludes the guest''s phone number: a venue that needs to '
  'reach somebody goes through Reserv, which is the entire proposition.';

grant select on public.venue_bookings to authenticated;
