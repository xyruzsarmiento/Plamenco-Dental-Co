-- Part 23: Expenses, cash flow, petty cash, cashier sessions, and branch closing.
-- Patient payments, refunds, expenses, expense payments, purchase receipts, and cash movements stay separate.

create extension if not exists pgcrypto;

create table if not exists public.cashier_sessions (
  id text primary key,
  session_number text not null unique,
  branch_id text not null,
  business_date date not null,
  opened_by text not null,
  opened_at timestamptz not null default now(),
  opening_cash_cents integer not null default 0 check (opening_cash_cents >= 0),
  expected_cash_cents integer not null default 0,
  actual_cash_cents integer check (actual_cash_cents is null or actual_cash_cents >= 0),
  variance_cents integer,
  variance_reason text default '',
  closed_by text default '',
  closed_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed', 'void')),
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cashier_sessions_one_open_per_branch_date_idx
on public.cashier_sessions (branch_id, business_date)
where status = 'open';

create index if not exists cashier_sessions_branch_date_status_idx
on public.cashier_sessions (branch_id, business_date, status);

create table if not exists public.cash_movements (
  id text primary key,
  movement_number text not null unique,
  branch_id text not null,
  business_date date not null,
  movement_type text not null check (movement_type in ('cash_in', 'cash_out', 'opening_float', 'closing_adjustment')),
  direction text not null check (direction in ('in', 'out')),
  amount_cents integer not null check (amount_cents > 0),
  reason text not null,
  reference_type text check (reference_type is null or reference_type in ('cashier_session', 'expense', 'billing_payment', 'refund', 'petty_cash', 'other')),
  reference_id text,
  recorded_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists cash_movements_branch_date_type_idx
on public.cash_movements (branch_id, business_date, movement_type);

create index if not exists cash_movements_reference_idx
on public.cash_movements (reference_type, reference_id);

drop trigger if exists set_cashier_sessions_updated_at on public.cashier_sessions;
create trigger set_cashier_sessions_updated_at before update on public.cashier_sessions for each row execute procedure public.set_updated_at();

alter table public.cashier_sessions enable row level security;
alter table public.cash_movements enable row level security;

drop policy if exists "cashier_sessions_internal_read" on public.cashier_sessions;
drop policy if exists "cashier_sessions_internal_write" on public.cashier_sessions;
drop policy if exists "cash_movements_internal_read" on public.cash_movements;
drop policy if exists "cash_movements_internal_write" on public.cash_movements;

create policy "cashier_sessions_internal_read"
on public.cashier_sessions for select
using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));

create policy "cashier_sessions_internal_write"
on public.cashier_sessions for all
using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy "cash_movements_internal_read"
on public.cash_movements for select
using (auth.role() = 'authenticated' and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid()));

create policy "cash_movements_internal_write"
on public.cash_movements for all
using (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))))
with check (auth.role() = 'authenticated' and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))));
