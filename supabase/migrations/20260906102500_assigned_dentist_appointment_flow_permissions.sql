-- Align the appointment UI with branch-aware lifecycle authorization.
-- Staff/super admins keep branch-scoped operational access. An authenticated active
-- dentist may operate only appointments assigned to their own provider record and
-- only at a branch where that provider has an active assignment.

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
  v_is_branch_operator boolean := false;
  v_is_assigned_provider boolean := false;
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
  if p_expected_updated_at is not null and v_appointment.updated_at is distinct from p_expected_updated_at then
    raise exception 'This appointment has already been updated.';
  end if;
  if p_next_status = 'rescheduled' then
    raise exception 'Use the reschedule workflow to change appointment date or time.';
  end if;
  if not public.appointment_transition_allowed_v134(v_appointment.status, p_next_status) then
    raise exception 'This appointment cannot move from % to %.', replace(v_appointment.status, '_', ' '), replace(p_next_status, '_', ' ');
  end if;

  v_is_branch_operator := public.appointment_actor_can_operate_branch(v_appointment.branch_id);
  v_is_assigned_provider := coalesce(
    v_provider.id is not null
    and v_appointment.provider_id = v_provider.id
    and exists (
      select 1
      from public.provider_branch_assignments pba
      where pba.provider_id = v_provider.id
        and pba.branch_id = v_appointment.branch_id
        and pba.status = 'active'
    ),
    false
  );

  if p_next_status in ('confirmed', 'rejected') and not v_is_branch_operator then
    raise exception 'You are not allowed to update appointments for this branch.' using errcode = '42501';
  end if;

  if p_next_status in ('checked_in', 'waiting', 'cancelled', 'no_show')
     and not (v_is_branch_operator or v_is_assigned_provider) then
    raise exception 'You are not allowed to update this appointment.' using errcode = '42501';
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
    if v_is_branch_operator then
      if not public.has_profile_permission('appointments.check_in') then
        raise exception 'You do not have permission to check in patients.' using errcode = '42501';
      end if;
    elsif not public.has_profile_permission('appointments.update_clinical_status') then
      raise exception 'You do not have permission to check in this assigned appointment.' using errcode = '42501';
    end if;

  elsif p_next_status = 'waiting' then
    if v_is_branch_operator then
      if not public.has_profile_permission('appointments.check_in') then
        raise exception 'You do not have permission to move patients to the waiting queue.' using errcode = '42501';
      end if;
    elsif not public.has_profile_permission('appointments.update_clinical_status') then
      raise exception 'You do not have permission to update this assigned appointment.' using errcode = '42501';
    end if;

  elsif p_next_status = 'cancelled' then
    if v_is_branch_operator then
      if not public.has_profile_permission('appointments.cancel') then
        raise exception 'You do not have permission to cancel appointments.' using errcode = '42501';
      end if;
    elsif not public.has_profile_permission('appointments.update_clinical_status') then
      raise exception 'You do not have permission to cancel this assigned appointment.' using errcode = '42501';
    end if;

  elsif p_next_status = 'no_show' then
    if v_is_branch_operator then
      if not public.has_profile_permission('appointments.mark_no_show') then
        raise exception 'You do not have permission to mark no-shows.' using errcode = '42501';
      end if;
    elsif not public.has_profile_permission('appointments.update_clinical_status') then
      raise exception 'You do not have permission to mark this assigned appointment as a no-show.' using errcode = '42501';
    end if;

  elsif p_next_status in ('in_progress', 'completed') then
    if not v_is_assigned_provider then
      raise exception 'Only the assigned dentist can update the clinical appointment flow.' using errcode = '42501';
    end if;
    if p_next_status = 'in_progress' and not (
      public.has_profile_permission('appointments.start')
      or public.has_profile_permission('appointments.update_clinical_status')
    ) then
      raise exception 'You do not have permission to start visits.' using errcode = '42501';
    end if;
    if p_next_status = 'completed' and not (
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
    jsonb_build_object(
      'branchId', v_updated.branch_id,
      'providerId', v_updated.provider_id,
      'branchOperator', v_is_branch_operator,
      'assignedProviderActor', v_is_assigned_provider
    )
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
      'reason', p_reason,
      'branchOperator', v_is_branch_operator,
      'assignedProviderActor', v_is_assigned_provider
    )
  );

  return v_updated;
end;
$$;

revoke all on function public.transition_appointment_status_v134(uuid, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.transition_appointment_status_v134(uuid, text, text, text, text, timestamptz) to authenticated, service_role;
