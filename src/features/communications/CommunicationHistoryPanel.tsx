import { Mail, MessageCircle, Phone, Smartphone } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import type { CommunicationChannel, CommunicationDeliveryLog } from './communicationTypes'

type CommunicationHistoryPanelProps = {
  logs: CommunicationDeliveryLog[]
  emptyMessage?: string
}

const channelIcons: Record<CommunicationChannel, typeof Phone> = {
  sms: Phone,
  email: Mail,
  messenger: MessageCircle,
  in_app: Smartphone,
}

function getStatusTone(status: CommunicationDeliveryLog['status']) {
  if (status === 'sent' || status === 'delivered') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'queued' || status === 'sending') return 'warning'
  return 'neutral'
}

export function CommunicationHistoryPanel({ logs, emptyMessage = 'No communication history recorded.' }: CommunicationHistoryPanelProps) {
  if (!logs.length) {
    return <div className="empty-state-panel">{emptyMessage}</div>
  }

  return (
    <div className="communication-history-list">
      {logs.map((log) => {
        const Icon = channelIcons[log.channel]
        return (
          <article key={log.id} className="communication-history-row">
            <div className="communication-history-icon">
              <Icon size={16} />
            </div>
            <div>
              <strong>{log.subject || log.templateKey.replaceAll('_', ' ')}</strong>
              <span>{log.channel.replace('_', ' ')} - {new Date(log.createdAt).toLocaleString()}</span>
              <p>{log.message}</p>
              {log.failureReason && <small>{log.failureReason}</small>}
            </div>
            <Badge tone={getStatusTone(log.status)}>{log.status}</Badge>
          </article>
        )
      })}
    </div>
  )
}
