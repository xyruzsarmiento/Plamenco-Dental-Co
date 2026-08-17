import { Bell, CheckCheck, Clock3, Sparkles } from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'
import { CommunicationOperationsPanel } from '../features/communications/CommunicationOperationsPanel'
import { NotificationCenter } from '../features/notifications/NotificationCenter'

export function NotificationsPage() {
  const { user } = useAuth()
  const userId = user?.id ?? user?.email ?? 'admin'

  return (
    <section className="page-stack notifications-page">
      <div className="section-header premium-section-header notifications-header">
        <div>
          <span className="eyebrow">Inbox</span>
          <h2>Notifications</h2>
          <p>Operational updates, follow-ups, and patient communication from the clinic team.</p>
        </div>

        <div className="overview-badges">
          <span className="dashboard-pill"><Bell size={14} /> Live</span>
          <span className="dashboard-pill"><Clock3 size={14} /> Recent</span>
        </div>
      </div>

      <NotificationCenter userId={userId} />

      <CommunicationOperationsPanel actor={user?.email ?? 'clinic-user'} />

      <div className="notification-summary panel">
        <div className="notification-summary-icon">
          <CheckCheck size={18} />
        </div>
        <div>
          <strong>Notification center</strong>
          <p>Unread items update immediately and the inbox remains readable across desktop, tablet, and mobile layouts.</p>
        </div>
        <div className="notification-summary-badge">
          <Sparkles size={14} />
          Premium view
        </div>
      </div>
    </section>
  )
}
