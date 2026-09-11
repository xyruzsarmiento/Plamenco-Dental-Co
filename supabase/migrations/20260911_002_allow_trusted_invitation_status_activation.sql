-- Allow the trusted internal invitation RPC to activate an invited account without
-- weakening the normal self-service protection on profile role/status/permissions.

create or replace function public.accept_own_internal_invitation()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_profile_role text;
  v_profile_status text;
  v_invitation_id uuid;
  v_invitation_role text;
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

  select p.role, p.status
    into v_profile_role, v_profile_status
  from public.profiles p
  where p.id = v_user_id
    and lower(p.email) = v_email;

  if v_profile_role is null or v_profile_status is null then
    raise exception 'Internal profile does not match this authenticated account';
  end if;

  if v_profile_status = 'suspended' then
    raise exception 'This clinic account is suspended';
  end if;

  select i.id, i.role
    into v_invitation_id, v_invitation_role
  from public.internal_account_invitations i
  where lower(i.email) = v_email
    and i.status in ('sent', 'pending')
  order by i.invited_at desc
  limit 1
  for update;

  if v_invitation_id is null then
    raise exception 'No pending internal invitation was found for this account';
  end if;

  if lower(v_profile_role) <> lower(v_invitation_role) then
    raise exception 'This invitation does not match the clinic account role';
  end if;

  if v_invitation_role in ('dentist', 'associate_dentist') and not exists (
    select 1
    from public.providers pr
    where pr.profile_id = v_user_id
      and pr.status = 'active'
  ) then
    raise exception 'The dentist profile is not fully provisioned';
  end if;

  update public.internal_account_invitations
  set status = 'accepted',
      accepted_by = v_user_id,
      accepted_at = now(),
      updated_at = now(),
      error_message = ''
  where id = v_invitation_id;

  -- Transaction-local capability marker consumed only by the profile guard triggers.
  -- A client cannot satisfy the guard with the marker alone: the trigger also verifies
  -- the exact accepted invitation, account, email, and safe status transition.
  perform set_config('app.internal_invitation_activation_user', v_user_id::text, true);
  perform set_config('app.internal_invitation_activation_id', v_invitation_id::text, true);

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

create or replace function public.part12_guard_profile_privilege_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activation_allowed boolean := false;
begin
  v_activation_allowed :=
    old.status in ('inactive', 'invited', 'pending')
    and new.status = 'active'
    and new.role is not distinct from old.role
    and new.permissions is not distinct from old.permissions
    and current_setting('app.internal_invitation_activation_user', true) = old.id::text
    and exists (
      select 1
      from public.internal_account_invitations i
      where i.id::text = current_setting('app.internal_invitation_activation_id', true)
        and i.accepted_by = old.id
        and i.status = 'accepted'
        and lower(i.email) = lower(old.email)
    );

  if auth.uid() = old.id and not public.part12_is_super_admin() then
    if (
      new.role is distinct from old.role
      or new.status is distinct from old.status
      or new.permissions is distinct from old.permissions
    ) and not v_activation_allowed then
      raise exception 'Profile role, status, and permissions are management-controlled' using errcode='42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_self_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_email text;
  v_activation_allowed boolean := false;
begin
  if new.avatar_url is distinct from old.avatar_url
    and nullif(new.avatar_url, '') is not null
    and new.avatar_url !~* '^(https?:|data:|blob:)'
    and split_part(new.avatar_url, '/', 1) <> new.id::text
  then
    raise exception 'Avatar path must belong to the profile account.' using errcode = '42501';
  end if;

  v_activation_allowed :=
    old.status in ('inactive', 'invited', 'pending')
    and new.status = 'active'
    and new.role is not distinct from old.role
    and new.permissions is not distinct from old.permissions
    and current_setting('app.internal_invitation_activation_user', true) = old.id::text
    and exists (
      select 1
      from public.internal_account_invitations i
      where i.id::text = current_setting('app.internal_invitation_activation_id', true)
        and i.accepted_by = old.id
        and i.status = 'accepted'
        and lower(i.email) = lower(old.email)
    );

  if old.id = (select auth.uid()) then
    select lower(email) into v_auth_email
    from auth.users
    where id = (select auth.uid());

    if new.email is distinct from old.email
      and lower(coalesce(new.email, '')) is distinct from coalesce(v_auth_email, '')
    then
      raise exception 'Profile email must match the authenticated account email.' using errcode = '42501';
    end if;

    if (
      new.id is distinct from old.id
      or new.role is distinct from old.role
      or new.status is distinct from old.status
      or new.permissions is distinct from old.permissions
      or new.created_at is distinct from old.created_at
    ) and not v_activation_allowed then
      raise exception 'Sensitive account fields cannot be changed from the personal profile page.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;
