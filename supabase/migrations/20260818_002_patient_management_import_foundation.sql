-- Patient management, canonical patient identity, and historical import staging.
-- Backward-compatible: no patient records are deleted or rewritten.

create extension if not exists pgcrypto;

alter table public.patients
  add column if not exists full_name text default '',
  add column if not exists city text default '',
  add column if not exists province text default '',
  add column if not exists emergency_contact_relationship text default '',
  add column if not exists preferred_branch_id uuid references public.branches(id) on delete set null,
  add column if not exists origin text not null default 'staff_created',
  add column if not exists administrative_notes text default '',
  add column if not exists import_batch_id uuid,
  add column if not exists import_source_row integer,
  add column if not exists original_imported_name text default '',
  add column if not exists profile_image text default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'patients_origin_check'
      and conrelid = 'public.patients'::regclass
  ) then
    alter table public.patients
      add constraint patients_origin_check
      check (origin in ('online_registration', 'walk_in', 'historical_import', 'staff_created'));
  end if;
end;
$$;

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.patients'::regclass
    and contype = 'f'
    and pg_get_constraintdef(oid) like '%auth.users%';

  if constraint_name is not null then
    execute format('alter table public.patients drop constraint %I', constraint_name);
  end if;

  alter table public.patients
    add constraint patients_auth_user_id_fkey
    foreign key (auth_user_id) references auth.users(id) on delete set null;
end;
$$;

create table if not exists public.patient_import_batches (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  sheet_name text default '',
  uploaded_by text not null default '',
  uploaded_by_profile_id uuid references public.profiles(id) on delete set null,
  status text not null check (status in ('staged', 'completed', 'failed', 'rolled_back')) default 'staged',
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  error_rows integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patient_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.patient_import_batches(id) on delete cascade,
  source_row_number integer not null,
  status text not null check (status in ('ready', 'warning', 'duplicate', 'error')),
  decision text not null check (decision in ('import', 'skip')),
  patient_id uuid references public.patients(id) on delete set null,
  messages jsonb not null default '[]'::jsonb,
  duplicate_patients jsonb not null default '[]'::jsonb,
  source_data jsonb not null default '{}'::jsonb,
  preserved_historical_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'patients_import_batch_id_fkey'
      and conrelid = 'public.patients'::regclass
  ) then
    alter table public.patients
      add constraint patients_import_batch_id_fkey
      foreign key (import_batch_id) references public.patient_import_batches(id) on delete set null
      not valid;
  end if;
end;
$$;

alter table public.patient_import_batches enable row level security;
alter table public.patient_import_rows enable row level security;

create or replace function public.has_profile_permission(permission_key text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and (
          role in ('super_admin', 'admin')
          or permission_key = any(permissions)
        )
    ),
    false
  )
$$;

create or replace function public.is_internal_profile()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role in ('super_admin', 'admin', 'dentist', 'associate_dentist', 'staff')
        and status = 'active'
    ),
    false
  )
$$;

drop trigger if exists set_patient_import_batches_updated_at on public.patient_import_batches;
create trigger set_patient_import_batches_updated_at
before update on public.patient_import_batches
for each row execute procedure public.set_updated_at();

drop policy if exists "patients_read_own_record" on public.patients;
drop policy if exists "patients_insert_own_record" on public.patients;
drop policy if exists "patients_update_own_record" on public.patients;
drop policy if exists "patients_select_self_or_internal" on public.patients;
drop policy if exists "patients_insert_self_or_internal" on public.patients;
drop policy if exists "patients_update_self_or_internal" on public.patients;

create policy "patients_select_self_or_internal"
on public.patients for select
using (auth_user_id = auth.uid() or public.is_internal_profile());

create policy "patients_insert_self_or_internal"
on public.patients for insert
with check (
  (auth_user_id = auth.uid())
  or (auth_user_id is null and public.is_internal_profile())
);

create policy "patients_update_self_or_internal"
on public.patients for update
using (auth_user_id = auth.uid() or public.is_internal_profile())
with check (auth_user_id = auth.uid() or public.is_internal_profile());

drop policy if exists "patient_import_batches_read_authorized" on public.patient_import_batches;
drop policy if exists "patient_import_batches_write_authorized" on public.patient_import_batches;
drop policy if exists "patient_import_rows_read_authorized" on public.patient_import_rows;
drop policy if exists "patient_import_rows_write_authorized" on public.patient_import_rows;

create policy "patient_import_batches_read_authorized"
on public.patient_import_batches for select
using (public.has_profile_permission('patients.import'));

create policy "patient_import_batches_write_authorized"
on public.patient_import_batches for all
using (public.has_profile_permission('patients.import'))
with check (public.has_profile_permission('patients.import'));

create policy "patient_import_rows_read_authorized"
on public.patient_import_rows for select
using (public.has_profile_permission('patients.import'));

create policy "patient_import_rows_write_authorized"
on public.patient_import_rows for all
using (public.has_profile_permission('patients.import'))
with check (public.has_profile_permission('patients.import'));

drop policy if exists "allow_appointments_read" on public.appointments;
drop policy if exists "allow_records_read" on public.dental_records;
drop policy if exists "allow_treatments_read" on public.treatments;
drop policy if exists "allow_plans_read" on public.treatment_plans;
drop policy if exists "allow_invoices_read" on public.invoices;
drop policy if exists "allow_payments_read" on public.payments;
drop policy if exists "allow_documents_read" on public.documents;

create policy "appointments_read_self_or_internal"
on public.appointments for select
using (
  public.is_internal_profile()
  or exists (
    select 1
    from public.patients p
    where (
      p.id::text = appointments.patient_id::text
      or p.patient_id = appointments.patient_id::text
    )
      and p.auth_user_id = auth.uid()
  )
);

create policy "records_read_self_or_internal"
on public.dental_records for select
using (
  public.is_internal_profile()
  or exists (
    select 1
    from public.patients p
    where (
      p.id::text = dental_records.patient_id::text
      or p.patient_id = dental_records.patient_id::text
    )
      and p.auth_user_id = auth.uid()
  )
);

create policy "treatments_read_self_or_internal"
on public.treatments for select
using (
  public.is_internal_profile()
  or exists (
    select 1
    from public.patients p
    where (
      p.id::text = treatments.patient_id::text
      or p.patient_id = treatments.patient_id::text
    )
      and p.auth_user_id = auth.uid()
  )
);

create policy "plans_read_self_or_internal"
on public.treatment_plans for select
using (
  public.is_internal_profile()
  or exists (
    select 1
    from public.patients p
    where (
      p.id::text = treatment_plans.patient_id::text
      or p.patient_id = treatment_plans.patient_id::text
    )
      and p.auth_user_id = auth.uid()
  )
);

create policy "invoices_read_self_or_internal"
on public.invoices for select
using (
  public.is_internal_profile()
  or exists (
    select 1
    from public.patients p
    where (
      p.id::text = invoices.patient_id::text
      or p.patient_id = invoices.patient_id::text
    )
      and p.auth_user_id = auth.uid()
  )
);

create policy "payments_read_self_or_internal"
on public.payments for select
using (
  public.is_internal_profile()
  or exists (
    select 1
    from public.patients p
    where (
      p.id::text = payments.patient_id::text
      or p.patient_id = payments.patient_id::text
    )
      and p.auth_user_id = auth.uid()
  )
);

create policy "documents_read_self_or_internal"
on public.documents for select
using (
  public.is_internal_profile()
  or exists (
    select 1
    from public.patients p
    where (
      p.id::text = documents.patient_id::text
      or p.patient_id = documents.patient_id::text
    )
      and p.auth_user_id = auth.uid()
  )
);

create or replace function public.handle_new_patient_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.patients (
    auth_user_id,
    patient_id,
    first_name,
    middle_name,
    last_name,
    full_name,
    phone,
    email,
    date_of_birth,
    origin,
    registration_date,
    status,
    medical_notes
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'patient_id', 'PT-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(md5(random()::text), 1, 6)),
    coalesce(new.raw_user_meta_data ->> 'first_name', 'Patient'),
    coalesce(new.raw_user_meta_data ->> 'middle_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', 'Account'),
    trim(coalesce(new.raw_user_meta_data ->> 'first_name', 'Patient') || ' ' || coalesce(new.raw_user_meta_data ->> 'middle_name', '') || ' ' || coalesce(new.raw_user_meta_data ->> 'last_name', 'Account')),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    lower(coalesce(new.email, '')),
    nullif(new.raw_user_meta_data ->> 'date_of_birth', ''),
    'online_registration',
    current_date,
    'active',
    'Patient account created via Supabase Auth.'
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;
