import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  Mail,
  MapPin,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRound,
  X,
} from 'lucide-react'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { loadAppointmentsFromSupabase } from '../features/appointments/appointmentPersistence'
import type { Appointment } from '../features/appointments/appointmentTypes'
import { replaceProviderBranchAssignmentsPersisted } from '../features/branches/branchAssignmentAdmin'
import { getStoredBranches, loadBranchesFromSupabase } from '../features/branches/branchStore'
import type { Branch } from '../features/branches/branchTypes'
import {
  getProviderBranchAssignments,
  getStoredProviders,
  loadProviderFoundationFromSupabase,
} from '../features/dentists/dentistStore'
import type { Provider } from '../features/dentists/dentistTypes'
import { getPatientDisplayName, getStoredPatients } from '../features/patients/patientStore'
import { getAvatarDisplayUrl, getInitials } from '../features/profiles/profileStore'
import { getStoredServices } from '../features/services/serviceStore'
import '../styles/dentists-management-v133.css'

function roleLabel(role: Provider['role']) {
  return role === 'associate_dentist' ? 'Associate Dentist' : 'Dentist'
}

function formatTime(value?: string) {
  if (!value) return 'Not set'
  const [hourValue, minuteValue] = value.split(':').map(Number)
  const date = new Date(2000, 0, 1, Number.isFinite(hourValue) ? hourValue : 9, Number.isFinite(minuteValue) ? minuteValue : 0)
  return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(date)
}

function formatDate(value?: string) {
  if (!value) return 'Not set'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function appointmentTimestamp(appointment: Appointment) {
  return `${appointment.date}T${appointment.startTime || '00:00'}`
}

function providerPhoto(provider: Provider) {
  return getAvatarDisplayUrl(provider.photoUrl)
}

function appointmentsFor(providerId: string, appointments: Appointment[]) {
  const today = todayKey()
  const assigned = appointments.filter((appointment) => appointment.providerId === providerId)
  return {
    upcoming: assigned.filter((appointment) => appointment.date >= today && !['cancelled', 'rejected', 'no_show', 'completed'].includes(appointment.status)).length,
    completedMonth: assigned.filter((appointment) => appointment.status === 'completed' && appointment.date.slice(0, 7) === today.slice(0, 7)).length,
    next: assigned
      .filter((appointment) => appointment.date >= today && !['cancelled', 'rejected', 'no_show', 'completed'].includes(appointment.status))
      .sort((left, right) => appointmentTimestamp(left).localeCompare(appointmentTimestamp(right)))
      .slice(0, 6),
  }
}

function DentistAvatar({ provider, size = 'md' }: { provider: Provider; size?: 'md' | 'lg' }) {
  const photo = providerPhoto(provider)
  return (
    <span className={`dentists133-avatar is-${size}`}>
      {photo ? <img src={photo} alt="" /> : <span>{getInitials(provider.displayName, provider.email)}</span>}
    </span>
  )
}

export function DentistsScheduleWorkspaceV131() {
  const navigate = useNavigate()
  const [providers, setProviders] = useState<Provider[]>(() => getStoredProviders())
  const [branches, setBranches] = useState<Branch[]>(() => getStoredBranches())
  const [assignments, setAssignments] = useState(() => getProviderBranchAssignments())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [query, setQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [branchRows, foundation, appointmentRows] = await Promise.all([
          loadBranchesFromSupabase({ strict: false }),
          loadProviderFoundationFromSupabase({ strict: false }),
          loadAppointmentsFromSupabase({ strict: false }),
        ])
        if (!active) return
        setBranches(branchRows)
        setProviders(foundation.providers)
        setAssignments(foundation.assignments)
        setAppointments(appointmentRows)
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Dentist workspace could not be loaded.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches])
  const activeAssignments = useMemo(() => assignments.filter((assignment) => assignment.status === 'active'), [assignments])
  const visibleProviders = useMemo(() => {
    const search = query.trim().toLowerCase()
    return providers
      .filter((provider) => provider.role === 'dentist' || provider.role === 'associate_dentist')
      .filter((provider) => statusFilter === 'all' || provider.status === statusFilter)
      .filter((provider) => branchFilter === 'all' || activeAssignments.some((row) => row.providerId === provider.id && row.branchId === branchFilter))
      .filter((provider) => !search || [provider.displayName, provider.specialization, provider.email].join(' ').toLowerCase().includes(search))
  }, [activeAssignments, branchFilter, providers, query, statusFilter])

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? null

  return (
    <main className="dentists133">
      <section className="dentists133-hero">
        <div className="dentists133-hero-icon"><Stethoscope size={24} /></div>
        <div>
          <span>Clinical team</span>
          <h1>Dentists</h1>
          <p>Manage dentist profiles, branch access, and assigned appointment work.</p>
        </div>
        <Button onClick={() => navigate('/app/staff')}><Plus size={16} />Add Dentist</Button>
      </section>

      <section className="dentists133-command" aria-label="Dentist filters">
        <label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search dentists, specialty, email" /></label>
        <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} aria-label="Filter by branch">
          <option value="all">All branches</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="on_leave">On leave</option>
          <option value="inactive">Inactive</option>
        </select>
      </section>

      {error && <div className="dentists133-alert"><AlertCircle size={16} />{error}</div>}
      {feedback && <div className="dentists133-alert is-success"><CheckCircle2 size={16} />{feedback}</div>}

      <section className="dentists133-grid">
        {loading ? Array.from({ length: 4 }).map((_, index) => <div className="dentists133-skeleton" key={index} />) : null}
        {!loading && visibleProviders.map((provider) => {
          const providerAssignments = activeAssignments.filter((assignment) => assignment.providerId === provider.id)
          const summary = appointmentsFor(provider.id, appointments)
          return (
            <article
              key={provider.id}
              className="dentists133-card"
              role="button"
              tabIndex={0}
              onClick={() => setSelectedProviderId(provider.id)}
              onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedProviderId(provider.id)
                }
              }}
            >
              <header>
                <DentistAvatar provider={provider} />
                <div>
                  <h2>{provider.displayName}</h2>
                  <p>{roleLabel(provider.role)}{provider.specialization ? ` / ${provider.specialization}` : ''}</p>
                </div>
                <StatusBadge status={provider.status} variant="compact" />
              </header>
              <div className="dentists133-branches">
                {providerAssignments.length ? providerAssignments.slice(0, 3).map((assignment) => (
                  <Badge key={assignment.id} tone="info" variant="compact" icon={<Building2 size={12} />}>{branchMap.get(assignment.branchId)?.name ?? 'Branch'}</Badge>
                )) : <Badge tone="neutral" variant="compact">No branch access</Badge>}
              </div>
              <dl>
                <div><dt>Upcoming</dt><dd>{summary.upcoming}</dd></div>
                <div><dt>Completed this month</dt><dd>{summary.completedMonth}</dd></div>
                <div><dt>Branch access</dt><dd>{providerAssignments.length}</dd></div>
              </dl>
              <footer>
                <span><CalendarCheck2 size={14} />{summary.next[0] ? `${formatDate(summary.next[0].date)} / ${formatTime(summary.next[0].startTime)}` : 'No upcoming visit'}</span>
                <Button size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); setSelectedProviderId(provider.id) }}>Open</Button>
              </footer>
            </article>
          )
        })}
        {!loading && !visibleProviders.length ? <div className="dentists133-empty"><UserRound size={28} /><h3>No dentists found</h3><p>Adjust the filters or add a dentist from Team & Access.</p></div> : null}
      </section>

      {selectedProvider ? (
        <DentistDetailsDrawer
          appointments={appointments}
          branches={branches}
          provider={selectedProvider}
          assignments={activeAssignments.filter((assignment) => assignment.providerId === selectedProvider.id)}
          onClose={() => setSelectedProviderId('')}
          onSaved={(message, foundation) => {
            setFeedback(message)
            setTimeout(() => setFeedback(''), 3200)
            if (foundation) setAssignments(foundation.assignments)
          }}
        />
      ) : null}
    </main>
  )
}

function DentistDetailsDrawer({
  appointments,
  branches,
  provider,
  assignments,
  onClose,
  onSaved,
}: {
  appointments: Appointment[]
  branches: Branch[]
  provider: Provider
  assignments: ReturnType<typeof getProviderBranchAssignments>
  onClose: () => void
  onSaved: (message: string, foundation?: Awaited<ReturnType<typeof loadProviderFoundationFromSupabase>>) => void
}) {
  const [branchDraft, setBranchDraft] = useState<string[]>(() => assignments.map((row) => row.branchId))
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState('')
  const summary = appointmentsFor(provider.id, appointments)
  const patients = getStoredPatients()
  const services = getStoredServices()
  const patientMap = new Map(patients.flatMap((patient) => [[patient.id, patient], [patient.patientId, patient]] as const))
  const serviceMap = new Map(services.map((service) => [service.id, service]))
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches])

  useEffect(() => {
    setBranchDraft(assignments.map((row) => row.branchId))
    setLocalError('')
  }, [assignments, provider.id])

  async function saveBranches() {
    setSaving(true)
    setLocalError('')
    try {
      await replaceProviderBranchAssignmentsPersisted(provider.id, branchDraft, branchDraft[0])
      const foundation = await loadProviderFoundationFromSupabase({ strict: true })
      onSaved('Branch access saved and reloaded from Supabase.', foundation)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Branch access could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  function toggleBranch(branchId: string) {
    setBranchDraft((current) => current.includes(branchId) ? current.filter((id) => id !== branchId) : [...current, branchId])
  }

  return (
    <div className="dentists133-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="dentists133-drawer" role="dialog" aria-modal="true" aria-labelledby="dentist-details-title">
        <header className="dentists133-drawer-header">
          <DentistAvatar provider={provider} size="lg" />
          <div>
            <span>Dentist profile</span>
            <h2 id="dentist-details-title">{provider.displayName}</h2>
            <p>{roleLabel(provider.role)}{provider.specialization ? ` / ${provider.specialization}` : ''}</p>
          </div>
          <button type="button" className="modal-close-button" aria-label="Close dentist details" onClick={onClose}><X size={19} /></button>
        </header>

        {localError ? <div className="dentists133-alert"><AlertCircle size={16} />{localError}</div> : null}

        <div className="dentists133-drawer-body">
          <div className="dentists133-modal-column dentists133-modal-column-primary">
            <section>
              <h3><UserRound size={17} />Identity</h3>
              <div className="dentists133-info-grid">
                <article><span>Role</span><strong>{roleLabel(provider.role)}</strong></article>
                <article><span>Specialization</span><strong>{provider.specialization || 'General dentistry'}</strong></article>
                <article><span>Email</span><strong>{provider.email || 'Not recorded'}</strong></article>
                <article><span>License</span><strong>{provider.licenseNumber || 'Not recorded'}</strong></article>
              </div>
              {provider.bio ? <p className="dentists133-bio">{provider.bio}</p> : null}
            </section>

            <section>
              <h3><CalendarCheck2 size={17} />Assigned appointments</h3>
              <div className="dentists133-info-grid">
                <article><span>Upcoming</span><strong>{summary.upcoming}</strong></article>
                <article><span>Completed this month</span><strong>{summary.completedMonth}</strong></article>
                <article><span>Branch access</span><strong>{branchDraft.length}</strong></article>
                <article><span>Account</span><strong>{provider.profileId ? 'Linked profile' : 'Provider only'}</strong></article>
              </div>
              <div className="dentists133-next-list" tabIndex={summary.next.length > 6 ? 0 : undefined} aria-label="Upcoming assigned appointments">
                {summary.next.map((appointment) => {
                  const patient = patientMap.get(appointment.patientId)
                  const service = serviceMap.get(appointment.serviceId)
                  return (
                    <article key={appointment.id}>
                      <div>
                        <strong>{patient ? getPatientDisplayName(patient) : appointment.patientId}</strong>
                        <span>{service?.name || appointment.reasonForVisit || 'Dental visit'}</span>
                      </div>
                      <div>
                        <span>{branchMap.get(appointment.branchId ?? '')?.name || 'Branch not assigned'}</span>
                        <small>{formatDate(appointment.date)} / {formatTime(appointment.startTime)}{appointment.durationMinutes ? ` / ${appointment.durationMinutes}m` : ''}</small>
                      </div>
                      <StatusBadge status={appointment.status} variant="compact" />
                    </article>
                  )
                })}
                {!summary.next.length ? <p>No upcoming assigned appointments for this dentist.</p> : null}
              </div>
            </section>
          </div>

          <div className="dentists133-modal-column dentists133-modal-column-secondary">
            <section>
              <h3><Building2 size={17} />Branch Access</h3>
              <div className="dentists133-branch-list">
                {branches.map((branch) => (
                  <label key={branch.id}>
                    <input type="checkbox" checked={branchDraft.includes(branch.id)} disabled={saving} onChange={() => toggleBranch(branch.id)} />
                    <span><strong>{branch.name}</strong><small>{branchDraft.includes(branch.id) ? 'Assigned' : 'Not assigned'} / {branch.status}</small></span>
                  </label>
                ))}
              </div>
              <Button size="sm" onClick={() => void saveBranches()} disabled={saving}><Save size={14} />{saving ? 'Saving...' : 'Save branch access'}</Button>
            </section>

            <section>
              <h3><ShieldCheck size={17} />Assignment Rules</h3>
              <p className="dentists133-bio">Patients request a branch, service, date, and time. Staff or an eligible dentist assigns the actual provider when the appointment is accepted. Historical availability records are retained for audit compatibility, but they are no longer used by active booking.</p>
              <div className="dentists133-contact-line">
                {provider.email ? <span><Mail size={14} />{provider.email}</span> : null}
                {assignments[0]?.branchId ? <span><MapPin size={14} />{branches.find((branch) => branch.id === assignments[0].branchId)?.name}</span> : null}
              </div>
            </section>
          </div>
        </div>
      </aside>
    </div>
  )
}
