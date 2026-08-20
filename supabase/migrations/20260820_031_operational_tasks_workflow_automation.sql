-- Part 41: Workflow automation, operational task management, exceptions, and staff productivity.
-- Forward-safe and rerunnable where practical. Automation rules are disabled by default.

create table if not exists public.task_automation_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  name text not null,
  task_type text not null,
  source_type text not null,
  enabled boolean not null default false,
  default_priority text not null default 'normal' check (default_priority in ('low','normal','high','critical')),
  due_offset_minutes integer check (due_offset_minutes is null or due_offset_minutes >= 0),
  branch_scope text not null default 'source' check (branch_scope in ('source','clinic_wide')),
  configuration jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operational_tasks (
  id uuid primary key default gen_random_uuid(),
  task_key text not null,
  task_type text not null,
  title text not null,
  description text not null default '',
  status text not null default 'open' check (status in ('open','in_progress','waiting','blocked','completed','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  patient_id text references public.patients(patient_id) on delete set null,
  branch_id text,
  provider_id text,
  assignee_profile_id uuid references public.profiles(id) on delete set null,
  source_type text not null,
  source_id text not null,
  source_route text,
  automation_rule_key text,
  due_at timestamptz,
  claimed_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  blocked_reason text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_source text not null default 'user' check (created_source in ('user','system','edge_function','database_event')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.operational_tasks(id) on delete restrict,
  event_type text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  old_value jsonb,
  new_value jsonb,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.task_notes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.operational_tasks(id) on delete restrict,
  author_profile_id uuid references public.profiles(id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists operational_tasks_active_task_key_uidx
  on public.operational_tasks(task_key)
  where status not in ('completed','cancelled');
create index if not exists operational_tasks_status_due_idx on public.operational_tasks(status, due_at);
create index if not exists operational_tasks_assignee_status_idx on public.operational_tasks(assignee_profile_id, status, due_at);
create index if not exists operational_tasks_branch_status_idx on public.operational_tasks(branch_id, status, due_at);
create index if not exists operational_tasks_source_idx on public.operational_tasks(source_type, source_id);
create index if not exists operational_tasks_patient_idx on public.operational_tasks(patient_id, status, due_at);
create index if not exists task_events_task_created_idx on public.task_events(task_id, created_at desc);
create index if not exists task_notes_task_created_idx on public.task_notes(task_id, created_at desc);

-- updated_at helpers

drop trigger if exists set_operational_tasks_updated_at on public.operational_tasks;
create trigger set_operational_tasks_updated_at
before update on public.operational_tasks
for each row execute procedure public.set_updated_at();

drop trigger if exists set_task_automation_rules_updated_at on public.task_automation_rules;
create trigger set_task_automation_rules_updated_at
before update on public.task_automation_rules
for each row execute procedure public.set_updated_at();

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
      p_assignee_profile_id = auth.uid()
      and public.has_profile_permission('tasks.view_own'::text)
    )
    or (
      p_branch_id is not null
      and public.profile_has_active_branch(p_branch_id)
      and public.has_profile_permission('tasks.view_branch'::text)
    )
    or (
      p_provider_id is not null
      and public.has_profile_permission('tasks.view_own'::text)
      and exists (
        select 1 from public.providers pr
        where pr.profile_id = auth.uid()
          and pr.id::text = p_provider_id
      )
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
      p_assignee_profile_id = auth.uid()
      and public.has_profile_permission('tasks.view_own'::text)
    )
    or (
      p_branch_id is not null
      and public.profile_has_active_branch(p_branch_id)
      and public.has_profile_permission('tasks.view_branch'::text)
      and public.has_profile_permission('tasks.update'::text)
    );
$$;

alter table public.operational_tasks enable row level security;
alter table public.task_events enable row level security;
alter table public.task_notes enable row level security;
alter table public.task_automation_rules enable row level security;

-- Patient role has no path through these policies. Exact names are dropped before creation.
drop policy if exists "operational_tasks_read_authorized" on public.operational_tasks;
create policy "operational_tasks_read_authorized"
on public.operational_tasks for select
using (public.can_view_operational_task(branch_id, provider_id, assignee_profile_id));

drop policy if exists "operational_tasks_insert_authorized" on public.operational_tasks;
create policy "operational_tasks_insert_authorized"
on public.operational_tasks for insert
with check (
  public.has_profile_permission('tasks.create'::text)
  or public.has_profile_permission('system_admin.manage'::text)
);

drop policy if exists "operational_tasks_update_authorized" on public.operational_tasks;
create policy "operational_tasks_update_authorized"
on public.operational_tasks for update
using (public.can_manage_operational_task(branch_id, assignee_profile_id))
with check (public.can_manage_operational_task(branch_id, assignee_profile_id));

drop policy if exists "task_events_read_authorized" on public.task_events;
create policy "task_events_read_authorized"
on public.task_events for select
using (
  exists (
    select 1 from public.operational_tasks t
    where t.id = task_events.task_id
      and public.can_view_operational_task(t.branch_id, t.provider_id, t.assignee_profile_id)
  )
);

drop policy if exists "task_events_insert_authorized" on public.task_events;
create policy "task_events_insert_authorized"
on public.task_events for insert
with check (
  exists (
    select 1 from public.operational_tasks t
    where t.id = task_events.task_id
      and public.can_manage_operational_task(t.branch_id, t.assignee_profile_id)
  )
);

drop policy if exists "task_notes_read_authorized" on public.task_notes;
create policy "task_notes_read_authorized"
on public.task_notes for select
using (
  exists (
    select 1 from public.operational_tasks t
    where t.id = task_notes.task_id
      and public.can_view_operational_task(t.branch_id, t.provider_id, t.assignee_profile_id)
  )
);

drop policy if exists "task_notes_insert_authorized" on public.task_notes;
create policy "task_notes_insert_authorized"
on public.task_notes for insert
with check (
  exists (
    select 1 from public.operational_tasks t
    where t.id = task_notes.task_id
      and public.can_manage_operational_task(t.branch_id, t.assignee_profile_id)
  )
);

drop policy if exists "task_rules_read_authorized" on public.task_automation_rules;
create policy "task_rules_read_authorized"
on public.task_automation_rules for select
using (
  public.has_profile_permission('tasks.manage_rules'::text)
  or public.has_profile_permission('system_admin.view'::text)
);

drop policy if exists "task_rules_manage_authorized" on public.task_automation_rules;
create policy "task_rules_manage_authorized"
on public.task_automation_rules for all
using (
  public.has_profile_permission('tasks.manage_rules'::text)
  or public.has_profile_permission('system_admin.manage'::text)
)
with check (
  public.has_profile_permission('tasks.manage_rules'::text)
  or public.has_profile_permission('system_admin.manage'::text)
);

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
begin
  if nullif(trim(p_task_key), '') is null then raise exception 'Task key is required.'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'Task title is required.'; end if;
  if nullif(trim(p_source_type), '') is null or nullif(trim(p_source_id), '') is null then raise exception 'Task source is required.'; end if;
  if p_priority not in ('low','normal','high','critical') then raise exception 'Invalid priority.'; end if;
  if p_created_source not in ('user','system','edge_function','database_event') then raise exception 'Invalid creation source.'; end if;
  if p_created_source = 'user' and not (
    public.has_profile_permission('tasks.create'::text)
    or public.has_profile_permission('system_admin.manage'::text)
  ) then
    raise exception 'Not authorized to create tasks.';
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
  if not public.has_profile_permission('tasks.claim'::text) then raise exception 'Not authorized to claim tasks.'; end if;
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

create or replace function public.update_operational_task_state(
  p_task_id uuid,
  p_status text,
  p_expected_updated_at timestamptz,
  p_blocked_reason text default '',
  p_priority text default null,
  p_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.operational_tasks%rowtype;
  v_new_priority text;
begin
  select * into v_task from public.operational_tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found.'; end if;
  if not public.can_manage_operational_task(v_task.branch_id, v_task.assignee_profile_id) then raise exception 'Not authorized to update this task.'; end if;
  if v_task.updated_at is distinct from p_expected_updated_at then raise exception 'Task changed since it was loaded. Refresh and try again.'; end if;
  if p_status not in ('open','in_progress','waiting','blocked','completed','cancelled') then raise exception 'Invalid task status.'; end if;
  if p_status = 'blocked' and nullif(trim(coalesce(p_blocked_reason,'')), '') is null then raise exception 'Blocked reason is required.'; end if;
  v_new_priority := coalesce(p_priority, v_task.priority);
  if v_new_priority not in ('low','normal','high','critical') then raise exception 'Invalid priority.'; end if;

  update public.operational_tasks
  set status = p_status,
      blocked_reason = case when p_status='blocked' then trim(p_blocked_reason) else '' end,
      priority = v_new_priority,
      due_at = coalesce(p_due_at, due_at),
      completed_at = case when p_status='completed' then now() else completed_at end,
      completed_by = case when p_status='completed' then auth.uid() else completed_by end,
      cancelled_at = case when p_status='cancelled' then now() else cancelled_at end,
      cancelled_by = case when p_status='cancelled' then auth.uid() else cancelled_by end
  where id = p_task_id;

  insert into public.task_events(task_id,event_type,actor_profile_id,old_value,new_value,notes)
  values (
    p_task_id,
    case when p_status='completed' then 'task_completed' when p_status='cancelled' then 'task_cancelled' when v_task.status='completed' and p_status<>'completed' then 'task_reopened' else 'task_status_changed' end,
    auth.uid(),
    jsonb_build_object('status',v_task.status,'priority',v_task.priority,'due_at',v_task.due_at),
    jsonb_build_object('status',p_status,'priority',v_new_priority,'due_at',coalesce(p_due_at,v_task.due_at)),
    case when p_status='blocked' then trim(p_blocked_reason) else '' end
  );
  return p_task_id;
end;
$$;

create or replace function public.assign_operational_task(
  p_task_id uuid,
  p_assignee_profile_id uuid,
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
  if not public.has_profile_permission('tasks.assign'::text) and not public.has_profile_permission('system_admin.manage'::text) then raise exception 'Not authorized to assign tasks.'; end if;
  if v_task.updated_at is distinct from p_expected_updated_at then raise exception 'Task changed since it was loaded. Refresh and try again.'; end if;
  if v_task.branch_id is not null and not public.profile_has_active_branch(v_task.branch_id) and not public.has_profile_permission('system_admin.manage'::text) then raise exception 'Not authorized for this branch.'; end if;

  update public.operational_tasks set assignee_profile_id = p_assignee_profile_id where id = p_task_id;
  insert into public.task_events(task_id,event_type,actor_profile_id,old_value,new_value)
  values (p_task_id,'task_assigned',auth.uid(),jsonb_build_object('assignee',v_task.assignee_profile_id),jsonb_build_object('assignee',p_assignee_profile_id));
  return p_task_id;
end;
$$;

create or replace function public.add_operational_task_note(
  p_task_id uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.operational_tasks%rowtype;
  v_note_id uuid;
begin
  if nullif(trim(p_note), '') is null then raise exception 'Note is required.'; end if;
  select * into v_task from public.operational_tasks where id = p_task_id;
  if not found then raise exception 'Task not found.'; end if;
  if not public.can_manage_operational_task(v_task.branch_id, v_task.assignee_profile_id) then raise exception 'Not authorized to add notes.'; end if;
  insert into public.task_notes(task_id,author_profile_id,note) values (p_task_id,auth.uid(),trim(p_note)) returning id into v_note_id;
  insert into public.task_events(task_id,event_type,actor_profile_id,notes) values (p_task_id,'task_note_added',auth.uid(),trim(p_note));
  return v_note_id;
end;
$$;

-- Default rules are registered but deliberately disabled pending clinic decisions.
insert into public.task_automation_rules(rule_key,name,task_type,source_type,enabled,default_priority,configuration)
values
  ('CONSENT_PENDING','Consent Pending','consent_pending','form_assignment',false,'normal','{}'::jsonb),
  ('PLAN_SCHEDULING','Accepted Treatment Needs Scheduling','treatment_plan_scheduling','treatment_plan_item',false,'normal','{}'::jsonb),
  ('PAYMENT_FAILURE','Payment Review Required','payment_review','payment',false,'high','{}'::jsonb),
  ('COMMUNICATION_FAILURE','Communication Failure','communication_failure','communication_delivery_log',false,'normal','{}'::jsonb),
  ('RECALL_CONTACT','Recall Contact Due','recall_contact','recall',false,'normal','{}'::jsonb),
  ('INVENTORY_REORDER','Inventory Review','inventory_review','inventory_item',false,'normal','{}'::jsonb),
  ('EXPENSE_APPROVAL','Expense Approval Required','expense_approval','expense',false,'normal','{}'::jsonb)
on conflict (rule_key) do nothing;

revoke all on function public.can_view_operational_task(text,text,uuid) from anon;
revoke all on function public.can_manage_operational_task(text,uuid) from anon;
revoke all on function public.create_operational_task(text,text,text,text,text,text,text,text,text,text,text,timestamptz,uuid,text,text) from anon;
revoke all on function public.claim_operational_task(uuid,timestamptz) from anon;
revoke all on function public.update_operational_task_state(uuid,text,timestamptz,text,text,timestamptz) from anon;
revoke all on function public.assign_operational_task(uuid,uuid,timestamptz) from anon;
revoke all on function public.add_operational_task_note(uuid,text) from anon;

grant execute on function public.can_view_operational_task(text,text,uuid) to authenticated;
grant execute on function public.can_manage_operational_task(text,uuid) to authenticated;
grant execute on function public.create_operational_task(text,text,text,text,text,text,text,text,text,text,text,timestamptz,uuid,text,text) to authenticated;
grant execute on function public.claim_operational_task(uuid,timestamptz) to authenticated;
grant execute on function public.update_operational_task_state(uuid,text,timestamptz,text,text,timestamptz) to authenticated;
grant execute on function public.assign_operational_task(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.add_operational_task_note(uuid,text) to authenticated;
