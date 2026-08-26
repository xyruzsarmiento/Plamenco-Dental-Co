-- Release-candidate hardening: invited internal accounts remain inactive until
-- the authenticated invite recipient explicitly sets a password and accepts.

create or replace function public.accept_own_internal_invitation()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_profile_status text;
  v_invitation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select lower(u.email)
    into v_email
  from auth.users u
  where u.id = v_user_id;

  if v_email is null then
    raise exception 'Authenticated account email is unavailable';
  end if;

  select p.status
    into v_profile_status
  from public.profiles p
  where p.id = v_user_id
    and lower(p.email) = v_email;

  if v_profile_status is null then
    raise exception 'Internal profile does not match this authenticated account';
  end if;

  if v_profile_status = 'suspended' then
    raise exception 'This clinic account is suspended';
  end if;

  select i.id
    into v_invitation_id
  from public.internal_account_invitations i
  where lower(i.email) = v_email
    and i.status in ('sent', 'pending')
  order by i.invited_at desc
  limit 1
  for update;

  if v_invitation_id is null then
    raise exception 'No pending internal invitation was found for this account';
  end if;

  update public.internal_account_invitations
  set status = 'accepted',
      accepted_by = v_user_id,
      accepted_at = now(),
      updated_at = now(),
      error_message = ''
  where id = v_invitation_id;

  update public.profiles
  set status = 'active',
      updated_at = now()
  where id = v_user_id
    and status in ('inactive', 'invited', 'pending', 'active');

  if not found then
    raise exception 'Clinic account cannot be activated from its current status';
  end if;

  return true;
end
$$;

revoke all on function public.accept_own_internal_invitation() from public, anon;
grant execute on function public.accept_own_internal_invitation() to authenticated;
