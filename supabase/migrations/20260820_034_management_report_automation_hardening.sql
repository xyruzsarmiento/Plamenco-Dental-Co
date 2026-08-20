-- Part 43 follow-up hardening for management report automation.
-- Safe to run after 20260820_033_management_report_automation.sql.

-- Add forward-safe constraints only when they do not already exist.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'management_report_schedules_branch_scope_consistency'
      and conrelid = 'public.management_report_schedules'::regclass
  ) then
    alter table public.management_report_schedules
      add constraint management_report_schedules_branch_scope_consistency
      check (
        (branch_scope = 'clinic_wide' and branch_id is null)
        or (branch_scope = 'branch' and branch_id is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'management_report_schedules_recipient_config_array'
      and conrelid = 'public.management_report_schedules'::regclass
  ) then
    alter table public.management_report_schedules
      add constraint management_report_schedules_recipient_config_array
      check (jsonb_typeof(recipient_config) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'management_report_schedules_schedule_config_object'
      and conrelid = 'public.management_report_schedules'::regclass
  ) then
    alter table public.management_report_schedules
      add constraint management_report_schedules_schedule_config_object
      check (jsonb_typeof(schedule_config) = 'object');
  end if;
end
$$;

-- Direct table writes by authenticated clients are narrowed to RLS-authorized
-- schedule configuration only. Trusted workers use service_role.
revoke insert, update, delete on public.management_report_runs from authenticated;
revoke insert, update, delete on public.management_report_deliveries from authenticated;

-- The queue RPC is the only authenticated path for creating run records.
-- It remains management-authorized and idempotent by schedule + period.

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

  if not found then
    raise exception 'Report schedule not found.';
  end if;

  if v_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'Report schedule changed since it was loaded. Refresh and try again.';
  end if;

  if p_enabled then
    if jsonb_typeof(v_row.recipient_config) <> 'array'
       or jsonb_array_length(v_row.recipient_config) = 0 then
      raise exception 'At least one approved recipient is required before enabling a schedule.';
    end if;

    if v_row.frequency <> 'manual'
       and (
         jsonb_typeof(v_row.schedule_config) <> 'object'
         or v_row.schedule_config = '{}'::jsonb
       ) then
      raise exception 'Schedule timing must be configured before enabling.';
    end if;
  end if;

  update public.management_report_schedules
  set enabled = p_enabled,
      updated_by = auth.uid()
  where id = p_schedule_id;

  return p_schedule_id;
end;
$$;

-- Delivery state updates are trusted-worker only. These helpers preserve provider truth.
create or replace function public.record_management_report_delivery(
  p_run_id uuid,
  p_delivery_key text,
  p_recipient_type text,
  p_recipient_profile_id uuid default null,
  p_recipient_email text default null,
  p_channel text default 'email'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.role() = 'service_role', false) = false then
    raise exception 'Trusted report delivery worker required.';
  end if;

  if nullif(trim(p_delivery_key), '') is null then
    raise exception 'Delivery key is required.';
  end if;

  insert into public.management_report_deliveries(
    run_id,
    delivery_key,
    recipient_type,
    recipient_profile_id,
    recipient_email,
    channel,
    status
  ) values (
    p_run_id,
    trim(p_delivery_key),
    p_recipient_type,
    p_recipient_profile_id,
    case when p_recipient_email is null then null else lower(trim(p_recipient_email)) end,
    p_channel,
    'queued'
  )
  on conflict (delivery_key) do update
    set delivery_key = excluded.delivery_key
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.update_management_report_delivery_state(
  p_delivery_id uuid,
  p_status text,
  p_provider_message_id text default null,
  p_failure_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role() = 'service_role', false) = false then
    raise exception 'Trusted report delivery worker required.';
  end if;

  if p_status not in ('queued','sending','sent','delivered','bounced','failed','cancelled') then
    raise exception 'Invalid delivery status.';
  end if;

  update public.management_report_deliveries
  set status = p_status,
      provider_message_id = coalesce(nullif(trim(p_provider_message_id), ''), provider_message_id),
      attempt_count = case when p_status = 'sending' then attempt_count + 1 else attempt_count end,
      sent_at = case when p_status = 'sent' then coalesce(sent_at, now()) else sent_at end,
      delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
      failed_at = case when p_status in ('failed','bounced') then now() else failed_at end,
      failure_reason = case
        when p_status in ('failed','bounced') then coalesce(nullif(trim(p_failure_reason), ''), 'Delivery failed.')
        when p_status in ('sent','delivered') then ''
        else failure_reason
      end
  where id = p_delivery_id;

  if not found then
    raise exception 'Report delivery not found.';
  end if;
end;
$$;

revoke all on function public.record_management_report_delivery(uuid,text,text,uuid,text,text) from public;
revoke all on function public.update_management_report_delivery_state(uuid,text,text,text) from public;

grant execute on function public.record_management_report_delivery(uuid,text,text,uuid,text,text) to service_role;
grant execute on function public.update_management_report_delivery_state(uuid,text,text,text) to service_role;
