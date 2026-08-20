create extension if not exists pgcrypto;

alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check
  check (status in ('active', 'inactive', 'suspended', 'invited', 'pending'));

alter table public.providers
  add column if not exists show_on_website boolean not null default false,
  add column if not exists public_bio text not null default '',
  add column if not exists display_order integer not null default 100;

alter table public.services
  add column if not exists branch_ids text[] not null default '{}',
  add column if not exists online_bookable boolean not null default true,
  add column if not exists internal_only boolean not null default false,
  add column if not exists show_on_website boolean not null default true,
  add column if not exists image_url text not null default '';

alter table public.payment_methods
  add column if not exists patient_portal_available boolean not null default true,
  add column if not exists environment text not null default 'not_configured'
    check (environment in ('not_configured', 'test', 'production'));

create table if not exists public.clinic_configuration (
  id text primary key default 'clinic',
  clinic_name text not null default 'Plamenco Dental Co.',
  primary_email text not null default '',
  primary_phone text not null default '',
  website text not null default '',
  facebook_page text not null default '',
  address text not null default '',
  business_hours text not null default '',
  public_description text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_configuration (
  id text primary key default 'booking',
  online_booking_enabled boolean not null default true,
  default_slot_minutes integer not null default 30 check (default_slot_minutes >= 5),
  minimum_lead_hours integer not null default 2 check (minimum_lead_hours >= 0),
  maximum_advance_days integer not null default 60 check (maximum_advance_days >= 1),
  cancellation_cutoff_hours integer not null default 12 check (cancellation_cutoff_hours >= 0),
  reschedule_cutoff_hours integer not null default 12 check (reschedule_cutoff_hours >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.clinic_closures (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete restrict,
  closure_date date not null,
  closure_type text not null default 'special_closure'
    check (closure_type in ('holiday', 'maintenance', 'special_closure', 'training', 'other')),
  reason text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (branch_id, closure_date, closure_type)
);

create table if not exists public.internal_account_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  role text not null check (role in ('super_admin', 'admin', 'dentist', 'associate_dentist', 'staff')),
  branch_ids uuid[] not null default '{}',
  provider_profile_required boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'accepted', 'cancelled')),
  error_message text not null default '',
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.system_health_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  severity text not null check (severity in ('info', 'warning', 'danger')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_status_idx on public.profiles (role, status);
create index if not exists providers_public_profile_idx on public.providers (show_on_website, display_order);
create index if not exists services_admin_status_idx on public.services (status, online_bookable, show_on_website);
create index if not exists clinic_closures_branch_date_idx on public.clinic_closures (branch_id, closure_date);
create index if not exists internal_account_invitations_status_idx on public.internal_account_invitations (status, invited_at desc);
create index if not exists system_health_events_severity_idx on public.system_health_events (severity, created_at desc);

create or replace function public.prevent_last_super_admin_deactivation()
returns trigger
language plpgsql
as $$
begin
  if old.role = 'super_admin'
    and old.status = 'active'
    and new.status <> 'active'
    and (
      select count(*)
      from public.profiles
      where role = 'super_admin'
        and status = 'active'
        and id <> old.id
    ) = 0
  then
    raise exception 'At least one active Super Admin must remain.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_last_super_admin_deactivation_before_update on public.profiles;
create trigger prevent_last_super_admin_deactivation_before_update
before update on public.profiles
for each row execute procedure public.prevent_last_super_admin_deactivation();

create or replace function public.is_clinic_closed(
  p_date date,
  p_branch_id uuid default null
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.clinic_closures
    where closure_date = p_date
      and (branch_id is null or branch_id = p_branch_id)
  );
$$;

alter table public.clinic_configuration enable row level security;
alter table public.booking_configuration enable row level security;
alter table public.clinic_closures enable row level security;
alter table public.internal_account_invitations enable row level security;
alter table public.system_health_events enable row level security;

drop policy if exists "system_admin_read_clinic_configuration" on public.clinic_configuration;
create policy "system_admin_read_clinic_configuration"
on public.clinic_configuration for select
using (public.has_profile_permission('settings.manage'::text) or public.has_profile_permission('system_admin.view'::text));

drop policy if exists "system_admin_write_clinic_configuration" on public.clinic_configuration;
create policy "system_admin_write_clinic_configuration"
on public.clinic_configuration for all
using (public.has_profile_permission('system_admin.manage'::text))
with check (public.has_profile_permission('system_admin.manage'::text));

drop policy if exists "system_admin_read_booking_configuration" on public.booking_configuration;
create policy "system_admin_read_booking_configuration"
on public.booking_configuration for select
using (public.has_profile_permission('settings.manage'::text) or public.has_profile_permission('system_admin.view'::text));

drop policy if exists "system_admin_write_booking_configuration" on public.booking_configuration;
create policy "system_admin_write_booking_configuration"
on public.booking_configuration for all
using (public.has_profile_permission('system_admin.manage'::text))
with check (public.has_profile_permission('system_admin.manage'::text));

drop policy if exists "system_admin_manage_closures" on public.clinic_closures;
create policy "system_admin_manage_closures"
on public.clinic_closures for all
using (public.has_profile_permission('system_admin.manage'::text) or public.has_profile_permission('schedule.manage_all'::text))
with check (public.has_profile_permission('system_admin.manage'::text) or public.has_profile_permission('schedule.manage_all'::text));

drop policy if exists "system_admin_manage_invitations" on public.internal_account_invitations;
create policy "system_admin_manage_invitations"
on public.internal_account_invitations for all
using (public.has_profile_permission('system_admin.manage'::text) or public.has_profile_permission('staff.manage'::text))
with check (public.has_profile_permission('system_admin.manage'::text) or public.has_profile_permission('staff.manage'::text));

drop policy if exists "system_admin_read_health_events" on public.system_health_events;
create policy "system_admin_read_health_events"
on public.system_health_events for select
using (public.has_profile_permission('system_admin.view'::text));
