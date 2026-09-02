-- Align patient-originated booking requests with the unassigned pending-request model.
-- Patients choose service, branch, date, and time; clinic staff assigns the dentist later.

create or replace function public.create_patient_appointment_request(
  p_branch_id uuid,
  p_service_id uuid,
  p_appointment_date date,
  p_start_time text,
  p_notes text default ''
)
returns public.appointments
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_patient public.patients%rowtype;
  v_service public.services%rowtype;
  v_appointment public.appointments%rowtype;
  v_operatory_id uuid;
  v_start_time time;
  v_end_time time;
  v_open time;
  v_close time;
  v_has_operatories boolean := false;
begin
  if v_uid is null then
    raise exception 'Your session expired. Please sign in again.' using errcode='42501';
  end if;

  select * into v_patient
  from public.patients p
  where p.auth_user_id = v_uid and p.status = 'active'
  limit 1;
  if not found then
    raise exception 'Active patient profile not found.' using errcode='42501';
  end if;

  if p_branch_id is null or p_service_id is null then
    raise exception 'Choose a service and branch before submitting.';
  end if;
  if p_appointment_date is null or p_appointment_date < ((now() at time zone 'Asia/Manila')::date) then
    raise exception 'Appointment date must be today or later.';
  end if;
  if nullif(btrim(coalesce(p_start_time,'')), '') is null then
    raise exception 'Appointment time is required.';
  end if;

  begin
    v_start_time := p_start_time::time;
  exception
    when others then
      raise exception 'Appointment time is invalid.';
  end;

  select b.opening_time, b.closing_time into v_open, v_close
  from public.branches b
  where b.id = p_branch_id and b.status = 'active';
  if not found then
    raise exception 'Selected branch is not available.';
  end if;

  select * into v_service
  from public.services s
  where s.id = p_service_id
    and s.status = 'active'
    and s.online_bookable
    and not s.internal_only
    and (cardinality(s.branch_ids) = 0 or p_branch_id::text = any(s.branch_ids));
  if not found then
    raise exception 'Selected service is not available for patient booking at this branch.';
  end if;
  if coalesce(v_service.duration, 0) <= 0 then
    raise exception 'Selected service does not have a valid duration.';
  end if;

  v_end_time := (v_start_time + (v_service.duration * interval '1 minute'))::time;
  if v_start_time >= v_end_time then
    raise exception 'Appointment time is invalid.';
  end if;

  if v_start_time < v_open or v_end_time > v_close then
    raise exception 'The clinic is closed at the selected time.';
  end if;

  select a.* into v_appointment
  from public.appointments a
  where a.patient_id = v_patient.id
    and a.service_id = p_service_id
    and a.branch_id = p_branch_id
    and a.provider_id is null
    and a.appointment_date = p_appointment_date
    and a.start_time = to_char(v_start_time,'HH24:MI')
    and a.status in ('pending','confirmed','rescheduled','checked_in','waiting','in_progress','completed')
  order by a.created_at desc
  limit 1;
  if found then
    return v_appointment;
  end if;

  if exists (
    select 1
    from public.schedule_blocks sb
    where sb.block_date = p_appointment_date
      and sb.branch_id = p_branch_id
      and sb.provider_id is null
      and sb.operatory_id is null
      and (
        sb.full_day
        or (v_start_time < sb.end_time::time and v_end_time > sb.start_time::time)
      )
  ) then
    raise exception 'This time is no longer available. Please choose another slot.';
  end if;

  select exists (
    select 1 from public.operatories o where o.branch_id = p_branch_id and o.status = 'active'
  ) into v_has_operatories;

  if v_has_operatories then
    select o.id into v_operatory_id
    from public.operatories o
    where o.branch_id = p_branch_id
      and o.status = 'active'
      and not exists (
        select 1
        from public.appointments a
        where a.appointment_date = p_appointment_date
          and a.operatory_id = o.id
          and a.status in ('pending', 'confirmed', 'rescheduled', 'checked_in', 'waiting', 'in_progress', 'completed')
          and v_start_time < a.end_time::time
          and v_end_time > a.start_time::time
      )
      and not exists (
        select 1
        from public.schedule_blocks sb
        where sb.block_date = p_appointment_date
          and sb.branch_id = p_branch_id
          and sb.operatory_id = o.id
          and (
            sb.full_day
            or (v_start_time < sb.end_time::time and v_end_time > sb.start_time::time)
          )
      )
    order by o.name, o.id
    limit 1;

    if v_operatory_id is null then
      raise exception 'This time is no longer available. Please choose another slot.';
    end if;
  end if;

  insert into public.appointments (
    patient_id, service_id, branch_id, provider_id, operatory_id, appointment_date,
    start_time, end_time, duration_minutes, estimated_amount_cents,
    reason_for_visit, patient_notes, notes, status, created_by,
    booking_source, payment_status, deposit_status
  ) values (
    v_patient.id, p_service_id, p_branch_id, null, v_operatory_id, p_appointment_date,
    to_char(v_start_time,'HH24:MI'), to_char(v_end_time,'HH24:MI'), v_service.duration,
    round(v_service.price * 100)::integer,
    v_service.name, btrim(coalesce(p_notes,'')),
    case when btrim(coalesce(p_notes,'')) = '' then 'Requested through the patient portal.' else btrim(p_notes) end,
    'pending', v_uid::text, 'patient_portal', 'not_billed', 'not_required'
  ) returning * into v_appointment;

  return v_appointment;
exception
  when exclusion_violation then
    raise exception 'This time is no longer available. Please choose another slot.';
end;
$$;

create or replace function public.create_patient_portal_appointment(
  p_branch_id uuid,
  p_service_id uuid,
  p_provider_id uuid,
  p_appointment_date date,
  p_start_time text,
  p_notes text default ''
)
returns public.appointments
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return public.create_patient_appointment_request(
    p_branch_id,
    p_service_id,
    p_appointment_date,
    p_start_time,
    p_notes
  );
end;
$$;

create index if not exists appointments_patient_portal_duplicate_lookup_idx
  on public.appointments(patient_id, branch_id, service_id, appointment_date, start_time)
  where provider_id is null and status in ('pending','confirmed','rescheduled','checked_in','waiting','in_progress','completed');

revoke all on function public.create_patient_appointment_request(uuid,uuid,date,text,text) from public;
revoke all on function public.create_patient_appointment_request(uuid,uuid,date,text,text) from anon;
grant execute on function public.create_patient_appointment_request(uuid,uuid,date,text,text) to authenticated;

revoke all on function public.create_patient_portal_appointment(uuid,uuid,uuid,date,text,text) from public;
revoke all on function public.create_patient_portal_appointment(uuid,uuid,uuid,date,text,text) from anon;
grant execute on function public.create_patient_portal_appointment(uuid,uuid,uuid,date,text,text) to authenticated;
