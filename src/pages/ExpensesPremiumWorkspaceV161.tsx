import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileSpreadsheet,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Search,
  Store,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Pagination } from '../components/ui/DesignSystem'
import { useAuth } from '../features/auth/AuthContext'
import { usePermissions } from '../features/auth/permissions'
import { useBranchContext } from '../features/branches/BranchContext'
import { BranchScopedExpenseActionModal, type BranchScopedExpenseDialog } from '../features/expenses/BranchScopedExpenseActionModal'
import { ExpenseRecordModal } from '../features/expenses/ExpenseRecordModal'
import { exportExpensesExcel, exportExpensesPdf } from '../features/expenses/expenseExports'
import { hydrateExpenseWorkspaceFromSupabase } from '../features/expenses/expensePersistence'
import { clearModalScrollLocks } from '../lib/modalScrollLock'
import {
  formatExpenseCurrency,
  getExpenseCategories,
  getExpenseDueStatus,
  getExpensePayments,
  getExpenses,
  getExpenseVendors,
  type Expense,
  type ExpensePayment,
  type ExpenseStatus,
} from '../features/expenses/expenseStore'

type PeriodKey = 'this_month' | 'last_month' | 'last_7_days' | 'last_30_days' | 'last_3_months' | 'this_year' | 'custom'
type LedgerFilter = 'all' | 'open' | 'overdue' | 'due_soon' | 'paid' | 'payments' | 'attention' | 'void'
type ChartMode = 'day' | 'week' | 'month'

const PAGE_SIZE = 8
const presets: Array<{ value: PeriodKey; label: string }> = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom' },
]

const statusOptions: Array<{ value: LedgerFilter; label: string }> = [
  { value: 'all', label: 'All in period' },
  { value: 'payments', label: 'Payments in period' },
  { value: 'open', label: 'Open' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'due_soon', label: 'Due soon' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Voided' },
]

function todayManila() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function fromIso(value: string) {
  return new Date(`${value}T00:00:00+08:00`)
}

function toIso(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function addDays(value: string, days: number) {
  const date = fromIso(value)
  date.setDate(date.getDate() + days)
  return toIso(date)
}

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`
}

function monthEnd(year: number, monthIndex: number) {
  return toIso(new Date(year, monthIndex + 1, 0, 12))
}

function rangeFor(key: PeriodKey, fallbackStart = todayManila(), fallbackEnd = todayManila()) {
  const today = todayManila()
  const date = fromIso(today)
  const year = date.getFullYear()
  const month = date.getMonth()
  if (key === 'this_month') return { start: monthStart(today), end: today }
  if (key === 'last_month') return { start: toIso(new Date(year, month - 1, 1, 12)), end: monthEnd(year, month - 1) }
  if (key === 'last_7_days') return { start: addDays(today, -6), end: today }
  if (key === 'last_30_days') return { start: addDays(today, -29), end: today }
  if (key === 'last_3_months') return { start: toIso(new Date(year, month - 2, 1, 12)), end: today }
  if (key === 'this_year') return { start: `${year}-01-01`, end: today }
  return { start: fallbackStart, end: fallbackEnd }
}

function niceDate(value?: string) {
  if (!value) return '—'
  const date = fromIso(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
}

function statusLabel(status: ExpenseStatus) {
  return status.replaceAll('_', ' ')
}

function mondayOf(value: string) {
  const date = fromIso(value)
  const day = date.getDay()
  const offset = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + offset)
  return toIso(date)
}

type TrendPoint = { key: string; label: string; shortLabel: string; recordedCents: number; paidCents: number }

function chartModeFor(start: string, end: string): ChartMode {
  const days = Math.round((fromIso(end).getTime() - fromIso(start).getTime()) / 86_400_000) + 1
  if (days > 92) return 'month'
  if (days > 31) return 'week'
  return 'day'
}

function buildTrendPoints(expenses: Expense[], payments: ExpensePayment[], start: string, end: string, mode: ChartMode): TrendPoint[] {
  const map = new Map<string, TrendPoint>()
  const cursor = fromIso(start)
  const last = fromIso(end)
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime()) || cursor > last) return []

  if (mode === 'month') {
    const monthCursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const lastMonth = new Date(last.getFullYear(), last.getMonth(), 1)
    while (monthCursor <= lastMonth) {
      const key = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, '0')}`
      map.set(key, {
        key,
        label: monthCursor.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }),
        shortLabel: monthCursor.toLocaleDateString('en-PH', { month: 'short' }),
        recordedCents: 0,
        paidCents: 0,
      })
      monthCursor.setMonth(monthCursor.getMonth() + 1)
    }
  } else if (mode === 'week') {
    let key = mondayOf(start)
    const limit = mondayOf(end)
    while (key <= limit) {
      const date = fromIso(key)
      map.set(key, {
        key,
        label: `Week of ${niceDate(key)}`,
        shortLabel: date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
        recordedCents: 0,
        paidCents: 0,
      })
      key = addDays(key, 7)
    }
  } else {
    let key = start
    while (key <= end) {
      const date = fromIso(key)
      map.set(key, {
        key,
        label: niceDate(key),
        shortLabel: String(date.getDate()),
        recordedCents: 0,
        paidCents: 0,
      })
      key = addDays(key, 1)
    }
  }

  const bucket = (value: string) => {
    if (mode === 'month') return value.slice(0, 7)
    if (mode === 'week') return mondayOf(value)
    return value
  }

  for (const expense of expenses) {
    if (expense.status === 'void' || expense.status === 'cancelled') continue
    if (expense.expenseDate < start || expense.expenseDate > end) continue
    const point = map.get(bucket(expense.expenseDate))
    if (point) point.recordedCents += expense.totalCents
  }
  for (const payment of payments) {
    if (payment.paymentDate < start || payment.paymentDate > end) continue
    const point = map.get(bucket(payment.paymentDate))
    if (point) point.paidCents += payment.amountCents
  }

  return [...map.values()]
}

function ExpenseTrendChart({ points, mode }: { points: TrendPoint[]; mode: ChartMode }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const node = wrapRef.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 720)
      setWidth(Math.max(280, next))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const height = width < 520 ? 210 : 248
  const padX = width < 520 ? 12 : 18
  const padTop = 18
  const padBottom = 36
  const chartW = Math.max(1, width - padX * 2)
  const chartH = height - padTop - padBottom
  const maxValue = Math.max(1, ...points.flatMap((point) => [point.recordedCents, point.paidCents]))
  const coords = points.map((point, index) => {
    const x = points.length <= 1 ? padX + chartW / 2 : padX + (index / (points.length - 1)) * chartW
    return {
      ...point,
      x,
      recordedY: padTop + chartH - (point.recordedCents / maxValue) * chartH,
      paidY: padTop + chartH - (point.paidCents / maxValue) * chartH,
    }
  })
  const recordedPath = coords.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.recordedY.toFixed(2)}`).join(' ')
  const paidPath = coords.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.paidY.toFixed(2)}`).join(' ')
  const recordedArea = coords.length
    ? `${recordedPath} L${coords.at(-1)!.x.toFixed(2)} ${(padTop + chartH).toFixed(2)} L${coords[0].x.toFixed(2)} ${(padTop + chartH).toFixed(2)} Z`
    : ''
  const activePoint = coords.find((point) => point.key === active) ?? null
  const labelEvery = Math.max(1, Math.ceil(coords.length / (width < 640 ? 5 : mode === 'day' ? 8 : 6)))
  const title = mode === 'day' ? 'Daily recorded vs paid' : mode === 'week' ? 'Weekly recorded vs paid' : 'Monthly recorded vs paid'

  return (
    <div className="ex161-chart" ref={wrapRef}>
      <div className="ex161-chart-head">
        <div>
          <span>Spend trajectory</span>
          <h3>{title}</h3>
        </div>
        <div className="ex161-legend">
          <span><i className="is-recorded" /> Recorded</span>
          <span><i className="is-paid" /> Paid</span>
        </div>
      </div>
      {coords.length === 0 ? (
        <div className="ex161-empty compact">No expense activity in this range yet.</div>
      ) : (
        <div className="ex161-chart-frame">
          <svg viewBox={`0 0 ${width} ${height}`} className="ex161-chart-svg" role="img" aria-label={title}>
            <defs>
              <linearGradient id="ex161-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75, 1].map((step) => {
              const y = padTop + chartH - step * chartH
              return <line key={step} x1={padX} x2={width - padX} y1={y} y2={y} className="ex161-grid" />
            })}
            {recordedArea ? <path d={recordedArea} fill="url(#ex161-area)" /> : null}
            {recordedPath ? <path d={recordedPath} className="ex161-line is-recorded" /> : null}
            {paidPath ? <path d={paidPath} className="ex161-line is-paid" /> : null}
            {coords.map((point) => (
              <g key={point.key}>
                <rect
                  x={point.x - Math.max(chartW / Math.max(points.length * 2, 2), 8)}
                  y={padTop}
                  width={Math.max(chartW / Math.max(points.length, 1), 16)}
                  height={chartH}
                  className="ex161-hit"
                  onMouseEnter={() => setActive(point.key)}
                  onFocus={() => setActive(point.key)}
                  onMouseLeave={() => setActive(null)}
                />
                <circle cx={point.x} cy={point.recordedY} r={active === point.key ? 5 : 3.5} className="ex161-dot is-recorded" />
                <circle cx={point.x} cy={point.paidY} r={active === point.key ? 5 : 3.5} className="ex161-dot is-paid" />
              </g>
            ))}
            {coords.map((point, index) =>
              index % labelEvery === 0 || index === coords.length - 1 ? (
                <text key={`label-${point.key}`} x={point.x} y={height - 10} textAnchor="middle" className="ex161-axis">
                  {point.shortLabel}
                </text>
              ) : null,
            )}
          </svg>
          {activePoint ? (
            <div className="ex161-tooltip" style={{ left: `${Math.min(Math.max((activePoint.x / width) * 100, 18), 82)}%` }}>
              <strong>{activePoint.label}</strong>
              <span>Recorded {formatExpenseCurrency(activePoint.recordedCents)}</span>
              <span>Paid {formatExpenseCurrency(activePoint.paidCents)}</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export function ExpensesPremiumWorkspaceV161() {
  const { user } = useAuth()
  const permissions = usePermissions()
  const {
    activeBranch,
    activeBranchId,
    availableBranches,
    isAllBranchesMode,
    canViewAllBranches,
  } = useBranchContext()
  const [params, setParams] = useSearchParams()
  const initialPeriod = (params.get('period') as PeriodKey | null) ?? 'this_month'
  const initialRange = params.get('from') && params.get('to')
    ? { start: params.get('from')!, end: params.get('to')! }
    : rangeFor(presets.some((preset) => preset.value === initialPeriod) ? initialPeriod : 'this_month')

  const [period, setPeriod] = useState<PeriodKey>(presets.some((preset) => preset.value === initialPeriod) ? initialPeriod : 'this_month')
  const [start, setStart] = useState(initialRange.start)
  const [end, setEnd] = useState(initialRange.end)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<LedgerFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [exportOpen, setExportOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [action, setAction] = useState<BranchScopedExpenseDialog | null>(null)
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const ledgerRef = useRef<HTMLElement>(null)

  const isSuperAdmin = user?.role === 'super_admin'
  const isStaff = user?.role === 'staff'
  const canCreate = permissions.can('expenses.create')
  const canEdit = permissions.can('expenses.edit')
  const canVoid = permissions.can('expenses.void')
  const canPay = permissions.can('expenses.record_payment')
  const canExport = permissions.can('expenses.view') || permissions.can('expenses.view_costs')
  const workspaceTitle = isAllBranchesMode ? 'All branches' : activeBranch?.name ?? 'Assigned branch'
  const chartMode = chartModeFor(start, end)

  const refresh = useCallback(async (message?: string) => {
    setLoading(true)
    setError(null)
    try {
      await hydrateExpenseWorkspaceFromSupabase()
      setHydrated(true)
      setTick((value) => value + 1)
      if (message) {
        setNotice(message)
        window.setTimeout(() => setNotice(null), 3200)
      }
    } catch (cause) {
      setHydrated(false)
      setError(cause instanceof Error ? cause.message : 'Expenses could not be loaded from the clinic database.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    clearModalScrollLocks()
    document.body.classList.remove('pv3-nav-lock')
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, activeBranchId, isAllBranchesMode, user?.id])

  useEffect(() => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set('period', period)
      next.set('from', start)
      next.set('to', end)
      return next
    }, { replace: true })
  }, [end, period, setParams, start])

  const allExpenses = useMemo(() => {
    void tick
    return hydrated ? getExpenses() : []
  }, [hydrated, tick])
  const allPayments = useMemo(() => {
    void tick
    return hydrated ? getExpensePayments() : []
  }, [hydrated, tick])
  const categories = useMemo(() => {
    void tick
    return getExpenseCategories().filter((category) => category.status === 'active')
  }, [tick])
  const vendors = useMemo(() => {
    void tick
    return getExpenseVendors().filter((vendor) => vendor.status === 'active')
  }, [tick])

  const scopedExpenses = useMemo(() => {
    if (isAllBranchesMode && canViewAllBranches) return allExpenses
    if (!activeBranchId) return []
    return allExpenses.filter((expense) => expense.scope === 'branch' && expense.branchId === activeBranchId)
  }, [activeBranchId, allExpenses, canViewAllBranches, isAllBranchesMode])

  const scopedPayments = useMemo(() => {
    const ids = new Set(scopedExpenses.map((expense) => expense.id))
    return allPayments.filter((payment) => ids.has(payment.expenseId))
  }, [allPayments, scopedExpenses])

  const periodExpenses = useMemo(
    () => scopedExpenses.filter((expense) => expense.status !== 'void' && expense.status !== 'cancelled' && expense.expenseDate >= start && expense.expenseDate <= end),
    [end, scopedExpenses, start],
  )
  const periodPayments = useMemo(
    () => scopedPayments.filter((payment) => payment.paymentDate >= start && payment.paymentDate <= end),
    [end, scopedPayments, start],
  )
  const openExpenses = useMemo(
    () => scopedExpenses.filter((expense) => expense.status !== 'void' && expense.status !== 'cancelled' && expense.balanceCents > 0),
    [scopedExpenses],
  )
  const recordedCents = periodExpenses.reduce((sum, expense) => sum + expense.totalCents, 0)
  const paidCents = periodPayments.reduce((sum, payment) => sum + payment.amountCents, 0)
  const openCents = openExpenses.reduce((sum, expense) => sum + expense.balanceCents, 0)
  const overdueCount = openExpenses.filter((expense) => getExpenseDueStatus(expense) === 'overdue').length
  const dueSoonCount = openExpenses.filter((expense) => getExpenseDueStatus(expense) === 'due_soon').length
  const trendPoints = useMemo(
    () => buildTrendPoints(scopedExpenses, scopedPayments, start, end, chartMode),
    [chartMode, end, scopedExpenses, scopedPayments, start],
  )
  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, number>()
    for (const expense of periodExpenses) totals.set(expense.categoryId, (totals.get(expense.categoryId) ?? 0) + expense.totalCents)
    return [...totals.entries()]
      .map(([id, totalCents]) => ({ id, name: categories.find((category) => category.id === id)?.name ?? id, totalCents }))
      .sort((a, b) => b.totalCents - a.totalCents)
      .slice(0, 6)
  }, [categories, periodExpenses])

  const paidExpenseIds = useMemo(() => new Set(periodPayments.map((payment) => payment.expenseId)), [periodPayments])

  const filteredLedger = useMemo(() => {
    const q = query.trim().toLowerCase()
    return scopedExpenses
      .filter((expense) => {
        const inPeriod = expense.expenseDate >= start && expense.expenseDate <= end
        const due = getExpenseDueStatus(expense)
        if (statusFilter === 'all') return inPeriod
        if (statusFilter === 'payments') return paidExpenseIds.has(expense.id)
        if (statusFilter === 'open') return expense.status !== 'void' && expense.status !== 'cancelled' && expense.balanceCents > 0
        if (statusFilter === 'attention') return due === 'overdue' || due === 'due_soon'
        if (statusFilter === 'paid') return inPeriod && expense.status === 'paid'
        if (statusFilter === 'void') return inPeriod && expense.status === 'void'
        if (statusFilter === 'overdue') return due === 'overdue'
        if (statusFilter === 'due_soon') return due === 'due_soon'
        return inPeriod
      })
      .filter((expense) => categoryFilter === 'all' || expense.categoryId === categoryFilter)
      .filter((expense) => {
        if (!q) return true
        return [expense.expenseNumber, expense.payeeName, expense.description, expense.referenceNumber, categories.find((category) => category.id === expense.categoryId)?.name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      })
      .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt))
  }, [categories, categoryFilter, end, paidExpenseIds, query, scopedExpenses, start, statusFilter])

  const pageCount = Math.max(1, Math.ceil(filteredLedger.length / PAGE_SIZE))
  const pagedLedger = filteredLedger.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const selectedExpense = selectedId ? scopedExpenses.find((expense) => expense.id === selectedId) ?? null : null
  const selectedPayments = selectedExpense ? scopedPayments.filter((payment) => payment.expenseId === selectedExpense.id) : []

  useEffect(() => setPage(1), [activeBranchId, categoryFilter, end, isAllBranchesMode, query, start, statusFilter])
  useEffect(() => setPage((current) => Math.min(current, pageCount)), [pageCount])
  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setExportOpen(false)
        setMoreOpen(false)
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setExportOpen(false)
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  function choosePeriod(next: PeriodKey) {
    setPeriod(next)
    if (next === 'custom') return
    const range = rangeFor(next)
    setStart(range.start)
    setEnd(range.end)
  }

  function applyLedgerFilter(next: LedgerFilter) {
    setStatusFilter((current) => (current === next && next !== 'all' ? 'all' : next))
    setPage(1)
    window.requestAnimationFrame(() => {
      ledgerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function applyCategoryFilter(next: string) {
    setCategoryFilter((current) => (current === next ? 'all' : next))
    setPage(1)
    window.requestAnimationFrame(() => {
      ledgerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const periodLabel = period === 'custom' ? `${niceDate(start)} – ${niceDate(end)}` : presets.find((preset) => preset.value === period)?.label ?? 'Custom'
  const statusLabelText = statusOptions.find((option) => option.value === statusFilter)?.label ?? 'All in period'
  const categoryLabelText = categoryFilter === 'all' ? 'All categories' : categories.find((category) => category.id === categoryFilter)?.name ?? 'Category'
  const exportFilterLabel = `${statusLabelText} · ${categoryLabelText}${query.trim() ? ` · “${query.trim()}”` : ''}`

  async function handleExport(kind: 'excel' | 'pdf') {
    if (!canExport) return
    setExportOpen(false)
    setExporting(kind)
    try {
      const exportedIds = new Set(filteredLedger.map((expense) => expense.id))
      const exportedPayments = scopedPayments.filter((payment) => exportedIds.has(payment.expenseId))
      const payload = {
        expenses: filteredLedger,
        payments: exportedPayments,
        trend: buildTrendPoints(filteredLedger, exportedPayments, start, end, chartMode).map((point) => ({ date: point.key, expensesCents: point.recordedCents })),
        range: { start, end, label: periodLabel },
        scopeLabel: workspaceTitle,
        filterLabel: exportFilterLabel,
        source: 'supabase' as const,
      }
      if (kind === 'excel') exportExpensesExcel(payload)
      else exportExpensesPdf(payload)
      setNotice(`${kind === 'excel' ? 'Excel' : 'PDF'} export includes ${filteredLedger.length} filtered record${filteredLedger.length === 1 ? '' : 's'}.`)
      window.setTimeout(() => setNotice(null), 2800)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Export failed.')
    } finally {
      setExporting(null)
    }
  }

  const mutationReady = Boolean(activeBranch) || (isSuperAdmin && canCreate)
  const actionBranch = activeBranch ?? availableBranches[0] ?? null

  if (!isAllBranchesMode && !activeBranch && isStaff) {
    return (
      <section className="ex161-page">
        <div className="ex161-empty">
          <Building2 size={22} />
          <h3>No branch workspace selected</h3>
          <p>Choose an assigned branch before recording or reviewing expenses.</p>
        </div>
      </section>
    )
  }

  return (
    <div className="ex161-page">
      <header className="ex161-hero">
        <div>
          <span>{isStaff ? 'Staff finance' : 'Executive finance'} · {workspaceTitle}</span>
          <h1>Expenses</h1>
          <p>Operating costs load and save in the clinic database.</p>
        </div>
        <div className="ex161-hero-actions" ref={menuRef}>
          {canExport ? (
            <div className="ex161-menu">
              <Button
                variant="secondary"
                size="sm"
                icon={<Download size={15} />}
                onClick={() => { setExportOpen((value) => !value); setMoreOpen(false) }}
                disabled={exporting !== null || !hydrated}
              >
                {exporting ? 'Exporting…' : 'Export'}
              </Button>
              {exportOpen ? (
                <div className="ex161-menu-list" role="menu" aria-label="Export expenses">
                  <button type="button" onClick={() => void handleExport('excel')}><FileSpreadsheet size={15} /> Excel file</button>
                  <button type="button" onClick={() => void handleExport('pdf')}><Download size={15} /> PDF</button>
                  <small>Exports the current period, status, category, and search filters ({filteredLedger.length}).</small>
                </div>
              ) : null}
            </div>
          ) : null}
          {canCreate ? (
            <div className="ex161-menu">
              <Button
                variant="secondary"
                size="sm"
                icon={<MoreHorizontal size={15} />}
                onClick={() => { setMoreOpen((value) => !value); setExportOpen(false) }}
              >
                More
              </Button>
              {moreOpen ? (
                <div className="ex161-menu-list" role="menu" aria-label="More expense actions">
                  <button type="button" onClick={() => { setMoreOpen(false); setAction('add_vendor') }} disabled={!mutationReady}><Store size={15} /> Add vendor</button>
                  <button type="button" onClick={() => { setMoreOpen(false); setAction('petty_cash') }} disabled={!mutationReady}><Banknote size={15} /> Petty cash</button>
                </div>
              ) : null}
            </div>
          ) : null}
          {canCreate ? (
            <Button size="sm" icon={<Plus size={15} />} onClick={() => setAction('add_expense')} disabled={!mutationReady}>Add expense</Button>
          ) : null}
        </div>
      </header>

      {notice ? <div className="ex161-banner is-success"><CheckCircle2 size={16} /><span>{notice}</span></div> : null}
      {error ? <div className="ex161-banner is-error"><AlertTriangle size={16} /><span>{error}</span><Button variant="secondary" size="sm" onClick={() => void refresh()}>Retry</Button></div> : null}

      <section className="ex161-toolbar">
        <label>
          <span>Period</span>
          <div className="ex161-select">
            <select value={period} onChange={(event) => choosePeriod(event.target.value as PeriodKey)}>
              {presets.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
            </select>
            <ChevronDown size={14} />
          </div>
        </label>
        {period === 'custom' ? (
          <>
            <label>
              <span>From</span>
              <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <label>
              <span>To</span>
              <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
            </label>
          </>
        ) : null}
        <label>
          <span>Status</span>
          <div className="ex161-select">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as LedgerFilter)}>
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <ChevronDown size={14} />
          </div>
        </label>
        <label>
          <span>Category</span>
          <div className="ex161-select">
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">All categories</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <ChevronDown size={14} />
          </div>
        </label>
        <label className="ex161-search-field">
          <span>Search</span>
          <div className="ex161-search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Payee, reference, description…" />
            {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button> : null}
          </div>
        </label>
        <p className="ex161-range-chip">
          {periodLabel} · {workspaceTitle} · {chartMode === 'day' ? 'Daily' : chartMode === 'week' ? 'Weekly' : 'Monthly'} chart
        </p>
      </section>

      <section className="ex161-kpis" aria-label="Expense filters">
        <button type="button" className={statusFilter === 'all' ? 'is-active' : ''} aria-pressed={statusFilter === 'all'} onClick={() => applyLedgerFilter('all')}>
          <span className="ex161-kpi-icon"><ReceiptText size={16} /></span>
          <span className="ex161-kpi-copy">
            <span>Recorded</span>
            <strong>{formatExpenseCurrency(recordedCents)}</strong>
            <small>{periodExpenses.length} in range</small>
          </span>
        </button>
        <button type="button" className={statusFilter === 'payments' ? 'is-active' : ''} aria-pressed={statusFilter === 'payments'} onClick={() => applyLedgerFilter('payments')}>
          <span className="ex161-kpi-icon"><Wallet size={16} /></span>
          <span className="ex161-kpi-copy">
            <span>Payments</span>
            <strong>{formatExpenseCurrency(paidCents)}</strong>
            <small>Paid in this range</small>
          </span>
        </button>
        <button type="button" className={statusFilter === 'open' ? 'is-active' : ''} aria-pressed={statusFilter === 'open'} onClick={() => applyLedgerFilter('open')}>
          <span className="ex161-kpi-icon"><TrendingUp size={16} /></span>
          <span className="ex161-kpi-copy">
            <span>Open balance</span>
            <strong>{formatExpenseCurrency(openCents)}</strong>
            <small>{openExpenses.length} unpaid</small>
          </span>
        </button>
        <button type="button" className={`${overdueCount ? 'is-warn' : ''} ${statusFilter === 'attention' ? 'is-active' : ''}`.trim()} aria-pressed={statusFilter === 'attention'} onClick={() => applyLedgerFilter('attention')}>
          <span className="ex161-kpi-icon"><Clock3 size={16} /></span>
          <span className="ex161-kpi-copy">
            <span>Needs attention</span>
            <strong>{overdueCount + dueSoonCount}</strong>
            <small>{overdueCount} overdue · {dueSoonCount} due soon</small>
          </span>
        </button>
      </section>

      <section className="ex161-main">
        <div className="ex161-panel">
          {loading && !hydrated ? <div className="ex161-empty compact">Loading expense trend from Supabase…</div> : <ExpenseTrendChart points={trendPoints} mode={chartMode} />}
        </div>
        <aside className="ex161-panel">
          <div className="ex161-side-head">
            <span>Category mix</span>
            <h3>Where spend landed</h3>
          </div>
          {categoryBreakdown.length === 0 ? (
            <div className="ex161-empty compact">No categorized spend in this range.</div>
          ) : (
            <ul className="ex161-cats">
              {categoryBreakdown.map((item) => {
                const widthPct = Math.max(8, Math.round((item.totalCents / Math.max(categoryBreakdown[0]?.totalCents || 1, 1)) * 100))
                return (
                  <li key={item.id}>
                    <button type="button" className={categoryFilter === item.id ? 'is-active' : ''} aria-pressed={categoryFilter === item.id} onClick={() => applyCategoryFilter(item.id)}>
                      <div><strong>{item.name}</strong><span>{formatExpenseCurrency(item.totalCents)}</span></div>
                      <b><i style={{ width: `${widthPct}%` }} /></b>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="ex161-side-meta">
            <article><span>Vendors</span><strong>{vendors.length}</strong></article>
            <article><span>Avg ticket</span><strong>{formatExpenseCurrency(periodExpenses.length ? Math.round(recordedCents / periodExpenses.length) : 0)}</strong></article>
          </div>
        </aside>
      </section>

      <section className="ex161-panel ex161-ledger" ref={ledgerRef} id="ex161-ledger">
        <div className="ex161-ledger-head">
          <div>
            <span>Ledger</span>
            <h2>{filteredLedger.length} record{filteredLedger.length === 1 ? '' : 's'}</h2>
            <p>{exportFilterLabel}</p>
          </div>
        </div>

        {loading && !hydrated ? (
          <div className="ex161-empty">Loading expenses from Supabase…</div>
        ) : pagedLedger.length === 0 ? (
          <div className="ex161-empty">
            <ReceiptText size={22} />
            <h3>No expenses match this view</h3>
            <p>Try another period or status, or add a new expense. New records are written to Supabase immediately.</p>
            {canCreate && mutationReady ? <Button icon={<Plus size={15} />} onClick={() => setAction('add_expense')}>Add expense</Button> : null}
          </div>
        ) : (
          <div className="ex161-cards">
            {pagedLedger.map((expense) => {
              const due = getExpenseDueStatus(expense)
              const category = categories.find((item) => item.id === expense.categoryId)?.name ?? 'Uncategorized'
              const center = expense.scope === 'clinic_wide' ? 'Clinic-wide' : availableBranches.find((branch) => branch.id === expense.branchId)?.name ?? 'Branch'
              return (
                <button
                  key={expense.id}
                  type="button"
                  className={`ex161-card ${due === 'overdue' ? 'is-overdue' : due === 'due_soon' ? 'is-due-soon' : `is-${expense.status}`}`}
                  onClick={() => setSelectedId(expense.id)}
                >
                  <div className="ex161-card-date">
                    <strong>{niceDate(expense.expenseDate)}</strong>
                    {expense.dueDate ? <span>Due {niceDate(expense.dueDate)}</span> : <span>{expense.expenseNumber}</span>}
                  </div>
                  <div className="ex161-card-body">
                    <div className="ex161-card-top">
                      <h3>{expense.payeeName}</h3>
                      <em className={`ex161-status is-${expense.status} ${due === 'overdue' ? 'is-overdue' : due === 'due_soon' ? 'is-due-soon' : ''}`}>
                        {due === 'overdue' ? 'Overdue' : due === 'due_soon' ? 'Due soon' : statusLabel(expense.status)}
                      </em>
                    </div>
                    <p>{expense.description}</p>
                    <div className="ex161-card-meta">
                      <span>{expense.expenseNumber}</span>
                      <span>{category}</span>
                      {isAllBranchesMode ? <span>{center}</span> : null}
                    </div>
                  </div>
                  <div className="ex161-card-money">
                    <span>Total</span>
                    <strong>{formatExpenseCurrency(expense.totalCents)}</strong>
                    <small>Balance {formatExpenseCurrency(expense.balanceCents)}</small>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {filteredLedger.length > PAGE_SIZE ? (
          <Pagination page={page} pageCount={pageCount} totalItems={filteredLedger.length} pageSize={PAGE_SIZE} onPageChange={setPage} label="Expense pages" />
        ) : null}
      </section>

      {selectedExpense ? (
        <ExpenseRecordModal
          expense={selectedExpense}
          payments={selectedPayments}
          branchLabel={selectedExpense.scope === 'clinic_wide' ? 'Clinic-wide' : availableBranches.find((branch) => branch.id === selectedExpense.branchId)?.name}
          canEdit={canEdit}
          canVoid={canVoid}
          canRecordPayment={canPay}
          onClose={() => setSelectedId(null)}
          onSaved={(message) => {
            setSelectedId(null)
            void refresh(message || 'Expense updated in Supabase.')
          }}
        />
      ) : null}

      {action ? (
        <BranchScopedExpenseActionModal
          type={action}
          branch={actionBranch}
          allowClinicWide={isSuperAdmin}
          availableBranches={availableBranches}
          onClose={() => setAction(null)}
          onSuccess={() => {
            const message = action === 'add_vendor'
              ? 'Vendor saved to Supabase.'
              : action === 'petty_cash'
                ? 'Petty cash recorded in Supabase.'
                : 'Expense saved to Supabase.'
            setAction(null)
            void refresh(message)
          }}
        />
      ) : null}
    </div>
  )
}

export default ExpensesPremiumWorkspaceV161
