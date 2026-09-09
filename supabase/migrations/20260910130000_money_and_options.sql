-- ---------------------------------------------------------------------------
-- reservAI — money in fils, and where a number came from
--
-- Two things land together because one is useless without the other.
--
-- Amounts become integer fils. `venues.avg_spend_aed` stays exactly where it
-- is — it is a rough band for ranking and nobody pays it — but anything a
-- person is asked to agree to is counted in whole fils. A hundredth of a
-- dirham is not a rounding detail on a deposit; it is the difference between a
-- ledger that reconciles and one somebody balances by hand.
--
-- And every amount carries its provenance. "AED 760" is not a fact on its own.
-- It matters enormously whether that came off a published menu, out of a
-- venue's mouth this morning, or from our own guess, and the screen that shows
-- it has to be able to say which. A column holding only the number cannot.
-- ---------------------------------------------------------------------------

create type public.price_source as enum ('estimate', 'menu', 'venue_quote', 'platform');

comment on type public.price_source is
  'Weakest to strongest. A total takes the weakest source among its parts, '
  'because a total is only as trustworthy as the softest number in it.';

-- --- What an option costs ---------------------------------------------------
--
-- `suggestions` is already the options table: ranked, with a rationale, a
-- proposed time, whether that slot was actually verified, and the distance.
-- What it has never had is a price, which is why Compare could not be built
-- honestly before now.

alter table public.suggestions
  add column if not exists price_fils integer,
  add column if not exists price_source public.price_source,
  add column if not exists price_checked_at timestamptz,
  add column if not exists deposit_fils integer,
  add column if not exists travel_minutes integer;

comment on column public.suggestions.price_fils is
  'Estimated total for the party, in fils. Null means we genuinely do not '
  'know, which the UI must say rather than showing a zero.';

comment on column public.suggestions.deposit_fils is
  'Part of the total, never an addition to it. A deposit rendered as an extra '
  'shows somebody a bill larger than the one they agreed to.';

comment on column public.suggestions.travel_minutes is
  'Assumed travel to this venue from the previous item or the user''s area. '
  'An assumption, and labelled as one — we do not read traffic.';

-- A price has to say where it came from, or it is a number with no standing.
alter table public.suggestions
  add constraint suggestions_price_has_source
  check (price_fils is null or price_source is not null);

alter table public.suggestions
  add constraint suggestions_price_non_negative
  check (price_fils is null or price_fils >= 0);

alter table public.suggestions
  add constraint suggestions_deposit_within_price
  check (
    deposit_fils is null
    or (price_fils is not null and deposit_fils >= 0 and deposit_fils <= price_fils)
  );

comment on constraint suggestions_deposit_within_price on public.suggestions is
  'A deposit cannot exceed the total it is part of, and cannot exist without '
  'one. Both would produce a balance the arithmetic cannot explain.';

-- Anything not an estimate should say when it was last checked, so the UI can
-- show its age rather than implying it is current.
alter table public.suggestions
  add constraint suggestions_quoted_price_is_dated
  check (price_source is null or price_source = 'estimate' or price_checked_at is not null);

-- --- What a booking actually agreed to --------------------------------------
--
-- The same three columns on `bookings`, because the number that was approved
-- has to survive independently of the option it came from. A suggestion can be
-- re-ranked or superseded; what somebody agreed to pay cannot change under
-- them.

alter table public.bookings
  add column if not exists price_fils integer,
  add column if not exists price_source public.price_source,
  add column if not exists price_checked_at timestamptz,
  add column if not exists deposit_fils integer;

alter table public.bookings
  add constraint bookings_price_has_source
  check (price_fils is null or price_source is not null);

alter table public.bookings
  add constraint bookings_deposit_within_price
  check (
    deposit_fils is null
    or (price_fils is not null and deposit_fils >= 0 and deposit_fils <= price_fils)
  );

-- --- Availability, as something with a time on it ---------------------------
--
-- `slot_is_verified` is a boolean and a boolean cannot answer "when". The
-- brief asks the interface to distinguish "Availability checked at 14:20" from
-- "Awaiting supplier", and those differ only by a timestamp.
--
-- The boolean stays: it is read in several places and is still the right
-- question for "may we present this as a real slot". This adds the answer to
-- the second question next to it.

alter table public.suggestions
  add column if not exists availability_checked_at timestamptz;

comment on column public.suggestions.availability_checked_at is
  'When a rail last asked the venue about this slot. Null means never — which '
  'is the normal case today, since no venue has a reservation API connected, '
  'and the UI says "available on request" rather than implying otherwise.';

alter table public.suggestions
  add constraint suggestions_verified_slot_is_dated
  check (slot_is_verified = false or availability_checked_at is not null);

comment on constraint suggestions_verified_slot_is_dated on public.suggestions is
  'A slot cannot be verified without a time at which it was verified. '
  '"Checked" with no "when" is the same claim as "checked" with no check.';
