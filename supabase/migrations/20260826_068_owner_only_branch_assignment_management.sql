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
