-- ---------------------------------------------------------------------------
-- reservAI — conversations, requests and suggestions
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  -- 'app' for in-app chat, 'whatsapp' for the concierge number (Phase 6).
  channel text not null default 'app',
  title text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_channel_check check (channel in ('app', 'whatsapp'))
);

create index conversations_user_idx on public.conversations (user_id, last_message_at desc nulls last);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- --- Requests ---------------------------------------------------------------

create table public.requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  -- Discriminated on `kind`: text | voice. Validated by requestInputSchema.
  input jsonb not null,
  -- Every field nullable, because the agent must be able to say "I don't know".
  -- That is what drives the single clarifying question, and it is strictly
  -- better than a confident guess.
  parsed_intent jsonb,
  status public.request_status not null default 'received',
  clarifying_question text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint requests_input_object_check check (jsonb_typeof(input) = 'object'),
  constraint requests_input_kind_check check (input ->> 'kind' in ('text', 'voice')),
  constraint requests_parsed_intent_object_check
    check (parsed_intent is null or jsonb_typeof(parsed_intent) = 'object')
);

create index requests_user_created_idx on public.requests (user_id, created_at desc);
create index requests_status_idx on public.requests (status) where status <> 'converted';
create index requests_conversation_idx on public.requests (conversation_id);

create trigger requests_set_updated_at
  before update on public.requests
  for each row execute function public.set_updated_at();

-- --- Suggestions ------------------------------------------------------------

create table public.suggestions (
  id uuid primary key default extensions.gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete restrict,
  -- 1 is the Curator's first choice. Top three are shown.
  rank smallint not null,
  proposed_starts_at timestamptz not null,
  proposed_ends_at timestamptz not null,
  -- True only when a real availability lookup returned this slot. For every
  -- other venue it is a proposal we still have to negotiate, and the UI must
  -- not present the two as if they were the same thing.
  slot_is_verified boolean not null default false,
  rationale text not null,
  -- Frozen copy of the inputs and scores behind this rank, for audit.
  reasoning_snapshot jsonb not null default '{}'::jsonb,
  distance_metres integer,
  outcome public.suggestion_outcome not null default 'pending',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suggestions_rank_check check (rank between 1 and 10),
  constraint suggestions_window_check check (proposed_starts_at < proposed_ends_at),
  constraint suggestions_rationale_check check (char_length(rationale) between 1 and 600),
  constraint suggestions_distance_check check (distance_metres is null or distance_metres >= 0),
  constraint suggestions_snapshot_check check (jsonb_typeof(reasoning_snapshot) = 'object'),
  unique (request_id, rank)
);

create index suggestions_request_idx on public.suggestions (request_id, rank);
create index suggestions_venue_idx on public.suggestions (venue_id);

create trigger suggestions_set_updated_at
  before update on public.suggestions
  for each row execute function public.set_updated_at();
