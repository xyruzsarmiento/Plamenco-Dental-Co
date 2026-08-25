-- PART 11: Documents + Forms & Consent branch-context hardening.
-- Patient identity and form templates remain clinic-wide. Operational document/form instances
-- retain branch provenance where it can be derived or explicitly selected.

create or replace function public.part11_is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role = 'super_admin'
  ), false)
$$;

create or replace function public.part11_can_access_branch(p_branch_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    p_branch_id is not null
    and exists (select 1 from public.branches b where b.id::text = p_branch_id and b.status = 'active')
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and (
          p.role = 'super_admin'
          or (
            p.role = 'staff'
            and exists (
              select 1 from public.staff_branch_assignments sba
              where sba.profile_id = p.id
                and sba.branch_id::text = p_branch_id
                and sba.status = 'active'
            )
          )
          or (
            p.role in ('dentist', 'associate_dentist')
            and exists (
              select 1
              from public.providers pr
              join public.provider_branch_assignments pba on pba.provider_id = pr.id
              where pr.profile_id = p.id
                and pr.status = 'active'
                and pba.branch_id::text = p_branch_id
                and pba.status = 'active'
            )
          )
        )
    ),
    false
  )
$$;

revoke all on function public.part11_is_super_admin() from public, anon;
revoke all on function public.part11_can_access_branch(text) from public, anon;
grant execute on function public.part11_is_super_admin() to authenticated, service_role;
grant execute on function public.part11_can_access_branch(text) to authenticated, service_role;

alter table public.documents
  add column if not exists branch_id uuid references public.branches(id) on delete restrict;

create index if not exists documents_branch_created_idx
  on public.documents (branch_id, created_at desc)
  where archived_at is null;

-- Backfill only when an existing parent relationship gives a single trustworthy branch.
with inferred as (
  select
    d.id,
    nullif(dr.branch_id, '') as visit_branch,
    nullif(t.branch_id, '') as treatment_branch
  from public.documents d
  left join public.dental_records dr on dr.id::text = nullif(d.clinical_visit_id, '')
  left join public.treatments t on t.id::text = nullif(d.treatment_id, '')
  where d.branch_id is null
), resolved as (
  select
    id,
    case
      when visit_branch is not null and treatment_branch is not null and visit_branch = treatment_branch then visit_branch
      when visit_branch is not null and treatment_branch is null then visit_branch
      when treatment_branch is not null and visit_branch is null then treatment_branch
      else null
    end as branch_text
  from inferred
)
update public.documents d
set branch_id = b.id
from resolved r
join public.branches b on b.id::text = r.branch_text
where d.id = r.id
  and d.branch_id is null
  and r.branch_text is not null;

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
  if p_size_bytes < 0 or p_size_bytes > 10485760 then raise exception 'Invalid document size'; end if;
  if position(v_patient.id::text || '/' in p_storage_path) <> 1 then raise exception 'Storage path does not match patient'; end if;
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

-- Branch-safe document metadata RLS while preserving intentional patient sharing.
drop policy if exists "documents_read_self_or_internal" on public.documents;
drop policy if exists "documents_update_internal" on public.documents;
drop policy if exists "documents_write_internal" on public.documents;

create policy "documents_read_patient_or_branch_internal"
on public.documents for select
to authenticated
using (
  archived_at is null
  and (
    (
      patient_visible = true
      and exists (
        select 1 from public.patients p
        where p.id = documents.patient_id and p.auth_user_id = auth.uid()
      )
    )
    or (
      public.is_internal_profile()
      and (public.has_profile_permission('documents.view') or public.has_profile_permission('documents.upload'))
      and (
        (documents.branch_id is not null and public.part11_can_access_branch(documents.branch_id::text))
        or (documents.branch_id is null and public.part11_is_super_admin())
      )
    )
  )
);

create policy "documents_insert_branch_internal"
on public.documents for insert
to authenticated
with check (
  public.is_internal_profile()
  and public.has_profile_permission('documents.upload')
  and branch_id is not null
  and public.part11_can_access_branch(branch_id::text)
);

create policy "documents_update_branch_internal"
on public.documents for update
to authenticated
using (
  public.is_internal_profile()
  and public.has_profile_permission('documents.upload')
  and (
    (branch_id is not null and public.part11_can_access_branch(branch_id::text))
    or (branch_id is null and public.part11_is_super_admin())
  )
)
with check (
  public.is_internal_profile()
  and public.has_profile_permission('documents.upload')
  and branch_id is not null
  and public.part11_can_access_branch(branch_id::text)
);

-- Preserve private bucket behavior, but internal reads/deletes now follow document branch metadata.
drop policy if exists "patient_documents_select_authorized" on storage.objects;
drop policy if exists "patient_documents_delete_internal" on storage.objects;

create policy "patient_documents_select_authorized"
on storage.objects for select
to authenticated
using (
  bucket_id = 'patient-documents'
  and exists (
    select 1
    from public.documents d
    join public.patients p on p.id = d.patient_id
    where d.storage_path = objects.name
      and d.archived_at is null
      and (
        (d.patient_visible = true and p.auth_user_id = auth.uid())
        or (
          public.is_internal_profile()
          and (public.has_profile_permission('documents.view') or public.has_profile_permission('documents.upload'))
          and (
            (d.branch_id is not null and public.part11_can_access_branch(d.branch_id::text))
            or (d.branch_id is null and public.part11_is_super_admin())
          )
        )
      )
  )
);

create policy "patient_documents_delete_branch_internal"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'patient-documents'
  and public.is_internal_profile()
  and public.has_profile_permission('documents.upload')
  and exists (
    select 1 from public.documents d
    where d.storage_path = objects.name
      and (
        (d.branch_id is not null and public.part11_can_access_branch(d.branch_id::text))
        or (d.branch_id is null and public.part11_is_super_admin())
      )
  )
);

-- Form assignments already carry patient/version/appointment/visit/branch/treatment context.
-- Enforce consistency and make the assignment the authority for completed submissions.
create or replace function public.part11_validate_form_assignment_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient_uuid uuid;
  v_parent_patient uuid;
  v_branch text := nullif(btrim(coalesce(new.branch_id,'')), '');
  v_parent_branch text;
  v_candidate text;
begin
  select p.id into v_patient_uuid
  from public.patients p
  where p.id::text = new.patient_id or p.patient_id = new.patient_id
  limit 1;
  if v_patient_uuid is null then raise exception 'Form assignment patient not found'; end if;

  if nullif(btrim(coalesce(new.appointment_id,'')), '') is not null then
    select a.patient_id, a.branch_id::text into v_parent_patient, v_candidate
    from public.appointments a where a.id::text = new.appointment_id limit 1;
    if v_parent_patient is null then raise exception 'Form assignment appointment not found'; end if;
    if v_parent_patient <> v_patient_uuid then raise exception 'Form assignment appointment belongs to another patient'; end if;
    v_parent_branch := nullif(v_candidate, '');
  end if;

  if nullif(btrim(coalesce(new.clinical_visit_id,'')), '') is not null then
    select dr.patient_id, nullif(dr.branch_id,'') into v_parent_patient, v_candidate
    from public.dental_records dr where dr.id::text = new.clinical_visit_id limit 1;
    if v_parent_patient is null then raise exception 'Form assignment clinical visit not found'; end if;
    if v_parent_patient <> v_patient_uuid then raise exception 'Form assignment clinical visit belongs to another patient'; end if;
    if v_candidate is not null and v_parent_branch is not null and v_candidate <> v_parent_branch then raise exception 'Form assignment parents belong to different branches'; end if;
    v_parent_branch := coalesce(v_parent_branch, v_candidate);
  end if;

  if nullif(btrim(coalesce(new.treatment_id,'')), '') is not null then
    select t.patient_id, nullif(t.branch_id,'') into v_parent_patient, v_candidate
    from public.treatments t where t.id::text = new.treatment_id limit 1;
    if v_parent_patient is null then raise exception 'Form assignment treatment not found'; end if;
    if v_parent_patient <> v_patient_uuid then raise exception 'Form assignment treatment belongs to another patient'; end if;
    if v_candidate is not null and v_parent_branch is not null and v_candidate <> v_parent_branch then raise exception 'Form assignment parents belong to different branches'; end if;
    v_parent_branch := coalesce(v_parent_branch, v_candidate);
  end if;

  if v_parent_branch is not null and v_branch is not null and v_parent_branch <> v_branch then
    raise exception 'Form assignment branch does not match linked care context';
  end if;
  new.branch_id := coalesce(v_parent_branch, v_branch);

  if public.is_internal_profile() and new.branch_id is not null and not public.part11_can_access_branch(new.branch_id) then
    raise exception 'You are not authorized for the form assignment branch' using errcode='42501';
  end if;
  return new;
end;
$$;

drop trigger if exists part11_form_assignment_context_guard on public.patient_form_assignments;
create trigger part11_form_assignment_context_guard
before insert or update of patient_id, appointment_id, clinical_visit_id, treatment_id, branch_id
on public.patient_form_assignments
for each row execute procedure public.part11_validate_form_assignment_context();

create or replace function public.part11_lock_form_submission_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.patient_form_assignments%rowtype;
begin
  select * into v_assignment
  from public.patient_form_assignments a
  where a.id = new.assignment_id;
  if v_assignment.id is null then raise exception 'Form assignment not found'; end if;

  new.patient_id := v_assignment.patient_id;
  new.template_version_id := v_assignment.template_version_id;
  new.appointment_id := v_assignment.appointment_id;
  new.clinical_visit_id := v_assignment.clinical_visit_id;
  new.branch_id := v_assignment.branch_id;
  new.treatment_plan_id := v_assignment.treatment_plan_id;
  new.treatment_id := v_assignment.treatment_id;
  return new;
end;
$$;

drop trigger if exists part11_form_submission_context_lock on public.patient_form_submissions;
create trigger part11_form_submission_context_lock
before insert or update of assignment_id, patient_id, template_version_id, appointment_id, clinical_visit_id, branch_id, treatment_plan_id, treatment_id
on public.patient_form_submissions
for each row execute procedure public.part11_lock_form_submission_context();

-- Restrictive branch guard layers on top of existing patient/permission policies.
drop policy if exists "part11_form_assignments_branch_guard" on public.patient_form_assignments;
create policy "part11_form_assignments_branch_guard"
as restrictive
on public.patient_form_assignments for all
to authenticated
using (
  public.current_user_owns_patient(patient_id)
  or (
    public.is_internal_profile()
    and (
      (branch_id is not null and public.part11_can_access_branch(branch_id))
      or (branch_id is null and public.part11_is_super_admin())
    )
  )
)
with check (
  public.current_user_owns_patient(patient_id)
  or (
    public.is_internal_profile()
    and (
      (branch_id is not null and public.part11_can_access_branch(branch_id))
      or (branch_id is null and public.part11_is_super_admin())
    )
  )
);

drop policy if exists "part11_form_submissions_branch_guard" on public.patient_form_submissions;
create policy "part11_form_submissions_branch_guard"
as restrictive
on public.patient_form_submissions for all
to authenticated
using (
  public.current_user_owns_patient(patient_id)
  or (
    public.is_internal_profile()
    and (
      (branch_id is not null and public.part11_can_access_branch(branch_id))
      or (branch_id is null and public.part11_is_super_admin())
    )
  )
)
with check (
  public.current_user_owns_patient(patient_id)
  or (
    public.is_internal_profile()
    and (
      (branch_id is not null and public.part11_can_access_branch(branch_id))
      or (branch_id is null and public.part11_is_super_admin())
    )
  )
);

comment on column public.documents.branch_id is 'Originating clinic branch for operational document metadata; patient identity remains clinic-wide.';
comment on column public.patient_form_assignments.branch_id is 'Care/operational branch context for this assigned form instance; templates remain clinic-wide.';
comment on column public.patient_form_submissions.branch_id is 'Locked from the related form assignment so completed form context cannot be forged independently.';
