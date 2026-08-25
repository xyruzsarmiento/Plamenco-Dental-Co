-- Part 2 follow-up: keep provider directory RLS branch-aware without policy recursion.
-- SECURITY DEFINER is used only for narrow ownership/visibility lookups and search_path is locked.

create or replace function public.current_user_owns_provider(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    exists (
      select 1
      from public.providers pr
      where pr.id = p_provider_id
        and pr.profile_id = auth.uid()
    ),
    false
  )
$$;

create or replace function public.can_view_provider(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    public.is_super_admin()
    or public.has_profile_permission('dentists.manage')
    or public.current_user_owns_provider(p_provider_id)
    or exists (
      select 1
      from public.provider_branch_assignments pba
      where pba.provider_id = p_provider_id
        and pba.status = 'active'
        and public.can_access_branch(pba.branch_id::text)
    ),
    false
  )
$$;

revoke all on function public.current_user_owns_provider(uuid) from public, anon;
revoke all on function public.can_view_provider(uuid) from public, anon;
grant execute on function public.current_user_owns_provider(uuid) to authenticated, service_role;
grant execute on function public.can_view_provider(uuid) to authenticated, service_role;

drop policy if exists "provider_branch_assignments_read_authorized" on public.provider_branch_assignments;
create policy "provider_branch_assignments_read_authorized"
on public.provider_branch_assignments
for select
to authenticated
using (
  public.is_super_admin()
  or public.has_profile_permission('dentists.manage')
  or public.can_access_branch(branch_id::text)
  or public.current_user_owns_provider(provider_id)
);

drop policy if exists "providers_read_authorized" on public.providers;
create policy "providers_read_authorized"
on public.providers
for select
to authenticated
using (public.can_view_provider(id));

comment on function public.can_view_provider(uuid) is
  'Provider-directory visibility without recursive RLS: management, own provider, or a provider assigned to an authorized branch.';
