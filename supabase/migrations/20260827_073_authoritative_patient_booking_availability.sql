-- Make patient booking use the same authoritative provider schedule model used by
-- Super Admin dentist schedule management.

create or replace function public.patient_booking_provider_available_v132(
  p_branch_id uuid,
  p_provider_id uuid,
  p_appointment_date date,
  p_start_time time,
  p_end_time time
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_day smallint := extract(dow from p_appointment_date)::smallint;
  v_open time;
  v_close time;
  v_has_timed_override boolean := false;
  v_inside_window boolean := false;
begin
  if p_branch_id is null or p_provider_id is null or p_appointment_date is null or p_start_time is null or p_end_time is null then
    return false;
  end if;
  if p_start_time >= p_end_time then
    return false;
  end if;

  select b.opening_time, b.closing_time into v_open, v_close
  from public.branches b
  where b.id = p_branch_id and b.status = 'active';
  if not found or p_start_time < v_open or p_end_time > v_close then
    return false;
  end if;

  if not exists (
    select 1
    from public.providers pr
    join public.provider_branch_assignments pba on pba.provider_id = pr.id
    where pr.id = p_provider_id
      and pr.status = 'active'
      and pba.branch_id = p_branch_id
      and pba.status = 'active'
  ) then
    return false;
  end if;

  select exists (
    select 1
    from public.provider_availability_overrides o
    where o.provider_id = p_provider_id
      and o.override_date = p_appointment_date
      and (o.branch_id is null or o.branch_id = p_branch_id)
      and o.type in ('available', 'special_hours')
      and o.start_time is not null
      and o.end_time is not null
  ) into v_has_timed_override;

  if v_has_timed_override then
    select exists (
      select 1
      from public.provider_availability_overrides o
      where o.provider_id = p_provider_id
        and o.override_date = p_appointment_date
        and (o.branch_id is null or o.branch_id = p_branch_id)
        and o.type in ('available', 'special_hours')
        and p_start_time >= o.start_time
        and p_end_time <= o.end_time
    ) into v_inside_window;
  else
    select exists (
      select 1
      from public.provider_schedule_blocks b
      where b.provider_id = p_provider_id
        and b.branch_id = p_branch_id
        and b.day_of_week = v_day
        and b.status = 'active'
        and p_start_time >= b.start_time
        and p_end_time <= b.end_time
    ) into v_inside_window;
  end if;

  if not v_inside_window then
    return false;
  end if;

  if exists (
    select 1
    from public.provider_availability_overrides o
    where o.provider_id = p_provider_id
      and o.override_date = p_appointment_date
      and (o.branch_id is null or o.branch_id = p_branch_id)
      and o.type in ('unavailable', 'leave')
      and (
        o.start_time is null
        or o.end_time is null
        or (p_start_time < o.end_time and p_end_time > o.start_time)
      )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.schedule_blocks sb
    where sb.block_date = p_appointment_date
      and sb.branch_id = p_branch_id
      and (sb.provider_id is null or sb.provider_id = p_provider_id)
      and (
        sb.full_day
        or (p_start_time < sb.end_time::time and p_end_time > sb.start_time::time)
      )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.appointments a
    where a.appointment_date = p_appointment_date
      and a.provider_id = p_provider_id
      and a.status in ('pending', 'confirmed', 'rescheduled', 'checked_in', 'waiting', 'in_progress', 'completed')
      and p_start_time < a.end_time::time
      and p_end_time > a.start_time::time
  ) then
    return false;
  end if;

  return true;
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
declare
  v_uid uuid := auth.uid();
  v_patient public.patients%rowtype;
  v_service public.services%rowtype;
  v_appointment public.appointments%rowtype;
  v_provider_id uuid;
  v_operatory_id uuid;
  v_start_time time;
  v_end_time time;
  v_has_operatories boolean := false;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode='42501';
  end if;

  select * into v_patient
  from public.patients p
  where p.auth_user_id = v_uid and p.status = 'active'
  limit 1;
  if not found then
    raise exception 'Active patient profile not found.' using errcode='42501';
  end if;

  if p_branch_id is null or p_service_id is null then
    raise exception 'Branch and service are required.';
  end if;
  if p_appointment_date is null or p_appointment_date < current_date then
    raise exception 'Appointment date must be today or later.';
  end if;
  if nullif(btrim(coalesce(p_start_time,'')), '') is null then
    raise exception 'Appointment time is required.';
  end if;

  v_start_time := p_start_time::time;

  if not exists (select 1 from public.branches b where b.id=p_branch_id and b.status='active') then
    raise exception 'Selected branch is not available.';
  end if;

  select * into v_service
  from public.services s
  where s.id=p_service_id
    and s.status='active'
    and s.online_bookable
    and not s.internal_only
    and (cardinality(s.branch_ids)=0 or p_branch_id::text = any(s.branch_ids));
  if not found then
    raise exception 'Selected service is not available for patient booking at this branch.';
  end if;
  if coalesce(v_service.duration, 0) <= 0 then
    raise exception 'Selected service does not have a valid duration.';
  end if;

  v_end_time := (v_start_time + (v_service.duration * interval '1 minute'))::time;
  if v_start_time >= v_end_time then raise exception 'Appointment time is invalid.'; end if;

  if p_provider_id is not null then
    select a.* into v_appointment
    from public.appointments a
    where a.patient_id=v_patient.id
      and a.service_id=p_service_id
      and a.branch_id=p_branch_id
      and a.provider_id=p_provider_id
      and a.appointment_date=p_appointment_date
      and a.start_time=to_char(v_start_time,'HH24:MI')
      and a.status in ('pending','confirmed','rescheduled','checked_in','waiting','in_progress','completed')
    order by a.created_at desc
    limit 1;
    if found then return v_appointment; end if;
  end if;

  select pr.id into v_provider_id
  from public.providers pr
  join public.provider_branch_assignments pba on pba.provider_id = pr.id
  where pr.status = 'active'
    and pba.branch_id = p_branch_id
    and pba.status = 'active'
    and (p_provider_id is null or pr.id = p_provider_id)
    and public.patient_booking_provider_available_v132(p_branch_id, pr.id, p_appointment_date, v_start_time, v_end_time)
  order by pr.display_name, pr.id
  limit 1;

  if v_provider_id is null then
    raise exception 'That dentist schedule is no longer available. Please choose another time.';
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
      raise exception 'That operatory is no longer available. Please choose another time.';
    end if;
  end if;

  insert into public.appointments (
    patient_id, service_id, branch_id, provider_id, operatory_id, appointment_date,
    start_time, end_time, duration_minutes, estimated_amount_cents,
    reason_for_visit, patient_notes, notes, status, created_by,
    booking_source, payment_status, deposit_status
  ) values (
    v_patient.id, p_service_id, p_branch_id, v_provider_id, v_operatory_id, p_appointment_date,
    to_char(v_start_time,'HH24:MI'), to_char(v_end_time,'HH24:MI'), v_service.duration,
    round(v_service.price * 100)::integer,
    v_service.name, btrim(coalesce(p_notes,'')),
    case when btrim(coalesce(p_notes,''))='' then 'Requested through the patient portal.' else btrim(p_notes) end,
    'pending', v_uid::text, 'patient_portal', 'not_billed', 'not_required'
  ) returning * into v_appointment;

  return v_appointment;
exception
  when exclusion_violation then
    raise exception 'That time is no longer available. Please choose another time.';
end;
$$;

revoke all on function public.patient_booking_provider_available_v132(uuid,uuid,date,time,time) from public;
revoke all on function public.create_patient_portal_appointment(uuid,uuid,uuid,date,text,text) from public;
revoke all on function public.create_patient_portal_appointment(uuid,uuid,uuid,date,text,text) from anon;
grant execute on function public.create_patient_portal_appointment(uuid,uuid,uuid,date,text,text) to authenticated;

create index if not exists provider_schedule_blocks_booking_lookup_idx
  on public.provider_schedule_blocks(provider_id, branch_id, day_of_week, status, start_time, end_time);

create index if not exists provider_availability_overrides_booking_lookup_idx
  on public.provider_availability_overrides(provider_id, override_date, branch_id, type, start_time, end_time);
