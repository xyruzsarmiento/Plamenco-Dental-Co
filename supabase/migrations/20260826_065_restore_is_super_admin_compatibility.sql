-- Fix legacy PART 10 assignment RPC dependency after the branch-security hardening pass.
-- This helper is authentication-derived and is not driven by browser branch state.

create or replace function public.is_super_admin()
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

revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated, service_role;
