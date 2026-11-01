import { Mail, MessageCircle, Phone, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { StatusBadge } from '../../components/ui/Badge'
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

export function CommunicationHistoryPanel({ logs, emptyMessage = 'No communication history recorded.' }: CommunicationHistoryPanelProps) {
  const [showAll, setShowAll] = useState(false)
  if (!logs.length) {
    return <div className="empty-state-panel">{emptyMessage}</div>
  }

  const visibleLogs = showAll ? logs : logs.slice(0, 5)

  return (
    <div className="communication-history-panel-compact">
      <div className="communication-history-list">
        {visibleLogs.map((log) => {
          const Icon = channelIcons[log.channel]
          const timestamp = new Date(log.createdAt)
          const formattedTimestamp = Number.isNaN(timestamp.getTime())
            ? log.createdAt
            : timestamp.toLocaleString('en-PH', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              timeZone: 'Asia/Manila',
            })
          return (
            <article key={log.id} className="communication-history-row">
              <div className="communication-history-icon" aria-hidden="true">
                <Icon size={14} />
              </div>
              <div className="communication-history-copy">
                <div className="communication-history-mainline">
                  <strong className="communication-history-title">{log.subject || log.templateKey.replaceAll('_', ' ')}</strong>
                  <StatusBadge status={log.status} variant="compact" />
                </div>
                <div className="communication-history-meta">
                  <span>{log.channel.replace('_', ' ')}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={log.createdAt}>{formattedTimestamp}</time>
                </div>
                {log.message && (
                  <details className="communication-history-details">
                    <summary>View message</summary>
                    <p className="communication-history-message">{log.message}</p>
                  </details>
                )}
                {log.failureReason && <p className="communication-history-failure">{log.failureReason}</p>}
              </div>
            </article>
          )
        })}
      </div>
      {logs.length > 5 && (
        <button className="communication-history-toggle" type="button" onClick={() => setShowAll((current) => !current)}>
          {showAll ? 'Show latest 5' : `Show all ${logs.length} messages`}
        </button>
      )}
    </div>
  )
}
