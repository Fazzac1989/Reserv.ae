-- ---------------------------------------------------------------------------
-- reservAI — a venue as an actor in the audit log
--
-- In its own migration because Postgres will not let a new enum value be added
-- and then used inside the same transaction, and the back-office migration
-- that follows writes `venue` events on the first line it runs.
--
-- Note what this value does NOT get: no edge in the booking state machine
-- names `venue`, so a venue member cannot move a booking at all. That is the
-- correct starting position. A venue confirming its own booking is the single
-- most valuable thing the partner console could eventually do — it turns the
-- rail from "we chase them" into "they press a button" — but it is a state
-- transition and belongs in the transition table, designed deliberately,
-- rather than arrived at by widening an enum.
-- ---------------------------------------------------------------------------

alter type public.actor add value if not exists 'venue';
