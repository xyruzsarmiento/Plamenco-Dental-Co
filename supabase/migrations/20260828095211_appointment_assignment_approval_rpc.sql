create or replace function public.assign_appointment_provider(
  p_appointment_id uuid,
  p_provider_id uuid,
  p_actor text default '',
  p_expected_updated_at timestamptz default null
)
returns public.appointments
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_appointment public.appointments%rowtype;
  v_provider public.providers%rowtype;
  v_updated public.appointments%rowtype;
  v_start_time time;
  v_end_time time;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not public.has_profile_permission('appointments.approve')
     or not public.has_profile_permission('appointments.assign_dentist') then
    raise exception 'You do not have permission to assign dentists to appointment requests.'
      using errcode = '42501';
  end if;

  if p_appointment_id is null then
    raise exception 'Appointment request is required.';
  end if;

  if p_provider_id is null then
    raise exception 'Choose an eligible dentist before approving this appointment request.';
  end if;

  select *
    into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then
    raise exception 'Appointment request not found.';
  end if;

  if p_expected_updated_at is not null and v_appointment.updated_at is distinct from p_expected_updated_at then
    raise exception 'This appointment has already been updated.';
  end if;

  if v_appointment.status <> 'pending' then
    raise exception 'This appointment has already been updated.';
  end if;

  if v_appointment.branch_id is null then
    raise exception 'This appointment request is missing a branch. No changes were saved.';
  end if;

  if not public.can_operate_branch(v_appointment.branch_id::text) then
    raise exception 'You are not allowed to approve appointments for this branch.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.branches b
    where b.id = v_appointment.branch_id
      and b.status = 'active'
  ) then
    raise exception 'The selected branch is no longer active. No changes were saved.';
  end if;

  select *
    into v_provider
  from public.providers
  where id = p_provider_id;

  if not found then
    raise exception 'Selected dentist was not found.';
  end if;

  if v_provider.status <> 'active' then
    raise exception 'This dentist is inactive and cannot be assigned.';
  end if;

  if not exists (
    select 1
    from public.provider_branch_assignments pba
    where pba.provider_id = v_provider.id
      and pba.branch_id = v_appointment.branch_id
      and pba.status = 'active'
  ) then
    raise exception 'This dentist is not assigned to the selected branch.';
  end if;

  v_start_time := v_appointment.start_time::time;
  v_end_time := v_appointment.end_time::time;

  if exists (
    select 1
    from public.appointments a
    where a.id <> v_appointment.id
      and a.provider_id = v_provider.id
      and a.appointment_date = v_appointment.appointment_date
      and a.status in ('pending', 'confirmed', 'rescheduled', 'checked_in', 'waiting', 'in_progress', 'completed')
      and v_start_time < a.end_time::time
      and v_end_time > a.start_time::time
  ) then
    raise exception 'This dentist already has another appointment at this time.';
  end if;

  if not public.patient_booking_provider_available_v132(
    v_appointment.branch_id,
    v_provider.id,
    v_appointment.appointment_date,
    v_start_time,
    v_end_time
  ) then
    raise exception 'This dentist is not available at the requested time.';
  end if;

  update public.appointments
     set provider_id = v_provider.id,
         status = 'confirmed',
         updated_at = now()
   where id = v_appointment.id
     and status = 'pending'
     and (p_expected_updated_at is null or updated_at = p_expected_updated_at)
  returning *
    into v_updated;

  if not found then
    raise exception 'This appointment has already been updated.';
  end if;

  insert into public.audit_logs(user_name, action, entity, entity_id, metadata)
  values (
    coalesce(nullif(btrim(p_actor), ''), v_uid::text),
    'appointment_assignment_approved',
    'appointment',
    coalesce(v_updated.appointment_number, v_updated.id::text),
    jsonb_build_object(
      'appointmentId', v_updated.id,
      'providerId', v_provider.id,
      'branchId', v_updated.branch_id,
      'status', v_updated.status
    )
  );

  return v_updated;
exception
  when exclusion_violation then
    raise exception 'This dentist already has another appointment at this time.' using errcode = '23P01';
  when check_violation then
    if position('Selected dentist is not assigned to this appointment branch' in SQLERRM) > 0 then
      raise exception 'This dentist is not assigned to the selected branch.' using errcode = '23514';
    end if;
    raise;
end;
$$;

revoke all on function public.assign_appointment_provider(uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.assign_appointment_provider(uuid, uuid, text, timestamptz) to authenticated, service_role;
