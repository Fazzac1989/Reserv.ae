-- ---------------------------------------------------------------------------
-- reservAI — grants for the pricing tables
--
-- The policies were there but the table grants were not, so every read came
-- back as a permission error. The route ignored that error and reported "not
-- asked yet", which would have meant asking the same person the same survey
-- question after every booking, forever.
--
-- The lesson is in the route as much as the grant: a swallowed error reads
-- exactly like an empty result.
-- ---------------------------------------------------------------------------

grant select, insert on public.pricing_signals to authenticated;
grant select on public.subscriptions to authenticated;
