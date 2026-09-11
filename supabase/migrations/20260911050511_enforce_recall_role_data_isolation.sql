-- Recall visibility is role-aware: operational staff work by branch while
-- dentists remain restricted to their own provider record within active scope.
create or replace function public.can_view_patient_recall(
  p_patient_id text,
  p_branch_id text default null,
  p_provider_id text default null
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.current_user_owns_patient(p_patient_id)
    or public.has_profile_permission('system_admin.view'::text)
    or public.has_profile_permission('branches.manage'::text)
    or (
      public.current_profile_role() in ('dentist', 'associate_dentist')
      and p_provider_id is not null
      and public.has_profile_permission('clinical_records.view'::text)
      and (p_branch_id is null or public.profile_has_active_branch(p_branch_id))
      and exists (
        select 1
        from public.providers pr
        where pr.profile_id = auth.uid()
          and pr.id::text = p_provider_id
          and pr.status in ('active', 'on_leave')
      )
    )
    or (
      public.current_profile_role() = 'staff'
      and p_branch_id is not null
      and public.profile_has_active_branch(p_branch_id)
      and (
        public.has_profile_permission('appointments.view'::text)
        or public.has_profile_permission('communications.manage'::text)
      )
    );
$$;

create or replace function public.can_manage_patient_recall(
  p_patient_id text,
  p_branch_id text default null,
  p_provider_id text default null
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.has_profile_permission('system_admin.manage'::text)
    or public.has_profile_permission('branches.manage'::text)
    or (
      public.current_profile_role() in ('dentist', 'associate_dentist')
      and p_provider_id is not null
      and public.has_profile_permission('clinical_records.edit'::text)
      and (p_branch_id is null or public.profile_has_active_branch(p_branch_id))
      and exists (
        select 1
        from public.providers pr
        where pr.profile_id = auth.uid()
          and pr.id::text = p_provider_id
          and pr.status in ('active', 'on_leave')
      )
    )
    or (
      public.current_profile_role() = 'staff'
      and p_branch_id is not null
      and public.profile_has_active_branch(p_branch_id)
      and (
        public.has_profile_permission('appointments.create'::text)
        or public.has_profile_permission('communications.manage'::text)
      )
    );
$$;

revoke all on function public.can_view_patient_recall(text, text, text) from public, anon;
revoke all on function public.can_manage_patient_recall(text, text, text) from public, anon;
grant execute on function public.can_view_patient_recall(text, text, text) to authenticated, service_role;
grant execute on function public.can_manage_patient_recall(text, text, text) to authenticated, service_role;
