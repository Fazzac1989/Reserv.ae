-- ---------------------------------------------------------------------------
-- reservAI — conversation messages
--
-- Full persistence of the concierge conversation: what the user said, what the
-- agent replied, and the voice note behind it where there was one. The audio
-- and its transcript are kept because a booking made from a misheard request is
-- exactly the kind of failure we need to be able to look up afterwards.
-- ---------------------------------------------------------------------------

create type public.message_role as enum ('user', 'assistant');
create type public.message_kind as enum ('text', 'voice');

create table public.messages (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  -- Denormalised from the conversation so RLS is a column comparison rather
  -- than a subquery on every row of every read.
  user_id uuid not null references public.users (id) on delete cascade,
  role public.message_role not null,
  kind public.message_kind not null default 'text',
  content text not null,
  /** Storage pointer into the private voice-notes bucket. */
  audio_ref text,
  transcript_confidence numeric(4, 3),
  /** The request this message produced or refined, once one exists. */
  request_id uuid references public.requests (id) on delete set null,
  /** Model, token usage and the agent that produced an assistant turn. */
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint messages_content_check check (char_length(content) between 1 and 8000),
  constraint messages_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint messages_confidence_check
    check (transcript_confidence is null or transcript_confidence between 0 and 1),
  -- Only a user turn can come from a voice note, and it must point at the audio.
  constraint messages_voice_check check (
    kind = 'text' or (role = 'user' and audio_ref is not null)
  )
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_user_idx on public.messages (user_id, created_at desc);

alter table public.messages enable row level security;

create policy messages_select_own on public.messages
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_ops());

-- A user may add their own turns and nothing else. Assistant turns are written
-- by the agent service, so a client cannot fabricate something the concierge
-- supposedly said — even in its own conversation, where the only person misled
-- would be the user themselves.
create policy messages_insert_own on public.messages
  for insert to authenticated
  with check (user_id = (select auth.uid()) and role = 'user');

grant select, insert on public.messages to authenticated;

-- Keeps the conversation list ordered by activity without a second write from
-- the application on every message.
create or replace function public.touch_conversation()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();
