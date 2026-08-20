import { CalendarPlus, CheckCircle2, Clock3, CreditCard, MessageSquareText, Search, UserPlus, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { getStoredAppointments } from '../appointments/appointmentStore'
import { getStoredBranches } from '../branches/branchStore'
import { getStoredProviders } from '../dentists/dentistStore'
import { getPatientDisplayName, getStoredPatients } from '../patients/patientStore'
import { getStoredServices } from '../services/serviceStore'

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function formatTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function tone(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (['confirmed', 'completed', 'paid'].includes(status)) return 'success'
  if (['pending', 'checked_in', 'waiting', 'in_progress', 'partially_paid'].includes(status)) return 'warning'
  if (['cancelled', 'rejected', 'no_show'].includes(status)) return 'danger'
  return 'info'
}

export function StaffTodayWorkspace() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const today = manilaToday()

  const appointments = useMemo(() => getStoredAppointments(), [])
  const patients = useMemo(() => getStoredPatients(), [])
  const services = useMemo(() => new Map(getStoredServices().map((row) => [row.id, row])), [])
  const providers = useMemo(() => new Map(getStoredProviders().map((row) => [row.id, row])), [])
  const branches = useMemo(() => new Map(getStoredBranches().map((row) => [row.id, row])), [])
  const patientMap = useMemo(() => new Map(patients.map((row) => [row.patientId, row])), [patients])

  const todayAppointments = useMemo(
    () => appointments.filter((row) => row.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [appointments, today],
  )
  const queue = todayAppointments.filter((row) => ['checked_in', 'waiting', 'in_progress'].includes(row.status))
  const pending = todayAppointments.filter((row) => row.status === 'pending')
  const walkIns = todayAppointments.filter((row) => row.bookingSource === 'walk_in')
  const completed = todayAppointments.filter((row) => row.status === 'completed')

  const patientResults = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return []
    return patients
      .filter((patient) => [getPatientDisplayName(patient), patient.patientId, patient.phone, patient.email].join(' ').toLowerCase().includes(normalized))
      .slice(0, 6)
  }, [patients, query])

  return (
    <div className="staff-today-workspace">
      <section className="staff-today-header">
        <div>
          <p className="eyebrow">Front desk operations</p>
          <h1>Today at a glance</h1>
          <p>Appointments, queue activity, patient lookup, and front-desk handoffs in one operational workspace.</p>
        </div>
        <div className="staff-primary-actions">
          <Button onClick={() => navigate('/app/appointments')}><CalendarPlus size={16} /> New appointment</Button>
          <Button variant="secondary" onClick={() => navigate('/app/patients')}><UserPlus size={16} /> Add patient</Button>
        </div>
      </section>

      <section className="staff-metric-grid" aria-label="Today summary">
        <article><span className="staff-metric-icon"><Clock3 size={18} /></span><div><strong>{todayAppointments.length}</strong><span>Appointments today</span></div></article>
        <article><span className="staff-metric-icon"><UsersRound size={18} /></span><div><strong>{queue.length}</strong><span>In clinic / queue</span></div></article>
        <article><span className="staff-metric-icon"><CalendarPlus size={18} /></span><div><strong>{walkIns.length}</strong><span>Walk-ins</span></div></article>
        <article><span className="staff-metric-icon"><CheckCircle2 size={18} /></span><div><strong>{completed.length}</strong><span>Completed visits</span></div></article>
      </section>

      <div className="staff-workspace-grid">
        <section className="staff-panel staff-schedule-panel">
          <div className="staff-section-header">
            <div><p className="eyebrow">Schedule</p><h2>Today&apos;s appointments</h2></div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/app/appointments')}>Open calendar</Button>
          </div>
          {todayAppointments.length === 0 ? (
            <div className="staff-empty-state"><CalendarPlus size={22} /><strong>No appointments today</strong><span>The live schedule will appear here when appointments are available.</span></div>
          ) : (
            <div className="staff-appointment-list">
              {todayAppointments.slice(0, 12).map((appointment) => {
                const patient = patientMap.get(appointment.patientId)
                return (
                  <button key={appointment.id} type="button" className="staff-appointment-row" onClick={() => navigate('/app/appointments')}>
                    <time>{formatTime(appointment.startTime)}</time>
                    <div className="staff-appointment-main">
                      <strong>{patient ? getPatientDisplayName(patient) : appointment.patientId}</strong>
                      <span>{services.get(appointment.serviceId)?.name ?? 'Dental appointment'} · {providers.get(appointment.providerId ?? '')?.displayName ?? 'Dentist unassigned'}</span>
                    </div>
                    <div className="staff-appointment-meta">
                      <span>{branches.get(appointment.branchId ?? '')?.name ?? 'Branch not set'}</span>
                      <Badge tone={tone(appointment.status)}>{appointment.status.replaceAll('_', ' ')}</Badge>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <aside className="staff-side-stack">
          <section className="staff-panel">
            <div className="staff-section-header"><div><p className="eyebrow">Live queue</p><h2>Patients in clinic</h2></div><Badge tone="info">{queue.length}</Badge></div>
            {queue.length === 0 ? <div className="staff-empty-state compact"><UsersRound size={20} /><span>No patients currently queued.</span></div> : (
              <div className="staff-queue-list">{queue.map((row) => <div key={row.id}><span>{formatTime(row.startTime)}</span><strong>{patientMap.get(row.patientId) ? getPatientDisplayName(patientMap.get(row.patientId)!) : row.patientId}</strong><Badge tone={tone(row.status)}>{row.status.replaceAll('_', ' ')}</Badge></div>)}</div>
            )}
          </section>

          <section className="staff-panel">
            <div className="staff-section-header"><div><p className="eyebrow">Patient lookup</p><h2>Find a patient</h2></div></div>
            <label className="staff-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, patient ID, phone, email" /></label>
            {query && <div className="staff-search-results">{patientResults.length ? patientResults.map((patient) => <button key={patient.id} type="button" onClick={() => navigate(`/app/patients/${patient.patientId}`)}><strong>{getPatientDisplayName(patient)}</strong><span>{patient.patientId} · {patient.phone || 'No phone'}</span></button>) : <span className="staff-no-result">No matching patients.</span>}</div>}
          </section>
        </aside>
      </div>

      <section className="staff-quick-actions">
        <button type="button" onClick={() => navigate('/app/appointments')}><CalendarPlus size={18} /><span><strong>Book / walk-in</strong><small>Create or manage appointments</small></span></button>
        <button type="button" onClick={() => navigate('/app/billing')}><CreditCard size={18} /><span><strong>Payment handoff</strong><small>Open billing and payment records</small></span></button>
        <button type="button" onClick={() => navigate('/app/communications')}><MessageSquareText size={18} /><span><strong>Communications</strong><small>Reminders and patient messages</small></span></button>
        <button type="button" onClick={() => navigate('/app/tasks')}><CheckCircle2 size={18} /><span><strong>Tasks</strong><small>Open operational work queue</small></span></button>
      </section>

      {pending.length > 0 && <div className="staff-attention-strip"><strong>{pending.length} appointment request{pending.length === 1 ? '' : 's'} need attention.</strong><button type="button" onClick={() => navigate('/app/appointments')}>Review now</button></div>}
    </div>
  )
}
