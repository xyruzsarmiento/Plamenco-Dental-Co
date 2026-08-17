-- Roles, permissions, branches, providers, assignments, and availability foundation.
-- Backward-compatible: does not drop or rewrite existing patient, staff, appointment, or billing data.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null,
  role text not null check (role in ('super_admin', 'admin', 'dentist', 'associate_dentist', 'staff', 'patient')) default 'patient',
  status text not null check (status in ('active', 'inactive', 'suspended')) default 'active',
  permissions text[] not null default '{}',
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address text not null default '',
  city text not null default '',
  province text not null default 'Bulacan',
  phone text default '',
  email text default '',
  opening_time time not null default '09:00',
  closing_time time not null default '18:00',
  status text not null check (status in ('active', 'inactive')) default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  display_name text not null,
  role text not null check (role in ('dentist', 'associate_dentist')),
  email text not null,
  phone text default '',
  specialization text default '',
  license_number text default '',
  bio text default '',
  photo_url text default '',
  status text not null check (status in ('active', 'inactive', 'on_leave')) default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_branch_assignments (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  is_primary boolean not null default false,
  status text not null check (status in ('active', 'inactive')) default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, branch_id)
);

create table if not exists public.staff_branch_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  is_primary boolean not null default false,
  status text not null check (status in ('active', 'inactive')) default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, branch_id)
);

create table if not exists public.provider_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  status text not null check (status in ('active', 'inactive')) default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time)
);

create table if not exists public.provider_availability_overrides (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete restrict,
  override_date date not null,
  type text not null check (type in ('available', 'unavailable', 'special_hours', 'leave')),
  start_time time,
  end_time time,
  reason text default '',
  private_notes text default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and start_time < end_time)
  )
);

create or replace function public.current_profile_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_management_role()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_profile_role() in ('super_admin', 'admin'), false)
$$;

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
        and status = 'active'
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

create or replace function public.handle_new_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    email,
    role,
    status
  )
  values (
    new.id,
    trim(coalesce(new.raw_user_meta_data ->> 'first_name', '') || ' ' || coalesce(new.raw_user_meta_data ->> 'last_name', '')),
    lower(coalesce(new.email, '')),
    'patient',
    'active'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
drop trigger if exists set_branches_updated_at on public.branches;
drop trigger if exists set_providers_updated_at on public.providers;
drop trigger if exists set_provider_branch_assignments_updated_at on public.provider_branch_assignments;
drop trigger if exists set_staff_branch_assignments_updated_at on public.staff_branch_assignments;
drop trigger if exists set_provider_schedule_blocks_updated_at on public.provider_schedule_blocks;
drop trigger if exists set_provider_availability_overrides_updated_at on public.provider_availability_overrides;
drop trigger if exists on_auth_user_profile_created on auth.users;

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

create trigger set_branches_updated_at
before update on public.branches
for each row execute procedure public.set_updated_at();

create trigger set_providers_updated_at
before update on public.providers
for each row execute procedure public.set_updated_at();

create trigger set_provider_branch_assignments_updated_at
before update on public.provider_branch_assignments
for each row execute procedure public.set_updated_at();

create trigger set_staff_branch_assignments_updated_at
before update on public.staff_branch_assignments
for each row execute procedure public.set_updated_at();

create trigger set_provider_schedule_blocks_updated_at
before update on public.provider_schedule_blocks
for each row execute procedure public.set_updated_at();

create trigger set_provider_availability_overrides_updated_at
before update on public.provider_availability_overrides
for each row execute procedure public.set_updated_at();

create trigger on_auth_user_profile_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_profile();

alter table public.profiles enable row level security;
alter table public.branches enable row level security;
alter table public.providers enable row level security;
alter table public.provider_branch_assignments enable row level security;
alter table public.staff_branch_assignments enable row level security;
alter table public.provider_schedule_blocks enable row level security;
alter table public.provider_availability_overrides enable row level security;

drop policy if exists "profiles_read_own_or_management" on public.profiles;
drop policy if exists "profiles_update_own_or_management" on public.profiles;
drop policy if exists "profiles_insert_management" on public.profiles;
drop policy if exists "branches_read_authenticated" on public.branches;
drop policy if exists "branches_write_management" on public.branches;
drop policy if exists "providers_read_authenticated" on public.providers;
drop policy if exists "providers_write_management" on public.providers;
drop policy if exists "provider_branch_assignments_read_authenticated" on public.provider_branch_assignments;
drop policy if exists "provider_branch_assignments_write_management" on public.provider_branch_assignments;
drop policy if exists "staff_branch_assignments_read_authenticated" on public.staff_branch_assignments;
drop policy if exists "staff_branch_assignments_write_management" on public.staff_branch_assignments;
drop policy if exists "provider_schedule_blocks_read_authenticated" on public.provider_schedule_blocks;
drop policy if exists "provider_schedule_blocks_write_management" on public.provider_schedule_blocks;
drop policy if exists "provider_availability_overrides_read_authenticated" on public.provider_availability_overrides;
drop policy if exists "provider_availability_overrides_write_management_or_own_provider" on public.provider_availability_overrides;

create policy "profiles_read_own_or_management"
on public.profiles for select
using (id = auth.uid() or public.is_management_role());

create policy "profiles_update_own_or_management"
on public.profiles for update
using (id = auth.uid() or public.is_management_role())
with check (id = auth.uid() or public.is_management_role());

create policy "profiles_insert_management"
on public.profiles for insert
with check (public.is_management_role());

create policy "branches_read_authenticated"
on public.branches for select
using (auth.role() = 'authenticated');

create policy "branches_write_management"
on public.branches for all
using (public.is_management_role())
with check (public.is_management_role());

create policy "providers_read_authenticated"
on public.providers for select
using (auth.role() = 'authenticated');

create policy "providers_write_management"
on public.providers for all
using (public.is_management_role())
with check (public.is_management_role());

create policy "provider_branch_assignments_read_authenticated"
on public.provider_branch_assignments for select
using (auth.role() = 'authenticated');

create policy "provider_branch_assignments_write_management"
on public.provider_branch_assignments for all
using (public.is_management_role())
with check (public.is_management_role());

create policy "staff_branch_assignments_read_authenticated"
on public.staff_branch_assignments for select
using (auth.role() = 'authenticated');

create policy "staff_branch_assignments_write_management"
on public.staff_branch_assignments for all
using (public.is_management_role())
with check (public.is_management_role());

create policy "provider_schedule_blocks_read_authenticated"
on public.provider_schedule_blocks for select
using (auth.role() = 'authenticated');

create policy "provider_schedule_blocks_write_management"
on public.provider_schedule_blocks for all
using (public.is_management_role())
with check (public.is_management_role());

create policy "provider_availability_overrides_read_authenticated"
on public.provider_availability_overrides for select
using (auth.role() = 'authenticated');

create policy "provider_availability_overrides_write_management_or_own_provider"
on public.provider_availability_overrides for all
using (
  public.is_management_role()
  or exists (
    select 1
    from public.providers p
    where p.id::text = provider_availability_overrides.provider_id::text
      and p.profile_id = auth.uid()
  )
)
with check (
  public.is_management_role()
  or exists (
    select 1
    from public.providers p
    where p.id::text = provider_availability_overrides.provider_id::text
      and p.profile_id = auth.uid()
  )
);

insert into public.branches (name, code, address, city, province, status)
values
  ('Plamenco Dental Co. - Pulilan', 'pulilan', 'Pulilan, Bulacan', 'Pulilan', 'Bulacan', 'active'),
  ('Plamenco Dental Co. - Plaridel', 'plaridel', 'Plaridel, Bulacan', 'Plaridel', 'Bulacan', 'active')
on conflict (code) do update
set
  name = excluded.name,
  address = excluded.address,
  city = excluded.city,
  province = excluded.province,
  updated_at = now();
