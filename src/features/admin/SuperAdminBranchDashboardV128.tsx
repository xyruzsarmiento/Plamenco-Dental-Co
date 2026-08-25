import { Activity, BarChart3, Building2, CalendarCheck2, CircleDollarSign, PackageSearch, ReceiptText, TrendingUp, UsersRound, WalletCards } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PremiumLineChartV35 } from '../../components/ui/PremiumInteractiveChartV35'
import { getStoredAppointments } from '../appointments/appointmentStore'
import { useBranchContext } from '../branches/BranchContext'
import { getProviderBranchAssignments } from '../dentists/dentistStore'
import { getExpenses } from '../expenses/expenseStore'
import { getBranchInventory, getInventoryBatches, getStockStatus, getExpiryStatus } from '../inventory/inventoryStore'
import { buildEnterpriseReportSnapshot, formatReportCurrency } from '../reports/reportStore'

function manilaDateKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function manilaDateLabel() {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())
}

function shortBranchName(name?: string) {
  return name?.replace(/^Plamenco Dental Co\.\s*-\s*/i, '') || 'Branch'
}

function Metric({ icon: Icon, label, value, detail, tone = 'default' }: { icon: typeof CircleDollarSign; label: string; value: string; detail: string; tone?: 'default' | 'primary' | 'warning' | 'danger' | 'success' }) {
  return <article className={`sav56-metric tone-${tone}`}><span className="sav56-metric-icon"><Icon size={18}/></span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>
}

export function SuperAdminBranchDashboardV128() {
  const { activeBranch, activeBranchId, availableBranches, authorizedBranchIds, isAllBranchesMode } = useBranchContext()
  const today = manilaDateKey()
  const scopeKey = isAllBranchesMode ? 'all' : activeBranchId ?? 'none'
  const scopeName = isAllBranchesMode ? 'All Branches' : activeBranch?.name ?? 'No branch selected'

  const report = useMemo(() => buildEnterpriseReportSnapshot({
    filters: {
      preset: 'this_month',
      branchId: isAllBranchesMode ? 'all' : activeBranchId ?? undefined,
      authorizedBranchIds,
    },
  }), [activeBranchId, authorizedBranchIds, isAllBranchesMode])

  const appointments = useMemo(() => getStoredAppointments().filter((appointment) => {
    if (isAllBranchesMode) return authorizedBranchIds.includes(appointment.branchId ?? '')
    return appointment.branchId === activeBranchId
  }), [activeBranchId, authorizedBranchIds, isAllBranchesMode, scopeKey])

  const todayAppointments = appointments.filter((appointment) => appointment.date === today)
  const activeFlow = todayAppointments.filter((appointment) => ['checked_in', 'waiting', 'in_progress'].includes(appointment.status))
  const pendingRequests = appointments.filter((appointment) => appointment.status === 'pending')
  const completedToday = todayAppointments.filter((appointment) => appointment.status === 'completed').length
  const noShowsToday = todayAppointments.filter((appointment) => appointment.status === 'no_show').length

  const branchStocks = useMemo(() => getBranchInventory().filter((row) => isAllBranchesMode ? authorizedBranchIds.includes(row.branchId) : row.branchId === activeBranchId), [activeBranchId, authorizedBranchIds, isAllBranchesMode, scopeKey])
  const branchBatches = useMemo(() => getInventoryBatches().filter((row) => isAllBranchesMode ? authorizedBranchIds.includes(row.branchId) : row.branchId === activeBranchId), [activeBranchId, authorizedBranchIds, isAllBranchesMode, scopeKey])
  const inventoryRisk = branchStocks.filter((row) => ['low_stock', 'out_of_stock'].includes(getStockStatus(row))).length + branchBatches.filter((row) => getExpiryStatus(row) === 'expiring_soon').length

  const expenses = useMemo(() => getExpenses().filter((expense) => {
    if (expense.status === 'void' || expense.status === 'cancelled') return false
    if (isAllBranchesMode) return expense.scope === 'clinic_wide' || authorizedBranchIds.includes(expense.branchId ?? '')
    return expense.scope === 'branch' && expense.branchId === activeBranchId
  }), [activeBranchId, authorizedBranchIds, isAllBranchesMode, scopeKey])
  const expenseAttention = expenses.filter((expense) => ['unpaid', 'partial', 'overdue'].includes(expense.status)).length

  const assignments = getProviderBranchAssignments().filter((assignment) => assignment.status === 'active' && (isAllBranchesMode ? authorizedBranchIds.includes(assignment.branchId) : assignment.branchId === activeBranchId))
  const providerCount = new Set(assignments.map((assignment) => assignment.providerId)).size
  const netCashMovement = report.executive.collectedCashCents - report.executive.expensePaymentsCents

  const comparisonRows = availableBranches.map((branch) => {
    const row = report.branches.find((entry) => entry.branchId === branch.id)
    return { branch, row }
  })

  if (!isAllBranchesMode && !activeBranchId) {
    return <section className="sav56"><div className="sav56-empty"><Building2 size={24}/><strong>Select a branch workspace</strong><span>Dashboard operational data requires a concrete branch.</span></div></section>
  }

  return <section className="sav56" aria-label={`Super Admin dashboard · ${scopeName}`} data-dashboard-branch-scope={scopeKey}>
    <header className="sav56-hero">
      <div className="sav56-hero-copy"><span className="sav56-eyebrow">{isAllBranchesMode ? 'Executive intelligence · all branches' : `${shortBranchName(activeBranch?.name)} branch intelligence`}</span><h1>{isAllBranchesMode ? 'Clinic command center' : `${shortBranchName(activeBranch?.name)} command center`}</h1><p>{isAllBranchesMode ? 'Cross-branch leadership summary. Operational records remain separated by branch.' : `Financial performance, patient flow, inventory and operating activity for ${activeBranch?.name} only.`}</p><div className="sav56-date"><CalendarCheck2 size={15}/><span>{manilaDateLabel()}</span></div></div>
      <div className="sav56-hero-actions"><Link to="/app/reports"><BarChart3 size={16}/><span>Reports & Analytics</span></Link><Link to="/app/appointments" className="is-primary"><CalendarCheck2 size={16}/><span>Appointments</span></Link></div>
    </header>

    <section className="sav56-metrics" aria-label={`${scopeName} KPIs`}>
      <Metric icon={CircleDollarSign} label="Collections" value={formatReportCurrency(report.executive.collectedCashCents)} detail={`${scopeName} · this month`} tone="primary" />
      <Metric icon={ReceiptText} label="Billed amount" value={formatReportCurrency(report.executive.billedRevenueCents)} detail={`${scopeName} invoice value`} />
      <Metric icon={WalletCards} label="Receivables" value={formatReportCurrency(report.executive.outstandingReceivablesCents)} detail="Open balances in this scope" tone={report.executive.outstandingReceivablesCents > 0 ? 'warning' : 'default'} />
      <Metric icon={TrendingUp} label="Net cash movement" value={formatReportCurrency(netCashMovement)} detail="Collections less recorded expense payments" tone={netCashMovement >= 0 ? 'success' : 'danger'} />
      <Metric icon={CalendarCheck2} label="Appointments today" value={String(todayAppointments.length)} detail={`${activeFlow.length} active in clinic flow`} />
      <Metric icon={UsersRound} label="Patients seen" value={String(report.executive.uniquePatientsSeen)} detail={`${report.executive.completedVisits} completed visits this month`} />
    </section>

    <div className="sav56-main-grid">
      <section className="sav56-card sav56-finance-card"><div className="sav56-card-head"><div><span className="sav56-eyebrow">Financial performance · {scopeName}</span><h2>Collections and operating costs</h2><p>The graph reloads from the selected workspace scope.</p></div><Link to="/app/reports">Full analysis</Link></div><PremiumLineChartV35 labels={report.trend.map((row) => row.label)} series={[{ key: 'collections', label: 'Collections', values: report.trend.map((row) => row.collectionsCents), formatter: formatReportCurrency }, { key: 'expenses', label: 'Expenses', values: report.trend.map((row) => row.expensesCents), formatter: formatReportCurrency }]} ariaLabel={`${scopeName} collections and expenses trend`} /><div className="sav56-finance-summary"><div><span>Recorded expenses</span><strong>{formatReportCurrency(report.executive.operatingExpensesCents)}</strong></div><div><span>Expense payments</span><strong>{formatReportCurrency(report.executive.expensePaymentsCents)}</strong></div><div><span>Refunds</span><strong>{formatReportCurrency(report.executive.refundsCents)}</strong></div><div><span>No-show rate</span><strong>{(report.executive.noShowRate * 100).toFixed(1)}%</strong></div></div></section>
      <aside className="sav56-card sav56-pulse-card"><div className="sav56-card-head"><div><span className="sav56-eyebrow">Today at a glance</span><h2>{isAllBranchesMode ? 'Executive pulse' : `${shortBranchName(activeBranch?.name)} operational pulse`}</h2><p>Counts are restricted to the selected branch workspace.</p></div></div><div className="sav56-pulse-list"><Link to="/app/appointments"><span className="sav56-pulse-icon"><Activity size={17}/></span><div><strong>{activeFlow.length}</strong><span>Patients in active flow</span></div></Link><Link to="/app/appointments"><span className="sav56-pulse-icon"><CalendarCheck2 size={17}/></span><div><strong>{pendingRequests.length}</strong><span>Pending appointment requests</span></div></Link><Link to="/app/inventory" className={inventoryRisk ? 'has-attention' : ''}><span className="sav56-pulse-icon"><PackageSearch size={17}/></span><div><strong>{inventoryRisk}</strong><span>Inventory risk signals</span></div></Link><Link to="/app/expenses" className={expenseAttention ? 'has-attention' : ''}><span className="sav56-pulse-icon"><ReceiptText size={17}/></span><div><strong>{expenseAttention}</strong><span>Expense items requiring attention</span></div></Link></div><div className="sav56-day-outcomes"><div><strong>{completedToday}</strong><span>Completed today</span></div><div><strong>{noShowsToday}</strong><span>No shows today</span></div></div></aside>
    </div>

    <section className="sav56-card sav56-branch-card"><div className="sav56-card-head"><div><span className="sav56-eyebrow">{isAllBranchesMode ? 'Branch comparison' : 'Selected branch'}</span><h2>{isAllBranchesMode ? 'Multi-branch operations' : activeBranch?.name}</h2><p>{isAllBranchesMode ? 'Each branch remains separate in the executive comparison.' : 'Only this branch contributes to the cards and operational counts above.'}</p></div></div><div className="sav56-branch-list">{comparisonRows.filter(({ branch }) => isAllBranchesMode || branch.id === activeBranchId).map(({ branch, row }) => <article key={branch.id} className="sav56-branch-row"><div className="sav56-branch-name"><span><Building2 size={17}/></span><div><strong>{branch.name}</strong><small>{branch.city}, {branch.province}</small></div></div><div className="sav56-branch-kpis"><div><span>Appointments</span><strong>{row?.appointments ?? 0}</strong></div><div><span>Completed</span><strong>{row?.completedVisits ?? 0}</strong></div><div><span>Providers</span><strong>{branch.id === activeBranchId || isAllBranchesMode ? new Set(getProviderBranchAssignments().filter((a) => a.status === 'active' && a.branchId === branch.id).map((a) => a.providerId)).size : 0}</strong></div></div><div className="sav56-branch-finance"><span>MTD collections</span><strong>{formatReportCurrency(row?.collectionsCents ?? 0)}</strong><small>{formatReportCurrency(row?.expensesCents ?? 0)} expenses</small></div></article>)}</div></section>

    <section className="sav56-card sav56-workforce-card"><div className="sav56-card-head"><div><span className="sav56-eyebrow">Workspace coverage</span><h2>Assigned dentist coverage</h2><p>{isAllBranchesMode ? 'Active provider assignments across authorized branches.' : `Providers assigned to ${activeBranch?.name}.`}</p></div></div><div className="sav56-workforce-metrics"><div><span className="sav56-workforce-icon"><Building2 size={17}/></span><strong>{isAllBranchesMode ? availableBranches.length : 1}</strong><small>Branches in scope</small></div><div><span className="sav56-workforce-icon"><UsersRound size={17}/></span><strong>{providerCount}</strong><small>Assigned providers</small></div><div><span className="sav56-workforce-icon"><CalendarCheck2 size={17}/></span><strong>{todayAppointments.length}</strong><small>Appointments today</small></div></div></section>
  </section>
}
