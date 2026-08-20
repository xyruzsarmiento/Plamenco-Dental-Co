-- Inventory, procurement, and supplier management V2.
-- Extends the existing inventory architecture without duplicating stock records.

alter table public.stock_counts
  add column if not exists count_number text,
  add column if not exists reviewed_by text default '';

create unique index if not exists stock_counts_count_number_idx
  on public.stock_counts(count_number)
  where count_number is not null and count_number <> '';

create index if not exists stock_counts_branch_status_date_idx
  on public.stock_counts(branch_id, status, count_date desc);

create index if not exists stock_movements_item_branch_created_idx
  on public.stock_movements(inventory_item_id, branch_id, created_at desc);

create index if not exists inventory_batches_item_branch_expiry_idx
  on public.inventory_batches(inventory_item_id, branch_id, expiry_date)
  where expiry_date is not null;

create index if not exists branch_inventory_status_lookup_idx
  on public.branch_inventory(branch_id, inventory_item_id, quantity_on_hand, reorder_level);

alter table public.stock_transfers
  add column if not exists sent_at timestamptz,
  add column if not exists approved_by text default '';

create index if not exists stock_transfers_status_branch_idx
  on public.stock_transfers(status, from_branch_id, to_branch_id, created_at desc);

alter table public.purchase_receipts
  add column if not exists supplier_invoice_number text default '',
  add column if not exists supplier_invoice_date date,
  add column if not exists supplier_invoice_due_date date,
  add column if not exists supplier_invoice_amount_cents integer not null default 0 check (supplier_invoice_amount_cents >= 0);

create index if not exists purchase_receipts_supplier_invoice_idx
  on public.purchase_receipts(supplier_id, supplier_invoice_number)
  where supplier_invoice_number <> '';

create index if not exists purchase_orders_supplier_status_idx
  on public.purchase_orders(supplier_id, status, order_date desc);
