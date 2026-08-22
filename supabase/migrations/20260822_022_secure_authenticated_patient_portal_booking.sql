-- Authenticated patient portal booking: derive patient identity from auth.uid(),
-- validate clinic configuration server-side, and return the durable DB row.
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
  v_end_time text;
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
  perform p_start_time::time;

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

  if p_provider_id is not null and not exists (
    select 1
    from public.providers pr
    join public.provider_branch_assignments pba on pba.provider_id=pr.id
    where pr.id=p_provider_id and pr.status='active'
      and pba.branch_id=p_branch_id and pba.status='active'
  ) then
    raise exception 'Selected dentist is not available at this branch.';
  end if;

  v_end_time := to_char((p_start_time::time + (v_service.duration * interval '1 minute'))::time, 'HH24:MI');
  if p_start_time >= v_end_time then raise exception 'Appointment time is invalid.'; end if;

  -- Idempotency for rapid duplicate submissions by the same authenticated patient.
  select a.* into v_appointment
  from public.appointments a
  where a.patient_id=v_patient.id
    and a.service_id=p_service_id
    and a.branch_id=p_branch_id
    and a.appointment_date=p_appointment_date
    and a.start_time=to_char(p_start_time::time,'HH24:MI')
    and coalesce(a.provider_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(p_provider_id,'00000000-0000-0000-0000-000000000000'::uuid)
    and a.status in ('pending','confirmed','rescheduled','checked_in','waiting','in_progress','completed')
  order by a.created_at desc
  limit 1;
  if found then return v_appointment; end if;

  insert into public.appointments (
    patient_id, service_id, branch_id, provider_id, appointment_date,
    start_time, end_time, duration_minutes, estimated_amount_cents,
    reason_for_visit, patient_notes, notes, status, created_by,
    booking_source, payment_status, deposit_status
  ) values (
    v_patient.id, p_service_id, p_branch_id, p_provider_id, p_appointment_date,
    to_char(p_start_time::time,'HH24:MI'), v_end_time, v_service.duration,
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

revoke all on function public.create_patient_portal_appointment(uuid,uuid,uuid,date,text,text) from public;
revoke all on function public.create_patient_portal_appointment(uuid,uuid,uuid,date,text,text) from anon;
grant execute on function public.create_patient_portal_appointment(uuid,uuid,uuid,date,text,text) to authenticated;
