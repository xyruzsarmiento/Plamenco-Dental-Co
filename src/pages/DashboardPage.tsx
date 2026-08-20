import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarCheck2,
  Clock3,
  ClipboardList,
  LineChart,
  Receipt,
  Search,
  Stethoscope,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import type { Appointment, AppointmentStatus } from '../features/appointments/appointmentTypes'
import { getStoredAppointments, getTodayAppointments, transitionAppointmentStatus } from '../features/appointments/appointmentStore'
import { useAuth } from '../features/auth/AuthContext'
import { hasAnyPermission, usePermissions } from '../features/auth/permissions'
import { getStoredStaff } from '../features/auth/staffStore'
import {
  createChargeFromTreatment,
  createInvoiceFromCharges,
  formatCurrency,
  getInvoicesByPatient,
  getStoredCharges,
} from '../features/billing/billingStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { createClinicalVisitFromAppointment } from '../features/dentalRecords/dentalRecordStore'
import { getExpenseOverview } from '../features/expenses/expenseStore'
import { getInventoryOverview } from '../features/inventory/inventoryStore'
import { NotificationCenter } from '../features/notifications/NotificationCenter'
import { getStoredPatients } from '../features/patients/patientStore'
import { getStoredServices } from '../features/services/serviceStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { getStoredTreatments } from '../features/treatments/treatmentStore'
import {
  buildEnterpriseReportSnapshot,
  formatReportCurrency,
  getReportingDatePresetRange,
  type DateRangePreset,
} from '../features/reports/reportStore'
import { formatAuditAction, getRecentAuditLogs } from '../features/security/auditLogStore'

const workflowSteps = ['Patient', 'Appointment', 'Visit', 'Record', 'Treatment', 'Billing', 'Follow-up']

const datePresets: Array<{ value: DateRangePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom' },
]

function formatCompactCurrency(cents: number) {
  const amount = cents / 100
  if (Math.abs(amount) >= 1_000_000) return `PHP ${(amount / 1_000_000).toFixed(2)}M`
  if (Math.abs(amount) >= 100_000) return `PHP ${(amount / 1_000).toFixed(0)}K`
  return formatReportCurrency(cents)
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function formatChange(value: number | null) {
  if (value === null) return 'No previous-period baseline'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}% vs previous period`
}

function labelize(value: string) {
  return value.replaceAll('_', ' ')
}

function formatTime(value?: string) {
  if (!value) return 'No time'
  const [hourValue, minuteValue] = value.split(':').map(Number)
  if (!Number.isFinite(hourValue) || !Number.isFinite(minuteValue)) return value
  const period = hourValue >= 12 ? 'PM' : 'AM'
  const hour = hourValue % 12 || 12
  return `${hour}:${String(minuteValue).padStart(2, '0')} ${period}`
}

function minutesSince(value?: string) {
  if (!value) return null
  const parsed = new Date(value).getTime()
  if (Number.isNaN(parsed)) return null
  return Math.max(0, Math.floor((Date.now() - parsed) / 60000))
}

function getPatientDisplay(patient?: { firstName?: string; lastName?: string; fullName?: string }) {
  return patient?.fullName || `${patient?.firstName ?? ''} ${patient?.lastName ?? ''}`.trim() || 'Unknown patient'
}

function getOperationalStage(appointment: Appointment) {
  if (appointment.status === 'confirmed') return 'Scheduled'
  if (appointment.status === 'checked_in') return 'Checked In'
  if (appointment.status === 'waiting') return 'Waiting'
  if (appointment.status === 'in_progress') return 'In Treatment'
  if (appointment.status === 'completed') return 'For Billing'
  if (appointment.status === 'no_show') return 'No Show'
  return labelize(appointment.status)
}

function maxOf(values: number[]) {
  return Math.max(...values, 1)
}

function MetricCard({ detail, title, tooltip, value }: { detail: string; title: string; tooltip?: string; value: string }) {
  return (
    <article className="executive-metric" title={tooltip}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  )
}

function OperationalDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const permissions = usePermissions()
  const [refreshKey, setRefreshKey] = useState(0)
  const [branchId, setBranchId] = useState('all')
  const [search, setSearch] = useState('')
  const [operationMessage, setOperationMessage] = useState<string | null>(null)
  const adminUserId = user?.id ?? user?.email ?? 'admin'
  const allAppointments = useMemo(() => {
    void refreshKey
    return getStoredAppointments()
  }, [refreshKey])
  const todayAppointments = useMemo(() => {
    void refreshKey
    return getTodayAppointments()
  }, [refreshKey])
  const pendingRequests = allAppointments.filter((item) => item.status === 'pending')
  const patients = getStoredPatients()
  const branches = getStoredBranches().filter((branch) => branch.status === 'active')
  const providers = getStoredProviders()
  const services = getStoredServices()
  const treatments = getStoredTreatments()
  const charges = getStoredCharges()
  const staff = getStoredStaff()
  const recentActivity = getRecentAuditLogs(5).map((entry) => {
    const activity = formatAuditAction(entry.action)
    return { ...entry, label: activity.label, summary: activity.description }
  })
  const recentPatients = [...patients].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)
  const activePatients = patients.filter((patient) => patient.status === 'active').length
  const patientMap = new Map(patients.flatMap((patient) => [[patient.id, patient], [patient.patientId, patient]]))
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]))
  const serviceMap = new Map(services.map((service) => [service.id, service]))
  const branchMap = new Map(branches.map((branch) => [branch.id, branch]))
  const visibleToday = todayAppointments.filter((appointment) => branchId === 'all' || appointment.branchId === branchId)
  const completedVisits = visibleToday.filter((appointment) => appointment.status === 'completed').length
  const confirmedToday = visibleToday.filter((appointment) => appointment.status === 'confirmed' || appointment.status === 'checked_in').length
  const activeStaff = staff.filter((member) => member.status === 'active').length
  const inventoryOverview = getInventoryOverview()
  const expenseOverview = getExpenseOverview()
  const todaySearch = search.trim().toLowerCase()
  const operationalAppointments = visibleToday
    .filter((appointment) => !['cancelled', 'rejected', 'rescheduled'].includes(appointment.status))
    .filter((appointment) => {
      if (!todaySearch) return true
      const patient = patientMap.get(appointment.patientId)
      const service = serviceMap.get(appointment.serviceId)
      return [
        appointment.appointmentNumber ?? appointment.id,
        appointment.status,
        patient?.patientId ?? appointment.patientId,
        patient?.firstName ?? '',
        patient?.lastName ?? '',
        patient?.phone ?? '',
        service?.name ?? '',
      ].some((value) => value.toLowerCase().includes(todaySearch))
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
  const waitingCount = visibleToday.filter((appointment) => appointment.status === 'waiting' || appointment.status === 'checked_in').length
  const inTreatmentCount = visibleToday.filter((appointment) => appointment.status === 'in_progress').length
  const noShowCount = visibleToday.filter((appointment) => appointment.status === 'no_show').length
  const billingQueue = operationalAppointments.filter((appointment) => {
    if (appointment.status !== 'completed') return false
    const patient = patientMap.get(appointment.patientId)
    const patientId = patient?.patientId ?? appointment.patientId
    const patientInvoices = getInvoicesByPatient(patientId).filter((invoice) => invoice.status !== 'void' && invoice.balanceCents > 0)
    const appointmentUnbilledTreatments = treatments.filter((treatment) => treatment.appointmentId === appointment.id && treatment.status !== 'voided' && !charges.some((charge) => charge.treatmentId === treatment.id && charge.status !== 'void'))
    return appointment.paymentStatus !== 'paid' || patientInvoices.length > 0 || appointmentUnbilledTreatments.length > 0
  })
  const statusBreakdown = ['pending', 'confirmed', 'checked_in', 'in_progress', 'completed'].map((status) => ({
    status,
    count: visibleToday.filter((appointment) => appointment.status === status).length,
  }))

  function refresh() {
    setRefreshKey((key) => key + 1)
  }

  function transitionFromDashboard(appointment: Appointment, status: AppointmentStatus) {
    const result = transitionAppointmentStatus(appointment.id, status, {
      actor: user?.email ?? 'clinic-user',
      expectedUpdatedAt: appointment.updatedAt,
    })
    if (result.error) {
      setOperationMessage(result.error)
      return
    }
    setOperationMessage(`${getOperationalStage(result.appointment ?? appointment)} updated for ${getPatientDisplay(patientMap.get(appointment.patientId))}.`)
    refresh()
  }

  function startVisit(appointment: Appointment) {
    const result = appointment.status === 'in_progress'
      ? { appointment }
      : transitionAppointmentStatus(appointment.id, 'in_progress', {
          actor: user?.email ?? 'clinic-user',
          expectedUpdatedAt: appointment.updatedAt,
        })
    if (result.error) {
      setOperationMessage(result.error)
      return
    }
    createClinicalVisitFromAppointment(result.appointment ?? appointment, user?.email ?? 'clinic-user')
    setOperationMessage(`Clinical workspace is ready for ${getPatientDisplay(patientMap.get(appointment.patientId))}.`)
    refresh()
    navigate('/app/appointments')
  }

  function prepareBilling(appointment: Appointment) {
    const patient = patientMap.get(appointment.patientId)
    const patientId = patient?.patientId ?? appointment.patientId
    const appointmentTreatments = treatments.filter((treatment) => treatment.appointmentId === appointment.id && treatment.status !== 'voided')
    const existingChargeTreatmentIds = new Set(getStoredCharges().map((charge) => charge.treatmentId).filter(Boolean))
    const newCharges = appointmentTreatments
      .filter((treatment) => !existingChargeTreatmentIds.has(treatment.id))
      .map((treatment) => createChargeFromTreatment(treatment, user?.email ?? 'clinic-user'))
    const unbilledChargeIds = getStoredCharges()
      .filter((charge) => charge.patientId === patientId && charge.status === 'unbilled' && (charge.appointmentId === appointment.id || newCharges.some((created) => created.id === charge.id)))
      .map((charge) => charge.id)
    if (unbilledChargeIds.length && permissions.can('billing.create')) {
      createInvoiceFromCharges(patientId, unbilledChargeIds, new Date().toISOString().slice(0, 10), `Generated from ${appointment.appointmentNumber ?? appointment.id}`)
    }
    setOperationMessage(newCharges.length || unbilledChargeIds.length ? 'Billing handoff prepared from recorded treatments.' : 'No new treatment charges found. Opening billing for review.')
    refresh()
    navigate('/app/billing')
  }

  return (
    <section className="premium-dashboard page-stack">
      <div className="dashboard-intro">
        <div className="dashboard-intro-copy">
          <Badge tone="success">Daily operations</Badge>
          <h2>Today's patient flow</h2>
          <p>{new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })} · {branchId === 'all' ? 'All branches' : branchMap.get(branchId)?.name ?? 'Selected branch'}</p>
        </div>
        <div className="dashboard-pill-row">
          <span className="dashboard-pill"><CalendarCheck2 size={14} /> {visibleToday.length} scheduled</span>
          <span className="dashboard-pill"><Stethoscope size={14} /> {waitingCount + inTreatmentCount} active flow</span>
          <span className="dashboard-pill"><Users size={14} /> {activePatients} active patients</span>
        </div>
      </div>

      {operationMessage && <div className="success-alert">{operationMessage}</div>}

      <div className="calendar-filter-bar panel daily-flow-toolbar">
        <label className="toolbar-search" htmlFor="daily-patient-search">
          <Search size={16} className="search-icon" />
          <input
            id="daily-patient-search"
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search today's patient, phone, service, or appointment"
          />
        </label>
        <label className="field-wrap" htmlFor="daily-branch-filter">
          <span>Branch</span>
          <select id="daily-branch-filter" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            <option value="all">All branches</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>
        <div className="toolbar-row">
          {permissions.can('appointments.create') && <Link to="/app/appointments"><Button size="sm" icon={<UserPlus size={15} />}>Walk-In</Button></Link>}
          <Link to="/app/patients"><Button size="sm" variant="secondary" icon={<Search size={15} />}>Find Patient</Button></Link>
        </div>
      </div>

      <div className="stats-grid dashboard-stats-grid">
        <article className="stat-card"><span>Appointments</span><strong>{visibleToday.length}</strong><small>{confirmedToday} confirmed/checked in</small></article>
        <article className="stat-card"><span>Waiting</span><strong>{waitingCount}</strong><small>Checked in or in queue</small></article>
        <article className="stat-card"><span>In Treatment</span><strong>{inTreatmentCount}</strong><small>Dentist active visits</small></article>
        <article className="stat-card"><span>For Billing</span><strong>{billingQueue.length}</strong><small>Completed visits needing cashier review</small></article>
        <article className="stat-card"><span>Pending requests</span><strong>{pendingRequests.length}</strong><small>Awaiting review</small></article>
        <article className="stat-card"><span>No Shows</span><strong>{noShowCount}</strong><small>Today</small></article>
      </div>

      <div className="workflow-strip" aria-label="Core workflow">
        {workflowSteps.map((step, index) => <div className="workflow-step" key={step}><span>{index + 1}</span><strong>{step}</strong></div>)}
      </div>

      <section className="operations-board">
        <div className="operations-board-header">
          <div>
            <p className="eyebrow">Queue</p>
            <h3>Today's patient flow</h3>
          </div>
          <div className="operations-flow">
            <span>{visibleToday.length} scheduled</span>
            <span>{waitingCount} waiting</span>
            <span>{completedVisits} completed</span>
            <span>{billingQueue.length} for billing</span>
          </div>
        </div>
        <div className="daily-flow-table-wrap">
          <table className="table daily-flow-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Patient</th>
                <th>Service</th>
                <th>Dentist</th>
                <th>Status</th>
                <th>Billing</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {operationalAppointments.map((appointment) => {
                const patient = patientMap.get(appointment.patientId)
                const service = serviceMap.get(appointment.serviceId)
                const provider = appointment.providerId ? providerMap.get(appointment.providerId) : undefined
                const waitMinutes = minutesSince(appointment.waitingAt ?? appointment.checkedInAt)
                const patientId = patient?.patientId ?? appointment.patientId
                const balance = getInvoicesByPatient(patientId).reduce((sum, invoice) => sum + (invoice.status === 'void' ? 0 : invoice.balanceCents), 0)
                const hasUnbilledTreatments = treatments.some((treatment) => treatment.appointmentId === appointment.id && treatment.status !== 'voided' && !charges.some((charge) => charge.treatmentId === treatment.id && charge.status !== 'void'))
                return (
                  <tr key={appointment.id}>
                    <td><strong>{formatTime(appointment.startTime)}</strong><span>{appointment.appointmentNumber ?? appointment.id}</span></td>
                    <td><strong>{getPatientDisplay(patient)}</strong><span>{patient?.patientId ?? appointment.patientId}</span></td>
                    <td>{service?.name ?? appointment.reasonForVisit ?? 'Service pending'}</td>
                    <td>{provider?.displayName ?? 'No dentist assigned'}</td>
                    <td><Badge tone={appointment.status === 'no_show' ? 'danger' : appointment.status === 'completed' ? 'success' : 'info'}>{getOperationalStage(appointment)}{waitMinutes !== null && ['checked_in', 'waiting'].includes(appointment.status) ? ` · ${waitMinutes} min` : ''}</Badge></td>
                    <td>{hasUnbilledTreatments ? 'Unbilled treatment' : balance > 0 ? formatCurrency(balance) : appointment.paymentStatus?.replaceAll('_', ' ') ?? 'not billed'}</td>
                    <td>
                      <div className="daily-flow-actions">
                        {appointment.status === 'confirmed' && permissions.can('appointments.check_in') && <button type="button" className="text-button" onClick={() => transitionFromDashboard(appointment, 'checked_in')}>Check In</button>}
                        {appointment.status === 'checked_in' && permissions.can('appointments.check_in') && <button type="button" className="text-button" onClick={() => transitionFromDashboard(appointment, 'waiting')}>Waiting</button>}
                        {['waiting', 'checked_in'].includes(appointment.status) && permissions.can('appointments.start') && <button type="button" className="text-button" onClick={() => startVisit(appointment)}>Start Visit</button>}
                        {appointment.status === 'in_progress' && permissions.can('appointments.complete') && <button type="button" className="text-button" onClick={() => transitionFromDashboard(appointment, 'completed')}>Complete</button>}
                        {appointment.status === 'completed' && permissions.canAny(['billing.view', 'billing.create', 'payments.record_manual']) && <button type="button" className="text-button" onClick={() => prepareBilling(appointment)}>Billing</button>}
                        <Link className="text-button" to={`/app/patients/${encodeURIComponent(patientId)}`}>Patient</Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {operationalAppointments.length === 0 && (
                <tr><td colSpan={7}>No patients are in today's flow for the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="dashboard-grid dashboard-main-grid">
        <article className="panel dashboard-panel">
          <div className="panel-header compact-header"><h3>Patients for billing</h3><span className="muted-label">{billingQueue.length} pending</span></div>
          {billingQueue.length === 0 ? (
            <div className="empty-state compact"><h2>0</h2><p>No completed visits are waiting for cashier handoff.</p></div>
          ) : (
            <div className="queue-list">
              {billingQueue.slice(0, 6).map((appointment) => {
                const patient = patientMap.get(appointment.patientId)
                const appointmentTreatments = treatments.filter((treatment) => treatment.appointmentId === appointment.id && treatment.status !== 'voided')
                return (
                  <div key={appointment.id} className="queue-item">
                    <div className="queue-item-time"><strong>{appointment.completedAt ? formatTime(new Date(appointment.completedAt).toLocaleTimeString('en-PH', { hour12: false, hour: '2-digit', minute: '2-digit' })) : formatTime(appointment.endTime)}</strong><small>Completed</small></div>
                    <div className="queue-item-info"><strong>{getPatientDisplay(patient)}</strong><small>{appointmentTreatments.length ? `${appointmentTreatments.length} treatment(s) recorded` : 'Review charges before payment'}</small></div>
                    <button type="button" className="text-button" onClick={() => prepareBilling(appointment)}>Open Billing</button>
                  </div>
                )
              })}
            </div>
          )}
        </article>

        <article className="panel dashboard-panel">
          <div className="panel-header compact-header"><h3>Dentist queue</h3><span className="muted-label">{waitingCount + inTreatmentCount} active</span></div>
          {operationalAppointments.filter((appointment) => ['checked_in', 'waiting', 'in_progress'].includes(appointment.status)).length === 0 ? (
            <div className="empty-state compact"><h2>0</h2><p>No appointments are scheduled for today yet.</p></div>
          ) : (
            <div className="queue-list">
              {operationalAppointments.filter((appointment) => ['checked_in', 'waiting', 'in_progress'].includes(appointment.status)).slice(0, 8).map((appointment) => {
                const patient = patientMap.get(appointment.patientId)
                const provider = appointment.providerId ? providerMap.get(appointment.providerId) : undefined
                return (
                  <div key={appointment.id} className="queue-item">
                    <div className="queue-item-time"><strong>{formatTime(appointment.startTime)}</strong><small>{minutesSince(appointment.waitingAt ?? appointment.checkedInAt) ?? 0} min</small></div>
                    <div className="queue-item-info"><strong>{getPatientDisplay(patient)}</strong><small>{provider?.displayName ?? 'No dentist assigned'}</small></div>
                    {appointment.status === 'in_progress'
                      ? <button type="button" className="text-button" onClick={() => navigate('/app/appointments')}>Clinical</button>
                      : <button type="button" className="text-button" onClick={() => startVisit(appointment)}>Start</button>}
                  </div>
                )
              })}
            </div>
          )}
        </article>

        <article className="panel dashboard-panel">
          <div className="panel-header compact-header"><h3>Appointment flow</h3><TrendingUp size={18} className="focus-icon" /></div>
          <div className="progress-list">
            {statusBreakdown.map(({ status, count }) => (
              <div key={status} className="progress-row">
                <div className="progress-meta"><span>{labelize(status)}</span><strong>{count}</strong></div>
                <div className="progress-track"><span style={{ width: `${todayAppointments.length ? (count / todayAppointments.length) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="dashboard-lower-grid">
        <article className="panel dashboard-list-panel">
          <div className="panel-header compact-header"><h3>Recent patients</h3><span className="muted-label"><UserPlus size={14} /> {patients.length}</span></div>
          {recentPatients.length === 0 ? <div className="empty-state compact"><h2>0</h2><p>No patient records have been created yet.</p></div> : (
            <div className="mini-list">
              {recentPatients.map((patient) => <div key={patient.id} className="mini-row"><div><strong>{patient.firstName} {patient.lastName}</strong><small>{patient.patientId}</small></div><span>{formatDate(patient.createdAt)}</span></div>)}
            </div>
          )}
        </article>
        <article className="panel dashboard-list-panel">
          <div className="panel-header compact-header"><h3>Recent activity</h3><span className="muted-label"><Clock3 size={14} /> {recentActivity.length}</span></div>
          {recentActivity.length === 0 ? <div className="empty-state compact"><h2>0</h2><p>No recent activity yet.</p></div> : (
            <div className="activity-timeline">
              {recentActivity.map((entry) => <div key={entry.id} className="activity-item"><div className="activity-bullet" /><div className="activity-copy"><strong>{entry.label}</strong><span>{entry.summary}</span><small>{formatDate(entry.timestamp)}</small></div></div>)}
            </div>
          )}
        </article>
        <article className="panel dashboard-list-panel">
          <div className="panel-header compact-header"><h3>Daily exceptions</h3><span className="muted-label"><ClipboardList size={14} /> Review</span></div>
          <div className="mini-list">
            <Link to="/app/inventory" className="mini-row"><div><strong>Inventory alerts</strong><small>{inventoryOverview.pendingPurchaseOrders} pending purchase orders</small></div><span>{inventoryOverview.lowStockItems + inventoryOverview.outOfStockItems}</span></Link>
            <Link to="/app/expenses" className="mini-row"><div><strong>Expense tasks</strong><small>{expenseOverview.overdue} overdue, {expenseOverview.dueSoon} due soon</small></div><span>{expenseOverview.overdue + expenseOverview.dueSoon}</span></Link>
            <Link to="/app/staff" className="mini-row"><div><strong>Active staff</strong><small>{staff.length} total roster</small></div><span>{activeStaff}</span></Link>
          </div>
        </article>
      </div>
      <NotificationCenter userId={adminUserId} />
    </section>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const canViewExecutive = user?.role === 'super_admin' || hasAnyPermission(user, ['reports.view_financial', 'reports.view_branch_performance', 'reports.view_provider_performance'])
  const adminUserId = user?.id ?? user?.email ?? 'admin'
  const branches = useMemo(() => getStoredBranches(), [])
  const defaultRange = getReportingDatePresetRange('this_month')
  const [preset, setPreset] = useState<DateRangePreset>('this_month')
  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)
  const [branchId, setBranchId] = useState('all')
  const [selectedPanel, setSelectedPanel] = useState<'receivables' | 'no_shows' | 'low_stock' | 'data_quality' | null>(null)

  const snapshot = useMemo(() => buildEnterpriseReportSnapshot({ filters: { preset, startDate, endDate, branchId } }), [branchId, endDate, preset, startDate])

  if (!canViewExecutive) return <OperationalDashboard />

  const trendMax = maxOf(snapshot.trend.flatMap((entry) => [entry.billedRevenueCents, entry.collectionsCents, entry.expensesCents]))
  const branchMax = maxOf(snapshot.branches.flatMap((branch) => [branch.collectionsCents, branch.expensesCents, branch.billedRevenueCents]))
  const serviceMax = maxOf(snapshot.treatments.map((service) => service.billedRevenueCents))
  const dayMax = maxOf(snapshot.appointments.busiestDays.map((day) => day.count))
  const hourMax = maxOf(snapshot.appointments.busiestHours.map((hour) => hour.count))
  const lowStockRows = snapshot.inventory.stockRows.filter((stock) => stock.status !== 'in_stock').slice(0, 8)
  const hasAnyData = snapshot.executive.appointments || snapshot.executive.billedRevenueCents || snapshot.executive.collectedCashCents || snapshot.executive.operatingExpensesCents || snapshot.inventory.stockRows.length

  function handlePreset(value: DateRangePreset) {
    setPreset(value)
    if (value !== 'custom') {
      const range = getReportingDatePresetRange(value)
      setStartDate(range.startDate)
      setEndDate(range.endDate)
    }
  }

  return (
    <section className="executive-dashboard page-stack">
      <div className="executive-header">
        <div>
          <Badge tone="success">Executive Business Intelligence</Badge>
          <h2>Good day, {user?.name ?? 'Clinic Owner'}</h2>
          <p>Plamenco Dental Co. Business Overview</p>
        </div>
        <div className="executive-actions">
          <Link to="/app/reports"><Button variant="secondary" icon={<BarChart3 size={16} />}>Open Reports</Button></Link>
          <Link to="/app/system-admin"><Button variant="secondary" icon={<ArrowRight size={16} />}>System Health</Button></Link>
        </div>
      </div>

      <div className="executive-filter-panel">
        <label className="report-control"><span>Date range</span><select value={preset} onChange={(event) => handlePreset(event.target.value as DateRangePreset)}>{datePresets.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="report-control"><span>Start date</span><input type="date" value={startDate} onChange={(event) => { setPreset('custom'); setStartDate(event.target.value) }} /></label>
        <label className="report-control"><span>End date</span><input type="date" value={endDate} onChange={(event) => { setPreset('custom'); setEndDate(event.target.value) }} /></label>
        <label className="report-control"><span>Branch</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="all">All Branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      </div>

      {!hasAnyData && <div className="panel chart-empty-panel"><div className="chart-empty-state"><BarChart3 size={28} /><h3>No data available for this period.</h3><p>Executive analytics will populate from appointments, invoices, payments, expenses, inventory, and purchase records.</p></div></div>}

      <div className="executive-summary-grid">
        <MetricCard title="Revenue" value={formatCompactCurrency(snapshot.executive.billedRevenueCents)} detail={formatChange(snapshot.executive.revenueComparison.changePercent)} tooltip="Invoice totals in the selected period. This is distinct from cash collected." />
        <MetricCard title="Collections" value={formatCompactCurrency(snapshot.executive.collectedCashCents)} detail={formatChange(snapshot.executive.collectionsComparison.changePercent)} tooltip="Payments received during the selected period." />
        <MetricCard title="Expenses" value={formatCompactCurrency(snapshot.executive.operatingExpensesCents)} detail={formatChange(snapshot.executive.expensesComparison.changePercent)} tooltip="Recorded operating expenses in the selected period." />
        <MetricCard title="Operating Result" value={formatCompactCurrency(snapshot.executive.netOperatingResultCents)} detail={formatChange(snapshot.executive.operatingResultComparison.changePercent)} tooltip="Collections less recorded operating expenses. This is not formal accounting net profit." />
        <MetricCard title="Receivables" value={formatCompactCurrency(snapshot.executive.outstandingReceivablesCents)} detail={`${snapshot.revenue.accountsReceivable.length} open invoice balances`} tooltip="Unpaid invoice balances for the selected report context." />
        <MetricCard title="Completed" value={String(snapshot.executive.completedVisits)} detail={`${formatPercent(snapshot.executive.completionRate)} completion rate`} tooltip="Completed visits divided by eligible scheduled appointments." />
      </div>

      <div className="executive-grid">
        <article className="panel chart-panel chart-panel-wide">
          <div className="chart-header"><div><span className="chart-kicker">Executive trend</span><h3>Revenue, collections, and expenses</h3></div><LineChart size={18} /></div>
          <div className="executive-trend-chart">
            {snapshot.trend.map((entry) => (
              <div className="executive-trend-col" key={entry.date} title={`${entry.date}: revenue ${formatReportCurrency(entry.billedRevenueCents)}, collections ${formatReportCurrency(entry.collectionsCents)}, expenses ${formatReportCurrency(entry.expensesCents)}`}>
                <div className="executive-trend-bars">
                  <span style={{ height: `${Math.max((entry.billedRevenueCents / trendMax) * 100, entry.billedRevenueCents ? 8 : 0)}%` }} />
                  <span style={{ height: `${Math.max((entry.collectionsCents / trendMax) * 100, entry.collectionsCents ? 8 : 0)}%` }} />
                  <span style={{ height: `${Math.max((entry.expensesCents / trendMax) * 100, entry.expensesCents ? 8 : 0)}%` }} />
                </div>
                <small>{entry.label}</small>
              </div>
            ))}
          </div>
          <div className="executive-legend"><span><i className="legend-revenue" />Revenue</span><span><i className="legend-collections" />Collections</span><span><i className="legend-expenses" />Expenses</span></div>
        </article>

        <article className="panel chart-panel">
          <div className="chart-header"><div><span className="chart-kicker">Operating result</span><h3>Business context</h3></div><Wallet size={18} /></div>
          <div className="executive-context-stack">
            <div><span>Discounts</span><strong>{formatReportCurrency(snapshot.revenue.discountCents)}</strong></div>
            <div><span>Refunds</span><strong>{formatReportCurrency(snapshot.revenue.refundsCents)}</strong><small>{snapshot.revenue.refundCount} completed refunds</small></div>
            <div><span>Expense payments</span><strong>{formatReportCurrency(snapshot.executive.expensePaymentsCents)}</strong></div>
          </div>
        </article>

        {branchId === 'all' && (
          <article className="panel chart-panel chart-panel-wide">
            <div className="chart-header"><div><span className="chart-kicker">Pulilan vs Plaridel</span><h3>Branch performance comparison</h3></div><ArrowRight size={18} /></div>
            <div className="branch-comparison">
              {snapshot.branches.map((branch) => (
                <button type="button" className="branch-comparison-row" key={branch.branchId} onClick={() => setBranchId(branch.branchId)}>
                  <div><strong>{branch.branchName}</strong><span>{branch.completedVisits} completed, {branch.noShows} no-shows</span></div>
                  <div className="branch-bars"><span style={{ width: `${(branch.collectionsCents / branchMax) * 100}%` }} /><em style={{ width: `${(branch.expensesCents / branchMax) * 100}%` }} /></div>
                  <small>{formatReportCurrency(branch.collectionsCents)} collected</small>
                </button>
              ))}
            </div>
          </article>
        )}

        <article className="panel chart-panel">
          <div className="chart-header"><div><span className="chart-kicker">Appointment funnel</span><h3>Lifecycle performance</h3></div><CalendarCheck2 size={18} /></div>
          <div className="service-bars">
            {snapshot.appointments.byStatus.map((entry) => <div className="service-bar-row compact" key={entry.status}><div className="service-label-group"><strong>{labelize(entry.status)}</strong><span>{entry.count} records</span></div><div className="service-bar-track"><span style={{ width: `${(entry.count / maxOf(snapshot.appointments.byStatus.map((item) => item.count))) * 100}%` }} /></div></div>)}
          </div>
          <div className="executive-rate-row">
            <button type="button" onClick={() => setSelectedPanel('no_shows')}><strong>{formatPercent(snapshot.executive.noShowRate)}</strong><span>No-show rate</span></button>
            <div><strong>{formatPercent(snapshot.executive.cancellationRate)}</strong><span>Cancellation rate</span></div>
          </div>
        </article>

        <article className="panel chart-panel">
          <div className="chart-header"><div><span className="chart-kicker">Busiest periods</span><h3>Days and hours</h3></div><Clock3 size={18} /></div>
          <div className="mini-volume-grid">
            {snapshot.appointments.busiestDays.map((day) => <div key={day.day}><span>{day.day}</span><strong style={{ height: `${Math.max((day.count / dayMax) * 100, day.count ? 8 : 0)}%` }} /><small>{day.count}</small></div>)}
          </div>
          <div className="service-bars">
            {snapshot.appointments.busiestHours.slice(0, 6).map((hour) => <div className="service-bar-row compact" key={hour.hour}><div className="service-label-group"><strong>{hour.hour}</strong><span>{hour.count} appointments</span></div><div className="service-bar-track"><span style={{ width: `${(hour.count / hourMax) * 100}%` }} /></div></div>)}
          </div>
        </article>

        <article className="panel chart-panel">
          <div className="chart-header"><div><span className="chart-kicker">Patient growth</span><h3>New vs returning</h3></div><Users size={18} /></div>
          <div className="patient-growth-split">
            <div><strong>{snapshot.executive.newPatients}</strong><span>New patients seen</span></div>
            <div><strong>{snapshot.executive.returningPatients}</strong><span>Returning patients</span></div>
            <div><strong>{snapshot.executive.activePatients}</strong><span>Active patients</span></div>
          </div>
          <div className="executive-trend-chart compact">
            {snapshot.patients.growthTrend.map((entry) => <div className="executive-trend-col" key={entry.date} title={`${entry.date}: ${entry.newPatients} new, ${entry.returningPatients} returning`}><div className="executive-trend-bars two"><span style={{ height: `${Math.max((entry.newPatients / maxOf(snapshot.patients.growthTrend.map((item) => item.newPatients))) * 100, entry.newPatients ? 8 : 0)}%` }} /><span style={{ height: `${Math.max((entry.returningPatients / maxOf(snapshot.patients.growthTrend.map((item) => item.returningPatients))) * 100, entry.returningPatients ? 8 : 0)}%` }} /></div><small>{entry.label}</small></div>)}
          </div>
        </article>

        <article className="panel chart-panel">
          <div className="chart-header"><div><span className="chart-kicker">Services</span><h3>Top revenue services</h3></div><Receipt size={18} /></div>
          <div className="service-bars">
            {snapshot.treatments.slice(0, 6).map((service) => <div className="service-bar-row" key={service.serviceId}><div className="service-label-group"><strong>{service.serviceName}</strong><span>{service.performedCount} completed, {formatPercent(service.revenueShare)} of revenue</span></div><div className="service-bar-track"><span style={{ width: `${(service.billedRevenueCents / serviceMax) * 100}%` }} /></div><em>{formatCompactCurrency(service.billedRevenueCents)}</em></div>)}
          </div>
        </article>

        <section className="panel table-panel">
          <div className="chart-header"><div><span className="chart-kicker">Provider Performance</span><h3>Clinical activity</h3></div><BarChart3 size={18} /></div>
          <div className="table-scroll"><table className="table"><thead><tr><th>Provider</th><th>Branch</th><th>Patients</th><th>Completed</th><th>Treatments</th><th>Revenue</th><th>Avg Value</th><th>No Shows</th></tr></thead><tbody>{snapshot.providers.slice(0, 8).map((provider) => <tr key={provider.providerId}><td><strong>{provider.providerName}</strong></td><td>{provider.branchNames}</td><td>{provider.patientsSeen}</td><td>{provider.completedVisits}</td><td>{provider.treatments}</td><td>{formatReportCurrency(provider.billedRevenueCents)}</td><td>{formatReportCurrency(provider.averageTreatmentValueCents)}</td><td>{provider.noShows}</td></tr>)}</tbody></table></div>
        </section>

        <article className="panel chart-panel">
          <div className="chart-header"><div><span className="chart-kicker">Payment methods</span><h3>Collection mix</h3></div><Wallet size={18} /></div>
          <div className="service-bars">
            {snapshot.revenue.byPaymentMethod.map((method) => <div className="service-bar-row compact" key={method.method}><div className="service-label-group"><strong>{labelize(method.method)}</strong><span>{formatReportCurrency(method.totalCents)}</span></div><div className="service-bar-track"><span style={{ width: `${(method.totalCents / maxOf(snapshot.revenue.byPaymentMethod.map((item) => item.totalCents))) * 100}%` }} /></div></div>)}
          </div>
        </article>

        <section className="panel table-panel">
          <div className="chart-header"><div><span className="chart-kicker">Accounts receivable</span><h3>Outstanding balances</h3></div><button type="button" className="text-button" onClick={() => setSelectedPanel('receivables')}>Drill down</button></div>
          <div className="table-scroll"><table className="table"><thead><tr><th>Invoice</th><th>Patient</th><th>Branch</th><th>Status</th><th>Balance</th></tr></thead><tbody>{snapshot.revenue.accountsReceivable.slice(0, 6).map((invoice) => <tr key={invoice.invoiceNumber}><td><strong>{invoice.invoiceNumber}</strong><span>{invoice.invoiceDate}</span></td><td>{invoice.patientName}</td><td>{invoice.branchName}</td><td>{labelize(invoice.status)}</td><td>{formatReportCurrency(invoice.balanceCents)}</td></tr>)}</tbody></table></div>
        </section>

        <article className="panel chart-panel">
          <div className="chart-header"><div><span className="chart-kicker">Expenses</span><h3>Category breakdown</h3></div><Link to="/app/expenses" className="text-button">Open</Link></div>
          <div className="service-bars">
            {snapshot.expenses.byCategory.slice(0, 6).map((category) => <div className="service-bar-row" key={category.categoryId}><div className="service-label-group"><strong>{category.categoryName}</strong><span>{category.count} entries</span></div><div className="service-bar-track"><span style={{ width: `${(category.totalCents / maxOf(snapshot.expenses.byCategory.map((item) => item.totalCents))) * 100}%` }} /></div><em>{formatCompactCurrency(category.totalCents)}</em></div>)}
          </div>
        </article>

        <section className="panel table-panel">
          <div className="chart-header"><div><span className="chart-kicker">Inventory and Purchasing</span><h3>Management alerts</h3></div><button type="button" className="text-button" onClick={() => setSelectedPanel('low_stock')}>Review</button></div>
          <div className="executive-context-stack horizontal">
            <div><span>Low stock</span><strong>{snapshot.inventory.lowStockItems}</strong></div>
            <div><span>Out of stock</span><strong>{snapshot.inventory.outOfStockItems}</strong></div>
            <div><span>Purchases</span><strong>{formatCompactCurrency(snapshot.inventory.purchaseTotalCents)}</strong></div>
            <div><span>Inventory value</span><strong>{formatCompactCurrency(snapshot.inventory.inventoryValuationCents)}</strong></div>
          </div>
          <div className="table-scroll"><table className="table"><thead><tr><th>Item</th><th>Branch</th><th>Current</th><th>Minimum</th><th>Status</th></tr></thead><tbody>{lowStockRows.map((stock) => <tr key={`${stock.itemId}-${stock.branchName}`}><td><strong>{stock.itemName}</strong></td><td>{stock.branchName}</td><td>{stock.quantityOnHand}</td><td>{stock.reorderLevel}</td><td>{labelize(stock.status)}</td></tr>)}</tbody></table></div>
        </section>

        <article className="panel chart-panel chart-panel-wide">
          <div className="chart-header"><div><span className="chart-kicker">Deterministic insights</span><h3>Management signals</h3></div><AlertTriangle size={18} /></div>
          <div className="insight-list">
            {snapshot.insights.map((insight) => <div className={`insight-note insight-${insight.tone}`} key={insight.title}><strong>{insight.title}</strong><span>{insight.detail}</span></div>)}
            {snapshot.dataQuality.length > 0 && <button type="button" className="insight-note insight-warning" onClick={() => setSelectedPanel('data_quality')}><strong>Data quality</strong><span>{snapshot.dataQuality.reduce((sum, issue) => sum + issue.count, 0)} records require review before management sign-off.</span></button>}
          </div>
        </article>
      </div>

      {selectedPanel && (
        <div className="analytics-drawer-backdrop" onClick={() => setSelectedPanel(null)}>
          <aside className="analytics-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="chart-header"><div><span className="chart-kicker">Drill Down</span><h3>{labelize(selectedPanel)}</h3></div><button type="button" className="text-button" onClick={() => setSelectedPanel(null)}>Close</button></div>
            {selectedPanel === 'receivables' && <div className="mini-list">{snapshot.revenue.accountsReceivable.slice(0, 12).map((invoice) => <Link to="/app/billing" className="mini-row" key={invoice.invoiceNumber}><div><strong>{invoice.invoiceNumber}</strong><small>{invoice.patientName} - {invoice.branchName}</small></div><span>{formatReportCurrency(invoice.balanceCents)}</span></Link>)}</div>}
            {selectedPanel === 'no_shows' && <div className="mini-list">{snapshot.appointments.details.filter((appointment) => appointment.status === 'no_show').slice(0, 12).map((appointment) => <Link to="/app/appointments" className="mini-row" key={appointment.appointmentNumber}><div><strong>{appointment.patientName}</strong><small>{appointment.date} - {appointment.providerName}</small></div><span>{appointment.branchName}</span></Link>)}</div>}
            {selectedPanel === 'low_stock' && <div className="mini-list">{lowStockRows.map((stock) => <Link to="/app/inventory" className="mini-row" key={`${stock.itemId}-${stock.branchName}`}><div><strong>{stock.itemName}</strong><small>{stock.branchName}</small></div><span>{stock.quantityOnHand}/{stock.reorderLevel}</span></Link>)}</div>}
            {selectedPanel === 'data_quality' && <div className="mini-list">{snapshot.dataQuality.map((issue) => <div className="mini-row" key={issue.area}><div><strong>{issue.area}</strong><small>{issue.message}</small></div><span>{issue.count}</span></div>)}</div>}
          </aside>
        </div>
      )}

      <NotificationCenter userId={adminUserId} />
    </section>
  )
}
