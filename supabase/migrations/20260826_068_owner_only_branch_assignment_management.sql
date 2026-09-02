-- Release-candidate hardening: branch access grants are owner/Super Admin controlled.
-- Frontend already renders assignment editors read-only for non-Super-Admin users;
-- this migration makes the database authorization match that rule.

create or replace function public.can_manage_staff_assignments()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role = 'super_admin'
    ),
    false
  )
$$;

create or replace function public.can_manage_provider_assignments()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role = 'super_admin'
    ),
    false
  )
$$;

revoke all on function public.can_manage_staff_assignments() from public, anon;
revoke all on function public.can_manage_provider_assignments() from public, anon;
grant execute on function public.can_manage_staff_assignments() to authenticated, service_role;
grant execute on function public.can_manage_provider_assignments() to authenticated, service_role;

drop policy if exists "system_admin_manage_invitations" on public.internal_account_invitations;
drop policy if exists "super_admin_manage_invitations" on public.internal_account_invitations;
create policy "super_admin_manage_invitations"
on public.internal_account_invitations for all
using (public.can_manage_staff_assignments())
with check (public.can_manage_staff_assignments());

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
begin
  if not public.can_manage_staff_assignments() then
    raise exception 'Only an active Super Admin can manage internal account status.' using errcode = '42501';
  end if;

  if p_status not in ('active', 'inactive') then
    raise exception 'Unsupported internal account status.' using errcode = '22023';
  end if;

  update public.profiles
  set status = p_status,
      updated_at = now()
  where id = p_profile_id
    and role in ('super_admin', 'staff', 'dentist', 'associate_dentist')
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'Internal account profile was not found.' using errcode = 'P0002';
  end if;

  return v_profile;
end;
$$;

revoke all on function public.set_internal_account_status(uuid, text) from public, anon;
grant execute on function public.set_internal_account_status(uuid, text) to authenticated, service_role;
