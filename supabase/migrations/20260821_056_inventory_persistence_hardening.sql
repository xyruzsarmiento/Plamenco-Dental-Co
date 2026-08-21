-- Part 56: Inventory persistence hardening.
-- Forward-safe and rerunnable. Preserves existing inventory records.

alter table if exists public.stock_counts
  add column if not exists count_number text;

alter table if exists public.stock_counts
  add column if not exists reviewed_by text;

update public.stock_counts
set count_number = 'CNT-' || upper(substr(md5(id || coalesce(created_at::text, '')), 1, 10))
where count_number is null or btrim(count_number) = '';

alter table if exists public.stock_counts
  alter column count_number set not null;

create unique index if not exists stock_counts_count_number_key
  on public.stock_counts (count_number);

alter table if exists public.inventory_items enable row level security;
alter table if exists public.suppliers enable row level security;
alter table if exists public.branch_inventory enable row level security;
alter table if exists public.inventory_batches enable row level security;
alter table if exists public.stock_movements enable row level security;
alter table if exists public.purchase_orders enable row level security;
alter table if exists public.purchase_receipts enable row level security;
alter table if exists public.stock_transfers enable row level security;
alter table if exists public.stock_counts enable row level security;

drop policy if exists "inventory_internal_read" on public.inventory_items;
drop policy if exists "inventory_internal_write" on public.inventory_items;
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

create policy "inventory_internal_read"
on public.inventory_items
for select
using (public.is_internal_profile());

create policy "inventory_internal_write"
on public.inventory_items
for all
using (public.is_internal_profile())
with check (public.is_internal_profile());

create policy "suppliers_internal_read"
on public.suppliers
for select
using (public.is_internal_profile());

create policy "suppliers_internal_write"
on public.suppliers
for all
using (public.is_internal_profile())
with check (public.is_internal_profile());

create policy "branch_inventory_internal_read"
on public.branch_inventory
for select
using (public.is_internal_profile());

create policy "branch_inventory_internal_write"
on public.branch_inventory
for all
using (public.is_internal_profile())
with check (public.is_internal_profile());

create policy "inventory_batches_internal_read"
on public.inventory_batches
for select
using (public.is_internal_profile());

create policy "inventory_batches_internal_write"
on public.inventory_batches
for all
using (public.is_internal_profile())
with check (public.is_internal_profile());

create policy "stock_movements_internal_read"
on public.stock_movements
for select
using (public.is_internal_profile());

create policy "stock_movements_internal_insert"
on public.stock_movements
for insert
with check (public.is_internal_profile());

create policy "purchase_orders_internal_read"
on public.purchase_orders
for select
using (public.is_internal_profile());

create policy "purchase_orders_internal_write"
on public.purchase_orders
for all
using (public.is_internal_profile())
with check (public.is_internal_profile());

create policy "purchase_receipts_internal_read"
on public.purchase_receipts
for select
using (public.is_internal_profile());

create policy "purchase_receipts_internal_write"
on public.purchase_receipts
for all
using (public.is_internal_profile())
with check (public.is_internal_profile());

create policy "stock_transfers_internal_read"
on public.stock_transfers
for select
using (public.is_internal_profile());

create policy "stock_transfers_internal_write"
on public.stock_transfers
for all
using (public.is_internal_profile())
with check (public.is_internal_profile());

create policy "stock_counts_internal_read"
on public.stock_counts
for select
using (public.is_internal_profile());

create policy "stock_counts_internal_write"
on public.stock_counts
for all
using (public.is_internal_profile())
with check (public.is_internal_profile());
