-- ---------------------------------------------------------------------------
-- reservAI — ops-facing event recording
--
-- `events_log` is SELECT-only for authenticated callers so the audit trail
-- cannot be forged from a browser. The venue CRM still needs to record what ops
-- did — who moved a venue to `live`, who changed a channel priority — so this
-- gives them one narrow, SECURITY DEFINER door.
--
-- It deliberately refuses `entity_type = 'booking'`. Booking transitions are
-- written by the service layer alongside the status change, and the deferred
-- trigger on `bookings` treats the presence of a matching events_log row as
-- proof the transition happened legally. If ops could insert those rows by
-- hand, that proof would be forgeable and principle 2 would be decorative.
-- ---------------------------------------------------------------------------

create or replace function public.record_ops_event(
  p_entity_type text,
  p_entity_id uuid,
  p_event text,
  p_reason text default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  new_id uuid;
begin
  if not public.is_ops() then
    raise exception 'Only ops may record events.' using errcode = 'insufficient_privilege';
  end if;

  if p_entity_type = 'booking' then
    raise exception
      'Booking events are written by the service layer alongside the transition, not from the console.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload must be a JSON object.' using errcode = 'check_violation';
  end if;

  insert into public.events_log (entity_type, entity_id, event, actor, actor_id, reason, payload)
  values (p_entity_type, p_entity_id, p_event, 'ops', auth.uid(), p_reason, p_payload)
  returning id into new_id;

  return new_id;
end;
$$;

revoke execute on function public.record_ops_event(text, uuid, text, text, jsonb) from public, anon;
grant execute on function public.record_ops_event(text, uuid, text, text, jsonb)
  to authenticated, service_role;

comment on function public.record_ops_event is
  'Append an audit entry for a non-booking entity. Ops only. Booking transitions go through the service layer.';
