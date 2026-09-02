import { getStoredBranches } from '../branches/branchStore'
import { getExpenseCategories, type Expense, type ExpensePayment } from './expenseStore'

type ExpenseExportPayload = {
  expenses: Expense[]
  payments: ExpensePayment[]
  trend: Array<{ date: string; expensesCents: number }>
  range: { start: string; end: string; label: string }
  scopeLabel: string
  filterLabel?: string
  source: 'supabase' | 'local'
}

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

function money(cents: number) {
  return peso.format(cents / 100)
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function niceDate(value?: string) {
  if (!value) return 'Not set'
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00+08:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
}

function branchName(id?: string) {
  if (!id) return 'Clinic-wide'
  return getStoredBranches().find((branch) => branch.id === id)?.name ?? id
}

function categoryName(id: string) {
  return getExpenseCategories().find((category) => category.id === id)?.name ?? id
}

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'expenses'
}

function activeExpenses(expenses: Expense[]) {
  return expenses.filter((expense) => expense.status !== 'void' && expense.status !== 'cancelled')
}

function totals(payload: ExpenseExportPayload) {
  const active = activeExpenses(payload.expenses)
  return {
    recordedCents: active.reduce((sum, expense) => sum + expense.totalCents, 0),
    paidCents: payload.payments.reduce((sum, payment) => sum + payment.amountCents, 0),
    outstandingCents: active.reduce((sum, expense) => sum + expense.balanceCents, 0),
    recordCount: payload.expenses.length,
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function reportStyles() {
  return `
    body{margin:0;background:#f4f8ff;color:#111827;font-family:Inter,Arial,sans-serif}
    .report{max-width:1120px;margin:0 auto;padding:34px}
    .hero{padding:28px;border-radius:24px;background:linear-gradient(135deg,#1d4ed8,#2563eb 56%,#60a5fa);color:#fff}
    .hero small{font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.78}
    .hero h1{margin:8px 0 8px;font-size:34px;line-height:1.05}
    .hero p{margin:0;opacity:.86}
    .meta{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}
    .card{padding:16px;border:1px solid #dbeafe;border-radius:18px;background:#fff;box-shadow:0 10px 26px rgba(15,23,42,.05)}
    .card span{display:block;color:#64748b;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    .card strong{display:block;margin-top:8px;font-size:22px}
    h2{margin:24px 0 10px;font-size:18px}
    table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid #dbeafe;border-radius:18px;overflow:hidden}
    th{background:#eff6ff;color:#1d4ed8;font-size:11px;letter-spacing:.08em;text-transform:uppercase;text-align:left}
    th,td{padding:11px 12px;border-bottom:1px solid #eef2f7;font-size:12px;vertical-align:top}
    tr:last-child td{border-bottom:0}
    .money{text-align:right;font-weight:800}
    .status{display:inline-block;padding:5px 8px;border-radius:999px;background:#eef2ff;color:#1d4ed8;font-weight:800}
    .foot{margin-top:22px;color:#64748b;font-size:11px}
    @media print{body{background:#fff}.report{padding:18px}.hero,.card,table{box-shadow:none}button{display:none}}
    @media(max-width:760px){.report{padding:18px}.meta{grid-template-columns:1fr 1fr}.hero h1{font-size:28px}}
    @media(max-width:460px){.meta{grid-template-columns:1fr}}
  `
}

function reportHtml(payload: ExpenseExportPayload, format: 'print' | 'excel') {
  const summary = totals(payload)
  const generatedAt = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
  const expenses = payload.expenses
  const payments = payload.payments
  const trend = payload.trend
  return `<!doctype html><html><head><meta charset="utf-8"><title>Expenses Report</title><style>${reportStyles()}</style></head><body>
    <main class="report">
      <section class="hero">
        <small>Plamenco Dental Co. - Expense Operations</small>
        <h1>Expenses Report</h1>
        <p>${escapeHtml(payload.scopeLabel)} - ${escapeHtml(payload.range.label)} - ${escapeHtml(niceDate(payload.range.start))} to ${escapeHtml(niceDate(payload.range.end))}${payload.filterLabel ? ` - Filter: ${escapeHtml(payload.filterLabel)}` : ''}</p>
      </section>
      <section class="meta">
        <article class="card"><span>Recorded expenses</span><strong>${escapeHtml(money(summary.recordedCents))}</strong></article>
        <article class="card"><span>Expense payments</span><strong>${escapeHtml(money(summary.paidCents))}</strong></article>
        <article class="card"><span>Outstanding</span><strong>${escapeHtml(money(summary.outstandingCents))}</strong></article>
        <article class="card"><span>Records</span><strong>${summary.recordCount}</strong></article>
      </section>
      <h2>Expense Ledger</h2>
      <table><thead><tr><th>Expense #</th><th>Description</th><th>Payee</th><th>Branch</th><th>Category</th><th>Date</th><th>Status</th><th class="money">Total</th><th class="money">Paid</th><th class="money">Balance</th></tr></thead><tbody>
        ${expenses.map((expense) => `<tr><td>${escapeHtml(expense.expenseNumber)}</td><td>${escapeHtml(expense.description)}</td><td>${escapeHtml(expense.payeeName)}</td><td>${escapeHtml(branchName(expense.branchId))}</td><td>${escapeHtml(categoryName(expense.categoryId))}</td><td>${escapeHtml(niceDate(expense.expenseDate))}</td><td><span class="status">${escapeHtml(expense.status.replaceAll('_', ' '))}</span></td><td class="money">${escapeHtml(money(expense.totalCents))}</td><td class="money">${escapeHtml(money(expense.amountPaidCents))}</td><td class="money">${escapeHtml(money(expense.balanceCents))}</td></tr>`).join('') || '<tr><td colspan="10">No expenses in this period.</td></tr>'}
      </tbody></table>
      <h2>Expense Payments</h2>
      <table><thead><tr><th>Date</th><th>Expense #</th><th>Method</th><th>Reference</th><th>Recorded by</th><th class="money">Amount</th></tr></thead><tbody>
        ${payments.map((payment) => {
          const expense = expenses.find((item) => item.id === payment.expenseId)
          return `<tr><td>${escapeHtml(niceDate(payment.paymentDate))}</td><td>${escapeHtml(expense?.expenseNumber ?? payment.expenseId)}</td><td>${escapeHtml(payment.paymentMethod.replaceAll('_', ' '))}</td><td>${escapeHtml(payment.referenceNumber ?? 'Not recorded')}</td><td>${escapeHtml(payment.paidBy)}</td><td class="money">${escapeHtml(money(payment.amountCents))}</td></tr>`
        }).join('') || '<tr><td colspan="6">No payments in this period.</td></tr>'}
      </tbody></table>
      <h2>Cost Trend</h2>
      <table><thead><tr><th>Period</th><th class="money">Expenses</th></tr></thead><tbody>
        ${trend.map((row) => `<tr><td>${escapeHtml(niceDate(row.date))}</td><td class="money">${escapeHtml(money(row.expensesCents))}</td></tr>`).join('') || '<tr><td colspan="2">No trend rows available.</td></tr>'}
      </tbody></table>
      <p class="foot">Generated ${escapeHtml(generatedAt)} from ${payload.source === 'supabase' ? 'persisted Supabase records' : 'local fallback records'}.${format === 'print' ? ' Use Save as PDF in the print dialog.' : ''}</p>
    </main>
  </body></html>`
}

export function exportExpensesExcel(payload: ExpenseExportPayload) {
  const html = reportHtml(payload, 'excel')
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' })
  downloadBlob(blob, `plamenco-expenses-${safeFileName(payload.scopeLabel)}-${payload.range.start}-to-${payload.range.end}.xls`)
}

export function exportExpensesPdf(payload: ExpenseExportPayload) {
  const popup = window.open('', '_blank', 'width=1180,height=820')
  if (!popup) {
    const blob = new Blob([reportHtml(payload, 'print')], { type: 'text/html;charset=utf-8' })
    downloadBlob(blob, `plamenco-expenses-${safeFileName(payload.scopeLabel)}-${payload.range.start}-to-${payload.range.end}-print.html`)
    return
  }
  popup.document.open()
  popup.document.write(reportHtml(payload, 'print'))
  popup.document.close()
  popup.focus()
  window.setTimeout(() => popup.print(), 350)
}
