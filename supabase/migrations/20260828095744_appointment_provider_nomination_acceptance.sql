alter table public.appointments
  add column if not exists proposed_provider_id uuid references public.providers(id) on delete set null,
  add column if not exists provider_accepted_at timestamptz,
  add column if not exists provider_accepted_by uuid references public.profiles(id) on delete set null,
  add column if not exists provider_declined_at timestamptz,
  add column if not exists provider_declined_by uuid references public.providers(id) on delete set null;

create index if not exists appointments_proposed_provider_status_idx
  on public.appointments(proposed_provider_id, status, appointment_date, start_time)
  where proposed_provider_id is not null;

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
      and a.status in ('pending', 'confirmed', 'rescheduled', 'checked_in', 'waiting', 'in_progress', 'completed')
      and v_start_time < a.end_time::time
      and v_end_time > a.start_time::time
  ) then
    raise exception 'This dentist already has another appointment at this time.';
  end if;

  if not public.patient_booking_provider_available_v132(
    p_appointment.branch_id,
    p_provider_id,
    p_appointment.appointment_date,
    v_start_time,
    v_end_time
  ) then
    raise exception 'This dentist is not available at the requested time.';
  end if;
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
declare
  v_uid uuid := auth.uid();
  v_appointment public.appointments%rowtype;
  v_updated public.appointments%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not public.has_profile_permission('appointments.assign_dentist') then
    raise exception 'You do not have permission to nominate dentists for appointment requests.'
      using errcode = '42501';
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

  if v_appointment.status <> 'pending' or v_appointment.provider_id is not null then
    raise exception 'This appointment has already been updated.';
  end if;

  if not public.can_operate_branch(v_appointment.branch_id::text) then
    raise exception 'You are not allowed to nominate dentists for this branch.'
      using errcode = '42501';
  end if;

  perform public.validate_proposed_appointment_provider(v_appointment, p_provider_id);

  update public.appointments
     set proposed_provider_id = p_provider_id,
         provider_declined_at = null,
         provider_declined_by = null,
         updated_at = now()
   where id = v_appointment.id
     and status = 'pending'
     and provider_id is null
     and (p_expected_updated_at is null or updated_at = p_expected_updated_at)
  returning *
    into v_updated;

  if not found then
    raise exception 'This appointment has already been updated.';
  end if;

  insert into public.audit_logs(user_name, action, entity, entity_id, metadata)
  values (
    coalesce(nullif(btrim(p_actor), ''), v_uid::text),
    'appointment_provider_nominated',
    'appointment',
    coalesce(v_updated.appointment_number, v_updated.id::text),
    jsonb_build_object(
      'appointmentId', v_updated.id,
      'proposedProviderId', p_provider_id,
      'branchId', v_updated.branch_id,
      'status', v_updated.status
    )
  );

  return v_updated;
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
declare
  v_uid uuid := auth.uid();
  v_provider public.providers%rowtype;
  v_appointment public.appointments%rowtype;
  v_updated public.appointments%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
    into v_provider
  from public.providers
  where profile_id = v_uid
    and status = 'active'
  order by created_at
  limit 1;

  if not found then
    raise exception 'Active dentist profile not found.' using errcode = '42501';
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

  if v_appointment.status <> 'pending' or v_appointment.provider_id is not null then
    raise exception 'This appointment has already been updated.';
  end if;

  if v_appointment.proposed_provider_id is distinct from v_provider.id then
    raise exception 'This appointment request is not nominated to your dentist profile.' using errcode = '42501';
  end if;

  perform public.validate_proposed_appointment_provider(v_appointment, v_provider.id);

  update public.appointments
     set provider_id = v_provider.id,
         status = 'confirmed',
         provider_accepted_at = now(),
         provider_accepted_by = v_uid,
         updated_at = now()
   where id = v_appointment.id
     and status = 'pending'
     and provider_id is null
     and proposed_provider_id = v_provider.id
     and (p_expected_updated_at is null or updated_at = p_expected_updated_at)
  returning *
    into v_updated;

  if not found then
    raise exception 'This appointment has already been updated.';
  end if;

  insert into public.audit_logs(user_name, action, entity, entity_id, metadata)
  values (
    coalesce(nullif(v_provider.display_name, ''), v_uid::text),
    'appointment_provider_accepted',
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
end;
$$;

create or replace function public.decline_nominated_appointment(
  p_appointment_id uuid,
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
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
    into v_provider
  from public.providers
  where profile_id = v_uid
  order by created_at
  limit 1;

  if not found then
    raise exception 'Dentist profile not found.' using errcode = '42501';
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

  if v_appointment.status <> 'pending' or v_appointment.provider_id is not null then
    raise exception 'This appointment has already been updated.';
  end if;

  if v_appointment.proposed_provider_id is distinct from v_provider.id then
    raise exception 'This appointment request is not nominated to your dentist profile.' using errcode = '42501';
  end if;

  update public.appointments
     set proposed_provider_id = null,
         provider_declined_at = now(),
         provider_declined_by = v_provider.id,
         updated_at = now()
   where id = v_appointment.id
     and status = 'pending'
     and provider_id is null
     and proposed_provider_id = v_provider.id
     and (p_expected_updated_at is null or updated_at = p_expected_updated_at)
  returning *
    into v_updated;

  if not found then
    raise exception 'This appointment has already been updated.';
  end if;

  insert into public.audit_logs(user_name, action, entity, entity_id, metadata)
  values (
    coalesce(nullif(v_provider.display_name, ''), v_uid::text),
    'appointment_provider_declined',
    'appointment',
    coalesce(v_updated.appointment_number, v_updated.id::text),
    jsonb_build_object(
      'appointmentId', v_updated.id,
      'declinedProviderId', v_provider.id,
      'branchId', v_updated.branch_id,
      'status', v_updated.status
    )
  );

  return v_updated;
end;
$$;

-- Backward-compatible name for older clients. It now nominates only and leaves
-- provider_id/status untouched until the dentist accepts.
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
begin
  return public.nominate_appointment_provider(
    p_appointment_id,
    p_provider_id,
    p_actor,
    p_expected_updated_at
  );
end;
$$;

revoke all on function public.validate_proposed_appointment_provider(public.appointments, uuid) from public, anon;
revoke all on function public.nominate_appointment_provider(uuid, uuid, text, timestamptz) from public, anon;
revoke all on function public.accept_nominated_appointment(uuid, timestamptz) from public, anon;
revoke all on function public.decline_nominated_appointment(uuid, timestamptz) from public, anon;
revoke all on function public.assign_appointment_provider(uuid, uuid, text, timestamptz) from public, anon;

grant execute on function public.nominate_appointment_provider(uuid, uuid, text, timestamptz) to authenticated, service_role;
grant execute on function public.accept_nominated_appointment(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.decline_nominated_appointment(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.assign_appointment_provider(uuid, uuid, text, timestamptz) to authenticated, service_role;
