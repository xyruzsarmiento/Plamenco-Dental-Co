-- Revoke a Dentist or Associate Dentist account without deleting clinical history.
-- Provider identity, appointments, records, and audit references remain intact.
create or replace function public.revoke_dentist_portal_access(p_profile_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if not public.can_manage_staff_assignments() then
    raise exception 'Only an active Super Admin can revoke dentist access.' using errcode = '42501';
  end if;

  select *
    into v_profile
  from public.profiles
  where id = p_profile_id
    and role in ('dentist', 'associate_dentist');

  if v_profile.id is null then
    raise exception 'Dentist account profile was not found.' using errcode = 'P0002';
  end if;

  update public.provider_branch_assignments
  set status = 'inactive', updated_at = now()
  where provider_id in (
    select id from public.providers where profile_id = p_profile_id
  )
    and status = 'active';

  update public.provider_schedule_blocks
  set status = 'inactive', updated_at = now()
  where provider_id in (
    select id from public.providers where profile_id = p_profile_id
  )
    and status = 'active';

  update public.providers
  set status = 'inactive', updated_at = now()
  where profile_id = p_profile_id
    and status = 'active';

  update public.profiles
  set status = 'inactive', updated_at = now()
  where id = p_profile_id
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.revoke_dentist_portal_access(uuid) from public, anon;
grant execute on function public.revoke_dentist_portal_access(uuid) to authenticated, service_role;

-- Protect the owner account from accidental deactivation. The database remains
-- authoritative even if a client-side control is bypassed.
create or replace function public.set_internal_account_status(
  p_profile_id uuid,
  p_status text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_active_super_admins integer;
begin
  if not public.can_manage_staff_assignments() then
    raise exception 'Only an active Super Admin can manage internal account status.' using errcode = '42501';
  end if;

  if p_status not in ('active', 'inactive') then
    raise exception 'Unsupported internal account status.' using errcode = '22023';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_profile_id
    and role in ('super_admin', 'staff', 'dentist', 'associate_dentist');

  if v_profile.id is null then
    raise exception 'Internal account profile was not found.' using errcode = 'P0002';
  end if;

  if v_profile.role = 'super_admin' and p_status = 'inactive' then
    if v_profile.id = auth.uid() then
      raise exception 'The currently signed-in Super Admin cannot be deactivated.' using errcode = '42501';
    end if;
    select count(*) into v_active_super_admins
    from public.profiles
    where role = 'super_admin' and status = 'active';
    if v_active_super_admins <= 1 then
      raise exception 'The last active Super Admin must remain active.' using errcode = '42501';
    end if;
  end if;

  update public.profiles
  set status = p_status, updated_at = now()
  where id = p_profile_id
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.set_internal_account_status(uuid, text) from public, anon;
grant execute on function public.set_internal_account_status(uuid, text) to authenticated, service_role;
