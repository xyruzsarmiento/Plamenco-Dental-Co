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
- receivable aging when due-date semantics are incomplete;
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
- Run only scripts that actually exist in `package.json`, including `npm run build` and lint/test/typecheck where present.
