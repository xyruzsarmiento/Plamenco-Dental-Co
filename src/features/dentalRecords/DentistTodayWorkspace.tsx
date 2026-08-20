import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarClock, ClipboardList, Clock3, Stethoscope, UserRound } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { DashboardBarChart, DashboardTrendChart } from '../../components/ui/DashboardChart'
import { getStoredAppointments, transitionAppointmentStatus } from '../appointments/appointmentStore'
import type { Appointment } from '../appointments/appointmentTypes'
import { useAuth } from '../auth/AuthContext'
import { usePermissions } from '../auth/permissions'
import { getStoredBranches } from '../branches/branchStore'
import { getProviderBranchAssignments, getStoredProviders } from '../dentists/dentistStore'
import { getStoredPatients } from '../patients/patientStore'
import type { Patient } from '../patients/patientTypes'
import { getStoredServices } from '../services/serviceStore'
import { createClinicalVisitFromAppointment, getClinicalVisitByAppointment } from './dentalRecordStore'

function manilaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function manilaDateOffset(days: number) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function dayLabel(value: string) {
  return new Date(`${value}T00:00:00+08:00`).toLocaleDateString('en-PH', { weekday: 'short', timeZone: 'Asia/Manila' })
}

function formatTime(value: string) {
  const [hourValue, minuteValue] = value.split(':').map(Number)
  const hour = hourValue % 12 || 12
  return `${hour}:${String(minuteValue).padStart(2, '0')} ${hourValue >= 12 ? 'PM' : 'AM'}`
}

function minutesSince(value?: string) {
  if (!value) return null
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return null
  return Math.max(0, Math.floor((Date.now() - time) / 60_000))
}

function patientDisplay(patient?: Patient) {
  if (!patient) return 'Unknown patient'
  return patient.fullName || [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ')
}

function statusLabel(status: Appointment['status']) {
  const labels: Record<Appointment['status'], string> = {
    pending: 'Pending',
    confirmed: 'Scheduled',
    checked_in: 'Checked In',
    waiting: 'Waiting',
    in_progress: 'In Treatment',
    completed: 'Completed',
    cancelled: 'Cancelled',
    rejected: 'Rejected',
    no_show: 'No Show',
    rescheduled: 'Rescheduled',
  }
  return labels[status]
}

export function DentistTodayWorkspace() {
  const { user } = useAuth()
  const permissions = usePermissions()
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState(() => getStoredAppointments())
  const [message, setMessage] = useState<string | null>(null)
  const today = manilaDate()

  const providers = useMemo(() => getStoredProviders(), [])
  const provider = useMemo(() => providers.find((entry) => (
    entry.profileId === user?.id || entry.email.toLowerCase() === user?.email?.toLowerCase()
  )), [providers, user?.email, user?.id])
  const assignments = useMemo(() => getProviderBranchAssignments(), [])
  const branches = useMemo(() => getStoredBranches(), [])
  const services = useMemo(() => getStoredServices(), [])
  const patients = useMemo(() => getStoredPatients(), [])
  const patientMap = useMemo(() => new Map(patients.flatMap((patient) => [[patient.id, patient], [patient.patientId, patient]] as const)), [patients])
  const serviceMap = useMemo(() => new Map(services.map((service) => [service.id, service])), [services])
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches])
  const providerBranchIds = useMemo(() => new Set(assignments.filter((entry) => entry.providerId === provider?.id && entry.status === 'active').map((entry) => entry.branchId)), [assignments, provider?.id])

  const assignedAppointments = useMemo(() => appointments.filter((appointment) => provider ? appointment.providerId === provider.id : false), [appointments, provider])
  const todayAppointments = useMemo(() => assignedAppointments
    .filter((appointment) => appointment.date === today)
    .filter((appointment) => !providerBranchIds.size || !appointment.branchId || providerBranchIds.has(appointment.branchId))
    .sort((left, right) => left.startTime.localeCompare(right.startTime)), [assignedAppointments, providerBranchIds, today])

  const activeQueue = todayAppointments.filter((appointment) => ['checked_in', 'waiting', 'in_progress'].includes(appointment.status))
  const waitingCount = todayAppointments.filter((appointment) => ['checked_in', 'waiting'].includes(appointment.status)).length
  const inTreatmentCount = todayAppointments.filter((appointment) => appointment.status === 'in_progress').length
  const completedCount = todayAppointments.filter((appointment) => appointment.status === 'completed').length
  const remainingCount = todayAppointments.filter((appointment) => ['pending', 'confirmed', 'checked_in', 'waiting', 'in_progress'].includes(appointment.status)).length
  const nextAppointment = todayAppointments.find((appointment) => !['completed', 'cancelled', 'rejected', 'no_show', 'rescheduled'].includes(appointment.status))
  const trendData = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = manilaDateOffset(index - 6)
    return { label: dayLabel(date), value: assignedAppointments.filter((row) => row.date === date).length }
  }), [assignedAppointments])
  const statusData = useMemo(() => [
    { label: 'Scheduled', value: todayAppointments.filter((row) => row.status === 'confirmed').length },
    { label: 'Waiting', value: waitingCount },
    { label: 'In treatment', value: inTreatmentCount },
    { label: 'Completed', value: completedCount },
  ], [completedCount, inTreatmentCount, todayAppointments, waitingCount])

  function refresh() {
    setAppointments(getStoredAppointments())
  }

  function startVisit(appointment: Appointment) {
    if (!user || !permissions.can('appointments.start')) return
    const result = transitionAppointmentStatus(appointment.id, 'in_progress', {
      actor: user.name || user.email,
      expectedUpdatedAt: appointment.updatedAt,
    })
    if (!result.appointment) {
      setMessage(result.error ?? 'Visit could not be started.')
      refresh()
      return
    }
    createClinicalVisitFromAppointment(result.appointment, user.name || user.email)
    setMessage('Visit started. Clinical workspace is ready.')
    refresh()
    navigate(`/app/dental-records?appointment=${encodeURIComponent(appointment.id)}`)
  }

  if (!provider) {
    return (
      <section className="page-stack">
        <div className="panel">
          <h2>Dentist profile is not linked</h2>
          <p>Your authenticated account is not mapped to a provider profile. Ask an administrator to link the provider profile before clinical work is shown.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="page-stack dentist-today-workspace">
      <div className="page-header">
        <div>
          <p className="eyebrow">Today's Clinical Workspace</p>
          <h2>{provider.displayName}</h2>
          <p>{branches.filter((branch) => providerBranchIds.has(branch.id)).map((branch) => branch.name).join(' · ') || 'Assigned clinical schedule'}</p>
        </div>
        <div className="action-buttons">
          <Link to="/app/appointments"><Button variant="secondary"><CalendarClock size={16} /> My Schedule</Button></Link>
          <Link to="/app/patients"><Button variant="secondary"><UserRound size={16} /> Search Patient</Button></Link>
        </div>
      </div>

      {message && <div className="success-alert">{message}</div>}

      <div className="stats-grid dashboard-stats-grid">
        <article className="stat-card"><span>Appointments Today</span><strong>{todayAppointments.length}</strong><small>Assigned to you</small></article>
        <article className="stat-card"><span>Waiting</span><strong>{waitingCount}</strong><small>Checked in / waiting</small></article>
        <article className="stat-card"><span>In Treatment</span><strong>{inTreatmentCount}</strong><small>Active clinical visits</small></article>
        <article className="stat-card"><span>Completed</span><strong>{completedCount}</strong><small>Today</small></article>
        <article className="stat-card"><span>Remaining</span><strong>{remainingCount}</strong><small>Still in today's workflow</small></article>
      </div>

      <div className="dashboard-chart-grid">
        <DashboardTrendChart title="My assigned appointments" description="Actual assigned visits across the last 7 days." data={trendData} />
        <DashboardBarChart title="Today’s clinical flow" description="Current status of your assigned patients." data={statusData} />
      </div>

      {nextAppointment && (() => {
        const patient = patientMap.get(nextAppointment.patientId)
        const service = serviceMap.get(nextAppointment.serviceId)
        const alerts = [patient?.allergies, patient?.medicalConditions, patient?.currentMedications].filter(Boolean).length
        return (
          <article className="panel">
            <div className="panel-header compact-header">
              <div><p className="eyebrow">Next Patient</p><h3>{patientDisplay(patient)}</h3></div>
              <Badge tone={nextAppointment.status === 'waiting' ? 'warning' : nextAppointment.status === 'in_progress' ? 'success' : 'info'}>{statusLabel(nextAppointment.status)}</Badge>
            </div>
            <div className="details-grid">
              <div className="detail-item"><span className="label">Time</span><span className="value">{formatTime(nextAppointment.startTime)}</span></div>
              <div className="detail-item"><span className="label">Service / reason</span><span className="value">{service?.name ?? nextAppointment.reasonForVisit ?? 'Not specified'}</span></div>
              <div className="detail-item"><span className="label">Branch</span><span className="value">{nextAppointment.branchId ? branchMap.get(nextAppointment.branchId)?.name ?? 'Unknown / Unmapped' : 'Unknown / Unmapped'}</span></div>
              <div className="detail-item"><span className="label">Medical information</span><span className="value">{alerts ? `${alerts} recorded item${alerts === 1 ? '' : 's'} to review` : 'No medical alerts recorded'}</span></div>
            </div>
            <div className="action-buttons">
              <Link to={`/app/patients/${encodeURIComponent(patient?.patientId ?? nextAppointment.patientId)}`}><Button variant="secondary">Open Patient</Button></Link>
              {['checked_in', 'waiting'].includes(nextAppointment.status) && permissions.can('appointments.start') && <Button onClick={() => startVisit(nextAppointment)}><Stethoscope size={16} /> Start Visit</Button>}
              {getClinicalVisitByAppointment(nextAppointment.id) && <Link to={`/app/dental-records?appointment=${encodeURIComponent(nextAppointment.id)}`}><Button><ClipboardList size={16} /> Clinical Record</Button></Link>}
            </div>
          </article>
        )
      })()}

      <section className="panel">
        <div className="panel-header compact-header">
          <div><p className="eyebrow">Clinical Queue</p><h3>Patients in active flow</h3></div>
          <span className="muted-label"><Clock3 size={14} /> {activeQueue.length} active</span>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Time</th><th>Patient</th><th>Service</th><th>Branch</th><th>Status</th><th>Wait</th><th>Action</th></tr></thead>
            <tbody>
              {activeQueue.map((appointment) => {
                const patient = patientMap.get(appointment.patientId)
                const waitMinutes = ['checked_in', 'waiting'].includes(appointment.status) ? minutesSince(appointment.waitingAt ?? appointment.checkedInAt) : null
                return (
                  <tr key={appointment.id}>
                    <td><strong>{formatTime(appointment.startTime)}</strong></td>
                    <td><strong>{patientDisplay(patient)}</strong><span>{patient?.patientId ?? appointment.patientId}</span></td>
                    <td>{serviceMap.get(appointment.serviceId)?.name ?? appointment.reasonForVisit ?? 'Not specified'}</td>
                    <td>{appointment.branchId ? branchMap.get(appointment.branchId)?.name ?? 'Unknown / Unmapped' : 'Unknown / Unmapped'}</td>
                    <td><Badge tone={appointment.status === 'in_progress' ? 'success' : 'warning'}>{statusLabel(appointment.status)}</Badge></td>
                    <td>{waitMinutes === null ? '—' : `${waitMinutes} min`}</td>
                    <td>
                      <div className="action-buttons">
                        {['checked_in', 'waiting'].includes(appointment.status) && permissions.can('appointments.start') && <button type="button" className="text-button" onClick={() => startVisit(appointment)}>Start Visit</button>}
                        <Link className="text-button" to={`/app/patients/${encodeURIComponent(patient?.patientId ?? appointment.patientId)}`}>Patient</Link>
                        {getClinicalVisitByAppointment(appointment.id) && <Link className="text-button" to={`/app/dental-records?appointment=${encodeURIComponent(appointment.id)}`}>Clinical</Link>}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!activeQueue.length && <tr><td colSpan={7}>No patients are currently checked in, waiting, or in treatment.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header compact-header"><h3>Today's Schedule</h3><Link className="text-button" to="/app/appointments">Open full schedule</Link></div>
        <div className="mini-list">
          {todayAppointments.map((appointment) => {
            const patient = patientMap.get(appointment.patientId)
            return <div className="mini-row" key={appointment.id}><div><strong>{formatTime(appointment.startTime)} · {patientDisplay(patient)}</strong><small>{serviceMap.get(appointment.serviceId)?.name ?? appointment.reasonForVisit ?? 'Not specified'}</small></div><span>{statusLabel(appointment.status)}</span></div>
          })}
          {!todayAppointments.length && <div className="empty-state compact"><h2>0</h2><p>No appointments are assigned to you today.</p></div>}
        </div>
      </section>
    </section>
  )
}
