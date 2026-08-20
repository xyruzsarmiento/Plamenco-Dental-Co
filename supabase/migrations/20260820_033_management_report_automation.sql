-- Part 43: Management automation, scheduled reports, owner operations, and executive delivery.
-- Forward-safe and rerunnable where practical. No schedule is enabled automatically.

create table if not exists public.management_report_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  report_type text not null check (report_type in (
    'daily_operations',
    'weekly_management',
    'monthly_management',
    'branch_summary',
    'collections_summary',
    'receivables_summary',
    'expense_summary',
    'inventory_exception_summary',
    'recall_followup_summary',
    'operational_tasks_summary'
  )),
  frequency text not null check (frequency in ('daily','weekly','monthly','manual')),
  timezone text not null default 'Asia/Manila',
  branch_scope text not null default 'clinic_wide' check (branch_scope in ('clinic_wide','branch')),
  branch_id uuid references public.branches(id) on delete set null,
  format text not null default 'pdf' check (format in ('pdf','excel','secure_link','html_summary')),
  recipient_config jsonb not null default '[]'::jsonb,
  enabled boolean not null default false,
  schedule_config jsonb not null default '{}'::jsonb,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((branch_scope = 'clinic_wide' and branch_id is null) or branch_scope = 'branch')
);

create table if not exists public.management_report_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references public.management_report_schedules(id) on delete set null,
  run_key text not null,
  generation_attempt integer not null default 1 check (generation_attempt > 0),
  report_type text not null,
  period_start date not null,
  period_end date not null,
  branch_scope_snapshot jsonb not null default '{}'::jsonb,
  filters_snapshot jsonb not null default '{}'::jsonb,
  metric_definition_version text,
  status text not null default 'queued' check (status in (
    'queued','running','generated','delivery_pending','delivered','partially_delivered','failed','cancelled'
  )),
  generated_file_path text,
  generated_format text,
  started_at timestamptz,
  generated_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  failure_reason text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_start <= period_end)
);

create table if not exists public.management_report_deliveries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.management_report_runs(id) on delete restrict,
  delivery_key text not null unique,
  recipient_type text not null check (recipient_type in ('profile','approved_external_email')),
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  recipient_email text,
  channel text not null default 'email' check (channel in ('email','in_app')),
  status text not null default 'queued' check (status in ('queued','sending','sent','delivered','bounced','failed','cancelled')),
  provider_message_id text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text not null default '',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (recipient_type = 'profile' and recipient_profile_id is not null)
    or (recipient_type = 'approved_external_email' and nullif(trim(coalesce(recipient_email,'')), '') is not null)
  )
);

create unique index if not exists management_report_runs_schedule_period_attempt_uidx
  on public.management_report_runs(schedule_id, run_key, generation_attempt)
  where schedule_id is not null;

create index if not exists management_report_schedules_enabled_next_idx
  on public.management_report_schedules(enabled, next_run_at)
  where enabled = true;

create index if not exists management_report_runs_schedule_period_idx
  on public.management_report_runs(schedule_id, period_start desc, period_end desc);

create index if not exists management_report_runs_status_idx
  on public.management_report_runs(status, created_at desc);

create index if not exists management_report_deliveries_run_status_idx
  on public.management_report_deliveries(run_id, status, created_at desc);

create index if not exists management_report_deliveries_recipient_profile_idx
  on public.management_report_deliveries(recipient_profile_id, created_at desc)
  where recipient_profile_id is not null;

-- updated_at triggers

drop trigger if exists set_management_report_schedules_updated_at on public.management_report_schedules;
create trigger set_management_report_schedules_updated_at
before update on public.management_report_schedules
for each row execute procedure public.set_updated_at();

drop trigger if exists set_management_report_runs_updated_at on public.management_report_runs;
create trigger set_management_report_runs_updated_at
before update on public.management_report_runs
for each row execute procedure public.set_updated_at();

drop trigger if exists set_management_report_deliveries_updated_at on public.management_report_deliveries;
create trigger set_management_report_deliveries_updated_at
before update on public.management_report_deliveries
for each row execute procedure public.set_updated_at();

create or replace function public.can_view_management_report_scope(
  p_report_type text,
  p_branch_id uuid default null
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_internal_profile()
    and (
      public.is_management_role()
      or public.has_profile_permission('reports.view'::text)
      or public.has_profile_permission('reports.view_limited'::text)
    )
    and (
      p_report_type not in (
        'collections_summary',
        'receivables_summary',
        'expense_summary',
        'monthly_management',
        'weekly_management'
      )
      or public.is_management_role()
      or public.has_profile_permission('reports.view_financial'::text)
    )
    and (
      p_branch_id is null
      or public.is_management_role()
      or public.profile_has_active_branch(p_branch_id::text)
    );
$$;

create or replace function public.can_manage_report_automation()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_management_role() and public.has_profile_permission('reports.view'::text);
$$;

alter table public.management_report_schedules enable row level security;
alter table public.management_report_runs enable row level security;
alter table public.management_report_deliveries enable row level security;

-- Schedules

drop policy if exists "management_report_schedules_read_authorized" on public.management_report_schedules;
create policy "management_report_schedules_read_authorized"
on public.management_report_schedules
for select
using (
  public.can_view_management_report_scope(report_type, branch_id)
);

drop policy if exists "management_report_schedules_insert_management" on public.management_report_schedules;
create policy "management_report_schedules_insert_management"
on public.management_report_schedules
for insert
with check (public.can_manage_report_automation());

drop policy if exists "management_report_schedules_update_management" on public.management_report_schedules;
create policy "management_report_schedules_update_management"
on public.management_report_schedules
for update
using (public.can_manage_report_automation())
with check (public.can_manage_report_automation());

-- Runs

drop policy if exists "management_report_runs_read_authorized" on public.management_report_runs;
create policy "management_report_runs_read_authorized"
on public.management_report_runs
for select
using (
  public.can_view_management_report_scope(
    report_type,
    case
      when nullif(branch_scope_snapshot ->> 'branch_id', '') is null then null
      else (branch_scope_snapshot ->> 'branch_id')::uuid
    end
  )
);

drop policy if exists "management_report_runs_insert_management" on public.management_report_runs;
create policy "management_report_runs_insert_management"
on public.management_report_runs
for insert
with check (public.can_manage_report_automation());

-- Delivery rows are management-only because they contain recipient addresses/provider metadata.
drop policy if exists "management_report_deliveries_read_management" on public.management_report_deliveries;
create policy "management_report_deliveries_read_management"
on public.management_report_deliveries
for select
using (public.can_manage_report_automation());

create or replace function public.create_management_report_schedule(
  p_name text,
  p_report_type text,
  p_frequency text,
  p_branch_scope text,
  p_branch_id uuid default null,
  p_format text default 'pdf',
  p_recipient_config jsonb default '[]'::jsonb,
  p_schedule_config jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.can_manage_report_automation() then
    raise exception 'Not authorized to manage report schedules.';
  end if;

  if nullif(trim(p_name), '') is null then raise exception 'Schedule name is required.'; end if;
  if p_report_type not in ('daily_operations','weekly_management','monthly_management','branch_summary','collections_summary','receivables_summary','expense_summary','inventory_exception_summary','recall_followup_summary','operational_tasks_summary') then
    raise exception 'Unsupported report type.';
  end if;
  if p_frequency not in ('daily','weekly','monthly','manual') then raise exception 'Unsupported frequency.'; end if;
  if p_branch_scope not in ('clinic_wide','branch') then raise exception 'Invalid branch scope.'; end if;
  if p_branch_scope = 'branch' and p_branch_id is null then raise exception 'Branch is required for branch-scoped schedules.'; end if;
  if p_branch_scope = 'clinic_wide' then p_branch_id := null; end if;
  if p_format not in ('pdf','excel','secure_link','html_summary') then raise exception 'Unsupported report format.'; end if;

  insert into public.management_report_schedules(
    name, report_type, frequency, timezone, branch_scope, branch_id, format,
    recipient_config, enabled, schedule_config, created_by, updated_by
  ) values (
    trim(p_name), p_report_type, p_frequency, 'Asia/Manila', p_branch_scope, p_branch_id, p_format,
    coalesce(p_recipient_config, '[]'::jsonb), false, coalesce(p_schedule_config, '{}'::jsonb), auth.uid(), auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.set_management_report_schedule_enabled(
  p_schedule_id uuid,
  p_enabled boolean,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.management_report_schedules%rowtype;
begin
  if not public.can_manage_report_automation() then
    raise exception 'Not authorized to manage report schedules.';
  end if;

  select * into v_row
  from public.management_report_schedules
  where id = p_schedule_id
  for update;

  if not found then raise exception 'Report schedule not found.'; end if;
  if v_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'Report schedule changed since it was loaded. Refresh and try again.';
  end if;

  -- Enabling is allowed only when explicit schedule configuration and recipients exist.
  if p_enabled then
    if coalesce(jsonb_array_length(v_row.recipient_config), 0) = 0 then
      raise exception 'At least one approved recipient is required before enabling a schedule.';
    end if;
    if v_row.frequency <> 'manual' and v_row.schedule_config = '{}'::jsonb then
      raise exception 'Schedule timing must be configured before enabling.';
    end if;
  end if;

  update public.management_report_schedules
  set enabled = p_enabled, updated_by = auth.uid()
  where id = p_schedule_id;

  return p_schedule_id;
end;
$$;

create or replace function public.queue_management_report_run(
  p_schedule_id uuid,
  p_period_start date,
  p_period_end date,
  p_manual_regeneration boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.management_report_schedules%rowtype;
  v_base_key text;
  v_attempt integer;
  v_id uuid;
begin
  if not public.can_manage_report_automation() then
    raise exception 'Not authorized to queue management reports.';
  end if;

  if p_period_start is null or p_period_end is null or p_period_start > p_period_end then
    raise exception 'Valid report period is required.';
  end if;

  select * into v_schedule
  from public.management_report_schedules
  where id = p_schedule_id;

  if not found then raise exception 'Report schedule not found.'; end if;

  v_base_key := v_schedule.id::text || ':' || v_schedule.report_type || ':' || p_period_start::text || ':' || p_period_end::text;

  if not p_manual_regeneration then
    select id into v_id
    from public.management_report_runs
    where schedule_id = v_schedule.id
      and run_key = v_base_key
      and generation_attempt = 1
    limit 1;
    if v_id is not null then return v_id; end if;
    v_attempt := 1;
  else
    select coalesce(max(generation_attempt), 0) + 1 into v_attempt
    from public.management_report_runs
    where schedule_id = v_schedule.id and run_key = v_base_key;
  end if;

  insert into public.management_report_runs(
    schedule_id, run_key, generation_attempt, report_type, period_start, period_end,
    branch_scope_snapshot, filters_snapshot, metric_definition_version, status, created_by
  ) values (
    v_schedule.id,
    v_base_key,
    v_attempt,
    v_schedule.report_type,
    p_period_start,
    p_period_end,
    jsonb_build_object('scope', v_schedule.branch_scope, 'branch_id', v_schedule.branch_id),
    jsonb_build_object('timezone', v_schedule.timezone, 'format', v_schedule.format),
    'BUSINESS_METRICS_DEFINITIONS.md',
    'queued',
    auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

-- Functions used by trusted workers. These update state but do not perform generation/delivery themselves.
create or replace function public.mark_management_report_run_generated(
  p_run_id uuid,
  p_file_path text,
  p_generated_format text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role() = 'service_role', false) = false then
    raise exception 'Trusted report worker required.';
  end if;

  update public.management_report_runs
  set status = 'generated', generated_file_path = nullif(trim(p_file_path), ''), generated_format = p_generated_format,
      generated_at = now(), completed_at = null, failed_at = null, failure_reason = ''
  where id = p_run_id and status in ('queued','running','failed');

  if not found then raise exception 'Report run is not in a generatable state.'; end if;
end;
$$;

create or replace function public.mark_management_report_run_failed(
  p_run_id uuid,
  p_failure_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role() = 'service_role', false) = false then
    raise exception 'Trusted report worker required.';
  end if;

  update public.management_report_runs
  set status = 'failed', failed_at = now(), failure_reason = coalesce(nullif(trim(p_failure_reason), ''), 'Report generation failed.')
  where id = p_run_id;
end;
$$;

-- Function security
revoke all on function public.can_view_management_report_scope(text,uuid) from public;
revoke all on function public.can_manage_report_automation() from public;
revoke all on function public.create_management_report_schedule(text,text,text,text,uuid,text,jsonb,jsonb) from public;
revoke all on function public.set_management_report_schedule_enabled(uuid,boolean,timestamptz) from public;
revoke all on function public.queue_management_report_run(uuid,date,date,boolean) from public;
revoke all on function public.mark_management_report_run_generated(uuid,text,text) from public;
revoke all on function public.mark_management_report_run_failed(uuid,text) from public;

grant execute on function public.can_view_management_report_scope(text,uuid) to authenticated;
grant execute on function public.can_manage_report_automation() to authenticated;
grant execute on function public.create_management_report_schedule(text,text,text,text,uuid,text,jsonb,jsonb) to authenticated;
grant execute on function public.set_management_report_schedule_enabled(uuid,boolean,timestamptz) to authenticated;
grant execute on function public.queue_management_report_run(uuid,date,date,boolean) to authenticated;
grant execute on function public.mark_management_report_run_generated(uuid,text,text) to service_role;
grant execute on function public.mark_management_report_run_failed(uuid,text) to service_role;

comment on table public.management_report_schedules is
'Part 43 management report schedules. All schedules are created disabled until recipients and timing are explicitly configured.';

comment on table public.management_report_runs is
'Persisted report generation runs. Generated/Delivered states must reflect trusted worker/provider truth.';

comment on table public.management_report_deliveries is
'Per-recipient management report delivery state. Sent/Delivered must be provider-backed.';
