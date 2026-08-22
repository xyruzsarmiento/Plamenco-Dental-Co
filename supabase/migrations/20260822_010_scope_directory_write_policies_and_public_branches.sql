-- Keep management helpers away from anon policy evaluation while exposing only
-- active branch directory rows needed by public booking.

alter policy branches_write_management on public.branches to authenticated;
alter policy providers_write_management on public.providers to authenticated;
alter policy provider_branch_assignments_write_management on public.provider_branch_assignments to authenticated;

drop policy if exists branches_public_active_read on public.branches;
create policy branches_public_active_read
on public.branches for select to anon
using (status = 'active');
