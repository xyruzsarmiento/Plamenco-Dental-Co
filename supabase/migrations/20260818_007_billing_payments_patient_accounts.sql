-- Part 9: Billing, payments, patient accounts, invoices, allocations and receipts.
-- This migration extends the existing financial tables without deleting legacy data.

create extension if not exists pgcrypto;

create table if not exists public.payment_methods (
  id text primary key,
  label text not null,
  active boolean not null default true,
  is_online boolean not null default false,
  requires_reference boolean not null default false,
  requires_verification boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.payment_methods (id, label, active, is_online, requires_reference, requires_verification)
values
  ('cash', 'Cash', true, false, false, false),
  ('gcash', 'GCash', true, false, true, false),
  ('maya', 'Maya', true, false, true, false),
  ('bank_transfer', 'Bank Transfer', true, false, true, false),
  ('card', 'Card/POS', true, false, true, false),
  ('online_gateway', 'Online Gateway', false, true, false, true),
  ('other', 'Other', true, false, false, true)
on conflict (id) do update set
  label = excluded.label,
  active = excluded.active,
  is_online = excluded.is_online,
  requires_reference = excluded.requires_reference,
  requires_verification = excluded.requires_verification,
  updated_at = now();

create table if not exists public.charges (
  id text primary key,
  patient_id text not null,
  branch_id text,
  clinical_visit_id text,
  appointment_id text,
  treatment_id text,
  service_id text,
  provider_id text,
  provider_name_snapshot text default '',
  description text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  final_amount_cents integer not null default 0 check (final_amount_cents >= 0),
  status text not null default 'unbilled' check (status in ('unbilled', 'invoiced', 'void')),
  invoice_id text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoices
  add column if not exists branch_id text,
  add column if not exists due_date date,
  add column if not exists subtotal_cents integer not null default 0,
  add column if not exists discount_cents integer not null default 0,
  add column if not exists void_reason text default '',
  add column if not exists voided_by text default '',
  add column if not exists voided_at timestamptz,
  add column if not exists created_by text not null default 'system';

alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('draft', 'unpaid', 'partially_paid', 'paid', 'void', 'partially_refunded', 'refunded'));

alter table public.payments
  add column if not exists payment_number text,
  add column if not exists branch_id text,
  add column if not exists allocated_cents integer not null default 0,
  add column if not exists refundable_cents integer not null default 0,
  add column if not exists source text not null default 'manual',
  add column if not exists status text not null default 'completed',
  add column if not exists proof_file_path text default '',
  add column if not exists gateway_provider text default '',
  add column if not exists gateway_transaction_id text default '',
  add column if not exists notes text default '',
  add column if not exists verified_by text default '',
  add column if not exists verified_at timestamptz,
  add column if not exists rejection_reason_internal text default '',
  add column if not exists rejection_reason_patient text default '';

update public.payments
set payment_number = 'PAY-' || lpad(row_number::text, 6, '0')
from (
  select id, row_number() over (order by created_at, id) as row_number
  from public.payments
  where payment_number is null
) numbered
where public.payments.id = numbered.id;

alter table public.payments drop constraint if exists payments_payment_method_check;
alter table public.payments add constraint payments_payment_method_check
  check (payment_method in ('cash', 'gcash', 'maya', 'bank_transfer', 'card', 'online_gateway', 'other'));

alter table public.payments drop constraint if exists payments_source_check;
alter table public.payments add constraint payments_source_check
  check (source in ('manual', 'patient_portal', 'online_gateway', 'historical_import'));

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending', 'pending_verification', 'processing', 'completed', 'failed', 'voided', 'partially_refunded', 'refunded', 'rejected'));

create unique index if not exists payments_payment_number_unique
  on public.payments (payment_number)
  where payment_number is not null;

create table if not exists public.payment_allocations (
  id text primary key,
  payment_id text not null,
  invoice_id text not null,
  amount_cents integer not null check (amount_cents > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.receipts (
  id text primary key,
  receipt_number text not null unique,
  payment_id text not null,
  patient_id text not null,
  invoice_ids text[] not null default '{}',
  branch_id text,
  amount_cents integer not null check (amount_cents > 0),
  remaining_balance_cents integer not null default 0 check (remaining_balance_cents >= 0),
  issued_at timestamptz not null default now(),
  issued_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.refunds (
  id text primary key,
  refund_number text not null unique,
  payment_id text not null,
  patient_id text not null,
  branch_id text,
  amount_cents integer not null check (amount_cents > 0),
  reason text not null,
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed', 'voided')),
  processed_by text not null,
  processed_at timestamptz not null default now(),
  gateway_refund_id text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.payment_gateway_events (
  id text primary key,
  provider text not null,
  event_id text not null,
  payment_id text not null,
  status text not null,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

create or replace function public.next_invoice_number()
returns text
language plpgsql
as $$
declare
  next_value bigint;
begin
  create sequence if not exists public.invoice_number_seq;
  select nextval('public.invoice_number_seq') into next_value;
  return 'INV-' || lpad(next_value::text, 6, '0');
end;
$$;

create or replace function public.next_payment_number()
returns text
language plpgsql
as $$
declare
  next_value bigint;
begin
  create sequence if not exists public.payment_number_seq;
  select nextval('public.payment_number_seq') into next_value;
  return 'PAY-' || lpad(next_value::text, 6, '0');
end;
$$;

create or replace function public.next_receipt_number()
returns text
language plpgsql
as $$
declare
  next_value bigint;
begin
  create sequence if not exists public.receipt_number_seq;
  select nextval('public.receipt_number_seq') into next_value;
  return 'RCPT-' || lpad(next_value::text, 6, '0');
end;
$$;

drop trigger if exists set_payment_methods_updated_at on public.payment_methods;
drop trigger if exists set_charges_updated_at on public.charges;

create trigger set_payment_methods_updated_at
before update on public.payment_methods
for each row execute procedure public.set_updated_at();

create trigger set_charges_updated_at
before update on public.charges
for each row execute procedure public.set_updated_at();

alter table public.payment_methods enable row level security;
alter table public.charges enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.receipts enable row level security;
alter table public.refunds enable row level security;
alter table public.payment_gateway_events enable row level security;

drop policy if exists "payment_methods_read_authenticated" on public.payment_methods;
drop policy if exists "charges_read_self_or_internal" on public.charges;
drop policy if exists "charges_write_internal" on public.charges;
drop policy if exists "payment_allocations_read_self_or_internal" on public.payment_allocations;
drop policy if exists "payment_allocations_write_internal" on public.payment_allocations;
drop policy if exists "receipts_read_self_or_internal" on public.receipts;
drop policy if exists "receipts_write_internal" on public.receipts;
drop policy if exists "refunds_read_self_or_internal" on public.refunds;
drop policy if exists "refunds_write_internal" on public.refunds;
drop policy if exists "payment_gateway_events_internal" on public.payment_gateway_events;

create policy "payment_methods_read_authenticated"
on public.payment_methods for select
using (auth.role() = 'authenticated');

create policy "charges_read_self_or_internal"
on public.charges for select
using (
  auth.role() = 'authenticated'
  and (
    exists (select 1 from public.patients p where p.auth_user_id = auth.uid() and (p.id::text = charges.patient_id or p.patient_id = charges.patient_id))
    or exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  )
);

create policy "charges_write_internal"
on public.charges for all
using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy "payment_allocations_read_self_or_internal"
on public.payment_allocations for select
using (
  auth.role() = 'authenticated'
  and (
    exists (
      select 1 from public.invoices i
      join public.patients p on p.id::text = i.patient_id::text or p.patient_id = i.patient_id::text
      where i.id::text = payment_allocations.invoice_id
      and p.auth_user_id = auth.uid()
    )
    or exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  )
);

create policy "payment_allocations_write_internal"
on public.payment_allocations for all
using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy "receipts_read_self_or_internal"
on public.receipts for select
using (
  auth.role() = 'authenticated'
  and (
    exists (select 1 from public.patients p where p.auth_user_id = auth.uid() and (p.id::text = receipts.patient_id or p.patient_id = receipts.patient_id))
    or exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  )
);

create policy "receipts_write_internal"
on public.receipts for all
using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy "refunds_read_self_or_internal"
on public.refunds for select
using (
  auth.role() = 'authenticated'
  and (
    exists (select 1 from public.patients p where p.auth_user_id = auth.uid() and (p.id::text = refunds.patient_id or p.patient_id = refunds.patient_id))
    or exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  )
);

create policy "refunds_write_internal"
on public.refunds for all
using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy "payment_gateway_events_internal"
on public.payment_gateway_events for all
using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));
