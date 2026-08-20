import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Inbox,
  Mail,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  UserRound,
} from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { PageScaffold } from '../components/ui/PageScaffold'
import { useAuth } from '../features/auth/AuthContext'
import { usePermissions } from '../features/auth/permissions'
import { sendManualPatientCommunication } from '../features/communications/communicationService'
import {
  getCommunicationDeliveryLogs,
  getCommunicationOutbox,
  getCommunicationSettings,
  retryCommunicationDelivery,
} from '../features/communications/communicationStore'
import { getStoredCommunicationTemplates } from '../features/communications/communicationTemplates'
import type {
  CommunicationChannel,
  CommunicationDeliveryLog,
  CommunicationTemplateKey,
} from '../features/communications/communicationTypes'
import { previewEligibleAppointmentReminders, queueAppointmentReminders } from '../features/communications/reminderScheduler'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredPatients } from '../features/patients/patientStore'

type HubTab = 'overview' | 'manual' | 'history' | 'templates' | 'outbox'

type Feedback = { tone: 'success' | 'warning' | 'danger' | 'info'; message: string } | null

const tabs: Array<{ key: HubTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'manual', label: 'Manual' },
  { key: 'history', label: 'History' },
  { key: 'templates', label: 'Templates' },
  { key: 'outbox', label: 'Outbox' },
]

const channelIcon: Record<CommunicationChannel, typeof Smartphone> = {
  sms: Smartphone,
  email: Mail,
  messenger: MessageCircle,
  in_app: Send,
}

function labelize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (status === 'delivered') return 'success'
  if (status === 'sent') return 'info'
  if (status === 'failed') return 'danger'
  if (['queued', 'sending', 'processing'].includes(status)) return 'warning'
  if (status === 'skipped') return 'neutral'
  return 'info'
}

function formatDateTime(value?: string) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function patientName(patientId: string) {
  const patient = getStoredPatients().find((entry) => entry.patientId === patientId)
  return patient?.fullName || [patient?.firstName, patient?.lastName].filter(Boolean).join(' ') || patientId
}

function branchName(branchId?: string) {
  if (!branchId) return 'Clinic-wide / unmapped'
  return getStoredBranches().find((branch) => branch.id === branchId)?.name ?? branchId
}

export function CommunicationsPageV24() {
  const { user } = useAuth()
  const permissions = usePermissions()
  const actor = user?.email ?? 'clinic-user'
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState<HubTab>('overview')
  const [patientId, setPatientId] = useState('')
  const [templateKey, setTemplateKey] = useState<CommunicationTemplateKey>('appointment_confirmed')
  const [channel, setChannel] = useState<CommunicationChannel>('sms')
  const [messageOverride, setMessageOverride] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [channelFilter, setChannelFilter] = useState('all')
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const [queueing, setQueueing] = useState(false)
  const [sendingManual, setSendingManual] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const settings = useMemo(() => { void refreshKey; return getCommunicationSettings() }, [refreshKey])
  const logs = useMemo(() => { void refreshKey; return getCommunicationDeliveryLogs() }, [refreshKey])
  const outbox = useMemo(() => { void refreshKey; return getCommunicationOutbox() }, [refreshKey])
  const templates = useMemo(() => { void refreshKey; return getStoredCommunicationTemplates() }, [refreshKey])
  const patients = useMemo(() => getStoredPatients(), [])
  const reminders = useMemo(() => { void refreshKey; return previewEligibleAppointmentReminders() }, [refreshKey])
  const selectedPatient = patients.find((patient) => patient.patientId === patientId) ?? patients[0]
  const templateKeys = [...new Set(templates.map((template) => template.key))]
  const selectedLog = selectedLogId ? logs.find((log) => log.id === selectedLogId) ?? null : logs[0] ?? null

  const queuedLogs = logs.filter((log) => ['queued', 'sending'].includes(log.status))
  const deliveredLogs = logs.filter((log) => log.status === 'delivered')
  const failedLogs = logs.filter((log) => log.status === 'failed')
  const dueReminders = reminders.filter((entry) => entry.isDue)
  const upcomingReminders = reminders.filter((entry) => !entry.isDue && !entry.alreadyQueued && !entry.isExpired)
  const canQueueReminders = permissions.canAny(['communications.manage', 'notifications.send'])

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase()
    return logs.filter((log) => {
      const matchesSearch = !query || [patientName(log.patientId), log.templateKey, log.channel, log.provider, log.recipient, log.businessEvent ?? ''].join(' ').toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || log.status === statusFilter
      const matchesChannel = channelFilter === 'all' || log.channel === channelFilter
      return matchesSearch && matchesStatus && matchesChannel
    })
  }, [channelFilter, logs, search, statusFilter])

  function refresh() {
    setRefreshKey((key) => key + 1)
  }

  async function handleManualSend() {
    const patient = selectedPatient
    if (!patient || sendingManual) return
    setSendingManual(true)
    setFeedback(null)
    try {
      await Promise.resolve()
      const created = sendManualPatientCommunication({
        patientId: patient.patientId,
        templateKey,
        actor,
        channels: [channel],
        messageOverride: messageOverride.trim() || undefined,
        relatedType: 'manual',
      })
      const queued = created.filter((entry) => entry.status === 'queued').length
      const sentInApp = created.filter((entry) => entry.status === 'sent' && entry.channel === 'in_app').length
      const skipped = created.filter((entry) => entry.status === 'skipped').length
      const failed = created.filter((entry) => entry.status === 'failed').length
      if (!created.length) {
        setFeedback({ tone: 'warning', message: 'No communication record was created. Check the template, patient contact details, and communication preferences.' })
      } else if (!queued && !sentInApp) {
        setFeedback({ tone: failed ? 'danger' : 'warning', message: `${skipped} channel${skipped === 1 ? '' : 's'} skipped. Nothing was reported as sent or delivered.` })
      } else {
        const parts = []
        if (queued) parts.push(`${queued} provider job${queued === 1 ? '' : 's'} queued`)
        if (sentInApp) parts.push(`${sentInApp} in-app notification${sentInApp === 1 ? '' : 's'} created`)
        if (skipped) parts.push(`${skipped} channel${skipped === 1 ? '' : 's'} skipped`)
        setFeedback({ tone: skipped || failed ? 'warning' : 'success', message: `${parts.join('; ')}. External queued jobs are not treated as sent or delivered until their provider record changes.` })
      }
      setPatientId(patient.patientId)
      setMessageOverride('')
      refresh()
    } catch (error) {
      setFeedback({ tone: 'danger', message: error instanceof Error ? error.message : 'Unable to queue the communication.' })
    } finally {
      setSendingManual(false)
    }
  }

  async function queueDueReminders() {
    if (!canQueueReminders || queueing) return
    setQueueing(true)
    setFeedback(null)
    try {
      const due = previewEligibleAppointmentReminders().filter((entry) => entry.isDue)
      if (!due.length) {
        setFeedback({ tone: 'info', message: 'No confirmed appointments have a reminder due right now.' })
        refresh()
        return
      }
      await Promise.resolve()
      const created = queueAppointmentReminders(new Date(), actor)
      const queued = created.filter((entry) => entry.status === 'queued').length
      const inApp = created.filter((entry) => entry.status === 'sent' && entry.channel === 'in_app').length
      const skipped = created.filter((entry) => entry.status === 'skipped').length
      const failed = created.filter((entry) => entry.status === 'failed').length
      if (!created.length) {
        setFeedback({ tone: 'warning', message: 'A reminder was due, but no communication record was created. Check patient contact details, preferences, templates, and provider configuration.' })
      } else if (!queued && !inApp) {
        setFeedback({ tone: failed ? 'danger' : 'warning', message: `${skipped} reminder channel${skipped === 1 ? '' : 's'} skipped. Nothing was reported as sent.` })
      } else {
        const parts = []
        if (queued) parts.push(`${queued} external provider job${queued === 1 ? '' : 's'} queued`)
        if (inApp) parts.push(`${inApp} in-app notification${inApp === 1 ? '' : 's'} created`)
        if (skipped) parts.push(`${skipped} channel${skipped === 1 ? '' : 's'} skipped`)
        setFeedback({ tone: skipped || failed ? 'warning' : 'success', message: `${parts.join('; ')}. Provider jobs remain queued until provider-backed status updates them.` })
      }
      refresh()
    } catch (error) {
      setFeedback({ tone: 'danger', message: error instanceof Error ? error.message : 'Unable to queue due appointment reminders.' })
    } finally {
      setQueueing(false)
    }
  }

  function handleRetry(log: CommunicationDeliveryLog) {
    setFeedback(null)
    try {
      retryCommunicationDelivery(log.id, actor)
      setFeedback({ tone: 'info', message: 'Retry requested. The provider queue remains the source of truth for subsequent delivery state.' })
      refresh()
    } catch (error) {
      setFeedback({ tone: 'danger', message: error instanceof Error ? error.message : 'Unable to retry this communication.' })
    }
  }

  const channelCards = [
    { key: 'sms' as const, configured: settings.smsConfigured, provider: settings.smsProvider },
    { key: 'email' as const, configured: settings.emailConfigured, provider: settings.emailProvider },
    { key: 'messenger' as const, configured: settings.messengerConfigured, provider: settings.messengerProvider },
  ]

  return (
    <PageScaffold title="Communications Hub" description="Manage patient messaging, reminders, templates, provider queues, and delivery history.">
      <div className="communications-v24">
        <section className="communications-v24-hero">
          <div>
            <span className="communications-v24-kicker">Patient communications operations</span>
            <h2>Communications command center</h2>
            <p>Coordinate manual outreach, reminders, provider queues, and delivery history without overstating communication success.</p>
          </div>
          <Button variant="secondary" onClick={refresh}><RefreshCw size={16} /> Refresh data</Button>
        </section>

        <section className="communications-v24-truth">
          <ShieldCheck size={19} />
          <div><strong>Delivery truth</strong><span>Queued is not sent. Sent is not delivered. Only provider-confirmed delivery records are shown as delivered.</span></div>
        </section>

        <section className="communications-v24-metrics" aria-label="Communications summary">
          <article><span>Delivery records</span><strong>{logs.length}</strong><small>All recorded attempts</small><i><Inbox size={17} /></i></article>
          <article><span>Queued / sending</span><strong>{queuedLogs.length}</strong><small>Awaiting provider completion</small><i><Clock3 size={17} /></i></article>
          <article><span>Delivered</span><strong>{deliveredLogs.length}</strong><small>Provider-confirmed only</small><i><CheckCircle2 size={17} /></i></article>
          <article><span>Failures</span><strong>{failedLogs.length}</strong><small>Review or retry</small><i><AlertTriangle size={17} /></i></article>
          <article><span>Due reminders</span><strong>{dueReminders.length}</strong><small>Eligible now</small><i><Send size={17} /></i></article>
          <article><span>Outbox</span><strong>{outbox.length}</strong><small>Provider jobs</small><i><Inbox size={17} /></i></article>
        </section>

        <section className="communications-v24-command">
          <div className="communications-v24-tabs" role="tablist" aria-label="Communications workspace">
            {tabs.map((tab) => <button key={tab.key} type="button" className={activeTab === tab.key ? 'is-active' : ''} onClick={() => setActiveTab(tab.key)}>{tab.label}<span>{tab.key === 'history' ? logs.length : tab.key === 'outbox' ? outbox.length : tab.key === 'templates' ? templates.length : ''}</span></button>)}
          </div>
          {(activeTab === 'history' || activeTab === 'outbox') && <div className="communications-v24-filters"><label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patient, provider, template" /></label>{activeTab === 'history' && <><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{['queued','sending','sent','delivered','failed','skipped'].map((entry) => <option key={entry} value={entry}>{labelize(entry)}</option>)}</select><select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}><option value="all">All channels</option>{['sms','email','messenger','in_app'].map((entry) => <option key={entry} value={entry}>{labelize(entry)}</option>)}</select></>}</div>}
        </section>

        {feedback && <div className={`communications-v24-feedback is-${feedback.tone}`} role="status" aria-live="polite">{feedback.message}</div>}

        {activeTab === 'overview' && <div className="communications-v24-overview">
          <section className="communications-v24-panel communications-v24-provider-panel">
            <header><div><span>Channel readiness</span><h3>Provider configuration</h3><p>Stored configuration flags only. Provider credentials remain server-side.</p></div></header>
            <div className="communications-v24-provider-grid">{channelCards.map((entry) => { const Icon = channelIcon[entry.key]; return <article key={entry.key}><div className="communications-v24-icon"><Icon size={18} /></div><div><span>{entry.key.toUpperCase()}</span><strong>{labelize(entry.provider)}</strong><small>{entry.configured ? 'Provider configuration is marked ready.' : 'Provider is not configured for external delivery.'}</small></div><Badge tone={entry.configured ? 'success' : 'neutral'}>{entry.configured ? 'Configured' : 'Not configured'}</Badge></article> })}</div>
          </section>
          <aside className="communications-v24-engine">
            <header><div><span>Delivery engine</span><h3>Reminder & queue control</h3></div><Settings2 size={18} /></header>
            <div className="communications-v24-engine-grid"><article><span>Reminder offsets</span><strong>{settings.reminderOffsetsHours.map((hours) => `${hours}h`).join(', ')}</strong><small>{settings.timezone}</small></article><article><span>Upcoming windows</span><strong>{upcomingReminders.length}</strong><small>Not due yet</small></article><article><span>Max retries</span><strong>{settings.maxRetryAttempts}</strong><small>Configured delivery attempts</small></article><article><span>Outbox jobs</span><strong>{outbox.length}</strong><small>Queued != delivered</small></article></div>
            <div className="communications-v24-reminder-action"><div><strong>{dueReminders.length} due reminder window{dueReminders.length === 1 ? '' : 's'}</strong><span>Only confirmed appointments currently eligible are considered.</span></div><Button onClick={() => void queueDueReminders()} disabled={!canQueueReminders || queueing || dueReminders.length === 0}><Send size={15} /> {queueing ? 'Queueing…' : 'Queue due reminders'}</Button></div>
            {!canQueueReminders && <div className="communications-v24-inline-note">Your account can view communications but cannot queue patient reminders.</div>}
          </aside>
          <section className="communications-v24-panel communications-v24-recent"><header><div><span>Recent activity</span><h3>Latest communication records</h3><p>Status remains provider/source-of-truth based.</p></div></header>{logs.slice(0,6).length ? <div>{logs.slice(0,6).map((log) => <button key={log.id} type="button" onClick={() => { setSelectedLogId(log.id); setActiveTab('history') }}><span className="communications-v24-avatar"><UserRound size={17} /></span><span><strong>{patientName(log.patientId)}</strong><small>{labelize(log.templateKey)} · {labelize(log.channel)} · {formatDateTime(log.createdAt)}</small></span><Badge tone={statusTone(log.status)}>{labelize(log.status)}</Badge><ChevronRight size={16} /></button>)}</div> : <div className="communications-v24-empty"><Inbox size={28} /><h3>No delivery records yet</h3><p>Communication attempts will appear here once the current workflows create them.</p></div>}</section>
        </div>}

        {activeTab === 'manual' && <div className="communications-v24-compose-layout"><section className="communications-v24-panel communications-v24-compose"><header><div><span>Manual communication</span><h3>Compose patient outreach</h3><p>The existing preference, template and provider queue logic remains in control.</p></div></header><div className="communications-v24-form-grid"><label><span>Patient</span><select value={selectedPatient?.patientId ?? ''} onChange={(event) => setPatientId(event.target.value)}>{patients.map((patient) => <option key={patient.patientId} value={patient.patientId}>{patient.fullName || `${patient.firstName} ${patient.lastName}`} · {patient.phone || patient.email || patient.patientId}</option>)}</select></label><label><span>Template</span><select value={templateKey} onChange={(event) => setTemplateKey(event.target.value as CommunicationTemplateKey)}>{templateKeys.map((key) => <option key={key} value={key}>{labelize(key)}</option>)}</select></label><label><span>Channel</span><select value={channel} onChange={(event) => setChannel(event.target.value as CommunicationChannel)}>{['sms','email','messenger','in_app'].map((entry) => <option key={entry} value={entry}>{labelize(entry)}</option>)}</select></label><label className="is-wide"><span>Optional message override</span><textarea value={messageOverride} onChange={(event) => setMessageOverride(event.target.value)} rows={8} placeholder="Leave blank to use the selected template." /></label></div><div className="communications-v24-compose-footer"><span>External messages may be queued rather than sent immediately.</span><Button onClick={() => void handleManualSend()} disabled={!selectedPatient || sendingManual}><Send size={16} /> {sendingManual ? 'Queueing…' : 'Queue communication'}</Button></div></section><aside className="communications-v24-semantics"><span>Workflow semantics</span><h3>What happens next</h3><ol><li>Patient and channel availability are resolved.</li><li>Preferences and template rules are applied.</li><li>External work is added to the provider outbox when eligible.</li><li>Only provider-backed status changes can mark delivery.</li></ol></aside></div>}

        {activeTab === 'history' && <div className="communications-v24-history-layout"><section className="communications-v24-panel communications-v24-history"><header><div><span>Delivery history</span><h3>{filteredLogs.length} communication records</h3><p>Search and inspect actual recorded communication attempts.</p></div></header>{filteredLogs.length ? <div className="communications-v24-history-list">{filteredLogs.map((log) => <button key={log.id} type="button" className={selectedLog?.id === log.id ? 'is-selected' : ''} onClick={() => setSelectedLogId(log.id)}><span className="communications-v24-channel-icon">{(() => { const Icon = channelIcon[log.channel]; return <Icon size={17} /> })()}</span><span className="communications-v24-history-main"><strong>{patientName(log.patientId)}</strong><span>{labelize(log.templateKey)} · {log.provider}</span><small>{formatDateTime(log.createdAt)} · {branchName(log.branchId)}</small></span><span className="communications-v24-history-end"><Badge tone={statusTone(log.status)}>{labelize(log.status)}</Badge><ChevronRight size={16} /></span></button>)}</div> : <div className="communications-v24-empty"><Search size={28} /><h3>No communication matches</h3><p>Adjust the search or status filters.</p></div>}</section><aside className="communications-v24-detail">{selectedLog ? <><header><div><span>Communication record</span><h3>{patientName(selectedLog.patientId)}</h3><p>{labelize(selectedLog.templateKey)}</p></div><Badge tone={statusTone(selectedLog.status)}>{labelize(selectedLog.status)}</Badge></header><div className="communications-v24-detail-grid"><article><span>Channel</span><strong>{labelize(selectedLog.channel)}</strong></article><article><span>Provider</span><strong>{labelize(selectedLog.provider)}</strong></article><article><span>Recipient</span><strong>{selectedLog.recipient || 'Not recorded'}</strong></article><article><span>Branch</span><strong>{branchName(selectedLog.branchId)}</strong></article><article><span>Dispatch</span><strong>{labelize(selectedLog.dispatchMode ?? 'system')}</strong></article><article><span>Attempts</span><strong>{selectedLog.attemptCount}</strong></article></div><section><span>Message</span><p>{selectedLog.message || 'No message body recorded.'}</p></section><section><span>Provider result</span><p>{selectedLog.providerMessageId ? `Provider message ID: ${selectedLog.providerMessageId}` : 'No provider message ID recorded.'}</p><small>{selectedLog.failureReason || `Updated ${formatDateTime(selectedLog.updatedAt)}`}</small></section>{selectedLog.status === 'failed' && <Button variant="secondary" onClick={() => handleRetry(selectedLog)}>Retry communication</Button>}</> : <div className="communications-v24-empty"><Inbox size={28} /><h3>Select a communication</h3><p>Choose a history row to inspect provider and delivery context.</p></div>}</aside></div>}

        {activeTab === 'templates' && <section className="communications-v24-panel"><header><div><span>Template library</span><h3>Message templates</h3><p>Current communication definitions used by manual and automated workflows.</p></div></header>{templates.length ? <div className="communications-v24-template-grid">{templates.map((template) => <article key={`${template.key}-${template.channel}`}><div><span>{labelize(template.channel)}</span><Badge tone="info">{labelize(template.key)}</Badge></div><h4>{template.title}</h4><p>{template.subject || template.body.slice(0,180)}</p><small>Updated {formatDateTime(template.updatedAt)} · {template.updatedBy}</small></article>)}</div> : <div className="communications-v24-empty"><Mail size={28} /><h3>No communication templates</h3><p>No stored templates are currently available.</p></div>}</section>}

        {activeTab === 'outbox' && <section className="communications-v24-panel"><header><div><span>Provider outbox</span><h3>{outbox.length} queued provider jobs</h3><p>Outbox state is operational queue state, not confirmed delivery.</p></div></header>{outbox.length ? <div className="communications-v24-outbox-list">{outbox.map((entry) => { const log = logs.find((item) => item.id === entry.deliveryLogId); return <article key={entry.id}><span className="communications-v24-channel-icon">{(() => { const Icon = channelIcon[entry.channel]; return <Icon size={17} /> })()}</span><div><strong>{patientName(entry.patientId ?? log?.patientId ?? '')}</strong><span>{labelize(entry.channel)} · {labelize(entry.provider)} · next attempt {formatDateTime(entry.nextAttemptAt)}</span><small>{log?.failureReason || log?.message || 'Queued provider delivery'}</small></div><div><Badge tone={statusTone(entry.status)}>{labelize(entry.status)}</Badge>{log && <Button size="sm" variant="secondary" onClick={() => handleRetry(log)}>Retry</Button>}</div></article> })}</div> : <div className="communications-v24-empty"><Inbox size={28} /><h3>Outbox is clear</h3><p>No provider jobs are queued right now.</p></div>}</section>}
      </div>
    </PageScaffold>
  )
}
