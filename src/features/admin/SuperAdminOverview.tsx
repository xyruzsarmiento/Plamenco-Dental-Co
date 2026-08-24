import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Settings,
  ShieldCheck,
  UserRoundCog,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { getStoredAppointments } from '../appointments/appointmentStore'
import { getStoredStaff } from '../auth/staffStore'
import { getStoredBranches } from '../branches/branchStore'
import { getProviderBranchAssignments, getStoredProviders } from '../dentists/dentistStore'
import { buildEnterpriseReportSnapshot } from '../reports/reportStore'
import { getSystemAdminSnapshot } from './systemAdminStore'

function manilaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function ExecutiveTrendChart({
  data,
}: {
  data: Array<{ label: string; collectionsCents: number; expensesCents: number }>
}) {
  const width = 860
  const height = 270
  const pad = { left: 34, right: 18, top: 22, bottom: 38 }
  const max = Math.max(1, ...data.flatMap((row) => [row.collectionsCents, row.expensesCents]))
  const usableWidth = width - pad.left - pad.right
  const usableHeight = height - pad.top - pad.bottom
  const point = (value: number, index: number) => ({
    x: data.length <= 1 ? pad.left + usableWidth / 2 : pad.left + (usableWidth * index) / (data.length - 1),
    y: pad.top + usableHeight - (value / max) * usableHeight,
  })
  const pathFor = (key: 'collectionsCents' | 'expensesCents') => data
    .map((row, index) => {
      const p = point(row[key], index)
      return `${index === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
    })
    .join(' ')

  if (!data.length) {
    return <div className="sa-empty-chart">No financial activity is available for this period.</div>
  }

  return (
    <div className="sa-chart-frame">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Collections and expenses trend for the selected report period">
        {[0, 1, 2, 3].map((row) => {
          const y = pad.top + (usableHeight * row) / 3
          return <line key={row} x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="sa-chart-gridline" />
        })}
        <path d={pathFor('collectionsCents')} className="sa-chart-line sa-chart-line-primary" />
        <path d={pathFor('expensesCents')} className="sa-chart-line sa-chart-line-muted" />
        {data.map((row, index) => {
          const collection = point(row.collectionsCents, index)
          const expense = point(row.expensesCents, index)
          return (
            <g key={`${row.label}-${index}`}>
              <circle cx={collection.x} cy={collection.y} r="4.5" className="sa-chart-dot sa-chart-dot-primary"><title>{`${row.label}: ${formatCurrency(row.collectionsCents)} collections`}</title></circle>
              <circle cx={expense.x} cy={expense.y} r="4" className="sa-chart-dot sa-chart-dot-muted"><title>{`${row.label}: ${formatCurrency(row.expensesCents)} expenses`}</title></circle>
              {(data.length <= 8 || index % Math.ceil(data.length / 7) === 0 || index === data.length - 1) && (
                <text x={collection.x} y={height - 12} textAnchor="middle" className="sa-chart-axis-label">{row.label}</text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function StatusDonut({ data }: { data: Array<{ status: string; count: number }> }) {
  const total = data.reduce((sum, item) => sum + item.count, 0)
  const visible = data.filter((item) => item.count > 0)
  const radius = 50
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="sa-status-visual">
      <div className="sa-donut-wrap">
        <svg viewBox="0 0 132 132" role="img" aria-label="Appointment status distribution">
          <circle cx="66" cy="66" r={radius} className="sa-donut-track" />
          {visible.map((item, index) => {
            const segment = total ? (item.count / total) * circumference : 0
            const dashOffset = -offset
            offset += segment
            return (
              <circle
                key={item.status}
                cx="66"
                cy="66"
                r={radius}
                className={`sa-donut-segment sa-donut-${index % 5}`}
                strokeDasharray={`${segment} ${circumference - segment}`}
                strokeDashoffset={dashOffset}
              >
                <title>{`${titleCase(item.status)}: ${item.count}`}</title>
              </circle>
            )
          })}
        </svg>
        <div className="sa-donut-center"><strong>{total}</strong><span>appointments</span></div>
      </div>
      <div className="sa-status-legend">
        {visible.slice(0, 6).map((item, index) => (
          <div key={item.status}><i className={`sa-legend-dot sa-legend-${index % 5}`} /><span>{titleCase(item.status)}</span><strong>{item.count}</strong></div>
        ))}
        {!visible.length && <p>No appointment status records in this period.</p>}
      </div>
    </div>
  )
}

export function SuperAdminOverview() {
  const today = manilaDate()
  const branches = useMemo(() => getStoredBranches(), [])
  const providers = useMemo(() => getStoredProviders(), [])
  const assignments = useMemo(() => getProviderBranchAssignments(), [])
  const staff = useMemo(() => getStoredStaff(), [])
  const appointments = useMemo(() => getStoredAppointments(), [])
  const systemSnapshot = useMemo(() => getSystemAdminSnapshot(), [])
  const report = useMemo(() => buildEnterpriseReportSnapshot({ filters: { preset: 'this_month' } }), [])

  const activeBranches = branches.filter((branch) => branch.status === 'active')
  const activeProviders = providers.filter((provider) => provider.status === 'active')
  const activeStaff = staff.filter((member) => member.status === 'active')
  const todayAppointments = appointments.filter((appointment) => appointment.date === today)
  const pendingRequests = appointments.filter((appointment) => appointment.status === 'pending')
  const activeFlow = todayAppointments.filter((appointment) => ['checked_in', 'waiting', 'in_progress'].includes(appointment.status))
  const warnings = [
    ...systemSnapshot.integrationDiagnostics,
    ...systemSnapshot.securityDiagnostics,
    ...systemSnapshot.dataIntegrityDiagnostics,
  ].filter((item) => item.status !== 'healthy')

  const branchRows = activeBranches.map((branch) => {
    const branchAppointments = todayAppointments.filter((appointment) => appointment.branchId === branch.id)
    const providerIds = new Set(assignments.filter((entry) => entry.branchId === branch.id && entry.status === 'active').map((entry) => entry.providerId))
    return {
      branch,
      appointments: branchAppointments.length,
      providers: providerIds.size,
      waiting: branchAppointments.filter((appointment) => ['checked_in', 'waiting'].includes(appointment.status)).length,
      active: branchAppointments.filter((appointment) => appointment.status === 'in_progress').length,
    }
  })
  const branchMax = Math.max(1, ...branchRows.map((row) => row.appointments))

  return (
    <section className="sa-dashboard" aria-label="Super Admin executive dashboard">
      <header className="sa-executive-header">
        <div className="sa-header-copy">
          <span className="sa-kicker">Executive overview</span>
          <h2>Clinic command center</h2>
          <p>Multi-branch operations, financial movement, patient flow, and governance signals from current clinic records.</p>
        </div>
        <div className="sa-header-actions">
          <Link to="/app/reports"><Button icon={<BarChart3 size={16} />}>Open reports</Button></Link>
          <Link to="/app/system-admin"><Button variant="secondary" icon={<ShieldCheck size={16} />}>Administration</Button></Link>
        </div>
      </header>

      <section className="sa-command-strip" aria-label="Executive metrics">
        <article className="sa-command-card sa-command-card-primary">
          <div className="sa-command-icon"><CircleDollarSign size={19} /></div>
          <div><span>Collections this month</span><strong>{formatCurrency(report.executive.collectedCashCents)}</strong><small>Completed payment records</small></div>
        </article>
        <article className="sa-command-card">
          <div className="sa-command-icon"><WalletCards size={19} /></div>
          <div><span>Receivables</span><strong>{formatCurrency(report.executive.outstandingReceivablesCents)}</strong><small>Open invoice balances</small></div>
        </article>
        <article className="sa-command-card">
          <div className="sa-command-icon"><CalendarClock size={19} /></div>
          <div><span>Appointments today</span><strong>{todayAppointments.length}</strong><small>{activeFlow.length} currently in clinic flow</small></div>
        </article>
        <article className="sa-command-card">
          <div className="sa-command-icon"><Building2 size={19} /></div>
          <div><span>Active branches</span><strong>{activeBranches.length}</strong><small>{activeProviders.length} active providers</small></div>
        </article>
        <article className={`sa-command-card ${warnings.length ? 'sa-command-card-attention' : ''}`}>
          <div className="sa-command-icon">{warnings.length ? <AlertTriangle size={19} /> : <CheckCircle2 size={19} />}</div>
          <div><span>Attention items</span><strong>{warnings.length}</strong><small>Recorded diagnostic states</small></div>
        </article>
      </section>

      <div className="sa-primary-grid">
        <section className="sa-analytics-card sa-financial-chart">
          <div className="sa-card-header">
            <div><span className="sa-kicker">Financial movement</span><h3>Collections vs expenses</h3><p>This month, using recorded payments and expenses.</p></div>
            <Link to="/app/reports" className="sa-text-link">Full analysis <ArrowUpRight size={14} /></Link>
          </div>
          <div className="sa-chart-legend"><span><i className="sa-line-key primary" /> Collections</span><span><i className="sa-line-key muted" /> Expenses</span></div>
          <ExecutiveTrendChart data={report.trend.map((row) => ({ label: row.label, collectionsCents: row.collectionsCents, expensesCents: row.expensesCents }))} />
          <div className="sa-finance-footer">
            <div><span>Billed amount</span><strong>{formatCurrency(report.executive.billedRevenueCents)}</strong></div>
            <div><span>Refunds</span><strong>{formatCurrency(report.executive.refundsCents)}</strong></div>
            <div><span>Recorded expenses</span><strong>{formatCurrency(report.executive.operatingExpensesCents)}</strong></div>
            <div><span>Net cash movement</span><strong>{formatCurrency(report.executive.collectedCashCents - report.executive.expensePaymentsCents)}</strong></div>
          </div>
        </section>

        <section className="sa-analytics-card sa-status-card">
          <div className="sa-card-header"><div><span className="sa-kicker">Patient flow</span><h3>Appointment mix</h3><p>Status distribution for this month.</p></div></div>
          <StatusDonut data={report.appointments.byStatus} />
          <div className="sa-mini-metrics">
            <div><span>Completed</span><strong>{report.executive.completedVisits}</strong></div>
            <div><span>No-show rate</span><strong>{(report.executive.noShowRate * 100).toFixed(1)}%</strong></div>
            <div><span>Pending now</span><strong>{pendingRequests.length}</strong></div>
          </div>
        </section>
      </div>

      <div className="sa-secondary-grid">
        <section className="sa-analytics-card sa-branch-overview">
          <div className="sa-card-header">
            <div><span className="sa-kicker">Live branch operations</span><h3>Today across locations</h3><p>Appointment and provider context from configured branch records.</p></div>
            <Link to="/app/branches" className="sa-text-link">Manage branches <ArrowUpRight size={14} /></Link>
          </div>
          <div className="sa-branch-table">
            {branchRows.map((row) => (
              <article key={row.branch.id} className="sa-branch-row">
                <div className="sa-branch-identity"><span className="sa-branch-mark"><Building2 size={17} /></span><div><strong>{row.branch.name}</strong><small>{row.branch.city}, {row.branch.province}</small></div></div>
                <div className="sa-branch-progress"><div><span>Today&apos;s volume</span><strong>{row.appointments}</strong></div><div className="sa-progress-track"><span style={{ width: `${(row.appointments / branchMax) * 100}%` }} /></div></div>
                <div className="sa-branch-stat"><span>Providers</span><strong>{row.providers}</strong></div>
                <div className="sa-branch-stat"><span>Waiting</span><strong>{row.waiting}</strong></div>
                <div className="sa-branch-stat"><span>In treatment</span><strong>{row.active}</strong></div>
                <StatusBadge status={row.branch.status} variant="compact" />
              </article>
            ))}
            {!branchRows.length && <div className="sa-empty-state"><Building2 size={22} /><strong>No active branches</strong><span>Branch activity will appear when branch records are available.</span></div>}
          </div>
        </section>

        <section className="sa-analytics-card sa-governance-card">
          <div className="sa-card-header"><div><span className="sa-kicker">Governance</span><h3>Operational attention</h3><p>Only actual diagnostic states are shown.</p></div></div>
          <div className="sa-governance-list">
            {warnings.slice(0, 6).map((item) => (
              <div key={item.id} className="sa-governance-row"><span className="sa-governance-icon"><Activity size={15} /></span><div><strong>{item.label}</strong><small>{item.detail}</small></div><StatusBadge status={item.status} variant="compact" /></div>
            ))}
            {!warnings.length && <div className="sa-governance-clear"><CheckCircle2 size={20} /><div><strong>No diagnostic attention items</strong><span>Configured diagnostics currently report healthy states.</span></div></div>}
          </div>
          <Link to="/app/system-admin" className="sa-panel-link">Review system administration <ArrowUpRight size={14} /></Link>
        </section>
      </div>

      <section className="sa-workspace-section">
        <div className="sa-section-heading"><div><span className="sa-kicker">Executive workspace</span><h3>Management shortcuts</h3></div><span className="sa-workforce-note">{activeStaff.length} active internal staff records</span></div>
        <div className="sa-action-grid">
          <Link to="/app/reports"><span className="sa-action-icon"><BarChart3 size={18} /></span><div><strong>Management reports</strong><small>Financial, operational, branch and clinical analytics.</small></div><ArrowUpRight size={15} /></Link>
          <Link to="/app/staff"><span className="sa-action-icon"><UserRoundCog size={18} /></span><div><strong>Team & Access</strong><small>Accounts, roles, attendance and workforce controls.</small></div><ArrowUpRight size={15} /></Link>
          <Link to="/app/system-admin"><span className="sa-action-icon"><ShieldCheck size={18} /></span><div><strong>Security & administration</strong><small>Access, diagnostics, integrations and audit controls.</small></div><ArrowUpRight size={15} /></Link>
          <Link to="/app/settings"><span className="sa-action-icon"><Settings size={18} /></span><div><strong>Configuration</strong><small>Clinic profile, audit activity and session controls.</small></div><ArrowUpRight size={15} /></Link>
          <Link to="/app/branches"><span className="sa-action-icon"><Building2 size={18} /></span><div><strong>Branch management</strong><small>Location details and operational configuration.</small></div><ArrowUpRight size={15} /></Link>
          <Link to="/app/patients"><span className="sa-action-icon"><UsersRound size={18} /></span><div><strong>Patient operations</strong><small>Open patient records and care context.</small></div><ArrowUpRight size={15} /></Link>
        </div>
      </section>

      <p className="sa-truth-note">This dashboard reflects records and diagnostics available to the application. It does not infer backup health, provider verification, external delivery success, or automation success beyond recorded source-of-truth states.</p>
    </section>
  )
}
