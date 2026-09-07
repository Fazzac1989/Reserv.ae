-- ---------------------------------------------------------------------------
-- reservAI — email as a booking channel
--
-- The rails were api, whatsapp, voice and manual. The brief asks for email as
-- the fallback between WhatsApp and a human, and it is the right one: a great
-- many restaurants that will never install a booking platform and never answer
-- a WhatsApp from a number they do not know will answer reservations@.
--
-- Its own migration, because Postgres will not accept a new enum value and a
-- use of it in the same transaction.
--
-- `manual` stays exactly what it was: not a channel at all, but the admission
-- that no channel worked and a person has to pick up the phone. Email sits
-- above it in priority, which is the whole point of adding it — every venue
-- that answers an email is a venue that no longer reaches the manual queue.
-- ---------------------------------------------------------------------------

alter type public.rail_kind add value if not exists 'email' after 'whatsapp';
