-- Part 10: Branch-specific inventory management and stock movement ledger.
-- No demo stock is seeded. Categories and units are configuration only.

create extension if not exists pgcrypto;

create table if not exists public.inventory_categories (
  id text primary key,
  name text not null unique,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_units (
  id text primary key,
  label text not null,
  abbreviation text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.inventory_categories (id, name)
values
  ('dental_materials', 'Dental Materials'),
  ('disposable_supplies', 'Disposable Supplies'),
  ('ppe', 'PPE'),
  ('sterilization_supplies', 'Sterilization Supplies'),
  ('medications', 'Medications'),
  ('office_supplies', 'Office Supplies'),
  ('cleaning_supplies', 'Cleaning Supplies'),
  ('laboratory_materials', 'Laboratory Materials'),
  ('equipment_consumables', 'Equipment Consumables'),
  ('other', 'Other')
on conflict (id) do nothing;

insert into public.inventory_units (id, label, abbreviation)
values
  ('piece', 'Piece', 'pc'),
  ('box', 'Box', 'box'),
  ('pack', 'Pack', 'pack'),
  ('bottle', 'Bottle', 'btl'),
  ('tube', 'Tube', 'tube'),
  ('sachet', 'Sachet', 'sachet'),
  ('roll', 'Roll', 'roll'),
  ('pair', 'Pair', 'pair'),
  ('set', 'Set', 'set'),
  ('milliliter', 'Milliliter', 'ml'),
  ('liter', 'Liter', 'L'),
  ('gram', 'Gram', 'g'),
  ('kilogram', 'Kilogram', 'kg')
on conflict (id) do nothing;

create table if not exists public.suppliers (
  id text primary key,
  supplier_number text not null unique,
  name text not null,
  contact_person text default '',
  phone text default '',
  email text default '',
  address text default '',
  notes text default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id text primary key,
  item_code text not null unique,
  sku text default '',
  name text not null,
  description text default '',
  category_id text not null references public.inventory_categories (id),
  unit_id text not null references public.inventory_units (id),
  brand text default '',
  default_supplier_id text references public.suppliers (id),
  default_reorder_level numeric(12,3) not null default 0,
  track_batches boolean not null default false,
  track_expiry boolean not null default false,
  expiry_warning_days integer not null default 60,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.branch_inventory (
  id text primary key,
  branch_id text not null,
  inventory_item_id text not null references public.inventory_items (id),
  quantity_on_hand numeric(14,3) not null default 0 check (quantity_on_hand >= 0),
  reorder_level numeric(14,3) not null default 0,
  location text default '',
  average_unit_cost_cents integer not null default 0 check (average_unit_cost_cents >= 0),
  updated_at timestamptz not null default now(),
  unique (branch_id, inventory_item_id)
);

create table if not exists public.inventory_batches (
  id text primary key,
  branch_id text not null,
  inventory_item_id text not null references public.inventory_items (id),
  batch_number text not null,
  quantity_on_hand numeric(14,3) not null default 0 check (quantity_on_hand >= 0),
  received_date date not null,
  expiry_date date,
  supplier_id text references public.suppliers (id),
  unit_cost_cents integer not null default 0 check (unit_cost_cents >= 0),
  source_type text not null,
  source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id text primary key,
  branch_id text not null,
  inventory_item_id text not null references public.inventory_items (id),
  batch_id text references public.inventory_batches (id),
  movement_type text not null check (movement_type in (
    'opening_balance',
    'purchase_receipt',
    'manual_stock_in',
    'consumption',
    'manual_stock_out',
    'transfer_out',
    'transfer_in',
    'adjustment_increase',
    'adjustment_decrease',
    'expired',
    'damaged',
    'return_to_supplier',
    'void',
    'reversal'
  )),
  quantity numeric(14,3) not null check (quantity > 0),
  quantity_before numeric(14,3) not null,
  quantity_after numeric(14,3) not null check (quantity_after >= 0),
  reference_type text default '',
  reference_id text default '',
  reason text not null,
  performed_by text not null,
  patient_id text,
  clinical_visit_id text,
  treatment_id text,
  appointment_id text,
  provider_id text,
  unit_cost_cents integer not null default 0,
  total_cost_cents integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id text primary key,
  po_number text not null unique,
  supplier_id text not null references public.suppliers (id),
  branch_id text not null,
  order_date date not null,
  expected_delivery_date date,
  status text not null default 'ordered' check (status in ('draft', 'ordered', 'partially_received', 'received', 'cancelled')),
  items jsonb not null default '[]'::jsonb,
  subtotal_cents integer not null default 0,
  total_cents integer not null default 0,
  notes text default '',
  created_by text not null,
  approved_by text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_receipts (
  id text primary key,
  receipt_number text not null unique,
  purchase_order_id text not null references public.purchase_orders (id),
  supplier_id text not null references public.suppliers (id),
  branch_id text not null,
  received_date date not null,
  received_by text not null,
  notes text default '',
  total_cost_cents integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_transfers (
  id text primary key,
  transfer_number text not null unique,
  from_branch_id text not null,
  to_branch_id text not null,
  status text not null default 'received' check (status in ('draft', 'in_transit', 'received', 'cancelled')),
  items jsonb not null default '[]'::jsonb,
  requested_by text not null,
  sent_by text default '',
  received_by text default '',
  notes text default '',
  created_at timestamptz not null default now(),
  received_at timestamptz
);

create table if not exists public.stock_counts (
  id text primary key,
  branch_id text not null,
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'posted', 'cancelled')),
  counted_by text not null,
  count_date date not null,
  items jsonb not null default '[]'::jsonb,
  notes text default '',
  created_at timestamptz not null default now(),
  posted_at timestamptz
);

create or replace function public.next_inventory_item_code()
returns text
language plpgsql
as $$
declare
  next_value bigint;
begin
  create sequence if not exists public.inventory_item_code_seq;
  select nextval('public.inventory_item_code_seq') into next_value;
  return 'INV-' || lpad(next_value::text, 6, '0');
end;
$$;

create or replace function public.next_purchase_order_number()
returns text
language plpgsql
as $$
declare
  next_value bigint;
begin
  create sequence if not exists public.purchase_order_number_seq;
  select nextval('public.purchase_order_number_seq') into next_value;
  return 'PO-' || lpad(next_value::text, 6, '0');
end;
$$;

create or replace function public.post_stock_movement(
  p_branch_id text,
  p_inventory_item_id text,
  p_movement_type text,
  p_quantity numeric,
  p_reason text,
  p_performed_by text,
  p_reference_type text default '',
  p_reference_id text default '',
  p_batch_id text default null,
  p_unit_cost_cents integer default 0
)
returns public.stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock public.branch_inventory;
  v_before numeric(14,3);
  v_after numeric(14,3);
  v_decrease boolean;
  v_movement public.stock_movements;
begin
  if p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  insert into public.branch_inventory (id, branch_id, inventory_item_id, quantity_on_hand, reorder_level)
  values (
    gen_random_uuid()::text,
    p_branch_id,
    p_inventory_item_id,
    0,
    coalesce((select default_reorder_level from public.inventory_items where id = p_inventory_item_id), 0)
  )
  on conflict (branch_id, inventory_item_id) do nothing;

  select *
  into v_stock
  from public.branch_inventory
  where branch_id = p_branch_id and inventory_item_id = p_inventory_item_id
  for update;

  v_before := v_stock.quantity_on_hand;
  v_decrease := p_movement_type in ('consumption', 'manual_stock_out', 'transfer_out', 'adjustment_decrease', 'expired', 'damaged', 'return_to_supplier');
  v_after := case when v_decrease then v_before - p_quantity else v_before + p_quantity end;

  if v_after < 0 then
    raise exception 'Stock operation would create negative stock';
  end if;

  update public.branch_inventory
  set
    quantity_on_hand = v_after,
    average_unit_cost_cents = case
      when p_unit_cost_cents > 0 and not v_decrease and v_after > 0
      then round(((average_unit_cost_cents * v_before) + (p_unit_cost_cents * p_quantity)) / v_after)
      else average_unit_cost_cents
    end,
    updated_at = now()
  where id = v_stock.id;

  insert into public.stock_movements (
    id,
    branch_id,
    inventory_item_id,
    batch_id,
    movement_type,
    quantity,
    quantity_before,
    quantity_after,
    reference_type,
    reference_id,
    reason,
    performed_by,
    unit_cost_cents,
    total_cost_cents
  )
  values (
    gen_random_uuid()::text,
    p_branch_id,
    p_inventory_item_id,
    nullif(p_batch_id, ''),
    p_movement_type,
    p_quantity,
    v_before,
    v_after,
    p_reference_type,
    p_reference_id,
    p_reason,
    p_performed_by,
    coalesce(p_unit_cost_cents, 0),
    coalesce(p_unit_cost_cents, 0) * p_quantity
  )
  returning * into v_movement;

  return v_movement;
end;
$$;

drop trigger if exists set_inventory_categories_updated_at on public.inventory_categories;
drop trigger if exists set_inventory_units_updated_at on public.inventory_units;
drop trigger if exists set_suppliers_updated_at on public.suppliers;
drop trigger if exists set_inventory_items_updated_at on public.inventory_items;
drop trigger if exists set_inventory_batches_updated_at on public.inventory_batches;
drop trigger if exists set_purchase_orders_updated_at on public.purchase_orders;

create trigger set_inventory_categories_updated_at before update on public.inventory_categories for each row execute procedure public.set_updated_at();
create trigger set_inventory_units_updated_at before update on public.inventory_units for each row execute procedure public.set_updated_at();
create trigger set_suppliers_updated_at before update on public.suppliers for each row execute procedure public.set_updated_at();
create trigger set_inventory_items_updated_at before update on public.inventory_items for each row execute procedure public.set_updated_at();
create trigger set_inventory_batches_updated_at before update on public.inventory_batches for each row execute procedure public.set_updated_at();
create trigger set_purchase_orders_updated_at before update on public.purchase_orders for each row execute procedure public.set_updated_at();

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

create policy "inventory_categories_internal_read" on public.inventory_categories for select using (auth.role() = 'authenticated');
create policy "inventory_units_internal_read" on public.inventory_units for select using (auth.role() = 'authenticated');

create policy "inventory_internal_read" on public.inventory_items for select using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));
create policy "inventory_internal_write" on public.inventory_items for all using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))) with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy "suppliers_internal_read" on public.suppliers for select using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));
create policy "suppliers_internal_write" on public.suppliers for all using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))) with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy "branch_inventory_internal_read" on public.branch_inventory for select using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));
create policy "branch_inventory_internal_write" on public.branch_inventory for all using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))) with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy "inventory_batches_internal_read" on public.inventory_batches for select using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));
create policy "inventory_batches_internal_write" on public.inventory_batches for all using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))) with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy "stock_movements_internal_read" on public.stock_movements for select using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));
create policy "stock_movements_internal_insert" on public.stock_movements for insert with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy "purchase_orders_internal_read" on public.purchase_orders for select using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));
create policy "purchase_orders_internal_write" on public.purchase_orders for all using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))) with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy "purchase_receipts_internal_read" on public.purchase_receipts for select using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));
create policy "purchase_receipts_internal_write" on public.purchase_receipts for all using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))) with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy "stock_transfers_internal_read" on public.stock_transfers for select using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));
create policy "stock_transfers_internal_write" on public.stock_transfers for all using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))) with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy "stock_counts_internal_read" on public.stock_counts for select using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));
create policy "stock_counts_internal_write" on public.stock_counts for all using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))) with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));
