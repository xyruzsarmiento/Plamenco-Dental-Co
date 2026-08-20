import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, CheckCircle2, Clock3, MessageSquareText, PhoneCall, RefreshCw, Search, UserRoundCheck, XCircle } from 'lucide-react'
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
  ['waiting_patient', 'Waiting for Patient'],
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
  if (!value) return 'Recall date not recorded'
  return new Date(`${value}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function dateTimeLabel(value?: string) {
  if (!value) return 'No contact recorded'
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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

export function RecallFollowUpPage() {
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

  useEffect(() => {
    void load()
  }, [branchId, providerId])

  const selected = items.find((item) => item.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId) {
      setAttempts([])
      return
    }
    void getRecallContactAttempts(selectedId)
      .then(setAttempts)
      .catch(() => setAttempts([]))
  }, [selectedId])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter((item) => {
      const tabMatch = matchesTab(item, tab)
      const queryMatch = !query || [
        item.patientName,
        item.patientId,
        item.reason,
        item.providerName,
        item.phone,
        item.email,
      ].join(' ').toLowerCase().includes(query)
      return tabMatch && queryMatch
    })
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

  return (
    <PageScaffold
      title="Recall & Follow-Up"
      description="Operational recall queue based on recorded due dates, clinical follow-ups, and real contact outcomes."
    >
      <div className="page-stack recall-followup-page">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Front Desk Operations</p>
              <h2>Recall work queue</h2>
              <p className="muted-label">Overdue means the recorded due date has passed. It does not indicate medical urgency.</p>
            </div>
            <Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Refresh</Button>
          </div>

          <div className="recall-tab-row" role="tablist" aria-label="Recall queue status">
            {tabs.map(([key, label]) => (
              <button key={key} type="button" className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>

          <div className="treatment-filter-grid">
            <label className="search-field"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patient, reason, provider" /></label>
            <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="all">All authorized branches</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
              <option value="all">All authorized providers</option>
              {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}
            </select>
          </div>
        </section>

        {error && <div className="error-alert">{error}</div>}
        {actionMessage && <div className="success-text"><CheckCircle2 size={15} /> {actionMessage}</div>}

        <div className="recall-workspace-grid">
          <section className="panel recall-queue-panel">
            <div className="panel-header"><div><p className="eyebrow">Queue</p><h2>{filtered.length} records</h2></div></div>
            {loading ? <p>Loading recall queue...</p> : filtered.length === 0 ? (
              <div className="empty-state-panel"><Clock3 size={22} /><h3>No records in this view</h3><p>No recall or follow-up records match the current filters.</p></div>
            ) : (
              <div className="recall-queue-list">
                {filtered.map((item) => {
                  const bucket = getRecallDueBucket(item)
                  return (
                    <button key={item.id} type="button" className={`recall-queue-row ${selectedId === item.id ? 'active' : ''}`} onClick={() => setSelectedId(item.id)}>
                      <div><strong>{item.patientName}</strong><span>{item.patientId} · {item.reason || 'No reason recorded'}</span></div>
                      <div><strong>{dateLabel(item.dueDate)}</strong><span>{labelize(bucket)} · {labelize(item.status)}</span></div>
                      <div><strong>{item.providerName}</strong><span>{item.lastContactAt ? `Last contact ${dateTimeLabel(item.lastContactAt)}` : 'No contact recorded'}</span></div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <aside className="panel recall-detail-panel">
            {!selected ? (
              <div className="empty-state-panel"><UserRoundCheck size={22} /><h3>Select a recall</h3><p>Choose a record from the queue to review operational details.</p></div>
            ) : (
              <div className="page-stack compact-stack">
                <div className="panel-header"><div><p className="eyebrow">Patient</p><h2>{selected.patientName}</h2><p>{selected.patientId}</p></div><span className={`status-badge status-${selected.status}`}>{labelize(selected.status)}</span></div>
                <dl className="detail-grid">
                  <div><dt>Type</dt><dd>{labelize(selected.kind)}</dd></div>
                  <div><dt>Source</dt><dd>{labelize(selected.sourceType)}</dd></div>
                  <div><dt>Due date</dt><dd>{dateLabel(selected.dueDate)}</dd></div>
                  <div><dt>Provider</dt><dd>{selected.providerName}</dd></div>
                  <div><dt>Reason</dt><dd>{selected.reason || 'Not recorded'}</dd></div>
                  <div><dt>Linked appointment</dt><dd>{selected.linkedAppointmentId || 'Not booked'}</dd></div>
                </dl>

                <div className="recall-action-card">
                  <h3><PhoneCall size={16} /> Record actual contact</h3>
                  <p className="muted-label">This records a manual call/walk-in outcome. It does not claim SMS/email delivery.</p>
                  <select value={contactOutcome} onChange={(event) => setContactOutcome(event.target.value as RecallContactOutcome)}>
                    {contactOutcomes.map((outcome) => <option key={outcome.value} value={outcome.value}>{outcome.label}</option>)}
                  </select>
                  <textarea value={contactNotes} onChange={(event) => setContactNotes(event.target.value)} placeholder="Operational notes (optional)" />
                  <Button disabled={busy} onClick={() => void runAction(async () => {
                    await recordManualRecallContact({ recallId: selected.id, channel: 'phone', outcome: contactOutcome as any, notes: contactNotes })
                    setContactNotes('')
                  }, 'Contact outcome recorded.')}>Record phone outcome</Button>
                </div>

                <div className="recall-action-card">
                  <h3><CalendarPlus size={16} /> Appointment handoff</h3>
                  <p className="muted-label">Create the appointment through the existing scheduling workflow first, then link its ID here. Linking does not create or bypass availability checks.</p>
                  <input value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)} placeholder="Existing appointment ID" />
                  <Button disabled={busy || !appointmentId.trim()} onClick={() => void runAction(async () => {
                    await linkRecallToAppointment(selected.id, appointmentId)
                    setAppointmentId('')
                  }, 'Recall linked to the appointment.')}>Link appointment</Button>
                </div>

                <div className="recall-action-card">
                  <h3><CheckCircle2 size={16} /> Completion</h3>
                  <p className="muted-label">Complete only after the relevant follow-up has actually been satisfied.</p>
                  <Button disabled={busy || selected.status === 'completed'} onClick={() => void runAction(() => completeRecall(selected.id, selected.linkedAppointmentId), 'Recall marked completed.')}>Complete recall</Button>
                </div>

                <div className="recall-action-card">
                  <h3><XCircle size={16} /> Dismiss</h3>
                  <input value={dismissReason} onChange={(event) => setDismissReason(event.target.value)} placeholder="Dismissal reason" />
                  <Button variant="secondary" disabled={busy || !dismissReason.trim()} onClick={() => void runAction(async () => {
                    await dismissRecall(selected.id, dismissReason)
                    setDismissReason('')
                  }, 'Recall dismissed with history preserved.')}>Dismiss recall</Button>
                </div>

                <div className="recall-action-card">
                  <h3><MessageSquareText size={16} /> Contact history</h3>
                  {attempts.length === 0 ? <p className="muted-label">No contact attempts recorded.</p> : attempts.map((attempt) => (
                    <div key={attempt.id} className="recall-attempt-row"><strong>{labelize(attempt.channel)} · {labelize(attempt.outcome)}</strong><span>{dateTimeLabel(attempt.attemptedAt)}</span><p>{attempt.notes || 'No notes'}</p></div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </PageScaffold>
  )
}
