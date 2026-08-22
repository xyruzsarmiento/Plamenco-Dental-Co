-- services.price is stored in Philippine pesos. Appointment estimated_amount_cents
-- must therefore multiply the catalogue price by 100.
create or replace function public.create_public_booking(
  p_branch_id uuid,
  p_service_id uuid,
  p_provider_id uuid,
  p_appointment_date date,
  p_start_time text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_notes text default ''::text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.services%rowtype;
  v_patient public.patients%rowtype;
  v_appointment public.appointments%rowtype;
  v_end_time text;
  v_email text := lower(trim(coalesce(p_email,'')));
  v_phone text := trim(coalesce(p_phone,''));
  v_first text := trim(coalesce(p_first_name,''));
  v_last text := trim(coalesce(p_last_name,''));
  v_patient_number text;
begin
  if p_branch_id is null or p_service_id is null then raise exception 'Branch and service are required.'; end if;
  if p_appointment_date is null or p_appointment_date < current_date then raise exception 'Appointment date must be today or later.'; end if;
  if nullif(trim(coalesce(p_start_time,'')), '') is null then raise exception 'Appointment time is required.'; end if;
  if v_first = '' or v_last = '' or v_email = '' or v_phone = '' then raise exception 'First name, last name, email, and phone are required.'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'A valid email address is required.'; end if;
  if length(v_first) > 120 or length(v_last) > 120 or length(v_email) > 320 or length(v_phone) > 50 or length(coalesce(p_notes,'')) > 2000 then
    raise exception 'One or more booking fields exceed the allowed length.';
  end if;
  perform p_start_time::time;

  if not exists (select 1 from public.branches b where b.id=p_branch_id and b.status='active') then raise exception 'Selected branch is not available.'; end if;

  select * into v_service
  from public.services s
  where s.id=p_service_id
    and s.status='active'
    and s.online_bookable
    and not s.internal_only
    and s.show_on_website
    and (cardinality(s.branch_ids)=0 or p_branch_id::text = any(s.branch_ids));
  if not found then raise exception 'Selected service is not available for online booking at this branch.'; end if;

  if p_provider_id is not null and not exists (
    select 1 from public.providers pr
    join public.provider_branch_assignments pba on pba.provider_id=pr.id
    where pr.id=p_provider_id and pr.status='active' and pba.branch_id=p_branch_id and pba.status='active'
  ) then raise exception 'Selected dentist is not available at this branch.'; end if;

  v_end_time := to_char((p_start_time::time + (v_service.duration * interval '1 minute'))::time, 'HH24:MI');
  if p_start_time >= v_end_time then raise exception 'Appointment time is invalid.'; end if;

  select p.* into v_patient
  from public.patients p
  where (v_email <> '' and lower(p.email)=v_email) or (v_phone <> '' and trim(p.phone)=v_phone)
  order by case when p.status='active' then 0 else 1 end, p.created_at
  limit 1;

  if not found then
    v_patient_number := 'PT-ONL-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
    insert into public.patients (
      patient_id, first_name, middle_name, last_name, phone, email,
      registration_date, status, origin, medical_notes, administrative_notes
    ) values (
      v_patient_number, v_first, '', v_last, v_phone, v_email,
      current_date, 'active', 'online_registration',
      'Patient created through secure online booking.', ''
    ) returning * into v_patient;
  elsif v_patient.status <> 'active' then
    raise exception 'An existing patient account with these contact details is inactive. Please contact the clinic.';
  end if;

  select a.* into v_appointment
  from public.appointments a
  where a.patient_id=v_patient.id
    and a.service_id=p_service_id
    and a.appointment_date=p_appointment_date
    and a.start_time=to_char(p_start_time::time,'HH24:MI')
    and a.status in ('pending','confirmed','rescheduled','checked_in','waiting','in_progress','completed')
  order by a.created_at desc
  limit 1;

  if found then
    return jsonb_build_object('id',v_appointment.id,'appointment_number',v_appointment.appointment_number,'patient_id',v_patient.patient_id,'duplicate',true);
  end if;

  insert into public.appointments (
    patient_id, service_id, branch_id, provider_id, appointment_date,
    start_time, end_time, duration_minutes, estimated_amount_cents,
    reason_for_visit, patient_notes, notes, status, created_by,
    booking_source, payment_status, deposit_status
  ) values (
    v_patient.id, p_service_id, p_branch_id, p_provider_id, p_appointment_date,
    to_char(p_start_time::time,'HH24:MI'), v_end_time, v_service.duration, round(v_service.price * 100)::integer,
    v_service.name, trim(coalesce(p_notes,'')),
    case when trim(coalesce(p_notes,''))='' then 'Online booking for '||v_service.name else trim(p_notes) end,
    'pending', 'public-booking', 'patient_portal', 'not_billed', 'not_required'
  ) returning * into v_appointment;

  return jsonb_build_object('id',v_appointment.id,'appointment_number',v_appointment.appointment_number,'patient_id',v_patient.patient_id,'duplicate',false);
exception
  when exclusion_violation then raise exception 'That time is no longer available. Please choose another time.';
end;
$$;

revoke all on function public.create_public_booking(uuid,uuid,uuid,date,text,text,text,text,text,text) from public;
grant execute on function public.create_public_booking(uuid,uuid,uuid,date,text,text,text,text,text,text) to anon, authenticated;
