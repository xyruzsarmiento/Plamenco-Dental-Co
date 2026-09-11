import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, Building2, CalendarCheck2, CalendarClock, CheckCircle2, ChevronRight,
  Clock3, Filter, HeartPulse, Link2, Mail, MapPin, MessageSquareText, Phone, Plus,
  RefreshCw, RotateCcw, Search, Send, Stethoscope, X,
  type LucideIcon,
} from 'lucide-react'
import { Badge, StatusBadge, type BadgeTone } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import { PageScaffold } from '../components/ui/PageScaffold'
import { Select } from '../components/ui/Select'
import { Skeleton, SkeletonAvatar } from '../components/ui/DesignSystem'
import { Textarea } from '../components/ui/Textarea'
import { useAuth } from '../features/auth/AuthContext'
import { recallWorkspaceViewPermissions, usePermissions } from '../features/auth/permissions'
import { useBranchContext } from '../features/branches/BranchContext'
import { loadProviderFoundationFromSupabase } from '../features/dentists/dentistStore'
import type { Provider, ProviderBranchAssignment } from '../features/dentists/dentistTypes'
import { PatientAvatar } from '../features/patients/PatientAvatar'
import { PatientSearchCombobox } from '../features/patients/PatientSearchCombobox'
import { loadPatientsFromSupabase } from '../features/patients/patientPersistence'
import type { Patient } from '../features/patients/patientTypes'
import {
  completeRecall, createManualRecall, dismissRecall, getRecallContactAttempts,
  getRecallDueBucket, listRecallQueue, markRecallNeedsRescheduling,
  recordManualRecallContact, resolveRecallProviderIdForProfile, saveStoredPatientRecalls,
  type RecallContactAttempt, type RecallContactOutcome, type RecallKind,
  type RecallQueueItem, type RecallStatus,
} from '../features/recalls/recallStore'
import '../styles/recall-followups-workspace-part3.css'

const terminalStatuses = new Set<RecallStatus>(['completed', 'dismissed', 'cancelled'])
type DueFilter = 'all' | 'overdue' | 'today' | 'upcoming' | 'no_date'
type ConfirmAction = { type: 'complete' | 'reschedule' | 'dismiss'; recall: RecallQueueItem }

const kindOptions = [
  { label: 'All kinds', value: 'all' }, { label: 'Recall', value: 'recall' }, { label: 'Follow-up', value: 'follow_up' },
]
const dueOptions = [
  { label: 'All due dates', value: 'all' }, { label: 'Overdue', value: 'overdue' },
  { label: 'Due today', value: 'today' }, { label: 'Upcoming', value: 'upcoming' }, { label: 'No date', value: 'no_date' },
]
const statusOptions = [
  { label: 'All statuses', value: 'all' }, { label: 'Open', value: 'open' },
  { label: 'Contacted', value: 'contacted' }, { label: 'Waiting for patient', value: 'waiting_patient' },
  { label: 'Booked', value: 'booked' }, { label: 'Needs rescheduling', value: 'needs_rescheduling' },
  { label: 'Completed', value: 'completed' }, { label: 'Dismissed', value: 'dismissed' },
]

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function formatDate(value?: string) {
  if (!value) return 'No date recorded'
  const date = new Date(`${value.slice(0, 10)}T00:00:00+08:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function formatDateTime(value?: string, fallback = 'No contact recorded') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

function labelize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function duePresentation(item: RecallQueueItem): { label: string; tone: BadgeTone; className: string } {
  const bucket = getRecallDueBucket(item)
  if (bucket === 'overdue') return { label: 'Overdue', tone: 'danger', className: 'is-overdue' }
  if (bucket === 'due_today') return { label: 'Due today', tone: 'warning', className: 'is-today' }
  if (bucket === 'booked') return { label: 'Booked', tone: 'success', className: 'is-booked' }
  if (bucket === 'completed') return { label: 'Completed', tone: 'success', className: 'is-completed' }
  if (bucket === 'dismissed' || bucket === 'cancelled') return { label: labelize(bucket), tone: 'neutral', className: 'is-closed' }
  if (bucket === 'no_date') return { label: 'No due date', tone: 'neutral', className: 'is-undated' }
  return { label: 'Upcoming', tone: 'info', className: 'is-upcoming' }
}

function maskDestination(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.includes('@')) { const [name, domain] = trimmed.split('@'); return `${name.slice(0, 2)}***@${domain ?? ''}` }
  return trimmed.length > 4 ? `${'*'.repeat(Math.min(7, trimmed.length - 4))}${trimmed.slice(-4)}` : trimmed
}

function providerQueuePriority(item: RecallQueueItem) {
  if (terminalStatuses.has(item.status)) return 20
  const due = getRecallDueBucket(item)
  const duePriority = due === 'overdue' ? 0 : due === 'due_today' ? 1 : due === 'upcoming' ? 3 : 5
  return duePriority + (item.kind === 'follow_up' ? 0 : 2)
}

function RecallSkeleton() {
  return <div className="rc3-skeleton" aria-label="Loading recalls and follow-ups" aria-busy="true">
    {Array.from({ length: 5 }, (_, index) => <article key={index}><SkeletonAvatar size={42} radius={12} /><div><Skeleton width="42%" height={14} radius={6} /><Skeleton width="68%" height={10} radius={5} /></div><div><Skeleton width="72%" height={11} radius={5} /><Skeleton width="54%" height={10} radius={5} /></div><Skeleton width={92} height={28} radius={999} /></article>)}
  </div>
}

function ModalShell({ children, className = '', description, eyebrow, footer, onClose, title }: {
  children: ReactNode; className?: string; description?: string; eyebrow: string; footer?: ReactNode; onClose: () => void; title: string
}) {
  const headingId = useId()
  return <div className="modal-backdrop rc3-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section className={`rc3-modal ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={headingId}>
      <header><div><span>{eyebrow}</span><h2 id={headingId}>{title}</h2>{description ? <p>{description}</p> : null}</div><button type="button" aria-label="Close dialog" data-modal-close onClick={onClose}><X size={18} /></button></header>
      <div className="rc3-modal-body">{children}</div>{footer ? <footer>{footer}</footer> : null}
    </section>
  </div>
}

export function RecallFollowUpWorkspace() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const permissions = usePermissions()
  const branch = useBranchContext()
  const [items, setItems] = useState<RecallQueueItem[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [providerAssignments, setProviderAssignments] = useState<ProviderBranchAssignment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [referenceError, setReferenceError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | RecallKind>('all')
  const [dueFilter, setDueFilter] = useState<DueFilter>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | RecallStatus>('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [providerFilter, setProviderFilter] = useState('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedRecall, setSelectedRecall] = useState<RecallQueueItem | null>(null)
  const [contacts, setContacts] = useState<RecallContactAttempt[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsError, setContactsError] = useState<string | null>(null)
  const [contactsToken, setContactsToken] = useState(0)
  const [newRecallOpen, setNewRecallOpen] = useState(false)
  const [newPatient, setNewPatient] = useState<Patient | null>(null)
  const [newDraft, setNewDraft] = useState({ patientId: '', kind: 'recall' as RecallKind, dueDate: '', reason: '', branchId: '', providerId: '', patientMessage: '' })
  const [contactTarget, setContactTarget] = useState<RecallQueueItem | null>(null)
  const [contactDraft, setContactDraft] = useState({ channel: 'phone' as 'phone' | 'walk_in' | 'manual_message', outcome: 'reached' as Exclude<RecallContactOutcome, 'queued' | 'sent' | 'delivered' | 'failed' | 'cancelled'>, notes: '' })
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [dismissalReason, setDismissalReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [scopedProviderId, setScopedProviderId] = useState<string | undefined>()

  const isProvider = user?.role === 'dentist' || user?.role === 'associate_dentist'
  const canView = permissions.canAny(recallWorkspaceViewPermissions)
  const canCreate = permissions.canAny(['communications.manage', 'system_admin.manage']) || (isProvider && permissions.can('clinical_records.edit'))
  const canContact = permissions.can('communications.manage')
  const canBook = permissions.can('appointments.create')
  const canComplete = permissions.canAny(['communications.manage', 'system_admin.manage']) || (isProvider && permissions.can('clinical_records.edit'))
  const canReschedule = permissions.canAny(['appointments.reschedule', 'communications.manage', 'system_admin.manage'])
  const canDismiss = permissions.canAny(['communications.manage', 'system_admin.manage'])
  const needsBranch = user?.role !== 'super_admin' || !branch.isAllBranchesMode
  const branchReady = !needsBranch || Boolean(branch.activeBranchId)
  const branchNames = useMemo(() => new Map(branch.availableBranches.map((item) => [item.id, item.name])), [branch.availableBranches])

  useEffect(() => {
    if (!user || !canView) { setIsLoading(false); setItems([]); return }
    if (branch.isLoading) { setIsLoading(true); setItems([]); return }
    if (!branchReady) { setIsLoading(false); setItems([]); return }
    let active = true
    setIsLoading(true); setError(null)
    void (async () => {
      const providerId = isProvider ? await resolveRecallProviderIdForProfile(user.id) : undefined
      if (isProvider && !providerId) throw new Error('Your dentist account is not linked to an active provider profile.')
      if (!active) return
      setScopedProviderId(providerId)
      const result = await listRecallQueue({ branchId: branch.isAllBranchesMode ? undefined : branch.activeBranchId ?? undefined, providerId, limit: 500 })
      const scopedResult = isProvider
        ? [...result].sort((a, b) => providerQueuePriority(a) - providerQueuePriority(b) || String(a.dueDate ?? '').localeCompare(String(b.dueDate ?? '')))
        : result
      if (!active) return
      setItems(scopedResult)
      setSelectedRecall((current) => current ? scopedResult.find((item) => item.id === current.id) ?? null : null)
      saveStoredPatientRecalls(scopedResult)
    })().catch((cause) => { if (active) { setError(cause instanceof Error ? cause.message : 'The recall queue could not be loaded from Supabase.'); setItems([]) } })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [branch.activeBranchId, branch.isAllBranchesMode, branch.isLoading, branchReady, canView, isProvider, reloadToken, user])

  useEffect(() => {
    if (!canView) return
    let active = true
    setReferenceError(null)
    void Promise.all([loadPatientsFromSupabase({ strict: true }), loadProviderFoundationFromSupabase({ strict: true })])
      .then(([patientRows, foundation]) => { if (active) { setPatients(patientRows); setProviders(foundation.providers); setProviderAssignments(foundation.assignments) } })
      .catch((cause) => { if (active) setReferenceError(cause instanceof Error ? cause.message : 'Patient and dentist directories could not be loaded.') })
    return () => { active = false }
  }, [canView, reloadToken])

  useEffect(() => {
    if (!selectedRecall) { setContacts([]); setContactsError(null); return }
    let active = true
    setContactsLoading(true); setContactsError(null)
    void getRecallContactAttempts(selectedRecall.id).then((result) => { if (active) setContacts(result) })
      .catch((cause) => { if (active) setContactsError(cause instanceof Error ? cause.message : 'Contact history could not be loaded.') })
      .finally(() => { if (active) setContactsLoading(false) })
    return () => { active = false }
  }, [contactsToken, selectedRecall])

  const scopeLabel = branch.isAllBranchesMode ? 'All authorized branches' : branch.activeBranch?.name ?? 'Branch not selected'
  const summary = useMemo(() => ({
    today: items.filter((item) => getRecallDueBucket(item) === 'due_today').length,
    overdue: items.filter((item) => getRecallDueBucket(item) === 'overdue').length,
    upcoming: items.filter((item) => getRecallDueBucket(item) === 'upcoming').length,
    waiting: items.filter((item) => item.status === 'waiting_patient').length,
    booked: items.filter((item) => item.status === 'booked').length,
    rescheduling: items.filter((item) => item.status === 'needs_rescheduling').length,
  }), [items])
  const kpis: Array<{ title: string; value: number; icon: LucideIcon; tone: string }> = [
    { title: 'Due today', value: summary.today, icon: Clock3, tone: 'today' },
    { title: 'Overdue', value: summary.overdue, icon: AlertTriangle, tone: 'overdue' },
    { title: 'Upcoming', value: summary.upcoming, icon: CalendarClock, tone: 'upcoming' },
    { title: 'Waiting for patient', value: summary.waiting, icon: MessageSquareText, tone: 'waiting' },
    { title: 'Booked', value: summary.booked, icon: CalendarCheck2, tone: 'booked' },
    { title: 'Needs rescheduling', value: summary.rescheduling, icon: RotateCcw, tone: 'rescheduling' },
  ]

  const providerFilterOptions = useMemo(() => {
    const values = new Map<string, string>()
    items.forEach((item) => { if (item.providerId) values.set(item.providerId, item.providerName) })
    providers.forEach((provider) => { if (!isProvider || provider.id === scopedProviderId) values.set(provider.id, provider.displayName) })
    return [{ label: 'All dentists', value: 'all' }, ...Array.from(values, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))]
  }, [isProvider, items, providers, scopedProviderId])
  const branchFilterOptions = useMemo(() => [{ label: branch.isAllBranchesMode ? 'All branches in scope' : branch.activeBranch?.name ?? 'Current branch', value: 'all' }, ...(branch.isAllBranchesMode ? branch.availableBranches.map((item) => ({ label: item.name, value: item.id })) : [])], [branch.activeBranch?.name, branch.availableBranches, branch.isAllBranchesMode])
  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return items.filter((item) => {
      const dueBucket = getRecallDueBucket(item)
      const matchesSearch = !needle || [item.patientName, item.patientId, item.reason, item.phone, item.email, item.providerName].some((value) => value.toLowerCase().includes(needle))
      const matchesDue = dueFilter === 'all' || (dueFilter === 'today' && dueBucket === 'due_today') || (dueFilter === 'no_date' && dueBucket === 'no_date') || dueBucket === dueFilter
      return matchesSearch && matchesDue && (kindFilter === 'all' || item.kind === kindFilter) && (statusFilter === 'all' || item.status === statusFilter) && (branchFilter === 'all' || item.branchId === branchFilter) && (providerFilter === 'all' || item.providerId === providerFilter)
    })
  }, [branchFilter, dueFilter, items, kindFilter, providerFilter, search, statusFilter])
  const activeFilterCount = [kindFilter !== 'all', dueFilter !== 'all', statusFilter !== 'all', branchFilter !== 'all', providerFilter !== 'all', Boolean(search.trim())].filter(Boolean).length
  const providersForNewRecall = useMemo(() => {
    if (!newDraft.branchId) return providers.filter((provider) => provider.status !== 'inactive')
    const allowed = new Set(providerAssignments.filter((assignment) => assignment.branchId === newDraft.branchId && assignment.status === 'active').map((assignment) => assignment.providerId))
    return providers.filter((provider) => allowed.has(provider.id) && provider.status !== 'inactive')
  }, [newDraft.branchId, providerAssignments, providers])

  function clearFilters() { setSearch(''); setKindFilter('all'); setDueFilter('all'); setStatusFilter('all'); setBranchFilter('all'); setProviderFilter('all') }
  function openNewRecall() { setNewPatient(null); setNewDraft({ patientId: '', kind: 'recall', dueDate: manilaToday(), reason: '', branchId: branch.activeBranchId ?? '', providerId: scopedProviderId ?? '', patientMessage: '' }); setActionError(null); setNewRecallOpen(true) }
  function openContact(item: RecallQueueItem) { setContactDraft({ channel: 'phone', outcome: 'reached', notes: '' }); setActionError(null); setContactTarget(item) }
  function openConfirm(type: ConfirmAction['type'], recall: RecallQueueItem) { setActionError(null); setConfirmAction({ type, recall }) }
  function bookFollowUp(item: RecallQueueItem) { navigate('/app/appointments', { state: { bookRecall: item } }) }

  async function submitNewRecall(event: FormEvent) {
    event.preventDefault()
    const patient = newPatient ?? patients.find((item) => item.id === newDraft.patientId || item.patientId === newDraft.patientId)
    if (!patient) { setActionError('Select a patient from the clinic directory.'); return }
    if (!newDraft.dueDate.trim()) { setActionError('Choose a due date.'); return }
    if (!newDraft.reason.trim()) { setActionError('Add a reason for this return-care recommendation.'); return }
    const branchIsAllowed = branch.availableBranches.some((item) => item.id === newDraft.branchId)
    if (!newDraft.branchId || !branchIsAllowed) { setActionError('Choose a clinic branch available to your account.'); return }
    if (isProvider && (!scopedProviderId || newDraft.providerId !== scopedProviderId)) { setActionError('Dentist recalls must remain assigned to your provider profile.'); return }
    if (newDraft.providerId && !providersForNewRecall.some((provider) => provider.id === newDraft.providerId)) { setActionError('Choose a dentist assigned to the selected branch.'); return }
    setIsSaving(true); setActionError(null)
    try {
      const provider = providers.find((item) => item.id === newDraft.providerId)
      await createManualRecall({ patientId: patient.patientId, kind: newDraft.kind, dueDate: newDraft.dueDate, reason: newDraft.reason, branchId: newDraft.branchId || undefined, providerId: newDraft.providerId || undefined, providerName: provider?.displayName, patientMessage: newDraft.patientMessage })
      setNewRecallOpen(false); setFeedback('Recall saved to the clinic queue.'); setReloadToken((value) => value + 1)
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'The recall could not be saved.') }
    finally { setIsSaving(false) }
  }

  async function submitContact(event: FormEvent) {
    event.preventDefault()
    if (!contactTarget) return
    setIsSaving(true); setActionError(null)
    try {
      const destination = contactDraft.channel === 'phone' ? contactTarget.phone : contactDraft.channel === 'manual_message' ? contactTarget.email || contactTarget.phone : 'Clinic visit'
      await recordManualRecallContact({ recallId: contactTarget.id, channel: contactDraft.channel, outcome: contactDraft.outcome, notes: contactDraft.notes, destinationMasked: maskDestination(destination) })
      setContactTarget(null); setFeedback('Contact attempt recorded in Supabase.'); setContactsToken((value) => value + 1); setReloadToken((value) => value + 1)
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'The contact attempt could not be recorded.') }
    finally { setIsSaving(false) }
  }

  async function submitConfirmedAction(event: FormEvent) {
    event.preventDefault()
    if (!confirmAction) return
    setIsSaving(true); setActionError(null)
    try {
      if (confirmAction.type === 'complete') await completeRecall(confirmAction.recall.id, confirmAction.recall.linkedAppointmentId)
      if (confirmAction.type === 'reschedule') await markRecallNeedsRescheduling(confirmAction.recall.id)
      if (confirmAction.type === 'dismiss') await dismissRecall(confirmAction.recall.id, dismissalReason)
      setFeedback(confirmAction.type === 'complete' ? 'Follow-up marked completed.' : confirmAction.type === 'reschedule' ? 'Follow-up moved to needs rescheduling.' : 'Recall dismissed with an audit reason.')
      setConfirmAction(null); setDismissalReason(''); setReloadToken((value) => value + 1)
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'The recall could not be updated.') }
    finally { setIsSaving(false) }
  }

  function nextAction(item: RecallQueueItem) {
    if (terminalStatuses.has(item.status)) return null
    if ((item.status === 'booked' || item.linkedAppointmentId) && canComplete) return <Button size="sm" variant="secondary" icon={<CheckCircle2 size={14} />} onClick={() => openConfirm('complete', item)}>Complete</Button>
    if (item.status === 'needs_rescheduling' && canBook) return <Button size="sm" icon={<CalendarClock size={14} />} onClick={() => bookFollowUp(item)}>Rebook</Button>
    if (!item.lastContactAt && canContact) return <Button size="sm" icon={<MessageSquareText size={14} />} onClick={() => openContact(item)}>Record contact</Button>
    if (canBook && !item.linkedAppointmentId) return <Button size="sm" icon={<CalendarCheck2 size={14} />} onClick={() => bookFollowUp(item)}>Book follow-up</Button>
    return null
  }

  if (!canView) return <PageScaffold eyebrow="Continuity of care" title="Recalls & Follow-Ups" description="Track patients who are due to return, document outreach, and convert follow-up recommendations into scheduled care." icon={<HeartPulse size={22} />}><section className="rc3-state is-error" role="alert"><AlertTriangle size={22} /><div><h2>Permission required</h2><p>Your account does not have access to the recall queue.</p></div></section></PageScaffold>
  if (!branch.isLoading && branch.error) return <PageScaffold eyebrow="Continuity of care" title="Recalls & Follow-Ups" description="Track patients who are due to return, document outreach, and convert follow-up recommendations into scheduled care." icon={<HeartPulse size={22} />}><section className="rc3-state is-error" role="alert"><AlertTriangle size={22} /><div><h2>Branch access unavailable</h2><p>{branch.error}</p></div></section></PageScaffold>
  if (!branch.isLoading && !branchReady) return <PageScaffold eyebrow="Continuity of care" title="Recalls & Follow-Ups" description="Track patients who are due to return, document outreach, and convert follow-up recommendations into scheduled care." icon={<HeartPulse size={22} />}><section className="rc3-state"><MapPin size={22} /><div><h2>Select a clinic branch</h2><p>Choose an authorized branch before opening its patient return-care queue.</p></div></section></PageScaffold>

  return <PageScaffold
    eyebrow="Continuity of care"
    title="Recalls & Follow-Ups"
    description="Track patients who are due to return, document outreach, and convert follow-up recommendations into scheduled care."
    icon={<HeartPulse size={22} />}
    status={scopeLabel}
    actions={<>{canCreate ? <Button size="sm" icon={<Plus size={15} />} onClick={openNewRecall}>New recall</Button> : null}<Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} onClick={() => setReloadToken((value) => value + 1)} disabled={isLoading}>Refresh</Button></>}
  >
    <section className="rc3-kpis" aria-label="Recall queue summary">
      {kpis.map(({ title, value, icon: Icon, tone }) => <article className={`is-${tone}`} key={title}><span><Icon size={17} /></span><div><small>{title}</small><strong>{isLoading ? '-' : value}</strong></div></article>)}
    </section>

    {feedback ? <div className="rc3-feedback" role="status"><CheckCircle2 size={16} /><span>{feedback}</span><button type="button" aria-label="Dismiss message" onClick={() => setFeedback(null)}><X size={15} /></button></div> : null}

    <section className="rc3-workspace" aria-labelledby="rc3-queue-title">
      <div className="rc3-workspace-head"><div><span>Patient return queue</span><h2 id="rc3-queue-title">Care that needs a next step</h2><p>{isLoading ? 'Loading live clinic records...' : `${filteredItems.length} of ${items.length} records in view`}</p></div><Button className="rc3-filter-toggle" size="sm" variant="secondary" icon={<Filter size={15} />} onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen}>Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}</Button></div>

      <div className={`rc3-filters ${filtersOpen ? 'is-open' : ''}`}>
        <label className="rc3-search"><span>Search patient</span><div><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, patient ID, phone or reason" /></div></label>
        <Select label="Kind" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as 'all' | RecallKind)} options={kindOptions} />
        <Select label="Due" value={dueFilter} onChange={(event) => setDueFilter(event.target.value as DueFilter)} options={dueOptions} />
        <Select label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | RecallStatus)} options={statusOptions} />
        <Select label="Branch" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} options={branchFilterOptions} disabled={!branch.isAllBranchesMode} />
        <Select label="Dentist" value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)} options={providerFilterOptions} />
        <Button className="rc3-clear" size="sm" variant="ghost" icon={<X size={14} />} onClick={clearFilters} disabled={!activeFilterCount}>Clear filters</Button>
      </div>

      {referenceError ? <div className="rc3-reference-warning" role="status"><AlertTriangle size={15} />{referenceError} Queue data remains live, but creation options may be limited.</div> : null}
      {isLoading ? <RecallSkeleton /> : null}
      {!isLoading && error ? <section className="rc3-state is-error" role="alert"><AlertTriangle size={22} /><div><h2>Queue unavailable</h2><p>{error}</p><Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} onClick={() => setReloadToken((value) => value + 1)}>Try again</Button></div></section> : null}
      {!isLoading && !error && !filteredItems.length ? <EmptyState title={items.length ? 'No records match these filters' : 'The return-care queue is clear'} message={items.length ? 'Clear or adjust the filters to see more patients.' : 'New recalls and clinical follow-ups will appear after they are saved to Supabase.'} /> : null}

      {!isLoading && !error && filteredItems.length ? <div className="rc3-list">
        {filteredItems.map((item) => {
          const patient = item.patient ?? { patientId: item.patientId, firstName: item.patientName, lastName: '', phone: item.phone, email: item.email }
          const due = duePresentation(item)
          return <article className={`rc3-row ${due.className}`} key={item.id}>
            <button type="button" className="rc3-row-open" onClick={() => setSelectedRecall(item)} aria-label={`View ${item.patientName} recall details`}>
              <div className="rc3-patient"><PatientAvatar patient={patient} size="card" alt={`${item.patientName} profile photo`} /><div><strong>{item.patientName}</strong><small>{item.patientId}</small></div></div>
              <div className="rc3-reason"><div><Badge tone={item.kind === 'follow_up' ? 'info' : 'neutral'} variant="compact">{item.kind === 'follow_up' ? 'Follow-up' : 'Recall'}</Badge><Badge tone={due.tone} variant="compact">{due.label}</Badge></div><strong>{item.reason || 'Return-care recommendation'}</strong><span>Due {formatDate(item.dueDate)}</span></div>
              <dl className="rc3-row-meta"><div><dt><Stethoscope size={12} />Dentist</dt><dd>{item.providerName}</dd></div><div><dt><Building2 size={12} />Branch</dt><dd>{item.branchId ? branchNames.get(item.branchId) ?? item.branchId : 'Not assigned'}</dd></div><div><dt><MessageSquareText size={12} />Last contact</dt><dd>{formatDateTime(item.lastContactAt)}</dd></div><div><dt><Link2 size={12} />Appointment</dt><dd>{item.linkedAppointmentId || 'Not booked'}</dd></div></dl>
              <div className="rc3-row-status"><StatusBadge status={item.status} variant="compact" /><ChevronRight size={17} /></div>
            </button>
            <div className="rc3-row-actions"><Button size="sm" variant="ghost" onClick={() => setSelectedRecall(item)}>View details</Button>{nextAction(item)}</div>
          </article>
        })}
      </div> : null}
    </section>

    {selectedRecall ? <div className="modal-backdrop rc3-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedRecall(null) }}>
      <section className="rc3-detail-modal" role="dialog" aria-modal="true" aria-labelledby="rc3-detail-title">
        <header><div><span>Recall detail</span><h2 id="rc3-detail-title">Patient return care</h2></div><button type="button" data-modal-close aria-label="Close recall details" onClick={() => setSelectedRecall(null)}><X size={18} /></button></header>
        <div className="rc3-detail-modal-body">
          <section className="rc3-detail-patient"><PatientAvatar patient={selectedRecall.patient ?? { patientId: selectedRecall.patientId, firstName: selectedRecall.patientName, lastName: '', phone: selectedRecall.phone, email: selectedRecall.email }} size="large" alt={`${selectedRecall.patientName} profile photo`} /><div><span>Patient</span><h3>{selectedRecall.patientName}</h3><p>{selectedRecall.patientId}</p><div>{selectedRecall.phone ? <a href={`tel:${selectedRecall.phone}`}><Phone size={13} />{selectedRecall.phone}</a> : null}{selectedRecall.email ? <a href={`mailto:${selectedRecall.email}`}><Mail size={13} />{selectedRecall.email}</a> : null}</div></div></section>
          <section className="rc3-detail-section"><div className="rc3-detail-heading"><div><span>Recommendation</span><h3>Return-care context</h3></div><div><Badge tone={selectedRecall.kind === 'follow_up' ? 'info' : 'neutral'}>{selectedRecall.kind === 'follow_up' ? 'Follow-up' : 'Recall'}</Badge><Badge tone={duePresentation(selectedRecall).tone}>{duePresentation(selectedRecall).label}</Badge></div></div><p className="rc3-detail-reason">{selectedRecall.reason || 'No reason was recorded.'}</p><dl className="rc3-detail-grid"><div><dt>Due date</dt><dd>{formatDate(selectedRecall.dueDate)}</dd></div><div><dt>Source</dt><dd>{labelize(selectedRecall.sourceType)}</dd></div><div><dt>Dentist</dt><dd>{selectedRecall.providerName}</dd></div><div><dt>Branch</dt><dd>{selectedRecall.branchId ? branchNames.get(selectedRecall.branchId) ?? selectedRecall.branchId : 'Not assigned'}</dd></div></dl></section>
          <section className="rc3-detail-section"><div className="rc3-detail-heading"><div><span>Status</span><h3>Current disposition</h3></div><StatusBadge status={selectedRecall.status} /></div>{selectedRecall.linkedAppointmentId ? <button type="button" className="rc3-linked-appointment" onClick={() => navigate('/app/appointments')}><CalendarCheck2 size={18} /><span><small>Linked appointment</small><strong>{selectedRecall.linkedAppointmentId}</strong></span><ChevronRight size={17} /></button> : <div className="rc3-no-appointment"><CalendarClock size={17} /><span>No appointment has been linked yet.</span></div>}</section>
          <section className="rc3-detail-section"><div className="rc3-detail-heading"><div><span>Contact history</span><h3>Patient outreach</h3></div>{canContact && !terminalStatuses.has(selectedRecall.status) ? <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => openContact(selectedRecall)}>Record</Button> : null}</div>{contactsLoading ? <div className="rc3-contact-loading"><Skeleton width="100%" height={56} radius={8} /><Skeleton width="100%" height={56} radius={8} /></div> : null}{!contactsLoading && contactsError ? <p className="rc3-inline-error">{contactsError}</p> : null}{!contactsLoading && !contactsError && !contacts.length ? <p className="rc3-empty-copy">No contact attempts have been recorded.</p> : null}{!contactsLoading && contacts.length ? <div className="rc3-contact-history">{contacts.map((attempt) => <article key={attempt.id}><span><Send size={14} /></span><div><strong>{labelize(attempt.outcome)}</strong><p>{labelize(attempt.channel)}{attempt.destinationMasked ? ` to ${attempt.destinationMasked}` : ''}</p>{attempt.notes ? <small>{attempt.notes}</small> : null}</div><time>{formatDateTime(attempt.attemptedAt, '')}</time></article>)}</div> : null}</section>
          <section className="rc3-detail-section"><div className="rc3-detail-heading"><div><span>Patient-facing message</span><h3>What the patient sees</h3></div></div><p className="rc3-message-copy">{selectedRecall.patientMessage || 'No patient-facing message was added.'}</p></section>
          <section className="rc3-detail-section is-audit"><div className="rc3-detail-heading"><div><span>Record context</span><h3>Audit metadata</h3></div></div><dl className="rc3-detail-grid"><div><dt>Recall ID</dt><dd>{selectedRecall.id}</dd></div><div><dt>Source record</dt><dd>{selectedRecall.sourceId || 'Not linked'}</dd></div><div><dt>Created</dt><dd>{formatDateTime(selectedRecall.createdAt, 'Not recorded')}</dd></div><div><dt>Last updated</dt><dd>{formatDateTime(selectedRecall.updatedAt, 'Not recorded')}</dd></div>{selectedRecall.dismissalReason ? <div className="is-wide"><dt>Dismissal reason</dt><dd>{selectedRecall.dismissalReason}</dd></div> : null}</dl></section>
        </div>
        <footer><Button variant="secondary" onClick={() => setSelectedRecall(null)}>Close</Button>{canBook && !selectedRecall.linkedAppointmentId && !terminalStatuses.has(selectedRecall.status) ? <Button icon={<CalendarCheck2 size={15} />} onClick={() => bookFollowUp(selectedRecall)}>Book follow-up</Button> : null}{canComplete && !terminalStatuses.has(selectedRecall.status) ? <Button variant="secondary" icon={<CheckCircle2 size={15} />} onClick={() => openConfirm('complete', selectedRecall)}>Mark completed</Button> : null}{canReschedule && selectedRecall.status === 'booked' && Boolean(selectedRecall.linkedAppointmentId) ? <Button variant="secondary" icon={<RotateCcw size={15} />} onClick={() => openConfirm('reschedule', selectedRecall)}>Needs rescheduling</Button> : null}{canDismiss && !terminalStatuses.has(selectedRecall.status) ? <Button variant="danger" onClick={() => { setDismissalReason(''); openConfirm('dismiss', selectedRecall) }}>Dismiss</Button> : null}</footer>
      </section>
    </div> : null}

    {newRecallOpen ? <ModalShell eyebrow="Continuity of care" title="New recall" description="Add a patient return-care reminder to the live clinic queue." className="rc3-form-modal" onClose={() => setNewRecallOpen(false)} footer={<><Button variant="secondary" onClick={() => setNewRecallOpen(false)}>Cancel</Button><Button type="submit" form="rc3-new-recall-form" disabled={isSaving}>{isSaving ? 'Saving...' : 'Create recall'}</Button></>}><form id="rc3-new-recall-form" className="rc3-form" onSubmit={submitNewRecall}><PatientSearchCombobox patients={patients} value={newDraft.patientId} onSelect={(patient) => { setNewPatient(patient); setNewDraft((draft) => ({ ...draft, patientId: patient?.id ?? '' })) }} required label="Patient" /><div className="rc3-form-grid"><Select label="Kind" value={newDraft.kind} onChange={(event) => setNewDraft((draft) => ({ ...draft, kind: event.target.value as RecallKind }))} options={kindOptions.slice(1)} /><Input label="Due date" type="date" required value={newDraft.dueDate} onChange={(event) => setNewDraft((draft) => ({ ...draft, dueDate: event.target.value }))} /><Select label="Branch" required value={newDraft.branchId} onChange={(event) => setNewDraft((draft) => ({ ...draft, branchId: event.target.value, providerId: scopedProviderId ?? '' }))} options={[{ label: 'Select branch', value: '' }, ...branch.availableBranches.map((item) => ({ label: item.name, value: item.id }))]} disabled={!branch.isAllBranchesMode} /><Select label="Dentist / provider" value={newDraft.providerId} onChange={(event) => setNewDraft((draft) => ({ ...draft, providerId: event.target.value }))} options={[{ label: 'Unassigned', value: '' }, ...providersForNewRecall.map((item) => ({ label: item.displayName, value: item.id }))]} disabled={isProvider} /></div><Textarea label="Reason" required rows={3} value={newDraft.reason} onChange={(event) => setNewDraft((draft) => ({ ...draft, reason: event.target.value }))} placeholder="Why should this patient return?" /><Textarea label="Patient-facing message" rows={3} value={newDraft.patientMessage} onChange={(event) => setNewDraft((draft) => ({ ...draft, patientMessage: event.target.value }))} placeholder="Optional message visible to the patient" />{actionError ? <p className="rc3-form-error" role="alert">{actionError}</p> : null}</form></ModalShell> : null}

    {contactTarget ? <ModalShell eyebrow="Patient outreach" title="Record contact" description={`${contactTarget.patientName} · ${contactTarget.patientId}`} className="rc3-contact-modal" onClose={() => setContactTarget(null)} footer={<><Button variant="secondary" onClick={() => setContactTarget(null)}>Cancel</Button><Button type="submit" form="rc3-contact-form" icon={<Send size={15} />} disabled={isSaving}>{isSaving ? 'Recording...' : 'Save contact'}</Button></>}><form id="rc3-contact-form" className="rc3-form" onSubmit={submitContact}><div className="rc3-contact-person"><PatientAvatar patient={contactTarget.patient ?? { patientId: contactTarget.patientId, firstName: contactTarget.patientName, lastName: '', phone: contactTarget.phone, email: contactTarget.email }} size="card" /><div><strong>{contactTarget.patientName}</strong><span>{contactTarget.phone || contactTarget.email || 'No contact detail recorded'}</span></div></div><div className="rc3-form-grid"><Select label="Channel" value={contactDraft.channel} onChange={(event) => setContactDraft((draft) => ({ ...draft, channel: event.target.value as 'phone' | 'walk_in' | 'manual_message' }))} options={[{ label: 'Phone', value: 'phone' }, { label: 'Walk-in', value: 'walk_in' }, { label: 'Manual message', value: 'manual_message' }]} /><Select label="Outcome" value={contactDraft.outcome} onChange={(event) => setContactDraft((draft) => ({ ...draft, outcome: event.target.value as typeof contactDraft.outcome }))} options={[{ label: 'Reached patient', value: 'reached' }, { label: 'No answer', value: 'no_answer' }, { label: 'Left message', value: 'left_message' }, { label: 'Patient will call', value: 'patient_will_call' }, { label: 'Requested booking', value: 'patient_requested_booking' }, { label: 'Patient declined', value: 'patient_declined' }, { label: 'Invalid contact', value: 'invalid_contact' }]} /></div><Textarea label="Notes" rows={4} value={contactDraft.notes} onChange={(event) => setContactDraft((draft) => ({ ...draft, notes: event.target.value }))} placeholder="Add concise outreach notes" />{actionError ? <p className="rc3-form-error" role="alert">{actionError}</p> : null}</form></ModalShell> : null}

    {confirmAction ? <ModalShell eyebrow="Update recall" title={confirmAction.type === 'complete' ? 'Mark as completed' : confirmAction.type === 'reschedule' ? 'Needs rescheduling' : 'Dismiss recall'} description={`${confirmAction.recall.patientName} · ${confirmAction.recall.reason}`} className="rc3-confirm-modal" onClose={() => setConfirmAction(null)} footer={<><Button variant="secondary" onClick={() => setConfirmAction(null)}>Cancel</Button><Button type="submit" form="rc3-confirm-form" variant={confirmAction.type === 'dismiss' ? 'danger' : 'primary'} disabled={isSaving}>{isSaving ? 'Updating...' : confirmAction.type === 'complete' ? 'Mark completed' : confirmAction.type === 'reschedule' ? 'Confirm rescheduling' : 'Dismiss recall'}</Button></>}><form id="rc3-confirm-form" className="rc3-form" onSubmit={submitConfirmedAction}><div className={`rc3-confirm-copy is-${confirmAction.type}`}><span>{confirmAction.type === 'complete' ? <CheckCircle2 size={20} /> : confirmAction.type === 'reschedule' ? <RotateCcw size={20} /> : <AlertTriangle size={20} />}</span><p>{confirmAction.type === 'complete' ? 'This removes the item from active return-care work while keeping its complete audit history.' : confirmAction.type === 'reschedule' ? 'The linked appointment context remains visible while the queue flags this patient for a new schedule.' : 'Dismiss only when this recommendation should no longer remain in the active queue.'}</p></div>{confirmAction.type === 'dismiss' ? <Textarea label="Dismissal reason" required rows={3} value={dismissalReason} onChange={(event) => setDismissalReason(event.target.value)} placeholder="Explain why this recall is being dismissed" /> : null}{actionError ? <p className="rc3-form-error" role="alert">{actionError}</p> : null}</form></ModalShell> : null}
  </PageScaffold>
}
