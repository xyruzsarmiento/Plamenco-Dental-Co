-- PART 11 follow-up: close legacy document mutation paths after branch provenance was introduced.

revoke execute on function public.create_document_metadata(text,text,text,text,text,text,text,text,bigint,boolean) from authenticated;

create or replace function public.archive_patient_document(p_document_id uuid)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.documents%rowtype;
  v_row public.documents%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not public.is_internal_profile() or not public.has_profile_permission('documents.upload') then
    raise exception 'Document archive is not permitted' using errcode='42501';
  end if;

  select * into v_existing from public.documents where id = p_document_id;
  if v_existing.id is null then raise exception 'Document not found'; end if;
  if v_existing.branch_id is null then
    if not public.part11_is_super_admin() then raise exception 'Legacy document branch is unresolved' using errcode='42501'; end if;
  elsif not public.part11_can_access_branch(v_existing.branch_id::text) then
    raise exception 'You are not authorized for this document branch' using errcode='42501';
  end if;

  update public.documents
  set archived_at = coalesce(archived_at, now()),
      archived_by = coalesce(archived_by, v_uid),
      patient_visible = false
  where id = p_document_id
  returning * into v_row;

  insert into public.audit_logs(user_name, action, entity, entity_id, metadata)
  values (
    coalesce((select nullif(full_name,'') from public.profiles where id=v_uid), v_uid::text),
    'document_archived', 'document', v_row.id::text,
    jsonb_build_object('patientId',v_row.patient_id,'branchId',v_row.branch_id,'storagePath',v_row.storage_path)
  );
  return v_row;
end;
$$;

revoke all on function public.archive_patient_document(uuid) from public, anon;
grant execute on function public.archive_patient_document(uuid) to authenticated, service_role;
