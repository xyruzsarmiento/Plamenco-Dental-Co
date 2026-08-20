import { Bell, MessageSquareText } from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'
import { CommunicationOperationsPanel } from '../features/communications/CommunicationOperationsPanel'
import { NotificationCenter } from '../features/notifications/NotificationCenter'

export function NotificationsPage() {
  const { user } = useAuth()
  const userId = user?.id ?? user?.email ?? 'admin'

  return (
    <section className="page-stack notifications-page notifications-page-v6">
      <header className="section-header premium-section-header notifications-header">
        <div>
          <p className="eyebrow">Operational inbox</p>
          <h2>Announcements &amp; Notifications</h2>
          <p>Review internal clinic updates and the communication work queue without inferring external delivery success.</p>
        </div>
      </header>

      <div className="notifications-workspace-v6">
        <section className="notifications-primary-v6">
          <div className="workspace-heading-v6">
            <span className="workspace-icon-v6"><Bell size={18} /></span>
            <div>
              <p className="eyebrow">Your inbox</p>
              <h3>Clinic notifications</h3>
              <p>Unread state and notification history come from the existing notification source.</p>
            </div>
          </div>
          <NotificationCenter userId={userId} />
        </section>

        <aside className="notifications-secondary-v6">
          <div className="workspace-heading-v6">
            <span className="workspace-icon-v6"><MessageSquareText size={18} /></span>
            <div>
              <p className="eyebrow">Communication operations</p>
              <h3>Reminder work queue</h3>
              <p>Queued, skipped, due, and provider-backed states remain distinct.</p>
            </div>
          </div>
          <CommunicationOperationsPanel actor={user?.email ?? 'clinic-user'} />
        </aside>
      </div>
    </section>
  )
}
