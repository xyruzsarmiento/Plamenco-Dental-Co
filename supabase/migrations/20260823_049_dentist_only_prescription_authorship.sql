create or replace function public.can_author_prescription()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      join public.providers pr on pr.profile_id = p.id
      where p.id = auth.uid()
        and p.status = 'active'
        and pr.status = 'active'
        and pr.role in ('dentist', 'associate_dentist')
        and (
          'prescriptions.create' = any(p.permissions)
          or 'prescriptions.edit' = any(p.permissions)
          or p.role in ('dentist', 'associate_dentist')
        )
    ),
    false
  )
$$;

create or replace function public.create_prescription(
  p_patient_id text,
  p_dental_record_id text default null,
  p_appointment_id text default null,
  p_branch_id text default null,
  p_items jsonb default '[]'::jsonb,
  p_notes text default '',
  p_prescription_date date default current_date
)
returns public.prescriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_patient public.patients%rowtype;
  v_provider_id uuid;
  v_provider_name text;
  v_record_patient text;
  v_appointment_patient text;
  v_row public.prescriptions%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.can_author_prescription() then
    raise exception 'Only an active dentist profile may create prescriptions' using errcode = '42501';
  end if;

  if p_patient_id is null or btrim(p_patient_id) = '' then
    raise exception 'Patient is required';
  end if;

  select p.* into v_patient
  from public.patients p
  where p.id::text = p_patient_id or p.patient_id = p_patient_id
  limit 1;

  if v_patient.id is null then
    raise exception 'Patient not found';
  end if;

  if v_patient.status = 'inactive' then
    raise exception 'Cannot create a prescription for an inactive patient';
  end if;

  select pr.id, pr.display_name
  into v_provider_id, v_provider_name
  from public.providers pr
  where pr.profile_id = v_uid
    and pr.status = 'active'
    and pr.role in ('dentist', 'associate_dentist')
  order by pr.created_at
  limit 1;

  if v_provider_id is null then
    raise exception 'Active dentist profile not found' using errcode = '42501';
  end if;

  if p_dental_record_id is not null and btrim(p_dental_record_id) <> '' then
    select dr.patient_id::text into v_record_patient
    from public.dental_records dr
    where dr.id::text = p_dental_record_id
    limit 1;

    if v_record_patient is null then
      raise exception 'Clinical visit not found';
    end if;

    if v_record_patient <> v_patient.id::text then
      raise exception 'Clinical visit does not belong to the patient';
    end if;
  end if;

  if p_appointment_id is not null and btrim(p_appointment_id) <> '' then
    select a.patient_id::text into v_appointment_patient
    from public.appointments a
    where a.id::text = p_appointment_id
    limit 1;

    if v_appointment_patient is null then
      raise exception 'Appointment not found';
    end if;

    if v_appointment_patient <> v_patient.id::text then
      raise exception 'Appointment does not belong to the patient';
    end if;
  end if;

  if p_branch_id is not null and btrim(p_branch_id) <> '' and not exists (
    select 1 from public.branches b where b.id::text = p_branch_id and b.status = 'active'
  ) then
    raise exception 'Branch is not active';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'At least one medication is required';
  end if;

  if jsonb_array_length(p_items) > 20 then
    raise exception 'Too many prescription items';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where btrim(coalesce(item->>'medication','')) = ''
       or btrim(coalesce(item->>'dosage','')) = ''
       or btrim(coalesce(item->>'frequency','')) = ''
  ) then
    raise exception 'Medication, dosage, and frequency are required for every item';
  end if;

  insert into public.prescriptions (
    id,
    patient_id,
    dental_record_id,
    appointment_id,
    branch_id,
    provider_id,
    provider_name_snapshot,
    items,
    notes,
    prescribed_by,
    prescription_date,
    status
  ) values (
    'rx-' || gen_random_uuid()::text,
    v_patient.patient_id,
    nullif(btrim(coalesce(p_dental_record_id,'')),''),
    nullif(btrim(coalesce(p_appointment_id,'')),''),
    nullif(btrim(coalesce(p_branch_id,'')),''),
    v_provider_id::text,
    coalesce(v_provider_name, ''),
    p_items,
    btrim(coalesce(p_notes,'')),
    coalesce(v_provider_name, 'Dentist'),
    coalesce(p_prescription_date, current_date),
    'active'
  ) returning * into v_row;

  insert into public.audit_logs(user_name, action, entity, entity_id, metadata)
  values (
    coalesce(v_provider_name, v_uid::text),
    'prescription_created',
    'prescription',
    v_row.id,
    jsonb_build_object('patientId', v_patient.patient_id, 'dentalRecordId', v_row.dental_record_id, 'providerId', v_row.provider_id)
  );

  return v_row;
end;
$$;

revoke all on function public.can_author_prescription() from public, anon;
grant execute on function public.can_author_prescription() to authenticated, service_role;

revoke all on function public.create_prescription(text,text,text,text,jsonb,text,date) from public, anon;
grant execute on function public.create_prescription(text,text,text,text,jsonb,text,date) to authenticated, service_role;

alter table public.prescriptions enable row level security;

revoke all on table public.prescriptions from public;
revoke all on table public.prescriptions from anon;
revoke all on table public.prescriptions from authenticated;
grant select, insert, update on table public.prescriptions to authenticated;

drop policy if exists "prescriptions_read_self_or_internal" on public.prescriptions;
create policy "prescriptions_read_self_or_internal"
on public.prescriptions
for select
to authenticated
using (
  public.is_internal_profile()
  or exists (
    select 1
    from public.patients p
    where (p.id::text = prescriptions.patient_id or p.patient_id = prescriptions.patient_id)
      and p.auth_user_id = auth.uid()
  )
);

drop policy if exists "prescriptions_write_clinical_authorized" on public.prescriptions;
create policy "prescriptions_write_clinical_authorized"
on public.prescriptions
for insert
to authenticated
with check (public.can_author_prescription());

drop policy if exists "prescriptions_update_clinical_authorized" on public.prescriptions;
create policy "prescriptions_update_clinical_authorized"
on public.prescriptions
for update
to authenticated
using (public.can_author_prescription())
with check (public.can_author_prescription());
