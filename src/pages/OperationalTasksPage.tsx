import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock3, ExternalLink, MessageSquarePlus, RefreshCw, Search, UserRoundCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { PageScaffold } from '../components/ui/PageScaffold'
import { useAuth } from '../features/auth/AuthContext'
import { getStoredBranches } from '../features/branches/branchStore'
import {
  addOperationalTaskNote,
  claimOperationalTask,
  isTaskOverdue,
  listOperationalTasks,
  listTaskEvents,
  listTaskNotes,
  updateOperationalTaskState,
  type OperationalTask,
  type TaskEvent,
  type TaskNote,
  type TaskPriority,
  type TaskStatus,
} from '../features/tasks/taskStore'

const tabs = [
  ['my', 'My Tasks'],
  ['unassigned', 'Unassigned'],
  ['open', 'Open'],
  ['in_progress', 'In Progress'],
  ['waiting', 'Waiting'],
  ['blocked', 'Blocked'],
  ['overdue', 'Overdue'],
  ['completed', 'Completed'],
] as const

type TabKey = (typeof tabs)[number][0]

function labelize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function dateTimeLabel(value?: string) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function matchesTab(task: OperationalTask, tab: TabKey, currentProfileId?: string) {
  if (tab === 'my') return task.assigneeProfileId === currentProfileId && !['completed', 'cancelled'].includes(task.status)
  if (tab === 'unassigned') return !task.assigneeProfileId && !['completed', 'cancelled'].includes(task.status)
  if (tab === 'overdue') return isTaskOverdue(task)
  return task.status === tab
}

export function OperationalTasksPage() {
  const { user } = useAuth()
  const branches = useMemo(() => getStoredBranches(), [])
  const [tasks, setTasks] = useState<OperationalTask[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [events, setEvents] = useState<TaskEvent[]>([])
  const [notes, setNotes] = useState<TaskNote[]>([])
  const [tab, setTab] = useState<TabKey>('my')
  const [search, setSearch] = useState('')
  const [branchId, setBranchId] = useState('all')
  const [priority, setPriority] = useState<'all' | TaskPriority>('all')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [blockedReason, setBlockedReason] = useState('')
  const [note, setNote] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await listOperationalTasks({
        branchId: branchId === 'all' ? undefined : branchId,
        priority: priority === 'all' ? undefined : priority,
      })
      setTasks(data)
      setSelectedId((current) => current && data.some((task) => task.id === current) ? current : data[0]?.id ?? null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Tasks could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [branchId, priority])

  const selected = tasks.find((task) => task.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId) {
      setEvents([])
      setNotes([])
      return
    }
    void Promise.all([listTaskEvents(selectedId), listTaskNotes(selectedId)])
      .then(([eventData, noteData]) => {
        setEvents(eventData)
        setNotes(noteData)
      })
      .catch(() => {
        setEvents([])
        setNotes([])
      })
  }, [selectedId])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return tasks.filter((task) => {
      const tabMatch = matchesTab(task, tab, user?.id)
      const queryMatch = !query || [task.title, task.description, task.patientId, task.sourceType, task.sourceId, task.taskType]
        .filter(Boolean).join(' ').toLowerCase().includes(query)
      return tabMatch && queryMatch
    })
  }, [tasks, search, tab, user?.id])

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await action()
      setMessage(success)
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Task action could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(status: TaskStatus) {
    if (!selected) return
    if (status === 'blocked' && !blockedReason.trim()) {
      setError('A blocked reason is required.')
      return
    }
    await run(
      () => updateOperationalTaskState(selected, { status, blockedReason: status === 'blocked' ? blockedReason : '' }),
      status === 'completed' ? 'Task completed after persistence succeeded.' : `Task moved to ${labelize(status)}.`,
    )
    if (status === 'blocked') setBlockedReason('')
  }

  return (
    <PageScaffold
      title="Tasks / Work Queue"
      description="Unified operational work items linked to the clinic's existing source-of-truth workflows."
    >
      <div className="page-stack recall-followup-page">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Clinic Operations</p>
              <h2>Operational task inbox</h2>
              <p className="muted-label">Overdue is an operational due-date state, not a medical urgency classification.</p>
            </div>
            <Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Refresh</Button>
          </div>

          <div className="recall-tab-row" role="tablist" aria-label="Task queue status">
            {tabs.map(([key, label]) => (
              <button key={key} type="button" className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>

          <div className="treatment-filter-grid">
            <label className="search-field"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search task, patient, source" /></label>
            <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="all">All authorized branches</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <select value={priority} onChange={(event) => setPriority(event.target.value as 'all' | TaskPriority)}>
              <option value="all">All priorities</option>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </section>

        {error && <div className="error-alert">{error}</div>}
        {message && <div className="success-text"><CheckCircle2 size={15} /> {message}</div>}

        <div className="recall-workspace-grid">
          <section className="panel recall-queue-panel">
            <div className="panel-header"><div><p className="eyebrow">Queue</p><h2>{filtered.length} tasks</h2></div></div>
            {loading ? <p>Loading task queue...</p> : filtered.length === 0 ? (
              <div className="empty-state-panel"><ClipboardCheck size={22} /><h3>No tasks in this view</h3><p>No authorized operational tasks match the current filters.</p></div>
            ) : (
              <div className="recall-queue-list">
                {filtered.map((task) => (
                  <button key={task.id} type="button" className={`recall-queue-row ${selectedId === task.id ? 'active' : ''}`} onClick={() => setSelectedId(task.id)}>
                    <div><strong>{task.title}</strong><span>{labelize(task.taskType)} · {task.patientId || 'No patient linked'}</span></div>
                    <div><strong>{task.dueAt ? dateTimeLabel(task.dueAt) : 'No due date'}</strong><span>{isTaskOverdue(task) ? 'Overdue · ' : ''}{labelize(task.status)}</span></div>
                    <div><strong>{labelize(task.priority)}</strong><span>{task.assigneeProfileId ? 'Assigned' : 'Unassigned'} · {labelize(task.createdSource)}</span></div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <aside className="panel recall-detail-panel">
            {!selected ? (
              <div className="empty-state-panel"><UserRoundCheck size={22} /><h3>Select a task</h3><p>Choose a work item to review its source and history.</p></div>
            ) : (
              <div className="page-stack compact-stack">
                <div className="panel-header">
                  <div><p className="eyebrow">Operational Task</p><h2>{selected.title}</h2><p>{selected.description || 'No description recorded.'}</p></div>
                  <span className={`status-badge status-${selected.status}`}>{labelize(selected.status)}</span>
                </div>

                <dl className="detail-grid">
                  <div><dt>Priority</dt><dd>{labelize(selected.priority)}</dd></div>
                  <div><dt>Due</dt><dd>{dateTimeLabel(selected.dueAt)}</dd></div>
                  <div><dt>Source</dt><dd>{labelize(selected.sourceType)} · {selected.sourceId}</dd></div>
                  <div><dt>Created by</dt><dd>{selected.createdSource === 'user' ? 'User' : 'Created by Automation'}</dd></div>
                  <div><dt>Branch</dt><dd>{selected.branchId || 'Clinic-wide / Unmapped'}</dd></div>
                  <div><dt>Assignee</dt><dd>{selected.assigneeProfileId || 'Unassigned'}</dd></div>
                  {selected.blockedReason && <div><dt>Blocked reason</dt><dd>{selected.blockedReason}</dd></div>}
                </dl>

                {selected.sourceRoute && (
                  <Link className="button button-secondary" to={selected.sourceRoute}><ExternalLink size={15} /> Open source workflow</Link>
                )}

                {!selected.assigneeProfileId && (
                  <Button disabled={busy} onClick={() => void run(() => claimOperationalTask(selected), 'Task claimed successfully.')}>
                    <UserRoundCheck size={15} /> Claim task
                  </Button>
                )}

                <div className="recall-action-card">
                  <h3><Clock3 size={16} /> Update status</h3>
                  <div className="button-row">
                    <Button variant="secondary" disabled={busy} onClick={() => void changeStatus('in_progress')}>In Progress</Button>
                    <Button variant="secondary" disabled={busy} onClick={() => void changeStatus('waiting')}>Waiting</Button>
                  </div>
                  <input value={blockedReason} onChange={(event) => setBlockedReason(event.target.value)} placeholder="Blocked reason (required for Blocked)" />
                  <div className="button-row">
                    <Button variant="secondary" disabled={busy || !blockedReason.trim()} onClick={() => void changeStatus('blocked')}><AlertTriangle size={15} /> Block</Button>
                    <Button disabled={busy || selected.status === 'completed'} onClick={() => void changeStatus('completed')}><CheckCircle2 size={15} /> Complete</Button>
                  </div>
                </div>

                <div className="recall-action-card">
                  <h3><MessageSquarePlus size={16} /> Internal note</h3>
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Operational note" />
                  <Button disabled={busy || !note.trim()} onClick={() => void run(async () => {
                    await addOperationalTaskNote(selected.id, note)
                    setNote('')
                    setNotes(await listTaskNotes(selected.id))
                    setEvents(await listTaskEvents(selected.id))
                  }, 'Task note added.')}>Add note</Button>
                </div>

                <div className="recall-action-card">
                  <h3>History</h3>
                  {events.length === 0 ? <p className="muted-label">No task history available.</p> : events.map((event) => (
                    <div key={event.id} className="recall-attempt-row"><strong>{labelize(event.eventType)}</strong><span>{dateTimeLabel(event.createdAt)}</span>{event.notes && <p>{event.notes}</p>}</div>
                  ))}
                </div>

                <div className="recall-action-card">
                  <h3>Notes</h3>
                  {notes.length === 0 ? <p className="muted-label">No operational notes.</p> : notes.map((entry) => (
                    <div key={entry.id} className="recall-attempt-row"><strong>Internal note</strong><span>{dateTimeLabel(entry.createdAt)}</span><p>{entry.note}</p></div>
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
