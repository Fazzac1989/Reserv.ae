-- ---------------------------------------------------------------------------
-- reservAI — atomic booking transitions
--
-- The transition table lives in packages/core/src/booking/transitions.ts and
-- nowhere else. This function does not decide whether a move is legal; it is
-- given the target state the state machine already computed, and its only job
-- is to write the status change and its audit row in ONE transaction.
--
-- That single-transaction property is the whole point. Doing it as two
-- PostgREST calls would appear to work — the deferred trigger would find the
-- audit row from the first call — but a failed second call would leave an
-- events_log entry describing a transition that never happened. An audit trail
-- that lies is worse than no audit trail.
-- ---------------------------------------------------------------------------

create or replace function public.apply_booking_transition(
  p_booking_id uuid,
  p_from public.booking_state,
  p_to public.booking_state,
  p_event public.booking_event,
  p_actor public.actor,
  p_actor_id uuid default null,
  p_reason text default null,
  p_evidence jsonb default null,
  p_metadata jsonb default '{}'::jsonb,
  p_correlation_id text default null,
  p_external_ref text default null
)
returns public.booking_state
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  current_status public.booking_state;
begin
  -- Lock the row first: two rails reporting at once must not both believe they
  -- moved the booking from the same starting state.
  select status into current_status
    from public.bookings
   where id = p_booking_id
     for update;

  if current_status is null then
    raise exception 'No booking %', p_booking_id using errcode = 'no_data_found';
  end if;

  -- The caller computed `p_to` from a state it read earlier. If the booking has
  -- moved since, that computation is stale and must be redone.
  if current_status <> p_from then
    raise exception
      'Booking % is in state %, not % — the transition was computed against a stale read.',
      p_booking_id, current_status, p_from
      using errcode = 'serialization_failure';
  end if;

  insert into public.events_log (
    entity_type, entity_id, event, actor, actor_id,
    from_state, to_state, reason, payload, correlation_id
  )
  values (
    'booking', p_booking_id, p_event::text, p_actor, p_actor_id,
    p_from, p_to, p_reason,
    coalesce(p_metadata, '{}'::jsonb)
      || case when p_evidence is null then '{}'::jsonb
              else jsonb_build_object('evidence', p_evidence) end,
    p_correlation_id
  );

  update public.bookings
     set status = p_to,
         confirmed_at = case when p_to = 'confirmed' then now() else confirmed_at end,
         confirmation_evidence = coalesce(p_evidence, confirmation_evidence),
         cancelled_at = case when p_to = 'cancelled' then now() else cancelled_at end,
         cancellation_reason = case
           when p_to = 'cancelled' then coalesce(p_reason, cancellation_reason)
           else cancellation_reason
         end,
         external_ref = coalesce(p_external_ref, external_ref)
   where id = p_booking_id;

  return p_to;
end;
$$;

-- The agent service only. Bookings do not change from a browser or a device:
-- every move goes through the service layer that owns the transition table.
revoke execute on function public.apply_booking_transition(
  uuid, public.booking_state, public.booking_state, public.booking_event,
  public.actor, uuid, text, jsonb, jsonb, text, text
) from public, anon, authenticated;

grant execute on function public.apply_booking_transition(
  uuid, public.booking_state, public.booking_state, public.booking_event,
  public.actor, uuid, text, jsonb, jsonb, text, text
) to service_role;

comment on function public.apply_booking_transition is
  'Persists a status change and its audit row atomically. The legality of the move is decided in packages/core, not here.';
