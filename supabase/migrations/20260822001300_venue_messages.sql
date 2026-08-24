-- ---------------------------------------------------------------------------
-- reservAI — the venue-facing message thread
--
-- Every word exchanged with a venue, in both directions, with what we drafted,
-- who approved it, what was actually sent, and how confidently we read the
-- reply. Principle 5: this is the record that makes a booking auditable, and
-- the thing ops reads when a booking goes wrong.
--
-- Nothing here is visible to an end user. These are our conversations with a
-- venue on their behalf, not their conversations.
-- ---------------------------------------------------------------------------

create type public.message_direction as enum ('outbound', 'inbound');

create type public.venue_message_status as enum (
  /** Written by the agent, not yet seen by a human. */
  'drafted',
  /** Waiting on an operator, because this venue requires approval. */
  'awaiting_approval',
  /** A human said yes, or the venue is on auto-send. */
  'approved',
  'sending',
  'sent',
  'delivered',
  'failed',
  /** Anything the venue sent us. */
  'received'
);

create table public.venue_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  booking_id uuid references public.bookings (id) on delete cascade,
  booking_attempt_id uuid references public.booking_attempts (id) on delete set null,
  venue_id uuid not null references public.venues (id) on delete cascade,
  direction public.message_direction not null,
  status public.venue_message_status not null,
  body text not null,
  /** Which BSP carried it, so a thread stays readable after we switch. */
  bsp text,
  bsp_message_id text,
  /** WhatsApp requires an approved template to open a conversation. */
  template_name text,
  drafted_by text,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  /** How we read an inbound reply. Below threshold this must become an ops task. */
  parsed_outcome public.attempt_outcome,
  parsed_confidence numeric(4, 3),
  error_message text,
  /** Storage pointer to the raw webhook body we verified. */
  payload_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_messages_body_check check (char_length(body) between 1 and 4000),
  constraint venue_messages_confidence_check
    check (parsed_confidence is null or parsed_confidence between 0 and 1),
  -- Direction and status must agree: we cannot "receive" something we sent.
  constraint venue_messages_direction_status_check check (
    (direction = 'inbound' and status = 'received')
    or (direction = 'outbound' and status <> 'received')
  ),
  -- Approval is a fact about a person, so it needs both halves or neither.
  constraint venue_messages_approval_check
    check ((approved_by is null) = (approved_at is null)),
  -- Nothing is marked sent without a moment it was sent.
  constraint venue_messages_sent_check
    check (status not in ('sent', 'delivered') or sent_at is not null)
);

create index venue_messages_booking_idx on public.venue_messages (booking_id, created_at);
create index venue_messages_venue_idx on public.venue_messages (venue_id, created_at desc);
create index venue_messages_bsp_id_idx on public.venue_messages (bsp_message_id)
  where bsp_message_id is not null;
-- The approval queue: what an operator has to look at right now.
create index venue_messages_awaiting_idx on public.venue_messages (created_at)
  where status = 'awaiting_approval';

create trigger venue_messages_set_updated_at
  before update on public.venue_messages
  for each row execute function public.set_updated_at();

alter table public.venue_messages enable row level security;

-- Ops only. A user sees the outcome of these conversations, never the thread.
create policy venue_messages_ops_only on public.venue_messages
  for all to authenticated
  using (public.is_ops())
  with check (public.is_ops());

-- ---------------------------------------------------------------------------
-- Inbound webhook de-duplication
--
-- BSPs retry. Processing the same venue reply twice could confirm a booking
-- twice, or escalate one that was already handled, so every inbound event is
-- claimed exactly once before it is acted on.
-- ---------------------------------------------------------------------------

create table public.webhook_events (
  id uuid primary key default extensions.gen_random_uuid(),
  provider text not null,
  /** The provider's own id for this delivery. */
  external_id text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload_ref text,
  unique (provider, external_id)
);

alter table public.webhook_events enable row level security;

create policy webhook_events_ops_read on public.webhook_events
  for select to authenticated
  using (public.is_ops());

/**
 * Claims a webhook delivery. Returns true the first time and false on every
 * retry, so the caller can drop duplicates without a race.
 */
create or replace function public.claim_webhook_event(
  p_provider text,
  p_external_id text,
  p_payload_ref text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.webhook_events (provider, external_id, payload_ref)
  values (p_provider, p_external_id, p_payload_ref);
  return true;
exception
  when unique_violation then
    return false;
end;
$$;

revoke execute on function public.claim_webhook_event(text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_webhook_event(text, text, text) to service_role;

comment on function public.claim_webhook_event is
  'Returns true only for the first delivery of a given provider event. BSPs retry; venue replies must be acted on once.';
