-- Expose only the currently authenticated user's own pending internal invitation context.
-- This lets the invite acceptance page verify identity/role/profile state without
-- granting direct table access to internal_account_invitations.

create or replace function public.get_own_internal_invitation_context()
returns table (
  invitation_id uuid,
  user_id uuid,
  full_name text,
  email text,
  role text,
  profile_status text,
  invitation_status text,
  invited_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_auth_email text;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select lower(u.email)
    into v_auth_email
  from auth.users u
  where u.id = v_uid;

  if v_auth_email is null then
    raise exception 'Authenticated account email is unavailable' using errcode = '42501';
  end if;

  return query
  select
    i.id,
    p.id,
    coalesce(nullif(p.full_name, ''), nullif(i.full_name, ''), v_auth_email),
    lower(p.email),
    p.role,
    p.status,
    i.status,
    i.invited_at
  from public.profiles p
  join public.internal_account_invitations i
    on lower(i.email) = v_auth_email
   and lower(i.role) = lower(p.role)
  where p.id = v_uid
    and lower(p.email) = v_auth_email
    and p.role in ('staff', 'dentist', 'associate_dentist', 'super_admin')
    and p.status in ('inactive', 'invited', 'pending', 'active')
    and i.status in ('sent', 'pending', 'accepted')
  order by
    case when i.status in ('sent', 'pending') then 0 else 1 end,
    i.invited_at desc
  limit 1;
end;
$$;

revoke all on function public.get_own_internal_invitation_context() from public, anon;
grant execute on function public.get_own_internal_invitation_context() to authenticated;
