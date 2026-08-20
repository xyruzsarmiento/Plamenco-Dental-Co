import {
  Activity,
  BarChart3,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Settings,
  ShieldCheck,
  UserRoundCog,
  UsersRound,
} from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { getStoredAppointments } from '../appointments/appointmentStore'
import { getStoredStaff } from '../auth/staffStore'
import { getStoredBranches } from '../branches/branchStore'
import { getProviderBranchAssignments, getStoredProviders } from '../dentists/dentistStore'
import { getSystemAdminSnapshot } from './systemAdminStore'

function manilaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function SuperAdminOverview() {
  const today = manilaDate()
  const branches = useMemo(() => getStoredBranches(), [])
  const providers = useMemo(() => getStoredProviders(), [])
  const assignments = useMemo(() => getProviderBranchAssignments(), [])
  const staff = useMemo(() => getStoredStaff(), [])
  const appointments = useMemo(() => getStoredAppointments(), [])
  const snapshot = useMemo(() => getSystemAdminSnapshot(), [])

  const activeBranches = branches.filter((branch) => branch.status === 'active')
  const activeProviders = providers.filter((provider) => provider.status === 'active')
  const activeStaff = staff.filter((member) => member.status === 'active')
  const todayAppointments = appointments.filter((appointment) => appointment.date === today)
  const pendingRequests = appointments.filter((appointment) => appointment.status === 'pending')
  const activeFlow = todayAppointments.filter((appointment) => ['checked_in', 'waiting', 'in_progress'].includes(appointment.status))
  const warnings = [
    ...snapshot.integrationDiagnostics,
    ...snapshot.securityDiagnostics,
    ...snapshot.dataIntegrityDiagnostics,
  ].filter((item) => item.status !== 'healthy')

  return (
    <section className="page-stack super-admin-overview">
      <div className="super-admin-hero">
        <div>
          <Badge tone="info">Executive oversight</Badge>
          <h2>Multi-branch command center</h2>
          <p>Operational, administrative, and governance visibility based on the clinic's current records and configured diagnostics.</p>
        </div>
        <div className="super-admin-hero-actions">
          <Link to="/app/reports"><Button><BarChart3 size={16} /> Management reports</Button></Link>
          <Link to="/app/system-admin"><Button variant="secondary"><ShieldCheck size={16} /> System administration</Button></Link>
        </div>
      </div>

      <div className="super-admin-kpis">
        <article><span>Active branches</span><strong>{activeBranches.length}</strong><small>{branches.length} configured</small></article>
        <article><span>Active providers</span><strong>{activeProviders.length}</strong><small>{providers.length} provider profiles</small></article>
        <article><span>Active staff</span><strong>{activeStaff.length}</strong><small>{staff.length} internal records</small></article>
        <article><span>Appointments today</span><strong>{todayAppointments.length}</strong><small>{activeFlow.length} currently in clinic flow</small></article>
        <article><span>Pending requests</span><strong>{pendingRequests.length}</strong><small>Awaiting appointment decision</small></article>
        <article><span>Attention items</span><strong>{warnings.length}</strong><small>From configured system diagnostics</small></article>
      </div>

      <div className="super-admin-grid">
        <section className="panel super-admin-panel">
          <div className="panel-header compact-header">
            <div><p className="eyebrow">Branch visibility</p><h3>Today by branch</h3></div>
            <Building2 size={18} />
          </div>
          <div className="super-admin-branch-list">
            {branches.map((branch) => {
              const branchAppointments = todayAppointments.filter((appointment) => appointment.branchId === branch.id)
              const branchProviders = new Set(assignments.filter((entry) => entry.branchId === branch.id && entry.status === 'active').map((entry) => entry.providerId))
              const waiting = branchAppointments.filter((appointment) => ['checked_in', 'waiting'].includes(appointment.status)).length
              return (
                <article key={branch.id} className="super-admin-branch-row">
                  <div>
                    <strong>{branch.name}</strong>
                    <span>{branch.city}, {branch.province}</span>
                  </div>
                  <div className="super-admin-branch-metrics">
                    <span><b>{branchAppointments.length}</b> visits</span>
                    <span><b>{branchProviders.size}</b> providers</span>
                    <span><b>{waiting}</b> waiting</span>
                  </div>
                  <Badge tone={branch.status === 'active' ? 'success' : 'neutral'}>{branch.status}</Badge>
                </article>
              )
            })}
            {!branches.length && <div className="empty-state compact"><p>No branches are configured.</p></div>}
          </div>
        </section>

        <section className="panel super-admin-panel">
          <div className="panel-header compact-header">
            <div><p className="eyebrow">Governance</p><h3>Configuration diagnostics</h3></div>
            <Activity size={18} />
          </div>
          <div className="super-admin-diagnostic-list">
            {[...snapshot.integrationDiagnostics, ...snapshot.securityDiagnostics, ...snapshot.dataIntegrityDiagnostics].slice(0, 8).map((item) => (
              <div key={item.id}>
                <div><strong>{item.label}</strong><span>{item.detail}</span></div>
                <Badge tone={item.status === 'healthy' ? 'success' : item.status === 'warning' ? 'warning' : 'danger'}>{item.status}</Badge>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel super-admin-panel">
        <div className="panel-header compact-header">
          <div><p className="eyebrow">Management workspace</p><h3>Administration and oversight</h3></div>
        </div>
        <div className="super-admin-action-grid">
          <Link to="/app/reports"><BarChart3 size={18} /><span><strong>Management reports</strong><small>Review current operational and financial reporting.</small></span></Link>
          <Link to="/app/report-automation"><CalendarClock size={18} /><span><strong>Automation</strong><small>Manage report schedules and their real execution state.</small></span></Link>
          <Link to="/app/staff"><UserRoundCog size={18} /><span><strong>Team & Access</strong><small>Manage internal accounts, roles, and branch assignments.</small></span></Link>
          <Link to="/app/branches"><Building2 size={18} /><span><strong>Branch management</strong><small>Review and maintain clinic branch configuration.</small></span></Link>
          <Link to="/app/tasks"><ClipboardCheck size={18} /><span><strong>Operational tasks</strong><small>Review current work queues and unresolved operations.</small></span></Link>
          <Link to="/app/system-admin"><ShieldCheck size={18} /><span><strong>Security & administration</strong><small>Inspect access, diagnostics, integrations, and audit areas.</small></span></Link>
          <Link to="/app/settings"><Settings size={18} /><span><strong>Configuration</strong><small>Open supported clinic configuration surfaces.</small></span></Link>
          <Link to="/app/patients"><UsersRound size={18} /><span><strong>Patient operations</strong><small>Open current patient records and operational context.</small></span></Link>
        </div>
      </section>

      <p className="super-admin-truth-note">This workspace only reflects records and diagnostics available to the application. It does not infer backup health, provider verification, delivery success, or automation success beyond their recorded source-of-truth states.</p>
    </section>
  )
}
