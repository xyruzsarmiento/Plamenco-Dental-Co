import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  PackageSearch,
  ReceiptText,
  ShieldCheck,
  Stethoscope,
  TrendingUp,
  UserRoundCog,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PremiumLineChartV35 } from '../../components/ui/PremiumInteractiveChartV35'
import { ReportRankedBarsV54 } from '../../components/ui/ReportsAnalyticsV54'
import { getStoredAppointments } from '../appointments/appointmentStore'
import { useAuth } from '../auth/AuthContext'
import { getStoredStaff } from '../auth/staffStore'
import { getStoredBranches } from '../branches/branchStore'
import { getProviderBranchAssignments, getStoredProviders } from '../dentists/dentistStore'
import { getExpenseOverview } from '../expenses/expenseStore'
import { getInventoryOverview } from '../inventory/inventoryStore'
import { buildEnterpriseReportSnapshot, formatReportCurrency } from '../reports/reportStore'
import { formatAuditAction, getRecentAuditLogs } from '../security/auditLogStore'
import { getSystemAdminSnapshot } from './systemAdminStore'

function manilaDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function manilaDateLabel() {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date())
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function labelize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function MetricCard({ icon: Icon, eyebrow, value, detail, tone = 'default' }: {
  icon: typeof CircleDollarSign
  eyebrow: string
  value: string
  detail: string
  tone?: 'default' | 'primary' | 'warning' | 'danger' | 'success'
}) {
  return (
    <article className={`sav56-metric tone-${tone}`}>
      <span className="sav56-metric-icon"><Icon size={18} /></span>
      <div><span>{eyebrow}</span><strong>{value}</strong><small>{detail}</small></div>
    </article>
  )
}

export function SuperAdminOverviewV56() {
  const { user } = useAuth()
  const today = manilaDateKey()
  const report = useMemo(() => buildEnterpriseReportSnapshot({ filters: { preset: 'this_month' } }), [])
  const appointments = useMemo(() => getStoredAppointments(), [])
  const branches = useMemo(() => getStoredBranches(), [])
  const providers = useMemo(() => getStoredProviders(), [])
  const assignments = useMemo(() => getProviderBranchAssignments(), [])
  const staff = useMemo(() => getStoredStaff(), [])
  const inventory = useMemo(() => getInventoryOverview(), [])
  const expenses = useMemo(() => getExpenseOverview(), [])
  const system = useMemo(() => getSystemAdminSnapshot(), [])
  const audit = useMemo(() => getRecentAuditLogs(7), [])

  const activeBranches = branches.filter((branch) => branch.status === 'active')
  const activeProviders = providers.filter((provider) => provider.status === 'active')
  const activeStaff = staff.filter((member) => member.status === 'active')
  const todayAppointments = appointments.filter((appointment) => appointment.date === today)
  const activeFlow = todayAppointments.filter((appointment) => ['checked_in', 'waiting', 'in_progress'].includes(appointment.status))
  const pendingRequests = appointments.filter((appointment) => appointment.status === 'pending')
  const completedToday = todayAppointments.filter((appointment) => appointment.status === 'completed').length
  const noShowsToday = todayAppointments.filter((appointment) => appointment.status === 'no_show').length
  const warnings = [
    ...system.integrationDiagnostics,
    ...system.securityDiagnostics,
    ...system.dataIntegrityDiagnostics,
  ].filter((item) => item.status !== 'healthy')

  const topServices = [...report.treatments]
    .sort((a, b) => b.performedCount - a.performedCount)
    .slice(0, 6)

  const branchRows = activeBranches.map((branch) => {
    const branchToday = todayAppointments.filter((appointment) => appointment.branchId === branch.id)
    const providerIds = new Set(assignments.filter((assignment) => assignment.branchId === branch.id && assignment.status === 'active').map((assignment) => assignment.providerId))
    const reportRow = report.branches.find((item) => item.branchId === branch.id)
    return {
      id: branch.id,
      name: branch.name,
      location: [branch.city, branch.province].filter(Boolean).join(', '),
      today: branchToday.length,
      waiting: branchToday.filter((appointment) => ['checked_in', 'waiting'].includes(appointment.status)).length,
      inTreatment: branchToday.filter((appointment) => appointment.status === 'in_progress').length,
      providers: providerIds.size,
      completed: reportRow?.completedVisits ?? 0,
      noShows: reportRow?.noShows ?? 0,
      collections: reportRow?.collectionsCents ?? 0,
    }
  })

  const auditRows = audit.map((entry) => {
    const formatted = formatAuditAction(entry.action)
    return { ...entry, label: formatted.label, description: formatted.description }
  })

  const inventoryRisk = inventory.lowStockItems + inventory.outOfStockItems + inventory.expiringSoon
  const expenseAttention = expenses.overdue + expenses.dueSoon
  const netCashMovement = report.executive.collectedCashCents - report.executive.expensePaymentsCents

  return (
    <section className="sav56" aria-label="Super Admin dashboard">
      <header className="sav56-hero">
        <div className="sav56-hero-copy">
          <span className="sav56-eyebrow">Executive intelligence</span>
          <h1>Clinic command center</h1>
          <p>Financial performance, patient flow, branch activity, workforce coverage, inventory risk, and governance signals in one decision workspace.</p>
          <div className="sav56-date"><CalendarCheck2 size={15} /><span>{manilaDateLabel()}</span></div>
        </div>
        <div className="sav56-hero-actions">
          <Link to="/app/reports"><BarChart3 size={16} /><span>Reports & Analytics</span></Link>
          <Link to="/app/appointments" className="is-primary"><CalendarCheck2 size={16} /><span>Appointments</span></Link>
        </div>
      </header>

      <section className="sav56-metrics" aria-label="Executive KPIs">
        <MetricCard icon={CircleDollarSign} eyebrow="Collections" value={formatReportCurrency(report.executive.collectedCashCents)} detail="Completed payments this month" tone="primary" />
        <MetricCard icon={ReceiptText} eyebrow="Billed amount" value={formatReportCurrency(report.executive.billedRevenueCents)} detail="Invoice value this month" />
        <MetricCard icon={WalletCards} eyebrow="Receivables" value={formatReportCurrency(report.executive.outstandingReceivablesCents)} detail="Open invoice balances" tone={report.executive.outstandingReceivablesCents > 0 ? 'warning' : 'default'} />
        <MetricCard icon={TrendingUp} eyebrow="Net cash movement" value={formatReportCurrency(netCashMovement)} detail="Collections less recorded expense payments" tone={netCashMovement >= 0 ? 'success' : 'danger'} />
        <MetricCard icon={CalendarCheck2} eyebrow="Appointments today" value={String(todayAppointments.length)} detail={`${activeFlow.length} active in clinic flow`} />
        <MetricCard icon={UsersRound} eyebrow="Active patients" value={String(report.executive.activePatients)} detail={`${report.executive.newPatients} new this month`} />
      </section>

      <div className="sav56-main-grid">
        <section className="sav56-card sav56-finance-card">
          <div className="sav56-card-head">
            <div><span className="sav56-eyebrow">Financial performance</span><h2>Collections and operating costs</h2><p>Recorded monthly cash movement. Hover or focus chart points for exact values.</p></div>
            <Link to="/app/reports">Full analysis <ArrowUpRight size={14} /></Link>
          </div>
          <PremiumLineChartV35
            labels={report.trend.map((row) => row.label)}
            series={[
              { key: 'collections', label: 'Collections', values: report.trend.map((row) => row.collectionsCents), formatter: formatReportCurrency },
              { key: 'expenses', label: 'Expenses', values: report.trend.map((row) => row.expensesCents), formatter: formatReportCurrency },
            ]}
            ariaLabel="Collections and expenses trend"
          />
          <div className="sav56-finance-summary">
            <div><span>Recorded expenses</span><strong>{formatReportCurrency(report.executive.operatingExpensesCents)}</strong></div>
            <div><span>Expense payments</span><strong>{formatReportCurrency(report.executive.expensePaymentsCents)}</strong></div>
            <div><span>Refunds</span><strong>{formatReportCurrency(report.executive.refundsCents)}</strong></div>
            <div><span>Completion rate</span><strong>{formatPercent(report.executive.completionRate)}</strong></div>
          </div>
        </section>

        <aside className="sav56-card sav56-pulse-card">
          <div className="sav56-card-head"><div><span className="sav56-eyebrow">Today at a glance</span><h2>Operational pulse</h2><p>Live operational counts from current records.</p></div></div>
          <div className="sav56-pulse-list">
            <Link to="/app/appointments"><span className="sav56-pulse-icon"><Stethoscope size={17} /></span><div><strong>{activeFlow.length}</strong><span>Patients in active flow</span></div><ArrowUpRight size={14} /></Link>
            <Link to="/app/appointments"><span className="sav56-pulse-icon"><Clock3 size={17} /></span><div><strong>{pendingRequests.length}</strong><span>Pending appointment requests</span></div><ArrowUpRight size={14} /></Link>
            <Link to="/app/inventory" className={inventoryRisk ? 'has-attention' : ''}><span className="sav56-pulse-icon"><PackageSearch size={17} /></span><div><strong>{inventoryRisk}</strong><span>Inventory risk signals</span></div><ArrowUpRight size={14} /></Link>
            <Link to="/app/expenses" className={expenseAttention ? 'has-attention' : ''}><span className="sav56-pulse-icon"><ReceiptText size={17} /></span><div><strong>{expenseAttention}</strong><span>Expense items due / overdue</span></div><ArrowUpRight size={14} /></Link>
            <Link to="/app/system-admin" className={warnings.length ? 'has-attention' : ''}><span className="sav56-pulse-icon"><ShieldCheck size={17} /></span><div><strong>{warnings.length}</strong><span>System attention items</span></div><ArrowUpRight size={14} /></Link>
          </div>
          <div className="sav56-day-outcomes"><div><strong>{completedToday}</strong><span>Completed today</span></div><div><strong>{noShowsToday}</strong><span>No shows today</span></div></div>
        </aside>
      </div>

      <div className="sav56-secondary-grid">
        <section className="sav56-card sav56-branch-card">
          <div className="sav56-card-head"><div><span className="sav56-eyebrow">Branch performance</span><h2>Multi-branch operations</h2><p>Today’s clinic flow with month-to-date performance context.</p></div><Link to="/app/branches">Branches <ArrowUpRight size={14} /></Link></div>
          <div className="sav56-branch-list">
            {branchRows.map((branch) => (
              <article key={branch.id} className="sav56-branch-row">
                <div className="sav56-branch-name"><span><Building2 size={17} /></span><div><strong>{branch.name}</strong><small>{branch.location || 'Location not recorded'}</small></div></div>
                <div className="sav56-branch-kpis"><div><span>Today</span><strong>{branch.today}</strong></div><div><span>Waiting</span><strong>{branch.waiting}</strong></div><div><span>In treatment</span><strong>{branch.inTreatment}</strong></div><div><span>Providers</span><strong>{branch.providers}</strong></div></div>
                <div className="sav56-branch-finance"><span>MTD collections</span><strong>{formatReportCurrency(branch.collections)}</strong><small>{branch.completed} completed · {branch.noShows} no-shows</small></div>
              </article>
            ))}
            {!branchRows.length && <div className="sav56-empty"><Building2 size={22} /><strong>No active branches</strong><span>Configured branch activity will appear here.</span></div>}
          </div>
        </section>

        <section className="sav56-card sav56-clinical-card">
          <div className="sav56-card-head"><div><span className="sav56-eyebrow">Clinical demand</span><h2>Most availed services</h2><p>Performed treatments ranked by recorded activity this month.</p></div><Link to="/app/services">Services <ArrowUpRight size={14} /></Link></div>
          <ReportRankedBarsV54
            rows={topServices.map((service) => ({
              label: service.serviceName,
              value: service.performedCount,
              displayValue: String(service.performedCount),
              meta: `${formatReportCurrency(service.billedRevenueCents)} billed`,
            }))}
            valueLabel="Performed"
            totalLabel="Performed treatments"
            totalDisplay={String(topServices.reduce((sum, service) => sum + service.performedCount, 0))}
            emptyLabel="No performed treatment activity has been recorded this month."
            ariaLabel="Most availed services"
          />
        </section>
      </div>

      <div className="sav56-lower-grid">
        <section className="sav56-card sav56-workforce-card">
          <div className="sav56-card-head"><div><span className="sav56-eyebrow">Workforce coverage</span><h2>Team availability</h2><p>Internal staffing and provider coverage from stored assignments.</p></div><Link to="/app/staff">Team & Access <ArrowUpRight size={14} /></Link></div>
          <div className="sav56-workforce-metrics"><div><span className="sav56-workforce-icon"><UserRoundCog size={17} /></span><strong>{activeStaff.length}</strong><small>Active staff accounts</small></div><div><span className="sav56-workforce-icon"><Stethoscope size={17} /></span><strong>{activeProviders.length}</strong><small>Active providers</small></div><div><span className="sav56-workforce-icon"><Building2 size={17} /></span><strong>{assignments.filter((entry) => entry.status === 'active').length}</strong><small>Active branch assignments</small></div></div>
        </section>

        <section className="sav56-card sav56-governance-card">
          <div className="sav56-card-head"><div><span className="sav56-eyebrow">Governance & integrity</span><h2>Attention center</h2><p>Only recorded diagnostic states are surfaced.</p></div><Link to="/app/system-admin">System Admin <ArrowUpRight size={14} /></Link></div>
          <div className="sav56-governance-list">
            {warnings.slice(0, 5).map((item) => <div key={item.id}><span className="sav56-governance-icon"><AlertTriangle size={15} /></span><div><strong>{item.label}</strong><small>{item.detail}</small></div><em>{labelize(item.status)}</em></div>)}
            {!warnings.length && <div className="sav56-clear"><CheckCircle2 size={20} /><div><strong>No recorded attention items</strong><span>Current diagnostics report healthy states.</span></div></div>}
          </div>
        </section>

        <section className="sav56-card sav56-activity-card">
          <div className="sav56-card-head"><div><span className="sav56-eyebrow">Audit trail</span><h2>Recent activity</h2><p>Latest recorded internal actions.</p></div><Link to="/app/settings">Audit settings <ArrowUpRight size={14} /></Link></div>
          <div className="sav56-activity-list">
            {auditRows.map((entry) => <div key={entry.id}><span className="sav56-activity-dot"><Activity size={13} /></span><div><strong>{entry.label}</strong><small>{entry.description}</small></div></div>)}
            {!auditRows.length && <div className="sav56-empty is-compact"><FileText size={20} /><strong>No recent audit activity</strong></div>}
          </div>
        </section>
      </div>

      <section className="sav56-shortcuts">
        <div className="sav56-section-head"><div><span className="sav56-eyebrow">Management workspace</span><h2>Quick access</h2></div><span>{user?.name || 'Super Admin'} · {activeBranches.length} active branch{activeBranches.length === 1 ? '' : 'es'}</span></div>
        <div className="sav56-shortcut-grid">
          <Link to="/app/patients"><UsersRound size={18} /><div><strong>Patient Records</strong><small>Patient population and care context</small></div><ArrowUpRight size={14} /></Link>
          <Link to="/app/dental-records"><FileText size={18} /><div><strong>Dental Records</strong><small>Clinical documentation workspace</small></div><ArrowUpRight size={14} /></Link>
          <Link to="/app/billing"><CircleDollarSign size={18} /><div><strong>Billing & Payments</strong><small>Invoices, collections and receivables</small></div><ArrowUpRight size={14} /></Link>
          <Link to="/app/inventory"><PackageSearch size={18} /><div><strong>Inventory</strong><small>Stock, purchasing and risk controls</small></div><ArrowUpRight size={14} /></Link>
          <Link to="/app/reports"><BarChart3 size={18} /><div><strong>Reports & Analytics</strong><small>Detailed clinic performance intelligence</small></div><ArrowUpRight size={14} /></Link>
          <Link to="/app/system-admin"><ShieldCheck size={18} /><div><strong>System Administration</strong><small>Security, diagnostics and governance</small></div><ArrowUpRight size={14} /></Link>
        </div>
      </section>

      <p className="sav56-truth-note">Dashboard values are derived from records available to the application. No external provider health, delivery success, backup state, or accounting profit is inferred unless it exists as a recorded source-of-truth state.</p>
    </section>
  )
}
