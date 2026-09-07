-- ---------------------------------------------------------------------------
-- reservAI — two states the lifecycle was missing
--
-- Its own migration because Postgres will not accept a new enum value and a
-- use of it in the same transaction, and the migration after this one writes
-- constraints that name them.
--
-- `alternative_offered` — the venue cannot do the time asked for and has
-- proposed another. It is a state rather than a flag on `pending_venue`
-- because what the system may do next changes completely: the venue owes us
-- nothing more, the SLA clock stops, and the only move belongs to the person.
-- It is also the moment the product exists for. A booking sitting in
-- `pending_venue` while an offer goes unmentioned is the app holding on to the
-- one message its owner needed.
--
-- `cancellation_requested` — the person has asked to cancel a table the venue
-- is still holding, and the venue has not been told. Until it has, the booking
-- is not cancelled. Saying otherwise is the same lie as a confirmation without
-- evidence, pointed the other way, and it ends with a table held empty at
-- eight o'clock.
-- ---------------------------------------------------------------------------

alter type public.booking_state add value if not exists 'alternative_offered' after 'pending_venue';
alter type public.booking_state add value if not exists 'cancellation_requested' after 'confirmed';

alter type public.booking_event add value if not exists 'offer_alternative';
alter type public.booking_event add value if not exists 'accept_alternative';
alter type public.booking_event add value if not exists 'decline_alternative';
alter type public.booking_event add value if not exists 'request_cancellation';
