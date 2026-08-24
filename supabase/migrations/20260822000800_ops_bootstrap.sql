-- ---------------------------------------------------------------------------
-- reservAI — ops bootstrap helper
--
-- Granting ops access is a deliberate act by an admin or by someone holding the
-- service role key. There is no self-service path and no email-domain shortcut.
-- ---------------------------------------------------------------------------

create or replace function public.grant_role_by_email(
  target_email text,
  target_role public.app_role
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  target_id uuid;
begin
  -- Only an existing admin, or a caller with no JWT at all (the service role
  -- and psql), may grant roles.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an admin may grant roles.' using errcode = 'insufficient_privilege';
  end if;

  select id into target_id from auth.users where lower(email) = lower(target_email);

  if target_id is null then
    raise exception 'No auth user with email %. They must sign in once first.', target_email
      using errcode = 'no_data_found';
  end if;

  insert into public.user_roles (user_id, role, granted_by)
  values (target_id, target_role, auth.uid())
  on conflict (user_id, role) do nothing;

  insert into public.events_log (entity_type, entity_id, event, actor, actor_id, payload)
  values (
    'user_role', target_id, 'role_granted',
    case when auth.uid() is null then 'system'::public.actor else 'ops'::public.actor end,
    auth.uid(),
    jsonb_build_object('role', target_role, 'email', target_email)
  );

  return target_id;
end;
$$;

revoke execute on function public.grant_role_by_email(text, public.app_role) from public, anon, authenticated;
grant execute on function public.grant_role_by_email(text, public.app_role) to service_role;

comment on function public.grant_role_by_email is
  'Grant a role to an existing auth user. Admin or service role only. Usage: select public.grant_role_by_email(''you@example.com'', ''ops'');';
