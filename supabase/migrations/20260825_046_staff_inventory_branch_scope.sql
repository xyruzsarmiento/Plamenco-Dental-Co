-- Restrict staff inventory mutations to branches assigned through staff_branch_assignments.
-- Super Admin/Admin retain clinic-wide inventory access.

create or replace function public.staff_can_manage_inventory_branch(p_branch_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when auth.uid() is null then true
    when public.current_profile_role() in ('super_admin', 'admin') then true
    when public.current_profile_role() = 'staff' then exists (
      select 1
      from public.staff_branch_assignments sba
      where sba.profile_id = auth.uid()
        and sba.status = 'active'
        and sba.branch_id::text = p_branch_id
    )
    else false
  end
$$;

create or replace function public.enforce_staff_inventory_branch_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role text;
  v_branch_id text;
begin
  v_role := public.current_profile_role();

  -- This guard is specifically for branch-scoped Staff accounts.
  -- Management accounts remain clinic-wide; service-role/system operations are unaffected.
  if auth.uid() is null or v_role is null or v_role in ('super_admin', 'admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if v_role <> 'staff' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    v_branch_id := to_jsonb(old) ->> tg_argv[0];
  else
    v_branch_id := to_jsonb(new) ->> tg_argv[0];
  end if;

  if coalesce(v_branch_id, '') = '' then
    raise exception 'Inventory branch could not be resolved for this operation.';
  end if;

  if not public.staff_can_manage_inventory_branch(v_branch_id) then
    raise exception 'Your staff account is not assigned to this branch. Inventory changes are limited to your assigned branch.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Branch-owned inventory records.
drop trigger if exists enforce_staff_branch_inventory_scope on public.branch_inventory;
create trigger enforce_staff_branch_inventory_scope
before insert or update or delete on public.branch_inventory
for each row execute function public.enforce_staff_inventory_branch_scope('branch_id');

drop trigger if exists enforce_staff_inventory_batches_scope on public.inventory_batches;
create trigger enforce_staff_inventory_batches_scope
before insert or update or delete on public.inventory_batches
for each row execute function public.enforce_staff_inventory_branch_scope('branch_id');

drop trigger if exists enforce_staff_stock_movements_scope on public.stock_movements;
create trigger enforce_staff_stock_movements_scope
before insert or update or delete on public.stock_movements
for each row execute function public.enforce_staff_inventory_branch_scope('branch_id');

drop trigger if exists enforce_staff_purchase_orders_scope on public.purchase_orders;
create trigger enforce_staff_purchase_orders_scope
before insert or update or delete on public.purchase_orders
for each row execute function public.enforce_staff_inventory_branch_scope('branch_id');

drop trigger if exists enforce_staff_purchase_receipts_scope on public.purchase_receipts;
create trigger enforce_staff_purchase_receipts_scope
before insert or update or delete on public.purchase_receipts
for each row execute function public.enforce_staff_inventory_branch_scope('branch_id');

drop trigger if exists enforce_staff_stock_counts_scope on public.stock_counts;
create trigger enforce_staff_stock_counts_scope
before insert or update or delete on public.stock_counts
for each row execute function public.enforce_staff_inventory_branch_scope('branch_id');

-- Transfers have source/destination branches instead of branch_id. Staff may only mutate
-- a transfer when one side is an assigned branch; existing permission checks still decide
-- whether that action is exposed (for example receiving an inbound transfer).
create or replace function public.enforce_staff_inventory_transfer_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role text;
  v_from text;
  v_to text;
begin
  v_role := public.current_profile_role();
  if auth.uid() is null or v_role is null or v_role in ('super_admin', 'admin') or v_role <> 'staff' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    v_from := old.from_branch_id;
    v_to := old.to_branch_id;
  else
    v_from := new.from_branch_id;
    v_to := new.to_branch_id;
  end if;

  if not (public.staff_can_manage_inventory_branch(v_from) or public.staff_can_manage_inventory_branch(v_to)) then
    raise exception 'Your staff account is not assigned to either branch in this inventory transfer.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists enforce_staff_stock_transfers_scope on public.stock_transfers;
create trigger enforce_staff_stock_transfers_scope
before insert or update or delete on public.stock_transfers
for each row execute function public.enforce_staff_inventory_transfer_scope();
