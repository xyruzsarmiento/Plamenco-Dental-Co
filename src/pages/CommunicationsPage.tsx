import { Mail, MessageCircle, RefreshCw, Send, Smartphone } from 'lucide-react'
import { useMemo, useState } from 'react'
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
} from '../features/communications/communicationStore'
import { getStoredCommunicationTemplates } from '../features/communications/communicationTemplates'
import type { CommunicationChannel, CommunicationTemplateKey } from '../features/communications/communicationTypes'
import { getStoredPatients } from '../features/patients/patientStore'

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

function labelize(value: string) {
  return value.replaceAll('_', ' ')
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
  const deliveredLogs = logs.filter((log) => log.status === 'delivered').length

  function refresh() {
    setRefreshKey((key) => key + 1)
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

  const channelCards = [
    { key: 'sms' as const, configured: settings.smsConfigured, provider: settings.smsProvider },
    { key: 'email' as const, configured: settings.emailConfigured, provider: settings.emailProvider },
    { key: 'messenger' as const, configured: settings.messengerConfigured, provider: settings.messengerProvider },
  ]

  return (
    <section className="page-stack communications-page-v6">
      <header className="section-header premium-section-header communications-header-v6">
        <div>
          <p className="eyebrow">Patient communications</p>
          <h2>Communications Hub</h2>
          <p>Manage patient messaging, reminders, templates, provider queues, and delivery history without conflating queued work with successful delivery.</p>
        </div>
        <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={refresh}>Refresh</Button>
      </header>

      <section className="communications-metrics-v6" aria-label="Communication summary">
        <article><span>Delivery records</span><strong>{logs.length}</strong><small>All recorded attempts</small></article>
        <article><span>Queued / sending</span><strong>{queuedLogs.length}</strong><small>Awaiting provider completion</small></article>
        <article><span>Provider-confirmed delivered</span><strong>{deliveredLogs}</strong><small>Only recorded delivered states</small></article>
        <article><span>Failures</span><strong>{failedLogs.length}</strong><small>Available for review or retry</small></article>
      </section>

      <nav className="communications-tabs-v6" aria-label="Communications sections">
        {(['overview', 'manual', 'history', 'templates', 'outbox'] as HubTab[]).map((tab) => (
          <button key={tab} type="button" className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
            {labelize(tab)}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' && (
        <div className="communications-overview-v6">
          <section className="communications-channel-panel-v6">
            <div className="workspace-heading-v6">
              <div>
                <p className="eyebrow">Channel readiness</p>
                <h3>Provider configuration</h3>
                <p>This screen only reflects stored configuration flags. Credentials remain server-side.</p>
              </div>
            </div>
            <div className="communication-settings-grid">
              {channelCards.map((entry) => {
                const Icon = channelIcon[entry.key]
                return (
                  <article key={entry.key} className="communication-setting-card">
                    <Icon size={17} />
                    <span>{entry.key.toUpperCase()}</span>
                    <strong>{labelize(entry.provider)}</strong>
                    <Badge tone={entry.configured ? 'success' : 'neutral'}>{entry.configured ? 'Configured' : 'Not configured'}</Badge>
                  </article>
                )
              })}
            </div>
          </section>
          <CommunicationOperationsPanel actor={actor} />
        </div>
      )}

      {activeTab === 'manual' && (
        <section className="communications-composer-v6">
          <div className="communications-composer-main-v6">
            <div className="workspace-heading-v6">
              <div>
                <p className="eyebrow">Manual message</p>
                <h3>Compose patient communication</h3>
                <p>The message still passes through the existing patient preference, template, and outbox workflow.</p>
              </div>
            </div>

            <div className="communications-composer-fields-v6">
              <Select label="Patient" value={selectedPatient?.patientId ?? ''} onChange={(event) => setPatientId(event.target.value)} options={patients.map((patient) => ({ value: patient.patientId, label: `${patient.fullName || `${patient.firstName} ${patient.lastName}`} - ${patient.phone || patient.email || patient.patientId}` }))} />
              <Select label="Template" value={templateKey} onChange={(event) => setTemplateKey(event.target.value as CommunicationTemplateKey)} options={templateKeys.map((key) => ({ value: key, label: labelize(key) }))} />
              <Select label="Channel" value={channel} onChange={(event) => setChannel(event.target.value as CommunicationChannel)} options={['sms', 'email', 'messenger', 'in_app'].map((entry) => ({ value: entry, label: labelize(entry) }))} />
              <label className="field communications-message-field-v6">
                <span>Optional message override</span>
                <textarea value={messageOverride} onChange={(event) => setMessageOverride(event.target.value)} rows={8} placeholder="Leave blank to use the selected template." />
              </label>
            </div>
            <div className="communications-composer-actions-v6">
              <Button icon={<Send size={16} />} onClick={handleManualSend} disabled={!selectedPatient}>Queue communication</Button>
            </div>
          </div>

          <aside className="communications-context-v6">
            <p className="eyebrow">Delivery semantics</p>
            <h3>What happens next</h3>
            <ol>
              <li>The patient and selected channel are resolved.</li>
              <li>The existing communication service applies preferences and template rules.</li>
              <li>An outbox/provider state is recorded when applicable.</li>
              <li>Only provider-backed delivery records are shown as delivered.</li>
            </ol>
          </aside>
        </section>
      )}

      {activeTab === 'history' && (
        <section className="communications-data-panel-v6">
          <div className="workspace-heading-v6">
            <div><p className="eyebrow">Delivery history</p><h3>Patient communication records</h3><p>External communication records remain separate from internal notifications.</p></div>
          </div>
          <CommunicationHistoryPanel logs={logs} emptyMessage="No patient communication has been recorded yet." />
        </section>
      )}

      {activeTab === 'templates' && (
        <section className="communications-data-panel-v6">
          <div className="workspace-heading-v6">
            <div><p className="eyebrow">Template library</p><h3>Message templates</h3><p>Current appointment, reminder, payment, and follow-up message definitions.</p></div>
          </div>
          <div className="communications-template-grid-v6">
            {templates.map((template) => (
              <article key={`${template.key}-${template.channel}`} className="communications-template-card-v6">
                <div>
                  <p className="eyebrow">{labelize(template.channel)}</p>
                  <h4>{template.title}</h4>
                  <span>{labelize(template.key)}</span>
                </div>
                <p>{template.subject || template.body.slice(0, 150)}</p>
                <small>Last updated by {template.updatedBy}</small>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'outbox' && (
        <section className="communications-data-panel-v6">
          <div className="workspace-heading-v6">
            <div><p className="eyebrow">Provider queue</p><h3>Outbox &amp; retry</h3><p>Queued provider work is not treated as a sent or delivered message.</p></div>
          </div>
          <div className="workspace-list communications-outbox-v6">
            {outbox.map((entry) => {
              const log = logs.find((item) => item.id === entry.deliveryLogId)
              return (
                <div key={entry.id} className="workspace-row">
                  <div>
                    <strong>{entry.provider} - {labelize(entry.channel)}</strong>
                    <span>{labelize(entry.status)} - next attempt {new Date(entry.nextAttemptAt).toLocaleString()}</span>
                    <small>{log?.failureReason || log?.message || 'Queued provider delivery'}</small>
                  </div>
                  <div className="communications-outbox-action-v6">
                    <Badge tone={statusTone(entry.status)}>{labelize(entry.status)}</Badge>
                    {log && <Button size="sm" variant="secondary" onClick={() => handleRetry(log.id)}>Retry</Button>}
                  </div>
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
