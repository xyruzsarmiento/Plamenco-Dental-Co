import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity, CalendarCheck2, CalendarClock, CheckCircle2, ClipboardList, Clock3, Stethoscope, UserRound, UsersRound } from 'lucide-react'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { loadAppointmentsForBranchScope } from '../appointments/appointmentBranchLoader'
import { getStoredAppointments, transitionAppointmentStatus } from '../appointments/appointmentStore'
import type { Appointment } from '../appointments/appointmentTypes'
import { useAuth } from '../auth/AuthContext'
import { usePermissions } from '../auth/permissions'
import { useBranchContext } from '../branches/BranchContext'
import { getStoredBranches } from '../branches/branchStore'
import { resolveProviderForAuthUser } from '../dentists/currentProvider'
import { getProviderBranchAssignments, getStoredProviders, loadProviderFoundationFromSupabase } from '../dentists/dentistStore'
import { getStoredPatients } from '../patients/patientStore'
import type { Patient } from '../patients/patientTypes'
import { getStoredServices } from '../services/serviceStore'
import { createClinicalVisitFromAppointment, getClinicalVisitByAppointment } from './dentalRecordStore'
import '../../styles/dentist-clinical-dashboard-v129.css'

function manilaDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function formatTime(value: string) {
  const [hourValue, minuteValue] = value.split(':').map(Number)
  const hour = hourValue % 12 || 12
  return `${hour}:${String(minuteValue).padStart(2, '0')} ${hourValue >= 12 ? 'PM' : 'AM'}`
}

function patientDisplay(patient?: Patient) {
  if (!patient) return 'Unknown patient'
  return patient.fullName || [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ')
}

function statusLabel(status: Appointment['status']) {
  const labels: Record<Appointment['status'], string> = {
    pending: 'Pending', confirmed: 'Scheduled', checked_in: 'Checked In', waiting: 'Waiting', in_progress: 'In Treatment', completed: 'Completed', cancelled: 'Cancelled', rejected: 'Rejected', no_show: 'No Show', rescheduled: 'Rescheduled',
  }
  return labels[status]
}

export function DentistTodayWorkspace() {
  const { user } = useAuth()
  const permissions = usePermissions()
  const navigate = useNavigate()
  const { activeBranch, activeBranchId, authorizedBranchIds, isAllBranchesMode } = useBranchContext()
  const [appointments, setAppointments] = useState(() => getStoredAppointments())
  const [providerRevision, setProviderRevision] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const today = manilaDate()

  useEffect(() => {
    let active = true
    void loadProviderFoundationFromSupabase().then(() => { if (active) setProviderRevision((value) => value + 1) })
    return () => { active = false }
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    let active = true
    void loadAppointmentsForBranchScope({ branchId: activeBranchId, isAllBranchesMode, userId: user.id, bypassCache: true })
      .then((rows) => { if (active) setAppointments(rows) })
    return () => { active = false }
  }, [activeBranchId, isAllBranchesMode, user?.id])

  const providers = useMemo(() => { void providerRevision; return getStoredProviders() }, [providerRevision])
  const provider = useMemo(() => resolveProviderForAuthUser(providers, user), [providers, user])
  const assignments = useMemo(() => { void providerRevision; return getProviderBranchAssignments() }, [providerRevision])
  const branches = useMemo(() => getStoredBranches(), [])
  const services = useMemo(() => getStoredServices(), [])
  const patients = useMemo(() => getStoredPatients(), [])
  const patientMap = useMemo(() => new Map(patients.flatMap((patient) => [[patient.id, patient], [patient.patientId, patient]] as const)), [patients])
  const serviceMap = useMemo(() => new Map(services.map((service) => [service.id, service])), [services])
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches])
  const providerBranchIds = useMemo(() => new Set(assignments.filter((entry) => entry.providerId === provider?.id && entry.status === 'active').map((entry) => entry.branchId)), [assignments, provider?.id])

  const assignedAppointments = useMemo(() => appointments.filter((appointment) => {
    if (!provider || appointment.providerId !== provider.id) return false
    if (!appointment.branchId) return false
    if (!providerBranchIds.has(appointment.branchId)) return false
    if (isAllBranchesMode) return authorizedBranchIds.includes(appointment.branchId)
    return appointment.branchId === activeBranchId
  }), [activeBranchId, appointments, authorizedBranchIds, isAllBranchesMode, provider, providerBranchIds])

  const todayAppointments = useMemo(() => assignedAppointments.filter((appointment) => appointment.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime)), [assignedAppointments, today])
  const waitingCount = todayAppointments.filter((appointment) => ['checked_in', 'waiting'].includes(appointment.status)).length
  const inTreatmentCount = todayAppointments.filter((appointment) => appointment.status === 'in_progress').length
  const completedCount = todayAppointments.filter((appointment) => appointment.status === 'completed').length
  const remainingCount = todayAppointments.filter((appointment) => ['pending', 'confirmed', 'checked_in', 'waiting', 'in_progress'].includes(appointment.status)).length
  const nextAppointment = todayAppointments.find((appointment) => !['completed', 'cancelled', 'rejected', 'no_show', 'rescheduled'].includes(appointment.status))
  const recentPatients = useMemo(() => {
    const seen = new Set<string>()
    return [...assignedAppointments]
      .filter((appointment) => appointment.status === 'completed')
      .sort((a, b) => `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`))
      .filter((appointment) => { if (seen.has(appointment.patientId)) return false; seen.add(appointment.patientId); return true })
      .slice(0, 6)
  }, [assignedAppointments])

  function refresh() { setAppointments(getStoredAppointments()) }

  function startVisit(appointment: Appointment) {
    if (!user || !permissions.can('appointments.start')) return
    const result = transitionAppointmentStatus(appointment.id, 'in_progress', { actor: user.name || user.email, expectedUpdatedAt: appointment.updatedAt })
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

  if (!provider) return <section className="dentist129-no-profile"><h2>Dentist profile is not linked</h2><p>Your authenticated account does not have a provider profile linked by profile ID. Ask Super Admin to link this account before clinical work is shown.</p></section>
  if (!providerBranchIds.size) return <section className="dentist129-no-profile"><h2>No clinic branch assigned</h2><p>{provider.displayName} is authenticated, but no active Dentist branch assignment exists. Clinical records stay unavailable until Super Admin assigns a branch.</p></section>

  const scopeName = activeBranch?.name ?? (isAllBranchesMode ? 'Authorized branches' : 'Assigned branch')

  return <section className="dentist129" data-provider-id={provider.id} data-dentist-branch={activeBranchId ?? 'all'}>
    <header className="dentist129-hero">
      <div className="dentist129-hero-copy">
        <span className="dentist129-kicker">Clinical workspace · {scopeName}</span>
        <h2>{provider.displayName}</h2>
        <p>Your schedule, patient flow, and clinical actions are resolved from your authenticated provider profile and the selected authorized branch.</p>
        <div className="dentist129-focus"><span>{todayAppointments.length} appointment{todayAppointments.length === 1 ? '' : 's'} today</span><span>{waitingCount} waiting</span><span>{inTreatmentCount} in treatment</span></div>
      </div>
      <div className="dentist129-hero-actions"><Link to="/app/appointments"><Button><CalendarClock size={16}/>My Schedule</Button></Link><Link to="/app/patients"><Button variant="secondary"><UserRound size={16}/>Search Patient</Button></Link><Link to="/app/dental-records"><Button variant="secondary"><ClipboardList size={16}/>Clinical Records</Button></Link></div>
    </header>

    {message && <div className="dentist129-alert">{message}</div>}

    <section className="dentist129-flow" aria-label="Today's patient flow">
      <article className="dentist129-stat"><i><CalendarCheck2 size={18}/></i><span>Appointments Today</span><strong>{todayAppointments.length}</strong><small>Assigned to {provider.displayName}</small></article>
      <article className="dentist129-stat is-waiting"><i><Clock3 size={18}/></i><span>Waiting</span><strong>{waitingCount}</strong><small>Checked in / waiting</small></article>
      <article className="dentist129-stat is-treatment"><i><Stethoscope size={18}/></i><span>In Treatment</span><strong>{inTreatmentCount}</strong><small>Active clinical visits</small></article>
      <article className="dentist129-stat is-completed"><i><CheckCircle2 size={18}/></i><span>Completed</span><strong>{completedCount}</strong><small>Completed today</small></article>
      <article className="dentist129-stat"><i><Activity size={18}/></i><span>Remaining</span><strong>{remainingCount}</strong><small>Still in today's workflow</small></article>
    </section>

    <div className="dentist129-grid">
      <section className="dentist129-card">
        <div className="dentist129-card-head"><div><span className="dentist129-kicker">Today's schedule</span><h3>Assigned visits</h3><p>Only appointments assigned to your provider identity in this branch are shown.</p></div><Link className="text-button" to="/app/appointments">Open schedule</Link></div>
        <div className="dentist129-schedule">{todayAppointments.map((appointment) => {
          const patient = patientMap.get(appointment.patientId)
          return <article key={appointment.id} className="dentist129-schedule-row"><div className="dentist129-time">{formatTime(appointment.startTime)}</div><div className="dentist129-patient"><strong>{patientDisplay(patient)}</strong><small>{serviceMap.get(appointment.serviceId)?.name ?? appointment.reasonForVisit ?? 'Visit'}</small></div><div className="dentist129-meta"><span className="dentist129-branch">{appointment.branchId ? branchMap.get(appointment.branchId)?.name ?? 'Branch' : 'Branch not recorded'}</span><StatusBadge status={appointment.status} label={statusLabel(appointment.status)} variant="compact" />{['checked_in','waiting'].includes(appointment.status) && permissions.can('appointments.start') && <button className="text-button" type="button" onClick={() => startVisit(appointment)}>Start</button>}<Link className="text-button" to={`/app/patients/${encodeURIComponent(patient?.patientId ?? appointment.patientId)}`}>Patient</Link></div></article>
        })}{!todayAppointments.length && <div className="dentist129-empty">No appointments are assigned to you in {scopeName} today.</div>}</div>
      </section>

      <aside className="dentist129-card">
        <div className="dentist129-card-head"><div><span className="dentist129-kicker">Next patient</span><h3>{nextAppointment ? formatTime(nextAppointment.startTime) : 'Schedule clear'}</h3></div></div>
        {nextAppointment ? (() => { const patient = patientMap.get(nextAppointment.patientId); const service = serviceMap.get(nextAppointment.serviceId); const alerts = [patient?.allergies, patient?.medicalConditions, patient?.currentMedications].filter(Boolean).length; return <div className="dentist129-next"><div className="dentist129-next-main"><strong>{patientDisplay(patient)}</strong><small>{service?.name ?? nextAppointment.reasonForVisit ?? 'Visit'}</small></div><div className="dentist129-next-grid"><div><span>Status</span><strong>{statusLabel(nextAppointment.status)}</strong></div><div><span>Medical context</span><strong>{alerts ? `${alerts} item${alerts === 1 ? '' : 's'} to review` : 'No alerts recorded'}</strong></div></div><div className="dentist129-action-row"><Link to={`/app/patients/${encodeURIComponent(patient?.patientId ?? nextAppointment.patientId)}`}><Button size="sm" variant="secondary">Open Patient</Button></Link>{getClinicalVisitByAppointment(nextAppointment.id) && <Link to={`/app/dental-records?appointment=${encodeURIComponent(nextAppointment.id)}`}><Button size="sm">Clinical Record</Button></Link>}</div></div> })() : <div className="dentist129-empty">No remaining patient is scheduled today.</div>}
      </aside>
    </div>

    <section className="dentist129-card"><div className="dentist129-card-head"><div><span className="dentist129-kicker">Recent patients</span><h3>Recently completed visits</h3><p>Derived from your actual completed appointments in the current authorized scope.</p></div><UsersRound size={20}/></div><div className="dentist129-recent">{recentPatients.map((appointment) => { const patient = patientMap.get(appointment.patientId); return <Link key={appointment.id} to={`/app/patients/${encodeURIComponent(patient?.patientId ?? appointment.patientId)}`}><strong>{patientDisplay(patient)}</strong><small>{appointment.date} · {serviceMap.get(appointment.serviceId)?.name ?? 'Completed visit'}</small></Link> })}{!recentPatients.length && <div className="dentist129-empty">No recently completed visits in this scope.</div>}</div></section>
  </section>
}
