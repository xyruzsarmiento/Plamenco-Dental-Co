-- Appointment reliability hardening.
-- Supabase/PostgreSQL is the source of truth for lifecycle mutations and slot ownership.
-- Historical schedule tables are intentionally not consulted by these functions.

create or replace function public.appointment_branch_has_conflict(
  p_branch_id uuid,
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
    where a.branch_id = p_branch_id
      and a.appointment_date = p_appointment_date
      and (p_exclude_appointment_id is null or a.id <> p_exclude_appointment_id)
      and a.status in ('pending', 'confirmed', 'checked_in', 'waiting', 'in_progress')
      and p_start_time < a.end_time::time
      and p_end_time > a.start_time::time
  );
$$;

create or replace function public.enforce_appointment_branch_slot_v160()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_start_time time;
  v_end_time time;
begin
  -- Completed/closed appointments do not reserve a future slot.
  if new.status not in ('pending', 'confirmed', 'checked_in', 'waiting', 'in_progress') then
    return new;
  end if;

  if new.branch_id is null or new.appointment_date is null then
    return new;
  end if;

  begin
    v_start_time := new.start_time::time;
    v_end_time := new.end_time::time;
  exception when others then
    raise exception 'Choose a valid appointment time.';
  end;

  if v_start_time is null or v_end_time is null or v_start_time >= v_end_time then
    raise exception 'Choose a valid appointment time.';
  end if;

  -- Serialize all slot decisions for a branch/day. This closes the race where
  -- two browsers can both see an open slot and submit before either insert commits.
  perform pg_advisory_xact_lock(
    hashtext(new.branch_id::text || ':' || new.appointment_date::text)
  );

  if public.appointment_branch_has_conflict(
    new.branch_id,
    new.appointment_date,
    v_start_time,
    v_end_time,
    new.id
  ) then
    raise exception 'This time is no longer available. Please choose another slot.' using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_branch_slot_guard_v160 on public.appointments;
create trigger appointments_branch_slot_guard_v160
before insert or update of branch_id, appointment_date, start_time, end_time
on public.appointments
for each row
execute function public.enforce_appointment_branch_slot_v160();

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
  select * into v_provider
  from public.providers
  where profile_id = v_uid and status = 'active'
  order by created_at
  limit 1;
  v_actor := coalesce(
    nullif(btrim(p_actor), ''),
    nullif(v_profile.full_name, ''),
    nullif(v_provider.display_name, ''),
    v_uid::text
  );

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
  if p_expected_updated_at is not null
     and v_appointment.updated_at is distinct from p_expected_updated_at then
    raise exception 'This appointment has already been updated.';
  end if;
  if p_next_status = 'rescheduled' then
    raise exception 'Use the reschedule workflow to change appointment date or time.';
  end if;
  if not public.appointment_transition_allowed_v134(v_appointment.status, p_next_status) then
    raise exception 'This appointment cannot move from % to %.',
      replace(v_appointment.status, '_', ' '),
      replace(p_next_status, '_', ' ');
  end if;

  -- Use the current appointment workflow's branch authorization model. The old
  -- can_operate_branch helper predates staff_branch_assignments and incorrectly
  -- rejected valid front-desk/super-admin actions in some accounts.
  if p_next_status in ('checked_in', 'cancelled', 'no_show', 'rejected', 'confirmed')
     and not public.appointment_actor_can_operate_branch(v_appointment.branch_id) then
    raise exception 'You are not allowed to update appointments for this branch.' using errcode = '42501';
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
      select 1
      from public.provider_branch_assignments pba
      where pba.provider_id = v_provider.id
        and pba.branch_id = v_appointment.branch_id
        and pba.status = 'active'
    ) then
      raise exception 'Your dentist profile is not assigned to this appointment branch.' using errcode = '42501';
    end if;
    if p_next_status = 'in_progress'
       and not (
         public.has_profile_permission('appointments.start')
         or public.has_profile_permission('appointments.update_clinical_status')
       ) then
      raise exception 'You do not have permission to start visits.' using errcode = '42501';
    end if;
    if p_next_status = 'completed'
       and not (
         public.has_profile_permission('appointments.complete')
         or public.has_profile_permission('appointments.update_clinical_status')
       ) then
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
  ) values (
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
    jsonb_build_object(
      'appointmentId', v_updated.id,
      'fromStatus', v_appointment.status,
      'toStatus', v_updated.status,
      'reason', p_reason
    )
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
  v_proposed public.appointments%rowtype;
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
  if p_expected_updated_at is not null
     and v_appointment.updated_at is distinct from p_expected_updated_at then
    raise exception 'This appointment has already been updated.';
  end if;
  if v_appointment.status not in ('confirmed', 'checked_in', 'waiting') then
    raise exception 'Only active confirmed appointments can be rescheduled.';
  end if;
  if p_branch_id is null or p_provider_id is null then
    raise exception 'Choose a branch and dentist for the rescheduled appointment.';
  end if;
  if not public.appointment_actor_can_operate_branch(p_branch_id) then
    raise exception 'You are not allowed to reschedule appointments for this branch.' using errcode = '42501';
  end if;
  if p_start_time is null or p_end_time is null or p_start_time >= p_end_time then
    raise exception 'Choose a valid appointment time.';
  end if;
  if p_appointment_date < ((now() at time zone 'Asia/Manila')::date) then
    raise exception 'Appointment date must be today or later.';
  end if;

  -- Serialize the branch/day before validating the proposed slot. The write
  -- trigger below repeats the check, which also protects direct table writes.
  perform pg_advisory_xact_lock(hashtext(p_branch_id::text || ':' || p_appointment_date::text));

  if public.appointment_branch_has_conflict(
    p_branch_id,
    p_appointment_date,
    p_start_time,
    p_end_time,
    p_appointment_id
  ) then
    raise exception 'This time is no longer available. Please choose another slot.' using errcode = '23P01';
  end if;

  v_proposed := v_appointment;
  v_proposed.branch_id := p_branch_id;
  v_proposed.provider_id := p_provider_id;
  v_proposed.appointment_date := p_appointment_date;
  v_proposed.start_time := to_char(p_start_time, 'HH24:MI');
  v_proposed.end_time := to_char(p_end_time, 'HH24:MI');
  perform public.validate_proposed_appointment_provider(v_proposed, p_provider_id);

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
  ) values (
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
    jsonb_build_object(
      'appointmentId', v_updated.id,
      'branchId', v_updated.branch_id,
      'providerId', v_updated.provider_id,
      'reason', p_reason
    )
  );

  return v_updated;
exception
  when exclusion_violation then
    raise exception 'This time is no longer available. Please choose another slot.' using errcode = '23P01';
end;
$$;

revoke all on function public.appointment_branch_has_conflict(uuid, date, time, time, uuid) from public, anon;
revoke all on function public.enforce_appointment_branch_slot_v160() from public, anon, authenticated;
revoke all on function public.transition_appointment_status_v134(uuid, text, text, text, text, timestamptz) from public, anon;
revoke all on function public.reschedule_appointment_v134(uuid, uuid, uuid, date, time, time, text, text, text, timestamptz) from public, anon;

grant execute on function public.appointment_branch_has_conflict(uuid, date, time, time, uuid) to authenticated, service_role;
grant execute on function public.transition_appointment_status_v134(uuid, text, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.reschedule_appointment_v134(uuid, uuid, uuid, date, time, time, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.enforce_appointment_branch_slot_v160() to service_role;
