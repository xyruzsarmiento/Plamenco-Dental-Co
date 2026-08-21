import { useMemo } from 'react'
import { ExpenseRankedBarsV56 } from '../components/ui/ExpenseAnalyticsV56'
import { ExpenseTrendV57 } from '../components/ui/ExpenseTrendV57'
import { buildEnterpriseReportSnapshot, formatReportCurrency } from '../features/reports/reportStore'
import { ExpensesPageV23 } from './ExpensesPageV23'

export function ExpensesPageV35() {
  const snapshot = useMemo(() => buildEnterpriseReportSnapshot({ filters: { preset: 'this_year' } }), [])
  const categoryRows = snapshot.expenses.byCategory.slice(0, 8)
  const vendorRows = snapshot.expenses.byVendor.slice(0, 8)
  const categoryTotal = categoryRows.reduce((sum, row) => sum + row.totalCents, 0)
  const vendorTotal = vendorRows.reduce((sum, row) => sum + row.totalCents, 0)

  return <section className="expenses35-shell">
    <ExpensesPageV23 />

    <section className="analytics35-section-head expenses35-insights-head">
      <div><span>Expense intelligence</span><h2>Cost insights</h2><p>Analytics support the expense ledger instead of pushing operational controls below the fold.</p></div>
    </section>
    <div className="analytics35-grid expenses35-analytics expenses56-analytics">
      <section className="analytics35-card expenses35-trend-card expenses57-trend-card"><header><span>Cost trend</span><h3>Operating cost trend</h3><p>Recorded operating expenses across the current year. Hover or keyboard-focus any point to inspect the exact period and amount.</p></header><ExpenseTrendV57 rows={snapshot.trend.map((row) => ({ label: row.label, value: row.expensesCents }))} formatter={formatReportCurrency} /></section>
      <section className="analytics35-card expenses56-card"><header><span>Cost mix</span><h3>Expenses by category</h3><p>Where recorded operating costs are concentrated across clinic expense categories.</p></header><ExpenseRankedBarsV56 rows={categoryRows.map((row) => ({ label: row.categoryName, value: row.totalCents, displayValue: formatReportCurrency(row.totalCents), meta: `${row.count} record${row.count === 1 ? '' : 's'}` }))} valueLabel="Spend" totalLabel="Categorized spend" totalDisplay={formatReportCurrency(categoryTotal)} secondaryLabel="Largest category" emptyLabel="No categorized expense activity has been recorded for this period." ariaLabel="Expenses by category" /></section>
      <section className="analytics35-card expenses56-card"><header><span>Vendor exposure</span><h3>Top payees / vendors</h3><p>Recorded spend ranked by vendor or payee to make concentration and exposure easier to review.</p></header><ExpenseRankedBarsV56 rows={vendorRows.map((row) => ({ label: row.vendorName, value: row.totalCents, displayValue: formatReportCurrency(row.totalCents), meta: `${row.count} expense${row.count === 1 ? '' : 's'}` }))} valueLabel="Spend" totalLabel="Vendor-linked spend" totalDisplay={formatReportCurrency(vendorTotal)} secondaryLabel="Top payee / vendor" emptyLabel="No vendor or payee spending has been recorded for this period." ariaLabel="Expenses by vendor" /></section>
    </div>
  </section>
}
