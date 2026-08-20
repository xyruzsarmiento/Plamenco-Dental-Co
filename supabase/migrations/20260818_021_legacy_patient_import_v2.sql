-- Part 26: Legacy patient data import and Excel migration V2.
-- Extends existing import staging; does not create auth accounts or duplicate patient architecture.

alter table public.patient_import_batches
  add column if not exists file_size_bytes bigint,
  add column if not exists sheet_profile jsonb not null default '{}'::jsonb,
  add column if not exists source_file_hash text default '',
  add column if not exists verification_summary jsonb not null default '{}'::jsonb,
  add column if not exists completed_at timestamptz;

alter table public.patient_import_rows
  add column if not exists legacy_patient_number text default '',
  add column if not exists outcome text default '',
  add column if not exists imported_patient_number text default '',
  add column if not exists reviewed_by text default '',
  add column if not exists reviewed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'patient_import_rows_outcome_check') then
    alter table public.patient_import_rows
      add constraint patient_import_rows_outcome_check
      check (outcome = '' or outcome in ('created_patient', 'mapped_existing', 'skipped', 'failed'));
  end if;
end $$;

create table if not exists public.legacy_import_staged_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.patient_import_batches(id) on delete cascade,
  import_row_id uuid references public.patient_import_rows(id) on delete set null,
  patient_id text,
  legacy_patient_number text default '',
  record_type text not null check (record_type in ('clinical_history', 'appointment_history', 'treatment_history', 'payment_balance', 'note', 'other')),
  source_data jsonb not null default '{}'::jsonb,
  normalized_data jsonb not null default '{}'::jsonb,
  status text not null default 'staged' check (status in ('staged', 'reviewed', 'imported', 'skipped', 'failed')),
  reviewed_by text default '',
  reviewed_at timestamptz,
  imported_entity_type text default '',
  imported_entity_id text default '',
  failure_reason text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists patient_import_batches_completed_idx
  on public.patient_import_batches(status, completed_at desc);

create index if not exists patient_import_rows_legacy_number_idx
  on public.patient_import_rows(legacy_patient_number)
  where legacy_patient_number <> '';

create index if not exists legacy_import_staged_records_batch_type_status_idx
  on public.legacy_import_staged_records(batch_id, record_type, status);

drop trigger if exists set_legacy_import_staged_records_updated_at on public.legacy_import_staged_records;
create trigger set_legacy_import_staged_records_updated_at
before update on public.legacy_import_staged_records
for each row execute procedure public.set_updated_at();

alter table public.legacy_import_staged_records enable row level security;

drop policy if exists "legacy_import_staged_records_read_authorized" on public.legacy_import_staged_records;
drop policy if exists "legacy_import_staged_records_write_authorized" on public.legacy_import_staged_records;

create policy "legacy_import_staged_records_read_authorized"
on public.legacy_import_staged_records for select
using (public.has_profile_permission('patients.import'));

create policy "legacy_import_staged_records_write_authorized"
on public.legacy_import_staged_records for all
using (public.has_profile_permission('patients.import'))
with check (public.has_profile_permission('patients.import'));
