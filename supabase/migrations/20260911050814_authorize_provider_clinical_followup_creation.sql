-- Clinical follow-up authorship is narrower than operational recall management.
-- This lets an assigned dentist who can finalize the source record create its
-- follow-up without granting contact, dismissal, or branch-wide queue powers.
create or replace function public.create_clinical_follow_up_recall(
  p_patient_id text,
  p_clinical_visit_id text,
  p_due_date date,
  p_reason text,
  p_branch_id text default null,
  p_provider_id text default null,
  p_provider_name_snapshot text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_provider_can_author boolean := false;
  v_source_is_valid boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;
  if p_due_date is null then
    raise exception 'A real follow-up due date is required.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A follow-up reason is required.';
  end if;

  select exists (
    select 1
    from public.dental_records dr
    join public.patients p on p.id = dr.patient_id
    where dr.id::text = p_clinical_visit_id
      and p.patient_id = p_patient_id
      and dr.status in ('finalized', 'amended')
      and (p_branch_id is null or dr.branch_id = p_branch_id)
      and (p_provider_id is null or dr.provider_id = p_provider_id)
  ) into v_source_is_valid;

  if not v_source_is_valid then
    raise exception 'The clinical follow-up source does not match the finalized patient record.';
  end if;

  select
    public.current_profile_role() in ('dentist', 'associate_dentist')
    and public.has_profile_permission('clinical_records.finalize'::text)
    and p_provider_id is not null
    and p_branch_id is not null
    and public.profile_has_active_branch(p_branch_id)
    and exists (
      select 1
      from public.providers pr
      where pr.profile_id = auth.uid()
        and pr.id::text = p_provider_id
        and pr.status in ('active', 'on_leave')
    )
  into v_provider_can_author;

  if not public.can_manage_patient_recall(p_patient_id, p_branch_id, p_provider_id)
     and not v_provider_can_author then
    raise exception 'Not authorized to create this follow-up.';
  end if;

  select id into v_id
  from public.patient_recalls
  where patient_id = p_patient_id
    and kind = 'follow_up'
    and source_type = 'clinical_recommendation'
    and coalesce(source_id, '') = coalesce(p_clinical_visit_id, '')
    and due_date = p_due_date
    and status not in ('completed', 'dismissed', 'cancelled')
  order by created_at desc
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into public.patient_recalls(
      patient_id, kind, source_type, source_id, clinical_visit_id,
      due_date, reason, branch_id, provider_id, provider_name_snapshot,
      created_by, source_recorded_at
    ) values (
      p_patient_id, 'follow_up', 'clinical_recommendation', p_clinical_visit_id, p_clinical_visit_id,
      p_due_date, trim(p_reason), p_branch_id, p_provider_id, coalesce(p_provider_name_snapshot, ''),
      auth.uid(), now()
    ) returning id into v_id;
  exception when unique_violation then
    select id into v_id
    from public.patient_recalls
    where patient_id = p_patient_id
      and kind = 'follow_up'
      and source_type = 'clinical_recommendation'
      and coalesce(source_id, '') = coalesce(p_clinical_visit_id, '')
      and due_date = p_due_date
      and status not in ('completed', 'dismissed', 'cancelled')
    order by created_at desc
    limit 1;
  end;

  return v_id;
end;
$$;

revoke all on function public.create_clinical_follow_up_recall(text, text, date, text, text, text, text) from public, anon;
grant execute on function public.create_clinical_follow_up_recall(text, text, date, text, text, text, text) to authenticated, service_role;
