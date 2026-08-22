-- Protect internal clinical fields from patient table reads.
-- Internal clinical users are permission-gated; patients receive finalized/amended
-- patient-visible summaries through a dedicated SECURITY DEFINER RPC.

alter policy records_read_self_or_internal on public.dental_records to authenticated
  using (public.has_profile_permission('clinical_records.view'));

alter policy dental_records_write_internal on public.dental_records to authenticated
  with check (public.has_profile_permission('clinical_records.create'));

alter policy dental_records_update_internal on public.dental_records to authenticated
  using (public.has_any_profile_permission(array['clinical_records.edit','clinical_records.edit_draft','clinical_records.finalize','clinical_records.amend']::text[]))
  with check (public.has_any_profile_permission(array['clinical_records.edit','clinical_records.edit_draft','clinical_records.finalize','clinical_records.amend']::text[]));

create or replace function public.get_my_patient_visible_dental_records()
returns table (
  id uuid,
  patient_id uuid,
  record_date date,
  visit_type text,
  chief_complaint text,
  diagnosis text,
  treatment_plan text,
  findings text,
  treatment_notes text,
  follow_up_date date,
  status text,
  related_appointment_id uuid,
  created_by text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    dr.id,
    dr.patient_id,
    dr.record_date,
    dr.visit_type,
    coalesce(nullif(dr.patient_visible_summary, ''), 'Dental visit summary') as chief_complaint,
    ''::text as diagnosis,
    ''::text as treatment_plan,
    ''::text as findings,
    ''::text as treatment_notes,
    dr.follow_up_date,
    dr.status,
    dr.related_appointment_id,
    ''::text as created_by,
    dr.created_at,
    dr.updated_at
  from public.dental_records dr
  join public.patients p on p.id = dr.patient_id
  where auth.uid() is not null
    and p.auth_user_id = auth.uid()
    and dr.status in ('finalized','amended')
  order by dr.record_date desc, dr.created_at desc;
$$;

revoke execute on function public.get_my_patient_visible_dental_records() from public, anon;
grant execute on function public.get_my_patient_visible_dental_records() to authenticated;
