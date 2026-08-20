create table if not exists public.saved_report_views (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  report_key text not null,
  filters jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_export_logs (
  id uuid primary key default gen_random_uuid(),
  report_key text not null,
  export_format text not null check (export_format in ('pdf', 'excel', 'csv')),
  filters jsonb not null default '{}'::jsonb,
  branch_id text,
  exported_by uuid references auth.users(id) on delete set null,
  exported_at timestamptz not null default now()
);

create index if not exists saved_report_views_report_key_idx on public.saved_report_views (report_key);
create index if not exists report_export_logs_report_exported_idx on public.report_export_logs (report_key, exported_at desc);
create index if not exists report_export_logs_branch_exported_idx on public.report_export_logs (branch_id, exported_at desc);
create index if not exists invoices_report_branch_date_idx on public.invoices (branch_id, invoice_date, status);
create index if not exists payments_report_branch_date_idx on public.payments (branch_id, payment_date, status);
create index if not exists refunds_report_branch_date_idx on public.refunds (branch_id, processed_at, status);
create index if not exists expenses_report_branch_date_idx on public.expenses (branch_id, expense_date, status);
create index if not exists expenses_report_category_date_idx on public.expenses (category_id, expense_date, status);
create index if not exists purchase_receipts_report_branch_date_idx on public.purchase_receipts (branch_id, received_date);
create index if not exists purchase_orders_report_branch_date_idx on public.purchase_orders (branch_id, order_date, status);

create or replace view public.v_branch_financial_summary as
select
  b.id as branch_id,
  b.name as branch_name,
  coalesce(invoice_totals.billed_revenue_cents, 0) as billed_revenue_cents,
  coalesce(payment_totals.collected_cash_cents, 0) as collected_cash_cents,
  coalesce(invoice_totals.outstanding_receivables_cents, 0) as outstanding_receivables_cents,
  coalesce(refund_totals.refunds_cents, 0) as refunds_cents,
  coalesce(expense_totals.operating_expenses_cents, 0) as operating_expenses_cents,
  coalesce(payment_totals.collected_cash_cents, 0) - coalesce(expense_totals.operating_expenses_cents, 0) as net_operating_result_cents
from public.branches b
left join (
  select
    branch_id,
    sum(total_cents) as billed_revenue_cents,
    sum(balance_cents) as outstanding_receivables_cents
  from public.invoices
  where status <> 'void'
  group by branch_id
) invoice_totals on invoice_totals.branch_id = b.id::text
left join (
  select
    branch_id,
    sum(amount_cents) as collected_cash_cents
  from public.payments
  where status in ('completed', 'partially_refunded', 'refunded')
  group by branch_id
) payment_totals on payment_totals.branch_id = b.id::text
left join (
  select
    branch_id,
    sum(amount_cents) as refunds_cents
  from public.refunds
  where status = 'completed'
  group by branch_id
) refund_totals on refund_totals.branch_id = b.id::text
left join (
  select
    branch_id,
    sum(total_cents) as operating_expenses_cents
  from public.expenses
  where status not in ('void', 'cancelled')
  group by branch_id
) expense_totals on expense_totals.branch_id = b.id::text;

create or replace function public.get_enterprise_financial_summary(
  p_start_date date,
  p_end_date date,
  p_branch_id text default null
)
returns table (
  billed_revenue_cents bigint,
  collected_cash_cents bigint,
  outstanding_receivables_cents bigint,
  refunds_cents bigint,
  operating_expenses_cents bigint,
  net_operating_result_cents bigint
)
language sql
stable
as $$
  with invoice_totals as (
    select
      coalesce(sum(total_cents), 0)::bigint as billed_revenue_cents,
      coalesce(sum(balance_cents), 0)::bigint as outstanding_receivables_cents
    from public.invoices
    where status <> 'void'
      and invoice_date between p_start_date and p_end_date
      and (p_branch_id is null or branch_id = p_branch_id)
  ),
  payment_totals as (
    select coalesce(sum(amount_cents), 0)::bigint as collected_cash_cents
    from public.payments
    where status in ('completed', 'partially_refunded', 'refunded')
      and payment_date between p_start_date and p_end_date
      and (p_branch_id is null or branch_id = p_branch_id)
  ),
  refund_totals as (
    select coalesce(sum(amount_cents), 0)::bigint as refunds_cents
    from public.refunds
    where status = 'completed'
      and processed_at::date between p_start_date and p_end_date
      and (p_branch_id is null or branch_id = p_branch_id)
  ),
  expense_totals as (
    select coalesce(sum(total_cents), 0)::bigint as operating_expenses_cents
    from public.expenses
    where status not in ('void', 'cancelled')
      and expense_date between p_start_date and p_end_date
      and (p_branch_id is null or branch_id = p_branch_id)
  )
  select
    invoice_totals.billed_revenue_cents,
    payment_totals.collected_cash_cents,
    invoice_totals.outstanding_receivables_cents,
    refund_totals.refunds_cents,
    expense_totals.operating_expenses_cents,
    payment_totals.collected_cash_cents - expense_totals.operating_expenses_cents
  from invoice_totals, payment_totals, refund_totals, expense_totals;
$$;

alter table public.saved_report_views enable row level security;
alter table public.report_export_logs enable row level security;

drop policy if exists "Management can manage saved report views" on public.saved_report_views;
create policy "Management can manage saved report views"
on public.saved_report_views
for all
using (public.has_profile_permission('reports.view'::text))
with check (public.has_profile_permission('reports.view'::text));

drop policy if exists "Management can log report exports" on public.report_export_logs;
create policy "Management can log report exports"
on public.report_export_logs
for all
using (public.has_profile_permission('reports.view'::text))
with check (public.has_profile_permission('reports.export_pdf'::text) or public.has_profile_permission('reports.export_excel'::text));
