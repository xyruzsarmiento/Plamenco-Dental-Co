-- Keep database authorization aligned with the role defaults used by the React app,
-- and make dentist availability updates transactional.

create or replace function public.has_profile_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      p.status = 'active'
      and (
        permission_key = any(coalesce(p.permissions, array[]::text[]))
        or p.role = 'super_admin'
        or (p.role = 'staff' and permission_key = any(array[
          'appointments.view','appointments.create','appointments.approve','appointments.reject','appointments.reschedule','appointments.cancel','appointments.assign_dentist','appointments.check_in','appointments.mark_no_show',
          'patients.view','patients.create','patients.edit_basic','patients.view_history',
          'documents.view','documents.upload',
          'billing.view','billing.create','payments.view','payments.record_manual','payments.verify','payments.confirm','payments.reject',
          'expenses.view','expenses.create','expenses.record_payment',
          'inventory.view','inventory.stock_in','inventory.stock_out','inventory.receive_transfer','suppliers.view','purchases.view','purchases.receive','purchase_orders.view','purchase_orders.receive',
          'reports.view_limited','notifications.view','notifications.send','communications.manage'
        ]::text[]))
        or (p.role = 'dentist' and permission_key = any(array[
          'appointments.view','appointments.view_assigned','appointments.update_clinical_status','appointments.start','appointments.complete',
          'patients.view','patients.view_history',
          'clinical_records.view','clinical_records.create','clinical_records.edit','clinical_records.edit_draft','clinical_records.finalize','clinical_records.amend',
          'treatments.view','treatments.create','treatments.edit','treatments.complete',
          'prescriptions.view','prescriptions.create','prescriptions.edit',
          'documents.view','documents.upload','schedule.view_own','schedule.manage_own','notifications.view'
        ]::text[]))
        or (p.role = 'associate_dentist' and permission_key = any(array[
          'appointments.view','appointments.view_assigned','appointments.update_clinical_status',
          'patients.view','patients.view_history',
          'clinical_records.view','clinical_records.create','clinical_records.edit_draft','clinical_records.finalize','clinical_records.amend',
          'treatments.view','treatments.create','treatments.edit',
          'prescriptions.view','prescriptions.create',
          'documents.view','documents.upload','schedule.view_own','notifications.view'
        ]::text[]))
      )
    from public.profiles p
    where p.id = auth.uid()
    limit 1
  ), false)
$$;

create or replace function public.replace_provider_weekly_schedule_v131(
  p_provider_id uuid,
  p_blocks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_block jsonb;
  v_branch uuid;
  v_day smallint;
  v_start time;
  v_end time;
  v_status text;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not public.has_profile_permission('schedule.manage_all') then raise exception 'Schedule management is not permitted' using errcode='42501'; end if;
  if not exists(select 1 from public.providers p where p.id=p_provider_id and p.status='active') then raise exception 'Active dentist not found'; end if;
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then raise exception 'Schedule blocks must be an array'; end if;

  delete from public.provider_schedule_blocks where provider_id=p_provider_id;

  for v_block in select value from jsonb_array_elements(p_blocks)
  loop
    v_branch := nullif(v_block->>'branchId','')::uuid;
    v_day := (v_block->>'dayOfWeek')::smallint;
    v_start := (v_block->>'startTime')::time;
    v_end := (v_block->>'endTime')::time;
    v_status := coalesce(nullif(v_block->>'status',''),'active');

    if v_branch is null then raise exception 'Every working period requires a branch'; end if;
    if v_day < 0 or v_day > 6 then raise exception 'Invalid day of week'; end if;
    if v_start is null or v_end is null or v_start >= v_end then raise exception 'Invalid working-hour range'; end if;
    if not exists(
      select 1 from public.provider_branch_assignments a
      where a.provider_id=p_provider_id and a.branch_id=v_branch and a.status='active'
    ) then raise exception 'Dentist is not assigned to one of the selected branches'; end if;

    if exists(
      select 1 from public.provider_schedule_blocks b
      where b.provider_id=p_provider_id
        and b.day_of_week=v_day
        and b.status='active'
        and v_start < b.end_time
        and v_end > b.start_time
    ) then raise exception 'Working periods overlap on the same day'; end if;

    insert into public.provider_schedule_blocks(provider_id,branch_id,day_of_week,start_time,end_time,status)
    values(p_provider_id,v_branch,v_day,v_start,v_end,v_status);
  end loop;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',id,'provider_id',provider_id,'branch_id',branch_id,'day_of_week',day_of_week,
      'start_time',to_char(start_time,'HH24:MI'),'end_time',to_char(end_time,'HH24:MI'),'status',status,
      'created_at',created_at,'updated_at',updated_at
    ) order by day_of_week,start_time)
    from public.provider_schedule_blocks where provider_id=p_provider_id
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.replace_provider_weekly_schedule_v131(uuid,jsonb) to authenticated;

create or replace function public.create_provider_availability_override_v131(
  p_provider_id uuid,
  p_branch_id uuid,
  p_date date,
  p_type text,
  p_start_time time default null,
  p_end_time time default null,
  p_reason text default '',
  p_private_notes text default ''
)
returns public.provider_availability_overrides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.provider_availability_overrides%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not public.has_profile_permission('schedule.manage_all') then raise exception 'Schedule management is not permitted' using errcode='42501'; end if;
  if p_date is null then raise exception 'Exception date is required'; end if;
  if p_type not in ('unavailable','leave','special_hours','available') then raise exception 'Invalid exception type'; end if;
  if p_branch_id is not null and not exists(
    select 1 from public.provider_branch_assignments a
    where a.provider_id=p_provider_id and a.branch_id=p_branch_id and a.status='active'
  ) then raise exception 'Dentist is not assigned to the selected branch'; end if;
  if p_type in ('special_hours','available') and ((p_start_time is null) <> (p_end_time is null)) then raise exception 'Both start and end time are required for timed availability'; end if;
  if p_start_time is not null and p_end_time is not null and p_start_time >= p_end_time then raise exception 'Exception start time must be before end time'; end if;

  insert into public.provider_availability_overrides(provider_id,branch_id,override_date,type,start_time,end_time,reason,private_notes,created_by)
  values(p_provider_id,p_branch_id,p_date,p_type,p_start_time,p_end_time,btrim(coalesce(p_reason,'')),btrim(coalesce(p_private_notes,'')),v_uid)
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.create_provider_availability_override_v131(uuid,uuid,date,text,time,time,text,text) to authenticated;
