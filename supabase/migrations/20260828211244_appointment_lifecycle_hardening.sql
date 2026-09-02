create or replace function public.appointment_transition_allowed_v134(
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
as $$
  select case
    when p_from = 'pending' then p_to in ('confirmed', 'rejected', 'cancelled')
    when p_from = 'confirmed' then p_to in ('checked_in', 'cancelled', 'no_show')
    when p_from = 'checked_in' then p_to in ('waiting', 'in_progress', 'cancelled')
    when p_from = 'waiting' then p_to in ('in_progress', 'cancelled')
    when p_from = 'in_progress' then p_to = 'completed'
    else false
  end;
$$;

create or replace function public.transition_appointment_status_v134(
  p_appointment_id uuid,
  p_next_status text,
  p_actor text default '',
  p_reason text default '',
  p_notes text default '',
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
  v_provider public.providers%rowtype;
  v_appointment public.appointments%rowtype;
  v_updated public.appointments%rowtype;
  v_actor text;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  select * into v_provider from public.providers where profile_id = v_uid and status = 'active' order by created_at limit 1;
  v_actor := coalesce(nullif(btrim(p_actor), ''), nullif(v_profile.full_name, ''), nullif(v_provider.display_name, ''), v_uid::text);

  select * into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then
    raise exception 'Appointment was not found.';
  end if;

  if v_appointment.branch_id is null then
    raise exception 'This appointment is missing a branch. No changes were saved.';
  end if;

  if p_expected_updated_at is not null and v_appointment.updated_at is distinct from p_expected_updated_at then
    raise exception 'This appointment has already been updated.';
  end if;

  if p_next_status = 'rescheduled' then
    raise exception 'Use the reschedule workflow to change appointment date or time.';
  end if;

  if not public.appointment_transition_allowed_v134(v_appointment.status, p_next_status) then
    raise exception 'This appointment cannot move from % to %.', replace(v_appointment.status, '_', ' '), replace(p_next_status, '_', ' ');
  end if;

  if p_next_status in ('checked_in', 'cancelled', 'no_show', 'rejected', 'confirmed') then
    if not public.can_operate_branch(v_appointment.branch_id::text) then
      raise exception 'You are not allowed to update appointments for this branch.' using errcode = '42501';
    end if;
  end if;

  if p_next_status = 'confirmed' then
    if not public.has_profile_permission('appointments.approve') then
      raise exception 'You do not have permission to confirm appointment requests.' using errcode = '42501';
    end if;
    if v_appointment.provider_id is null then
      raise exception 'Choose and confirm a dentist before confirming this appointment.';
    end if;
    perform public.validate_proposed_appointment_provider(v_appointment, v_appointment.provider_id);
  elsif p_next_status = 'rejected' then
    if not public.has_profile_permission('appointments.reject') then
      raise exception 'You do not have permission to reject appointment requests.' using errcode = '42501';
    end if;
  elsif p_next_status = 'checked_in' then
    if not public.has_profile_permission('appointments.check_in') then
      raise exception 'You do not have permission to check in patients.' using errcode = '42501';
    end if;
  elsif p_next_status = 'cancelled' then
    if not public.has_profile_permission('appointments.cancel') then
      raise exception 'You do not have permission to cancel appointments.' using errcode = '42501';
    end if;
  elsif p_next_status = 'no_show' then
    if not public.has_profile_permission('appointments.mark_no_show') then
      raise exception 'You do not have permission to mark no-shows.' using errcode = '42501';
    end if;
  elsif p_next_status in ('waiting', 'in_progress', 'completed') then
    if v_provider.id is null or v_appointment.provider_id is distinct from v_provider.id then
      raise exception 'Only the assigned dentist can update the clinical appointment flow.' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.provider_branch_assignments pba
      where pba.provider_id = v_provider.id
        and pba.branch_id = v_appointment.branch_id
        and pba.status = 'active'
    ) then
      raise exception 'Your dentist profile is not assigned to this appointment branch.' using errcode = '42501';
    end if;
    if p_next_status = 'in_progress' and not (public.has_profile_permission('appointments.start') or public.has_profile_permission('appointments.update_clinical_status')) then
      raise exception 'You do not have permission to start visits.' using errcode = '42501';
    end if;
    if p_next_status = 'completed' and not (public.has_profile_permission('appointments.complete') or public.has_profile_permission('appointments.update_clinical_status')) then
      raise exception 'You do not have permission to complete visits.' using errcode = '42501';
    end if;
  end if;

  update public.appointments
  set status = p_next_status,
      checked_in_at = case when p_next_status = 'checked_in' then now() else checked_in_at end,
      checked_in_by = case when p_next_status = 'checked_in' then v_actor else checked_in_by end,
      waiting_at = case when p_next_status = 'waiting' then now() else waiting_at end,
      started_at = case when p_next_status = 'in_progress' then now() else started_at end,
      started_by = case when p_next_status = 'in_progress' then v_actor else started_by end,
      completed_at = case when p_next_status = 'completed' then now() else completed_at end,
      completed_by = case when p_next_status = 'completed' then v_actor else completed_by end,
      cancelled_at = case when p_next_status = 'cancelled' then now() else cancelled_at end,
      cancelled_by = case when p_next_status = 'cancelled' then v_actor else cancelled_by end,
      no_show_at = case when p_next_status = 'no_show' then now() else no_show_at end,
      no_show_by = case when p_next_status = 'no_show' then v_actor else no_show_by end,
      updated_at = now()
  where id = v_appointment.id
    and status = v_appointment.status
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
    case
      when p_next_status = 'checked_in' then 'checked_in'
      when p_next_status = 'waiting' then 'moved_to_waiting'
      when p_next_status = 'in_progress' then 'started'
      when p_next_status = 'completed' then 'completed'
      when p_next_status = 'cancelled' then 'cancelled'
      when p_next_status = 'no_show' then 'no_show'
      else 'status_changed'
    end,
    v_appointment.status,
    v_updated.status,
    v_actor,
    now(),
    coalesce(p_reason, ''),
    coalesce(p_notes, ''),
    jsonb_build_object('branchId', v_updated.branch_id, 'providerId', v_updated.provider_id)
  );

  insert into public.audit_logs(user_name, action, entity, entity_id, metadata)
  values (
    v_actor,
    'appointment_status_changed',
    'appointment',
    coalesce(v_updated.appointment_number, v_updated.id::text),
    jsonb_build_object('appointmentId', v_updated.id, 'fromStatus', v_appointment.status, 'toStatus', v_updated.status, 'reason', p_reason)
  );

  return v_updated;
end;
$$;

create or replace function public.reschedule_appointment_v134(
  p_appointment_id uuid,
  p_branch_id uuid,
  p_provider_id uuid,
  p_appointment_date date,
  p_start_time time,
  p_end_time time,
  p_actor text default '',
  p_reason text default '',
  p_notes text default '',
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
  v_updated public.appointments%rowtype;
  v_actor text;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select coalesce(nullif(btrim(p_actor), ''), nullif(full_name, ''), v_uid::text)
    into v_actor
  from public.profiles
  where id = v_uid;
  v_actor := coalesce(v_actor, v_uid::text);

  if not public.has_profile_permission('appointments.reschedule') then
    raise exception 'You do not have permission to reschedule appointments.' using errcode = '42501';
  end if;

  select * into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then
    raise exception 'Appointment was not found.';
  end if;

  if p_expected_updated_at is not null and v_appointment.updated_at is distinct from p_expected_updated_at then
    raise exception 'This appointment has already been updated.';
  end if;

  if v_appointment.status not in ('confirmed', 'checked_in', 'waiting') then
    raise exception 'Only active confirmed appointments can be rescheduled.';
  end if;

  if p_branch_id is null or p_provider_id is null then
    raise exception 'Choose a branch and dentist for the rescheduled appointment.';
  end if;

  if not public.can_operate_branch(p_branch_id::text) then
    raise exception 'You are not allowed to reschedule appointments for this branch.' using errcode = '42501';
  end if;

  if p_start_time is null or p_end_time is null or p_start_time >= p_end_time then
    raise exception 'Choose a valid appointment time.';
  end if;

  if p_appointment_date < ((now() at time zone 'Asia/Manila')::date) then
    raise exception 'Appointment date must be today or later.';
  end if;

  if not public.provider_bookable_for_slot_v133(p_provider_id, p_branch_id, p_appointment_date, p_start_time, p_end_time, p_appointment_id) then
    raise exception 'The selected dentist is not available for that date and time.';
  end if;

  if exists (
    select 1
    from public.appointments a
    where a.id <> p_appointment_id
      and a.patient_id = v_appointment.patient_id
      and a.service_id = v_appointment.service_id
      and a.branch_id = p_branch_id
      and a.appointment_date = p_appointment_date
      and a.start_time = to_char(p_start_time, 'HH24:MI')
      and a.status in ('pending', 'confirmed', 'checked_in', 'waiting', 'in_progress')
  ) then
    raise exception 'This patient already has a matching appointment at this time.';
  end if;

  update public.appointments
  set branch_id = p_branch_id,
      provider_id = p_provider_id,
      proposed_provider_id = null,
      appointment_date = p_appointment_date,
      start_time = to_char(p_start_time, 'HH24:MI'),
      end_time = to_char(p_end_time, 'HH24:MI'),
      status = 'confirmed',
      rescheduled_at = now(),
      rescheduled_by = v_actor,
      updated_at = now()
  where id = v_appointment.id
    and status = v_appointment.status
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
    'rescheduled',
    v_appointment.status,
    v_updated.status,
    v_actor,
    now(),
    coalesce(p_reason, ''),
    coalesce(p_notes, ''),
    jsonb_build_object(
      'oldDate', v_appointment.appointment_date,
      'oldStartTime', v_appointment.start_time,
      'oldProviderId', v_appointment.provider_id,
      'newDate', v_updated.appointment_date,
      'newStartTime', v_updated.start_time,
      'newProviderId', v_updated.provider_id,
      'branchId', v_updated.branch_id
    )
  );

  insert into public.audit_logs(user_name, action, entity, entity_id, metadata)
  values (
    v_actor,
    'appointment_rescheduled',
    'appointment',
    coalesce(v_updated.appointment_number, v_updated.id::text),
    jsonb_build_object('appointmentId', v_updated.id, 'branchId', v_updated.branch_id, 'providerId', v_updated.provider_id, 'reason', p_reason)
  );

  return v_updated;
exception
  when exclusion_violation then
    raise exception 'This time is no longer available. Please choose another slot.' using errcode = '23P01';
end;
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
    raise exception 'Choose an eligible dentist before sending this appointment request.';
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

  if exists (
    select 1
    from public.appointments a
    where a.id <> p_appointment.id
      and a.provider_id = p_provider_id
      and a.appointment_date = p_appointment.appointment_date
      and a.status in ('confirmed', 'rescheduled', 'checked_in', 'waiting', 'in_progress')
      and v_start_time < a.end_time::time
      and v_end_time > a.start_time::time
  ) then
    raise exception 'This dentist already has another appointment at this time.';
  end if;

  if not public.provider_bookable_for_slot_v133(
    p_provider_id,
    p_appointment.branch_id,
    p_appointment.appointment_date,
    v_start_time,
    v_end_time,
    p_appointment.id
  ) then
    raise exception 'This dentist is not available at the requested time.';
  end if;
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

  if not public.provider_bookable_for_slot_v133(
    v_provider.id,
    v_appointment.branch_id,
    v_appointment.appointment_date,
    v_appointment.start_time::time,
    v_appointment.end_time::time,
    v_appointment.id
  ) then
    raise exception 'This dentist is not available at the requested time.';
  end if;

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
    jsonb_build_object('providerId', v_provider.id, 'branchId', v_updated.branch_id)
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
    raise exception 'This dentist already has another appointment at this time.' using errcode = '23P01';
end;
$$;

revoke all on function public.appointment_transition_allowed_v134(text, text) from public, anon;
revoke all on function public.transition_appointment_status_v134(uuid, text, text, text, text, timestamptz) from public, anon;
revoke all on function public.reschedule_appointment_v134(uuid, uuid, uuid, date, time, time, text, text, text, timestamptz) from public, anon;
revoke all on function public.validate_proposed_appointment_provider(public.appointments, uuid) from public, anon, authenticated;
revoke all on function public.accept_unassigned_appointment(uuid, uuid, text, timestamptz) from public, anon;

grant execute on function public.transition_appointment_status_v134(uuid, text, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.reschedule_appointment_v134(uuid, uuid, uuid, date, time, time, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.validate_proposed_appointment_provider(public.appointments, uuid) to service_role;
grant execute on function public.accept_unassigned_appointment(uuid, uuid, text, timestamptz) to authenticated, service_role;
