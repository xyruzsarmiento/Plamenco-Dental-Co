-- Part 16: Historical data migration and flexible import staging.
-- Extends the existing patient import tables; imported patients still become normal rows in public.patients.

alter table public.patient_import_batches
  add column if not exists import_type text not null default 'patients',
  add column if not exists valid_rows integer not null default 0,
  add column if not exists invalid_rows integer not null default 0,
  add column if not exists duplicate_rows integer not null default 0,
  add column if not exists matched_rows integer not null default 0,
  add column if not exists failed_rows integer not null default 0,
  add column if not exists mapping jsonb not null default '{}'::jsonb,
  add column if not exists dry_run_summary jsonb not null default '{}'::jsonb,
  add column if not exists rollback_at timestamptz,
  add column if not exists rollback_by text default '',
  add column if not exists rollback_reason text default '';

alter table public.patient_import_batches drop constraint if exists patient_import_batches_status_check;
alter table public.patient_import_batches add constraint patient_import_batches_status_check
  check (status in ('uploaded', 'mapped', 'validated', 'ready', 'importing', 'completed', 'partially_completed', 'failed', 'rolled_back', 'staged'));

alter table public.patient_import_batches drop constraint if exists patient_import_batches_import_type_check;
alter table public.patient_import_batches add constraint patient_import_batches_import_type_check
  check (import_type in ('patients', 'appointments', 'treatments', 'payments', 'inventory'));

alter table public.patient_import_rows
  add column if not exists match_confidence text not null default 'no_match',
  add column if not exists selected_existing_patient_id text default '',
  add column if not exists workbook_duplicate_rows jsonb not null default '[]'::jsonb,
  add column if not exists normalized_values jsonb not null default '{}'::jsonb,
  add column if not exists imported_at timestamptz,
  add column if not exists failed_reason text default '';

alter table public.patient_import_rows drop constraint if exists patient_import_rows_status_check;
alter table public.patient_import_rows add constraint patient_import_rows_status_check
  check (status in ('ready', 'warning', 'duplicate', 'possible_match', 'mapped_to_existing', 'imported', 'failed', 'skipped', 'error'));

alter table public.patient_import_rows drop constraint if exists patient_import_rows_decision_check;
alter table public.patient_import_rows add constraint patient_import_rows_decision_check
  check (decision in ('create_new', 'use_existing', 'skip', 'review_later', 'import'));

alter table public.patient_import_rows drop constraint if exists patient_import_rows_match_confidence_check;
alter table public.patient_import_rows add constraint patient_import_rows_match_confidence_check
  check (match_confidence in ('exact_match', 'likely_match', 'possible_match', 'no_match'));

create index if not exists patient_import_batches_type_status_idx
  on public.patient_import_batches(import_type, status, created_at desc);

create index if not exists patient_import_rows_batch_status_idx
  on public.patient_import_rows(batch_id, status);
