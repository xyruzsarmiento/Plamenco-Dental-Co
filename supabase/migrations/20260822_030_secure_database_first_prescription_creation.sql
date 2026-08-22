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
  v_profile_name text;
  v_record_patient text;
  v_row public.prescriptions%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.has_profile_permission('prescriptions.create') then
    raise exception 'Prescription creation is not permitted' using errcode = '42501';
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

  select pr.id, pr.display_name
  into v_provider_id, v_provider_name
  from public.providers pr
  where pr.profile_id = v_uid and pr.status = 'active'
  order by pr.created_at
  limit 1;

  select p.full_name into v_profile_name
  from public.profiles p
  where p.id = v_uid and p.status = 'active'
  limit 1;

  if v_provider_name is null and coalesce(v_profile_name,'') = '' then
    raise exception 'Active clinical profile not found' using errcode = '42501';
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
    coalesce(v_provider_name, v_profile_name, ''),
    p_items,
    btrim(coalesce(p_notes,'')),
    coalesce(v_provider_name, v_profile_name, 'Clinical user'),
    coalesce(p_prescription_date, current_date),
    'active'
  ) returning * into v_row;

  insert into public.audit_logs(user_name, action, entity, entity_id, metadata)
  values (
    coalesce(v_provider_name, v_profile_name, v_uid::text),
    'prescription_created',
    'prescription',
    v_row.id,
    jsonb_build_object('patientId', v_patient.patient_id, 'dentalRecordId', v_row.dental_record_id, 'providerId', v_row.provider_id)
  );

  return v_row;
end;
$$;

revoke all on function public.create_prescription(text,text,text,text,jsonb,text,date) from public, anon;
grant execute on function public.create_prescription(text,text,text,text,jsonb,text,date) to authenticated, service_role;

alter policy prescriptions_read_self_or_internal on public.prescriptions to authenticated;
alter policy prescriptions_write_clinical_authorized on public.prescriptions to authenticated;
