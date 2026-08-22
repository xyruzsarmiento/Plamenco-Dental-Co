-- Require explicit clinical treatment permissions instead of generic internal-profile access.
drop policy if exists treatments_insert_internal on public.treatments;
drop policy if exists treatments_update_internal on public.treatments;

create policy treatments_insert_authorized
on public.treatments
for insert
to authenticated
with check (
  public.has_profile_permission('treatments.create')
  and (branch_id is null or public.profile_has_active_branch(branch_id))
);

create policy treatments_update_authorized
on public.treatments
for update
to authenticated
using (
  public.has_any_profile_permission(array['treatments.edit','treatments.complete'])
  and (branch_id is null or public.profile_has_active_branch(branch_id))
)
with check (
  public.has_any_profile_permission(array['treatments.edit','treatments.complete'])
  and (branch_id is null or public.profile_has_active_branch(branch_id))
);
