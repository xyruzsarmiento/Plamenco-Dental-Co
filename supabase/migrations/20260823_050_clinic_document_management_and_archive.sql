alter table public.documents add column if not exists archived_at timestamptz;
alter table public.documents add column if not exists archived_by uuid references public.profiles(id) on delete set null;

create index if not exists documents_patient_active_created_idx
  on public.documents(patient_id, created_at desc)
  where archived_at is null;

create or replace function public.archive_patient_document(p_document_id uuid)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.documents%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.is_internal_profile() or not public.has_profile_permission('documents.upload') then
    raise exception 'Document archive is not permitted' using errcode = '42501';
  end if;

  update public.documents
  set archived_at = coalesce(archived_at, now()),
      archived_by = coalesce(archived_by, v_uid),
      patient_visible = false
  where id = p_document_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Document not found';
  end if;

  insert into public.audit_logs(user_name, action, entity, entity_id, metadata)
  values (
    coalesce((select nullif(full_name, '') from public.profiles where id = v_uid), v_uid::text),
    'document_archived',
    'document',
    v_row.id::text,
    jsonb_build_object('patientId', v_row.patient_id, 'storagePath', v_row.storage_path)
  );

  return v_row;
end;
$$;

revoke all on function public.archive_patient_document(uuid) from public, anon;
grant execute on function public.archive_patient_document(uuid) to authenticated, service_role;

revoke all on table public.documents from public;
revoke all on table public.documents from anon;
revoke all on table public.documents from authenticated;
grant select, insert, update on table public.documents to authenticated;

drop policy if exists "documents_read_self_or_internal" on public.documents;
create policy "documents_read_self_or_internal"
on public.documents
for select
to authenticated
using (
  archived_at is null
  and (
    public.is_internal_profile()
    or (
      patient_visible = true
      and exists (
        select 1
        from public.patients p
        where p.id = documents.patient_id
          and p.auth_user_id = auth.uid()
      )
    )
  )
);

drop policy if exists documents_write_internal on public.documents;
create policy documents_write_internal
on public.documents
for insert
to authenticated
with check (public.is_internal_profile() and public.has_profile_permission('documents.upload'));

drop policy if exists documents_update_internal on public.documents;
create policy documents_update_internal
on public.documents
for update
to authenticated
using (public.is_internal_profile() and public.has_profile_permission('documents.upload'))
with check (public.is_internal_profile() and public.has_profile_permission('documents.upload'));

drop policy if exists patient_documents_select_authorized on storage.objects;
create policy patient_documents_select_authorized on storage.objects for select to authenticated
using (
  bucket_id = 'patient-documents'
  and (
    public.is_internal_profile()
    or exists (
      select 1
      from public.documents d
      join public.patients p on p.id = d.patient_id
      where d.storage_path = storage.objects.name
        and d.archived_at is null
        and d.patient_visible = true
        and p.auth_user_id = auth.uid()
    )
  )
);
