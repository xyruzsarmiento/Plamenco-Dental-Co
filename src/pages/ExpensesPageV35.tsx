import { useMemo } from 'react'
import { PremiumBarChartV35, PremiumLineChartV35 } from '../components/ui/PremiumInteractiveChartV35'
import { buildEnterpriseReportSnapshot, formatReportCurrency } from '../features/reports/reportStore'
import { ExpensesPageV23 } from './ExpensesPageV23'

export function ExpensesPageV35() {
  const snapshot = useMemo(() => buildEnterpriseReportSnapshot({ filters: { preset: 'this_year' } }), [])
  const categoryRows = snapshot.expenses.byCategory.slice(0, 8)
  const vendorRows = snapshot.expenses.byVendor.slice(0, 8)

  return <section className="expenses35-shell">
    <ExpensesPageV23 />

    <section className="analytics35-section-head expenses35-insights-head">
      <div><span>Expense intelligence</span><h2>Cost insights</h2><p>Analytics support the expense ledger instead of pushing operational controls below the fold.</p></div>
    </section>
    <div className="analytics35-grid expenses35-analytics">
      <section className="analytics35-card expenses35-trend-card"><header><span>Cost trend</span><h3>Operating cost trend</h3><p>Recorded operating expenses across the current year. Hover a point to inspect the exact amount.</p></header><PremiumLineChartV35 labels={snapshot.trend.map((row) => row.label)} series={[{ key: 'expenses', label: 'Expenses', values: snapshot.trend.map((row) => row.expensesCents), formatter: formatReportCurrency }]} ariaLabel="Operating expenses trend" /></section>
      <section className="analytics35-card"><header><span>Cost mix</span><h3>Expenses by category</h3><p>{formatReportCurrency(snapshot.expenses.recordedExpensesCents)} recorded operating costs.</p></header><PremiumBarChartV35 rows={categoryRows.map((row) => ({ label: row.categoryName, value: row.totalCents, meta: `${row.count} record${row.count === 1 ? '' : 's'}` }))} valueLabel="Spend" formatter={formatReportCurrency} ariaLabel="Expenses by category" /></section>
      <section className="analytics35-card"><header><span>Vendor exposure</span><h3>Top payees / vendors</h3><p>{formatReportCurrency(snapshot.expenses.outstandingPayablesCents)} outstanding payables.</p></header><PremiumBarChartV35 rows={vendorRows.map((row) => ({ label: row.vendorName, value: row.totalCents, meta: `${row.count} expense${row.count === 1 ? '' : 's'}` }))} valueLabel="Spend" formatter={formatReportCurrency} ariaLabel="Expenses by vendor" /></section>
    </div>
  </section>
}
