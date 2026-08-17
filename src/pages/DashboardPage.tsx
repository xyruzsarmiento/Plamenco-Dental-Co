import {
  ArrowUpRight,
  CalendarCheck2,
  Clock3,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { useAuth } from '../features/auth/AuthContext'
import {
  getOutstandingBalanceTotal,
  getStoredInvoices,
  getStoredPayments,
  getTodayRevenue,
} from '../features/billing/billingStore'
import { getStoredAppointments, getTodayAppointments } from '../features/appointments/appointmentStore'
import { getStoredPatients } from '../features/patients/patientStore'
import { formatAuditAction, getRecentAuditLogs } from '../features/security/auditLogStore'
import { getStoredStaff } from '../features/auth/staffStore'
import { NotificationCenter } from '../features/notifications/NotificationCenter'

const workflowSteps = ['Patient', 'Appointment', 'Visit', 'Record', 'Treatment', 'Billing', 'Follow-up']

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function DashboardPage() {
  const { user } = useAuth()
  const adminUserId = user?.id ?? user?.email ?? 'admin'
  const allAppointments = getStoredAppointments()
  const todayAppointments = getTodayAppointments().filter((item) => item.status !== 'cancelled' && item.status !== 'no_show')
  const pendingRequests = allAppointments.filter((item) => item.status === 'pending')
  const patients = getStoredPatients()
  const staff = getStoredStaff()
  const payments = getStoredPayments()
  const invoices = getStoredInvoices()
  const recentActivity = getRecentAuditLogs(5).map((entry) => {
    const activity = formatAuditAction(entry.action)
    return {
      ...entry,
      label: activity.label,
      summary: activity.description,
    }
  })
  const recentPatients = [...patients]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
  const upcomingAppointments = [...allAppointments]
    .filter((item) => item.status !== 'cancelled' && item.status !== 'no_show')
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
    .slice(0, 5)

  const todayRevenue = getTodayRevenue()
  const monthlyRevenue = payments
    .filter((payment) => {
      const currentMonth = new Date().toISOString().slice(0, 7)
      return payment.date.startsWith(currentMonth)
    })
    .reduce((sum, payment) => sum + payment.amountCents, 0)
  const outstandingBalance = getOutstandingBalanceTotal()
  const pendingBalanceCount = invoices.filter((invoice) => invoice.balanceCents > 0).length
  const activePatients = patients.filter((patient) => patient.status === 'active').length
  const completedVisits = todayAppointments.filter((appointment) => appointment.status === 'completed').length
  const visitCompletionRate = todayAppointments.length ? Math.round((completedVisits / todayAppointments.length) * 100) : 0
  const confirmedToday = todayAppointments.filter((appointment) => appointment.status === 'confirmed' || appointment.status === 'checked_in').length
  const activeStaff = staff.filter((member) => member.status === 'active').length

  const statusBreakdown = ['pending', 'confirmed', 'checked_in', 'in_progress', 'completed'].map((status) => ({
    status,
    count: todayAppointments.filter((appointment) => appointment.status === status).length,
  }))

  return (
    <section className="premium-dashboard page-stack">
      <div className="dashboard-intro">
        <div className="dashboard-intro-copy">
          <Badge tone="success">Clinic overview</Badge>
          <h2>Premium clinic command center</h2>
          <p>Track patient flow, care delivery, and financial health from one operational dashboard built for real clinic activity.</p>
        </div>
        <div className="dashboard-pill-row">
          <span className="dashboard-pill"><CalendarCheck2 size={14} /> {todayAppointments.length} scheduled</span>
          <span className="dashboard-pill"><Users size={14} /> {activePatients} active patients</span>
        </div>
      </div>

      <div className="stats-grid dashboard-stats-grid">
        <article className="stat-card stat-card-primary">
          <span>Revenue</span>
          <strong>{formatCurrency(monthlyRevenue)}</strong>
          <small>{payments.length > 0 ? `${payments.length} payments this month` : 'No payment records yet'}</small>
        </article>
        <article className="stat-card">
          <span>Today&apos;s revenue</span>
          <strong>{formatCurrency(todayRevenue)}</strong>
          <small>{todayRevenue > 0 ? 'Collected today' : 'No payments recorded today'}</small>
        </article>
        <article className="stat-card">
          <span>Appointments</span>
          <strong>{todayAppointments.length}</strong>
          <small>{todayAppointments.length === 0 ? 'No appointments scheduled' : `${confirmedToday} confirmed`}</small>
        </article>
        <article className="stat-card">
          <span>Pending requests</span>
          <strong>{pendingRequests.length}</strong>
          <small>{pendingRequests.length === 0 ? 'All clear' : 'Awaiting review'}</small>
        </article>
        <article className="stat-card">
          <span>Outstanding</span>
          <strong>{formatCurrency(outstandingBalance)}</strong>
          <small>{pendingBalanceCount} unpaid balances</small>
        </article>
        <article className="stat-card">
          <span>Completion rate</span>
          <strong>{visitCompletionRate}%</strong>
          <small>{completedVisits} completed visits</small>
        </article>
        <article className="stat-card">
          <span>Active staff</span>
          <strong>{activeStaff}</strong>
          <small>{staff.length} team members on roster</small>
        </article>
      </div>

      <div className="workflow-strip" aria-label="Core workflow">
        {workflowSteps.map((step, index) => (
          <div className="workflow-step" key={step}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </div>

      <div className="dashboard-grid dashboard-main-grid">
        <article className="panel dashboard-panel">
          <div className="panel-header compact-header">
            <h3>Today&apos;s schedule</h3>
            <span className="muted-label">{todayAppointments.length} on the day</span>
          </div>

          {todayAppointments.length === 0 ? (
            <div className="empty-state compact">
              <h2>0</h2>
              <p>No appointments are scheduled for today yet.</p>
            </div>
          ) : (
            <div className="queue-list">
              {todayAppointments.map((appointment) => {
                const patient = patients.find((entry) => entry.id === appointment.patientId)
                return (
                  <div key={appointment.id} className="queue-item">
                    <div className="queue-item-time">
                      <strong>{appointment.startTime}</strong>
                      <small>{appointment.endTime}</small>
                    </div>
                    <div className="queue-item-info">
                      <strong>{patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown patient'}</strong>
                      <small>{appointment.notes || 'General consultation'}</small>
                    </div>
                    <span className={`status-badge status-${appointment.status}`}>{appointment.status}</span>
                  </div>
                )
              })}
            </div>
          )}
        </article>

        <article className="panel dashboard-panel">
          <div className="panel-header compact-header">
            <h3>Revenue snapshot</h3>
            <TrendingUp size={18} className="focus-icon" />
          </div>

          <div className="insight-stack">
            <div className="insight-card">
              <span>Collected today</span>
              <strong>{formatCurrency(todayRevenue)}</strong>
            </div>
            <div className="insight-card">
              <span>Monthly total</span>
              <strong>{formatCurrency(monthlyRevenue)}</strong>
            </div>
          </div>

          <div className="revenue-bars" aria-label="Revenue breakdown">
            {statusBreakdown.map(({ status, count }) => (
              <div key={status} className="revenue-bar-row">
                <div className="revenue-bar-label-row">
                  <span>{status.replace('_', ' ')}</span>
                  <strong>{count}</strong>
                </div>
                <div className="revenue-bar-track">
                  <span style={{ width: `${todayAppointments.length ? (count / todayAppointments.length) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="dashboard-grid dashboard-insights-grid">
        <article className="panel dashboard-panel">
          <div className="panel-header compact-header">
            <h3>Patient flow</h3>
            <ArrowUpRight size={18} className="focus-icon" />
          </div>

          <div className="flow-grid">
            <div className="flow-card">
              <strong>{pendingRequests.length}</strong>
              <span>Pending requests</span>
            </div>
            <div className="flow-card">
              <strong>{upcomingAppointments.length}</strong>
              <span>Upcoming</span>
            </div>
            <div className="flow-card">
              <strong>{patients.length}</strong>
              <span>Total patients</span>
            </div>
          </div>

          <div className="progress-list">
            {statusBreakdown.map(({ status, count }) => (
              <div key={status} className="progress-row">
                <div className="progress-meta">
                  <span>{status.replace('_', ' ')}</span>
                  <strong>{count}</strong>
                </div>
                <div className="progress-track">
                  <span style={{ width: `${todayAppointments.length ? (count / todayAppointments.length) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel dashboard-panel">
          <div className="panel-header compact-header">
            <h3>Operations</h3>
            <Wallet size={18} className="focus-icon" />
          </div>

          <div className="operations-stack">
            <div className="ops-row">
              <div>
                <span className="ops-label">Care team</span>
                <strong>{activeStaff} active</strong>
              </div>
              <Badge tone="success">On duty</Badge>
            </div>
            <div className="ops-row">
              <div>
                <span className="ops-label">Open balances</span>
                <strong>{pendingBalanceCount}</strong>
              </div>
              <Badge tone="warning">Review</Badge>
            </div>
            <div className="ops-row">
              <div>
                <span className="ops-label">Recent activity</span>
                <strong>{recentActivity.length}</strong>
              </div>
              <Badge tone="info">Live</Badge>
            </div>
          </div>
        </article>
      </div>

      <div className="dashboard-lower-grid">
        <article className="panel dashboard-list-panel">
          <div className="panel-header compact-header">
            <h3>Recent patients</h3>
            <span className="muted-label"><UserPlus size={14} /> {patients.length}</span>
          </div>

          {recentPatients.length === 0 ? (
            <div className="empty-state compact">
              <h2>0</h2>
              <p>No patient records have been created yet.</p>
            </div>
          ) : (
            <div className="mini-list">
              {recentPatients.map((patient) => (
                <div key={patient.id} className="mini-row">
                  <div>
                    <strong>{patient.firstName} {patient.lastName}</strong>
                    <small>{patient.patientId}</small>
                  </div>
                  <span>{formatDate(patient.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel dashboard-list-panel">
          <div className="panel-header compact-header">
            <h3>Recent activity</h3>
            <span className="muted-label"><Clock3 size={14} /> {recentActivity.length}</span>
          </div>

          {recentActivity.length === 0 ? (
            <div className="empty-state compact">
              <h2>0</h2>
              <p>No recent activity yet.</p>
            </div>
          ) : (
            <div className="activity-timeline">
              {recentActivity.map((entry) => (
                <div key={entry.id} className="activity-item">
                  <div className="activity-bullet" />
                  <div className="activity-copy">
                    <strong>{entry.label}</strong>
                    <span>{entry.summary}</span>
                    <small>{formatDate(entry.timestamp)}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>

      <NotificationCenter userId={adminUserId} />
    </section>
  )
}
