-- Part 33: management BI financial semantics.
--
-- This migration does not create a second reporting data store. It exposes a
-- trusted aggregation over the existing operational billing/payment/refund/
-- expense tables and uses business dates already present in those records.
--
-- Important terminology:
--   billed_amount_cents                    = valid invoice totals issued in period
--   gross_collections_cents                = successful incoming payments in period
--   refunds_cents                          = completed refunds in period
--   net_collections_cents                  = gross collections - refunds
--   recorded_expenses_cents                = valid expense records in period
--   collections_less_recorded_expenses_cents = management cash movement indicator,
--                                                NOT accounting net profit
--
-- Receivables note:
-- `outstanding_receivables_cents` uses the current invoice balance for valid
-- invoices issued on or before the selected end date. Because the current
-- invoice table does not preserve a historical daily balance snapshot, this
-- value must not be presented as a reconstructed historical "as-of" balance.

create or replace function public.get_management_financial_summary(
  p_start_date date,
  p_end_date date,
  p_branch_id text default null
)
returns table (
  billed_amount_cents bigint,
  gross_collections_cents bigint,
  refunds_cents bigint,
  net_collections_cents bigint,
  outstanding_receivables_cents bigint,
  recorded_expenses_cents bigint,
  collections_less_recorded_expenses_cents bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with valid_invoices_in_period as (
    select i.id, i.total_cents
    from public.invoices i
    where i.status <> 'void'
      and i.invoice_date between p_start_date and p_end_date
      and (p_branch_id is null or i.branch_id = p_branch_id)
  ),
  current_receivables as (
    select coalesce(sum(i.balance_cents), 0)::bigint as amount_cents
    from public.invoices i
    where i.status <> 'void'
      and i.balance_cents > 0
      and i.invoice_date <= p_end_date
      and (p_branch_id is null or i.branch_id = p_branch_id)
  ),
  successful_payments as (
    select p.id, p.amount_cents
    from public.payments p
    where p.status in ('completed', 'partially_refunded', 'refunded')
      and p.payment_date between p_start_date and p_end_date
      and (p_branch_id is null or p.branch_id = p_branch_id)
  ),
  completed_refunds as (
    select r.id, r.amount_cents
    from public.refunds r
    where r.status = 'completed'
      and r.processed_at::date between p_start_date and p_end_date
      and (p_branch_id is null or r.branch_id = p_branch_id)
  ),
  valid_expenses as (
    select e.id, e.total_cents
    from public.expenses e
    where e.status not in ('void', 'cancelled')
      and e.expense_date between p_start_date and p_end_date
      and (p_branch_id is null or e.branch_id = p_branch_id)
  ),
  totals as (
    select
      coalesce((select sum(total_cents) from valid_invoices_in_period), 0)::bigint as billed_amount_cents,
      coalesce((select sum(amount_cents) from successful_payments), 0)::bigint as gross_collections_cents,
      coalesce((select sum(amount_cents) from completed_refunds), 0)::bigint as refunds_cents,
      coalesce((select amount_cents from current_receivables), 0)::bigint as outstanding_receivables_cents,
      coalesce((select sum(total_cents) from valid_expenses), 0)::bigint as recorded_expenses_cents
  )
  select
    totals.billed_amount_cents,
    totals.gross_collections_cents,
    totals.refunds_cents,
    (totals.gross_collections_cents - totals.refunds_cents)::bigint as net_collections_cents,
    totals.outstanding_receivables_cents,
    totals.recorded_expenses_cents,
    (totals.gross_collections_cents - totals.recorded_expenses_cents)::bigint as collections_less_recorded_expenses_cents
  from totals;
$$;

comment on function public.get_management_financial_summary(date, date, text) is
'Part 33 management BI summary. Uses invoice date for billed amount, payment date for gross collections, refund processed date for refunds, and expense date for recorded expenses. Collections less expenses is not accounting profit. Outstanding receivables uses current invoice balances for invoices issued on/before the selected end date.';

revoke all on function public.get_management_financial_summary(date, date, text) from anon;
grant execute on function public.get_management_financial_summary(date, date, text) to authenticated;
