# Plamenco Dental Co. Report Export Specification

Part 33 export contract for management PDF and Excel output. Exports must use the exact trusted filters and authorization context applied to the on-screen report.

## Common requirements

Every export includes:

- Plamenco Dental Co. branding
- report title
- branch context
- selected date range
- generated date/time in `Asia/Manila`
- generated-by display name where appropriate, never an internal auth UUID
- summary metrics relevant to the report
- detailed rows required to explain/reconcile the summary
- meaningful totals only

The export layer must not bypass RLS/RBAC. Frontend-selected branch/provider IDs are filtering inputs, not authorization.

## PDF rules

PDF output is management-ready rather than a screenshot of the web page. Long tables use repeated headers and safe page breaks where supported. Rows must not be intentionally cut between pages. Charts are included only when they materially explain the report.

Professional filename pattern:

`plamenco-<report>-<branch-or-all>-<period>.pdf`

Examples:

- `plamenco-expenses-plaridel-2026-08.pdf`
- `plamenco-branch-performance-all-2026-08.pdf`

## Excel rules

Excel output is analysis-friendly. Numeric monetary amounts are exported as numeric values rather than preformatted currency strings. Dates should be actual spreadsheet dates where the workbook library supports them.

Recommended sheets for complex reports:

1. Summary
2. Details
3. Parameters

Professional filename pattern:

`plamenco-<report>-<branch-or-all>-<period>.xlsx`

## Report definitions

### Executive / Monthly Management Operations Report

Filters: date range, branch.

Summary: Gross Collections, Refunds, Net Collections where enabled, Billed Amount, Outstanding Receivables, Recorded Expenses, Collections Less Recorded Expenses, appointments, completed visits, no shows, new patients, branch comparison and actual operational exceptions.

Details: report-specific supporting sections rather than one denormalized row dump.

Authorization: management roles with appropriate financial/report permissions.

### Appointment Report

Filters: date range, branch, provider, service, appointment status, booking source where supported.

Columns: appointment number, scheduled date, patient, branch, provider, service, status, booking source, check-in, completion.

Totals: appointment count and meaningful status counts/rates.

### Payment / Collections Report

Filters: date range, branch, payment method, payment status where supported.

Columns: payment number, payment date, patient, invoice, branch, amount, method, status, recorded by, provider reference where reliably attributable.

Totals: Gross Collections and payment count. Refunds are shown separately; do not silently subtract them from row amounts.

### Accounts Receivable Report

Filters: branch and applicable invoice/date context.

Columns: patient, invoice, invoice date, original amount, paid, outstanding, age/aging bucket where supported, branch.

Totals: outstanding balance and patient/invoice counts.

Limitation: current invoice balances must not be presented as reconstructed historical balances when historical AR snapshots do not exist.

### Expense Report

Filters: date range, branch, expense category, vendor/payee, status where supported.

Columns: expense number, expense date, branch, category, payee, description, amount, payment method/reference where available, recorded by.

Totals: Recorded Expenses and meaningful paid/outstanding amounts where the report supports them.

Inventory-linked expenses must not be added a second time from purchase-order totals.

### Inventory Status / Movement Report

Filters: date range where movement-based, branch, inventory category, supplier, stock status where supported.

Columns may include item, branch, opening quantity only if reliably derived, stock in, stock out, adjustments and closing quantity.

Do not fabricate an opening balance. Inventory valuation is included only when reliable unit-cost architecture exists and the valuation method is stated.

### Branch Performance Report

Filters: date range.

Rows/sections: Pulilan and Plaridel with Collections, Billed Amount, Recorded Expenses, completed visits, appointments, new patients, no-show rate and outstanding receivables where reliable.

All-Branches reconciliation must explicitly handle clinic-wide/unmapped data rather than silently assigning it to a branch.

### Provider Activity Report

Filters: date range, branch, provider, service where useful.

Columns: provider, branch, patients seen, visits, treatments, billed value, no-show context. Provider compensation is excluded unless the caller has the dedicated sensitive permission.

Do not export simplistic best/worst provider rankings.

## Filter fidelity test

For every export, compare on-screen parameters to the generated file. Example: selecting Plaridel + August 1–31 + Expenses + Utilities must produce only that selected data and corresponding totals. A successful export with broader data is considered a security/data-integrity failure.

## Audit

Sensitive report exports should append an existing report/audit log event with report key, export format, effective filters, branch context, actor and generated time whenever the current audit architecture supports it.
