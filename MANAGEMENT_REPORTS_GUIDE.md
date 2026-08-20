# Plamenco Dental Co. Management Reports Guide

This guide defines how Part 33 management reporting should be interpreted and used. It complements `BUSINESS_METRICS_DEFINITIONS.md` and does not turn the clinic platform into formal accounting software.

## Global report context

Every management report must preserve the same active context unless a section clearly states otherwise:

- Business timezone: `Asia/Manila`
- Date range: preset or validated custom `start <= end`
- Branch: All Branches, Pulilan, or Plaridel, subject to authorization
- Optional report-specific filters: provider, service, appointment status, invoice status, payment method, expense category/vendor, inventory category/supplier

A drill-down must carry the originating date and branch filters into the destination report. A dashboard aggregate is only trustworthy when the user can open the underlying records and reconcile the total.

## Financial terminology

### Billed Amount

Valid invoice totals issued during the selected period. This is not the amount collected.

### Gross Collections

Successful incoming payments recorded during the selected period before refunds.

### Refunds

Completed refund records using the refund business date.

### Net Collections

Gross Collections less completed refunds, when both are shown under the same reporting context.

### Outstanding Receivables

Legitimate unpaid invoice balances. The current database stores current invoice balances but does not maintain historical daily AR snapshots; historical reports must therefore avoid implying a reconstructed past balance unless a dedicated historical balance architecture is added later.

### Recorded Expenses

Valid expense records using expense date. Inventory purchases linked into the expense architecture are not separately added again from purchase-order totals.

### Collections Less Recorded Expenses

A management cash-movement indicator only. It must never be labelled Net Profit or Income Statement profit.

## Appointment reporting

Use scheduled appointment date as the business date. Status distribution may include Requested/Pending, Confirmed, Checked In, Waiting, In Progress, Completed, Cancelled, Rejected, Rescheduled, and No Show according to actual stored states.

No-show and completion rates must exclude future appointments from occurrence-based denominators. Cancellation and no-show denominator policy should remain explicit in report documentation and UI.

## Patient reporting

Historical Excel import execution time is not a patient-acquisition date. Imported patients should count as new only where a reliable historical registration/first-visit business date exists.

New-vs-returning reporting should be based on reliable visit history. When historical history is incomplete, the report must state the limitation instead of inferring.

## Service reporting

Rank services using actual performed treatment/charge/invoice history. Never multiply today's catalog price by old appointment counts to manufacture historical value. Historical values must use stored snapshots/charges.

## Provider reporting

Provider reporting is neutral operational analysis, not a best/worst dentist ranking. Appropriate measures include patients seen, completed visits, treatments performed, billed value, and no-show context.

Provider utilization is shown only when actual provider schedule windows provide a reliable denominator. Never assume every dentist works eight hours per day.

Provider compensation remains a sensitive management-only report and must use existing permission/RLS controls.

## Expense reporting

Supported management views include:

- recorded expense total
- trend by expense date
- category breakdown
- branch breakdown
- largest expenses
- utility category trends when reliably categorized

Clinic-wide expenses with no branch remain clinic-wide/unmapped according to the documented rule; they are never silently assigned 50/50 or to Pulilan.

## Inventory reporting

Pulilan and Plaridel stock remain separate. Low-stock status must use configured reorder thresholds.

Inventory valuation is displayed only when reliable unit-cost data exists and the valuation method is documented. The system must not claim FIFO/LIFO/accounting inventory valuation unless such architecture is explicitly implemented.

## Cash reconciliation

Physical cash reconciliation must exclude GCash, card, bank transfer, and online gateway payments from expected physical cash. Non-zero branch/session variance is a management exception.

## Empty, error, and freshness states

- Legitimate no-data period: show a professional empty state.
- Query failure: show an error/retry state; never render zero as though clinic activity were zero.
- Cached/loaded analytics: show truthful freshness information and never claim realtime unless the data source is actually realtime.

## Recommended report presets

- Daily Operations Summary
- Monthly Management Operations Report
- Branch Performance
- Collections
- Outstanding Receivables
- Expenses
- Inventory Status
- Provider Activity

The monthly report must be labelled a management/operations report, not an Income Statement.
