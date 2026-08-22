create or replace function public.create_document_metadata(
  p_patient_id text,
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
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_patient public.patients%rowtype;
  v_actor text;
  v_record_patient uuid;
  v_row public.documents%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not public.has_profile_permission('documents.upload') then raise exception 'Document upload is not permitted' using errcode='42501'; end if;
  select p.* into v_patient from public.patients p where p.id::text=p_patient_id or p.patient_id=p_patient_id limit 1;
  if v_patient.id is null then raise exception 'Patient not found'; end if;
  if btrim(coalesce(p_name,''))='' then raise exception 'File name is required'; end if;
  if btrim(coalesce(p_storage_path,''))='' then raise exception 'Storage path is required'; end if;
  if p_size_bytes < 0 or p_size_bytes > 10485760 then raise exception 'Invalid document size'; end if;
  if position(v_patient.id::text || '/' in p_storage_path) <> 1 then raise exception 'Storage path does not match patient'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id='patient-documents' and o.name=p_storage_path) then raise exception 'Uploaded document object was not found'; end if;
  if p_clinical_visit_id is not null and btrim(p_clinical_visit_id)<>'' then
    select dr.patient_id into v_record_patient from public.dental_records dr where dr.id::text=p_clinical_visit_id limit 1;
    if v_record_patient is null then raise exception 'Clinical visit not found'; end if;
    if v_record_patient<>v_patient.id then raise exception 'Clinical visit does not belong to patient'; end if;
  end if;
  select coalesce(nullif(full_name,''),email,v_uid::text) into v_actor from public.profiles where id=v_uid and status='active';
  if v_actor is null then raise exception 'Active internal profile required' using errcode='42501'; end if;
  insert into public.documents(patient_id,name,category,file_url,uploaded_by,clinical_visit_id,treatment_id,description,storage_path,file_type,size_bytes,patient_visible)
  values(v_patient.id,btrim(p_name),btrim(coalesce(p_category,'other')),'',v_actor,nullif(btrim(coalesce(p_clinical_visit_id,'')),''),nullif(btrim(coalesce(p_treatment_id,'')),''),btrim(coalesce(p_description,'')),p_storage_path,coalesce(nullif(btrim(p_file_type),''),'application/octet-stream'),p_size_bytes,p_patient_visible)
  returning * into v_row;
  insert into public.audit_logs(user_name,action,entity,entity_id,metadata)
  values(v_actor,'document_uploaded','document',v_row.id::text,jsonb_build_object('patientId',v_patient.patient_id,'storagePath',v_row.storage_path,'patientVisible',v_row.patient_visible));
  return v_row;
end;$$;

revoke all on function public.create_document_metadata(text,text,text,text,text,text,text,text,bigint,boolean) from public,anon;
grant execute on function public.create_document_metadata(text,text,text,text,text,text,text,text,bigint,boolean) to authenticated,service_role;
