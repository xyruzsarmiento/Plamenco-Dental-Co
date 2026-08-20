import { useMemo, useState } from 'react'
import { Mail, MessageCircle, RefreshCw, Send, Smartphone } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Select'
import { useAuth } from '../features/auth/AuthContext'
import { CommunicationHistoryPanel } from '../features/communications/CommunicationHistoryPanel'
import { CommunicationOperationsPanel } from '../features/communications/CommunicationOperationsPanel'
import { sendManualPatientCommunication } from '../features/communications/communicationService'
import {
  getCommunicationDeliveryLogs,
  getCommunicationOutbox,
  getCommunicationSettings,
  retryCommunicationDelivery,
  saveCommunicationSettings,
} from '../features/communications/communicationStore'
import { getStoredCommunicationTemplates } from '../features/communications/communicationTemplates'
import type { CommunicationChannel, CommunicationTemplateKey } from '../features/communications/communicationTypes'
import { getStoredPatients } from '../features/patients/patientStore'
import { recordAuditEntry } from '../features/security/auditLogStore'

type HubTab = 'overview' | 'manual' | 'history' | 'templates' | 'outbox'

const channelIcon: Record<CommunicationChannel, typeof Smartphone> = {
  sms: Smartphone,
  email: Mail,
  messenger: MessageCircle,
  in_app: Send,
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (status === 'sent' || status === 'delivered') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'queued' || status === 'sending' || status === 'processing') return 'warning'
  if (status === 'skipped') return 'neutral'
  return 'info'
}

export function CommunicationsPage() {
  const { user } = useAuth()
  const actor = user?.email ?? 'clinic-user'
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState<HubTab>('overview')
  const [patientId, setPatientId] = useState('')
  const [templateKey, setTemplateKey] = useState<CommunicationTemplateKey>('appointment_confirmed')
  const [channel, setChannel] = useState<CommunicationChannel>('sms')
  const [messageOverride, setMessageOverride] = useState('')

  const settings = useMemo(() => {
    void refreshKey
    return getCommunicationSettings()
  }, [refreshKey])
  const logs = useMemo(() => {
    void refreshKey
    return getCommunicationDeliveryLogs()
  }, [refreshKey])
  const outbox = useMemo(() => {
    void refreshKey
    return getCommunicationOutbox()
  }, [refreshKey])
  const templates = useMemo(() => {
    void refreshKey
    return getStoredCommunicationTemplates()
  }, [refreshKey])
  const patients = useMemo(() => getStoredPatients(), [])
  const selectedPatient = patients.find((patient) => patient.patientId === patientId) ?? patients[0]
  const templateKeys = [...new Set(templates.map((template) => template.key))]
  const failedLogs = logs.filter((log) => log.status === 'failed')
  const queuedLogs = logs.filter((log) => log.status === 'queued' || log.status === 'sending')

  function refresh() {
    setRefreshKey((key) => key + 1)
  }

  function toggleConfigured(target: 'sms' | 'email' | 'messenger') {
    const next = {
      ...settings,
      smsConfigured: target === 'sms' ? !settings.smsConfigured : settings.smsConfigured,
      emailConfigured: target === 'email' ? !settings.emailConfigured : settings.emailConfigured,
      messengerConfigured: target === 'messenger' ? !settings.messengerConfigured : settings.messengerConfigured,
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
    }
    saveCommunicationSettings(next)
    const enabled = target === 'sms' ? next.smsConfigured : target === 'email' ? next.emailConfigured : next.messengerConfigured
    recordAuditEntry({ user: actor, action: 'communication_settings_changed', entity: 'communication_settings', entityId: 'clinic', metadata: { target, enabled } })
    refresh()
  }

  function handleManualSend() {
    const patient = selectedPatient
    if (!patient) return
    sendManualPatientCommunication({
      patientId: patient.patientId,
      templateKey,
      actor,
      channels: [channel],
      messageOverride: messageOverride.trim() || undefined,
      relatedType: 'manual',
    })
    setPatientId(patient.patientId)
    setMessageOverride('')
    refresh()
  }

  function handleRetry(logId: string) {
    retryCommunicationDelivery(logId, actor)
    refresh()
  }

  return (
    <section className="page-stack">
      <div className="section-header premium-section-header">
        <div>
          <span className="eyebrow">Patient communications</span>
          <h2>Communications Hub</h2>
          <p>One queue, one template layer, and one delivery history for SMS, Messenger, email, and patient portal messages.</p>
        </div>
        <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={refresh}>Refresh</Button>
      </div>

      <div className="stats-grid">
        <article className="stat-card"><span>Delivery records</span><strong>{logs.length}</strong><small>{queuedLogs.length} queued</small></article>
        <article className="stat-card"><span>Failures</span><strong>{failedLogs.length}</strong><small>Retry from outbox/history</small></article>
        <article className="stat-card"><span>Outbox jobs</span><strong>{outbox.length}</strong><small>{settings.maxRetryAttempts} max attempts</small></article>
        <article className="stat-card"><span>Templates</span><strong>{templates.length}</strong><small>{templateKeys.length} events</small></article>
      </div>

      <div className="toolbar-row" style={{ flexWrap: 'wrap' }}>
        {(['overview', 'manual', 'history', 'templates', 'outbox'] as HubTab[]).map((tab) => (
          <button key={tab} type="button" className={`tab-button ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="workspace-grid">
          <section className="workspace-panel">
            <div className="section-header"><div><h3>Channel Configuration</h3><p>Provider credentials stay server-side; this view only tracks readiness.</p></div></div>
            <div className="communication-settings-grid">
              {(['sms', 'email', 'messenger'] as const).map((entry) => {
                const Icon = channelIcon[entry]
                const configured = entry === 'sms' ? settings.smsConfigured : entry === 'email' ? settings.emailConfigured : settings.messengerConfigured
                const provider = entry === 'sms' ? settings.smsProvider : entry === 'email' ? settings.emailProvider : settings.messengerProvider
                return (
                  <div key={entry} className="communication-setting-card">
                    <Icon size={17} />
                    <span>{entry.toUpperCase()}</span>
                    <strong>{provider.replaceAll('_', ' ')}</strong>
                    <Badge tone={configured ? 'success' : 'neutral'}>{configured ? 'Configured' : 'Not configured'}</Badge>
                    <Button size="sm" variant="secondary" onClick={() => toggleConfigured(entry)}>{configured ? 'Disable' : 'Mark Ready'}</Button>
                  </div>
                )
              })}
            </div>
          </section>
          <CommunicationOperationsPanel actor={actor} />
        </div>
      )}

      {activeTab === 'manual' && (
        <section className="workspace-panel">
          <div className="section-header"><div><h3>Manual Patient Message</h3><p>Uses patient preferences, template resolution, and the central outbox.</p></div><Button icon={<Send size={16} />} onClick={handleManualSend}>Send</Button></div>
          <div className="filter-panel" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) repeat(2, minmax(160px, 220px))', gap: 12 }}>
            <Select label="Patient" value={selectedPatient?.patientId ?? ''} onChange={(event) => setPatientId(event.target.value)} options={patients.map((patient) => ({ value: patient.patientId, label: `${patient.fullName || `${patient.firstName} ${patient.lastName}`} - ${patient.phone || patient.email || patient.patientId}` }))} />
            <Select label="Template" value={templateKey} onChange={(event) => setTemplateKey(event.target.value as CommunicationTemplateKey)} options={templateKeys.map((key) => ({ value: key, label: key.replaceAll('_', ' ') }))} />
            <Select label="Channel" value={channel} onChange={(event) => setChannel(event.target.value as CommunicationChannel)} options={['sms', 'email', 'messenger', 'in_app'].map((entry) => ({ value: entry, label: entry.replaceAll('_', ' ') }))} />
          </div>
          <label className="field">
            <span>Optional message override</span>
            <textarea value={messageOverride} onChange={(event) => setMessageOverride(event.target.value)} rows={5} placeholder="Leave blank to use the selected template." />
          </label>
        </section>
      )}

      {activeTab === 'history' && (
        <section className="workspace-panel">
          <div className="section-header"><div><h3>Delivery History</h3><p>Patient-facing external communication history, separate from internal notifications.</p></div></div>
          <CommunicationHistoryPanel logs={logs} emptyMessage="No patient communication has been recorded yet." />
        </section>
      )}

      {activeTab === 'templates' && (
        <section className="workspace-panel">
          <div className="section-header"><div><h3>Message Templates</h3><p>Appointment, no-show, rescheduling, reminder, and payment templates by channel.</p></div></div>
          <div className="workspace-list">
            {templates.map((template) => (
              <div key={`${template.key}-${template.channel}`} className="workspace-row">
                <div><strong>{template.title}</strong><span>{template.key.replaceAll('_', ' ')} - {template.channel.replaceAll('_', ' ')}</span><small>{template.subject || template.body.slice(0, 110)}</small></div>
                <Badge tone="info">{template.updatedBy}</Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'outbox' && (
        <section className="workspace-panel">
          <div className="section-header"><div><h3>Outbox & Retry</h3><p>Server-side provider jobs waiting for SMS, email, or Messenger dispatch.</p></div></div>
          <div className="workspace-list">
            {outbox.map((entry) => {
              const log = logs.find((item) => item.id === entry.deliveryLogId)
              return (
                <div key={entry.id} className="workspace-row">
                  <div><strong>{entry.provider} - {entry.channel}</strong><span>{entry.status} - next attempt {new Date(entry.nextAttemptAt).toLocaleString()}</span><small>{log?.failureReason || log?.message || 'Queued provider delivery'}</small></div>
                  <div style={{ textAlign: 'right' }}><Badge tone={statusTone(entry.status)}>{entry.status}</Badge>{log && <Button size="sm" variant="secondary" onClick={() => handleRetry(log.id)}>Retry</Button>}</div>
                </div>
              )
            })}
            {outbox.length === 0 && <div className="empty-state-panel">No provider jobs in the outbox.</div>}
          </div>
        </section>
      )}
    </section>
  )
}
