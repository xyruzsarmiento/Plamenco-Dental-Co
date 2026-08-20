-- Part 37: treatment planning, estimates, patient decisions, and scheduling linkage.
-- Extends the existing treatment_plans table instead of creating a second plan system.

alter table public.treatment_plans
  add column if not exists plan_number text,
  add column if not exists branch_id text,
  add column if not exists provider_id text,
  add column if not exists provider_name_snapshot text default '',
  add column if not exists clinical_visit_id text,
  add column if not exists version_number integer not null default 1,
  add column if not exists supersedes_plan_id uuid references public.treatment_plans(id) on delete set null,
  add column if not exists patient_notes text default '',
  add column if not exists internal_notes text default '',
  add column if not exists quoted_subtotal_cents integer not null default 0,
  add column if not exists discount_cents integer not null default 0,
  add column if not exists quoted_total_cents integer not null default 0,
  add column if not exists presented_at timestamptz,
  add column if not exists presented_by uuid references public.profiles(id) on delete set null,
  add column if not exists decision_at timestamptz,
  add column if not exists decision_by uuid references auth.users(id) on delete set null,
  add column if not exists decision_source text,
  add column if not exists historical_provider_text text default '';

alter table public.treatment_plans drop constraint if exists treatment_plans_status_check;
update public.treatment_plans set status = 'draft' where status = 'planned';
update public.treatment_plans set status = 'accepted' where status in ('scheduled','in_progress','completed');
update public.treatment_plans set status = 'cancelled' where status = 'cancelled';
alter table public.treatment_plans
  add constraint treatment_plans_status_check
  check (status in ('draft','presented','accepted','partially_accepted','declined','superseded','cancelled'));

create unique index if not exists treatment_plans_plan_number_uidx
  on public.treatment_plans(plan_number)
  where plan_number is not null;
create index if not exists treatment_plans_patient_created_idx on public.treatment_plans(patient_id, created_at desc);
create index if not exists treatment_plans_provider_idx on public.treatment_plans(provider_id, created_at desc);
create index if not exists treatment_plans_branch_idx on public.treatment_plans(branch_id, created_at desc);

create table if not exists public.treatment_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.treatment_plans(id) on delete restrict,
  service_id uuid references public.services(id) on delete set null,
  service_name_snapshot text not null,
  description text not null default '',
  quantity integer not null default 1 check (quantity > 0),
  catalog_price_snapshot_cents integer,
  quoted_price_cents integer,
  phase text default '',
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','scheduled','completed','cancelled')),
  provider_id text,
  provider_name_snapshot text default '',
  branch_id text,
  patient_notes text default '',
  internal_notes text default '',
  sort_order integer not null default 0,
  appointment_id text,
  treatment_id text,
  decision_at timestamptz,
  decision_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.treatment_plan_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.treatment_plans(id) on delete restrict,
  plan_item_id uuid references public.treatment_plan_items(id) on delete set null,
  event_type text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  source text not null default 'internal',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists treatment_plan_items_plan_idx on public.treatment_plan_items(plan_id, sort_order, created_at);
create index if not exists treatment_plan_items_appointment_idx on public.treatment_plan_items(appointment_id) where appointment_id is not null;
create index if not exists treatment_plan_items_treatment_idx on public.treatment_plan_items(treatment_id) where treatment_id is not null;
create index if not exists treatment_plan_events_plan_idx on public.treatment_plan_events(plan_id, created_at desc);

drop trigger if exists set_treatment_plan_items_updated_at on public.treatment_plan_items;
create trigger set_treatment_plan_items_updated_at
before update on public.treatment_plan_items
for each row execute procedure public.set_updated_at();

create or replace function public.can_view_treatment_plan(p_patient_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.auth_user_id = auth.uid()
  )
  or public.has_profile_permission('treatments.view')
  or public.has_profile_permission('patients.view');
$$;

create or replace function public.can_manage_treatment_plan(p_patient_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.has_profile_permission('treatments.create')
      or public.has_profile_permission('treatments.edit');
$$;

alter table public.treatment_plan_items enable row level security;
alter table public.treatment_plan_events enable row level security;

drop policy if exists "plans_read_self_or_internal" on public.treatment_plans;
drop policy if exists "plans_insert_authorized" on public.treatment_plans;
drop policy if exists "plans_update_authorized" on public.treatment_plans;
drop policy if exists "allow_plans_read" on public.treatment_plans;

create policy "plans_read_self_or_authorized"
on public.treatment_plans for select
using (public.can_view_treatment_plan(patient_id));

create policy "plans_insert_authorized"
on public.treatment_plans for insert
with check (public.can_manage_treatment_plan(patient_id));

create policy "plans_update_authorized"
on public.treatment_plans for update
using (public.can_manage_treatment_plan(patient_id))
with check (public.can_manage_treatment_plan(patient_id));

drop policy if exists "plan_items_read_authorized" on public.treatment_plan_items;
create policy "plan_items_read_authorized"
on public.treatment_plan_items for select
using (
  exists (
    select 1 from public.treatment_plans p
    where p.id = treatment_plan_items.plan_id
      and public.can_view_treatment_plan(p.patient_id)
  )
);

drop policy if exists "plan_items_manage_authorized" on public.treatment_plan_items;
create policy "plan_items_manage_authorized"
on public.treatment_plan_items for all
using (
  exists (
    select 1 from public.treatment_plans p
    where p.id = treatment_plan_items.plan_id
      and public.can_manage_treatment_plan(p.patient_id)
  )
)
with check (
  exists (
    select 1 from public.treatment_plans p
    where p.id = treatment_plan_items.plan_id
      and public.can_manage_treatment_plan(p.patient_id)
  )
);

drop policy if exists "plan_events_read_authorized" on public.treatment_plan_events;
create policy "plan_events_read_authorized"
on public.treatment_plan_events for select
using (
  exists (
    select 1 from public.treatment_plans p
    where p.id = treatment_plan_events.plan_id
      and public.can_view_treatment_plan(p.patient_id)
  )
);

drop policy if exists "plan_events_insert_authorized" on public.treatment_plan_events;
create policy "plan_events_insert_authorized"
on public.treatment_plan_events for insert
with check (
  exists (
    select 1 from public.treatment_plans p
    where p.id = treatment_plan_events.plan_id
      and public.can_manage_treatment_plan(p.patient_id)
  )
  or exists (
    select 1 from public.treatment_plans p
    join public.patients patient on patient.id = p.patient_id
    where p.id = treatment_plan_events.plan_id
      and patient.auth_user_id = auth.uid()
  )
);

create or replace function public.respond_to_treatment_plan(
  p_plan_id uuid,
  p_item_decisions jsonb,
  p_source text default 'patient_portal'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.treatment_plans%rowtype;
  v_total integer;
  v_accepted integer;
  v_declined integer;
  v_status text;
  v_now timestamptz := now();
begin
  select * into v_plan from public.treatment_plans where id = p_plan_id for update;
  if not found then raise exception 'Treatment plan not found'; end if;

  if not exists (
    select 1 from public.patients p
    where p.id = v_plan.patient_id and p.auth_user_id = auth.uid()
  ) then
    raise exception 'Not authorized for this treatment plan';
  end if;

  if v_plan.status not in ('presented','accepted','partially_accepted','declined') then
    raise exception 'This treatment plan is not available for patient response';
  end if;

  if exists (
    select 1 from public.treatment_plans newer
    where newer.supersedes_plan_id = v_plan.id and newer.status <> 'cancelled'
  ) or v_plan.status = 'superseded' then
    raise exception 'This treatment plan has been updated. Please review the latest version.';
  end if;

  update public.treatment_plan_items i
  set status = case d.value
      when 'accepted' then 'accepted'
      when 'declined' then 'declined'
      else i.status
    end,
    decision_at = v_now,
    decision_source = p_source,
    updated_at = v_now
  from jsonb_each_text(coalesce(p_item_decisions, '{}'::jsonb)) d
  where i.plan_id = p_plan_id
    and i.id::text = d.key
    and d.value in ('accepted','declined')
    and i.status in ('pending','accepted','declined');

  select count(*),
         count(*) filter (where status = 'accepted'),
         count(*) filter (where status = 'declined')
    into v_total, v_accepted, v_declined
  from public.treatment_plan_items
  where plan_id = p_plan_id;

  if v_total = 0 then raise exception 'Treatment plan has no items'; end if;

  if v_accepted = v_total then v_status := 'accepted';
  elsif v_declined = v_total then v_status := 'declined';
  elsif v_accepted > 0 and v_declined > 0 then v_status := 'partially_accepted';
  else v_status := 'presented';
  end if;

  update public.treatment_plans
  set status = v_status,
      decision_at = case when v_status <> 'presented' then v_now else decision_at end,
      decision_by = case when v_status <> 'presented' then auth.uid() else decision_by end,
      decision_source = case when v_status <> 'presented' then p_source else decision_source end,
      updated_at = v_now
  where id = p_plan_id;

  insert into public.treatment_plan_events(plan_id, event_type, actor_auth_user_id, source, metadata)
  values (p_plan_id, 'patient_decision_recorded', auth.uid(), p_source, jsonb_build_object('status', v_status));

  return v_status;
end;
$$;

revoke all on function public.can_view_treatment_plan(uuid) from anon;
revoke all on function public.can_manage_treatment_plan(uuid) from anon;
revoke all on function public.respond_to_treatment_plan(uuid, jsonb, text) from anon;
grant execute on function public.can_view_treatment_plan(uuid) to authenticated;
grant execute on function public.can_manage_treatment_plan(uuid) to authenticated;
grant execute on function public.respond_to_treatment_plan(uuid, jsonb, text) to authenticated;
