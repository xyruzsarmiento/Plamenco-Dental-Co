-- Treatment plans are clinical records; generic internal access is too broad.
drop policy if exists plans_insert_internal on public.treatment_plans;
drop policy if exists plans_update_internal on public.treatment_plans;

create policy plans_insert_authorized
on public.treatment_plans
for insert
to authenticated
with check (public.has_profile_permission('treatments.create'));

create policy plans_update_authorized
on public.treatment_plans
for update
to authenticated
using (public.has_profile_permission('treatments.edit'))
with check (public.has_profile_permission('treatments.edit'));
