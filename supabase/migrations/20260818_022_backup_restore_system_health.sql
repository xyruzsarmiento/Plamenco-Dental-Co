-- Part 27: Backup, restore, disaster recovery, and system health V2.
-- This records operational evidence and recovery plans; it does not create or execute platform backups.

create table if not exists public.system_backup_registry (
  id uuid primary key default gen_random_uuid(),
  backup_kind text not null check (backup_kind in ('platform_database_backup', 'data_export', 'pre_migration_snapshot', 'configuration_backup', 'storage_backup')),
  environment text not null default 'unknown' check (environment in ('production', 'staging', 'development', 'unknown')),
  status text not null default 'planned' check (status in ('planned', 'running', 'completed', 'failed')),
  verification_status text not null default 'unknown' check (verification_status in ('unknown', 'created', 'verified', 'verification_failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by text not null default '',
  location text not null default '',
  size_bytes bigint,
  checksum text default '',
  retention_policy text default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_restore_plans (
  id uuid primary key default gen_random_uuid(),
  backup_id uuid references public.system_backup_registry(id) on delete restrict,
  target_environment text not null,
  data_scope text not null,
  reason text not null,
  impact text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'completed', 'cancelled')),
  requested_by text not null default '',
  requested_at timestamptz not null default now(),
  approved_by text default '',
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  run_id text not null default '',
  status text not null check (status in ('running', 'succeeded', 'failed', 'partial', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  processed integer not null default 0,
  succeeded integer not null default 0,
  failed integer not null default 0,
  error_summary text default '',
  next_scheduled_run text default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.system_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null default now(),
  overall_state text not null check (overall_state in ('operational', 'degraded', 'unavailable', 'not_configured', 'unknown')),
  checks jsonb not null default '[]'::jsonb,
  recent_failures jsonb not null default '[]'::jsonb,
  created_by text not null default ''
);

create index if not exists system_backup_registry_environment_started_idx
  on public.system_backup_registry(environment, started_at desc);

create index if not exists system_backup_registry_verification_idx
  on public.system_backup_registry(verification_status, completed_at desc);

create index if not exists system_restore_plans_status_requested_idx
  on public.system_restore_plans(status, requested_at desc);

create index if not exists system_job_runs_name_started_idx
  on public.system_job_runs(job_name, started_at desc);

create index if not exists system_health_snapshots_generated_idx
  on public.system_health_snapshots(generated_at desc);

drop trigger if exists set_system_backup_registry_updated_at on public.system_backup_registry;
create trigger set_system_backup_registry_updated_at
before update on public.system_backup_registry
for each row execute procedure public.set_updated_at();

drop trigger if exists set_system_restore_plans_updated_at on public.system_restore_plans;
create trigger set_system_restore_plans_updated_at
before update on public.system_restore_plans
for each row execute procedure public.set_updated_at();

alter table public.system_backup_registry enable row level security;
alter table public.system_restore_plans enable row level security;
alter table public.system_job_runs enable row level security;
alter table public.system_health_snapshots enable row level security;

drop policy if exists "system_backup_registry_read_authorized" on public.system_backup_registry;
drop policy if exists "system_backup_registry_write_authorized" on public.system_backup_registry;
drop policy if exists "system_restore_plans_read_authorized" on public.system_restore_plans;
drop policy if exists "system_restore_plans_write_authorized" on public.system_restore_plans;
drop policy if exists "system_job_runs_read_authorized" on public.system_job_runs;
drop policy if exists "system_job_runs_write_authorized" on public.system_job_runs;
drop policy if exists "system_health_snapshots_read_authorized" on public.system_health_snapshots;
drop policy if exists "system_health_snapshots_write_authorized" on public.system_health_snapshots;

create policy "system_backup_registry_read_authorized"
on public.system_backup_registry for select
using (public.has_profile_permission('system_admin.view'));

create policy "system_backup_registry_write_authorized"
on public.system_backup_registry for all
using (public.has_profile_permission('system_admin.manage'))
with check (public.has_profile_permission('system_admin.manage'));

create policy "system_restore_plans_read_authorized"
on public.system_restore_plans for select
using (public.has_profile_permission('system_admin.view'));

create policy "system_restore_plans_write_authorized"
on public.system_restore_plans for all
using (public.has_profile_permission('system_admin.manage'))
with check (public.has_profile_permission('system_admin.manage'));

create policy "system_job_runs_read_authorized"
on public.system_job_runs for select
using (public.has_profile_permission('system_admin.view'));

create policy "system_job_runs_write_authorized"
on public.system_job_runs for all
using (public.has_profile_permission('system_admin.manage'))
with check (public.has_profile_permission('system_admin.manage'));

create policy "system_health_snapshots_read_authorized"
on public.system_health_snapshots for select
using (public.has_profile_permission('system_admin.view'));

create policy "system_health_snapshots_write_authorized"
on public.system_health_snapshots for all
using (public.has_profile_permission('system_admin.manage'))
with check (public.has_profile_permission('system_admin.manage'));
