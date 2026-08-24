import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BarChart3,
  Building2,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  HeartPulse,
  Mail,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserRound,
  XCircle,
} from 'lucide-react'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { usePermissions } from '../features/auth/permissions'
import { getStoredAppointments } from '../features/appointments/appointmentStore'
import { loadAppointmentsFromSupabase } from '../features/appointments/appointmentPersistence'
import type { Appointment } from '../features/appointments/appointmentTypes'
import { getStoredBranches, loadBranchesFromSupabase } from '../features/branches/branchStore'
import type { Branch } from '../features/branches/branchTypes'
import {
  createAvailabilityOverride,
  getProviderAvailabilityOverrides,
  getProviderBranchAssignments,
  getProviderScheduleBlocks,
  getStoredProviders,
  loadProviderFoundationFromSupabase,
  saveScheduleBlocks,
} from '../features/dentists/dentistStore'
import type { Provider, ProviderScheduleBlock } from '../features/dentists/dentistTypes'
import { getStoredPatientRecalls, listRecallQueue, type RecallQueueItem } from '../features/recalls/recallStore'
import { recordAuditEntry } from '../features/security/auditLogStore'
import { getCurrentSessionUserName } from '../features/security/security'
import { getStoredTreatments } from '../features/treatments/treatmentStore'
import type { Treatment } from '../features/treatments/treatmentTypes'
import '../styles/super-admin-dentists-v108.css'

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const timeframeOptions = [
  { label: '7 days', value: '7' },
  { label: '30 days', value: '30' },
  { label: '3 months', value: '90' },
  { label: '6 months', value: '180' },
  { label: '1 year', value: '365' },
]

type EditableBlock = Omit<ProviderScheduleBlock, 'id' | 'providerId' | 'createdAt' | 'updatedAt'>
type TimeframeValue = '7' | '30' | '90' | '180' | '365'
type ChartPoint = { label: string; scheduled: number; completed: number }

function manilaDate(offsetDays = 0) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function formatDate(value: string) {
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00+08:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
}

function formatTime(value: string) {
  const [hour = 0, minute = 0] = value.split(':').map(Number)
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

function minutesBetween(start: string, end: string) {
  const [startHour, startMinute] = start.split(':').map(Number)
  const [endHour, endMinute] = end.split(':').map(Number)
  return Math.max(0, (endHour * 60 + endMinute) - (startHour * 60 + startMinute))
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'DR'
}

function roleLabel(role: Provider['role']) {
  return role === 'associate_dentist' ? 'Associate Dentist' : 'Dentist'
}

function scheduleFor(providerId: string): EditableBlock[] {
  return getProviderScheduleBlocks()
    .filter((block) => block.providerId === providerId)
    .map(({ branchId, dayOfWeek, startTime, endTime, status }) => ({ branchId, dayOfWeek, startTime, endTime, status }))
}

function providerBranches(providerId: string, branches: Branch[]) {
  const ids = getProviderBranchAssignments()
    .filter((assignment) => assignment.providerId === providerId && assignment.status === 'active')
    .map((assignment) => assignment.branchId)
  return branches.filter((branch) => ids.includes(branch.id))
}

function isWithinRange(date: string, startDate: string, endDate: string) {
  return date >= startDate && date <= endDate
}

function buildAppointmentSeries(appointments: Appointment[], startDate: string, endDate: string, daysBack: number): ChartPoint[] {
  const step = daysBack <= 30 ? 1 : daysBack <= 90 ? 10 : daysBack <= 180 ? 20 : 45
  const points: ChartPoint[] = []
  for (let offset = -(daysBack - 1); offset <= 0; offset += step) {
    const bucketStart = manilaDate(offset)
    const bucketEnd = manilaDate(Math.min(0, offset + step - 1))
    const rows = appointments.filter((appointment) => isWithinRange(appointment.date, bucketStart, bucketEnd) && isWithinRange(appointment.date, startDate, endDate))
    points.push({
      label: step === 1 ? new Date(`${bucketStart}T00:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }) : `${formatDate(bucketStart)} - ${formatDate(bucketEnd)}`,
      scheduled: rows.length,
      completed: rows.filter((appointment) => appointment.status === 'completed').length,
    })
  }
  return points
}

function SimpleBarChart({ data }: { data: ChartPoint[] }) {
  const max = Math.max(1, ...data.flatMap((point) => [point.scheduled, point.completed]))
  return (
    <div className="dv108-chart" role="img" aria-label="Scheduled and completed appointments over time">
      {data.map((point) => (
        <div key={point.label} className="dv108-chart-col">
          <div className="dv108-bars">
            <span className="is-scheduled" style={{ height: `${Math.max(8, (point.scheduled / max) * 100)}%` }} title={`${point.scheduled} scheduled`} />
            <span className="is-completed" style={{ height: `${Math.max(8, (point.completed / max) * 100)}%` }} title={`${point.completed} completed`} />
          </div>
          <small>{point.label}</small>
        </div>
      ))}
    </div>
  )
}

function DonutChart({ values }: { values: Array<{ label: string; value: number; className: string }> }) {
  const total = values.reduce((sum, item) => sum + item.value, 0)
  let running = 0
  const gradient = total
    ? values.map((item) => {
      const start = running
      running += (item.value / total) * 100
      return `var(--${item.className}) ${start}% ${running}%`
    }).join(', ')
    : '#e5e7eb 0 100%'
  return (
    <div className="dv108-donut-wrap">
      <div className="dv108-donut" style={{ background: `conic-gradient(${gradient})` }}><strong>{total}</strong><span>visits</span></div>
      <div className="dv108-donut-legend">
        {values.map((item) => <div key={item.label}><i className={item.className} /><span>{item.label}</span><strong>{item.value}</strong></div>)}
      </div>
    </div>
  )
}

export function DentistsPageV51() {
  const { can } = usePermissions()
  const canManageSchedules = can('schedule.manage_all')
  const [branches, setBranches] = useState<Branch[]>(() => getStoredBranches())
  const [providers, setProviders] = useState<Provider[]>(() => getStoredProviders())
  const [appointments, setAppointments] = useState<Appointment[]>(() => getStoredAppointments())
  const [treatments, setTreatments] = useState<Treatment[]>(() => getStoredTreatments())
  const [recalls, setRecalls] = useState<RecallQueueItem[]>(() => getStoredPatientRecalls())
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [query, setQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [timeframe, setTimeframe] = useState<TimeframeValue>('30')
  const [scheduleBlocks, setScheduleBlocks] = useState<EditableBlock[]>([])
  const [saving, setSaving] = useState(false)
  const [scheduleFeedback, setScheduleFeedback] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [overrideForm, setOverrideForm] = useState({ date: '', type: 'unavailable', branchId: '', startTime: '', endTime: '', reason: '' })

  useEffect(() => {
    let mounted = true
    void Promise.all([
      loadBranchesFromSupabase({ strict: false }),
      loadProviderFoundationFromSupabase({ strict: false }),
      loadAppointmentsFromSupabase({ strict: false }),
      listRecallQueue({ limit: 500 }).catch(() => getStoredPatientRecalls()),
    ]).then(([loadedBranches, foundation, loadedAppointments, loadedRecalls]) => {
      if (!mounted) return
      setBranches(loadedBranches)
      setProviders(foundation.providers)
      setAppointments(loadedAppointments)
      setTreatments(getStoredTreatments())
      setRecalls(loadedRecalls)
      const first = foundation.providers[0]?.id || ''
      setSelectedProviderId((current) => current || first)
      if (first) setScheduleBlocks(scheduleFor(first))
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!selectedProviderId) return
    setScheduleBlocks(scheduleFor(selectedProviderId))
    setScheduleFeedback(null)
    setScheduleError(null)
  }, [selectedProviderId])

  const filteredProviders = useMemo(() => {
    const q = query.trim().toLowerCase()
    return providers.filter((provider) => {
      const assignedBranches = providerBranches(provider.id, branches)
      const matchesQuery = !q || `${provider.displayName} ${provider.email} ${provider.specialization} ${provider.licenseNumber}`.toLowerCase().includes(q)
      const matchesBranch = branchFilter === 'all' || assignedBranches.some((branch) => branch.id === branchFilter)
      return matchesQuery && matchesBranch
    }).sort((a, b) => a.displayName.localeCompare(b.displayName))
  }, [branchFilter, branches, providers, query])

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? filteredProviders[0] ?? null
  const assignedBranches = selectedProvider ? providerBranches(selectedProvider.id, branches) : []
  const assignedBranchIds = assignedBranches.map((branch) => branch.id)
  const selectedOverrides = selectedProvider ? getProviderAvailabilityOverrides().filter((item) => item.providerId === selectedProvider.id).sort((a, b) => b.date.localeCompare(a.date)) : []
  const persistedBlocks = selectedProvider ? getProviderScheduleBlocks().filter((block) => block.providerId === selectedProvider.id) : []
  const workingDays = new Set(scheduleBlocks.map((block) => block.dayOfWeek)).size
  const today = manilaDate()
  const daysBack = Number(timeframe)
  const startDate = manilaDate(-(daysBack - 1))
  const endDate = today

  const selectedAppointments = selectedProvider ? appointments.filter((appointment) => appointment.providerId === selectedProvider.id && isWithinRange(appointment.date, startDate, endDate)) : []
  const selectedTreatments = selectedProvider ? treatments.filter((treatment) => treatment.providerId === selectedProvider.id && isWithinRange(treatment.treatmentDate, startDate, endDate)) : []
  const selectedRecalls = selectedProvider ? recalls.filter((recall) => recall.providerId === selectedProvider.id && isWithinRange(recall.dueDate ?? recall.createdAt.slice(0, 10), startDate, endDate)) : []
  const todayAppointments = selectedProvider ? appointments.filter((appointment) => appointment.providerId === selectedProvider.id && appointment.date === today) : []
  const upcomingAppointments = selectedProvider ? appointments.filter((appointment) => appointment.providerId === selectedProvider.id && appointment.date >= today && !['cancelled', 'no_show', 'completed', 'rejected'].includes(appointment.status)).sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)).slice(0, 5) : []
  const chartData = buildAppointmentSeries(selectedAppointments, startDate, endDate, daysBack)
  const completedCount = selectedAppointments.filter((appointment) => appointment.status === 'completed').length
  const cancelledCount = selectedAppointments.filter((appointment) => appointment.status === 'cancelled').length
  const noShowCount = selectedAppointments.filter((appointment) => appointment.status === 'no_show').length
  const activeCount = selectedAppointments.filter((appointment) => ['pending', 'confirmed', 'checked_in', 'waiting', 'in_progress', 'rescheduled'].includes(appointment.status)).length
  const completedTreatments = selectedTreatments.filter((treatment) => treatment.status === 'completed').length
  const completedFollowUps = selectedRecalls.filter((recall) => recall.status === 'completed').length
  const bookedFollowUps = selectedRecalls.filter((recall) => recall.status === 'booked').length
  const availableMinutes = scheduleBlocks.reduce((sum, block) => sum + minutesBetween(block.startTime, block.endTime), 0) * Math.ceil(daysBack / 7)
  const bookedMinutes = selectedAppointments.reduce((sum, appointment) => sum + (appointment.durationMinutes ?? minutesBetween(appointment.startTime, appointment.endTime)), 0)
  const utilization = availableMinutes > 0 ? Math.round((bookedMinutes / availableMinutes) * 100) : null

  function addBlock(dayOfWeek: number) {
    if (!selectedProvider) return
    const defaultBranchId = assignedBranches[0]?.id ?? ''
    if (!defaultBranchId) {
      setScheduleError('Assign this dentist to a branch before adding working hours.')
      return
    }
    setScheduleError(null)
    setScheduleBlocks((current) => [...current, { dayOfWeek, branchId: defaultBranchId, startTime: '09:00', endTime: '17:00', status: 'active' }])
  }

  function toggleDay(dayOfWeek: number) {
    const open = scheduleBlocks.some((block) => block.dayOfWeek === dayOfWeek)
    if (open) setScheduleBlocks((current) => current.filter((block) => block.dayOfWeek !== dayOfWeek))
    else addBlock(dayOfWeek)
    setScheduleFeedback(null)
  }

  function updateBlock(index: number, patch: Partial<EditableBlock>) {
    setScheduleBlocks((current) => current.map((block, blockIndex) => blockIndex === index ? { ...block, ...patch } : block))
    setScheduleFeedback(null)
  }

  function removeBlock(index: number) {
    setScheduleBlocks((current) => current.filter((_, blockIndex) => blockIndex !== index))
    setScheduleFeedback(null)
  }

  function validateSchedule() {
    for (const block of scheduleBlocks) {
      if (!block.branchId || !assignedBranchIds.includes(block.branchId)) return 'Every working period must use one of the dentist assigned branches.'
      if (!block.startTime || !block.endTime || block.startTime >= block.endTime) return `${days[block.dayOfWeek]} has an invalid time range.`
    }
    for (let day = 0; day < 7; day += 1) {
      const blocks = scheduleBlocks.filter((block) => block.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime))
      for (let i = 1; i < blocks.length; i += 1) if (blocks[i].startTime < blocks[i - 1].endTime) return `${days[day]} has overlapping working hours.`
    }
    return null
  }

  async function saveWeeklySchedule() {
    if (!selectedProvider || saving) return
    const validation = validateSchedule()
    if (validation) { setScheduleError(validation); return }
    setSaving(true)
    setScheduleFeedback(null)
    setScheduleError(null)
    try {
      const result = await saveScheduleBlocks(selectedProvider.id, scheduleBlocks)
      setScheduleBlocks(result.blocks.map(({ branchId, dayOfWeek, startTime, endTime, status }) => ({ branchId, dayOfWeek, startTime, endTime, status })))
      setScheduleFeedback(result.persisted ? 'Availability saved to the clinic database.' : 'Availability saved locally. Supabase is not configured in this environment.')
      recordAuditEntry({ user: getCurrentSessionUserName(), action: 'provider_schedule_updated', entity: 'provider', entityId: selectedProvider.id, metadata: { blockCount: result.blocks.length } })
    } catch (cause) {
      setScheduleError(cause instanceof Error ? cause.message : 'Availability could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  function resetSchedule() {
    if (!selectedProvider) return
    setScheduleBlocks(scheduleFor(selectedProvider.id))
    setScheduleFeedback(null)
    setScheduleError(null)
  }

  function addOverride() {
    if (!selectedProvider || !overrideForm.date) return
    createAvailabilityOverride({ providerId: selectedProvider.id, branchId: overrideForm.branchId || undefined, date: overrideForm.date, type: overrideForm.type as any, startTime: overrideForm.startTime || undefined, endTime: overrideForm.endTime || undefined, reason: overrideForm.reason.trim(), privateNotes: '' })
    setOverrideForm({ date: '', type: 'unavailable', branchId: '', startTime: '', endTime: '', reason: '' })
    recordAuditEntry({ user: getCurrentSessionUserName(), action: 'provider_availability_changed', entity: 'provider', entityId: selectedProvider.id, metadata: { type: overrideForm.type, date: overrideForm.date } })
  }

  return (
    <section className="dv108-page">
      <header className="dv108-hero">
        <div>
          <span className="dv108-eyebrow">Dentist management</span>
          <h2>Dentist Management & Performance</h2>
          <p>Review provider profiles, branch coverage, appointment activity, treatment work, follow-ups, and booking availability from one focused workspace.</p>
        </div>
        <div className="dv108-hero-actions">
          <div><strong>{providers.length}</strong><span>Dentists</span></div>
          <div><strong>{providers.filter((provider) => provider.status === 'active').length}</strong><span>Active</span></div>
        </div>
      </header>

      <section className="dv108-toolbar">
        <label className="dv108-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search dentist, specialization, email, license" /></label>
        <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}><option value="all">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
        <select value={timeframe} onChange={(event) => setTimeframe(event.target.value as TimeframeValue)}>{timeframeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      </section>

      {!providers.length ? <EmptyState title="No dentist profiles yet" message="Add dentist profiles in Team & Access before reviewing performance and availability." /> : (
        <div className="dv108-layout">
          <aside className="dv108-directory">
            <header><div><span className="dv108-eyebrow">Directory</span><h3>{filteredProviders.length} dentists</h3></div><UserRound size={18} /></header>
            <div className="dv108-provider-list">
              {filteredProviders.map((provider) => {
                const branchesForProvider = providerBranches(provider.id, branches)
                const todayCount = appointments.filter((appointment) => appointment.providerId === provider.id && appointment.date === today).length
                const upcomingCount = appointments.filter((appointment) => appointment.providerId === provider.id && appointment.date >= today && !['completed', 'cancelled', 'no_show', 'rejected'].includes(appointment.status)).length
                return (
                  <button key={provider.id} type="button" className={selectedProvider?.id === provider.id ? 'is-selected' : ''} onClick={() => setSelectedProviderId(provider.id)}>
                    <span className="dv108-avatar" style={provider.photoUrl ? { backgroundImage: `url(${provider.photoUrl})` } : undefined}>{!provider.photoUrl && initials(provider.displayName)}</span>
                    <span className="dv108-provider-copy"><strong>{provider.displayName}</strong><small>{provider.specialization || roleLabel(provider.role)}</small><em>{branchesForProvider.map((branch) => branch.name).join(', ') || 'No branch assigned'}</em></span>
                    <span className="dv108-provider-meta"><StatusBadge status={provider.status} variant="compact" /><small>{todayCount} today / {upcomingCount} upcoming</small></span>
                  </button>
                )
              })}
              {!filteredProviders.length && <div className="dv108-empty-inline">No dentists match these filters.</div>}
            </div>
          </aside>

          {selectedProvider && (
            <main className="dv108-detail">
              <section className="dv108-profile">
                <div className="dv108-profile-main">
                  <span className="dv108-avatar is-large" style={selectedProvider.photoUrl ? { backgroundImage: `url(${selectedProvider.photoUrl})` } : undefined}>{!selectedProvider.photoUrl && initials(selectedProvider.displayName)}</span>
                  <div><span className="dv108-eyebrow">Overview</span><h2>{selectedProvider.displayName}</h2><p>{roleLabel(selectedProvider.role)}{selectedProvider.specialization ? ` - ${selectedProvider.specialization}` : ''}</p><small><Mail size={13} />{selectedProvider.email || 'No email'}{selectedProvider.phone ? ` - ${selectedProvider.phone}` : ''}</small></div>
                </div>
                <div className="dv108-profile-badges">
                  <StatusBadge status={selectedProvider.status} />
                  <Badge tone={selectedProvider.profileId ? 'success' : 'warning'}>{selectedProvider.profileId ? 'Linked account' : 'No account link'}</Badge>
                </div>
              </section>

              <section className="dv108-summary-grid">
                <article><CalendarCheck2 size={18} /><div><span>Upcoming appointments</span><strong>{upcomingAppointments.length}</strong><small>{todayAppointments.length} scheduled today</small></div></article>
                <article><CheckCircle2 size={18} /><div><span>Completed visits</span><strong>{completedCount}</strong><small>Within selected timeframe</small></div></article>
                <article><Stethoscope size={18} /><div><span>Treatments completed</span><strong>{completedTreatments}</strong><small>{selectedTreatments.length} treatment records</small></div></article>
                <article><HeartPulse size={18} /><div><span>Follow-ups</span><strong>{selectedRecalls.length}</strong><small>{bookedFollowUps} booked / {completedFollowUps} completed</small></div></article>
              </section>

              <section className="dv108-info-grid">
                <article>
                  <div className="dv108-section-head"><div><span className="dv108-eyebrow">Profile details</span><h3>Professional information</h3></div><ShieldCheck size={17} /></div>
                  <dl className="dv108-definition-list">
                    <div><dt>License</dt><dd>{selectedProvider.licenseNumber || 'Not recorded'}</dd></div>
                    <div><dt>Specialization</dt><dd>{selectedProvider.specialization || 'General dentistry'}</dd></div>
                    <div><dt>Account</dt><dd>{selectedProvider.profileId ? 'Linked to internal user' : 'No auth profile linked'}</dd></div>
                    <div><dt>Branches</dt><dd>{assignedBranches.map((branch) => branch.name).join(', ') || 'No branch assignment'}</dd></div>
                  </dl>
                  {selectedProvider.bio && <p className="dv108-bio">{selectedProvider.bio}</p>}
                </article>

                <article>
                  <div className="dv108-section-head"><div><span className="dv108-eyebrow">Upcoming appointments</span><h3>Next visits</h3></div><CalendarClock size={17} /></div>
                  <div className="dv108-mini-list">
                    {upcomingAppointments.map((appointment) => <div key={appointment.id}><span><strong>{formatDate(appointment.date)}</strong><small>{formatTime(appointment.startTime)} - {appointment.appointmentNumber ?? appointment.id}</small></span><StatusBadge status={appointment.status} variant="compact" /></div>)}
                    {!upcomingAppointments.length && <p>No upcoming appointments for this dentist.</p>}
                  </div>
                </article>
              </section>

              <section className="dv108-analytics">
                <div className="dv108-section-head"><div><span className="dv108-eyebrow">Activity & performance</span><h3>Transparent operational metrics</h3><p>These charts use stored appointments, treatment records, and clinical follow-up data. They are not a clinical quality score.</p></div><BarChart3 size={18} /></div>
                <div className="dv108-chart-grid">
                  <article><h4>Appointment volume</h4><SimpleBarChart data={chartData} /><footer><span><i className="is-scheduled" />Scheduled</span><span><i className="is-completed" />Completed</span></footer></article>
                  <article><h4>Appointment outcome</h4><DonutChart values={[{ label: 'Completed', value: completedCount, className: 'dv108-green' }, { label: 'Active', value: activeCount, className: 'dv108-blue' }, { label: 'Cancelled', value: cancelledCount, className: 'dv108-red' }, { label: 'No show', value: noShowCount, className: 'dv108-yellow' }]} /></article>
                  <article><h4>Treatment activity</h4><div className="dv108-ranked-list">{selectedTreatments.slice(0, 6).map((treatment) => <div key={treatment.id}><span>{treatment.serviceNameSnapshot || treatment.description || 'Treatment'}</span><strong>{treatment.status.replaceAll('_', ' ')}</strong></div>)}{!selectedTreatments.length && <p>No treatment records in this timeframe.</p>}</div></article>
                  <article><h4>Availability use</h4><div className="dv108-utilization"><strong>{utilization === null ? 'Not available' : `${utilization}%`}</strong><span>{utilization === null ? 'Add regular availability before calculating booked time.' : `${bookedMinutes} booked minutes from scheduled availability.`}</span></div></article>
                </div>
              </section>

              <section className="dv108-availability">
                <header className="dv108-section-head">
                  <div><span className="dv108-eyebrow">Availability</span><h3>Bookable working hours</h3><p>This is the same availability source used by appointment booking. Keep one simple weekly pattern, then add one-time exceptions as needed.</p></div>
                  <div className="dv108-actions"><Button variant="secondary" size="sm" onClick={resetSchedule} disabled={saving}>Reset</Button><Button icon={<Save size={15} />} onClick={saveWeeklySchedule} disabled={!canManageSchedules || saving || !assignedBranches.length}>{saving ? 'Saving...' : 'Save availability'}</Button></div>
                </header>
                <div className="dv108-availability-stats"><div><Clock3 size={16} /><span>{workingDays} working days</span></div><div><CalendarClock size={16} /><span>{persistedBlocks.length} saved periods</span></div><div><Building2 size={16} /><span>{assignedBranches.length} assigned branches</span></div></div>
                {scheduleError && <div className="dv108-message is-error"><XCircle size={16} />{scheduleError}</div>}
                {scheduleFeedback && <div className="dv108-message is-success"><CheckCircle2 size={16} />{scheduleFeedback}</div>}
                {!assignedBranches.length ? <div className="dv108-no-branch"><Building2 size={20} /><div><strong>No branch assignment</strong><span>Assign this dentist to a clinic before setting working hours.</span></div></div> : (
                  <div className="dv108-week">
                    {days.map((day, dayOfWeek) => {
                      const entries = scheduleBlocks.map((block, index) => ({ block, index })).filter((entry) => entry.block.dayOfWeek === dayOfWeek)
                      const isOpen = entries.length > 0
                      return (
                        <article key={day} className={isOpen ? 'is-open' : 'is-closed'}>
                          <div className="dv108-day-head"><div><strong>{day}</strong><span>{isOpen ? entries.map(({ block }) => `${formatTime(block.startTime)} - ${formatTime(block.endTime)}`).join(', ') : 'Unavailable'}</span></div><label><input type="checkbox" checked={isOpen} disabled={!canManageSchedules} onChange={() => toggleDay(dayOfWeek)} /><span>{isOpen ? 'Working' : 'Off'}</span></label></div>
                          {isOpen && <div className="dv108-periods">{entries.map(({ block, index }, entryIndex) => <div className="dv108-period" key={`${day}-${index}`}><span>{entryIndex + 1}</span><label><small>Clinic</small><select value={block.branchId} disabled={!canManageSchedules} onChange={(event) => updateBlock(index, { branchId: event.target.value })}>{assignedBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label><small>From</small><input type="time" value={block.startTime} disabled={!canManageSchedules} onChange={(event) => updateBlock(index, { startTime: event.target.value })} /></label><label><small>To</small><input type="time" value={block.endTime} disabled={!canManageSchedules} onChange={(event) => updateBlock(index, { endTime: event.target.value })} /></label>{canManageSchedules && entries.length > 1 && <button type="button" aria-label={`Remove ${day} period ${entryIndex + 1}`} onClick={() => removeBlock(index)}><Trash2 size={14} /></button>}</div>)}{canManageSchedules && <button type="button" className="dv108-add-period" onClick={() => addBlock(dayOfWeek)}><Plus size={14} />Add time period</button>}</div>}
                        </article>
                      )
                    })}
                  </div>
                )}
              </section>

              <section className="dv108-exceptions">
                <div className="dv108-section-head"><div><span className="dv108-eyebrow">One-time changes</span><h3>Availability exceptions</h3><p>Use exceptions for leave, special hours, or one unavailable day without changing the weekly pattern.</p></div><Activity size={17} /></div>
                {canManageSchedules && <div className="dv108-exception-form"><Input type="date" label="Date" value={overrideForm.date} onChange={(event) => setOverrideForm({ ...overrideForm, date: event.target.value })} /><Select label="Type" value={overrideForm.type} onChange={(event) => setOverrideForm({ ...overrideForm, type: event.target.value })} options={[{ label: 'Unavailable', value: 'unavailable' }, { label: 'Special hours', value: 'special_hours' }, { label: 'Available', value: 'available' }, { label: 'Leave', value: 'leave' }]} /><Select label="Branch" value={overrideForm.branchId} onChange={(event) => setOverrideForm({ ...overrideForm, branchId: event.target.value })} options={[{ label: 'All assigned branches', value: '' }, ...assignedBranches.map((branch) => ({ label: branch.name, value: branch.id }))]} /><Input type="time" label="Start" value={overrideForm.startTime} onChange={(event) => setOverrideForm({ ...overrideForm, startTime: event.target.value })} /><Input type="time" label="End" value={overrideForm.endTime} onChange={(event) => setOverrideForm({ ...overrideForm, endTime: event.target.value })} /><Input label="Reason" value={overrideForm.reason} onChange={(event) => setOverrideForm({ ...overrideForm, reason: event.target.value })} /><Button variant="secondary" onClick={addOverride}>Add exception</Button></div>}
                <div className="dv108-mini-list">{selectedOverrides.length ? selectedOverrides.slice(0, 8).map((item) => <div key={item.id}><span><strong>{formatDate(item.date)}</strong><small>{item.reason || item.type.replaceAll('_', ' ')}</small></span><span>{item.startTime && item.endTime ? `${formatTime(item.startTime)} - ${formatTime(item.endTime)}` : 'Full day'}</span></div>) : <p>No availability exceptions recorded.</p>}</div>
              </section>
            </main>
          )}
        </div>
      )}
    </section>
  )
}
