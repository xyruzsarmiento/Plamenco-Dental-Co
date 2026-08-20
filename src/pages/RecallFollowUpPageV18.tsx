import { useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Mail,
  MessageSquareText,
  Phone,
  PhoneCall,
  RefreshCw,
  Search,
  UserRoundCheck,
  XCircle,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { PageScaffold } from '../components/ui/PageScaffold'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import {
  completeRecall,
  dismissRecall,
  getRecallContactAttempts,
  getRecallDueBucket,
  linkRecallToAppointment,
  listRecallQueue,
  recordManualRecallContact,
  type RecallContactAttempt,
  type RecallContactOutcome,
  type RecallQueueItem,
} from '../features/recalls/recallStore'

const tabs = [
  ['all', 'All'],
  ['due_today', 'Due Today'],
  ['upcoming', 'Upcoming'],
  ['overdue', 'Overdue'],
  ['contacted', 'Contacted'],
  ['waiting_patient', 'Waiting'],
  ['booked', 'Booked'],
  ['completed', 'Completed'],
] as const

type TabKey = (typeof tabs)[number][0]

const contactOutcomes: Array<{ value: RecallContactOutcome; label: string }> = [
  { value: 'reached', label: 'Reached' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'left_message', label: 'Left message' },
  { value: 'patient_will_call', label: 'Patient will call' },
  { value: 'patient_requested_booking', label: 'Patient requested booking' },
  { value: 'patient_declined', label: 'Patient declined' },
  { value: 'invalid_contact', label: 'Invalid contact details' },
]

function dateLabel(value?: string) {
  if (!value) return 'Not scheduled'
  return new Date(`${value}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric',
  })
}

function dateTimeLabel(value?: string) {
  if (!value) return 'No contact recorded'
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function labelize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function matchesTab(item: RecallQueueItem, tab: TabKey) {
  if (tab === 'all') return true
  if (tab === 'contacted' || tab === 'waiting_patient' || tab === 'completed') return item.status === tab
  return getRecallDueBucket(item) === tab
}

function bucketTone(bucket: string) {
  if (bucket === 'overdue') return 'danger'
  if (bucket === 'due_today') return 'warning'
  if (bucket === 'booked' || bucket === 'completed') return 'success'
  return 'info'
}

function contactLabel(item: RecallQueueItem) {
  if (item.lastContactAt) return `Last contact ${dateTimeLabel(item.lastContactAt)}`
  return 'No contact recorded'
}

export function RecallFollowUpPageV18() {
  const branches = useMemo(() => getStoredBranches(), [])
  const providers = useMemo(() => getStoredProviders(), [])
  const [items, setItems] = useState<RecallQueueItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [attempts, setAttempts] = useState<RecallContactAttempt[]>([])
  const [tab, setTab] = useState<TabKey>('due_today')
  const [search, setSearch] = useState('')
  const [branchId, setBranchId] = useState('all')
  const [providerId, setProviderId] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [contactOutcome, setContactOutcome] = useState<RecallContactOutcome>('reached')
  const [contactNotes, setContactNotes] = useState('')
  const [appointmentId, setAppointmentId] = useState('')
  const [dismissReason, setDismissReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await listRecallQueue({
        branchId: branchId === 'all' ? undefined : branchId,
        providerId: providerId === 'all' ? undefined : providerId,
      })
      setItems(data)
      setSelectedId((current) => current && data.some((item) => item.id === current) ? current : data[0]?.id ?? null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load recall queue.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [branchId, providerId])

  const selected = items.find((item) => item.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId) {
      setAttempts([])
      return
    }
    void getRecallContactAttempts(selectedId).then(setAttempts).catch(() => setAttempts([]))
  }, [selectedId])

  const tabCounts = useMemo(() => Object.fromEntries(tabs.map(([key]) => [key, items.filter((item) => matchesTab(item, key)).length])) as Record<TabKey, number>, [items])

  const metrics = useMemo(() => ({
    total: items.length,
    dueToday: items.filter((item) => getRecallDueBucket(item) === 'due_today').length,
    overdue: items.filter((item) => getRecallDueBucket(item) === 'overdue').length,
    contacted: items.filter((item) => item.status === 'contacted').length,
    waiting: items.filter((item) => item.status === 'waiting_patient').length,
    resolved: items.filter((item) => ['booked', 'completed'].includes(item.status)).length,
  }), [items])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter((item) => matchesTab(item, tab) && (!query || [item.patientName, item.patientId, item.reason, item.providerName, item.phone, item.email].join(' ').toLowerCase().includes(query)))
  }, [items, search, tab])

  async function runAction(action: () => Promise<void>, success: string) {
    setBusy(true)
    setActionMessage(null)
    setError(null)
    try {
      await action()
      setActionMessage(success)
      await load()
      if (selectedId) setAttempts(await getRecallContactAttempts(selectedId))
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The recall action could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  const selectedBranch = selected?.branchId ? branches.find((branch) => branch.id === selected.branchId) : undefined

  return (
    <PageScaffold title="Recall & Follow-Up" description="Operational recall queue based on recorded due dates, clinical follow-ups, and real contact outcomes.">
      <div className="recall-v18">
        <section className="recall-v18-hero">
          <div>
            <span className="recall-v18-kicker">Patient retention operations</span>
            <h2>Recall command center</h2>
            <p>Coordinate follow-ups, contact outcomes and booking handoffs without overstating delivery or clinical urgency.</p>
          </div>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Refresh queue</Button>
        </section>

        <section className="recall-v18-note">
          <Clock3 size={18} />
          <div><strong>Operational due dates only</strong><span>Overdue means the recorded due date has passed. It does not indicate medical urgency.</span></div>
        </section>

        <section className="recall-v18-metrics" aria-label="Recall summary">
          <article><span>Total records</span><strong>{metrics.total}</strong><small>Authorized queue</small></article>
          <article><span>Due today</span><strong>{metrics.dueToday}</strong><small>Needs review today</small></article>
          <article><span>Overdue</span><strong>{metrics.overdue}</strong><small>Past recorded due date</small></article>
          <article><span>Contacted</span><strong>{metrics.contacted}</strong><small>Real contact outcome recorded</small></article>
          <article><span>Waiting</span><strong>{metrics.waiting}</strong><small>Waiting for patient</small></article>
          <article><span>Booked / completed</span><strong>{metrics.resolved}</strong><small>Recorded workflow state</small></article>
        </section>

        <section className="recall-v18-command">
          <div className="recall-v18-tabs" role="tablist" aria-label="Recall queue status">
            {tabs.map(([key, label]) => (
              <button key={key} type="button" className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>
                <span>{label}</span><b>{tabCounts[key]}</b>
              </button>
            ))}
          </div>
          <div className="recall-v18-filters">
            <label className="recall-v18-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patient, reason, provider" /></label>
            <select value={branchId} onChange={(event) => setBranchId(event.target.value)} aria-label="Filter by branch">
              <option value="all">All authorized branches</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <select value={providerId} onChange={(event) => setProviderId(event.target.value)} aria-label="Filter by provider">
              <option value="all">All authorized providers</option>
              {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}
            </select>
          </div>
        </section>

        {error && <div className="recall-v18-alert is-error">{error}</div>}
        {actionMessage && <div className="recall-v18-alert is-success"><CheckCircle2 size={16} /> {actionMessage}</div>}

        <div className="recall-v18-workspace">
          <section className="recall-v18-queue">
            <header><div><span>Queue</span><h3>{filtered.length} records</h3></div><small>{labelize(tab)}</small></header>
            {loading ? (
              <div className="recall-v18-skeletons"><i /><i /><i /></div>
            ) : filtered.length === 0 ? (
              <div className="recall-v18-empty"><CalendarClock size={28} /><h3>{search ? 'No matching recalls' : 'No records in this view'}</h3><p>{search ? 'Try a different patient, reason or provider search.' : 'No recall or follow-up records match the current filters.'}</p></div>
            ) : (
              <div className="recall-v18-list">
                {filtered.map((item) => {
                  const bucket = getRecallDueBucket(item)
                  const branch = item.branchId ? branches.find((entry) => entry.id === item.branchId) : undefined
                  return (
                    <button key={item.id} type="button" className={`recall-v18-row ${selectedId === item.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(item.id)}>
                      <span className="recall-v18-avatar">{item.patientName.split(' ').slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || 'PT'}</span>
                      <span className="recall-v18-row-main">
                        <span className="recall-v18-row-title"><strong>{item.patientName}</strong><em className={`tone-${bucketTone(bucket)}`}>{labelize(bucket)}</em></span>
                        <span>{item.patientId} · {item.reason || 'No reason recorded'}</span>
                        <small>{item.providerName} · {branch?.name || 'Clinic-wide / unmapped'}</small>
                      </span>
                      <span className="recall-v18-row-meta"><strong>{dateLabel(item.dueDate)}</strong><small>{contactLabel(item)}</small><ChevronRight size={16} /></span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <aside className="recall-v18-detail">
            {!selected ? (
              <div className="recall-v18-empty recall-v18-empty-detail"><UserRoundCheck size={30} /><h3>Select a recall</h3><p>Choose a record from the queue to review operational details and history.</p></div>
            ) : (
              <div className="recall-v18-detail-stack">
                <header className="recall-v18-patient-head">
                  <div className="recall-v18-patient-identity"><span className="recall-v18-avatar is-large">{selected.patientName.split(' ').slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || 'PT'}</span><div><span>Patient recall</span><h3>{selected.patientName}</h3><p>{selected.patientId}</p></div></div>
                  <span className={`recall-v18-state tone-${bucketTone(getRecallDueBucket(selected))}`}>{labelize(selected.status)}</span>
                </header>

                <section className="recall-v18-info-grid">
                  <article><span>Due date</span><strong>{dateLabel(selected.dueDate)}</strong><small>{labelize(getRecallDueBucket(selected))}</small></article>
                  <article><span>Provider</span><strong>{selected.providerName}</strong><small>{selectedBranch?.name || 'Clinic-wide / unmapped'}</small></article>
                  <article><span>Type</span><strong>{labelize(selected.kind)}</strong><small>{labelize(selected.sourceType)}</small></article>
                  <article><span>Appointment</span><strong>{selected.linkedAppointmentId || 'Not linked'}</strong><small>{selected.linkedAppointmentId ? 'Existing scheduling record' : 'Booking handoff pending'}</small></article>
                </section>

                <section className="recall-v18-contact-card">
                  <div><Phone size={16} /><span>{selected.phone || 'No phone on file'}</span></div>
                  <div><Mail size={16} /><span>{selected.email || 'No email on file'}</span></div>
                  <div><MessageSquareText size={16} /><span>{contactLabel(selected)}</span></div>
                </section>

                <section className="recall-v18-summary-card"><span>Recall reason</span><h4>{selected.reason || 'No reason recorded'}</h4>{selected.patientMessage && <p>{selected.patientMessage}</p>}</section>

                <section className="recall-v18-action-grid">
                  <article className="recall-v18-action-card">
                    <header><PhoneCall size={17} /><div><h4>Record actual contact</h4><p>Manual call/walk-in outcome only. This does not claim SMS or email delivery.</p></div></header>
                    <select value={contactOutcome} onChange={(event) => setContactOutcome(event.target.value as RecallContactOutcome)}>{contactOutcomes.map((outcome) => <option key={outcome.value} value={outcome.value}>{outcome.label}</option>)}</select>
                    <textarea value={contactNotes} onChange={(event) => setContactNotes(event.target.value)} placeholder="Operational notes (optional)" />
                    <Button disabled={busy} onClick={() => void runAction(async () => { await recordManualRecallContact({ recallId: selected.id, channel: 'phone', outcome: contactOutcome as any, notes: contactNotes }); setContactNotes('') }, 'Contact outcome recorded.')}>Record phone outcome</Button>
                  </article>

                  <article className="recall-v18-action-card">
                    <header><CalendarPlus size={17} /><div><h4>Appointment handoff</h4><p>Link an appointment created through the existing scheduling workflow.</p></div></header>
                    <input value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)} placeholder="Existing appointment ID" />
                    <Button disabled={busy || !appointmentId.trim()} onClick={() => void runAction(async () => { await linkRecallToAppointment(selected.id, appointmentId); setAppointmentId('') }, 'Recall linked to the appointment.')}>Link appointment</Button>
                  </article>
                </section>

                <section className="recall-v18-resolution">
                  <div><CheckCircle2 size={17} /><div><h4>Resolve follow-up</h4><p>Complete only after the relevant follow-up has actually been satisfied.</p></div></div>
                  <Button disabled={busy || selected.status === 'completed'} onClick={() => void runAction(() => completeRecall(selected.id, selected.linkedAppointmentId), 'Recall marked completed.')}>Complete recall</Button>
                </section>

                <section className="recall-v18-dismiss">
                  <div><XCircle size={17} /><div><h4>Dismiss record</h4><p>History remains preserved.</p></div></div>
                  <input value={dismissReason} onChange={(event) => setDismissReason(event.target.value)} placeholder="Dismissal reason" />
                  <Button variant="secondary" disabled={busy || !dismissReason.trim()} onClick={() => void runAction(async () => { await dismissRecall(selected.id, dismissReason); setDismissReason('') }, 'Recall dismissed with history preserved.')}>Dismiss</Button>
                </section>

                <section className="recall-v18-history">
                  <header><div><span>Activity</span><h4>Contact history</h4></div><b>{attempts.length}</b></header>
                  {attempts.length === 0 ? <div className="recall-v18-history-empty">No contact attempts recorded.</div> : attempts.map((attempt) => (
                    <div key={attempt.id} className="recall-v18-history-row"><span className="recall-v18-history-dot" /><div><strong>{labelize(attempt.channel)} · {labelize(attempt.outcome)}</strong><span>{dateTimeLabel(attempt.attemptedAt)}</span><p>{attempt.notes || 'No notes'}</p></div></div>
                  ))}
                </section>
              </div>
            )}
          </aside>
        </div>
      </div>
    </PageScaffold>
  )
}
