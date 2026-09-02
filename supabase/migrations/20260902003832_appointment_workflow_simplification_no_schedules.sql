-- Simplified appointment workflow: requests start unassigned, then staff or an eligible
-- dentist confirms them. Historical schedule tables remain intact but are no longer
-- authoritative for patient booking or dentist assignment.

create or replace function public.appointment_actor_can_operate_branch(
  p_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select
      p.status = 'active'
      and (
        p.role = 'super_admin'
        or exists (
          select 1
          from public.staff_branch_assignments sba
          where sba.profile_id = p.id
            and sba.branch_id = p_branch_id
            and sba.status = 'active'
        )
      )
    from public.profiles p
    where p.id = auth.uid()
    limit 1
  ), false);
$$;

create or replace function public.appointment_provider_has_conflict(
  p_provider_id uuid,
  p_appointment_date date,
  p_start_time time,
  p_end_time time,
  p_exclude_appointment_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.appointments a
    where a.provider_id = p_provider_id
      and a.appointment_date = p_appointment_date
      and (p_exclude_appointment_id is null or a.id <> p_exclude_appointment_id)
      and a.status in ('confirmed', 'checked_in', 'waiting', 'in_progress')
      and p_start_time < a.end_time::time
      and p_end_time > a.start_time::time
  );
$$;

create or replace function public.validate_proposed_appointment_provider(
  p_appointment public.appointments,
  p_provider_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider public.providers%rowtype;
  v_start_time time;
  v_end_time time;
begin
  if p_provider_id is null then
    raise exception 'Choose an eligible dentist before confirming this appointment request.';
  end if;

  if p_appointment.branch_id is null then
    raise exception 'This appointment request is missing a branch. No changes were saved.';
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
    where pba.provider_id = p_provider_id
      and pba.branch_id = p_appointment.branch_id
      and pba.status = 'active'
  ) then
    raise exception 'This dentist is not assigned to the selected branch.';
  end if;

  v_start_time := p_appointment.start_time::time;
  v_end_time := p_appointment.end_time::time;

  perform pg_advisory_xact_lock(hashtext(p_provider_id::text || ':' || p_appointment.appointment_date::text));

  if public.appointment_provider_has_conflict(
    p_provider_id,
    p_appointment.appointment_date,
    v_start_time,
    v_end_time,
    p_appointment.id
  ) then
    raise exception 'This dentist already has an appointment during this time.';
  end if;
end;
$$;

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
    raise exception 'Your session expired. Please sign in again.' using errcode = '42501';
  end if;

  select * into v_patient
  from public.patients p
  where p.auth_user_id = v_uid and p.status = 'active'
  limit 1;
  if not found then
    raise exception 'Active patient profile not found.' using errcode = '42501';
  end if;

  if p_branch_id is null or p_service_id is null then
    raise exception 'Choose a service and branch before submitting.';
  end if;
  if p_appointment_date is null or p_appointment_date < ((now() at time zone 'Asia/Manila')::date) then
    raise exception 'Appointment date must be today or later.';
  end if;
  if nullif(btrim(coalesce(p_start_time, '')), '') is null then
    raise exception 'Appointment time is required.';
  end if;

  begin
    v_start_time := p_start_time::time;
  exception when others then
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
    and a.start_time = to_char(v_start_time, 'HH24:MI')
    and a.status in ('pending', 'confirmed', 'checked_in', 'waiting', 'in_progress')
  order by a.created_at desc
  limit 1;
  if found then
    return v_appointment;
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
          and a.status in ('pending', 'confirmed', 'checked_in', 'waiting', 'in_progress')
          and v_start_time < a.end_time::time
          and v_end_time > a.start_time::time
      )
    order by o.name, o.id
    limit 1;
  end if;

  insert into public.appointments (
    patient_id, service_id, branch_id, provider_id, proposed_provider_id, operatory_id,
    appointment_date, start_time, end_time, duration_minutes, estimated_amount_cents,
    reason_for_visit, patient_notes, notes, status, created_by,
    booking_source, payment_status, deposit_status
  ) values (
    v_patient.id, p_service_id, p_branch_id, null, null, v_operatory_id,
    p_appointment_date, to_char(v_start_time, 'HH24:MI'), to_char(v_end_time, 'HH24:MI'),
    v_service.duration, round(v_service.price * 100)::integer,
    v_service.name, btrim(coalesce(p_notes, '')),
    case when btrim(coalesce(p_notes, '')) = '' then 'Requested through the patient portal.' else btrim(p_notes) end,
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
  v_profile public.profiles%rowtype;
  v_appointment public.appointments%rowtype;
  v_provider public.providers%rowtype;
  v_updated public.appointments%rowtype;
  v_actor text;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid;

  if not public.has_profile_permission('appointments.approve')
     or not public.has_profile_permission('appointments.assign_dentist') then
    raise exception 'You do not have permission to assign dentists to appointment requests.' using errcode = '42501';
  end if;

  if p_appointment_id is null then
    raise exception 'Appointment request is required.';
  end if;
  if p_provider_id is null then
    raise exception 'Choose an eligible dentist before confirming this appointment request.';
  end if;

  select * into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then
    raise exception 'Appointment request not found.';
  end if;
  if p_expected_updated_at is not null and v_appointment.updated_at is distinct from p_expected_updated_at then
    raise exception 'This appointment has already been updated.';
  end if;
  if v_appointment.status <> 'pending' or v_appointment.provider_id is not null then
    raise exception 'This appointment has already been updated.';
  end if;
  if v_appointment.branch_id is null then
    raise exception 'This appointment request is missing a branch. No changes were saved.';
  end if;
  if not public.appointment_actor_can_operate_branch(v_appointment.branch_id) then
    raise exception 'You are not allowed to approve appointments for this branch.' using errcode = '42501';
  end if;

  select * into v_provider from public.providers where id = p_provider_id;
  if not found then
    raise exception 'Selected dentist was not found.';
  end if;

  perform public.validate_proposed_appointment_provider(v_appointment, v_provider.id);

  v_actor := coalesce(nullif(btrim(p_actor), ''), nullif(v_profile.full_name, ''), v_uid::text);

  update public.appointments
     set provider_id = v_provider.id,
         proposed_provider_id = null,
         provider_accepted_at = now(),
         provider_accepted_by = v_uid,
         status = 'confirmed',
         updated_at = now()
   where id = v_appointment.id
     and status = 'pending'
     and provider_id is null
     and (p_expected_updated_at is null or updated_at = p_expected_updated_at)
  returning * into v_updated;

  if not found then
    raise exception 'This appointment has already been updated.';
  end if;

  insert into public.appointment_status_history(
    id, appointment_id, event_type, from_status, to_status,
    changed_by, changed_at, reason, notes, metadata
  )
  values (
    'appt-history-' || extract(epoch from clock_timestamp())::bigint || '-' || substr(md5(random()::text), 1, 8),
    v_updated.id::text,
    'provider_changed',
    v_appointment.status,
    v_updated.status,
    v_actor,
    now(),
    '',
    '',
    jsonb_build_object('providerId', v_provider.id, 'branchId', v_updated.branch_id, 'assignedBy', v_uid)
  );

  insert into public.audit_logs(user_name, action, entity, entity_id, metadata)
  values (
    v_actor,
    'appointment_assignment_confirmed',
    'appointment',
    coalesce(v_updated.appointment_number, v_updated.id::text),
    jsonb_build_object('appointmentId', v_updated.id, 'providerId', v_provider.id, 'branchId', v_updated.branch_id, 'status', v_updated.status)
  );

  return v_updated;
exception
  when exclusion_violation then
    raise exception 'This dentist already has an appointment during this time.' using errcode = '23P01';
end;
$$;

create or replace function public.nominate_appointment_provider(
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
begin
  return public.assign_appointment_provider(
    p_appointment_id,
    p_provider_id,
    p_actor,
    p_expected_updated_at
  );
end;
$$;

create or replace function public.accept_unassigned_appointment(
  p_appointment_id uuid,
  p_provider_id uuid default null,
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
  v_provider public.providers%rowtype;
  v_appointment public.appointments%rowtype;
  v_updated public.appointments%rowtype;
  v_actor text;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_provider
  from public.providers
  where profile_id = v_uid
    and status = 'active'
    and (p_provider_id is null or id = p_provider_id)
  order by created_at
  limit 1;

  if not found then
    raise exception 'Active dentist profile not found.' using errcode = '42501';
  end if;

  v_actor := coalesce(nullif(btrim(p_actor), ''), nullif(v_provider.display_name, ''), v_uid::text);

  select * into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then
    raise exception 'Appointment request not found.';
  end if;
  if p_expected_updated_at is not null and v_appointment.updated_at is distinct from p_expected_updated_at then
    raise exception 'This appointment has already been updated.';
  end if;
  if v_appointment.status <> 'pending' or v_appointment.provider_id is not null then
    raise exception 'This appointment has already been updated.';
  end if;
  if v_appointment.proposed_provider_id is not null and v_appointment.proposed_provider_id is distinct from v_provider.id then
    raise exception 'This appointment request is already waiting for another dentist.' using errcode = '42501';
  end if;
  if v_appointment.branch_id is null then
    raise exception 'This appointment request is missing a branch. No changes were saved.';
  end if;
  if not exists (
    select 1
    from public.provider_branch_assignments pba
    where pba.provider_id = v_provider.id
      and pba.branch_id = v_appointment.branch_id
      and pba.status = 'active'
  ) then
    raise exception 'This dentist is not assigned to the selected branch.' using errcode = '42501';
  end if;

  perform public.validate_proposed_appointment_provider(v_appointment, v_provider.id);

  update public.appointments
  set provider_id = v_provider.id,
      proposed_provider_id = null,
      status = 'confirmed',
      provider_accepted_at = now(),
      provider_accepted_by = v_uid,
      updated_at = now()
  where id = v_appointment.id
    and status = 'pending'
    and provider_id is null
    and (proposed_provider_id is null or proposed_provider_id = v_provider.id)
    and (p_expected_updated_at is null or updated_at = p_expected_updated_at)
  returning * into v_updated;

  if not found then
    raise exception 'This appointment has already been updated.';
  end if;

  insert into public.appointment_status_history(
    id, appointment_id, event_type, from_status, to_status,
    changed_by, changed_at, reason, notes, metadata
  )
  values (
    'appt-history-' || extract(epoch from clock_timestamp())::bigint || '-' || substr(md5(random()::text), 1, 8),
    v_updated.id::text,
    'provider_changed',
    v_appointment.status,
    v_updated.status,
    v_actor,
    now(),
    '',
    '',
    jsonb_build_object('providerId', v_provider.id, 'branchId', v_updated.branch_id, 'acceptedBy', v_uid)
  );

  insert into public.audit_logs(user_name, action, entity, entity_id, metadata)
  values (
    v_actor,
    'appointment_provider_accepted',
    'appointment',
    coalesce(v_updated.appointment_number, v_updated.id::text),
    jsonb_build_object('appointmentId', v_updated.id, 'providerId', v_provider.id, 'branchId', v_updated.branch_id, 'status', v_updated.status)
  );

  return v_updated;
exception
  when exclusion_violation then
    raise exception 'This dentist already has an appointment during this time.' using errcode = '23P01';
end;
$$;

create or replace function public.accept_nominated_appointment(
  p_appointment_id uuid,
  p_expected_updated_at timestamptz default null
)
returns public.appointments
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return public.accept_unassigned_appointment(
    p_appointment_id,
    null,
    '',
    p_expected_updated_at
  );
end;
$$;

revoke all on function public.appointment_actor_can_operate_branch(uuid) from public, anon;
revoke all on function public.appointment_provider_has_conflict(uuid, date, time, time, uuid) from public, anon;
revoke all on function public.validate_proposed_appointment_provider(public.appointments, uuid) from public, anon, authenticated;
revoke all on function public.create_patient_appointment_request(uuid, uuid, date, text, text) from public, anon;
revoke all on function public.create_patient_portal_appointment(uuid, uuid, uuid, date, text, text) from public, anon;
revoke all on function public.assign_appointment_provider(uuid, uuid, text, timestamptz) from public, anon;
revoke all on function public.nominate_appointment_provider(uuid, uuid, text, timestamptz) from public, anon;
revoke all on function public.accept_unassigned_appointment(uuid, uuid, text, timestamptz) from public, anon;
revoke all on function public.accept_nominated_appointment(uuid, timestamptz) from public, anon;

grant execute on function public.appointment_actor_can_operate_branch(uuid) to authenticated, service_role;
grant execute on function public.create_patient_appointment_request(uuid, uuid, date, text, text) to authenticated, service_role;
grant execute on function public.create_patient_portal_appointment(uuid, uuid, uuid, date, text, text) to authenticated, service_role;
grant execute on function public.assign_appointment_provider(uuid, uuid, text, timestamptz) to authenticated, service_role;
grant execute on function public.nominate_appointment_provider(uuid, uuid, text, timestamptz) to authenticated, service_role;
grant execute on function public.accept_unassigned_appointment(uuid, uuid, text, timestamptz) to authenticated, service_role;
grant execute on function public.accept_nominated_appointment(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.validate_proposed_appointment_provider(public.appointments, uuid) to service_role;
grant execute on function public.appointment_provider_has_conflict(uuid, date, time, time, uuid) to service_role;
