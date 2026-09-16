create table if not exists public.inventory_valuation_snapshots (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null,
  period_month date not null,
  period_end date not null,
  closing_quantity numeric(16,3) not null default 0,
  closing_value_cents bigint not null default 0,
  purchases_cents bigint not null default 0,
  consumption_cents bigint not null default 0,
  transfer_in_cents bigint not null default 0,
  transfer_out_cents bigint not null default 0,
  adjustments_cents bigint not null default 0,
  expiry_damage_cents bigint not null default 0,
  active_positions integer not null default 0,
  low_stock_positions integer not null default 0,
  out_of_stock_positions integer not null default 0,
  movement_count integer not null default 0,
  directly_costed_movements integer not null default 0,
  cost_coverage_percent numeric(5,2) not null default 100,
  positions jsonb not null default '[]'::jsonb,
  snapshot_source text not null default 'ledger_reconstruction_v1',
  calculation_version integer not null default 1,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (branch_id, period_month)
);

create index if not exists inventory_valuation_snapshots_branch_period_idx
  on public.inventory_valuation_snapshots(branch_id, period_month desc);

alter table public.inventory_valuation_snapshots enable row level security;

drop policy if exists inventory_valuation_snapshots_read on public.inventory_valuation_snapshots;
create policy inventory_valuation_snapshots_read
on public.inventory_valuation_snapshots
for select
to authenticated
using (
  public.is_internal_profile()
  and public.profile_has_active_branch(branch_id)
  and (
    public.has_profile_permission('reports.view_inventory')
    or public.has_profile_permission('inventory.view_cost')
    or public.has_profile_permission('inventory.view')
  )
);

revoke insert, update, delete on public.inventory_valuation_snapshots from anon, authenticated;
grant select on public.inventory_valuation_snapshots to authenticated, service_role;

create or replace function public.capture_inventory_valuation_snapshot(
  p_branch_id text,
  p_period_month date
) returns public.inventory_valuation_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date;
  v_next_month date;
  v_existing public.inventory_valuation_snapshots;
  v_snapshot public.inventory_valuation_snapshots;
  v_positions jsonb := '[]'::jsonb;
  v_closing_quantity numeric(16,3) := 0;
  v_closing_value bigint := 0;
  v_purchases bigint := 0;
  v_consumption bigint := 0;
  v_transfer_in bigint := 0;
  v_transfer_out bigint := 0;
  v_adjustments bigint := 0;
  v_expiry_damage bigint := 0;
  v_active_positions integer := 0;
  v_low_stock_positions integer := 0;
  v_out_of_stock_positions integer := 0;
  v_movement_count integer := 0;
  v_direct_costed integer := 0;
  v_coverage numeric(5,2) := 100;
begin
  if auth.uid() is null or not public.is_internal_profile() then
    raise exception 'Not authorized to capture inventory valuation snapshots.';
  end if;
  if not (
    public.has_profile_permission('reports.view_inventory')
    or public.has_profile_permission('inventory.view_cost')
    or public.has_profile_permission('inventory.adjust')
  ) then
    raise exception 'You do not have permission to close an inventory valuation period.';
  end if;
  if p_branch_id is null or btrim(p_branch_id) = '' then
    raise exception 'Branch is required.';
  end if;
  if not public.profile_has_active_branch(p_branch_id) then
    raise exception 'Not authorized for this inventory branch.';
  end if;
  if p_period_month is null then
    raise exception 'Snapshot month is required.';
  end if;

  v_month := date_trunc('month', p_period_month)::date;
  v_next_month := (v_month + interval '1 month')::date;
  if v_month >= date_trunc('month', current_date)::date then
    raise exception 'Only completed months can be closed into a valuation snapshot.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('inventory_snapshot:' || p_branch_id || ':' || v_month::text, 0));

  select * into v_existing
  from public.inventory_valuation_snapshots
  where branch_id = p_branch_id and period_month = v_month;
  if found then
    return v_existing;
  end if;

  with catalog as (
    select
      i.id as item_id,
      i.item_code,
      i.name,
      coalesce(b.quantity_on_hand, 0)::numeric as current_qty,
      coalesce(b.average_unit_cost_cents, 0)::bigint as current_unit_cost,
      coalesce(b.reorder_level, i.default_reorder_level, 0)::numeric as reorder_level
    from public.inventory_items i
    left join public.branch_inventory b
      on b.inventory_item_id = i.id and b.branch_id = p_branch_id
    where i.status <> 'archived'
       or b.id is not null
       or exists (
         select 1 from public.stock_movements sm
         where sm.branch_id = p_branch_id and sm.inventory_item_id = i.id
       )
  ), later as (
    select
      c.item_id,
      coalesce(sum(sm.quantity_after - sm.quantity_before), 0)::numeric as signed_units,
      coalesce(sum(
        sign(sm.quantity_after - sm.quantity_before) *
        case
          when coalesce(sm.total_cost_cents, 0) > 0 then sm.total_cost_cents
          when coalesce(sm.unit_cost_cents, 0) > 0 then round(sm.unit_cost_cents * sm.quantity)::bigint
          else round(c.current_unit_cost * sm.quantity)::bigint
        end
      ), 0)::bigint as signed_value
    from catalog c
    left join public.stock_movements sm
      on sm.branch_id = p_branch_id
     and sm.inventory_item_id = c.item_id
     and sm.created_at >= v_next_month::timestamptz
    group by c.item_id
  ), closing as (
    select
      c.*,
      greatest(0, c.current_qty - coalesce(l.signed_units, 0))::numeric(16,3) as closing_qty,
      greatest(0, round(c.current_qty * c.current_unit_cost)::bigint - coalesce(l.signed_value, 0))::bigint as closing_value
    from catalog c
    left join later l on l.item_id = c.item_id
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'itemId', item_id,
      'itemCode', item_code,
      'name', name,
      'closingQuantity', closing_qty,
      'closingValueCents', closing_value,
      'reorderLevel', reorder_level,
      'referenceUnitCostCents', current_unit_cost
    ) order by name) filter (where closing_qty > 0 or reorder_level > 0), '[]'::jsonb),
    coalesce(sum(closing_qty), 0),
    coalesce(sum(closing_value), 0),
    count(*) filter (where closing_qty > 0),
    count(*) filter (where closing_qty > 0 and reorder_level > 0 and closing_qty <= reorder_level),
    count(*) filter (where closing_qty <= 0 and reorder_level > 0)
  into v_positions, v_closing_quantity, v_closing_value, v_active_positions, v_low_stock_positions, v_out_of_stock_positions
  from closing;

  with month_moves as (
    select
      sm.*,
      (sm.quantity_after - sm.quantity_before) as signed_units,
      case
        when coalesce(sm.total_cost_cents, 0) > 0 then sm.total_cost_cents::bigint
        when coalesce(sm.unit_cost_cents, 0) > 0 then round(sm.unit_cost_cents * sm.quantity)::bigint
        else round(coalesce(b.average_unit_cost_cents, 0) * sm.quantity)::bigint
      end as movement_value,
      (coalesce(sm.total_cost_cents, 0) > 0 or coalesce(sm.unit_cost_cents, 0) > 0) as directly_costed
    from public.stock_movements sm
    left join public.branch_inventory b
      on b.branch_id = sm.branch_id and b.inventory_item_id = sm.inventory_item_id
    where sm.branch_id = p_branch_id
      and sm.created_at >= v_month::timestamptz
      and sm.created_at < v_next_month::timestamptz
  )
  select
    count(*)::integer,
    count(*) filter (where directly_costed)::integer,
    coalesce(sum(movement_value) filter (where signed_units > 0 and movement_type in ('opening_balance','purchase_receipt','manual_stock_in')), 0)::bigint,
    coalesce(sum(movement_value) filter (where signed_units < 0 and movement_type in ('consumption','manual_stock_out','return_to_supplier')), 0)::bigint,
    coalesce(sum(movement_value) filter (where movement_type = 'transfer_in'), 0)::bigint,
    coalesce(sum(movement_value) filter (where movement_type = 'transfer_out'), 0)::bigint,
    coalesce(sum(sign(signed_units) * movement_value) filter (where movement_type in ('adjustment_increase','adjustment_decrease','reversal','void')), 0)::bigint,
    coalesce(sum(movement_value) filter (where movement_type in ('expired','damaged')), 0)::bigint
  into v_movement_count, v_direct_costed, v_purchases, v_consumption, v_transfer_in, v_transfer_out, v_adjustments, v_expiry_damage
  from month_moves;

  v_coverage := case when v_movement_count = 0 then 100 else round((v_direct_costed::numeric / v_movement_count::numeric) * 100, 2) end;

  insert into public.inventory_valuation_snapshots (
    branch_id, period_month, period_end, closing_quantity, closing_value_cents,
    purchases_cents, consumption_cents, transfer_in_cents, transfer_out_cents,
    adjustments_cents, expiry_damage_cents, active_positions, low_stock_positions,
    out_of_stock_positions, movement_count, directly_costed_movements,
    cost_coverage_percent, positions, snapshot_source, calculation_version,
    created_by
  ) values (
    p_branch_id, v_month, (v_next_month - interval '1 day')::date,
    v_closing_quantity, v_closing_value, v_purchases, v_consumption,
    v_transfer_in, v_transfer_out, v_adjustments, v_expiry_damage,
    v_active_positions, v_low_stock_positions, v_out_of_stock_positions,
    v_movement_count, v_direct_costed, v_coverage, v_positions,
    'ledger_reconstruction_v1', 1, auth.uid()
  ) returning * into v_snapshot;

  insert into public.audit_logs(id, user_name, action, entity, entity_id, metadata, created_at)
  values (
    gen_random_uuid(), auth.uid()::text, 'inventory_period_closed', 'inventory_valuation_snapshot', v_snapshot.id::text,
    jsonb_build_object(
      'branchId', p_branch_id,
      'periodMonth', v_month,
      'closingQuantity', v_closing_quantity,
      'closingValueCents', v_closing_value,
      'costCoveragePercent', v_coverage,
      'calculationVersion', 1
    ),
    now()
  );

  return v_snapshot;
end;
$$;

revoke all on function public.capture_inventory_valuation_snapshot(text,date) from public, anon;
grant execute on function public.capture_inventory_valuation_snapshot(text,date) to authenticated, service_role;
