import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleDot, ClipboardCheck, Clock3, Filter, Inbox, MessageSquarePlus, RefreshCw, Search, Sparkles, TimerReset, UserRoundCheck } from 'lucide-react'
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

function shortDueLabel(value?: string) {
  if (!value) return 'No due date'
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function matchesTab(task: OperationalTask, tab: TabKey, currentProfileId?: string) {
  if (tab === 'my') return task.assigneeProfileId === currentProfileId && !['completed', 'cancelled'].includes(task.status)
  if (tab === 'unassigned') return !task.assigneeProfileId && !['completed', 'cancelled'].includes(task.status)
  if (tab === 'overdue') return isTaskOverdue(task)
  return task.status === tab
}

function priorityTone(priority: TaskPriority) {
  if (priority === 'critical') return 'critical'
  if (priority === 'high') return 'high'
  if (priority === 'low') return 'low'
  return 'normal'
}

export function OperationalTasksPageV17() {
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

  const summary = useMemo(() => ({
    open: tasks.filter((task) => ['open', 'in_progress', 'waiting', 'blocked'].includes(task.status)).length,
    overdue: tasks.filter(isTaskOverdue).length,
    unassigned: tasks.filter((task) => !task.assigneeProfileId && !['completed', 'cancelled'].includes(task.status)).length,
    completed: tasks.filter((task) => task.status === 'completed').length,
  }), [tasks])

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
    <PageScaffold title="Tasks / Work Queue" description="Operational work orchestration across authorized clinic workflows.">
      <div className="tasks-v17">
        <section className="tasks-v17-hero">
          <div>
            <div className="tasks-v17-kicker"><Sparkles size={15} /> Clinic Operations</div>
            <h1>Work Queue Command Center</h1>
            <p>Prioritize operational work, claim ownership, and resolve blockers without leaving the source workflow.</p>
          </div>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Refresh queue</Button>
        </section>

        <section className="tasks-v17-metrics" aria-label="Task queue summary">
          <article><span className="tasks-v17-metric-icon"><Inbox size={18} /></span><div><small>Open workload</small><strong>{summary.open}</strong><p>Active operational items</p></div></article>
          <article><span className="tasks-v17-metric-icon warning"><TimerReset size={18} /></span><div><small>Overdue</small><strong>{summary.overdue}</strong><p>Past operational due date</p></div></article>
          <article><span className="tasks-v17-metric-icon"><UserRoundCheck size={18} /></span><div><small>Unassigned</small><strong>{summary.unassigned}</strong><p>Awaiting ownership</p></div></article>
          <article><span className="tasks-v17-metric-icon success"><CheckCircle2 size={18} /></span><div><small>Completed</small><strong>{summary.completed}</strong><p>Resolved work items</p></div></article>
        </section>

        <section className="tasks-v17-command">
          <div className="tasks-v17-tabs" role="tablist" aria-label="Task queue status">
            {tabs.map(([key, label]) => (
              <button key={key} type="button" className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
                {label}
                <span>{tasks.filter((task) => matchesTab(task, key, user?.id)).length}</span>
              </button>
            ))}
          </div>
          <div className="tasks-v17-filters">
            <label className="tasks-v17-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search task, patient, source" /></label>
            <label><Filter size={15} /><select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="all">All authorized branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label><CircleDot size={15} /><select value={priority} onChange={(event) => setPriority(event.target.value as 'all' | TaskPriority)}><option value="all">All priorities</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label>
          </div>
          <p className="tasks-v17-footnote">Overdue indicates operational timing only; it is not a medical urgency classification.</p>
        </section>

        {error && <div className="tasks-v17-alert error" role="alert">{error}</div>}
        {message && <div className="tasks-v17-alert success" role="status"><CheckCircle2 size={15} /> {message}</div>}

        <div className="tasks-v17-workspace">
          <section className="tasks-v17-queue">
            <header><div><span>Queue</span><h2>{filtered.length} {filtered.length === 1 ? 'task' : 'tasks'}</h2></div><small>{labelize(tab)}</small></header>
            {loading ? (
              <div className="tasks-v17-empty"><RefreshCw size={22} /><h3>Loading work queue</h3><p>Retrieving authorized operational tasks.</p></div>
            ) : filtered.length === 0 ? (
              <div className="tasks-v17-empty"><ClipboardCheck size={24} /><h3>No tasks in this view</h3><p>No authorized operational tasks match the current filters.</p></div>
            ) : (
              <div className="tasks-v17-list">
                {filtered.map((task) => (
                  <button key={task.id} type="button" className={`tasks-v17-card ${selectedId === task.id ? 'active' : ''}`} onClick={() => setSelectedId(task.id)}>
                    <div className="tasks-v17-card-top">
                      <span className={`tasks-v17-priority ${priorityTone(task.priority)}`}>{labelize(task.priority)}</span>
                      <span className={`tasks-v17-status status-${task.status}`}>{isTaskOverdue(task) ? 'Overdue' : labelize(task.status)}</span>
                    </div>
                    <h3>{task.title}</h3>
                    <p>{task.description || `${labelize(task.taskType)} operational work item.`}</p>
                    <div className="tasks-v17-card-meta">
                      <span><Clock3 size={14} /> {shortDueLabel(task.dueAt)}</span>
                      <span><UserRoundCheck size={14} /> {task.assigneeProfileId ? 'Assigned' : 'Unassigned'}</span>
                    </div>
                    <div className="tasks-v17-card-footer"><span>{task.patientId || 'No patient linked'}</span><span>{labelize(task.sourceType)}</span></div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <aside className="tasks-v17-detail">
            {!selected ? (
              <div className="tasks-v17-empty detail"><UserRoundCheck size={24} /><h3>Select a task</h3><p>Choose a work item to review ownership, source, actions, and history.</p></div>
            ) : (
              <>
                <header className="tasks-v17-detail-header">
                  <div><span>Operational Task</span><h2>{selected.title}</h2><p>{selected.description || 'No description recorded.'}</p></div>
                  <span className={`tasks-v17-status status-${selected.status}`}>{labelize(selected.status)}</span>
                </header>

                <section className="tasks-v17-detail-grid">
                  <article><small>Priority</small><strong>{labelize(selected.priority)}</strong></article>
                  <article><small>Due</small><strong>{dateTimeLabel(selected.dueAt)}</strong></article>
                  <article><small>Branch</small><strong>{branches.find((branch) => branch.id === selected.branchId)?.name || selected.branchId || 'Clinic-wide / Unmapped'}</strong></article>
                  <article><small>Assignee</small><strong>{selected.assigneeProfileId || 'Unassigned'}</strong></article>
                  <article><small>Source</small><strong>{labelize(selected.sourceType)}</strong><span>{selected.sourceId}</span></article>
                  <article><small>Created by</small><strong>{selected.createdSource === 'user' ? 'User' : 'Automation'}</strong></article>
                </section>

                {selected.blockedReason && <div className="tasks-v17-blocked"><AlertTriangle size={16} /><div><strong>Blocked reason</strong><p>{selected.blockedReason}</p></div></div>}

                <div className="tasks-v17-detail-actions">
                  {selected.sourceRoute && <Link className="tasks-v17-source-link" to={selected.sourceRoute}>Open source workflow <ArrowUpRight size={15} /></Link>}
                  {!selected.assigneeProfileId && <Button disabled={busy} onClick={() => void run(() => claimOperationalTask(selected), 'Task claimed successfully.')}><UserRoundCheck size={15} /> Claim task</Button>}
                </div>

                <section className="tasks-v17-action-card">
                  <header><div><span>Workflow state</span><h3>Update task status</h3></div><Clock3 size={18} /></header>
                  <div className="tasks-v17-action-grid">
                    <Button variant="secondary" disabled={busy} onClick={() => void changeStatus('in_progress')}>In Progress</Button>
                    <Button variant="secondary" disabled={busy} onClick={() => void changeStatus('waiting')}>Waiting</Button>
                  </div>
                  <label><span>Blocked reason</span><input value={blockedReason} onChange={(event) => setBlockedReason(event.target.value)} placeholder="Required only when blocking this task" /></label>
                  <div className="tasks-v17-action-grid">
                    <Button variant="secondary" disabled={busy || !blockedReason.trim()} onClick={() => void changeStatus('blocked')}><AlertTriangle size={15} /> Block</Button>
                    <Button disabled={busy || selected.status === 'completed'} onClick={() => void changeStatus('completed')}><CheckCircle2 size={15} /> Complete</Button>
                  </div>
                </section>

                <section className="tasks-v17-action-card">
                  <header><div><span>Collaboration</span><h3>Internal note</h3></div><MessageSquarePlus size={18} /></header>
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add operational context for the next person handling this task" />
                  <Button disabled={busy || !note.trim()} onClick={() => void run(async () => {
                    await addOperationalTaskNote(selected.id, note)
                    setNote('')
                    setNotes(await listTaskNotes(selected.id))
                    setEvents(await listTaskEvents(selected.id))
                  }, 'Task note added.')}>Add note</Button>
                </section>

                <section className="tasks-v17-history-grid">
                  <article className="tasks-v17-history-card">
                    <header><span>Activity</span><h3>Task history</h3></header>
                    {events.length === 0 ? <p className="tasks-v17-muted">No task history available.</p> : events.map((event) => (
                      <div key={event.id} className="tasks-v17-timeline-row"><i /><div><strong>{labelize(event.eventType)}</strong><span>{dateTimeLabel(event.createdAt)}</span>{event.notes && <p>{event.notes}</p>}</div></div>
                    ))}
                  </article>
                  <article className="tasks-v17-history-card">
                    <header><span>Notes</span><h3>Operational notes</h3></header>
                    {notes.length === 0 ? <p className="tasks-v17-muted">No operational notes.</p> : notes.map((entry) => (
                      <div key={entry.id} className="tasks-v17-note-row"><strong>Internal note</strong><span>{dateTimeLabel(entry.createdAt)}</span><p>{entry.note}</p></div>
                    ))}
                  </article>
                </section>
              </>
            )}
          </aside>
        </div>
      </div>
    </PageScaffold>
  )
}
