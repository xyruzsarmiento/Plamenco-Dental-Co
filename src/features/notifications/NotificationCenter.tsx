import { Bell, CalendarClock, CheckCheck, CreditCard, Sparkles, Stethoscope, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import {
  getNotificationsByUser,
  getUnreadNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from './notificationStore'
import type { AppNotification, NotificationKind } from './notificationTypes'

type NotificationCenterProps = {
  userId: string
}

const kindConfig: Record<NotificationKind, { label: string; icon: typeof Bell }> = {
  appointment: { label: 'Appointment', icon: CalendarClock },
  payment: { label: 'Payment', icon: CreditCard },
  treatment: { label: 'Treatment', icon: Stethoscope },
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function NotificationCenter({ userId }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>(() => getNotificationsByUser(userId))

  const unread = useMemo(() => getUnreadNotifications(userId), [userId])

  function refresh() {
    setNotifications(getNotificationsByUser(userId))
  }

  function handleMarkRead(id: string) {
    markNotificationAsRead(id)
    refresh()
  }

  function handleMarkAllRead() {
    markAllNotificationsAsRead(userId)
    refresh()
  }

  return (
    <section className="notification-center panel">
      <div className="notification-header">
        <div className="notification-heading">
          <div className="notification-icon-wrap">
            <Bell size={18} />
          </div>
          <div>
            <p className="eyebrow">Inbox</p>
            <h3>Notifications</h3>
          </div>
        </div>

        <div className="notification-actions">
          <Badge tone={unread.length > 0 ? 'warning' : 'neutral'}>{unread.length} unread</Badge>
          <Button variant="secondary" size="sm" onClick={handleMarkAllRead} disabled={unread.length === 0}>
            Mark all as read
          </Button>
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="notification-empty-state">
          <Sparkles size={20} />
          <h4>You&apos;re all caught up.</h4>
          <p>No new notifications right now.</p>
        </div>
      ) : (
        <div className="notification-list">
          {notifications.map((notification) => {
            const kindMeta = kindConfig[notification.kind] ?? { label: 'Update', icon: UserRound }
            const Icon = kindMeta.icon
            const isUnread = !notification.isRead

            return (
              <article key={notification.id} className={`notification-item ${isUnread ? 'is-unread' : 'is-read'}`}>
                <div className="notification-item-icon">
                  <Icon size={18} />
                </div>

                <div className="notification-item-body">
                  <div className="notification-item-topline">
                    <div className="notification-main-copy">
                      <strong>{notification.title}</strong>
                      <p>{notification.message}</p>
                    </div>

                    {isUnread && <span className="notification-indicator" aria-label="Unread notification" />}
                  </div>

                  <div className="notification-item-meta">
                    <span className="notification-time">{formatDate(notification.createdAt)}</span>
                    <span className="notification-category">{kindMeta.label}</span>
                    <span className={`notification-state ${isUnread ? 'state-unread' : 'state-read'}`}>
                      {isUnread ? 'Unread' : 'Read'}
                    </span>
                  </div>
                </div>

                <div className="notification-actions-stack">
                  {isUnread ? (
                    <Button variant="secondary" size="sm" onClick={() => handleMarkRead(notification.id)}>
                      Mark as read
                    </Button>
                  ) : (
                    <div className="notification-read-state">
                      <CheckCheck size={14} />
                      Read
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
