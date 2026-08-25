-- Part 2: database-level branch ownership and authorization core.
-- Frontend branch state is navigation only; authorization is resolved from auth.uid().
-- Patient identity remains clinic-wide. Only branch-linked operational activity is scoped here.

create or replace function public.current_internal_profile_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.id
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active'
    and p.role in ('super_admin', 'dentist', 'associate_dentist', 'staff')
  limit 1
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role = 'super_admin'
    ),
    false
  )
$$;

create or replace function public.can_access_branch(p_branch_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    case
      when auth.uid() is null or nullif(btrim(p_branch_id), '') is null then false
      when not exists (
        select 1 from public.branches b where b.id::text = btrim(p_branch_id)
      ) then false
      when public.is_super_admin() then true
      when exists (
        select 1
        from public.profiles p
        join public.staff_branch_assignments sba
          on sba.profile_id = p.id
         and sba.status = 'active'
        where p.id = auth.uid()
          and p.status = 'active'
          and p.role = 'staff'
          and sba.branch_id::text = btrim(p_branch_id)
      ) then true
      when exists (
        select 1
        from public.profiles p
        join public.providers pr
          on pr.profile_id = p.id
         and pr.status = 'active'
        join public.provider_branch_assignments pba
          on pba.provider_id = pr.id
         and pba.status = 'active'
        where p.id = auth.uid()
          and p.status = 'active'
          and p.role in ('dentist', 'associate_dentist')
          and pba.branch_id::text = btrim(p_branch_id)
      ) then true
      else false
    end,
    false
  )
$$;

create or replace function public.can_access_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.can_access_branch(p_branch_id::text)
$$;

create or replace function public.can_operate_branch(p_branch_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    public.can_access_branch(p_branch_id)
    and exists (
      select 1
      from public.branches b
      where b.id::text = btrim(p_branch_id)
        and b.status = 'active'
    ),
    false
  )
$$;

create or replace function public.single_authorized_branch_id()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with authorized as (
    select b.id::text as branch_id
    from public.branches b
    where b.status = 'active'
      and public.can_access_branch(b.id::text)
  )
  select case when count(*) = 1 then min(branch_id) else null end
  from authorized
$$;

-- Existing atomic inventory/report RPCs already call this helper. Point it at the
-- canonical authorization rule so they inherit Part 2 security without duplicating logic.
create or replace function public.profile_has_active_branch(p_branch_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.can_operate_branch(p_branch_id)
$$;

revoke all on function public.current_internal_profile_id() from public, anon;
revoke all on function public.is_super_admin() from public, anon;
revoke all on function public.can_access_branch(text) from public, anon;
revoke all on function public.can_access_branch(uuid) from public, anon;
revoke all on function public.can_operate_branch(text) from public, anon;
revoke all on function public.single_authorized_branch_id() from public, anon;
revoke all on function public.profile_has_active_branch(text) from public, anon;

grant execute on function public.current_internal_profile_id() to authenticated, service_role;
grant execute on function public.is_super_admin() to authenticated, service_role;
grant execute on function public.can_access_branch(text) to authenticated, service_role;
grant execute on function public.can_access_branch(uuid) to authenticated, service_role;
grant execute on function public.can_operate_branch(text) to authenticated, service_role;
grant execute on function public.single_authorized_branch_id() to authenticated, service_role;
grant execute on function public.profile_has_active_branch(text) to authenticated, service_role;

-- Authenticated internal users should not enumerate assignment/directory rows from branches
-- they do not belong to. Public/patient booking still sees active branches through the existing
-- public-active policy.
drop policy if exists "branches_read_authenticated" on public.branches;
create policy "branches_read_authorized"
on public.branches
for select
to authenticated
using (
  (not public.is_internal_profile() and status = 'active')
  or public.is_super_admin()
  or public.can_access_branch(id::text)
);

drop policy if exists "staff_branch_assignments_read_authenticated" on public.staff_branch_assignments;
create policy "staff_branch_assignments_read_authorized"
on public.staff_branch_assignments
for select
to authenticated
using (
  profile_id = auth.uid()
  or public.is_super_admin()
  or public.has_profile_permission('staff.manage')
);

drop policy if exists "provider_branch_assignments_read_authenticated" on public.provider_branch_assignments;
create policy "provider_branch_assignments_read_authorized"
on public.provider_branch_assignments
for select
to authenticated
using (
  public.is_super_admin()
  or public.has_profile_permission('dentists.manage')
  or public.can_access_branch(branch_id::text)
  or exists (
    select 1
    from public.providers pr
    where pr.id = provider_branch_assignments.provider_id
      and pr.profile_id = auth.uid()
  )
);

drop policy if exists "providers_read_authenticated" on public.providers;
create policy "providers_read_authorized"
on public.providers
for select
to authenticated
using (
  public.is_super_admin()
  or public.has_profile_permission('dentists.manage')
  or profile_id = auth.uid()
  or exists (
    select 1
    from public.provider_branch_assignments pba
    where pba.provider_id = providers.id
      and pba.status = 'active'
      and public.can_access_branch(pba.branch_id::text)
  )
);

-- Provider IDs stored on branch-owned records must be assigned to the same branch. If a provider
-- has exactly one active branch and no branch was supplied, that branch can be inferred safely.
create or replace function public.enforce_provider_branch_consistency()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_provider_id text;
  v_branch_id text;
  v_single_branch text;
begin
  v_provider_id := to_jsonb(new) ->> 'provider_id';
  v_branch_id := to_jsonb(new) ->> 'branch_id';

  if nullif(btrim(coalesce(v_provider_id, '')), '') is null then
    return new;
  end if;

  if nullif(btrim(coalesce(v_branch_id, '')), '') is null then
    select case when count(*) = 1 then min(pba.branch_id::text) else null end
      into v_single_branch
    from public.provider_branch_assignments pba
    join public.providers pr on pr.id = pba.provider_id
    join public.branches b on b.id = pba.branch_id
    where pba.provider_id::text = v_provider_id
      and pba.status = 'active'
      and pr.status = 'active'
      and b.status = 'active';

    if v_single_branch is not null then
      new.branch_id := v_single_branch;
      v_branch_id := v_single_branch;
    else
      return new;
    end if;
  end if;

  if not exists (
    select 1
    from public.provider_branch_assignments pba
    join public.providers pr on pr.id = pba.provider_id
    where pba.provider_id::text = v_provider_id
      and pba.branch_id::text = v_branch_id
      and pba.status = 'active'
      and pr.status = 'active'
  ) then
    raise exception 'Provider is not actively assigned to the record branch.';
  end if;

  return new;
end;
$$;

-- For branch-owned records that reference an appointment, the appointment is authoritative.
create or replace function public.enforce_appointment_branch_consistency()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_appointment_id text;
  v_parent_branch text;
begin
  v_appointment_id := to_jsonb(new) ->> tg_argv[0];
  if nullif(btrim(coalesce(v_appointment_id, '')), '') is null then
    return new;
  end if;

  select a.branch_id::text
    into v_parent_branch
  from public.appointments a
  where a.id::text = v_appointment_id
  limit 1;

  if not found or v_parent_branch is null then
    raise exception 'Linked appointment has no resolvable branch.';
  end if;

  if nullif(btrim(coalesce(new.branch_id::text, '')), '') is null then
    new.branch_id := v_parent_branch;
  elsif new.branch_id::text <> v_parent_branch then
    raise exception 'Record branch does not match linked appointment branch.';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_invoice_branch_consistency()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_parent_branch text;
begin
  if new.invoice_id is null or nullif(btrim(new.invoice_id::text), '') is null then return new; end if;
  select i.branch_id::text into v_parent_branch
  from public.invoices i where i.id::text = new.invoice_id::text limit 1;
  if not found or v_parent_branch is null then raise exception 'Linked invoice has no resolvable branch.'; end if;
  if new.branch_id is null or nullif(btrim(new.branch_id::text), '') is null then
    new.branch_id := v_parent_branch;
  elsif new.branch_id::text <> v_parent_branch then
    raise exception 'Payment branch does not match linked invoice branch.';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_payment_branch_consistency()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_parent_branch text;
begin
  if new.payment_id is null or nullif(btrim(new.payment_id::text), '') is null then return new; end if;
  select p.branch_id::text into v_parent_branch
  from public.payments p where p.id::text = new.payment_id::text limit 1;
  if not found or v_parent_branch is null then raise exception 'Linked payment has no resolvable branch.'; end if;
  if new.branch_id is null or nullif(btrim(new.branch_id::text), '') is null then
    new.branch_id := v_parent_branch;
  elsif new.branch_id::text <> v_parent_branch then
    raise exception 'Financial record branch does not match linked payment branch.';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_purchase_order_branch_consistency()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_parent_branch text;
begin
  if new.purchase_order_id is null or nullif(btrim(new.purchase_order_id::text), '') is null then return new; end if;
  select po.branch_id::text into v_parent_branch
  from public.purchase_orders po where po.id::text = new.purchase_order_id::text limit 1;
  if not found or v_parent_branch is null then raise exception 'Linked purchase order has no resolvable branch.'; end if;
  if new.branch_id is null or nullif(btrim(new.branch_id::text), '') is null then
    new.branch_id := v_parent_branch;
  elsif new.branch_id::text <> v_parent_branch then
    raise exception 'Purchase receipt branch does not match purchase order branch.';
  end if;
  return new;
end;
$$;

-- This trigger closes SECURITY DEFINER/RPC bypasses at the row boundary. Existing permission
-- policies/functions still decide whether the action itself is allowed; this additionally proves branch ownership.
create or replace function public.enforce_internal_branch_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_old_branch text;
  v_new_branch text;
  v_scope text;
  v_global_allowed boolean := false;
begin
  if not public.is_internal_profile() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_old_branch := to_jsonb(old) ->> 'branch_id';
    if not public.is_super_admin()
       and (nullif(btrim(coalesce(v_old_branch, '')), '') is null or not public.can_access_branch(v_old_branch)) then
      raise exception 'Record belongs to a branch this account cannot access.' using errcode = '42501';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_new_branch := to_jsonb(new) ->> 'branch_id';
    v_scope := coalesce(to_jsonb(new) ->> 'scope', to_jsonb(new) ->> 'branch_scope', '');
    v_global_allowed := public.is_super_admin() and (
      (tg_table_name in ('expenses','expense_recurring_templates') and v_scope = 'clinic_wide')
      or (tg_table_name = 'management_report_schedules' and v_scope = 'clinic_wide')
      or tg_table_name = 'form_templates'
    );

    if nullif(btrim(coalesce(v_new_branch, '')), '') is null then
      if v_global_allowed then
        return new;
      end if;
      if tg_op = 'UPDATE' and public.is_super_admin()
         and nullif(btrim(coalesce(v_old_branch, '')), '') is null then
        return new; -- preserve unresolved legacy rows so Super Admin can remediate them safely.
      end if;
      raise exception 'A branch is required for this operational record.' using errcode = '42501';
    end if;

    if not public.can_operate_branch(v_new_branch) then
      raise exception 'This account cannot operate in the selected branch.' using errcode = '42501';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Parent consistency triggers. These are intentionally additive and do not replace business workflow triggers.
do $$
begin
  if to_regclass('public.dental_records') is not null then
    drop trigger if exists branch_01_appointment_consistency on public.dental_records;
    create trigger branch_01_appointment_consistency before insert or update on public.dental_records
      for each row execute function public.enforce_appointment_branch_consistency('related_appointment_id');
    drop trigger if exists branch_02_provider_consistency on public.dental_records;
    create trigger branch_02_provider_consistency before insert or update on public.dental_records
      for each row execute function public.enforce_provider_branch_consistency();
  end if;
  if to_regclass('public.treatments') is not null then
    drop trigger if exists branch_01_appointment_consistency on public.treatments;
    create trigger branch_01_appointment_consistency before insert or update on public.treatments
      for each row execute function public.enforce_appointment_branch_consistency('appointment_id');
    drop trigger if exists branch_02_provider_consistency on public.treatments;
    create trigger branch_02_provider_consistency before insert or update on public.treatments
      for each row execute function public.enforce_provider_branch_consistency();
  end if;
  if to_regclass('public.prescriptions') is not null then
    drop trigger if exists branch_01_appointment_consistency on public.prescriptions;
    create trigger branch_01_appointment_consistency before insert or update on public.prescriptions
      for each row execute function public.enforce_appointment_branch_consistency('appointment_id');
    drop trigger if exists branch_02_provider_consistency on public.prescriptions;
    create trigger branch_02_provider_consistency before insert or update on public.prescriptions
      for each row execute function public.enforce_provider_branch_consistency();
  end if;
  if to_regclass('public.treatment_plans') is not null then
    drop trigger if exists branch_02_provider_consistency on public.treatment_plans;
    create trigger branch_02_provider_consistency before insert or update on public.treatment_plans
      for each row execute function public.enforce_provider_branch_consistency();
  end if;
  if to_regclass('public.appointments') is not null then
    drop trigger if exists branch_02_provider_consistency on public.appointments;
    create trigger branch_02_provider_consistency before insert or update on public.appointments
      for each row execute function public.enforce_provider_branch_consistency();
  end if;
  if to_regclass('public.payments') is not null then
    drop trigger if exists branch_01_invoice_consistency on public.payments;
    create trigger branch_01_invoice_consistency before insert or update on public.payments
      for each row execute function public.enforce_invoice_branch_consistency();
  end if;
  if to_regclass('public.receipts') is not null then
    drop trigger if exists branch_01_payment_consistency on public.receipts;
    create trigger branch_01_payment_consistency before insert or update on public.receipts
      for each row execute function public.enforce_payment_branch_consistency();
  end if;
  if to_regclass('public.refunds') is not null then
    drop trigger if exists branch_01_payment_consistency on public.refunds;
    create trigger branch_01_payment_consistency before insert or update on public.refunds
      for each row execute function public.enforce_payment_branch_consistency();
  end if;
  if to_regclass('public.purchase_receipts') is not null then
    drop trigger if exists branch_01_purchase_order_consistency on public.purchase_receipts;
    create trigger branch_01_purchase_order_consistency before insert or update on public.purchase_receipts
      for each row execute function public.enforce_purchase_order_branch_consistency();
  end if;
end
$$;

-- Restrictive policies are ANDed with existing role/permission policies. Patients therefore keep
-- only their existing patient-safe access, while internal accounts must also prove branch access.
do $$
declare
  v_table text;
  v_tables text[] := array[
    'appointments','appointment_waitlist','operatories','schedule_blocks',
    'dental_records','treatments','treatment_plans','prescriptions','charges',
    'invoices','payments','receipts','refunds',
    'branch_inventory','inventory_batches','stock_movements','purchase_orders','purchase_receipts','stock_counts',
    'expenses','expense_recurring_templates','cashier_sessions','cash_movements',
    'form_templates','provider_schedule_blocks','provider_availability_overrides',
    'management_report_schedules','report_export_logs','provider_payouts','staff_shift_plans'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is not null
       and exists (
         select 1 from information_schema.columns c
         where c.table_schema='public' and c.table_name=v_table and c.column_name='branch_id'
       ) then
      execute format('alter table public.%I enable row level security', v_table);
      execute format('drop policy if exists branch_scope_guard on public.%I', v_table);
      execute format(
        'create policy branch_scope_guard on public.%I as restrictive for all to authenticated
         using (not public.is_internal_profile() or public.is_super_admin() or (branch_id is not null and public.can_access_branch(branch_id::text)))
         with check (not public.is_internal_profile() or public.is_super_admin() or (branch_id is not null and public.can_access_branch(branch_id::text)))',
        v_table
      );
      execute format('drop trigger if exists branch_10_mutation_guard on public.%I', v_table);
      execute format(
        'create trigger branch_10_mutation_guard before insert or update or delete on public.%I
         for each row execute function public.enforce_internal_branch_mutation()',
        v_table
      );
    end if;
  end loop;
end
$$;

-- Transfers are legitimate cross-branch operations, but a full transfer row inherently reveals both
-- endpoints. Full-row access therefore requires authorization for BOTH branches. A future redacted
-- receive-inbox API can expose only destination-safe data without weakening this base table.
create or replace function public.enforce_internal_stock_transfer_scope()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_old_from text;
  v_old_to text;
  v_new_from text;
  v_new_to text;
begin
  if not public.is_internal_profile() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if not public.has_any_profile_permission(array['inventory.transfer','inventory.receive_transfer']) then
    raise exception 'Missing inventory transfer permission.' using errcode = '42501';
  end if;

  if tg_op in ('UPDATE','DELETE') then
    v_old_from := old.from_branch_id::text;
    v_old_to := old.to_branch_id::text;
    if nullif(btrim(coalesce(v_old_from,'')), '') is null
       or nullif(btrim(coalesce(v_old_to,'')), '') is null
       or v_old_from = v_old_to then
      raise exception 'Existing transfer has invalid source/destination branch ownership.';
    end if;
    if not public.is_super_admin()
       and not (public.can_access_branch(v_old_from) and public.can_access_branch(v_old_to)) then
      raise exception 'Transfer requires access to both source and destination branches.' using errcode = '42501';
    end if;
  end if;

  if tg_op in ('INSERT','UPDATE') then
    v_new_from := new.from_branch_id::text;
    v_new_to := new.to_branch_id::text;
    if nullif(btrim(coalesce(v_new_from,'')), '') is null or nullif(btrim(coalesce(v_new_to,'')), '') is null then
      raise exception 'Transfer source and destination branches are required.';
    end if;
    if v_new_from = v_new_to then raise exception 'Transfer source and destination must be different branches.'; end if;
    if not (public.can_operate_branch(v_new_from) and public.can_operate_branch(v_new_to)) then
      raise exception 'Transfer requires operational access to both source and destination branches.' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
begin
  if to_regclass('public.stock_transfers') is not null then
    alter table public.stock_transfers enable row level security;
    drop policy if exists branch_scope_guard on public.stock_transfers;
    create policy branch_scope_guard
    on public.stock_transfers as restrictive
    for all to authenticated
    using (
      not public.is_internal_profile()
      or public.is_super_admin()
      or (public.can_access_branch(from_branch_id::text) and public.can_access_branch(to_branch_id::text))
    )
    with check (
      not public.is_internal_profile()
      or public.is_super_admin()
      or (public.can_access_branch(from_branch_id::text) and public.can_access_branch(to_branch_id::text))
    );
    drop trigger if exists enforce_staff_stock_transfers_scope on public.stock_transfers;
    drop trigger if exists branch_10_transfer_scope on public.stock_transfers;
    create trigger branch_10_transfer_scope before insert or update or delete on public.stock_transfers
      for each row execute function public.enforce_internal_stock_transfer_scope();
  end if;
end
$$;

-- Supersede the older Staff-only inventory trigger helper so historical migration behavior cannot
-- accidentally reintroduce an OR-based transfer rule or the removed Admin role.
create or replace function public.staff_can_manage_inventory_branch(p_branch_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.current_profile_role() = 'staff' and public.can_operate_branch(p_branch_id)
$$;

do $$
begin
  if to_regclass('public.branch_inventory') is not null then drop trigger if exists enforce_staff_branch_inventory_scope on public.branch_inventory; end if;
  if to_regclass('public.inventory_batches') is not null then drop trigger if exists enforce_staff_inventory_batches_scope on public.inventory_batches; end if;
  if to_regclass('public.stock_movements') is not null then drop trigger if exists enforce_staff_stock_movements_scope on public.stock_movements; end if;
  if to_regclass('public.purchase_orders') is not null then drop trigger if exists enforce_staff_purchase_orders_scope on public.purchase_orders; end if;
  if to_regclass('public.purchase_receipts') is not null then drop trigger if exists enforce_staff_purchase_receipts_scope on public.purchase_receipts; end if;
  if to_regclass('public.stock_counts') is not null then drop trigger if exists enforce_staff_stock_counts_scope on public.stock_counts; end if;
end
$$;

-- Reporting helpers/views must not bypass row-level branch policies.
create or replace function public.can_view_management_report_scope(p_report_type text, p_branch_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_internal_profile()
    and (
      public.is_super_admin()
      or public.has_profile_permission('reports.view')
      or public.has_profile_permission('reports.view_limited')
    )
    and (
      p_report_type not in ('collections_summary','receivables_summary','expense_summary','monthly_management','weekly_management')
      or public.is_super_admin()
      or public.has_profile_permission('reports.view_financial')
    )
    and (
      (p_branch_id is null and public.is_super_admin())
      or (p_branch_id is not null and public.can_access_branch(p_branch_id))
    )
$$;

do $$
begin
  if to_regclass('public.v_branch_financial_summary') is not null then
    alter view public.v_branch_financial_summary set (security_invoker = true);
  end if;
end
$$;

comment on function public.can_access_branch(text) is
  'Branch authorization from auth.uid(): active Super Admin can access any valid branch; Staff/Dentists require an active assignment.';
comment on function public.can_operate_branch(text) is
  'Mutation authorization: can_access_branch plus an active branch. Browser-selected branch state is never consulted.';
