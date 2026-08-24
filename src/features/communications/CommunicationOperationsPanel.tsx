import { RefreshCw, Send, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { Badge, StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { usePermissions } from '../auth/permissions'
import {
  getCommunicationDeliveryLogs,
  getCommunicationOutbox,
  getCommunicationSettings,
} from './communicationStore'
import { previewEligibleAppointmentReminders, queueAppointmentReminders } from './reminderScheduler'

type CommunicationOperationsPanelProps = {
  actor: string
}

type QueueFeedback = {
  tone: 'success' | 'warning' | 'danger' | 'info'
  message: string
} | null

export function CommunicationOperationsPanel({ actor }: CommunicationOperationsPanelProps) {
  const permissions = usePermissions()
  const [isQueueing, setIsQueueing] = useState(false)
  const [queueFeedback, setQueueFeedback] = useState<QueueFeedback>(null)
  const [snapshot, setSnapshot] = useState(() => ({
    settings: getCommunicationSettings(),
    logs: getCommunicationDeliveryLogs().slice(0, 8),
    outbox: getCommunicationOutbox(),
    reminders: previewEligibleAppointmentReminders(),
  }))
  const { settings, logs, outbox, reminders } = snapshot
  const canQueueReminders = permissions.canAny(['communications.manage', 'notifications.send'])
  const dueReminders = reminders.filter((entry) => entry.isDue)
  const upcomingReminders = reminders.filter((entry) => !entry.isDue && !entry.alreadyQueued && !entry.isExpired)

  function refresh() {
    setSnapshot({
      settings: getCommunicationSettings(),
      logs: getCommunicationDeliveryLogs().slice(0, 8),
      outbox: getCommunicationOutbox(),
      reminders: previewEligibleAppointmentReminders(),
    })
  }

  async function runReminderScan() {
    if (!canQueueReminders || isQueueing) return

    setIsQueueing(true)
    setQueueFeedback(null)

    try {
      const dueBeforeScan = previewEligibleAppointmentReminders().filter((entry) => entry.isDue)
      if (!dueBeforeScan.length) {
        setQueueFeedback({ tone: 'info', message: 'No confirmed appointments have a reminder due right now.' })
        refresh()
        return
      }

      // Yield once so the loading state is painted before a potentially larger reminder scan.
      await Promise.resolve()
      const createdLogs = queueAppointmentReminders(new Date(), actor)
      const queuedExternal = createdLogs.filter((log) => log.status === 'queued').length
      const sentInApp = createdLogs.filter((log) => log.status === 'sent' && log.channel === 'in_app').length
      const skipped = createdLogs.filter((log) => log.status === 'skipped').length
      const failed = createdLogs.filter((log) => log.status === 'failed').length

      if (!createdLogs.length) {
        setQueueFeedback({
          tone: 'warning',
          message: 'A reminder was due, but no communication record was created. Check the patient record, templates, and communication preferences.',
        })
      } else if (queuedExternal === 0 && sentInApp === 0) {
        setQueueFeedback({
          tone: failed > 0 ? 'danger' : 'warning',
          message: `${skipped} reminder channel${skipped === 1 ? '' : 's'} skipped. Check patient contact details, preferences, and provider configuration. Nothing was reported as sent.`,
        })
      } else {
        const parts = []
        if (queuedExternal) parts.push(`${queuedExternal} external provider job${queuedExternal === 1 ? '' : 's'} queued`)
        if (sentInApp) parts.push(`${sentInApp} in-app notification${sentInApp === 1 ? '' : 's'} created`)
        if (skipped) parts.push(`${skipped} channel${skipped === 1 ? '' : 's'} skipped`)
        setQueueFeedback({
          tone: skipped || failed ? 'warning' : 'success',
          message: `${parts.join('; ')}. Queued provider jobs are not treated as sent or delivered until the provider worker updates their delivery records.`,
        })
      }

      refresh()
    } catch (error) {
      setQueueFeedback({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to queue due appointment reminders.',
      })
    } finally {
      setIsQueueing(false)
    }
  }

  return (
    <section className="communication-operations panel">
      <div className="communication-panel-header">
        <div>
          <p className="eyebrow">Communications</p>
          <h3>Delivery engine</h3>
        </div>
        <Button size="sm" variant="secondary" onClick={refresh} disabled={isQueueing}>
          <RefreshCw size={14} />
          Refresh
        </Button>
      </div>

      <div className="communication-settings-grid">
        <div className="communication-setting-card">
          <Settings2 size={17} />
          <span>SMS</span>
          <strong>{settings.smsProvider}</strong>
          <Badge tone={settings.smsConfigured ? 'success' : 'neutral'}>{settings.smsConfigured ? 'Configured' : 'Not configured'}</Badge>
        </div>
        <div className="communication-setting-card">
          <Settings2 size={17} />
          <span>Email</span>
          <strong>{settings.emailProvider.replaceAll('_', ' ')}</strong>
          <Badge tone={settings.emailConfigured ? 'success' : 'neutral'}>{settings.emailConfigured ? 'Configured' : 'Not configured'}</Badge>
        </div>
        <div className="communication-setting-card">
          <Settings2 size={17} />
          <span>Messenger</span>
          <strong>{settings.messengerProvider.replaceAll('_', ' ')}</strong>
          <Badge tone={settings.messengerConfigured ? 'success' : 'neutral'}>{settings.messengerConfigured ? 'Configured' : 'Not configured'}</Badge>
        </div>
        <div className="communication-setting-card">
          <Settings2 size={17} />
          <span>Reminder offsets</span>
          <strong>{settings.reminderOffsetsHours.join('h, ')}h</strong>
          <Badge tone="info">{settings.timezone}</Badge>
        </div>
      </div>

      <div className="communication-panel-split">
        <div>
          <div className="communication-subheader">
            <h4>Reminder scan</h4>
            <Button size="sm" onClick={() => void runReminderScan()} disabled={!canQueueReminders || isQueueing || dueReminders.length === 0}>
              <Send size={14} />
              {isQueueing ? 'Queueing…' : 'Queue due reminders'}
            </Button>
          </div>
          <p className="communication-muted">
            {dueReminders.length} due reminder window{dueReminders.length === 1 ? '' : 's'} now; {upcomingReminders.length} upcoming. Confirmed appointments remain eligible after a missed scan until the appointment begins, and only the most recent missed offset is queued per appointment.
          </p>
          {!canQueueReminders && (
            <div className="alert alert-warning" role="status">You can view reminder status, but your account does not have permission to queue patient communications.</div>
          )}
          {queueFeedback && (
            <div className={`alert alert-${queueFeedback.tone === 'danger' ? 'error' : queueFeedback.tone}`} role="status" aria-live="polite">
              {queueFeedback.message}
            </div>
          )}
        </div>
        <div>
          <h4>Outbox</h4>
          <p className="communication-muted">{outbox.length} server-side provider job{outbox.length === 1 ? '' : 's'} queued. Outbox status is separate from provider sent/delivered status.</p>
        </div>
      </div>

      <div className="communication-recent-log">
        <h4>Recent delivery records</h4>
        {logs.length ? logs.map((log) => (
          <div key={log.id} className="communication-log-mini">
            <span>{log.channel.replace('_', ' ')}</span>
            <strong>{log.templateKey.replaceAll('_', ' ')}</strong>
            <StatusBadge status={log.status} variant="compact" />
          </div>
        )) : (
          <div className="empty-state-panel">No delivery records yet.</div>
        )}
      </div>
    </section>
  )
}
