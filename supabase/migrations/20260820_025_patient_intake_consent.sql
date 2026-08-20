-- Part 36: patient intake, medical history provenance, and versioned consent.
-- This migration extends the existing patient/document/auth architecture. It does
-- not create another patient, appointment, clinical-record, or storage system.

create table if not exists public.patient_intakes (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null,
  appointment_id text,
  branch_id text,
  status text not null default 'not_started'
    check (status in ('not_started','in_progress','submitted','needs_review','complete','needs_update')),
  medical_history_confirmed_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  source text not null default 'patient'
    check (source in ('patient','staff','historical_import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, appointment_id)
);

create table if not exists public.medical_history_revisions (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null,
  intake_id uuid references public.patient_intakes(id) on delete set null,
  allergies text not null default '',
  medical_conditions text not null default '',
  current_medications text not null default '',
  previous_surgeries text not null default '',
  medical_notes text not null default '',
  confirmed_no_allergies boolean not null default false,
  source text not null check (source in ('patient','staff','dentist','associate_dentist','historical_import')),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create table if not exists public.form_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  category text not null check (category in ('patient_registration','medical_history','general_consent','data_privacy','treatment_specific','photo_image','other')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  applies_to text not null default 'manual' check (applies_to in ('new_patient','clinic_wide','appointment','treatment','manual')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.form_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.form_templates(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  content text not null,
  requires_signature boolean not null default true,
  effective_date date,
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (template_id, version_number)
);

create table if not exists public.patient_form_assignments (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null,
  template_version_id uuid not null references public.form_template_versions(id) on delete restrict,
  appointment_id text,
  clinical_visit_id text,
  branch_id text,
  status text not null default 'assigned'
    check (status in ('assigned','viewed','in_progress','signed','declined','superseded')),
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  viewed_at timestamptz,
  completed_at timestamptz
);

create unique index if not exists patient_form_assignments_unique_context_idx
  on public.patient_form_assignments (
    patient_id,
    template_version_id,
    coalesce(appointment_id, ''),
    coalesce(clinical_visit_id, '')
  );

create table if not exists public.patient_form_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.patient_form_assignments(id) on delete restrict,
  patient_id text not null,
  template_version_id uuid not null references public.form_template_versions(id) on delete restrict,
  form_content_snapshot text not null,
  response_data jsonb not null default '{}'::jsonb,
  status text not null check (status in ('signed','declined')),
  signature_storage_path text,
  signed_by_name text,
  signed_at timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  appointment_id text,
  clinical_visit_id text,
  branch_id text,
  created_at timestamptz not null default now(),
  unique (assignment_id)
);

create index if not exists patient_intakes_patient_idx on public.patient_intakes(patient_id, created_at desc);
create index if not exists medical_history_revisions_patient_idx on public.medical_history_revisions(patient_id, changed_at desc);
create index if not exists patient_form_assignments_patient_idx on public.patient_form_assignments(patient_id, assigned_at desc);
create index if not exists patient_form_submissions_patient_idx on public.patient_form_submissions(patient_id, submitted_at desc);

create or replace function public.current_user_owns_patient(p_patient_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.patients p
    where (p.id::text = p_patient_id or p.patient_id = p_patient_id)
      and p.auth_user_id = auth.uid()
  )
$$;

create or replace function public.can_view_patient_intake(p_patient_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_owns_patient(p_patient_id)
    or public.has_profile_permission('patients.view')
    or public.has_profile_permission('clinical_records.view')
$$;

create or replace function public.can_manage_patient_intake(p_patient_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_owns_patient(p_patient_id)
    or public.has_profile_permission('patients.edit')
    or public.has_profile_permission('clinical_records.edit')
$$;

alter table public.patient_intakes enable row level security;
alter table public.medical_history_revisions enable row level security;
alter table public.form_templates enable row level security;
alter table public.form_template_versions enable row level security;
alter table public.patient_form_assignments enable row level security;
alter table public.patient_form_submissions enable row level security;

drop policy if exists patient_intakes_select_authorized on public.patient_intakes;
create policy patient_intakes_select_authorized on public.patient_intakes for select
using (public.can_view_patient_intake(patient_id));

drop policy if exists patient_intakes_insert_authorized on public.patient_intakes;
create policy patient_intakes_insert_authorized on public.patient_intakes for insert
with check (public.can_manage_patient_intake(patient_id));

drop policy if exists patient_intakes_update_authorized on public.patient_intakes;
create policy patient_intakes_update_authorized on public.patient_intakes for update
using (public.can_manage_patient_intake(patient_id))
with check (public.can_manage_patient_intake(patient_id));

drop policy if exists medical_history_revisions_select_authorized on public.medical_history_revisions;
create policy medical_history_revisions_select_authorized on public.medical_history_revisions for select
using (public.can_view_patient_intake(patient_id));

drop policy if exists medical_history_revisions_insert_authorized on public.medical_history_revisions;
create policy medical_history_revisions_insert_authorized on public.medical_history_revisions for insert
with check (public.can_manage_patient_intake(patient_id));

drop policy if exists form_templates_select_internal on public.form_templates;
create policy form_templates_select_internal on public.form_templates for select
using (public.is_internal_profile());

drop policy if exists form_templates_manage_authorized on public.form_templates;
create policy form_templates_manage_authorized on public.form_templates for all
using (public.has_profile_permission('settings.manage'))
with check (public.has_profile_permission('settings.manage'));

drop policy if exists form_versions_select_authorized on public.form_template_versions;
create policy form_versions_select_authorized on public.form_template_versions for select
using (
  exists (
    select 1 from public.patient_form_assignments a
    where a.template_version_id = form_template_versions.id
      and public.can_view_patient_intake(a.patient_id)
  )
  or public.is_internal_profile()
);

drop policy if exists form_versions_manage_authorized on public.form_template_versions;
create policy form_versions_manage_authorized on public.form_template_versions for all
using (public.has_profile_permission('settings.manage'))
with check (public.has_profile_permission('settings.manage'));

drop policy if exists form_assignments_select_authorized on public.patient_form_assignments;
create policy form_assignments_select_authorized on public.patient_form_assignments for select
using (public.can_view_patient_intake(patient_id));

drop policy if exists form_assignments_manage_internal on public.patient_form_assignments;
create policy form_assignments_manage_internal on public.patient_form_assignments for all
using (public.has_profile_permission('patients.edit') or public.has_profile_permission('appointments.manage'))
with check (public.has_profile_permission('patients.edit') or public.has_profile_permission('appointments.manage'));

drop policy if exists form_assignments_patient_update on public.patient_form_assignments;
create policy form_assignments_patient_update on public.patient_form_assignments for update
using (public.current_user_owns_patient(patient_id))
with check (public.current_user_owns_patient(patient_id));

drop policy if exists form_submissions_select_authorized on public.patient_form_submissions;
create policy form_submissions_select_authorized on public.patient_form_submissions for select
using (public.can_view_patient_intake(patient_id));

drop policy if exists form_submissions_patient_insert on public.patient_form_submissions;
create policy form_submissions_patient_insert on public.patient_form_submissions for insert
with check (
  public.current_user_owns_patient(patient_id)
  and submitted_by = auth.uid()
);

-- No UPDATE/DELETE policy is created for signed/declined submissions on purpose.
-- A completed submission is immutable. Corrections require a new assignment/version.

revoke all on function public.current_user_owns_patient(text) from anon;
revoke all on function public.can_view_patient_intake(text) from anon;
revoke all on function public.can_manage_patient_intake(text) from anon;
grant execute on function public.current_user_owns_patient(text) to authenticated;
grant execute on function public.can_view_patient_intake(text) to authenticated;
grant execute on function public.can_manage_patient_intake(text) to authenticated;
