-- RC QA FIX 46E: align inventory write authorization with the canonical profiles/RBAC model.
-- Forward-safe and rerunnable. This does not alter inventory data or ledger semantics.

alter table public.inventory_categories enable row level security;
alter table public.inventory_units enable row level security;
alter table public.suppliers enable row level security;
alter table public.inventory_items enable row level security;
alter table public.branch_inventory enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.stock_movements enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.stock_transfers enable row level security;
alter table public.stock_counts enable row level security;

-- Remove the legacy policies that depended on public.staff email matching.
drop policy if exists "inventory_internal_read" on public.inventory_items;
drop policy if exists "inventory_internal_write" on public.inventory_items;
drop policy if exists "inventory_categories_internal_read" on public.inventory_categories;
drop policy if exists "inventory_units_internal_read" on public.inventory_units;
drop policy if exists "suppliers_internal_read" on public.suppliers;
drop policy if exists "suppliers_internal_write" on public.suppliers;
drop policy if exists "branch_inventory_internal_read" on public.branch_inventory;
drop policy if exists "branch_inventory_internal_write" on public.branch_inventory;
drop policy if exists "inventory_batches_internal_read" on public.inventory_batches;
drop policy if exists "inventory_batches_internal_write" on public.inventory_batches;
drop policy if exists "stock_movements_internal_read" on public.stock_movements;
drop policy if exists "stock_movements_internal_insert" on public.stock_movements;
drop policy if exists "purchase_orders_internal_read" on public.purchase_orders;
drop policy if exists "purchase_orders_internal_write" on public.purchase_orders;
drop policy if exists "purchase_receipts_internal_read" on public.purchase_receipts;
drop policy if exists "purchase_receipts_internal_write" on public.purchase_receipts;
drop policy if exists "stock_transfers_internal_read" on public.stock_transfers;
drop policy if exists "stock_transfers_internal_write" on public.stock_transfers;
drop policy if exists "stock_counts_internal_read" on public.stock_counts;
drop policy if exists "stock_counts_internal_write" on public.stock_counts;

-- Drop the new policy names as well so this migration can be safely rerun.
drop policy if exists "inventory_categories_read_internal" on public.inventory_categories;
drop policy if exists "inventory_units_read_internal" on public.inventory_units;
drop policy if exists "inventory_items_read_internal" on public.inventory_items;
drop policy if exists "inventory_items_write_authorized" on public.inventory_items;
drop policy if exists "suppliers_read_internal" on public.suppliers;
drop policy if exists "suppliers_write_authorized" on public.suppliers;
drop policy if exists "branch_inventory_read_internal" on public.branch_inventory;
drop policy if exists "branch_inventory_write_authorized" on public.branch_inventory;
drop policy if exists "inventory_batches_read_internal" on public.inventory_batches;
drop policy if exists "inventory_batches_write_authorized" on public.inventory_batches;
drop policy if exists "stock_movements_read_internal" on public.stock_movements;
drop policy if exists "stock_movements_insert_authorized" on public.stock_movements;
drop policy if exists "purchase_orders_read_internal" on public.purchase_orders;
drop policy if exists "purchase_orders_write_authorized" on public.purchase_orders;
drop policy if exists "purchase_receipts_read_internal" on public.purchase_receipts;
drop policy if exists "purchase_receipts_write_authorized" on public.purchase_receipts;
drop policy if exists "stock_transfers_read_internal" on public.stock_transfers;
drop policy if exists "stock_transfers_write_authorized" on public.stock_transfers;
drop policy if exists "stock_counts_read_internal" on public.stock_counts;
drop policy if exists "stock_counts_write_authorized" on public.stock_counts;

create policy "inventory_categories_read_internal"
on public.inventory_categories for select
using (public.is_internal_profile());

create policy "inventory_units_read_internal"
on public.inventory_units for select
using (public.is_internal_profile());

create policy "inventory_items_read_internal"
on public.inventory_items for select
using (public.is_internal_profile());

create policy "inventory_items_write_authorized"
on public.inventory_items for all
using (
  public.has_profile_permission('inventory.create_item'::text)
  or public.has_profile_permission('inventory.manage'::text)
)
with check (
  public.has_profile_permission('inventory.create_item'::text)
  or public.has_profile_permission('inventory.manage'::text)
);

create policy "suppliers_read_internal"
on public.suppliers for select
using (public.is_internal_profile());

create policy "suppliers_write_authorized"
on public.suppliers for all
using (public.has_profile_permission('suppliers.manage'::text))
with check (public.has_profile_permission('suppliers.manage'::text));

create policy "branch_inventory_read_internal"
on public.branch_inventory for select
using (public.is_internal_profile());

create policy "branch_inventory_write_authorized"
on public.branch_inventory for all
using (
  public.has_profile_permission('inventory.stock_in'::text)
  or public.has_profile_permission('inventory.stock_out'::text)
  or public.has_profile_permission('inventory.adjust'::text)
  or public.has_profile_permission('inventory.transfer'::text)
  or public.has_profile_permission('inventory.receive_transfer'::text)
)
with check (
  public.has_profile_permission('inventory.stock_in'::text)
  or public.has_profile_permission('inventory.stock_out'::text)
  or public.has_profile_permission('inventory.adjust'::text)
  or public.has_profile_permission('inventory.transfer'::text)
  or public.has_profile_permission('inventory.receive_transfer'::text)
);

create policy "inventory_batches_read_internal"
on public.inventory_batches for select
using (public.is_internal_profile());

create policy "inventory_batches_write_authorized"
on public.inventory_batches for all
using (
  public.has_profile_permission('inventory.stock_in'::text)
  or public.has_profile_permission('purchase_orders.receive'::text)
  or public.has_profile_permission('purchases.receive'::text)
)
with check (
  public.has_profile_permission('inventory.stock_in'::text)
  or public.has_profile_permission('purchase_orders.receive'::text)
  or public.has_profile_permission('purchases.receive'::text)
);

create policy "stock_movements_read_internal"
on public.stock_movements for select
using (public.is_internal_profile());

create policy "stock_movements_insert_authorized"
on public.stock_movements for insert
with check (
  public.has_profile_permission('inventory.stock_in'::text)
  or public.has_profile_permission('inventory.stock_out'::text)
  or public.has_profile_permission('inventory.adjust'::text)
  or public.has_profile_permission('inventory.transfer'::text)
  or public.has_profile_permission('inventory.receive_transfer'::text)
  or public.has_profile_permission('purchase_orders.receive'::text)
  or public.has_profile_permission('purchases.receive'::text)
);

create policy "purchase_orders_read_internal"
on public.purchase_orders for select
using (public.is_internal_profile());

create policy "purchase_orders_write_authorized"
on public.purchase_orders for all
using (
  public.has_profile_permission('purchase_orders.create'::text)
  or public.has_profile_permission('purchases.create'::text)
  or public.has_profile_permission('purchase_orders.receive'::text)
  or public.has_profile_permission('purchases.receive'::text)
)
with check (
  public.has_profile_permission('purchase_orders.create'::text)
  or public.has_profile_permission('purchases.create'::text)
  or public.has_profile_permission('purchase_orders.receive'::text)
  or public.has_profile_permission('purchases.receive'::text)
);

create policy "purchase_receipts_read_internal"
on public.purchase_receipts for select
using (public.is_internal_profile());

create policy "purchase_receipts_write_authorized"
on public.purchase_receipts for all
using (
  public.has_profile_permission('purchase_orders.receive'::text)
  or public.has_profile_permission('purchases.receive'::text)
)
with check (
  public.has_profile_permission('purchase_orders.receive'::text)
  or public.has_profile_permission('purchases.receive'::text)
);

create policy "stock_transfers_read_internal"
on public.stock_transfers for select
using (public.is_internal_profile());

create policy "stock_transfers_write_authorized"
on public.stock_transfers for all
using (
  public.has_profile_permission('inventory.transfer'::text)
  or public.has_profile_permission('inventory.receive_transfer'::text)
)
with check (
  public.has_profile_permission('inventory.transfer'::text)
  or public.has_profile_permission('inventory.receive_transfer'::text)
);

create policy "stock_counts_read_internal"
on public.stock_counts for select
using (public.is_internal_profile());

create policy "stock_counts_write_authorized"
on public.stock_counts for all
using (public.has_profile_permission('inventory.adjust'::text))
with check (public.has_profile_permission('inventory.adjust'::text));

comment on table public.stock_movements is
'Inventory ledger for stock changes. RC QA 46E keeps write access on the canonical profile/RBAC model; historical ledger rows should not be updated casually.';
