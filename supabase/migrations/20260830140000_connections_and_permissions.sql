/**
 * Connected accounts, and what Riva is allowed to do with them.
 *
 * Two tables rather than one, because they answer different questions and
 * change at different times. A connection is "we hold a valid grant from
 * Google"; a permission is "the user is content for us to use it this way".
 * Folding them together produces the switch this product must not have — one
 * boolean that means both "connected" and "allowed to act", which is how an
 * assistant ends up sending an email somebody only agreed to let it read.
 */

-- --------------------------------------------------------------------------
-- Connections
-- --------------------------------------------------------------------------

create table public.connections (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,

  /** google, microsoft. One row per provider per user. */
  provider text not null,

  /**
   * Exactly what was granted, as the provider returned it — not what was
   * asked for. Google may grant less than requested, and a client that
   * assumes otherwise will call an endpoint it has no right to and fail in a
   * way that looks like the calendar being empty.
   */
  scopes text[] not null default '{}',

  /**
   * Encrypted in the service before it ever reaches Postgres, with a key held
   * only in the environment. A database backup that leaks is then a leak of
   * ciphertext rather than of somebody's mailbox.
   */
  access_token_enc text,
  refresh_token_enc text,
  access_token_expires_at timestamptz,

  /** Which account this is, so a person with two Googles knows which. */
  account_email text,

  connected_at timestamptz not null default now(),
  /**
   * Set when the grant stops working — revoked at the provider, or a refresh
   * that failed for good. Kept rather than deleted so the app can say "this
   * needs reconnecting" instead of quietly behaving as though it was never
   * connected.
   */
  revoked_at timestamptz,
  revoked_reason text,

  last_used_at timestamptz,
  updated_at timestamptz not null default now(),

  constraint connections_provider_check check (provider in ('google', 'microsoft')),
  constraint connections_unique unique (user_id, provider)
);

create trigger connections_updated_at
  before update on public.connections
  for each row execute function public.set_updated_at();

comment on table public.connections is
  'A grant from an external provider. Tokens are encrypted by the service; the key is never in the database.';

-- --------------------------------------------------------------------------
-- Permissions
-- --------------------------------------------------------------------------

/**
 * What Riva may do, per domain.
 *
 * Deliberately a ladder rather than a set of flags. Every level is a superset
 * of the one below it, which means a check is a comparison rather than a
 * lookup table nobody can hold in their head — and it makes the question the
 * UI has to ask a single one.
 *
 * No level grants sending or spending. Those are separate and arrive with the
 * features that need them, so that widening one cannot silently widen another.
 */
create table public.permissions (
  user_id uuid not null references public.users (id) on delete cascade,
  domain text not null,
  level text not null default 'none',
  updated_at timestamptz not null default now(),

  primary key (user_id, domain),
  constraint permissions_domain_check check (domain in ('calendar', 'email', 'contacts', 'calls')),
  constraint permissions_level_check
    check (level in ('none', 'read', 'suggest', 'write'))
);

create trigger permissions_updated_at
  before update on public.permissions
  for each row execute function public.set_updated_at();

comment on table public.permissions is
  'A ladder per domain: none < read < suggest < write. Sending and spending are never implied.';

-- --------------------------------------------------------------------------
-- Access
-- --------------------------------------------------------------------------

alter table public.connections enable row level security;
alter table public.permissions enable row level security;

/**
 * A person may see that they are connected, and may disconnect. They may never
 * read the tokens, so the client is given a view without them rather than the
 * table — a select policy cannot exclude a column, and a client that can read
 * a refresh token is a client that can be robbed of one.
 */
create policy connections_no_direct_read on public.connections
  for select to authenticated using (false);

create policy connections_revoke_own on public.connections
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create view public.my_connections
with (security_invoker = true) as
  select id, user_id, provider, scopes, account_email, connected_at, revoked_at, last_used_at
  from public.connections;

create policy permissions_own on public.permissions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.my_connections to authenticated;
grant update on public.connections to authenticated;
grant select, insert, update, delete on public.permissions to authenticated;

/**
 * Disconnecting, without being able to read what is being disconnected.
 *
 * The update policy above would let a client set revoked_at, but it would also
 * let it set anything else on the row. This is the only shape of change the
 * app needs, so it is the only one offered.
 */
create or replace function public.revoke_connection(p_provider text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  update public.connections
  set revoked_at = now(),
      revoked_reason = 'disconnected by user',
      access_token_enc = null,
      refresh_token_enc = null
  where user_id = auth.uid()
    and provider = p_provider
    and revoked_at is null;

  -- Disconnecting is also a statement about permission. Leaving the level
  -- behind would silently restore it on reconnecting.
  update public.permissions
  set level = 'none'
  where user_id = auth.uid()
    and domain = case p_provider when 'google' then 'calendar' else domain end;
end;
$$;

revoke execute on function public.revoke_connection(text) from public, anon;
grant execute on function public.revoke_connection(text) to authenticated, service_role;

comment on function public.revoke_connection is
  'Disconnect a provider and clear its tokens. The only write a client may make to connections.';
