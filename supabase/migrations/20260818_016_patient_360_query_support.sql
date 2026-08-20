-- Patient 360 query support.
-- These indexes support canonical patient lookup and tab-specific patient history
-- without changing ownership or duplicating related module data.

create index if not exists patients_patient_number_idx
  on public.patients(patient_id);

create index if not exists patients_auth_user_lookup_idx
  on public.patients(auth_user_id)
  where auth_user_id is not null;

create index if not exists patients_search_name_idx
  on public.patients(lower(last_name), lower(first_name), date_of_birth);

create index if not exists patients_search_phone_idx
  on public.patients(phone)
  where phone <> '';

create index if not exists patients_search_email_idx
  on public.patients(lower(email))
  where email <> '';

create index if not exists appointments_patient_date_status_idx
  on public.appointments(patient_id, appointment_date desc, status);

create index if not exists appointments_patient_provider_branch_idx
  on public.appointments(patient_id, provider_id, branch_id, appointment_date desc);

create index if not exists invoices_patient_date_status_idx
  on public.invoices(patient_id, invoice_date desc, status);

create index if not exists payments_patient_date_status_idx
  on public.payments(patient_id, payment_date desc, status);

create index if not exists receipts_patient_issued_idx
  on public.receipts(patient_id, issued_at desc);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'upload_date'
  ) then
    create index if not exists documents_patient_upload_idx
      on public.documents(patient_id, upload_date desc);
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'created_at'
  ) then
    create index if not exists documents_patient_created_idx
      on public.documents(patient_id, created_at desc);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'clinical_visit_id'
  ) then
    create index if not exists documents_patient_visit_idx
      on public.documents(patient_id, clinical_visit_id)
      where clinical_visit_id is not null;
  end if;
end;
$$;

create index if not exists communication_delivery_logs_patient_status_idx
  on public.communication_delivery_logs(patient_id, status, created_at desc);

do $$
begin
  if to_regclass('public.audit_logs') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'entity'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'entity_id'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'timestamp'
    )
  then
    create index if not exists audit_logs_patient_entity_idx
      on public.audit_logs(entity, entity_id, timestamp desc)
      where entity = 'patient';
  end if;
end;
$$;
