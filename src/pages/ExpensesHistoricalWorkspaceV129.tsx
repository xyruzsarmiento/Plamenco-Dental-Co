import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CalendarRange, Clock3, FileDown, FileSpreadsheet, ReceiptText } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { SkeletonCard, SkeletonText } from '../components/ui/DesignSystem'
import { useAuth } from '../features/auth/AuthContext'
import { useBranchContext } from '../features/branches/BranchContext'
import { exportExpensesExcel, exportExpensesPdf } from '../features/expenses/expenseExports'
import { fetchExpenseHistory, type ExpenseHistoryData, type ExpenseHistoryScope } from '../features/expenses/expenseHistory'
import { ExpensesBranchWorkspaceV122 } from './ExpensesBranchWorkspaceV122'
import '../styles/expense-historical-analytics-part2.css'

type RangeKey = 'today' | 'yesterday' | 'this_week' | 'last_7_days' | 'this_month' | 'last_month' | 'last_3_months' | 'this_quarter' | 'this_year' | 'last_year' | 'custom'

const presets: Array<{ value: RangeKey; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'custom', label: 'Custom' },
]

function todayManila() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function toIso(date: Date) {
  return date.toISOString().slice(0, 10)
}

function dateFromIso(value: string) {
  return new Date(`${value}T00:00:00+08:00`)
}

function addDays(value: string, days: number) {
  const date = dateFromIso(value)
  date.setDate(date.getDate() + days)
  return toIso(date)
}

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`
}

function monthEnd(year: number, monthIndex: number) {
  return toIso(new Date(year, monthIndex + 1, 0))
}

function rangeFor(key: RangeKey) {
  const base = todayManila()
  const date = dateFromIso(base)
  const year = date.getFullYear()
  const month = date.getMonth()
  const day = date.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  if (key === 'today') return { start: base, end: base }
  if (key === 'yesterday') { const previous = addDays(base, -1); return { start: previous, end: previous } }
  if (key === 'this_week') return { start: addDays(base, mondayOffset), end: base }
  if (key === 'last_7_days') return { start: addDays(base, -6), end: base }
  if (key === 'this_month') return { start: monthStart(base), end: base }
  if (key === 'last_month') return { start: toIso(new Date(year, month - 1, 1)), end: monthEnd(year, month - 1) }
  if (key === 'last_3_months') return { start: toIso(new Date(year, month - 2, 1)), end: base }
  if (key === 'this_quarter') { const startMonth = Math.floor(month / 3) * 3; return { start: toIso(new Date(year, startMonth, 1)), end: base } }
  if (key === 'this_year') return { start: `${year}-01-01`, end: base }
  if (key === 'last_year') return { start: `${year - 1}-01-01`, end: `${year - 1}-12-31` }
  return { start: monthStart(base), end: base }
}

function labelize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function niceDate(value: string) {
  const date = dateFromIso(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
}

function monthLabel(value: string) {
  const date = dateFromIso(monthStart(value))
  return date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'long', year: 'numeric' })
}

function shiftMonth(value: string, delta: number) {
  const date = dateFromIso(monthStart(value))
  date.setMonth(date.getMonth() + delta, 1)
  const start = toIso(date)
  return { start, end: monthEnd(date.getFullYear(), date.getMonth()) }
}

function isReasonableRange(start: string, end: string) {
  const startTime = dateFromIso(start).getTime()
  const endTime = dateFromIso(end).getTime()
  return Number.isFinite(startTime) && Number.isFinite(endTime) && endTime >= startTime && (endTime - startTime) / 86_400_000 <= 731
}

function ExpenseHistoryLoading() {
  return <section className="ex129-history" aria-busy="true" aria-label="Loading expense history controls">
    <SkeletonCard compact><SkeletonText lines={3} widths={['30%', '46%', '60%']} /></SkeletonCard>
  </section>
}

export function ExpensesHistoricalWorkspaceV129() {
  const { user } = useAuth()
  const { activeBranch, activeBranchId, authorizedBranchIds, isAllBranchesMode } = useBranchContext()
  const [params, setParams] = useSearchParams()
  const initialPreset = (params.get('period') as RangeKey | null) ?? 'this_month'
  const initialRange = params.get('from') && params.get('to') ? { start: params.get('from')!, end: params.get('to')! } : rangeFor(initialPreset)
  const [period, setPeriod] = useState<RangeKey>(presets.some((preset) => preset.value === initialPreset) ? initialPreset : 'this_month')
  const [start, setStart] = useState(initialRange.start)
  const [end, setEnd] = useState(initialRange.end)
  const [data, setData] = useState<ExpenseHistoryData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const canShowHistory = user?.role === 'super_admin' || (user?.role === 'staff' && !isAllBranchesMode && Boolean(activeBranchId))
  const scopeLabel = isAllBranchesMode ? 'All authorized branches + clinic-wide' : activeBranch?.name ?? 'Assigned branch'
  const scope = useMemo<ExpenseHistoryScope | null>(() => {
    if (!canShowHistory) return null
    if (isAllBranchesMode && user?.role === 'super_admin') return { mode: 'all', authorizedBranchIds }
    if (activeBranchId) return { mode: 'branch', branchId: activeBranchId }
    return null
  }, [activeBranchId, authorizedBranchIds, canShowHistory, isAllBranchesMode, user?.role])
  const rangeInvalid = !start || !end || !isReasonableRange(start, end)
  const selectedLabel = period === 'custom' ? 'Custom Range' : labelize(period)
  const paymentTotal = data?.payments.reduce((sum, payment) => sum + payment.amountCents, 0) ?? 0
  const expenseTotal = data?.expenses.filter((expense) => expense.status !== 'void' && expense.status !== 'cancelled').reduce((sum, expense) => sum + expense.totalCents, 0) ?? 0
  const outstandingTotal = data?.expenses.filter((expense) => expense.status !== 'void' && expense.status !== 'cancelled').reduce((sum, expense) => sum + expense.balanceCents, 0) ?? 0
  const exportReady = Boolean(data && !loading && !rangeInvalid)

  useEffect(() => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set('period', period)
      next.set('from', start)
      next.set('to', end)
      return next
    }, { replace: true })
  }, [end, period, setParams, start])

  useEffect(() => {
    if (!scope || rangeInvalid) return
    let active = true
    setLoading(true)
    setError(null)
    void fetchExpenseHistory(start, end, scope)
      .then((next) => { if (active) setData(next) })
      .catch((cause) => { if (active) { setError(cause instanceof Error ? cause.message : 'Unable to load historical expenses.'); setData(null) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [end, rangeInvalid, scope, start])

  function choose(value: RangeKey) {
    setPeriod(value)
    if (value === 'custom') return
    const next = rangeFor(value)
    setStart(next.start)
    setEnd(next.end)
  }

  function moveMonth(delta: number) {
    const next = shiftMonth(start, delta)
    const today = todayManila()
    setPeriod('custom')
    setStart(next.start)
    setEnd(next.end > today ? today : next.end)
  }

  function exportPayload() {
    if (!data) return null
    return {
      expenses: data.expenses,
      payments: data.payments,
      trend: data.trend,
      range: { start, end, label: selectedLabel },
      scopeLabel,
      source: data.source,
    }
  }

  function handleExportExcel() {
    const payload = exportPayload()
    if (payload) exportExpensesExcel(payload)
  }

  function handleExportPdf() {
    const payload = exportPayload()
    if (payload) exportExpensesPdf(payload)
  }

  if (!canShowHistory) return <ExpensesBranchWorkspaceV122 />

  const historyPanel = !scope ? <ExpenseHistoryLoading /> : <section className="ex129-history ex129-history-premium" aria-label="Expense reporting controls">
      <header className="ex129-history-head">
        <div className="ex129-title"><span className="ex129-icon"><CalendarRange size={20} /></span><div><p className="ex129-eyebrow">Expense reporting</p><h2>Expenses</h2><p>Pick a month or custom range, then export a designed report from persisted Supabase records.</p></div></div>
        <div className="ex129-export-actions">
          <Button variant="secondary" size="sm" icon={<FileSpreadsheet size={14}/>} onClick={handleExportExcel} disabled={!exportReady}>Excel</Button>
          <Button variant="secondary" size="sm" icon={<FileDown size={14}/>} onClick={handleExportPdf} disabled={!exportReady}>PDF</Button>
        </div>
      </header>
      <div className="ex129-controls" aria-label="Expense period filters">
        <label><span>Period</span><select value={period} onChange={(event) => choose(event.target.value as RangeKey)}>{presets.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</select></label>
        <label><span>Month</span><input type="month" value={start.slice(0, 7)} onChange={(event) => { const date = dateFromIso(`${event.target.value}-01`); setPeriod('custom'); setStart(toIso(date)); setEnd(monthEnd(date.getFullYear(), date.getMonth())) }} /></label>
        <label><span>From</span><input type="date" value={start} onChange={(event) => { setPeriod('custom'); setStart(event.target.value) }} /></label>
        <label><span>To</span><input type="date" value={end} onChange={(event) => { setPeriod('custom'); setEnd(event.target.value) }} /></label>
        <div className="ex129-range-note"><Clock3 size={15} /><span>{selectedLabel} · {niceDate(start)} to {niceDate(end)}</span></div>
      </div>
      <div className="ex129-report-strip">
      <div className="ex129-month-nav" aria-label="Expense month navigation">
        <Button variant="secondary" size="sm" icon={<ArrowLeft size={14}/>} onClick={() => moveMonth(-1)}>Previous Month</Button>
        <strong>{monthLabel(start)}</strong>
        <Button variant="secondary" size="sm" icon={<ArrowRight size={14}/>} onClick={() => moveMonth(1)} disabled={monthStart(start) >= monthStart(todayManila())}>Next Month</Button>
      </div>
        <div className="ex129-scope"><CalendarRange size={16} /><span>{scopeLabel}</span></div>
      </div>
      {rangeInvalid && <div className="inline-alert warning" role="alert">Choose a valid date range up to 24 months, with From on or before To.</div>}
      {error && <div className="inline-alert warning" role="alert">{error}</div>}
      <div className="ex129-period-summary">
        <article><ReceiptText size={16}/><span>Recorded expenses</span><strong>{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(expenseTotal / 100)}</strong><small>Expense date in period</small></article>
        <article><ReceiptText size={16}/><span>Expense payments</span><strong>{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(paymentTotal / 100)}</strong><small>Payment date in period</small></article>
        <article><ReceiptText size={16}/><span>Open balance</span><strong>{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(outstandingTotal / 100)}</strong><small>Outstanding active expenses</small></article>
      </div>
    </section>

  return <div className="page-stack expenses-ia-shell">
    {historyPanel}
    <ExpensesBranchWorkspaceV122 historicalData={data} historicalRange={{ start, end, label: selectedLabel }} historicalLoading={loading} />
  </div>
}
