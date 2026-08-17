alter table public.dental_records
  add column if not exists appointment_number text default '',
  add column if not exists branch_id text,
  add column if not exists provider_id text,
  add column if not exists provider_name_snapshot text default '',
  add column if not exists clinical_findings text default '',
  add column if not exists assessment text default '',
  add column if not exists treatment_performed text default '',
  add column if not exists recommendations text default '',
  add column if not exists patient_visible_summary text default '',
  add column if not exists clinical_notes text default '',
  add column if not exists follow_up_required boolean not null default false,
  add column if not exists follow_up_notes text default '',
  add column if not exists source text not null default 'native' check (source in ('native', 'walk_in', 'historical_import')),
  add column if not exists historical_provider_text text default '',
  add column if not exists finalized_at timestamptz,
  add column if not exists finalized_by text default '',
  add column if not exists last_updated_by text default '';

alter table public.dental_records
  drop constraint if exists dental_records_status_check;

alter table public.dental_records
  add constraint dental_records_status_check
  check (status in ('draft', 'finalized', 'amended', 'voided', 'active', 'follow_up', 'completed'));

create table if not exists public.clinical_record_amendments (
  id text primary key,
  dental_record_id text not null,
  patient_id text not null,
  provider_id text,
  amendment_text text not null,
  reason text not null,
  author text not null,
  created_at timestamptz not null default now()
);

alter table public.treatments
  add column if not exists appointment_id text,
  add column if not exists appointment_number text default '',
  add column if not exists branch_id text,
  add column if not exists provider_id text,
  add column if not exists provider_name_snapshot text default '',
  add column if not exists service_name_snapshot text default '',
  add column if not exists price_snapshot_cents integer not null default 0,
  add column if not exists quantity integer not null default 1,
  add column if not exists performed_by text default '',
  add column if not exists created_by text default '';

alter table public.treatments
  drop constraint if exists treatments_status_check;

alter table public.treatments
  add constraint treatments_status_check
  check (status in ('planned', 'scheduled', 'in_progress', 'completed', 'cancelled', 'voided'));

create table if not exists public.prescriptions (
  id text primary key,
  patient_id text not null,
  dental_record_id text,
  appointment_id text,
  branch_id text,
  provider_id text,
  provider_name_snapshot text default '',
  items jsonb not null default '[]'::jsonb,
  notes text default '',
  prescribed_by text not null,
  prescription_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'voided')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents
  add column if not exists clinical_visit_id text,
  add column if not exists treatment_id text,
  add column if not exists description text default '',
  add column if not exists storage_path text default '';

create index if not exists dental_records_patient_date_idx on public.dental_records(patient_id, record_date desc);
create index if not exists dental_records_appointment_idx on public.dental_records(related_appointment_id);
create index if not exists treatments_patient_date_idx on public.treatments(patient_id, treatment_date desc);
create index if not exists treatments_clinical_visit_idx on public.treatments(dental_record_id);
create index if not exists prescriptions_patient_date_idx on public.prescriptions(patient_id, prescription_date desc);
create index if not exists prescriptions_clinical_visit_idx on public.prescriptions(dental_record_id);
create index if not exists documents_clinical_visit_idx on public.documents(clinical_visit_id);

alter table public.clinical_record_amendments enable row level security;
alter table public.prescriptions enable row level security;

drop policy if exists "clinical_amendments_read_authenticated" on public.clinical_record_amendments;
drop policy if exists "clinical_amendments_write_authenticated" on public.clinical_record_amendments;
drop policy if exists "prescriptions_read_authenticated" on public.prescriptions;
drop policy if exists "prescriptions_write_authenticated" on public.prescriptions;

create policy "clinical_amendments_read_authenticated"
on public.clinical_record_amendments for select
using (auth.role() = 'authenticated');

create policy "clinical_amendments_write_authenticated"
on public.clinical_record_amendments for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "prescriptions_read_authenticated"
on public.prescriptions for select
using (auth.role() = 'authenticated');

create policy "prescriptions_write_authenticated"
on public.prescriptions for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
