-- Reliability hardening for private patient document uploads and atomic invoice creation.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-documents',
  'patient-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists patient_documents_insert_internal on storage.objects;
drop policy if exists "patient_documents_insert_internal" on storage.objects;
create policy "patient_documents_insert_internal"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'patient-documents'
  and name like 'patient-documents/%'
  and public.is_internal_profile()
  and public.has_profile_permission('documents.upload')
);

drop policy if exists patient_documents_delete_internal on storage.objects;
drop policy if exists patient_documents_delete_branch_internal on storage.objects;
drop policy if exists "patient_documents_delete_branch_internal" on storage.objects;
create policy "patient_documents_delete_branch_internal"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'patient-documents'
  and public.is_internal_profile()
  and public.has_profile_permission('documents.upload')
  and (
    exists (
      select 1
      from public.documents d
      where d.storage_path = objects.name
        and (
          (d.branch_id is not null and public.part11_can_access_branch(d.branch_id::text))
          or (d.branch_id is null and public.part11_is_super_admin())
        )
    )
    or (
      objects.name like 'patient-documents/%'
      and not exists (
        select 1 from public.documents d where d.storage_path = objects.name
      )
    )
  )
);

create or replace function public.create_document_metadata_branch(
  p_patient_id text,
  p_branch_id text,
  p_clinical_visit_id text default null,
  p_treatment_id text default null,
  p_name text default '',
  p_file_type text default 'application/octet-stream',
  p_category text default 'other',
  p_description text default '',
  p_storage_path text default '',
  p_size_bytes bigint default 0,
  p_patient_visible boolean default true
)
returns public.documents
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_uid uuid := auth.uid();
  v_patient public.patients%rowtype;
  v_actor text;
  v_visit_patient uuid;
  v_treatment_patient uuid;
  v_visit_branch text;
  v_treatment_branch text;
  v_derived_branch text;
  v_final_branch uuid;
  v_row public.documents%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not public.is_internal_profile() or not public.has_profile_permission('documents.upload') then
    raise exception 'Document upload is not permitted' using errcode='42501';
  end if;

  select p.* into v_patient
  from public.patients p
  where p.id::text = p_patient_id or p.patient_id = p_patient_id
  limit 1;
  if v_patient.id is null then raise exception 'Patient not found'; end if;

  if btrim(coalesce(p_name,'')) = '' then raise exception 'File name is required'; end if;
  if btrim(coalesce(p_storage_path,'')) = '' then raise exception 'Storage path is required'; end if;
  if p_size_bytes <= 0 or p_size_bytes > 10485760 then raise exception 'Invalid document size'; end if;
  if p_file_type not in (
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ) then raise exception 'Unsupported document file type'; end if;
  if position('patient-documents/' || v_patient.id::text || '/' in p_storage_path) <> 1 then
    raise exception 'Storage path does not match patient';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'patient-documents' and o.name = p_storage_path
  ) then raise exception 'Uploaded document object was not found'; end if;

  if nullif(btrim(coalesce(p_clinical_visit_id,'')), '') is not null then
    select dr.patient_id, nullif(dr.branch_id, '')
      into v_visit_patient, v_visit_branch
    from public.dental_records dr
    where dr.id::text = p_clinical_visit_id
    limit 1;
    if v_visit_patient is null then raise exception 'Clinical visit not found'; end if;
    if v_visit_patient <> v_patient.id then raise exception 'Clinical visit does not belong to patient'; end if;
  end if;

  if nullif(btrim(coalesce(p_treatment_id,'')), '') is not null then
    select t.patient_id, nullif(t.branch_id, '')
      into v_treatment_patient, v_treatment_branch
    from public.treatments t
    where t.id::text = p_treatment_id
    limit 1;
    if v_treatment_patient is null then raise exception 'Treatment not found'; end if;
    if v_treatment_patient <> v_patient.id then raise exception 'Treatment does not belong to patient'; end if;
  end if;

  if v_visit_branch is not null and v_treatment_branch is not null and v_visit_branch <> v_treatment_branch then
    raise exception 'Document parent records belong to different branches';
  end if;
  v_derived_branch := coalesce(v_visit_branch, v_treatment_branch);

  if v_derived_branch is not null and nullif(btrim(coalesce(p_branch_id,'')), '') is not null and v_derived_branch <> p_branch_id then
    raise exception 'Selected branch does not match the linked clinical record';
  end if;

  select b.id into v_final_branch
  from public.branches b
  where b.id::text = coalesce(v_derived_branch, nullif(btrim(coalesce(p_branch_id,'')), ''))
    and b.status = 'active'
  limit 1;

  if v_final_branch is null then raise exception 'A valid branch is required for document upload'; end if;
  if not public.part11_can_access_branch(v_final_branch::text) then
    raise exception 'You are not authorized for this branch' using errcode='42501';
  end if;

  select coalesce(nullif(full_name,''), email, v_uid::text)
    into v_actor
  from public.profiles
  where id = v_uid and status = 'active';
  if v_actor is null then raise exception 'Active internal profile required' using errcode='42501'; end if;

  insert into public.documents(
    patient_id, branch_id, name, category, file_url, uploaded_by,
    clinical_visit_id, treatment_id, description, storage_path,
    file_type, size_bytes, patient_visible
  ) values (
    v_patient.id, v_final_branch, btrim(p_name), btrim(coalesce(p_category,'other')), '', v_actor,
    nullif(btrim(coalesce(p_clinical_visit_id,'')), ''),
    nullif(btrim(coalesce(p_treatment_id,'')), ''),
    btrim(coalesce(p_description,'')), p_storage_path,
    coalesce(nullif(btrim(p_file_type),''), 'application/octet-stream'),
    p_size_bytes, p_patient_visible
  ) returning * into v_row;

  insert into public.audit_logs(user_name, action, entity, entity_id, metadata)
  values (
    v_actor, 'document_uploaded', 'document', v_row.id::text,
    jsonb_build_object(
      'patientId', v_patient.patient_id,
      'branchId', v_final_branch,
      'storagePath', v_row.storage_path,
      'patientVisible', v_row.patient_visible
    )
  );
  return v_row;
end;
$$;

revoke all on function public.create_document_metadata_branch(text,text,text,text,text,text,text,text,text,bigint,boolean) from public, anon;
grant execute on function public.create_document_metadata_branch(text,text,text,text,text,text,text,text,text,bigint,boolean) to authenticated, service_role;

create or replace function public.create_invoice_from_items(
  p_patient_id uuid,
  p_branch_id text,
  p_invoice_date date,
  p_due_date date,
  p_items jsonb,
  p_notes text default '',
  p_client_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_actor text;
  v_patient public.patients%rowtype;
  v_invoice public.invoices%rowtype;
  v_existing public.invoices%rowtype;
  v_item jsonb;
  v_normalized_items jsonb := '[]'::jsonb;
  v_description text;
  v_item_id text;
  v_charge_id text;
  v_item_branch text;
  v_quantity integer;
  v_unit integer;
  v_discount integer;
  v_subtotal integer := 0;
  v_discount_total integer := 0;
  v_total integer := 0;
  v_charge public.charges%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if not public.has_profile_permission('billing.create') then raise exception 'Not authorized to create invoices.' using errcode='42501'; end if;
  if p_client_request_id is null then raise exception 'A client request id is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_client_request_id::text, 0));
  if nullif(btrim(coalesce(p_branch_id,'')), '') is null then raise exception 'Select a concrete issuing branch before creating an invoice.'; end if;
  if not public.part12_can_access_branch(p_branch_id) then raise exception 'You do not have billing access to this branch.' using errcode='42501'; end if;
  if p_invoice_date is null then raise exception 'Invoice date is required.'; end if;
  if p_due_date is not null and p_due_date < p_invoice_date then raise exception 'Due date cannot be before invoice date.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one invoice item.'; end if;

  select * into v_existing from public.invoices where client_request_id=p_client_request_id;
  if found then return jsonb_build_object('duplicate',true,'invoice',to_jsonb(v_existing)); end if;

  select coalesce(nullif(full_name,''), nullif(email,''), v_uid::text) into v_actor from public.profiles where id=v_uid and status='active';
  if v_actor is null then raise exception 'Active clinic profile required.' using errcode='42501'; end if;

  select * into v_patient from public.patients where id=p_patient_id and status='active';
  if not found then raise exception 'Select a valid active patient.'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_description := btrim(coalesce(v_item->>'description',''));
    v_quantity := coalesce((v_item->>'quantity')::integer,0);
    v_unit := coalesce((v_item->>'unitPriceCents')::integer,0);
    v_discount := coalesce((v_item->>'discountCents')::integer,0);
    v_item_id := coalesce(nullif(v_item->>'id',''), gen_random_uuid()::text);
    v_charge_id := nullif(v_item->>'chargeId','');
    v_item_branch := nullif(btrim(coalesce(v_item->>'branchId','')), '');

    if v_description='' then raise exception 'Each invoice item requires a description.'; end if;
    if v_quantity <= 0 then raise exception 'Invoice item quantity must be positive.'; end if;
    if v_unit < 0 or v_discount < 0 then raise exception 'Invoice item amounts cannot be negative.'; end if;
    if v_discount > v_quantity * v_unit then raise exception 'Invoice item discount exceeds its subtotal.'; end if;
    if v_item_branch is not null and v_item_branch <> p_branch_id then raise exception 'All invoice lines must belong to the issuing branch.'; end if;

    if v_charge_id is not null then
      select * into v_charge from public.charges where id=v_charge_id for update;
      if not found then raise exception 'Referenced charge not found.'; end if;
      if v_charge.status <> 'unbilled' then raise exception 'A referenced charge has already been invoiced or voided.'; end if;
      if v_charge.patient_id not in (v_patient.id::text, v_patient.patient_id) then raise exception 'Referenced charge belongs to another patient.'; end if;
      if nullif(v_charge.branch_id,'') is null or v_charge.branch_id <> p_branch_id then raise exception 'Referenced charge belongs to another branch.'; end if;
      v_quantity := v_charge.quantity;
      v_unit := v_charge.unit_price_cents;
      v_discount := v_charge.discount_cents;
      v_description := v_charge.description;
    end if;

    v_subtotal := v_subtotal + (v_quantity * v_unit);
    v_discount_total := v_discount_total + v_discount;
    v_normalized_items := v_normalized_items || jsonb_build_array(jsonb_build_object(
      'id',v_item_id,'chargeId',v_charge_id,'treatmentId',v_item->>'treatmentId','serviceId',v_item->>'serviceId',
      'providerId',v_item->>'providerId','providerNameSnapshot',coalesce(v_item->>'providerNameSnapshot',''),
      'branchId',p_branch_id,'description',v_description,'quantity',v_quantity,
      'unitPriceCents',v_unit,'discountCents',v_discount,'discountReason',coalesce(v_item->>'discountReason',''),
      'amountCents',(v_quantity*v_unit)-v_discount
    ));
  end loop;

  v_total := v_subtotal - v_discount_total;
  if v_total < 0 then raise exception 'Invoice total cannot be negative.'; end if;

  insert into public.invoices(
    invoice_number,patient_id,branch_id,invoice_date,due_date,items,subtotal_cents,discount_cents,
    total_cents,amount_paid_cents,balance_cents,status,notes,created_by,client_request_id
  ) values (
    public.next_invoice_number(),v_patient.id,p_branch_id,p_invoice_date,p_due_date,v_normalized_items,
    v_subtotal,v_discount_total,v_total,0,v_total,case when v_total=0 then 'paid' else 'unpaid' end,
    coalesce(p_notes,''),v_actor,p_client_request_id
  ) returning * into v_invoice;

  update public.charges
  set status='invoiced', invoice_id=v_invoice.id::text, updated_at=now()
  where id in (select nullif(value->>'chargeId','') from jsonb_array_elements(v_normalized_items))
    and nullif(id,'') is not null;

  insert into public.audit_logs(user_name,action,entity,entity_id,metadata)
  values(v_actor,'invoice_created','invoice',v_invoice.id::text,jsonb_build_object('invoiceNumber',v_invoice.invoice_number,'patientId',v_patient.patient_id,'totalCents',v_total,'branchId',p_branch_id));

  return jsonb_build_object('duplicate',false,'invoice',to_jsonb(v_invoice));
exception
  when unique_violation then
    if p_client_request_id is not null then
      select * into v_existing from public.invoices where client_request_id=p_client_request_id;
      if found then return jsonb_build_object('duplicate',true,'invoice',to_jsonb(v_existing)); end if;
    end if;
    raise;
end;
$$;

revoke all on function public.create_invoice_from_items(uuid,text,date,date,jsonb,text,uuid) from public, anon;
grant execute on function public.create_invoice_from_items(uuid,text,date,date,jsonb,text,uuid) to authenticated;
