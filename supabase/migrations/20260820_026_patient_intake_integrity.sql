-- Part 36 integrity follow-up.
-- Prevent duplicate patient-level intake records when appointment_id is NULL and
-- allow a patient to read only the template metadata for forms actually assigned
-- to that patient.

create unique index if not exists patient_intakes_unique_context_idx
  on public.patient_intakes (patient_id, coalesce(appointment_id, ''));

alter table public.form_template_versions
  add column if not exists signature_method text not null default 'none'
    check (signature_method in ('none', 'typed_acknowledgement', 'drawn'));

-- A template may be visible to a patient only through one of that patient's
-- authorized assignments. This does not make the template catalog public.
drop policy if exists form_templates_select_internal on public.form_templates;
drop policy if exists form_templates_select_authorized on public.form_templates;
create policy form_templates_select_authorized on public.form_templates for select
using (
  public.is_internal_profile()
  or exists (
    select 1
    from public.form_template_versions v
    join public.patient_form_assignments a on a.template_version_id = v.id
    where v.template_id = form_templates.id
      and public.current_user_owns_patient(a.patient_id)
  )
);

comment on column public.form_template_versions.signature_method is
'Clinic-configured signature method. none = no signature capture; typed_acknowledgement and drawn must be explicitly selected by clinic policy. Never infer a legal signature method from requires_signature alone.';
