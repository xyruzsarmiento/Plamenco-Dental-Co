-- Part 39: recall, follow-up, patient retention, and reactivation foundation.
-- Forward-safe and rerunnable where practical. No recall interval is invented.

create table if not exists public.patient_recalls (
  id uuid primary key default gen_random_uuid(),
  patient_id text not null references public.patients(patient_id) on delete cascade,
  kind text not null check (kind in ('recall','follow_up')),
  source_type text not null check (source_type in ('clinical_recommendation','completed_treatment','service_rule','manual','historical_import','treatment_plan','other_configured_rule')),
  source_id text,
  branch_id text,
  provider_id text,
  provider_name_snapshot text not null default '',
  historical_provider_text text not null default '',
  service_id uuid references public.services(id) on delete set null,
  clinical_visit_id text,
  treatment_id text,
  treatment_plan_id uuid references public.treatment_plans(id) on delete set null,
  due_date date,
  reason text not null default '',
  patient_message text not null default '',
  status text not null default 'open'
    check (status in ('open','contacted','waiting_patient','booked','needs_rescheduling','completed','dismissed','cancelled')),
  linked_appointment_id text,
  assigned_profile_id uuid references public.profiles(id) on delete set null,
  last_contact_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  dismissed_at timestamptz,
  dismissed_by uuid references public.profiles(id) on delete set null,
  dismissal_reason text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  source_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recall_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service_id uuid references public.services(id) on delete set null,
  branch_id text,
  kind text not null default 'recall' check (kind in ('recall','follow_up')),
  interval_days integer check (interval_days is null or interval_days > 0),
  enabled boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recall_contact_attempts (
  id uuid primary key default gen_random_uuid(),
  recall_id uuid not null references public.patient_recalls(id) on delete restrict,
  patient_id text not null references public.patients(patient_id) on delete cascade,
  channel text not null check (channel in ('phone','walk_in','sms','email','messenger','in_app','manual_message')),
  outcome text not null check (outcome in ('reached','no_answer','left_message','patient_will_call','patient_requested_booking','patient_declined','invalid_contact','queued','sent','delivered','failed','cancelled')),
  communication_delivery_log_id text references public.communication_delivery_logs(id) on delete set null,
  destination_masked text not null default '',
  notes text not null default '',
  actor_profile_id uuid references public.profiles(id) on delete set null,
  idempotency_key text not null unique,
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.communication_delivery_logs
  add column if not exists recall_id uuid references public.patient_recalls(id) on delete set null;

create index if not exists patient_recalls_patient_due_idx
  on public.patient_recalls(patient_id, due_date, status);
create index if not exists patient_recalls_branch_due_idx
  on public.patient_recalls(branch_id, due_date, status);
create index if not exists patient_recalls_provider_due_idx
  on public.patient_recalls(provider_id, due_date, status);
create index if not exists patient_recalls_status_due_idx
  on public.patient_recalls(status, due_date);
create index if not exists recall_contact_attempts_recall_idx
  on public.recall_contact_attempts(recall_id, attempted_at desc);
create index if not exists communication_delivery_logs_recall_idx
  on public.communication_delivery_logs(recall_id, created_at desc)
  where recall_id is not null;

create unique index if not exists patient_recalls_active_source_uidx
  on public.patient_recalls(
    patient_id,
    kind,
    source_type,
    coalesce(source_id, ''),
    coalesce(due_date, date '1900-01-01')
  )
  where status not in ('completed','dismissed','cancelled');

drop trigger if exists set_patient_recalls_updated_at on public.patient_recalls;
create trigger set_patient_recalls_updated_at
before update on public.patient_recalls
for each row execute procedure public.set_updated_at();

drop trigger if exists set_recall_rules_updated_at on public.recall_rules;
create trigger set_recall_rules_updated_at
before update on public.recall_rules
for each row execute procedure public.set_updated_at();

create or replace function public.can_view_patient_recall(
  p_patient_id text,
  p_branch_id text default null,
  p_provider_id text default null
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.current_user_owns_patient(p_patient_id)
    or public.has_profile_permission('system_admin.view'::text)
    or public.has_profile_permission('branches.manage'::text)
    or (
      p_provider_id is not null
      and public.has_profile_permission('clinical_records.view'::text)
      and exists (
        select 1
        from public.providers pr
        where pr.profile_id = auth.uid()
          and pr.id::text = p_provider_id
          and pr.status in ('active','on_leave')
      )
    )
    or (
      p_branch_id is not null
      and public.profile_has_active_branch(p_branch_id)
      and (
        public.has_profile_permission('appointments.view'::text)
        or public.has_profile_permission('communications.manage'::text)
      )
    );
$$;

create or replace function public.can_manage_patient_recall(
  p_patient_id text,
  p_branch_id text default null,
  p_provider_id text default null
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.has_profile_permission('system_admin.manage'::text)
    or public.has_profile_permission('branches.manage'::text)
    or (
      p_provider_id is not null
      and public.has_profile_permission('clinical_records.edit'::text)
      and exists (
        select 1
        from public.providers pr
        where pr.profile_id = auth.uid()
          and pr.id::text = p_provider_id
          and pr.status in ('active','on_leave')
      )
    )
    or (
      p_branch_id is not null
      and public.profile_has_active_branch(p_branch_id)
      and (
        public.has_profile_permission('appointments.create'::text)
        or public.has_profile_permission('communications.manage'::text)
      )
    );
$$;

alter table public.patient_recalls enable row level security;
alter table public.recall_rules enable row level security;
alter table public.recall_contact_attempts enable row level security;

-- Every policy is dropped by its exact name before recreation so this migration
-- can be safely reapplied without duplicate-policy errors.
drop policy if exists "patient_recalls_read_authorized" on public.patient_recalls;
create policy "patient_recalls_read_authorized"
on public.patient_recalls for select
using (public.can_view_patient_recall(patient_id, branch_id, provider_id));

drop policy if exists "patient_recalls_insert_authorized" on public.patient_recalls;
create policy "patient_recalls_insert_authorized"
on public.patient_recalls for insert
with check (public.can_manage_patient_recall(patient_id, branch_id, provider_id));

drop policy if exists "patient_recalls_update_authorized" on public.patient_recalls;
create policy "patient_recalls_update_authorized"
on public.patient_recalls for update
using (public.can_manage_patient_recall(patient_id, branch_id, provider_id))
with check (public.can_manage_patient_recall(patient_id, branch_id, provider_id));

drop policy if exists "recall_rules_read_internal" on public.recall_rules;
create policy "recall_rules_read_internal"
on public.recall_rules for select
using (public.is_internal_profile());

drop policy if exists "recall_rules_manage_authorized" on public.recall_rules;
create policy "recall_rules_manage_authorized"
on public.recall_rules for all
using (public.has_profile_permission('settings.manage'::text) or public.has_profile_permission('branches.manage'::text))
with check (public.has_profile_permission('settings.manage'::text) or public.has_profile_permission('branches.manage'::text));

drop policy if exists "recall_contact_attempts_read_authorized" on public.recall_contact_attempts;
create policy "recall_contact_attempts_read_authorized"
on public.recall_contact_attempts for select
using (
  exists (
    select 1
    from public.patient_recalls r
    where r.id = recall_contact_attempts.recall_id
      and public.can_view_patient_recall(r.patient_id, r.branch_id, r.provider_id)
  )
);

drop policy if exists "recall_contact_attempts_insert_authorized" on public.recall_contact_attempts;
create policy "recall_contact_attempts_insert_authorized"
on public.recall_contact_attempts for insert
with check (
  exists (
    select 1
    from public.patient_recalls r
    where r.id = recall_contact_attempts.recall_id
      and r.patient_id = recall_contact_attempts.patient_id
      and public.can_manage_patient_recall(r.patient_id, r.branch_id, r.provider_id)
  )
);

create or replace function public.create_clinical_follow_up_recall(
  p_patient_id text,
  p_clinical_visit_id text,
  p_due_date date,
  p_reason text,
  p_branch_id text default null,
  p_provider_id text default null,
  p_provider_name_snapshot text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_due_date is null then
    raise exception 'A real follow-up due date is required.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A follow-up reason is required.';
  end if;
  if not public.can_manage_patient_recall(p_patient_id, p_branch_id, p_provider_id) then
    raise exception 'Not authorized to create this follow-up.';
  end if;

  select id into v_id
  from public.patient_recalls
  where patient_id = p_patient_id
    and kind = 'follow_up'
    and source_type = 'clinical_recommendation'
    and coalesce(source_id, '') = coalesce(p_clinical_visit_id, '')
    and due_date = p_due_date
    and status not in ('completed','dismissed','cancelled')
  order by created_at desc
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into public.patient_recalls(
      patient_id, kind, source_type, source_id, clinical_visit_id,
      due_date, reason, branch_id, provider_id, provider_name_snapshot,
      created_by, source_recorded_at
    ) values (
      p_patient_id, 'follow_up', 'clinical_recommendation', p_clinical_visit_id, p_clinical_visit_id,
      p_due_date, trim(p_reason), p_branch_id, p_provider_id, coalesce(p_provider_name_snapshot, ''),
      auth.uid(), now()
    ) returning id into v_id;
  exception when unique_violation then
    select id into v_id
    from public.patient_recalls
    where patient_id = p_patient_id
      and kind = 'follow_up'
      and source_type = 'clinical_recommendation'
      and coalesce(source_id, '') = coalesce(p_clinical_visit_id, '')
      and due_date = p_due_date
      and status not in ('completed','dismissed','cancelled')
    order by created_at desc
    limit 1;
  end;

  return v_id;
end;
$$;

create or replace function public.record_recall_contact(
  p_recall_id uuid,
  p_channel text,
  p_outcome text,
  p_idempotency_key text,
  p_notes text default '',
  p_destination_masked text default '',
  p_delivery_log_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recall public.patient_recalls%rowtype;
  v_attempt_id uuid;
  v_now timestamptz := now();
begin
  select * into v_recall from public.patient_recalls where id = p_recall_id for update;
  if not found then raise exception 'Recall not found.'; end if;

  if not public.can_manage_patient_recall(v_recall.patient_id, v_recall.branch_id, v_recall.provider_id) then
    raise exception 'Not authorized to update this recall.';
  end if;

  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'Idempotency key is required.';
  end if;

  select id into v_attempt_id
  from public.recall_contact_attempts
  where idempotency_key = p_idempotency_key;
  if v_attempt_id is not null then return v_attempt_id; end if;

  insert into public.recall_contact_attempts(
    recall_id, patient_id, channel, outcome, communication_delivery_log_id,
    destination_masked, notes, actor_profile_id, idempotency_key, attempted_at
  ) values (
    v_recall.id, v_recall.patient_id, p_channel, p_outcome, p_delivery_log_id,
    coalesce(p_destination_masked, ''), coalesce(p_notes, ''), auth.uid(), p_idempotency_key, v_now
  ) returning id into v_attempt_id;

  update public.patient_recalls
  set last_contact_at = v_now,
      status = case
        when p_outcome in ('reached','left_message') then 'contacted'
        when p_outcome in ('patient_will_call','patient_requested_booking') then 'waiting_patient'
        else status
      end,
      updated_at = v_now
  where id = v_recall.id;

  return v_attempt_id;
end;
$$;

create or replace function public.link_recall_appointment(
  p_recall_id uuid,
  p_appointment_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recall public.patient_recalls%rowtype;
begin
  select * into v_recall from public.patient_recalls where id = p_recall_id for update;
  if not found then raise exception 'Recall not found.'; end if;
  if not public.can_manage_patient_recall(v_recall.patient_id, v_recall.branch_id, v_recall.provider_id) then
    raise exception 'Not authorized to update this recall.';
  end if;
  if coalesce(trim(p_appointment_id), '') = '' then
    raise exception 'Appointment ID is required.';
  end if;

  update public.patient_recalls
  set linked_appointment_id = p_appointment_id,
      status = 'booked',
      updated_at = now()
  where id = p_recall_id;
end;
$$;

create or replace function public.complete_patient_recall(
  p_recall_id uuid,
  p_appointment_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recall public.patient_recalls%rowtype;
begin
  select * into v_recall from public.patient_recalls where id = p_recall_id for update;
  if not found then raise exception 'Recall not found.'; end if;
  if not public.can_manage_patient_recall(v_recall.patient_id, v_recall.branch_id, v_recall.provider_id) then
    raise exception 'Not authorized to complete this recall.';
  end if;

  update public.patient_recalls
  set status = 'completed',
      linked_appointment_id = coalesce(p_appointment_id, linked_appointment_id),
      completed_at = now(),
      completed_by = auth.uid(),
      updated_at = now()
  where id = p_recall_id;
end;
$$;

revoke all on function public.can_view_patient_recall(text, text, text) from anon;
revoke all on function public.can_manage_patient_recall(text, text, text) from anon;
revoke all on function public.create_clinical_follow_up_recall(text, text, date, text, text, text, text) from anon;
revoke all on function public.record_recall_contact(uuid, text, text, text, text, text, text) from anon;
revoke all on function public.link_recall_appointment(uuid, text) from anon;
revoke all on function public.complete_patient_recall(uuid, text) from anon;

grant execute on function public.can_view_patient_recall(text, text, text) to authenticated;
grant execute on function public.can_manage_patient_recall(text, text, text) to authenticated;
grant execute on function public.create_clinical_follow_up_recall(text, text, date, text, text, text, text) to authenticated;
grant execute on function public.record_recall_contact(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.link_recall_appointment(uuid, text) to authenticated;
grant execute on function public.complete_patient_recall(uuid, text) to authenticated;
