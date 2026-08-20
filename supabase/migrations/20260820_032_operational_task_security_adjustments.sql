-- Part 41 follow-up hardening for operational task access.
-- Safe to run after 20260820_031_operational_tasks_workflow_automation.sql.

create or replace function public.can_view_operational_task(
  p_branch_id text,
  p_provider_id text,
  p_assignee_profile_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.has_profile_permission('system_admin.view'::text)
    or public.has_profile_permission('tasks.view_all'::text)
    or (
      public.is_internal_profile()
      and p_assignee_profile_id = auth.uid()
      and public.current_profile_role() in ('staff','dentist','associate_dentist')
    )
    or (
      public.is_internal_profile()
      and p_branch_id is not null
      and public.current_profile_role() = 'staff'
      and public.profile_has_active_branch(p_branch_id)
    )
    or (
      p_branch_id is not null
      and public.has_profile_permission('tasks.view_branch'::text)
      and public.profile_has_active_branch(p_branch_id)
    )
    or (
      public.is_internal_profile()
      and p_provider_id is not null
      and public.current_profile_role() in ('dentist','associate_dentist')
      and exists (
        select 1 from public.providers pr
        where pr.profile_id = auth.uid()
          and pr.id::text = p_provider_id
          and pr.status in ('active','on_leave')
      )
    )
    or (
      p_assignee_profile_id = auth.uid()
      and public.has_profile_permission('tasks.view_own'::text)
    );
$$;

create or replace function public.can_manage_operational_task(
  p_branch_id text,
  p_assignee_profile_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.has_profile_permission('system_admin.manage'::text)
    or public.has_profile_permission('tasks.update'::text)
    or (
      public.is_internal_profile()
      and p_assignee_profile_id = auth.uid()
      and public.current_profile_role() in ('staff','dentist','associate_dentist')
    )
    or (
      public.is_internal_profile()
      and p_branch_id is not null
      and public.current_profile_role() = 'staff'
      and public.profile_has_active_branch(p_branch_id)
      and public.has_profile_permission('tasks.update'::text)
    );
$$;

-- Replace task creation with an actor-safe version. Browser users cannot claim to be
-- system/edge/database automation simply by changing the RPC argument.
create or replace function public.create_operational_task(
  p_task_key text,
  p_task_type text,
  p_title text,
  p_description text,
  p_source_type text,
  p_source_id text,
  p_source_route text default null,
  p_patient_id text default null,
  p_branch_id text default null,
  p_provider_id text default null,
  p_priority text default 'normal',
  p_due_at timestamptz default null,
  p_assignee_profile_id uuid default null,
  p_automation_rule_key text default null,
  p_created_source text default 'user'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
  v_is_service_role boolean := coalesce(auth.role() = 'service_role', false);
begin
  if nullif(trim(p_task_key), '') is null then raise exception 'Task key is required.'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'Task title is required.'; end if;
  if nullif(trim(p_source_type), '') is null or nullif(trim(p_source_id), '') is null then raise exception 'Task source is required.'; end if;
  if p_priority not in ('low','normal','high','critical') then raise exception 'Invalid priority.'; end if;
  if p_created_source not in ('user','system','edge_function','database_event') then raise exception 'Invalid creation source.'; end if;

  if p_created_source = 'user' then
    if not (
      public.has_profile_permission('tasks.create'::text)
      or public.has_profile_permission('system_admin.manage'::text)
    ) then
      raise exception 'Not authorized to create tasks.';
    end if;
  else
    if not (v_is_service_role or public.has_profile_permission('system_admin.manage'::text)) then
      raise exception 'Only trusted automation may create system tasks.';
    end if;
  end if;

  select id into v_task_id
  from public.operational_tasks
  where task_key = trim(p_task_key)
    and status not in ('completed','cancelled')
  order by created_at desc
  limit 1;
  if v_task_id is not null then return v_task_id; end if;

  begin
    insert into public.operational_tasks(
      task_key, task_type, title, description, priority, patient_id, branch_id, provider_id,
      assignee_profile_id, source_type, source_id, source_route, automation_rule_key, due_at,
      created_by, created_source
    ) values (
      trim(p_task_key), p_task_type, trim(p_title), coalesce(p_description,''), p_priority,
      p_patient_id, p_branch_id, p_provider_id, p_assignee_profile_id, p_source_type, p_source_id,
      p_source_route, p_automation_rule_key, p_due_at,
      case when p_created_source = 'user' then auth.uid() else null end,
      p_created_source
    ) returning id into v_task_id;
  exception when unique_violation then
    select id into v_task_id
    from public.operational_tasks
    where task_key = trim(p_task_key)
      and status not in ('completed','cancelled')
    order by created_at desc
    limit 1;
  end;

  insert into public.task_events(task_id, event_type, actor_profile_id, new_value, notes)
  values (
    v_task_id,
    case when p_created_source = 'user' then 'task_created' else 'task_auto_created' end,
    case when p_created_source = 'user' then auth.uid() else null end,
    jsonb_build_object('status','open','priority',p_priority),
    case when p_automation_rule_key is null then '' else 'Automation rule: ' || p_automation_rule_key end
  );

  return v_task_id;
end;
$$;

-- Claiming stays an explicit permission pending clinic policy.
create or replace function public.claim_operational_task(
  p_task_id uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.operational_tasks%rowtype;
begin
  select * into v_task from public.operational_tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found.'; end if;
  if not (public.has_profile_permission('tasks.claim'::text) or public.has_profile_permission('system_admin.manage'::text)) then
    raise exception 'Not authorized to claim tasks.';
  end if;
  if v_task.assignee_profile_id is not null and v_task.assignee_profile_id <> auth.uid() then raise exception 'Task has already been assigned.'; end if;
  if v_task.updated_at is distinct from p_expected_updated_at then raise exception 'Task changed since it was loaded. Refresh and try again.'; end if;
  if not public.can_view_operational_task(v_task.branch_id, v_task.provider_id, v_task.assignee_profile_id) then raise exception 'Not authorized for this task.'; end if;

  update public.operational_tasks
  set assignee_profile_id = auth.uid(), claimed_at = coalesce(claimed_at, now()), status = case when status='open' then 'in_progress' else status end
  where id = p_task_id;

  insert into public.task_events(task_id,event_type,actor_profile_id,old_value,new_value)
  values (p_task_id,'task_claimed',auth.uid(),jsonb_build_object('assignee',v_task.assignee_profile_id),jsonb_build_object('assignee',auth.uid()));
  return p_task_id;
end;
$$;

-- Remove default PUBLIC execute grants from the task mutation surface.
revoke all on function public.can_view_operational_task(text,text,uuid) from public;
revoke all on function public.can_manage_operational_task(text,uuid) from public;
revoke all on function public.create_operational_task(text,text,text,text,text,text,text,text,text,text,text,timestamptz,uuid,text,text) from public;
revoke all on function public.claim_operational_task(uuid,timestamptz) from public;
revoke all on function public.update_operational_task_state(uuid,text,timestamptz,text,text,timestamptz) from public;
revoke all on function public.assign_operational_task(uuid,uuid,timestamptz) from public;
revoke all on function public.add_operational_task_note(uuid,text) from public;

grant execute on function public.can_view_operational_task(text,text,uuid) to authenticated;
grant execute on function public.can_manage_operational_task(text,uuid) to authenticated;
grant execute on function public.create_operational_task(text,text,text,text,text,text,text,text,text,text,text,timestamptz,uuid,text,text) to authenticated, service_role;
grant execute on function public.claim_operational_task(uuid,timestamptz) to authenticated;
grant execute on function public.update_operational_task_state(uuid,text,timestamptz,text,text,timestamptz) to authenticated;
grant execute on function public.assign_operational_task(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.add_operational_task_note(uuid,text) to authenticated;
