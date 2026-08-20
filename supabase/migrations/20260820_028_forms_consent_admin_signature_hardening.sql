-- Part 38: Forms & Consent Administration, signature workflow, and record hardening.
-- Extends the Part 36 form/consent model; does not create a second consent or signature system.

alter table public.form_templates
  add column if not exists current_version_id uuid,
  add column if not exists branch_id text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.form_template_versions
  add column if not exists version_status text not null default 'draft'
    check (version_status in ('draft','published','archived')),
  add column if not exists updated_at timestamptz not null default now();

update public.form_template_versions
set version_status = case when published_at is null then 'draft' else 'published' end
where version_status is null
   or (published_at is not null and version_status = 'draft');

alter table public.form_templates
  drop constraint if exists form_templates_current_version_id_fkey;
alter table public.form_templates
  add constraint form_templates_current_version_id_fkey
  foreign key (current_version_id) references public.form_template_versions(id) on delete set null;

alter table public.patient_form_assignments
  add column if not exists treatment_plan_id text,
  add column if not exists treatment_id text,
  add column if not exists assignment_source text not null default 'manual'
    check (assignment_source in ('manual','new_patient_rule','clinic_wide_rule','appointment_rule','treatment_rule','historical_import')),
  add column if not exists superseded_by_id uuid references public.patient_form_assignments(id) on delete set null;

alter table public.patient_form_submissions
  add column if not exists signature_method text not null default 'none'
    check (signature_method in ('none','typed_acknowledgement','drawn')),
  add column if not exists submission_source text not null default 'patient_portal'
    check (submission_source in ('patient_portal','clinic_device_patient','staff_assisted','historical_import')),
  add column if not exists declined_at timestamptz,
  add column if not exists decline_reason text,
  add column if not exists treatment_plan_id text,
  add column if not exists treatment_id text;

create index if not exists form_template_versions_template_status_idx
  on public.form_template_versions(template_id, version_status, version_number desc);
create index if not exists patient_form_assignments_status_idx
  on public.patient_form_assignments(status, assigned_at desc);
create index if not exists patient_form_assignments_context_idx
  on public.patient_form_assignments(patient_id, appointment_id, clinical_visit_id, treatment_plan_id, treatment_id);

-- Published form versions are immutable. Material changes require a new draft version.
create or replace function public.prevent_published_form_version_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.version_status = 'published' then
    if new.template_id is distinct from old.template_id
       or new.version_number is distinct from old.version_number
       or new.content is distinct from old.content
       or new.requires_signature is distinct from old.requires_signature
       or new.signature_method is distinct from old.signature_method
       or new.effective_date is distinct from old.effective_date
       or new.published_at is distinct from old.published_at
       or new.published_by is distinct from old.published_by then
      raise exception 'Published form versions are immutable. Create a new version instead.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists prevent_published_form_version_mutation_trigger on public.form_template_versions;
create trigger prevent_published_form_version_mutation_trigger
before update on public.form_template_versions
for each row execute procedure public.prevent_published_form_version_mutation();

-- Final patient submissions are immutable records.
create or replace function public.prevent_final_form_submission_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Completed patient form submissions are immutable.';
end;
$$;

drop trigger if exists prevent_final_form_submission_update_trigger on public.patient_form_submissions;
create trigger prevent_final_form_submission_update_trigger
before update or delete on public.patient_form_submissions
for each row execute procedure public.prevent_final_form_submission_mutation();

create or replace function public.can_administer_forms()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.has_profile_permission('settings.manage')
$$;

create or replace function public.can_assign_forms()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.has_profile_permission('settings.manage')
      or public.has_profile_permission('patients.edit_basic')
      or public.has_profile_permission('appointments.create')
$$;

-- Internal staff can see assignment status through patient access, but sensitive
-- form content/signatures are restricted to management or clinical access.
create or replace function public.can_view_form_content(p_patient_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_owns_patient(p_patient_id)
      or public.has_profile_permission('settings.manage')
      or public.has_profile_permission('clinical_records.view')
$$;

create or replace function public.create_form_template_draft(
  p_title text,
  p_description text,
  p_category text,
  p_applies_to text,
  p_content text,
  p_requires_signature boolean,
  p_signature_method text,
  p_effective_date date default null,
  p_branch_id text default null
)
returns table(template_id uuid, version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_id uuid;
  v_version_id uuid;
begin
  if not public.can_administer_forms() then
    raise exception 'Not authorized to manage forms.';
  end if;
  if nullif(trim(p_title), '') is null then raise exception 'Form title is required.'; end if;
  if nullif(trim(p_content), '') is null then raise exception 'Form content is required.'; end if;
  if p_category not in ('patient_registration','medical_history','general_consent','data_privacy','treatment_specific','photo_image','other') then
    raise exception 'Invalid form category.';
  end if;
  if p_applies_to not in ('new_patient','clinic_wide','appointment','treatment','manual') then
    raise exception 'Invalid form applicability.';
  end if;
  if p_signature_method not in ('none','typed_acknowledgement','drawn') then
    raise exception 'Invalid signature method.';
  end if;
  if not p_requires_signature and p_signature_method <> 'none' then
    raise exception 'A non-signature form must use signature method none.';
  end if;

  insert into public.form_templates(title, description, category, status, applies_to, branch_id, created_by)
  values (trim(p_title), coalesce(trim(p_description), ''), p_category, 'draft', p_applies_to, p_branch_id, auth.uid())
  returning id into v_template_id;

  insert into public.form_template_versions(
    template_id, version_number, content, requires_signature, signature_method,
    effective_date, version_status
  ) values (
    v_template_id, 1, p_content, p_requires_signature, p_signature_method,
    p_effective_date, 'draft'
  ) returning id into v_version_id;

  return query select v_template_id, v_version_id, 1;
end;
$$;

create or replace function public.create_form_version_draft(
  p_template_id uuid
)
returns table(version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.form_template_versions%rowtype;
  v_next integer;
  v_new uuid;
begin
  if not public.can_administer_forms() then raise exception 'Not authorized to manage forms.'; end if;
  select v.* into v_source
  from public.form_template_versions v
  where v.template_id = p_template_id
  order by v.version_number desc
  limit 1;
  if v_source.id is null then raise exception 'No source version exists.'; end if;
  if exists(select 1 from public.form_template_versions where template_id = p_template_id and version_status = 'draft') then
    raise exception 'This form already has a draft version.';
  end if;
  v_next := v_source.version_number + 1;
  insert into public.form_template_versions(
    template_id, version_number, content, requires_signature, signature_method,
    effective_date, version_status
  ) values (
    p_template_id, v_next, v_source.content, v_source.requires_signature,
    v_source.signature_method, v_source.effective_date, 'draft'
  ) returning id into v_new;
  return query select v_new, v_next;
end;
$$;

create or replace function public.publish_form_version(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version public.form_template_versions%rowtype;
begin
  if not public.can_administer_forms() then raise exception 'Not authorized to publish forms.'; end if;
  select * into v_version from public.form_template_versions where id = p_version_id for update;
  if v_version.id is null then raise exception 'Form version not found.'; end if;
  if v_version.version_status <> 'draft' then raise exception 'Only draft versions can be published.'; end if;
  if nullif(trim(v_version.content), '') is null then raise exception 'Cannot publish an empty form.'; end if;

  update public.form_template_versions
  set version_status = 'published', published_at = now(), published_by = auth.uid(), updated_at = now()
  where id = p_version_id;

  update public.form_templates
  set status = 'published', current_version_id = p_version_id, archived_at = null, archived_by = null, updated_at = now()
  where id = v_version.template_id;

  return p_version_id;
end;
$$;

create or replace function public.archive_form_template(p_template_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_administer_forms() then raise exception 'Not authorized to archive forms.'; end if;
  update public.form_templates
  set status = 'archived', archived_at = now(), archived_by = auth.uid(), updated_at = now()
  where id = p_template_id;
  if not found then raise exception 'Form template not found.'; end if;
  return p_template_id;
end;
$$;

create or replace function public.assign_patient_form(
  p_patient_id text,
  p_template_version_id uuid,
  p_appointment_id text default null,
  p_clinical_visit_id text default null,
  p_branch_id text default null,
  p_treatment_plan_id text default null,
  p_treatment_id text default null,
  p_source text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_version public.form_template_versions%rowtype;
  v_template public.form_templates%rowtype;
begin
  if not public.can_assign_forms() then raise exception 'Not authorized to assign forms.'; end if;
  select * into v_version from public.form_template_versions where id = p_template_version_id;
  if v_version.id is null or v_version.version_status <> 'published' then
    raise exception 'Only published form versions can be assigned.';
  end if;
  select * into v_template from public.form_templates where id = v_version.template_id;
  if v_template.status <> 'published' then raise exception 'Archived or draft forms cannot be assigned.'; end if;
  if p_source not in ('manual','new_patient_rule','clinic_wide_rule','appointment_rule','treatment_rule','historical_import') then
    raise exception 'Invalid assignment source.';
  end if;

  select id into v_assignment_id
  from public.patient_form_assignments
  where patient_id = p_patient_id
    and template_version_id = p_template_version_id
    and coalesce(appointment_id,'') = coalesce(p_appointment_id,'')
    and coalesce(clinical_visit_id,'') = coalesce(p_clinical_visit_id,'')
  limit 1;
  if v_assignment_id is not null then return v_assignment_id; end if;

  insert into public.patient_form_assignments(
    patient_id, template_version_id, appointment_id, clinical_visit_id, branch_id,
    treatment_plan_id, treatment_id, assignment_source, assigned_by
  ) values (
    p_patient_id, p_template_version_id, p_appointment_id, p_clinical_visit_id, p_branch_id,
    p_treatment_plan_id, p_treatment_id, p_source, auth.uid()
  ) returning id into v_assignment_id;
  return v_assignment_id;
end;
$$;

-- Atomic patient submission. The exact assigned version content is snapshotted here,
-- and the assignment is finalized in the same transaction.
create or replace function public.submit_patient_form_v2(
  p_assignment_id uuid,
  p_submission_id uuid,
  p_signed_by_name text default null,
  p_signature_method text default 'none',
  p_signature_storage_path text default null,
  p_decline boolean default false,
  p_source text default 'patient_portal',
  p_decline_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.patient_form_assignments%rowtype;
  v_version public.form_template_versions%rowtype;
  v_existing uuid;
  v_status text;
begin
  select * into v_assignment from public.patient_form_assignments where id = p_assignment_id for update;
  if v_assignment.id is null then raise exception 'Form assignment not found.'; end if;
  if not public.current_user_owns_patient(v_assignment.patient_id) then raise exception 'Not authorized for this patient form.'; end if;
  if v_assignment.status = 'superseded' then raise exception 'This form has been superseded.'; end if;

  select id into v_existing from public.patient_form_submissions where assignment_id = p_assignment_id;
  if v_existing is not null then return v_existing; end if;

  select * into v_version from public.form_template_versions where id = v_assignment.template_version_id;
  if v_version.id is null then raise exception 'Assigned form version not found.'; end if;

  if p_source not in ('patient_portal','clinic_device_patient','staff_assisted','historical_import') then
    raise exception 'Invalid submission source.';
  end if;

  if p_decline then
    v_status := 'declined';
    p_signature_method := 'none';
    p_signature_storage_path := null;
    p_signed_by_name := null;
  else
    v_status := 'signed';
    if v_version.requires_signature then
      if p_signature_method <> v_version.signature_method then
        raise exception 'Signature method does not match this form version.';
      end if;
      if p_signature_method = 'typed_acknowledgement' and nullif(trim(p_signed_by_name), '') is null then
        raise exception 'Signer name is required.';
      end if;
      if p_signature_method = 'drawn' and nullif(trim(p_signature_storage_path), '') is null then
        raise exception 'Drawn signature file is required.';
      end if;
    else
      p_signature_method := 'none';
      p_signature_storage_path := null;
    end if;
  end if;

  insert into public.patient_form_submissions(
    id, assignment_id, patient_id, template_version_id, form_content_snapshot,
    response_data, status, signature_storage_path, signature_method, signed_by_name,
    signed_at, submitted_by, submitted_at, appointment_id, clinical_visit_id,
    branch_id, treatment_plan_id, treatment_id, submission_source, declined_at, decline_reason
  ) values (
    p_submission_id, v_assignment.id, v_assignment.patient_id, v_assignment.template_version_id, v_version.content,
    '{}'::jsonb, v_status, p_signature_storage_path, p_signature_method, nullif(trim(p_signed_by_name), ''),
    case when v_status = 'signed' then now() else null end, auth.uid(), now(), v_assignment.appointment_id,
    v_assignment.clinical_visit_id, v_assignment.branch_id, v_assignment.treatment_plan_id, v_assignment.treatment_id,
    p_source, case when v_status = 'declined' then now() else null end, nullif(trim(p_decline_reason), '')
  );

  update public.patient_form_assignments
  set status = v_status, completed_at = now()
  where id = v_assignment.id;

  return p_submission_id;
end;
$$;

-- Tighten form content/submission visibility. Assignment metadata remains available
-- to operational staff through can_view_patient_intake, while full content/signature
-- access requires patient ownership, management, or clinical-record permission.
drop policy if exists form_versions_select_authorized on public.form_template_versions;
create policy form_versions_select_authorized on public.form_template_versions for select
using (
  public.can_administer_forms()
  or exists (
    select 1 from public.patient_form_assignments a
    where a.template_version_id = form_template_versions.id
      and public.can_view_form_content(a.patient_id)
  )
);

drop policy if exists form_submissions_select_authorized on public.patient_form_submissions;
create policy form_submissions_select_authorized on public.patient_form_submissions for select
using (public.can_view_form_content(patient_id));

-- Version writes are routed through trusted admin functions. Direct patient writes remain unavailable.
drop policy if exists form_versions_manage_authorized on public.form_template_versions;
create policy form_versions_manage_authorized on public.form_template_versions for all
using (public.can_administer_forms())
with check (public.can_administer_forms());

-- Private signature bucket. Files are addressed by patient public-id/submission-id/signature.png.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('consent-signatures', 'consent-signatures', false, 1048576, array['image/png'])
on conflict (id) do update set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/png'];

drop policy if exists consent_signatures_patient_insert on storage.objects;
create policy consent_signatures_patient_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'consent-signatures'
  and public.current_user_owns_patient((storage.foldername(name))[1])
);

drop policy if exists consent_signatures_authorized_select on storage.objects;
create policy consent_signatures_authorized_select on storage.objects for select to authenticated
using (
  bucket_id = 'consent-signatures'
  and (
    public.current_user_owns_patient((storage.foldername(name))[1])
    or public.has_profile_permission('settings.manage')
    or public.has_profile_permission('clinical_records.view')
  )
);

drop policy if exists consent_signatures_patient_cleanup on storage.objects;
create policy consent_signatures_patient_cleanup on storage.objects for delete to authenticated
using (
  bucket_id = 'consent-signatures'
  and public.current_user_owns_patient((storage.foldername(name))[1])
);

revoke all on function public.can_administer_forms() from anon;
revoke all on function public.can_assign_forms() from anon;
revoke all on function public.can_view_form_content(text) from anon;
revoke all on function public.create_form_template_draft(text,text,text,text,text,boolean,text,date,text) from anon;
revoke all on function public.create_form_version_draft(uuid) from anon;
revoke all on function public.publish_form_version(uuid) from anon;
revoke all on function public.archive_form_template(uuid) from anon;
revoke all on function public.assign_patient_form(text,uuid,text,text,text,text,text,text) from anon;
revoke all on function public.submit_patient_form_v2(uuid,uuid,text,text,text,boolean,text,text) from anon;

grant execute on function public.can_administer_forms() to authenticated;
grant execute on function public.can_assign_forms() to authenticated;
grant execute on function public.can_view_form_content(text) to authenticated;
grant execute on function public.create_form_template_draft(text,text,text,text,text,boolean,text,date,text) to authenticated;
grant execute on function public.create_form_version_draft(uuid) to authenticated;
grant execute on function public.publish_form_version(uuid) to authenticated;
grant execute on function public.archive_form_template(uuid) to authenticated;
grant execute on function public.assign_patient_form(text,uuid,text,text,text,text,text,text) to authenticated;
grant execute on function public.submit_patient_form_v2(uuid,uuid,text,text,text,boolean,text,text) to authenticated;
