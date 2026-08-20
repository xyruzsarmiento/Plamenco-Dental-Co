-- Part 11: Branch-specific general expenses and operating cost ledger.
-- No fake expenses, vendors, receipts, or bills are seeded.

create extension if not exists pgcrypto;

create table if not exists public.expense_categories (
  id text primary key,
  name text not null,
  parent_id text references public.expense_categories (id),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.expense_categories (id, name, parent_id)
values
  ('utilities', 'Utilities', null),
  ('electricity', 'Electricity', 'utilities'),
  ('water', 'Water', 'utilities'),
  ('internet_telecommunications', 'Internet / Telecommunications', 'utilities'),
  ('rent_lease', 'Rent / Lease', null),
  ('inventory_purchases', 'Inventory Purchases', null),
  ('dental_supplies', 'Dental Supplies', 'inventory_purchases'),
  ('laboratory_fees', 'Laboratory Fees', null),
  ('equipment', 'Equipment', null),
  ('equipment_maintenance', 'Equipment Maintenance', 'equipment'),
  ('repairs_maintenance', 'Repairs & Maintenance', null),
  ('cleaning_sanitation', 'Cleaning / Sanitation', null),
  ('office_supplies', 'Office Supplies', null),
  ('professional_fees', 'Professional Fees', null),
  ('transportation_delivery', 'Transportation / Delivery', null),
  ('marketing_advertising', 'Marketing / Advertising', null),
  ('software_subscriptions', 'Software / Subscriptions', null),
  ('government_regulatory', 'Government / Regulatory Fees', null),
  ('payroll_compensation', 'Payroll / Compensation', null),
  ('petty_cash', 'Petty Cash', null),
  ('miscellaneous', 'Miscellaneous', null)
on conflict (id) do nothing;

create table if not exists public.expense_vendors (
  id text primary key,
  vendor_number text not null unique,
  name text not null,
  contact_person text default '',
  phone text default '',
  email text default '',
  address text default '',
  notes text default '',
  linked_supplier_id text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id text primary key,
  expense_number text not null unique,
  scope text not null default 'branch' check (scope in ('branch', 'clinic_wide')),
  branch_id text,
  category_id text not null references public.expense_categories (id),
  vendor_id text,
  payee_name text not null,
  description text not null,
  expense_date date not null,
  due_date date,
  billing_period_start date,
  billing_period_end date,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  amount_paid_cents integer not null default 0 check (amount_paid_cents >= 0),
  balance_cents integer not null default 0 check (balance_cents >= 0),
  status text not null default 'unpaid' check (status in ('draft', 'unpaid', 'partially_paid', 'paid', 'void', 'cancelled')),
  payment_method text check (payment_method is null or payment_method in ('cash', 'gcash', 'maya', 'bank_transfer', 'card', 'online_gateway', 'other')),
  reference_number text default '',
  source_type text not null default 'manual' check (source_type in ('manual', 'purchase_order', 'purchase_receipt', 'recurring', 'other')),
  source_id text,
  notes text default '',
  recurring_template_id text,
  created_by text not null,
  approved_by text default '',
  approved_at timestamptz,
  void_reason text default '',
  voided_by text default '',
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'clinic_wide' and branch_id is null) or (scope = 'branch' and branch_id is not null))
);

create unique index if not exists expenses_unique_nonmanual_source
on public.expenses (source_type, source_id)
where source_type <> 'manual' and source_id is not null and status <> 'void';

create table if not exists public.expense_payments (
  id text primary key,
  expense_id text not null references public.expenses (id),
  amount_cents integer not null check (amount_cents > 0),
  payment_date date not null,
  payment_method text not null check (payment_method in ('cash', 'gcash', 'maya', 'bank_transfer', 'card', 'online_gateway', 'other')),
  reference_number text default '',
  paid_by text not null,
  notes text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.expense_attachments (
  id text primary key,
  expense_id text not null references public.expenses (id),
  file_name text not null,
  document_type text not null default 'other' check (document_type in ('bill', 'receipt', 'invoice', 'payment_proof', 'contract', 'quotation', 'other')),
  storage_path text not null,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now(),
  description text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.expense_recurring_templates (
  id text primary key,
  name text not null,
  scope text not null check (scope in ('branch', 'clinic_wide')),
  branch_id text,
  category_id text not null references public.expense_categories (id),
  vendor_id text,
  payee_name text not null,
  frequency text not null default 'monthly' check (frequency in ('monthly', 'quarterly', 'yearly', 'custom')),
  default_amount_cents integer check (default_amount_cents is null or default_amount_cents >= 0),
  next_due_date date not null,
  auto_create boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'clinic_wide' and branch_id is null) or (scope = 'branch' and branch_id is not null))
);

create or replace function public.next_expense_number()
returns text
language plpgsql
as $$
declare
  next_value bigint;
begin
  create sequence if not exists public.expense_number_seq;
  select nextval('public.expense_number_seq') into next_value;
  return 'EXP-' || lpad(next_value::text, 6, '0');
end;
$$;

create or replace function public.record_expense_payment(
  p_expense_id text,
  p_amount_cents integer,
  p_payment_date date,
  p_payment_method text,
  p_reference_number text,
  p_paid_by text,
  p_notes text default ''
)
returns public.expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.expenses;
  v_new_paid integer;
  v_new_balance integer;
begin
  if p_amount_cents <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select * into v_expense from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'Expense not found';
  end if;
  if v_expense.status in ('void', 'cancelled') then
    raise exception 'Cannot pay void or cancelled expense';
  end if;
  if p_amount_cents > v_expense.balance_cents then
    raise exception 'Expense payment exceeds outstanding balance';
  end if;

  insert into public.expense_payments (id, expense_id, amount_cents, payment_date, payment_method, reference_number, paid_by, notes)
  values (gen_random_uuid()::text, p_expense_id, p_amount_cents, p_payment_date, p_payment_method, coalesce(p_reference_number, ''), p_paid_by, coalesce(p_notes, ''));

  v_new_paid := v_expense.amount_paid_cents + p_amount_cents;
  v_new_balance := greatest(v_expense.total_cents - v_new_paid, 0);

  update public.expenses
  set
    amount_paid_cents = v_new_paid,
    balance_cents = v_new_balance,
    payment_method = p_payment_method,
    reference_number = coalesce(p_reference_number, reference_number),
    status = case when v_new_balance = 0 then 'paid' else 'partially_paid' end,
    updated_at = now()
  where id = p_expense_id
  returning * into v_expense;

  return v_expense;
end;
$$;

create or replace function public.generate_expense_from_purchase_receipt(p_receipt_id text, p_created_by text)
returns public.expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt public.purchase_receipts;
  v_supplier public.suppliers;
  v_expense public.expenses;
begin
  select * into v_receipt from public.purchase_receipts where id = p_receipt_id;
  if not found then
    raise exception 'Purchase receipt not found';
  end if;

  select * into v_supplier from public.suppliers where id = v_receipt.supplier_id;

  select * into v_expense
  from public.expenses
  where source_type = 'purchase_receipt' and source_id = p_receipt_id and status <> 'void'
  limit 1;

  if found then
    return v_expense;
  end if;

  insert into public.expenses (
    id,
    expense_number,
    scope,
    branch_id,
    category_id,
    payee_name,
    description,
    expense_date,
    due_date,
    subtotal_cents,
    tax_cents,
    total_cents,
    amount_paid_cents,
    balance_cents,
    status,
    source_type,
    source_id,
    notes,
    created_by
  )
  values (
    gen_random_uuid()::text,
    public.next_expense_number(),
    'branch',
    v_receipt.branch_id,
    'inventory_purchases',
    coalesce(v_supplier.name, 'Inventory supplier'),
    'Inventory purchase receipt ' || v_receipt.receipt_number,
    v_receipt.received_date,
    v_receipt.received_date,
    v_receipt.total_cost_cents,
    0,
    v_receipt.total_cost_cents,
    0,
    v_receipt.total_cost_cents,
    case when v_receipt.total_cost_cents = 0 then 'paid' else 'unpaid' end,
    'purchase_receipt',
    v_receipt.id,
    'Generated from inventory receiving. Do not manually duplicate.',
    p_created_by
  )
  returning * into v_expense;

  return v_expense;
end;
$$;

drop trigger if exists set_expense_categories_updated_at on public.expense_categories;
drop trigger if exists set_expense_vendors_updated_at on public.expense_vendors;
drop trigger if exists set_expenses_updated_at on public.expenses;
drop trigger if exists set_expense_recurring_templates_updated_at on public.expense_recurring_templates;

create trigger set_expense_categories_updated_at before update on public.expense_categories for each row execute procedure public.set_updated_at();
create trigger set_expense_vendors_updated_at before update on public.expense_vendors for each row execute procedure public.set_updated_at();
create trigger set_expenses_updated_at before update on public.expenses for each row execute procedure public.set_updated_at();
create trigger set_expense_recurring_templates_updated_at before update on public.expense_recurring_templates for each row execute procedure public.set_updated_at();

insert into storage.buckets (id, name, public)
values ('expense-attachments', 'expense-attachments', false)
on conflict (id) do nothing;

alter table public.expense_categories enable row level security;
alter table public.expense_vendors enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_payments enable row level security;
alter table public.expense_attachments enable row level security;
alter table public.expense_recurring_templates enable row level security;

drop policy if exists "expense_categories_internal_read" on public.expense_categories;
drop policy if exists "expense_vendors_internal_read" on public.expense_vendors;
drop policy if exists "expense_vendors_internal_write" on public.expense_vendors;
drop policy if exists "expenses_internal_read" on public.expenses;
drop policy if exists "expenses_internal_write" on public.expenses;
drop policy if exists "expense_payments_internal_read" on public.expense_payments;
drop policy if exists "expense_payments_internal_write" on public.expense_payments;
drop policy if exists "expense_attachments_internal_read" on public.expense_attachments;
drop policy if exists "expense_attachments_internal_write" on public.expense_attachments;
drop policy if exists "expense_recurring_internal_read" on public.expense_recurring_templates;
drop policy if exists "expense_recurring_internal_write" on public.expense_recurring_templates;

create policy "expense_categories_internal_read" on public.expense_categories for select using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));
create policy "expense_vendors_internal_read" on public.expense_vendors for select using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));
create policy "expense_vendors_internal_write" on public.expense_vendors for all using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))) with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));
create policy "expenses_internal_read" on public.expenses for select using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));
create policy "expenses_internal_write" on public.expenses for all using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))) with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));
create policy "expense_payments_internal_read" on public.expense_payments for select using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));
create policy "expense_payments_internal_write" on public.expense_payments for all using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))) with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));
create policy "expense_attachments_internal_read" on public.expense_attachments for select using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));
create policy "expense_attachments_internal_write" on public.expense_attachments for all using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))) with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));
create policy "expense_recurring_internal_read" on public.expense_recurring_templates for select using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));
create policy "expense_recurring_internal_write" on public.expense_recurring_templates for all using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))) with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

drop policy if exists "expense_attachments_storage_internal_read" on storage.objects;
drop policy if exists "expense_attachments_storage_internal_write" on storage.objects;

create policy "expense_attachments_storage_internal_read"
on storage.objects for select
using (bucket_id = 'expense-attachments' and auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));

create policy "expense_attachments_storage_internal_write"
on storage.objects for all
using (bucket_id = 'expense-attachments' and auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
with check (bucket_id = 'expense-attachments' and auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));
