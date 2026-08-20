-- Advanced appointment scheduling foundations.
-- Adds optional operatories/resources, schedule blocks, waitlist, deposit fields,
-- and backend overlap prevention for provider and operatory bookings.

create extension if not exists btree_gist;

create table if not exists public.operatories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  branch_id uuid not null references public.branches(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'inactive', 'maintenance')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointments
  add column if not exists operatory_id uuid references public.operatories(id) on delete set null,
  add column if not exists deposit_status text not null default 'not_required'
    check (deposit_status in ('not_required', 'pending', 'paid', 'partially_paid', 'refunded', 'forfeited')),
  add column if not exists deposit_required_cents integer not null default 0 check (deposit_required_cents >= 0),
  add column if not exists deposit_paid_cents integer not null default 0 check (deposit_paid_cents >= 0);

create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  provider_id uuid references public.providers(id) on delete cascade,
  operatory_id uuid references public.operatories(id) on delete cascade,
  block_date date not null,
  start_time text,
  end_time text,
  full_day boolean not null default false,
  block_type text not null default 'other' check (block_type in ('meeting', 'training', 'equipment_maintenance', 'personal', 'clinic_event', 'holiday', 'emergency_closure', 'other')),
  reason text not null default '',
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (full_day or (start_time is not null and end_time is not null and start_time < end_time))
);

create table if not exists public.appointment_waitlist (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null,
  branch_id uuid not null references public.branches(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  preferred_provider_id uuid references public.providers(id) on delete set null,
  preferred_date_start date not null,
  preferred_date_end date not null,
  preferred_time_start text,
  preferred_time_end text,
  priority text not null default 'normal' check (priority in ('normal', 'high', 'urgent')),
  status text not null default 'waiting' check (status in ('waiting', 'contacted', 'scheduled', 'declined', 'cancelled')),
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (preferred_date_start <= preferred_date_end)
);

alter table public.operatories enable row level security;
alter table public.schedule_blocks enable row level security;
alter table public.appointment_waitlist enable row level security;

drop policy if exists "operatories_read_authenticated" on public.operatories;
create policy "operatories_read_authenticated" on public.operatories
for select using (auth.role() = 'authenticated');

drop policy if exists "operatories_manage_schedule_authorized" on public.operatories;
create policy "operatories_manage_schedule_authorized" on public.operatories
for all
using (public.has_profile_permission('schedule.manage_all'::text) or public.has_profile_permission('system_admin.manage'::text))
with check (public.has_profile_permission('schedule.manage_all'::text) or public.has_profile_permission('system_admin.manage'::text));

drop policy if exists "schedule_blocks_read_authenticated" on public.schedule_blocks;
create policy "schedule_blocks_read_authenticated" on public.schedule_blocks
for select using (auth.role() = 'authenticated');

drop policy if exists "schedule_blocks_manage_authorized" on public.schedule_blocks;
create policy "schedule_blocks_manage_authorized" on public.schedule_blocks
for all
using (public.has_profile_permission('schedule.manage_all'::text) or public.has_profile_permission('system_admin.manage'::text))
with check (public.has_profile_permission('schedule.manage_all'::text) or public.has_profile_permission('system_admin.manage'::text));

drop policy if exists "appointment_waitlist_read_authorized" on public.appointment_waitlist;
create policy "appointment_waitlist_read_authorized" on public.appointment_waitlist
for select using (public.has_profile_permission('appointments.view'::text));

drop policy if exists "appointment_waitlist_manage_authorized" on public.appointment_waitlist;
create policy "appointment_waitlist_manage_authorized" on public.appointment_waitlist
for all
using (public.has_profile_permission('appointments.create'::text) or public.has_profile_permission('appointments.approve'::text))
with check (public.has_profile_permission('appointments.create'::text) or public.has_profile_permission('appointments.approve'::text));

alter table public.appointments
  drop constraint if exists appointments_provider_no_overlap;

alter table public.appointments
  add constraint appointments_provider_no_overlap
  exclude using gist (
    provider_id with =,
    public.appointment_time_range(appointment_date, start_time, end_time) with &&
  )
  where (
    provider_id is not null
    and status in ('pending', 'confirmed', 'rescheduled', 'checked_in', 'waiting', 'in_progress', 'completed')
  );

alter table public.appointments
  drop constraint if exists appointments_operatory_no_overlap;

alter table public.appointments
  add constraint appointments_operatory_no_overlap
  exclude using gist (
    operatory_id with =,
    public.appointment_time_range(appointment_date, start_time, end_time) with &&
  )
  where (
    operatory_id is not null
    and status in ('pending', 'confirmed', 'rescheduled', 'checked_in', 'waiting', 'in_progress', 'completed')
  );

create index if not exists operatories_branch_status_idx on public.operatories(branch_id, status);
create index if not exists schedule_blocks_branch_date_idx on public.schedule_blocks(branch_id, block_date);
create index if not exists schedule_blocks_provider_date_idx on public.schedule_blocks(provider_id, block_date);
create index if not exists schedule_blocks_operatory_date_idx on public.schedule_blocks(operatory_id, block_date);
create index if not exists appointment_waitlist_status_branch_idx on public.appointment_waitlist(status, branch_id, preferred_date_start);
create index if not exists appointments_operatory_date_idx on public.appointments(operatory_id, appointment_date);
