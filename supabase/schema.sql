-- Plamenco Dental Co database schema
-- LEGACY BASELINE ONLY.
-- The canonical production schema is the ordered migration set in supabase/migrations.
-- Do not paste this file into a production Supabase SQL editor.
-- Regenerate this file only after a clean staging replay of all migrations.

create extension if not exists pgcrypto;

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text,
  position text,
  role text not null check (role in ('super_admin', 'staff')) default 'staff',
  status text not null check (status in ('active', 'inactive')) default 'active',
  password text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  patient_id text not null unique,
  first_name text not null,
  middle_name text,
  last_name text not null,
  date_of_birth date,
  sex text check (sex in ('female', 'male', 'other', 'prefer_not_to_say')) default 'prefer_not_to_say',
  phone text,
  email text,
  address text,
  emergency_contact text,
  emergency_contact_phone text,
  registration_date date not null default current_date,
  status text check (status in ('active', 'inactive')) default 'active',
  allergies text default '',
  medical_conditions text default '',
  current_medications text default '',
  previous_surgeries text default '',
  medical_notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  duration integer not null default 30,
  price numeric(12,2) not null default 0,
  category text not null default 'General',
  status text not null check (status in ('active', 'inactive')) default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete restrict,
  appointment_date date not null,
  start_time text not null,
  end_time text not null,
  notes text default '',
  status text not null check (status in ('pending', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show')) default 'pending',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dental_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  record_date date not null,
  visit_type text not null check (visit_type in ('consultation', 'cleaning', 'filling', 'extraction', 'root_canal', 'crown', 'follow_up', 'other')),
  chief_complaint text default '',
  diagnosis text default '',
  treatment_plan text default '',
  findings text default '',
  treatment_notes text default '',
  follow_up_date date,
  status text not null check (status in ('draft', 'active', 'follow_up', 'completed')) default 'draft',
  related_appointment_id uuid,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.treatments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  dental_record_id uuid references public.dental_records (id) on delete set null,
  service_id uuid not null references public.services (id) on delete restrict,
  tooth_number integer,
  description text not null,
  cost numeric(12,2) not null default 0,
  status text not null check (status in ('planned', 'scheduled', 'in_progress', 'completed', 'cancelled')) default 'planned',
  treatment_date date not null,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.treatment_plans (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  name text not null,
  description text default '',
  treatments text[] not null default '{}',
  overall_cost numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  status text not null check (status in ('planned', 'scheduled', 'in_progress', 'completed', 'cancelled')) default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  patient_id uuid not null references public.patients (id) on delete cascade,
  invoice_date date not null,
  items jsonb not null default '[]'::jsonb,
  total_cents integer not null default 0,
  amount_paid_cents integer not null default 0,
  balance_cents integer not null default 0,
  status text not null check (status in ('unpaid', 'partially_paid', 'paid', 'refunded')) default 'unpaid',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  amount_cents integer not null default 0,
  payment_method text not null check (payment_method in ('cash', 'gcash', 'maya', 'bank_transfer', 'card')),
  payment_date date not null,
  reference_number text,
  recorded_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  action text not null,
  entity text not null,
  entity_id text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_email text,
  kind text not null,
  priority text not null default 'normal',
  title text not null,
  message text not null,
  related_id text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients (id) on delete cascade,
  name text not null,
  category text not null default 'general',
  file_url text not null,
  uploaded_by text,
  created_at timestamptz not null default now()
);

-- Optional helper for updated_at refresh
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_staff_updated_at on public.staff;
drop trigger if exists set_patients_updated_at on public.patients;

drop trigger if exists on_auth_user_created on auth.users;

drop trigger if exists set_services_updated_at on public.services;
drop trigger if exists set_appointments_updated_at on public.appointments;
drop trigger if exists set_dental_records_updated_at on public.dental_records;
drop trigger if exists set_treatments_updated_at on public.treatments;
drop trigger if exists set_treatment_plans_updated_at on public.treatment_plans;
drop trigger if exists set_invoices_updated_at on public.invoices;

create trigger set_staff_updated_at
before update on public.staff
for each row execute procedure public.set_updated_at();

create trigger set_patients_updated_at
before update on public.patients
for each row execute procedure public.set_updated_at();

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
    phone,
    email,
    date_of_birth,
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
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    lower(coalesce(new.email, '')),
    nullif(new.raw_user_meta_data ->> 'date_of_birth', ''),
    current_date,
    'active',
    'Patient account created via Supabase Auth.'
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_patient_auth_user();

create trigger set_services_updated_at
before update on public.services
for each row execute procedure public.set_updated_at();

create trigger set_appointments_updated_at
before update on public.appointments
for each row execute procedure public.set_updated_at();

create trigger set_dental_records_updated_at
before update on public.dental_records
for each row execute procedure public.set_updated_at();

create trigger set_treatments_updated_at
before update on public.treatments
for each row execute procedure public.set_updated_at();

create trigger set_treatment_plans_updated_at
before update on public.treatment_plans
for each row execute procedure public.set_updated_at();

create trigger set_invoices_updated_at
before update on public.invoices
for each row execute procedure public.set_updated_at();

alter table public.staff enable row level security;
alter table public.patients enable row level security;
alter table public.services enable row level security;
alter table public.appointments enable row level security;
alter table public.dental_records enable row level security;
alter table public.treatments enable row level security;
alter table public.treatment_plans enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.documents enable row level security;

drop policy if exists "staff_read_all" on public.staff;
drop policy if exists "staff_write_all_for_admin" on public.staff;

drop policy if exists "patients_read_own_record" on public.patients;
drop policy if exists "patients_insert_own_record" on public.patients;
drop policy if exists "patients_update_own_record" on public.patients;

drop policy if exists "allow_services_read" on public.services;
drop policy if exists "allow_services_write_admin" on public.services;
drop policy if exists "allow_appointments_read" on public.appointments;
drop policy if exists "allow_appointments_write_admin" on public.appointments;
drop policy if exists "allow_records_read" on public.dental_records;
drop policy if exists "allow_records_write_admin" on public.dental_records;
drop policy if exists "allow_treatments_read" on public.treatments;
drop policy if exists "allow_treatments_write_admin" on public.treatments;
drop policy if exists "allow_plans_read" on public.treatment_plans;
drop policy if exists "allow_plans_write_admin" on public.treatment_plans;
drop policy if exists "allow_invoices_read" on public.invoices;
drop policy if exists "allow_invoices_write_admin" on public.invoices;
drop policy if exists "allow_payments_read" on public.payments;
drop policy if exists "allow_payments_write_admin" on public.payments;
drop policy if exists "allow_audit_logs_read" on public.audit_logs;
drop policy if exists "allow_audit_logs_write_admin" on public.audit_logs;
drop policy if exists "allow_notifications_read" on public.notifications;
drop policy if exists "allow_notifications_write_admin" on public.notifications;
drop policy if exists "allow_documents_read" on public.documents;
drop policy if exists "allow_documents_write_admin" on public.documents;

create policy "staff_read_all" on public.staff for select using (true);
create policy "staff_write_all_for_admin" on public.staff for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "patients_read_own_record" on public.patients for select using (auth_user_id = auth.uid());
create policy "patients_insert_own_record" on public.patients for insert with check (auth_user_id = auth.uid());
create policy "patients_update_own_record" on public.patients for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

create policy "allow_services_read" on public.services for select using (true);
create policy "allow_services_write_admin" on public.services for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "allow_appointments_read" on public.appointments for select using (true);
create policy "allow_appointments_write_admin" on public.appointments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "allow_records_read" on public.dental_records for select using (true);
create policy "allow_records_write_admin" on public.dental_records for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "allow_treatments_read" on public.treatments for select using (true);
create policy "allow_treatments_write_admin" on public.treatments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "allow_plans_read" on public.treatment_plans for select using (true);
create policy "allow_plans_write_admin" on public.treatment_plans for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "allow_invoices_read" on public.invoices for select using (true);
create policy "allow_invoices_write_admin" on public.invoices for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "allow_payments_read" on public.payments for select using (true);
create policy "allow_payments_write_admin" on public.payments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "allow_audit_logs_read" on public.audit_logs for select using (true);
create policy "allow_audit_logs_write_admin" on public.audit_logs for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "allow_notifications_read" on public.notifications for select using (true);
create policy "allow_notifications_write_admin" on public.notifications for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "allow_documents_read" on public.documents for select using (true);
create policy "allow_documents_write_admin" on public.documents for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- No seed/demo clinic data. This project expects an empty database until real
-- records are created through Supabase Auth and the application workflows.
