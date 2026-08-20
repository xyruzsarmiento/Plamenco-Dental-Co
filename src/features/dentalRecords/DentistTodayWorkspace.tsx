import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileSignature,
  FileText,
  HeartPulse,
  History,
  ListTodo,
  Stethoscope,
  UserRound,
} from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
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

function statusTone(status: Appointment['status']): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'completed') return 'success'
  if (status === 'in_progress') return 'info'
  if (status === 'checked_in' || status === 'waiting' || status === 'pending') return 'warning'
  if (status === 'cancelled' || status === 'rejected' || status === 'no_show') return 'danger'
  return 'neutral'
}

function MedicalContext({ patient }: { patient?: Patient }) {
  const items = [
    { label: 'Allergies', value: patient?.allergies, icon: AlertTriangle },
    { label: 'Medical conditions', value: patient?.medicalConditions, icon: HeartPulse },
    { label: 'Current medications', value: patient?.currentMedications, icon: ClipboardList },
  ]

  const hasAlerts = items.some((item) => item.value?.trim())

  return (
    <div className={`dentist-medical-context ${hasAlerts ? 'has-context' : ''}`}>
      <div className="dentist-medical-context-header">
        <div>
          <span className="dentist-kicker">Medical context</span>
          <strong>{hasAlerts ? 'Review before treatment' : 'No medical alerts recorded'}</strong>
        </div>
        <Badge tone={hasAlerts ? 'warning' : 'success'}>{hasAlerts ? 'Review' : 'Clear'}</Badge>
      </div>
      <div className="dentist-medical-grid">
        {items.map(({ label, value, icon: Icon }) => (
          <div key={label} className="dentist-medical-item">
            <Icon size={16} />
            <div>
              <span>{label}</span>
              <strong>{value?.trim() || 'None recorded'}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
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

  const todayAppointments = useMemo(() => appointments
    .filter((appointment) => appointment.date === today)
    .filter((appointment) => provider ? appointment.providerId === provider.id : false)
    .filter((appointment) => !providerBranchIds.size || !appointment.branchId || providerBranchIds.has(appointment.branchId))
    .sort((left, right) => left.startTime.localeCompare(right.startTime)), [appointments, provider, providerBranchIds, today])

  const activeQueue = todayAppointments.filter((appointment) => ['checked_in', 'waiting', 'in_progress'].includes(appointment.status))
  const waitingCount = todayAppointments.filter((appointment) => ['checked_in', 'waiting'].includes(appointment.status)).length
  const inTreatmentCount = todayAppointments.filter((appointment) => appointment.status === 'in_progress').length
  const completedCount = todayAppointments.filter((appointment) => appointment.status === 'completed').length
  const remainingCount = todayAppointments.filter((appointment) => ['pending', 'confirmed', 'checked_in', 'waiting', 'in_progress'].includes(appointment.status)).length
  const nextAppointment = todayAppointments.find((appointment) => !['completed', 'cancelled', 'rejected', 'no_show', 'rescheduled'].includes(appointment.status))

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
      <section className="page-stack dentist-today-workspace">
        <div className="panel dentist-link-required">
          <Stethoscope size={28} />
          <h2>Dentist profile is not linked</h2>
          <p>Your authenticated account is not mapped to a provider profile. Ask an administrator to link the provider profile before clinical work is shown.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="page-stack dentist-today-workspace">
      <div className="dentist-hero">
        <div className="dentist-hero-copy">
          <span className="dentist-kicker">Today’s clinical workspace</span>
          <h2>{provider.displayName}</h2>
          <p>{branches.filter((branch) => providerBranchIds.has(branch.id)).map((branch) => branch.name).join(' · ') || 'Assigned clinical schedule'}</p>
        </div>
        <div className="dentist-hero-actions">
          <Link to="/app/appointments"><Button variant="secondary"><CalendarClock size={16} /> My schedule</Button></Link>
          <Link to="/app/patients"><Button variant="secondary"><UserRound size={16} /> Search patient</Button></Link>
          <Link to="/app/dental-records"><Button><FileText size={16} /> Clinical records</Button></Link>
        </div>
      </div>

      {message && <div className="success-alert" role="status">{message}</div>}

      <div className="dentist-metrics" aria-label="Today overview">
        <article><span>Today</span><strong>{todayAppointments.length}</strong><small>Assigned appointments</small></article>
        <article><span>Waiting</span><strong>{waitingCount}</strong><small>Checked in / waiting</small></article>
        <article><span>In treatment</span><strong>{inTreatmentCount}</strong><small>Active clinical visits</small></article>
        <article><span>Completed</span><strong>{completedCount}</strong><small>Finished today</small></article>
        <article><span>Remaining</span><strong>{remainingCount}</strong><small>Still in workflow</small></article>
      </div>

      <div className="dentist-workspace-grid">
        <div className="dentist-workspace-main">
          {nextAppointment ? (() => {
            const patient = patientMap.get(nextAppointment.patientId)
            const service = serviceMap.get(nextAppointment.serviceId)
            const visit = getClinicalVisitByAppointment(nextAppointment.id)

            return (
              <article className="panel dentist-focus-card">
                <div className="dentist-focus-header">
                  <div>
                    <span className="dentist-kicker">Next patient</span>
                    <h3>{patientDisplay(patient)}</h3>
                    <p>{patient?.patientId ?? nextAppointment.patientId} · {formatTime(nextAppointment.startTime)} · {service?.name ?? nextAppointment.reasonForVisit ?? 'Visit'}</p>
                  </div>
                  <Badge tone={statusTone(nextAppointment.status)}>{statusLabel(nextAppointment.status)}</Badge>
                </div>

                <div className="dentist-patient-summary">
                  <div><span>Branch</span><strong>{nextAppointment.branchId ? branchMap.get(nextAppointment.branchId)?.name ?? 'Unknown / Unmapped' : 'Unknown / Unmapped'}</strong></div>
                  <div><span>Reason</span><strong>{nextAppointment.reasonForVisit || service?.name || 'Not specified'}</strong></div>
                  <div><span>Clinical record</span><strong>{visit ? 'Existing visit record' : 'Not started'}</strong></div>
                  <div><span>Patient notes</span><strong>{nextAppointment.patientNotes?.trim() || 'None provided'}</strong></div>
                </div>

                <MedicalContext patient={patient} />

                <div className="dentist-focus-actions">
                  <Link to={`/app/patients/${encodeURIComponent(patient?.patientId ?? nextAppointment.patientId)}`}><Button variant="secondary">Patient summary</Button></Link>
                  <Link to="/app/treatment-plans"><Button variant="secondary"><ClipboardList size={16} /> Treatment plans</Button></Link>
                  {['checked_in', 'waiting'].includes(nextAppointment.status) && permissions.can('appointments.start') && (
                    <Button onClick={() => startVisit(nextAppointment)}><Stethoscope size={16} /> Start visit</Button>
                  )}
                  {visit && <Link to={`/app/dental-records?appointment=${encodeURIComponent(nextAppointment.id)}`}><Button><ClipboardCheck size={16} /> Open clinical record</Button></Link>}
                </div>

                <div className="dentist-clinical-note">
                  <FileText size={16} />
                  <span><strong>Clinical documentation:</strong> draft records remain editable until finalized; amendments should be recorded separately after finalization.</span>
                </div>
              </article>
            )
          })() : (
            <article className="panel dentist-focus-card dentist-empty-focus">
              <Stethoscope size={28} />
              <h3>No remaining patient scheduled</h3>
              <p>There are no active or upcoming assigned visits left in today’s schedule.</p>
            </article>
          )}

          <section className="panel dentist-queue-panel">
            <div className="panel-header compact-header">
              <div><span className="dentist-kicker">Active flow</span><h3>Clinical queue</h3></div>
              <span className="muted-label"><Clock3 size={14} /> {activeQueue.length} active</span>
            </div>
            <div className="table-scroll">
              <table className="table dentist-table">
                <thead><tr><th>Time</th><th>Patient</th><th>Visit</th><th>Status</th><th>Wait</th><th>Clinical action</th></tr></thead>
                <tbody>
                  {activeQueue.map((appointment) => {
                    const patient = patientMap.get(appointment.patientId)
                    const waitMinutes = ['checked_in', 'waiting'].includes(appointment.status) ? minutesSince(appointment.waitingAt ?? appointment.checkedInAt) : null
                    const visit = getClinicalVisitByAppointment(appointment.id)
                    return (
                      <tr key={appointment.id}>
                        <td><strong>{formatTime(appointment.startTime)}</strong></td>
                        <td><strong>{patientDisplay(patient)}</strong><span>{patient?.patientId ?? appointment.patientId}</span></td>
                        <td>{serviceMap.get(appointment.serviceId)?.name ?? appointment.reasonForVisit ?? 'Not specified'}</td>
                        <td><Badge tone={statusTone(appointment.status)}>{statusLabel(appointment.status)}</Badge></td>
                        <td>{waitMinutes === null ? '—' : `${waitMinutes} min`}</td>
                        <td>
                          <div className="action-buttons">
                            {['checked_in', 'waiting'].includes(appointment.status) && permissions.can('appointments.start') && <button type="button" className="text-button" onClick={() => startVisit(appointment)}>Start visit</button>}
                            <Link className="text-button" to={`/app/patients/${encodeURIComponent(patient?.patientId ?? appointment.patientId)}`}>Patient</Link>
                            {visit && <Link className="text-button" to={`/app/dental-records?appointment=${encodeURIComponent(appointment.id)}`}>Record</Link>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {!activeQueue.length && <tr><td colSpan={6}>No patients are currently checked in, waiting, or in treatment.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel dentist-schedule-panel">
            <div className="panel-header compact-header"><div><span className="dentist-kicker">Schedule</span><h3>Today’s patients</h3></div><Link className="text-button" to="/app/appointments">Full schedule</Link></div>
            <div className="dentist-schedule-list">
              {todayAppointments.map((appointment) => {
                const patient = patientMap.get(appointment.patientId)
                return (
                  <div className="dentist-schedule-row" key={appointment.id}>
                    <div className="dentist-schedule-time"><strong>{formatTime(appointment.startTime)}</strong><small>{appointment.endTime ? formatTime(appointment.endTime) : ''}</small></div>
                    <div className="dentist-schedule-patient"><strong>{patientDisplay(patient)}</strong><small>{serviceMap.get(appointment.serviceId)?.name ?? appointment.reasonForVisit ?? 'Not specified'}</small></div>
                    <Badge tone={statusTone(appointment.status)}>{statusLabel(appointment.status)}</Badge>
                    <Link className="text-button" to={`/app/patients/${encodeURIComponent(patient?.patientId ?? appointment.patientId)}`}>Open</Link>
                  </div>
                )
              })}
              {!todayAppointments.length && <div className="empty-state compact"><h2>0</h2><p>No appointments are assigned to you today.</p></div>}
            </div>
          </section>
        </div>

        <aside className="dentist-workspace-aside">
          <section className="panel dentist-quick-panel">
            <span className="dentist-kicker">Clinical tools</span>
            <h3>Patient care workspace</h3>
            <nav className="dentist-quick-links" aria-label="Dentist clinical tools">
              <Link to="/app/dental-records"><FileText size={18} /><span><strong>Clinical records</strong><small>Draft, finalize, and amend records</small></span></Link>
              <Link to="/app/treatments"><History size={18} /><span><strong>Treatment history</strong><small>Review completed and active treatments</small></span></Link>
              <Link to="/app/treatment-plans"><ClipboardList size={18} /><span><strong>Treatment plans</strong><small>Clinical estimate only; billing remains separate</small></span></Link>
              <Link to="/app/patients"><HeartPulse size={18} /><span><strong>Medical history</strong><small>Patient profile and intake context</small></span></Link>
              <Link to="/app/forms-consent"><FileSignature size={18} /><span><strong>Forms & consent</strong><small>Review assigned and signed forms</small></span></Link>
              <Link to="/app/tasks"><ListTodo size={18} /><span><strong>Follow-up tasks</strong><small>Clinical and operational work queue</small></span></Link>
            </nav>
          </section>

          <section className="panel dentist-separation-card">
            <span className="dentist-kicker">Financial separation</span>
            <h3>Treatment plan ≠ invoice</h3>
            <p>Treatment plan estimates are clinical planning values. Billing, collections, and payment state remain in the billing workflow and should not be inferred from a treatment plan.</p>
          </section>
        </aside>
      </div>
    </section>
  )
}
