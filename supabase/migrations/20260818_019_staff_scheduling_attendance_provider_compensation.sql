-- Part 24: Staff scheduling, attendance, dentist compensation, and payout tracking.
-- This extends existing staff_accounts/providers/schedules instead of creating duplicate people tables.

create extension if not exists pgcrypto;

create table if not exists public.staff_shift_plans (
  id text primary key,
  staff_id text not null,
  branch_id text not null,
  work_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'planned' check (status in ('planned', 'cancelled')),
  notes text default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_shift_plans_date_branch_idx
on public.staff_shift_plans (work_date, branch_id, status);

create index if not exists staff_shift_plans_staff_date_idx
on public.staff_shift_plans (staff_id, work_date);

create table if not exists public.staff_attendance (
  id text primary key,
  staff_id text not null,
  branch_id text not null,
  work_date date not null,
  shift_start_time time,
  shift_end_time time,
  time_in time,
  time_out time,
  status text not null check (status in ('present', 'late', 'absent', 'on_leave')),
  minutes_late integer not null default 0 check (minutes_late >= 0),
  reason text default '',
  recorded_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_attendance_date_branch_status_idx
on public.staff_attendance (work_date, branch_id, status);

create index if not exists staff_attendance_staff_date_idx
on public.staff_attendance (staff_id, work_date);

create table if not exists public.provider_compensation_rules (
  id text primary key,
  provider_id text not null,
  branch_id text,
  basis text not null default 'none' check (basis in ('percentage', 'fixed_per_treatment', 'none')),
  commission_rate_percent numeric(6, 2) not null default 0 check (commission_rate_percent >= 0),
  fixed_amount_cents integer not null default 0 check (fixed_amount_cents >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists provider_compensation_rules_provider_branch_idx
on public.provider_compensation_rules (provider_id, branch_id, status);

create table if not exists public.provider_payouts (
  id text primary key,
  payout_number text not null unique,
  provider_id text not null,
  branch_id text not null,
  period_start date not null,
  period_end date not null,
  treatment_count integer not null default 0 check (treatment_count >= 0),
  gross_treatment_value_cents integer not null default 0 check (gross_treatment_value_cents >= 0),
  commission_rate_percent numeric(6, 2) not null default 0 check (commission_rate_percent >= 0),
  fixed_amount_cents integer not null default 0 check (fixed_amount_cents >= 0),
  payout_amount_cents integer not null default 0 check (payout_amount_cents >= 0),
  status text not null default 'draft' check (status in ('draft', 'approved', 'processed', 'void')),
  expense_id text,
  approved_by text default '',
  processed_by text default '',
  processed_at timestamptz,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create unique index if not exists provider_payouts_provider_branch_period_idx
on public.provider_payouts (provider_id, branch_id, period_start, period_end)
where status <> 'void';

create index if not exists provider_payouts_branch_period_status_idx
on public.provider_payouts (branch_id, period_start, period_end, status);

drop trigger if exists set_staff_shift_plans_updated_at on public.staff_shift_plans;
drop trigger if exists set_staff_attendance_updated_at on public.staff_attendance;
drop trigger if exists set_provider_compensation_rules_updated_at on public.provider_compensation_rules;
drop trigger if exists set_provider_payouts_updated_at on public.provider_payouts;

create trigger set_staff_shift_plans_updated_at before update on public.staff_shift_plans for each row execute procedure public.set_updated_at();
create trigger set_staff_attendance_updated_at before update on public.staff_attendance for each row execute procedure public.set_updated_at();
create trigger set_provider_compensation_rules_updated_at before update on public.provider_compensation_rules for each row execute procedure public.set_updated_at();
create trigger set_provider_payouts_updated_at before update on public.provider_payouts for each row execute procedure public.set_updated_at();

alter table public.staff_shift_plans enable row level security;
alter table public.staff_attendance enable row level security;
alter table public.provider_compensation_rules enable row level security;
alter table public.provider_payouts enable row level security;

drop policy if exists "staff_shift_plans_internal_read" on public.staff_shift_plans;
drop policy if exists "staff_shift_plans_internal_write" on public.staff_shift_plans;
drop policy if exists "staff_attendance_internal_read" on public.staff_attendance;
drop policy if exists "staff_attendance_internal_write" on public.staff_attendance;
drop policy if exists "provider_compensation_rules_internal_read" on public.provider_compensation_rules;
drop policy if exists "provider_compensation_rules_internal_write" on public.provider_compensation_rules;
drop policy if exists "provider_payouts_internal_read" on public.provider_payouts;
drop policy if exists "provider_payouts_internal_write" on public.provider_payouts;

create policy "staff_shift_plans_internal_read" on public.staff_shift_plans for select
using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));

create policy "staff_shift_plans_internal_write" on public.staff_shift_plans for all
using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy "staff_attendance_internal_read" on public.staff_attendance for select
using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));

create policy "staff_attendance_internal_write" on public.staff_attendance for all
using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy "provider_compensation_rules_internal_read" on public.provider_compensation_rules for select
using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy "provider_compensation_rules_internal_write" on public.provider_compensation_rules for all
using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy "provider_payouts_internal_read" on public.provider_payouts for select
using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy "provider_payouts_internal_write" on public.provider_payouts for all
using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));
