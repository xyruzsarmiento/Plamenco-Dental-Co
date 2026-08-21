-- Inventory persistence hardening.
-- Forward-safe and rerunnable: adds missing stock-count fields and replaces legacy staff-email RLS checks
-- with profile/permission-aware policies used by the current authentication foundation.

create extension if not exists pgcrypto;

alter table public.stock_counts
  add column if not exists count_number text;

alter table public.stock_counts
  add column if not exists reviewed_by text default '';

update public.stock_counts
set count_number = 'CNT-MIG-' || upper(substr(md5(id::text), 1, 10))
where count_number is null or btrim(count_number) = '';

alter table public.stock_counts
  alter column count_number set not null;

create unique index if not exists stock_counts_count_number_uidx
  on public.stock_counts (count_number);

create or replace function public.has_any_profile_permission(permission_keys text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and (
          p.role in ('super_admin', 'admin')
          or p.permissions && permission_keys
        )
    ),
    false
  )
$$;

grant execute on function public.has_any_profile_permission(text[]) to authenticated;

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

drop policy if exists "inventory_categories_internal_read" on public.inventory_categories;
create policy "inventory_categories_internal_read"
on public.inventory_categories
for select
using (public.is_internal_profile());

drop policy if exists "inventory_units_internal_read" on public.inventory_units;
create policy "inventory_units_internal_read"
on public.inventory_units
for select
using (public.is_internal_profile());

drop policy if exists "inventory_internal_read" on public.inventory_items;
create policy "inventory_internal_read"
on public.inventory_items
for select
using (public.is_internal_profile());

drop policy if exists "inventory_internal_write" on public.inventory_items;
create policy "inventory_internal_write"
on public.inventory_items
for all
using (public.has_any_profile_permission(array['inventory.create_item','inventory.edit_item']::text[]))
with check (public.has_any_profile_permission(array['inventory.create_item','inventory.edit_item']::text[]));

drop policy if exists "suppliers_internal_read" on public.suppliers;
create policy "suppliers_internal_read"
on public.suppliers
for select
using (public.is_internal_profile());

drop policy if exists "suppliers_internal_write" on public.suppliers;
create policy "suppliers_internal_write"
on public.suppliers
for all
using (public.has_any_profile_permission(array['suppliers.manage']::text[]))
with check (public.has_any_profile_permission(array['suppliers.manage']::text[]));

drop policy if exists "branch_inventory_internal_read" on public.branch_inventory;
create policy "branch_inventory_internal_read"
on public.branch_inventory
for select
using (public.is_internal_profile());

drop policy if exists "branch_inventory_internal_write" on public.branch_inventory;
create policy "branch_inventory_internal_write"
on public.branch_inventory
for all
using (public.has_any_profile_permission(array['inventory.stock_in','inventory.stock_out','inventory.adjust','inventory.transfer','inventory.receive_transfer','purchases.receive','purchase_orders.receive']::text[]))
with check (public.has_any_profile_permission(array['inventory.stock_in','inventory.stock_out','inventory.adjust','inventory.transfer','inventory.receive_transfer','purchases.receive','purchase_orders.receive']::text[]));

drop policy if exists "inventory_batches_internal_read" on public.inventory_batches;
create policy "inventory_batches_internal_read"
on public.inventory_batches
for select
using (public.is_internal_profile());

drop policy if exists "inventory_batches_internal_write" on public.inventory_batches;
create policy "inventory_batches_internal_write"
on public.inventory_batches
for all
using (public.has_any_profile_permission(array['inventory.stock_in','inventory.adjust','purchases.receive','purchase_orders.receive']::text[]))
with check (public.has_any_profile_permission(array['inventory.stock_in','inventory.adjust','purchases.receive','purchase_orders.receive']::text[]));

drop policy if exists "stock_movements_internal_read" on public.stock_movements;
create policy "stock_movements_internal_read"
on public.stock_movements
for select
using (public.is_internal_profile());

drop policy if exists "stock_movements_internal_insert" on public.stock_movements;
create policy "stock_movements_internal_insert"
on public.stock_movements
for insert
with check (public.has_any_profile_permission(array['inventory.stock_in','inventory.stock_out','inventory.adjust','inventory.transfer','inventory.receive_transfer','purchases.receive','purchase_orders.receive']::text[]));

drop policy if exists "purchase_orders_internal_read" on public.purchase_orders;
create policy "purchase_orders_internal_read"
on public.purchase_orders
for select
using (public.is_internal_profile());

drop policy if exists "purchase_orders_internal_write" on public.purchase_orders;
create policy "purchase_orders_internal_write"
on public.purchase_orders
for all
using (public.has_any_profile_permission(array['purchase_orders.create','purchase_orders.approve','purchase_orders.receive','purchases.create','purchases.receive']::text[]))
with check (public.has_any_profile_permission(array['purchase_orders.create','purchase_orders.approve','purchase_orders.receive','purchases.create','purchases.receive']::text[]));

drop policy if exists "purchase_receipts_internal_read" on public.purchase_receipts;
create policy "purchase_receipts_internal_read"
on public.purchase_receipts
for select
using (public.is_internal_profile());

drop policy if exists "purchase_receipts_internal_write" on public.purchase_receipts;
create policy "purchase_receipts_internal_write"
on public.purchase_receipts
for all
using (public.has_any_profile_permission(array['purchase_orders.receive','purchases.receive']::text[]))
with check (public.has_any_profile_permission(array['purchase_orders.receive','purchases.receive']::text[]));

drop policy if exists "stock_transfers_internal_read" on public.stock_transfers;
create policy "stock_transfers_internal_read"
on public.stock_transfers
for select
using (public.is_internal_profile());

drop policy if exists "stock_transfers_internal_write" on public.stock_transfers;
create policy "stock_transfers_internal_write"
on public.stock_transfers
for all
using (public.has_any_profile_permission(array['inventory.transfer','inventory.receive_transfer']::text[]))
with check (public.has_any_profile_permission(array['inventory.transfer','inventory.receive_transfer']::text[]));

drop policy if exists "stock_counts_internal_read" on public.stock_counts;
create policy "stock_counts_internal_read"
on public.stock_counts
for select
using (public.is_internal_profile());

drop policy if exists "stock_counts_internal_write" on public.stock_counts;
create policy "stock_counts_internal_write"
on public.stock_counts
for all
using (public.has_any_profile_permission(array['inventory.adjust']::text[]))
with check (public.has_any_profile_permission(array['inventory.adjust']::text[]));
