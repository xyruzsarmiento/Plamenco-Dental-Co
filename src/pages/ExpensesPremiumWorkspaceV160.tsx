import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileSpreadsheet,
  Filter,
  LayoutList,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Store,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'
import { usePermissions } from '../features/auth/permissions'
import { useBranchContext } from '../features/branches/BranchContext'
import { BranchScopedExpenseActionModal } from '../features/expenses/BranchScopedExpenseActionModal'
import { ExpenseRecordModal } from '../features/expenses/ExpenseRecordModal'
import { exportExpensesExcel, exportExpensesPdf } from '../features/expenses/expenseExports'
import {
  fetchExpenseHistory,
  type ExpenseHistoryScope,
} from '../features/expenses/expenseHistory'
import { hydrateExpenseWorkspaceFromSupabase } from '../features/expenses/expensePersistence'
import {
  getExpenseCategories,
  getExpenseDueStatus,
  getExpensePayments,
  getExpenses,
  getExpenseVendors,
  type Expense,
  type ExpensePayment,
  type ExpenseStatus,
} from '../features/expenses/expenseStore'

type LedgerFilter = 'all' | 'open' | 'paid' | 'overdue' | 'due_soon' | 'void'
type ActionType = 'add_expense' | 'petty_cash' | 'add_vendor' | null
type WorkspaceTab = 'ledger' | 'snapshot'
type PeriodMode = 'month' | 'custom'

const MONEY = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
})

function money(cents: number) {
  return MONEY.format((Number(cents) || 0) / 100)
}

function toInputDate(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  const next = new Date(y, (m || 1) - 1 + delta, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
}

function formatShortDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusLabel(status: ExpenseStatus) {
  return status.replace(/_/g, ' ')
}

function inDateRange(value: string | undefined, from: string, to: string) {
  if (!value) return false
  return value >= from && value <= to
}

function branchLabel(branchId: string | undefined, branches: Array<{ id: string; name: string }>) {
  if (!branchId) return 'Clinic-wide'
  return branches.find((item) => item.id === branchId)?.name ?? 'Branch'
}

type TrendPoint = {
  key: string
  label: string
  shortLabel: string
  recordedCents: number
  paidCents: number
}

function buildTrendPoints(
  expenses: Expense[],
  payments: ExpensePayment[],
  from: string,
  to: string,
  mode: 'day' | 'month',
): TrendPoint[] {
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []

  const map = new Map<string, TrendPoint>()

  if (mode === 'month') {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
    const last = new Date(end.getFullYear(), end.getMonth(), 1)
    while (cursor <= last) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      map.set(key, {
        key,
        label: cursor.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }),
        shortLabel: cursor.toLocaleDateString('en-PH', { month: 'short' }),
        recordedCents: 0,
        paidCents: 0,
      })
      cursor.setMonth(cursor.getMonth() + 1)
    }
  } else {
    const cursor = new Date(start)
    while (cursor <= end) {
      const key = toInputDate(cursor)
      map.set(key, {
        key,
        label: cursor.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
        shortLabel: String(cursor.getDate()),
        recordedCents: 0,
        paidCents: 0,
      })
      cursor.setDate(cursor.getDate() + 1)
    }
  }

  for (const expense of expenses) {
    if (expense.status === 'void' || expense.status === 'cancelled') continue
    if (!inDateRange(expense.expenseDate, from, to)) continue
    const key = mode === 'month' ? expense.expenseDate.slice(0, 7) : expense.expenseDate
    const point = map.get(key)
    if (point) point.recordedCents += expense.totalCents
  }

  for (const payment of payments) {
    if (!inDateRange(payment.paymentDate, from, to)) continue
    const key = mode === 'month' ? payment.paymentDate.slice(0, 7) : payment.paymentDate
    const point = map.get(key)
    if (point) point.paidCents += payment.amountCents
  }

  return [...map.values()]
}

function ExpenseTrendChart({ points, mode }: { points: TrendPoint[]; mode: 'day' | 'month' }) {
  const [active, setActive] = useState<string | null>(null)
  const width = 720
  const height = 220
  const padX = 16
  const padTop = 18
  const padBottom = 36
  const chartW = width - padX * 2
  const chartH = height - padTop - padBottom
  const maxValue = Math.max(1, ...points.flatMap((p) => [p.recordedCents, p.paidCents]))

  const coords = points.map((point, index) => {
    const x = points.length <= 1 ? padX + chartW / 2 : padX + (index / (points.length - 1)) * chartW
    return {
      ...point,
      x,
      recordedY: padTop + chartH - (point.recordedCents / maxValue) * chartH,
      paidY: padTop + chartH - (point.paidCents / maxValue) * chartH,
    }
  })

  const recordedPath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)} ${c.recordedY.toFixed(2)}`).join(' ')
  const paidPath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)} ${c.paidY.toFixed(2)}`).join(' ')
  const recordedArea =
    coords.length > 0
      ? `${recordedPath} L${coords[coords.length - 1].x.toFixed(2)} ${(padTop + chartH).toFixed(2)} L${coords[0].x.toFixed(2)} ${(padTop + chartH).toFixed(2)} Z`
      : ''

  const activePoint = coords.find((c) => c.key === active) ?? null
  const labelEvery = Math.max(1, Math.ceil(coords.length / (mode === 'day' ? 8 : 6)))

  return (
    <div className="ex160-chart">
      <div className="ex160-chart-head">
        <div>
          <p className="ex160-kicker">Spend trajectory</p>
          <h3>{mode === 'day' ? 'Daily recorded vs paid' : 'Monthly recorded vs paid'}</h3>
        </div>
        <div className="ex160-chart-legend">
          <span><i className="is-recorded" /> Recorded</span>
          <span><i className="is-paid" /> Paid</span>
        </div>
      </div>

      {coords.length === 0 ? (
        <div className="ex160-chart-empty">No expense activity in this range yet.</div>
      ) : (
        <div className="ex160-chart-frame">
          <svg viewBox={`0 0 ${width} ${height}`} className="ex160-chart-svg" role="img" aria-label="Expense trend chart">
            {[0.25, 0.5, 0.75, 1].map((step) => {
              const y = padTop + chartH - step * chartH
              return <line key={step} x1={padX} x2={width - padX} y1={y} y2={y} className="ex160-grid" />
            })}
            {recordedArea ? <path d={recordedArea} className="ex160-area-recorded" /> : null}
            {recordedPath ? <path d={recordedPath} className="ex160-line-recorded" /> : null}
            {paidPath ? <path d={paidPath} className="ex160-line-paid" /> : null}
            {coords.map((point) => (
              <g key={point.key}>
                <circle
                  cx={point.x}
                  cy={point.recordedY}
                  r={active === point.key ? 5 : 3.5}
                  className="ex160-dot-recorded"
                  onMouseEnter={() => setActive(point.key)}
                  onFocus={() => setActive(point.key)}
                  onMouseLeave={() => setActive(null)}
                />
                <circle
                  cx={point.x}
                  cy={point.paidY}
                  r={active === point.key ? 5 : 3.5}
                  className="ex160-dot-paid"
                  onMouseEnter={() => setActive(point.key)}
                  onFocus={() => setActive(point.key)}
                  onMouseLeave={() => setActive(null)}
                />
                <rect
                  x={point.x - chartW / Math.max(points.length * 2, 2)}
                  y={padTop}
                  width={Math.max(chartW / Math.max(points.length, 1), 12)}
                  height={chartH}
                  className="ex160-hit"
                  onMouseEnter={() => setActive(point.key)}
                  onFocus={() => setActive(point.key)}
                  onMouseLeave={() => setActive(null)}
                />
              </g>
            ))}
            {coords.map((point, index) =>
              index % labelEvery === 0 || index === coords.length - 1 ? (
                <text key={`label-${point.key}`} x={point.x} y={height - 12} textAnchor="middle" className="ex160-axis-label">
                  {point.shortLabel}
                </text>
              ) : null,
            )}
          </svg>

          {activePoint ? (
            <div className="ex160-chart-tooltip" style={{ left: `${(activePoint.x / width) * 100}%` }}>
              <strong>{activePoint.label}</strong>
              <span>Recorded {money(activePoint.recordedCents)}</span>
              <span>Paid {money(activePoint.paidCents)}</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export function ExpensesPremiumWorkspaceV160() {
  const { user } = useAuth()
  const permissions = usePermissions()
  const {
    activeBranch,
    availableBranches,
    authorizedBranchIds,
    isAllBranchesMode,
    canViewAllBranches,
  } = useBranchContext()

  const [searchParams, setSearchParams] = useSearchParams()
  const periodParam = (searchParams.get('period') as PeriodMode | null) ?? 'month'
  const monthParam = searchParams.get('month') ?? toInputDate(new Date()).slice(0, 7)
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')

  const [tick, setTick] = useState(0)
  const [loading, setLoading] = useState(true)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<LedgerFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [tab, setTab] = useState<WorkspaceTab>('ledger')
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null)
  const [actionType, setActionType] = useState<ActionType>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const isStaff = user?.role === 'staff'
  const canManage = permissions.can('expenses.create') || permissions.can('expenses.edit')
  const canExport = permissions.can('expenses.view') || permissions.can('expenses.view_costs')
  const canVoid = permissions.can('expenses.void')
  const canRecordPayment = permissions.can('expenses.record_payment') || canManage
  const mutationBranch = !isAllBranchesMode && activeBranch ? activeBranch : null
  const mutationBlocked = !mutationBranch

  const activeRange = useMemo(() => {
    if (periodParam === 'custom' && fromParam && toParam) {
      const from = fromParam <= toParam ? fromParam : toParam
      const to = fromParam <= toParam ? toParam : fromParam
      return {
        period: 'custom' as const,
        month: from.slice(0, 7),
        from,
        to,
        label: from === to ? formatShortDate(from) : `${formatShortDate(from)} – ${formatShortDate(to)}`,
      }
    }
    const base = new Date(`${monthParam}-01T00:00:00`)
    const safe = Number.isNaN(base.getTime()) ? new Date() : base
    const month = toInputDate(safe).slice(0, 7)
    return {
      period: 'month' as const,
      month,
      from: toInputDate(startOfMonth(safe)),
      to: toInputDate(endOfMonth(safe)),
      label: monthLabel(month),
    }
  }, [fromParam, monthParam, periodParam, toParam])

  const chartMode: 'day' | 'month' = useMemo(() => {
    const start = new Date(`${activeRange.from}T00:00:00`)
    const end = new Date(`${activeRange.to}T00:00:00`)
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
    return days > 62 ? 'month' : 'day'
  }, [activeRange.from, activeRange.to])

  const refresh = useCallback(async (message?: string) => {
    setLoading(true)
    setSyncError(null)
    try {
      await hydrateExpenseWorkspaceFromSupabase()
      setTick((value) => value + 1)
      if (message) {
        setNotice(message)
        window.setTimeout(() => setNotice(null), 3200)
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not load expenses from Supabase.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, activeBranch?.id, isAllBranchesMode])

  const allExpenses = useMemo(() => {
    void tick
    return getExpenses()
  }, [tick])

  const allPayments = useMemo(() => {
    void tick
    return getExpensePayments()
  }, [tick])

  const categories = useMemo(() => {
    void tick
    return getExpenseCategories().filter((item) => item.status === 'active')
  }, [tick])

  const vendors = useMemo(() => {
    void tick
    return getExpenseVendors().filter((item) => item.status === 'active')
  }, [tick])

  const scopedExpenses = useMemo(() => {
    if (isAllBranchesMode) {
      if (canViewAllBranches) return allExpenses
      const allowed = new Set(authorizedBranchIds)
      return allExpenses.filter((expense) => !expense.branchId || allowed.has(expense.branchId))
    }
    if (!activeBranch?.id) return []
    return allExpenses.filter(
      (expense) => expense.branchId === activeBranch.id || (!expense.branchId && expense.scope === 'clinic_wide'),
    )
  }, [allExpenses, activeBranch?.id, isAllBranchesMode])

  const scopedPayments = useMemo(() => {
    const ids = new Set(scopedExpenses.map((expense) => expense.id))
    return allPayments.filter((payment) => ids.has(payment.expenseId))
  }, [allPayments, scopedExpenses])

  const periodExpenses = useMemo(
    () =>
      scopedExpenses.filter(
        (expense) =>
          expense.status !== 'void' &&
          inDateRange(expense.expenseDate, activeRange.from, activeRange.to),
      ),
    [activeRange.from, activeRange.to, scopedExpenses],
  )

  const periodPayments = useMemo(
    () => scopedPayments.filter((payment) => inDateRange(payment.paymentDate, activeRange.from, activeRange.to)),
    [activeRange.from, activeRange.to, scopedPayments],
  )

  const openExpenses = useMemo(
    () =>
      scopedExpenses.filter(
        (expense) => expense.status !== 'void' && expense.status !== 'paid' && expense.balanceCents > 0,
      ),
    [scopedExpenses],
  )

  const recordedCents = useMemo(
    () => periodExpenses.reduce((sum, expense) => sum + expense.totalCents, 0),
    [periodExpenses],
  )
  const paidInPeriodCents = useMemo(
    () => periodPayments.reduce((sum, payment) => sum + payment.amountCents, 0),
    [periodPayments],
  )
  const openBalanceCents = useMemo(
    () => openExpenses.reduce((sum, expense) => sum + Math.max(0, expense.balanceCents), 0),
    [openExpenses],
  )
  const overdueCount = useMemo(
    () => openExpenses.filter((expense) => getExpenseDueStatus(expense) === 'overdue').length,
    [openExpenses],
  )
  const dueSoonCount = useMemo(
    () => openExpenses.filter((expense) => getExpenseDueStatus(expense) === 'due_soon').length,
    [openExpenses],
  )
  const trendPoints = useMemo(
    () => buildTrendPoints(scopedExpenses, scopedPayments, activeRange.from, activeRange.to, chartMode),
    [activeRange.from, activeRange.to, chartMode, scopedExpenses, scopedPayments],
  )

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const expense of periodExpenses) {
      const key = expense.categoryId || 'uncategorized'
      map.set(key, (map.get(key) ?? 0) + expense.totalCents)
    }
    return [...map.entries()]
      .map(([categoryId, totalCents]) => ({
        categoryId,
        name: categories.find((item) => item.id === categoryId)?.name ?? 'Uncategorized',
        totalCents,
      }))
      .sort((a, b) => b.totalCents - a.totalCents)
      .slice(0, 6)
  }, [categories, periodExpenses])

  const filteredLedger = useMemo(() => {
    const q = query.trim().toLowerCase()
    return scopedExpenses
      .filter((expense) => {
        if (statusFilter === 'all') return inDateRange(expense.expenseDate, activeRange.from, activeRange.to)
        if (statusFilter === 'open') return expense.status !== 'void' && expense.status !== 'paid' && expense.balanceCents > 0
        if (statusFilter === 'paid') return expense.status === 'paid' && inDateRange(expense.expenseDate, activeRange.from, activeRange.to)
        if (statusFilter === 'void') return expense.status === 'void' && inDateRange(expense.expenseDate, activeRange.from, activeRange.to)
        if (statusFilter === 'overdue') return getExpenseDueStatus(expense) === 'overdue'
        if (statusFilter === 'due_soon') return getExpenseDueStatus(expense) === 'due_soon'
        return true
      })
      .filter((expense) => (categoryFilter === 'all' ? true : expense.categoryId === categoryFilter))
      .filter((expense) => {
        if (!q) return true
        const haystack = [
          expense.expenseNumber,
          expense.payeeName,
          expense.description,
          expense.referenceNumber,
          categories.find((item) => item.id === expense.categoryId)?.name,
          branchLabel(expense.branchId, availableBranches),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
      .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt))
  }, [
    availableBranches,
    activeRange.from,
    activeRange.to,
    categories,
    categoryFilter,
    query,
    scopedExpenses,
    statusFilter,
  ])

  const selectedExpense = selectedExpenseId
    ? scopedExpenses.find((expense) => expense.id === selectedExpenseId) ?? null
    : null

  const selectedPayments = useMemo(() => {
    if (!selectedExpense) return []
    return scopedPayments
      .filter((payment) => payment.expenseId === selectedExpense.id)
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
  }, [scopedPayments, selectedExpense])

  const workspaceTitle = isAllBranchesMode ? 'All branches' : activeBranch?.name ?? 'Branch workspace'

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams)
    Object.entries(patch).forEach(([key, value]) => {
      if (!value) next.delete(key)
      else next.set(key, value)
    })
    setSearchParams(next, { replace: true })
  }

  function setMonthPeriod(month: string) {
    updateParams({ period: 'month', month, from: null, to: null })
  }

  function setCustomPeriod(from: string, to: string) {
    updateParams({ period: 'custom', from, to, month: from.slice(0, 7) })
  }

  async function handleExport(kind: 'csv' | 'pdf') {
    if (!canExport) return
    setExporting(kind)
    try {
      const scope: ExpenseHistoryScope = isAllBranchesMode
        ? { mode: 'all', authorizedBranchIds }
        : activeBranch?.id
          ? { mode: 'branch', branchId: activeBranch.id }
          : { mode: 'all', authorizedBranchIds }
      const history = await fetchExpenseHistory(activeRange.from, activeRange.to, scope)
      const payload = {
        expenses: history.expenses,
        payments: history.payments,
        trend: history.trend ?? [],
        range: {
          start: activeRange.from,
          end: activeRange.to,
          label: activeRange.label,
        },
        scopeLabel: workspaceTitle,
        source: history.source ?? 'supabase',
      }
      if (kind === 'csv') exportExpensesExcel(payload)
      else exportExpensesPdf(payload)
      setNotice(`${kind === 'csv' ? 'Excel' : 'PDF'} export ready from Supabase records.`)
      window.setTimeout(() => setNotice(null), 2800)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Export failed.')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="ex160-page">
      <header className="ex160-hero">
        <div className="ex160-hero-copy">
          <div className="ex160-hero-badge">
            <Receipt size={16} />
            <span>{isStaff ? 'Staff operations' : 'Executive finance'}</span>
          </div>
          <h1>Expenses</h1>
          <p>
            Operational ledger for {workspaceTitle}. Data loads and saves through Supabase — not browser storage.
          </p>
        </div>

        <div className="ex160-hero-actions">
          <button type="button" className="ex160-btn ghost" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'is-spin' : undefined} />
            <span>{loading ? 'Syncing' : 'Refresh'}</span>
          </button>
          {canExport ? (
            <>
              <button type="button" className="ex160-btn ghost" onClick={() => void handleExport('csv')} disabled={exporting !== null}>
                <FileSpreadsheet size={16} />
                <span>{exporting === 'csv' ? 'Exporting…' : 'Excel'}</span>
              </button>
              <button type="button" className="ex160-btn ghost" onClick={() => void handleExport('pdf')} disabled={exporting !== null}>
                <Download size={16} />
                <span>{exporting === 'pdf' ? 'Exporting…' : 'PDF'}</span>
              </button>
            </>
          ) : null}
          {canManage ? (
            <>
              <button
                type="button"
                className="ex160-btn soft"
                disabled={mutationBlocked}
                title={mutationBlocked ? 'Select a concrete branch to manage vendors.' : undefined}
                onClick={() => setActionType('add_vendor')}
              >
                <Store size={16} />
                <span>Vendor</span>
              </button>
              <button
                type="button"
                className="ex160-btn soft"
                disabled={mutationBlocked}
                title={mutationBlocked ? 'Select a concrete branch for petty cash.' : undefined}
                onClick={() => setActionType('petty_cash')}
              >
                <Banknote size={16} />
                <span>Petty cash</span>
              </button>
              <button
                type="button"
                className="ex160-btn primary"
                disabled={mutationBlocked}
                title={mutationBlocked ? 'Select a concrete branch before adding an expense.' : undefined}
                onClick={() => setActionType('add_expense')}
              >
                <Plus size={16} />
                <span>Add expense</span>
              </button>
            </>
          ) : null}
        </div>
      </header>

      {notice ? (
        <div className="ex160-banner is-success">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </div>
      ) : null}
      {syncError ? (
        <div className="ex160-banner is-error">
          <AlertTriangle size={16} />
          <span>{syncError}</span>
        </div>
      ) : null}
      {mutationBlocked && canManage ? (
        <div className="ex160-banner is-info">
          <Building2 size={16} />
          <span>All Branches is review-only for expense mutations. Choose Plaridel or Pulilan to add or pay expenses.</span>
        </div>
      ) : null}

      <section className="ex160-toolbar">
        <div className="ex160-period">
          <label className="ex160-field">
            <span>Period</span>
            <div className="ex160-select-wrap">
              <select
                value={activeRange.period}
                onChange={(event) => {
                  const next = event.target.value as PeriodMode
                  if (next === 'month') setMonthPeriod(activeRange.month)
                  else setCustomPeriod(activeRange.from, activeRange.to)
                }}
              >
                <option value="month">Month</option>
                <option value="custom">Custom range</option>
              </select>
              <ChevronDown size={14} />
            </div>
          </label>

          {activeRange.period === 'month' ? (
            <div className="ex160-month-nav">
              <button type="button" className="ex160-icon-btn" onClick={() => setMonthPeriod(shiftMonth(activeRange.month, -1))} aria-label="Previous month">
                <ArrowLeft size={16} />
              </button>
              <label className="ex160-field grow">
                <span>Month</span>
                <input type="month" value={activeRange.month} onChange={(event) => setMonthPeriod(event.target.value)} />
              </label>
              <button type="button" className="ex160-icon-btn" onClick={() => setMonthPeriod(shiftMonth(activeRange.month, 1))} aria-label="Next month">
                <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <div className="ex160-custom-range">
              <label className="ex160-field">
                <span>From</span>
                <input type="date" value={activeRange.from} onChange={(event) => setCustomPeriod(event.target.value, activeRange.to)} />
              </label>
              <label className="ex160-field">
                <span>To</span>
                <input type="date" value={activeRange.to} onChange={(event) => setCustomPeriod(activeRange.from, event.target.value)} />
              </label>
            </div>
          )}
        </div>

        <div className="ex160-range-chip">
          <CalendarDays size={15} />
          <span>{activeRange.label}</span>
          <span className="ex160-dot" />
          <span>{workspaceTitle}</span>
          <span className="ex160-dot" />
          <span>{chartMode === 'day' ? 'Daily chart' : 'Monthly chart'}</span>
        </div>
      </section>

      <section className="ex160-kpi-grid">
        <article className="ex160-kpi">
          <div className="ex160-kpi-top">
            <span>Recorded</span>
            <Receipt size={16} />
          </div>
          <strong>{money(recordedCents)}</strong>
          <p>{periodExpenses.length} expense{periodExpenses.length === 1 ? '' : 's'} in range</p>
        </article>
        <article className="ex160-kpi">
          <div className="ex160-kpi-top">
            <span>Payments</span>
            <Wallet size={16} />
          </div>
          <strong>{money(paidInPeriodCents)}</strong>
          <p>Payment dates inside selected period</p>
        </article>
        <article className="ex160-kpi">
          <div className="ex160-kpi-top">
            <span>Open balance</span>
            <TrendingUp size={16} />
          </div>
          <strong>{money(openBalanceCents)}</strong>
          <p>Outstanding across active payables</p>
        </article>
        <article className={`ex160-kpi ${overdueCount ? 'is-warn' : ''}`}>
          <div className="ex160-kpi-top">
            <span>Needs attention</span>
            <Clock3 size={16} />
          </div>
          <strong>{overdueCount + dueSoonCount}</strong>
          <p>
            {overdueCount} overdue · {dueSoonCount} due soon
          </p>
        </article>
      </section>

      <section className="ex160-main-grid">
        <div className="ex160-panel ex160-panel-chart">
          <ExpenseTrendChart points={trendPoints} mode={chartMode} />
        </div>

        <div className="ex160-panel ex160-panel-side">
          <div className="ex160-side-head">
            <p className="ex160-kicker">Category mix</p>
            <h3>Where spend landed</h3>
          </div>
          {categoryBreakdown.length === 0 ? (
            <div className="ex160-empty-inline">No categorized spend in this range.</div>
          ) : (
            <ul className="ex160-cat-list">
              {categoryBreakdown.map((item) => {
                const max = categoryBreakdown[0]?.totalCents || 1
                const widthPct = Math.max(8, Math.round((item.totalCents / max) * 100))
                return (
                  <li key={item.categoryId}>
                    <div className="ex160-cat-meta">
                      <strong>{item.name}</strong>
                      <span>{money(item.totalCents)}</span>
                    </div>
                    <div className="ex160-cat-bar">
                      <span style={{ width: `${widthPct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="ex160-panel ex160-ledger">
        <div className="ex160-ledger-head">
          <div className="ex160-tabs" role="tablist" aria-label="Expenses views">
            <button type="button" className={tab === 'ledger' ? 'is-active' : ''} onClick={() => setTab('ledger')}>
              <LayoutList size={15} />
              Ledger
            </button>
            <button type="button" className={tab === 'snapshot' ? 'is-active' : ''} onClick={() => setTab('snapshot')}>
              <TrendingUp size={15} />
              Snapshot
            </button>
          </div>

          <div className="ex160-ledger-tools">
            <label className="ex160-search">
              <Search size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search payee, reference, description…"
              />
              {query ? (
                <button type="button" className="ex160-clear" onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={14} />
                </button>
              ) : null}
            </label>
            <button
              type="button"
              className={`ex160-btn ghost compact ${filtersOpen ? 'is-active' : ''}`}
              onClick={() => setFiltersOpen((value) => !value)}
            >
              <Filter size={15} />
              Filters
            </button>
          </div>
        </div>

        {filtersOpen ? (
          <div className="ex160-filter-row">
            <div className="ex160-chip-row" role="group" aria-label="Status filters">
              {(
                [
                  ['all', 'In period'],
                  ['open', 'Open'],
                  ['overdue', 'Overdue'],
                  ['due_soon', 'Due soon'],
                  ['paid', 'Paid'],
                  ['void', 'Voided'],
                ] as Array<[LedgerFilter, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`ex160-chip ${statusFilter === id ? 'is-active' : ''}`}
                  onClick={() => setStatusFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="ex160-field compact">
              <span>Category</span>
              <div className="ex160-select-wrap">
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="all">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </div>
            </label>
          </div>
        ) : null}

        {tab === 'snapshot' ? (
          <div className="ex160-snapshot">
            <article>
              <span>Vendors on file</span>
              <strong>{vendors.length}</strong>
            </article>
            <article>
              <span>Open payables</span>
              <strong>{openExpenses.length}</strong>
            </article>
            <article>
              <span>Period payments</span>
              <strong>{periodPayments.length}</strong>
            </article>
            <article>
              <span>Average ticket</span>
              <strong>
                {money(periodExpenses.length ? Math.round(recordedCents / periodExpenses.length) : 0)}
              </strong>
            </article>
          </div>
        ) : null}

        <div className="ex160-table-wrap">
          {loading && filteredLedger.length === 0 ? (
            <div className="ex160-empty">Loading expenses from Supabase…</div>
          ) : filteredLedger.length === 0 ? (
            <div className="ex160-empty">
              <Receipt size={22} />
              <h3>No expenses match this view</h3>
              <p>Adjust the period or filters, or add a new branch expense.</p>
              {canManage && !mutationBlocked ? (
                <button type="button" className="ex160-btn primary" onClick={() => setActionType('add_expense')}>
                  <Plus size={16} />
                  Add expense
                </button>
              ) : null}
            </div>
          ) : (
            <table className="ex160-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Expense</th>
                  <th>Category</th>
                  {isAllBranchesMode ? <th>Branch</th> : null}
                  <th>Status</th>
                  <th className="is-num">Total</th>
                  <th className="is-num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedger.map((expense) => {
                  const due = getExpenseDueStatus(expense)
                  return (
                    <tr key={expense.id} onClick={() => setSelectedExpenseId(expense.id)}>
                      <td>
                        <div className="ex160-date-cell">
                          <strong>{formatShortDate(expense.expenseDate)}</strong>
                          {expense.dueDate ? <span>Due {formatShortDate(expense.dueDate)}</span> : null}
                        </div>
                      </td>
                      <td>
                        <div className="ex160-main-cell">
                          <strong>{expense.payeeName}</strong>
                          <span>{expense.description}</span>
                          <small>{expense.expenseNumber}</small>
                        </div>
                      </td>
                      <td>{categories.find((item) => item.id === expense.categoryId)?.name ?? '—'}</td>
                      {isAllBranchesMode ? <td>{branchLabel(expense.branchId, availableBranches)}</td> : null}
                      <td>
                        <span
                          className={`ex160-status is-${expense.status} ${
                            due === 'overdue' ? 'is-overdue' : due === 'due_soon' ? 'is-due-soon' : ''
                          }`}
                        >
                          {due === 'overdue' ? 'Overdue' : due === 'due_soon' ? 'Due soon' : statusLabel(expense.status)}
                        </span>
                      </td>
                      <td className="is-num">{money(expense.totalCents)}</td>
                      <td className="is-num">{money(expense.balanceCents)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="ex160-card-list">
          {filteredLedger.map((expense) => {
            const due = getExpenseDueStatus(expense)
            return (
              <button key={expense.id} type="button" className="ex160-card" onClick={() => setSelectedExpenseId(expense.id)}>
                <div className="ex160-card-top">
                  <strong>{expense.payeeName}</strong>
                  <span
                    className={`ex160-status is-${expense.status} ${
                      due === 'overdue' ? 'is-overdue' : due === 'due_soon' ? 'is-due-soon' : ''
                    }`}
                  >
                    {due === 'overdue' ? 'Overdue' : due === 'due_soon' ? 'Due soon' : statusLabel(expense.status)}
                  </span>
                </div>
                <p>{expense.description}</p>
                <div className="ex160-card-meta">
                  <span>{formatShortDate(expense.expenseDate)}</span>
                  <span>{categories.find((item) => item.id === expense.categoryId)?.name ?? '—'}</span>
                  {isAllBranchesMode ? <span>{branchLabel(expense.branchId, availableBranches)}</span> : null}
                </div>
                <div className="ex160-card-foot">
                  <span>{money(expense.totalCents)}</span>
                  <strong>Bal {money(expense.balanceCents)}</strong>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {selectedExpense ? (
        <ExpenseRecordModal
          expense={selectedExpense}
          payments={selectedPayments}
          branchLabel={branchLabel(selectedExpense.branchId, availableBranches)}
          canEdit={canManage && !isAllBranchesMode}
          canVoid={canVoid && !isAllBranchesMode}
          canRecordPayment={canRecordPayment && !isAllBranchesMode}
          onClose={() => setSelectedExpenseId(null)}
          onSaved={(message) => {
            setSelectedExpenseId(null)
            void refresh(message || 'Expense updated in Supabase.')
          }}
        />
      ) : null}

      {actionType && mutationBranch ? (
        <BranchScopedExpenseActionModal
          type={actionType}
          branch={mutationBranch}
          onClose={() => setActionType(null)}
          onSuccess={() => {
            const message =
              actionType === 'add_vendor'
                ? 'Vendor saved to Supabase.'
                : actionType === 'petty_cash'
                  ? 'Petty cash recorded in Supabase.'
                  : 'Expense saved to Supabase.'
            setActionType(null)
            void refresh(message)
          }}
        />
      ) : null}
    </div>
  )
}

export default ExpensesPremiumWorkspaceV160
