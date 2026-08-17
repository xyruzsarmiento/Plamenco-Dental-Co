import { RefreshCw, Send, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import {
  getCommunicationDeliveryLogs,
  getCommunicationOutbox,
  getCommunicationSettings,
} from './communicationStore'
import { previewEligibleAppointmentReminders, queueAppointmentReminders } from './reminderScheduler'

type CommunicationOperationsPanelProps = {
  actor: string
}

export function CommunicationOperationsPanel({ actor }: CommunicationOperationsPanelProps) {
  const [snapshot, setSnapshot] = useState(() => ({
    settings: getCommunicationSettings(),
    logs: getCommunicationDeliveryLogs().slice(0, 8),
    outbox: getCommunicationOutbox(),
    reminders: previewEligibleAppointmentReminders().filter((entry) => !entry.alreadyQueued),
  }))
  const { settings, logs, outbox, reminders } = snapshot

  function refresh() {
    setSnapshot({
      settings: getCommunicationSettings(),
      logs: getCommunicationDeliveryLogs().slice(0, 8),
      outbox: getCommunicationOutbox(),
      reminders: previewEligibleAppointmentReminders().filter((entry) => !entry.alreadyQueued),
    })
  }

  function runReminderScan() {
    queueAppointmentReminders(new Date(), actor)
    refresh()
  }

  return (
    <section className="communication-operations panel">
      <div className="communication-panel-header">
        <div>
          <p className="eyebrow">Communications</p>
          <h3>Delivery engine</h3>
        </div>
        <Button size="sm" variant="secondary" onClick={refresh}>
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
            <Button size="sm" onClick={runReminderScan}>
              <Send size={14} />
              Queue due reminders
            </Button>
          </div>
          <p className="communication-muted">
            {reminders.length} upcoming reminder window{reminders.length === 1 ? '' : 's'} eligible or approaching. Server cron should call this worker on schedule.
          </p>
        </div>
        <div>
          <h4>Outbox</h4>
          <p className="communication-muted">{outbox.length} server-side provider job{outbox.length === 1 ? '' : 's'} queued.</p>
        </div>
      </div>

      <div className="communication-recent-log">
        <h4>Recent delivery records</h4>
        {logs.length ? logs.map((log) => (
          <div key={log.id} className="communication-log-mini">
            <span>{log.channel.replace('_', ' ')}</span>
            <strong>{log.templateKey.replaceAll('_', ' ')}</strong>
            <Badge tone={log.status === 'sent' ? 'success' : log.status === 'failed' ? 'danger' : log.status === 'queued' ? 'warning' : 'neutral'}>{log.status}</Badge>
          </div>
        )) : (
          <div className="empty-state-panel">No delivery records yet.</div>
        )}
      </div>
    </section>
  )
}
