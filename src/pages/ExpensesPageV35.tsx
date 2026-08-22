import { useMemo } from 'react'
import { ExpenseRankedBarsV56 } from '../components/ui/ExpenseAnalyticsV56'
import { ExpenseTrendV73 } from '../components/ui/ExpenseTrendV73'
import { getExpenses } from '../features/expenses/expenseStore'
import { buildEnterpriseReportSnapshot, formatReportCurrency } from '../features/reports/reportStore'
import { ExpensesPageV23 } from './ExpensesPageV23'

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function manilaYear() {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric' }).format(new Date()))
}

export function ExpensesPageV35() {
  const snapshot = useMemo(() => buildEnterpriseReportSnapshot({ filters: { preset: 'this_year' } }), [])
  const categoryRows = snapshot.expenses.byCategory.slice(0, 8)
  const vendorRows = snapshot.expenses.byVendor.slice(0, 8)
  const categoryTotal = categoryRows.reduce((sum, row) => sum + row.totalCents, 0)
  const vendorTotal = vendorRows.reduce((sum, row) => sum + row.totalCents, 0)

  const monthlyTrend = useMemo(() => {
    const year = manilaYear()
    const totals = Array.from({ length: 12 }, () => 0)
    for (const expense of getExpenses()) {
      if (expense.status === 'void' || expense.status === 'cancelled') continue
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(expense.expenseDate || '')
      if (!match || Number(match[1]) !== year) continue
      const month = Number(match[2]) - 1
      if (month >= 0 && month < 12) totals[month] += expense.totalCents
    }
    return monthLabels.map((label, index) => ({ label, value: totals[index] }))
  }, [])

  return <section className="expenses35-shell">
    <ExpensesPageV23 />

    <section className="analytics35-section-head expenses35-insights-head">
      <div><span>Expense intelligence</span><h2>Cost insights</h2><p>Analytics support the expense ledger instead of pushing operational controls below the fold.</p></div>
    </section>
    <div className="analytics35-grid expenses35-analytics expenses56-analytics">
      <section className="analytics35-card analytics35-wide expenses35-trend-card expenses68-trend-card"><header><div><span>Cost trend</span><h3>Operating cost trend</h3><p>Monthly recorded operating expenses for the current clinic year. Hover or keyboard-focus a month to inspect the exact amount.</p></div></header><ExpenseTrendV73 rows={monthlyTrend} formatter={formatReportCurrency} /></section>
      <section className="analytics35-card expenses56-card"><header><span>Cost mix</span><h3>Expenses by category</h3><p>Where recorded operating costs are concentrated across clinic expense categories.</p></header><ExpenseRankedBarsV56 rows={categoryRows.map((row) => ({ label: row.categoryName, value: row.totalCents, displayValue: formatReportCurrency(row.totalCents), meta: `${row.count} record${row.count === 1 ? '' : 's'}` }))} valueLabel="Spend" totalLabel="Categorized spend" totalDisplay={formatReportCurrency(categoryTotal)} secondaryLabel="Largest category" emptyLabel="No categorized expense activity has been recorded for this period." ariaLabel="Expenses by category" /></section>
      <section className="analytics35-card expenses56-card"><header><span>Vendor exposure</span><h3>Top payees / vendors</h3><p>Recorded spend ranked by vendor or payee to make concentration and exposure easier to review.</p></header><ExpenseRankedBarsV56 rows={vendorRows.map((row) => ({ label: row.vendorName, value: row.totalCents, displayValue: formatReportCurrency(row.totalCents), meta: `${row.count} expense${row.count === 1 ? '' : 's'}` }))} valueLabel="Spend" totalLabel="Vendor-linked spend" totalDisplay={formatReportCurrency(vendorTotal)} secondaryLabel="Top payee / vendor" emptyLabel="No vendor or payee spending has been recorded for this period." ariaLabel="Expenses by vendor" /></section>
    </div>
  </section>
}
