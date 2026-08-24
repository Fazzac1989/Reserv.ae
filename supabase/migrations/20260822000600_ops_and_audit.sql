-- ---------------------------------------------------------------------------
-- reservAI — ops queue and the append-only audit trail
-- ---------------------------------------------------------------------------

create table public.ops_tasks (
  id uuid primary key default extensions.gen_random_uuid(),
  kind public.ops_task_kind not null,
  status public.ops_task_status not null default 'open',
  -- 1 = drop everything. Driven by how close the booking time is.
  priority smallint not null default 3,
  booking_id uuid references public.bookings (id) on delete cascade,
  booking_attempt_id uuid references public.booking_attempts (id) on delete set null,
  venue_id uuid references public.venues (id) on delete set null,
  user_id uuid references public.users (id) on delete set null,
  title text not null,
  detail text,
  assigned_to uuid references auth.users (id) on delete set null,
  due_at timestamptz,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ops_tasks_priority_check check (priority between 1 and 5),
  constraint ops_tasks_title_check check (char_length(title) between 1 and 200),
  constraint ops_tasks_resolved_check check (
    (status in ('resolved', 'dismissed')) = (resolved_at is not null)
  )
);

comment on table public.ops_tasks is
  'Human escalation queue. Human-in-the-loop is a feature, so this is a first-class table.';

create index ops_tasks_open_idx on public.ops_tasks (priority, created_at)
  where status in ('open', 'in_progress');
create index ops_tasks_booking_idx on public.ops_tasks (booking_id);
create index ops_tasks_assigned_idx on public.ops_tasks (assigned_to)
  where status in ('open', 'in_progress');

create trigger ops_tasks_set_updated_at
  before update on public.ops_tasks
  for each row execute function public.set_updated_at();

-- --- Audit trail ------------------------------------------------------------

create table public.events_log (
  id uuid primary key default extensions.gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  event text not null,
  actor public.actor not null,
  actor_id uuid references auth.users (id) on delete set null,
  from_state public.booking_state,
  to_state public.booking_state,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  -- Ties an event to the job or conversation that caused it.
  correlation_id text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint events_log_entity_type_check check (char_length(entity_type) between 1 and 60),
  constraint events_log_payload_check check (jsonb_typeof(payload) = 'object')
);

comment on table public.events_log is
  'Append-only audit trail. UPDATE and DELETE are blocked by trigger.';

create index events_log_entity_idx on public.events_log (entity_type, entity_id, occurred_at desc);
create index events_log_correlation_idx on public.events_log (correlation_id)
  where correlation_id is not null;
create index events_log_occurred_idx on public.events_log (occurred_at desc);

create trigger events_log_no_update
  before update on public.events_log
  for each row execute function public.forbid_mutation();

create trigger events_log_no_delete
  before delete on public.events_log
  for each row execute function public.forbid_mutation();

-- --- Every transition is audited --------------------------------------------
-- A deferred constraint trigger: at commit time, a booking whose status moved
-- must have a matching events_log row. This makes "the state machine writes to
-- events_log" a property of the database rather than a convention callers are
-- trusted to follow.

create or replace function public.check_booking_transition_logged()
returns trigger
language plpgsql
as $$
begin
  if old.status = new.status then
    return null;
  end if;

  if not exists (
    select 1
    from public.events_log e
    where e.entity_type = 'booking'
      and e.entity_id = new.id
      and e.from_state = old.status
      and e.to_state = new.status
  ) then
    raise exception
      'Booking % moved from % to % without an events_log entry. Write the transition and the audit record in one transaction.',
      new.id, old.status, new.status
      using errcode = 'restrict_violation';
  end if;

  return null;
end;
$$;

create constraint trigger bookings_transition_must_be_logged
  after update on public.bookings
  deferrable initially deferred
  for each row execute function public.check_booking_transition_logged();
