import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  RefreshCw,
  Search,
  Sparkles,
  Stethoscope,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { PremiumLineChartV35 } from '../../components/ui/PremiumInteractiveChartV35'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { loadAppointmentsForBranchScope } from '../appointments/appointmentBranchLoader'
import { acceptUnassignedAppointmentPersisted, transitionAppointmentStatusPersisted } from '../appointments/appointmentPersistence'
import { getStoredAppointments } from '../appointments/appointmentStore'
import type { Appointment } from '../appointments/appointmentTypes'
import { useAuth } from '../auth/AuthContext'
import { usePermissions } from '../auth/permissions'
import { useBranchContext } from '../branches/BranchContext'
import { getStoredBranches } from '../branches/branchStore'
import { resolveProviderForAuthUser } from '../dentists/currentProvider'
import { getProviderBranchAssignments, getStoredProviders, loadProviderFoundationFromSupabase } from '../dentists/dentistStore'
import { getStoredPatients } from '../patients/patientStore'
import { loadPatientsFromSupabase } from '../patients/patientPersistence'
import type { Patient } from '../patients/patientTypes'
import { getStoredServices, loadServicesFromSupabase } from '../services/serviceStore'
import { createClinicalVisitFromAppointment } from './dentalRecordStore'
import '../../styles/dentist-premium-dashboard-v130.css'

function manilaDate(offset = 0) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offset)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function manilaDateLabel() {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())
}

function dayLabel(date: string) {
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(value: string) {
  const [hourValue, minuteValue] = value.split(':').map(Number)
  const hour = hourValue % 12 || 12
  return `${hour}:${String(minuteValue).padStart(2, '0')} ${hourValue >= 12 ? 'PM' : 'AM'}`
}

function patientName(patient?: Patient) {
  if (!patient) return 'Unknown patient'
  return patient.fullName || [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ')
}

function shortBranchName(name?: string) {
  return name?.replace(/^Plamenco Dental Co\.\s*-\s*/i, '') || 'Clinic'
}

function appointmentStatusLabel(status: Appointment['status']) {
  const labels: Record<Appointment['status'], string> = {
    pending: 'Pending',
    confirmed: 'Scheduled',
    checked_in: 'Checked in',
    waiting: 'Waiting',
    in_progress: 'In treatment',
    completed: 'Completed',
    cancelled: 'Cancelled',
    rejected: 'Rejected',
    no_show: 'No show',
    rescheduled: 'Rescheduled',
  }
  return labels[status]
}

function greetingPeriod() {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', hour12: false }).format(new Date()))
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

function Metric({ icon: Icon, label, value, detail, tone = 'default' }: {
  icon: typeof CalendarCheck2
  label: string
  value: string
  detail: string
  tone?: 'default' | 'primary' | 'warning' | 'success'
}) {
  return (
    <article className={`dentist130-metric tone-${tone}`}>
      <span className="dentist130-metric-icon"><Icon size={18} /></span>
      <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </article>
  )
}

export function DentistPremiumDashboardV130() {
  const { user } = useAuth()
  const permissions = usePermissions()
  const navigate = useNavigate()
  const { activeBranch, activeBranchId, authorizedBranchIds, isAllBranchesMode } = useBranchContext()
  const [appointments, setAppointments] = useState(() => getStoredAppointments())
  const [patients, setPatients] = useState(() => getStoredPatients())
  const [providerRevision, setProviderRevision] = useState(0)
  const [serviceRevision, setServiceRevision] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const today = manilaDate()

  useEffect(() => {
    let active = true
    void loadProviderFoundationFromSupabase()
      .then(() => { if (active) setProviderRevision((value) => value + 1) })
      .catch((cause) => { if (import.meta.env.DEV) console.warn('[dentist dashboard] provider refresh failed', cause) })
    return () => { active = false }
  }, [user?.id])

  useEffect(() => {
    let active = true
    void loadPatientsFromSupabase({ strict: true })
      .then((rows) => { if (active) setPatients(rows) })
      .catch((cause) => { if (active) setMessage(cause instanceof Error ? cause.message : 'Unable to load patients from the clinic database.') })
    return () => { active = false }
  }, [user?.id])

  useEffect(() => {
    let active = true
    void loadServicesFromSupabase({ strict: true })
      .then(() => { if (active) setServiceRevision((value) => value + 1) })
      .catch((cause) => { if (import.meta.env.DEV) console.warn('[dentist dashboard] service refresh failed', cause) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!user?.id) return
    let active = true
    setLoading(true)
    void loadAppointmentsForBranchScope({
      branchId: activeBranchId,
      isAllBranchesMode,
      userId: user.id,
      bypassCache: true,
      strict: true,
    })
      .then((rows) => { if (active) setAppointments(rows) })
      .catch((cause) => { if (active) setMessage(cause instanceof Error ? cause.message : 'Unable to load appointments from the clinic database.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [activeBranchId, isAllBranchesMode, user?.id])

  const providers = useMemo(() => { void providerRevision; return getStoredProviders() }, [providerRevision])
  const provider = useMemo(() => resolveProviderForAuthUser(providers, user), [providers, user])
  const assignments = useMemo(() => { void providerRevision; return getProviderBranchAssignments() }, [providerRevision])
  const branches = useMemo(() => getStoredBranches(), [])
  const services = useMemo(() => { void serviceRevision; return getStoredServices() }, [serviceRevision])
  const patientMap = useMemo(() => new Map(patients.flatMap((patient) => [[patient.id, patient], [patient.patientId, patient]] as const)), [patients])
  const serviceMap = useMemo(() => new Map(services.map((service) => [service.id, service])), [services])
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches])
  const providerBranchIds = useMemo(() => new Set(assignments.filter((entry) => entry.providerId === provider?.id && entry.status === 'active').map((entry) => entry.branchId)), [assignments, provider?.id])

  const assignedAppointments = useMemo(() => appointments.filter((appointment) => {
    if (!provider || appointment.providerId !== provider.id || !appointment.branchId) return false
    if (!providerBranchIds.has(appointment.branchId)) return false
    if (isAllBranchesMode) return authorizedBranchIds.includes(appointment.branchId)
    return appointment.branchId === activeBranchId
  }), [activeBranchId, appointments, authorizedBranchIds, isAllBranchesMode, provider, providerBranchIds])

  const todayAppointments = useMemo(() => assignedAppointments
    .filter((appointment) => appointment.date === today)
    .sort((a, b) => a.startTime.localeCompare(b.startTime)), [assignedAppointments, today])

  const availableRequests = useMemo(() => appointments.filter((appointment) => {
    if (!provider || appointment.status !== 'pending' || appointment.providerId || appointment.proposedProviderId) return false
    if (!appointment.branchId || !providerBranchIds.has(appointment.branchId)) return false
    if (isAllBranchesMode) return authorizedBranchIds.includes(appointment.branchId)
    return appointment.branchId === activeBranchId
  }).sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)), [activeBranchId, appointments, authorizedBranchIds, isAllBranchesMode, provider, providerBranchIds])

  const waitingCount = todayAppointments.filter((appointment) => ['checked_in', 'waiting'].includes(appointment.status)).length
  const inTreatmentCount = todayAppointments.filter((appointment) => appointment.status === 'in_progress').length
  const completedCount = todayAppointments.filter((appointment) => appointment.status === 'completed').length
  const remainingCount = todayAppointments.filter((appointment) => ['pending', 'confirmed', 'checked_in', 'waiting', 'in_progress'].includes(appointment.status)).length
  const nextAppointment = todayAppointments.find((appointment) => !['completed', 'cancelled', 'rejected', 'no_show', 'rescheduled'].includes(appointment.status))
  const uniquePatientsThisWeek = useMemo(() => {
    const start = manilaDate(-6)
    return new Set(assignedAppointments.filter((appointment) => appointment.date >= start && appointment.date <= today && appointment.status === 'completed').map((appointment) => appointment.patientId)).size
  }, [assignedAppointments, today])

  const trendLabels = useMemo(() => Array.from({ length: 7 }, (_, index) => manilaDate(index - 6)), [])
  const appointmentTrend = useMemo(() => trendLabels.map((date) => assignedAppointments.filter((appointment) => appointment.date === date).length), [assignedAppointments, trendLabels])
  const completedTrend = useMemo(() => trendLabels.map((date) => assignedAppointments.filter((appointment) => appointment.date === date && appointment.status === 'completed').length), [assignedAppointments, trendLabels])

  const flowSegments = [
    { key: 'scheduled', label: 'Scheduled', value: todayAppointments.filter((appointment) => ['pending', 'confirmed'].includes(appointment.status)).length },
    { key: 'waiting', label: 'Waiting', value: waitingCount },
    { key: 'treatment', label: 'In treatment', value: inTreatmentCount },
    { key: 'completed', label: 'Completed', value: completedCount },
  ]
  const maxFlow = Math.max(1, ...flowSegments.map((item) => item.value))

  async function refresh() {
    if (!user?.id) return
    setLoading(true)
    try {
      const rows = await loadAppointmentsForBranchScope({ branchId: activeBranchId, isAllBranchesMode, userId: user.id, bypassCache: true, strict: true })
      setAppointments(rows)
      setMessage(null)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unable to refresh the clinical dashboard.')
    } finally {
      setLoading(false)
    }
  }

  async function acceptRequest(appointment: Appointment) {
    if (!user || !provider || busyId) return
    setBusyId(`accept:${appointment.id}`)
    setMessage(null)
    try {
      await acceptUnassignedAppointmentPersisted({
        appointmentId: appointment.id,
        providerId: provider.id,
        actor: user.name || user.email,
        expectedUpdatedAt: appointment.updatedAt,
      })
      await refresh()
      setMessage('Appointment accepted and assigned to your clinical schedule.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Appointment request could not be accepted.')
    } finally {
      setBusyId(null)
    }
  }

  async function startVisit(appointment: Appointment) {
    if (!user || !permissions.can('appointments.start') || busyId) return
    setBusyId(`start:${appointment.id}`)
    setMessage(null)
    try {
      const updated = await transitionAppointmentStatusPersisted(appointment.id, 'in_progress', {
        actor: user.name || user.email,
        expectedUpdatedAt: appointment.updatedAt,
      })
      await createClinicalVisitFromAppointment(updated, user.name || user.email)
      await refresh()
      navigate(`/app/dental-records?appointment=${encodeURIComponent(appointment.id)}`)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Visit could not be started.')
    } finally {
      setBusyId(null)
    }
  }

  if (!provider) {
    return <section className="dentist130-empty"><Stethoscope size={24} /><strong>Dentist profile is not linked</strong><span>Your authenticated account needs an active provider profile before clinical work can be shown.</span></section>
  }
  if (!providerBranchIds.size) {
    return <section className="dentist130-empty"><Stethoscope size={24} /><strong>No clinic branch assigned</strong><span>{provider.displayName} has no active dentist branch assignment. Ask Super Admin to assign clinical access.</span></section>
  }

  const scopeName = activeBranch?.name ?? (isAllBranchesMode ? 'Authorized branches' : 'Assigned branch')
  const firstName = provider.displayName.replace(/^dr\.?\s*/i, '').trim().split(/\s+/)[0] || 'Dentist'

  return (
    <section className="dentist130" aria-label={`Dentist dashboard · ${scopeName}`} data-provider-id={provider.id}>
      <header className="dentist130-hero">
        <div className="dentist130-hero-copy">
          <span className="dentist130-eyebrow"><Sparkles size={13} /> Clinical intelligence · {shortBranchName(scopeName)}</span>
          <h1>Good {greetingPeriod()}, Dr. {firstName}</h1>
          <p>Your patient flow, clinical schedule, and care workload — scoped to your authenticated provider profile and branch access.</p>
          <div className="dentist130-hero-meta"><span><CalendarCheck2 size={14} />{manilaDateLabel()}</span><span><Stethoscope size={14} />{provider.displayName}</span></div>
        </div>
        <div className="dentist130-hero-actions">
          <Link to="/app/appointments" className="dentist130-action is-primary"><CalendarClock size={16} /><span>My schedule</span></Link>
          <Link to="/app/patients" className="dentist130-action"><Search size={16} /><span>Find patient</span></Link>
          <Link to="/app/dental-records" className="dentist130-action"><ClipboardList size={16} /><span>Clinical records</span></Link>
        </div>
      </header>

      {availableRequests.length > 0 && (
        <section className="dentist130-attention" aria-label="Appointment requests requiring action">
          <span className="dentist130-attention-icon"><CalendarClock size={19} /></span>
          <div><span className="dentist130-eyebrow">Action required</span><strong>{availableRequests.length} appointment request{availableRequests.length === 1 ? '' : 's'} available</strong><small>Pending visits in {shortBranchName(scopeName)} can be accepted into your schedule.</small></div>
          <a href="#dentist130-requests">Review requests <ArrowRight size={15} /></a>
        </section>
      )}

      {message && <div className="dentist130-message" role="status">{message}</div>}

      <section className="dentist130-metrics" aria-label="Today's clinical KPIs">
        <Metric icon={CalendarCheck2} label="Appointments today" value={String(todayAppointments.length)} detail={`${remainingCount} remaining in workflow`} tone="primary" />
        <Metric icon={Clock3} label="Waiting" value={String(waitingCount)} detail="Checked in or waiting" tone={waitingCount ? 'warning' : 'default'} />
        <Metric icon={Stethoscope} label="In treatment" value={String(inTreatmentCount)} detail="Active clinical visits" />
        <Metric icon={CheckCircle2} label="Completed" value={String(completedCount)} detail="Completed today" tone="success" />
        <Metric icon={UsersRound} label="Patients seen" value={String(uniquePatientsThisWeek)} detail="Unique completed patients · 7 days" />
      </section>

      <div className="dentist130-analytics-grid">
        <section className="dentist130-card dentist130-trend-card">
          <div className="dentist130-card-head"><div><span className="dentist130-eyebrow">Clinical activity · last 7 days</span><h2>Appointment workload</h2><p>Assigned appointments and completed visits from your current dentist scope.</p></div><button type="button" className="dentist130-icon-button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh dashboard"><RefreshCw size={16} className={loading ? 'is-spinning' : ''} /></button></div>
          <PremiumLineChartV35
            labels={trendLabels.map(dayLabel)}
            series={[
              { key: 'appointments', label: 'Appointments', values: appointmentTrend },
              { key: 'completed', label: 'Completed', values: completedTrend },
            ]}
            ariaLabel="Seven day dentist appointment and completion trend"
          />
        </section>

        <aside className="dentist130-card dentist130-flow-card">
          <div className="dentist130-card-head"><div><span className="dentist130-eyebrow">Today at a glance</span><h2>Patient flow</h2><p>Live distribution of your assigned visits today.</p></div><span className="dentist130-card-icon"><Activity size={18} /></span></div>
          <div className="dentist130-flow-chart">
            {flowSegments.map((item) => (
              <div key={item.key} className={`dentist130-flow-row is-${item.key}`}>
                <div><span>{item.label}</span><strong>{item.value}</strong></div>
                <div className="dentist130-flow-track"><span style={{ width: `${(item.value / maxFlow) * 100}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="dentist130-next-patient">
            <span className="dentist130-card-icon"><UserRound size={17} /></span>
            <div><small>Next patient</small><strong>{nextAppointment ? patientName(patientMap.get(nextAppointment.patientId)) : 'Schedule clear'}</strong><span>{nextAppointment ? `${formatTime(nextAppointment.startTime)} · ${serviceMap.get(nextAppointment.serviceId)?.name ?? nextAppointment.reasonForVisit ?? 'Dental visit'}` : 'No remaining patient is scheduled today.'}</span></div>
          </div>
        </aside>
      </div>

      <div className="dentist130-work-grid">
        <section className="dentist130-card dentist130-schedule-card">
          <div className="dentist130-card-head"><div><span className="dentist130-eyebrow">Today’s schedule</span><h2>Assigned visits</h2><p>Only visits assigned to {provider.displayName} in the active branch scope are shown.</p></div><Link to="/app/appointments">Open full schedule</Link></div>
          <div className="dentist130-schedule-list">
            {todayAppointments.map((appointment) => {
              const patient = patientMap.get(appointment.patientId)
              const service = serviceMap.get(appointment.serviceId)
              const canStart = ['checked_in', 'waiting'].includes(appointment.status) && permissions.can('appointments.start')
              return (
                <article key={appointment.id} className="dentist130-visit-row">
                  <div className="dentist130-time"><strong>{formatTime(appointment.startTime)}</strong><small>{appointment.endTime ? `to ${formatTime(appointment.endTime)}` : appointment.date}</small></div>
                  <div className="dentist130-patient"><strong>{patientName(patient)}</strong><span>{service?.name ?? appointment.reasonForVisit ?? 'Dental visit'}</span><small>{appointment.branchId ? branchMap.get(appointment.branchId)?.name ?? 'Clinic branch' : 'Branch not recorded'}</small></div>
                  <div className="dentist130-row-actions"><StatusBadge status={appointment.status} label={appointmentStatusLabel(appointment.status)} variant="compact" />{canStart && <Button size="sm" disabled={Boolean(busyId)} onClick={() => void startVisit(appointment)}>{busyId === `start:${appointment.id}` ? 'Starting…' : 'Start visit'}</Button>}{patient && <Link className="dentist130-text-link" to={`/app/patients/${encodeURIComponent(patient.patientId)}`}>Patient</Link>}</div>
                </article>
              )
            })}
            {!todayAppointments.length && <div className="dentist130-inline-empty"><CalendarCheck2 size={20} /><strong>No visits assigned today</strong><span>Your branch-scoped schedule is currently clear.</span></div>}
          </div>
        </section>

        <aside className="dentist130-card dentist130-quick-card">
          <div className="dentist130-card-head"><div><span className="dentist130-eyebrow">Clinical shortcuts</span><h2>Continue care</h2><p>Move directly into the most common dentist workflows.</p></div></div>
          <nav className="dentist130-quick-links" aria-label="Dentist clinical shortcuts">
            <Link to="/app/patients"><span><UserRound size={17} /></span><div><strong>Patient records</strong><small>Search patient history and profile</small></div><ArrowRight size={15} /></Link>
            <Link to="/app/dental-records"><span><ClipboardList size={17} /></span><div><strong>Dental records</strong><small>Open clinical visit documentation</small></div><ArrowRight size={15} /></Link>
            <Link to="/app/treatment-plans"><span><Stethoscope size={17} /></span><div><strong>Treatment plans</strong><small>Review proposed care roadmaps</small></div><ArrowRight size={15} /></Link>
            <Link to="/app/prescriptions"><span><Activity size={17} /></span><div><strong>Prescriptions</strong><small>Issue and review medications</small></div><ArrowRight size={15} /></Link>
          </nav>
        </aside>
      </div>

      <section id="dentist130-requests" className="dentist130-card dentist130-requests-card">
        <div className="dentist130-card-head"><div><span className="dentist130-eyebrow">Appointment requests</span><h2>Available requests</h2><p>Unassigned pending visits matching your active dentist branch access.</p></div><StatusBadge status="pending" label={`${availableRequests.length} pending`} variant="compact" /></div>
        <div className="dentist130-request-list">
          {availableRequests.map((appointment) => {
            const patient = patientMap.get(appointment.patientId)
            const service = serviceMap.get(appointment.serviceId)
            const branch = appointment.branchId ? branchMap.get(appointment.branchId) : undefined
            const accepting = busyId === `accept:${appointment.id}`
            return (
              <article key={appointment.id} className="dentist130-request-row">
                <div className="dentist130-time"><strong>{formatTime(appointment.startTime)}</strong><small>{appointment.date}</small></div>
                <div className="dentist130-patient"><strong>{patientName(patient)}</strong><span>{service?.name ?? appointment.reasonForVisit ?? 'Dental visit'} · {service?.duration ?? appointment.durationMinutes ?? 30} min</span><small>{branch?.name ?? 'Clinic branch'}</small></div>
                <div className="dentist130-row-actions"><StatusBadge status="pending" label="Unassigned" variant="compact" /><Button size="sm" disabled={Boolean(busyId)} onClick={() => void acceptRequest(appointment)}><CheckCircle2 size={14} />{accepting ? 'Accepting…' : 'Accept appointment'}</Button></div>
              </article>
            )
          })}
          {!availableRequests.length && <div className="dentist130-inline-empty"><CheckCircle2 size={20} /><strong>All caught up</strong><span>No open appointment requests currently match {scopeName}.</span></div>}
        </div>
      </section>
    </section>
  )
}
