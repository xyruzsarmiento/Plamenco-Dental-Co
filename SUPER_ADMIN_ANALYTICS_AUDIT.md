# Super Admin Analytics Audit — Part 33

## Purpose

Audit the existing Plamenco reporting implementation before changing UI/query architecture. Part 33 is a management BI layer over operational records, not a second reporting database and not accounting software.

## Existing implementation confirmed

- `src/pages/DashboardPage.tsx` already contains the management dashboard composition and chart-driven sections.
- `src/pages/ReportsPage.tsx` already acts as a reporting workspace rather than a blank placeholder.
- `src/features/reports/reportStore.ts` centralizes report loading/filter behavior.
- `src/features/reports/executiveWorkbook.ts` provides an existing Excel/export foundation.
- Existing billing, expense, inventory, appointments, patients and provider modules are retained as operational sources of truth.
- Existing chart infrastructure is reused; Part 33 must not introduce a competing chart library.
- Existing database analytics migrations already add report indexes plus enterprise summary support.

## Gaps found in the current implementation

The audit found several Part 33 semantic issues that must be corrected rather than hidden behind UI polish:

1. The current executive dashboard still uses the label `Revenue` for invoice totals. Part 33 requires this to be labelled `Billed Amount` unless formal recognized revenue is actually implemented.
2. The current dashboard uses `Operating Result` for collections less expenses. The safer Part 33 label is `Collections Less Recorded Expenses` or `Net Cash Movement`, with an explicit non-profit disclaimer.
3. Several existing report-store field names still use legacy identifiers such as `billedRevenueCents`, `collectedCashCents`, and `netOperatingResultCents`. The calculations can remain compatible internally, but management-facing labels and new trusted database interfaces must use unambiguous terminology.
4. `collectedCashCents` is semantically inaccurate because completed payments can include GCash, card, bank transfer and online gateway payments. This is a collections metric, not necessarily physical cash.
5. The original `get_enterprise_financial_summary` database function reports successful payment totals and refunds separately but uses legacy names. Part 33 now adds `get_management_financial_summary` with explicit Billed Amount, Gross Collections, Refunds, Net Collections, Recorded Expenses and Collections Less Recorded Expenses semantics.
6. Current invoice `balance_cents` is a present-state balance. Without historical receivable snapshots, the system must not imply that an arbitrary prior-period AR total is a reconstructed historical as-of balance.
7. The report store contains a legacy `buildReportSnapshot` path that derives service value from current service catalog price multiplied by appointment count. That legacy path must not be used for historical management service-value reporting; Part 33 enterprise service reporting must continue to use stored charges/treatment history.
8. Provider/payment attribution must be treated carefully because one invoice/payment can cover multiple items/providers. Provider collections should not be presented as fully attributable where allocation architecture cannot prove it.
9. Dashboard error state still needs to be separated from legitimate zero-data state wherever remote/server-side report queries replace local aggregation.

## Corrective database change

Migration `supabase/migrations/20260820_024_management_reporting_semantics.sql` adds a trusted, security-invoker management summary function over the existing operational tables. It does not add editable summary tables or a second reporting database.

The new function exposes:

- Billed Amount
- Gross Collections
- Refunds
- Net Collections
- Outstanding Receivables
- Recorded Expenses
- Collections Less Recorded Expenses

It uses invoice date, payment date, refund processed date and expense date respectively. The receivables field is explicitly documented as current invoice balance for valid invoices issued on/before the selected end date rather than a reconstructed historical AR snapshot.

## Part 33 audit rules

1. Do not add editable `dashboard_total`, `monthly_revenue`, `statistics`, or similar parallel reporting tables.
2. Collections come from successful payment records; billed amount comes from billing/invoice records. They are not interchangeable.
3. `Collections Less Recorded Expenses` may be shown as a management indicator, but not `Net Profit`.
4. Expense aggregation must avoid counting an inventory purchase both as a purchase-order total and linked expense.
5. Historical service/treatment values must use stored historical amounts.
6. Patient imports must not use import execution time as the new-patient business date.
7. Future appointments must not depress completion/no-show rates.
8. Unknown historical branch/provider/service data stays `Unknown / Unmapped` where appropriate.
9. Provider utilization is conditional on a reliable schedule denominator.
10. Inventory valuation is conditional on a reliable unit-cost basis.
11. Report errors and legitimate zero-data states must be distinct.
12. Drill-downs must propagate active report filters and reconcile to the displayed aggregate.
13. Sensitive exports and compensation analytics remain protected by existing trusted authorization/RLS/RBAC.

## Executive information architecture

The owner dashboard should use available desktop width and prioritize, in order:

1. Compact Business Overview header and freshness indicator.
2. Persistent date/branch/comparison filters.
3. Restrained KPI row: Collections, Billed Amount, Outstanding Receivables, Recorded Expenses, Completed Visits, New Patients.
4. Financial trend visualization.
5. Pulilan vs Plaridel comparison.
6. Appointment status/performance and no-show context.
7. Patient trends.
8. Service performance.
9. Provider activity (neutral metrics, no simplistic ranking).
10. Receivables and aging where business dates support it.
11. Expense analysis.
12. Inventory intelligence/exceptions.
13. Cash reconciliation/variance where sessions exist.
14. Operational exceptions and business-readable recent activity.

It must not become an endless wall of identical KPI cards.

## Known conditional areas

These remain conditional until the underlying data or clinic policy is reliable/confirmed:

- formal recognized revenue;
- provider utilization;
- inventory monetary valuation;
- historical receivable as-of balances;
- new-vs-returning classification for incomplete historical visit data;
- provider compensation visibility;
- clinic-wide expense presentation;
- formal no-show/completion denominator policy.

## Verification required before Part 33 is considered complete

- Reconcile invoice, payment, refund and outstanding-balance fixtures manually.
- Reconcile direct and inventory-linked expenses with no double count.
- Verify Pulilan + Plaridel + legitimate clinic-wide/unmapped handling against All Branches.
- Reconcile provider totals to underlying visits/treatments.
- Verify unauthorized roles cannot access management-only reporting/export paths.
- Verify report query failure renders an error/retry state, not a fake zero.
- Verify management-facing labels no longer call invoice totals `Revenue` or collections-minus-expenses `Net Profit`/ambiguous operating profit.
- Run only scripts that actually exist in `package.json`, including `npm run build` and `npm run lint`. There is currently no repository `test` or `typecheck` script separate from the TypeScript work performed by `npm run build`; do not invent them.
