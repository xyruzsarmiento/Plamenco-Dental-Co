# Data Reconciliation Checklist

Use production/staging data only. Do not infer success from empty tables or demo fixtures.

## Billing and payments
- Invoice subtotal + adjustments = total.
- Amount paid never exceeds total.
- Balance equals total less valid allocations.
- Successful payments reconcile to allocations.
- Refunds never exceed refundable amount.
- Replayed gateway event does not post twice.
- Receivables come from invoice/billing truth, never treatment estimates.

## Expenses and cash
- Expense total, paid amount and balance reconcile.
- Voided expense/payment records remain historical.
- Cash-session expected cash reconciles to eligible cash transactions.
- Actual cash and variance require explicit operator entry/evidence.

## Inventory
- Current branch balance reconciles to stock movement ledger.
- Transfers reconcile source and destination movement records.
- No invalid negative stock where prohibited.
- Inventory procurement/expense integration does not double count cost.

## Provider payouts
- Validate non-void payout uniqueness by provider/branch/period.
- Confirm compensation data is not exposed to unauthorized roles.

## Reporting
- Billed, Collections, Refunds, Receivables and Expenses use the same definitions across dashboard/detail/export.
- Collections Less Recorded Expenses, when shown, remains a management cash metric and is not labeled Net Profit.

Status for all sections in this repository-only pass: **NOT VERIFIED against production data**.
