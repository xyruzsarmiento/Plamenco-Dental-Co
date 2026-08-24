import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  CalendarClock,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Inbox,
  MessageSquareText,
  RefreshCw,
  Send,
  Sparkles,
  Stethoscope,
} from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Pagination } from '../components/ui/DesignSystem'
import { useAuth } from '../features/auth/AuthContext'
import { usePermissions } from '../features/auth/permissions'
import {
  getCommunicationDeliveryLogs,
  getCommunicationOutbox,
  getCommunicationSettings,
} from '../features/communications/communicationStore'
import { previewEligibleAppointmentReminders, queueAppointmentReminders } from '../features/communications/reminderScheduler'
import {
  getNotificationsByUser,
  getUnreadNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../features/notifications/notificationStore'
import type { AppNotification, NotificationKind } from '../features/notifications/notificationTypes'

const kindConfig: Record<NotificationKind, { label: string; icon: typeof Bell }> = {
  appointment: { label: 'Appointment', icon: CalendarClock },
  payment: { label: 'Payment', icon: CreditCard },
  treatment: { label: 'Treatment', icon: Stethoscope },
}

type NotificationFilter = 'all' | 'unread' | NotificationKind
const INBOX_PAGE_SIZE = 10

function labelize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function priorityTone(priority: AppNotification['priority']): 'danger' | 'warning' | 'info' {
  if (priority === 'high') return 'danger'
  if (priority === 'low') return 'info'
  return 'warning'
}

export function NotificationsPageV25() {
  const { user } = useAuth()
  const permissions = usePermissions()
  const userId = user?.id ?? user?.email ?? 'admin'
  const actor = user?.email ?? 'clinic-user'
  const [refreshKey, setRefreshKey] = useState(0)
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isQueueing, setIsQueueing] = useState(false)
  const [queueFeedback, setQueueFeedback] = useState<{ tone: 'success' | 'warning' | 'danger' | 'info'; message: string } | null>(null)
  const [inboxPage, setInboxPage] = useState(1)

  const notifications = useMemo(() => {
    void refreshKey
    return getNotificationsByUser(userId)
  }, [refreshKey, userId])
  const unread = useMemo(() => {
    void refreshKey
    return getUnreadNotifications(userId)
  }, [refreshKey, userId])
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
  const reminders = useMemo(() => {
    void refreshKey
    return previewEligibleAppointmentReminders()
  }, [refreshKey])

  const dueReminders = reminders.filter((entry) => entry.isDue)
  const upcomingReminders = reminders.filter((entry) => !entry.isDue && !entry.alreadyQueued && !entry.isExpired)
  const failedLogs = logs.filter((log) => log.status === 'failed')
  const deliveredLogs = logs.filter((log) => log.status === 'delivered')
  const canQueueReminders = permissions.canAny(['communications.manage', 'notifications.send'])

  const filtered = notifications.filter((notification) => {
    if (filter === 'all') return true
    if (filter === 'unread') return !notification.isRead
    return notification.kind === filter
  })
  const inboxPageCount = Math.max(1, Math.ceil(filtered.length / INBOX_PAGE_SIZE))
  const visibleNotifications = filtered.slice((Math.min(inboxPage, inboxPageCount) - 1) * INBOX_PAGE_SIZE, Math.min(inboxPage, inboxPageCount) * INBOX_PAGE_SIZE)
  const selected = notifications.find((notification) => notification.id === selectedId) ?? filtered[0] ?? null

  useEffect(() => {
    setInboxPage(1)
  }, [filter])

  useEffect(() => {
    setInboxPage((page) => Math.min(page, inboxPageCount))
  }, [inboxPageCount])

  function refresh() {
    setRefreshKey((key) => key + 1)
  }

  function markRead(id: string) {
    markNotificationAsRead(id)
    refresh()
  }

  function markAllRead() {
    markAllNotificationsAsRead(userId)
    refresh()
  }

  async function queueDueReminders() {
    if (!canQueueReminders || isQueueing) return
    setIsQueueing(true)
    setQueueFeedback(null)
    try {
      const dueBefore = previewEligibleAppointmentReminders().filter((entry) => entry.isDue)
      if (!dueBefore.length) {
        setQueueFeedback({ tone: 'info', message: 'No confirmed appointments have a reminder due right now.' })
        refresh()
        return
      }
      await Promise.resolve()
      const created = queueAppointmentReminders(new Date(), actor)
      const queued = created.filter((log) => log.status === 'queued').length
      const sentInApp = created.filter((log) => log.status === 'sent' && log.channel === 'in_app').length
      const skipped = created.filter((log) => log.status === 'skipped').length
      const failed = created.filter((log) => log.status === 'failed').length

      if (!created.length) {
        setQueueFeedback({ tone: 'warning', message: 'A reminder was due, but no communication record was created.' })
      } else if (!queued && !sentInApp) {
        setQueueFeedback({ tone: failed ? 'danger' : 'warning', message: `${skipped} reminder channel${skipped === 1 ? '' : 's'} skipped. Nothing was reported as sent.` })
      } else {
        const parts = []
        if (queued) parts.push(`${queued} external provider job${queued === 1 ? '' : 's'} queued`)
        if (sentInApp) parts.push(`${sentInApp} in-app notification${sentInApp === 1 ? '' : 's'} created`)
        if (skipped) parts.push(`${skipped} channel${skipped === 1 ? '' : 's'} skipped`)
        setQueueFeedback({ tone: skipped || failed ? 'warning' : 'success', message: `${parts.join('; ')}. Queued external jobs are not treated as delivered until provider-backed status confirms it.` })
      }
      refresh()
    } catch (error) {
      setQueueFeedback({ tone: 'danger', message: error instanceof Error ? error.message : 'Unable to queue due reminders.' })
    } finally {
      setIsQueueing(false)
    }
  }

  return (
    <section className="notifications-v25">
      <header className="notifications-v25-hero">
        <div>
          <span className="notifications-v25-kicker">Operational communications</span>
          <h2>Announcements &amp; Notifications</h2>
          <p>Review internal clinic updates and reminder operations while keeping queued, sent, and provider-confirmed delivery states distinct.</p>
        </div>
        <Button variant="secondary" onClick={refresh}><RefreshCw size={16} /> Refresh</Button>
      </header>

      <section className="notifications-v25-truth">
        <MessageSquareText size={18} />
        <div><strong>Delivery truth remains provider-backed</strong><span>Internal notifications, queued provider jobs, sent states, and confirmed delivery are shown separately.</span></div>
      </section>

      <section className="notifications-v25-metrics" aria-label="Notifications summary">
        <article><i><Bell size={17} /></i><span>Total notifications</span><strong>{notifications.length}</strong><small>Current user inbox</small></article>
        <article><i><Inbox size={17} /></i><span>Unread</span><strong>{unread.length}</strong><small>Requires review</small></article>
        <article><i><CalendarClock size={17} /></i><span>Due reminders</span><strong>{dueReminders.length}</strong><small>Eligible now</small></article>
        <article><i><Send size={17} /></i><span>Outbox</span><strong>{outbox.length}</strong><small>Queued provider work</small></article>
        <article><i><CheckCheck size={17} /></i><span>Delivered</span><strong>{deliveredLogs.length}</strong><small>Provider-confirmed only</small></article>
        <article><i><CircleAlert size={17} /></i><span>Failures</span><strong>{failedLogs.length}</strong><small>Needs review</small></article>
      </section>

      <div className="notifications-v25-grid">
        <section className="notifications-v25-inbox">
          <header className="notifications-v25-section-head">
            <div><span>Your inbox</span><h3>Clinic notifications</h3><p>Internal updates from the existing notification source.</p></div>
            <div><Badge tone={unread.length ? 'warning' : 'neutral'}>{unread.length} unread</Badge><Button size="sm" variant="secondary" disabled={!unread.length} onClick={markAllRead}>Mark all read</Button></div>
          </header>

          <div className="notifications-v25-tabs" role="tablist" aria-label="Notification filters">
            {(['all', 'unread', 'appointment', 'payment', 'treatment'] as NotificationFilter[]).map((entry) => (
              <button key={entry} type="button" className={filter === entry ? 'is-active' : ''} onClick={() => setFilter(entry)}>{labelize(entry)}</button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="notifications-v25-empty"><Sparkles size={28} /><h3>You're all caught up</h3><p>No notifications match this view.</p></div>
          ) : (
            <div className="notifications-v25-list">
              {visibleNotifications.map((notification) => {
                const meta = kindConfig[notification.kind]
                const Icon = meta?.icon ?? Bell
                return (
                  <button key={notification.id} type="button" className={`notifications-v25-row ${selected?.id === notification.id ? 'is-selected' : ''} ${notification.isRead ? 'is-read' : 'is-unread'}`} onClick={() => setSelectedId(notification.id)}>
                    <span className="notifications-v25-row-icon"><Icon size={18} /></span>
                    <span className="notifications-v25-row-main"><span><strong>{notification.title}</strong>{!notification.isRead && <b aria-label="Unread" />}</span><p>{notification.message}</p><small>{formatDate(notification.createdAt)} · {meta?.label ?? 'Update'}</small></span>
                    <ChevronRight size={17} />
                  </button>
                )
              })}
            </div>
          )}
          <Pagination page={inboxPage} pageCount={inboxPageCount} totalItems={filtered.length} pageSize={INBOX_PAGE_SIZE} onPageChange={setInboxPage} label="Inbox notification pages" />
        </section>

        <aside className="notifications-v25-detail">
          {selected ? (
            <>
              <header><span>Notification detail</span><h3>{selected.title}</h3><p>{formatDate(selected.createdAt)}</p></header>
              <section className="notifications-v25-detail-card"><span>Message</span><p>{selected.message}</p></section>
              <section className="notifications-v25-detail-grid">
                <article><span>Category</span><strong>{kindConfig[selected.kind]?.label ?? 'Update'}</strong></article>
                <article><span>Priority</span><Badge tone={priorityTone(selected.priority)}>{selected.priority}</Badge></article>
                <article><span>Status</span><strong>{selected.isRead ? 'Read' : 'Unread'}</strong></article>
                <article><span>Published</span><strong>{selected.publishedAt ? formatDate(selected.publishedAt) : 'Not recorded'}</strong></article>
              </section>
              {!selected.isRead && <Button onClick={() => markRead(selected.id)}><CheckCheck size={16} /> Mark as read</Button>}
            </>
          ) : <div className="notifications-v25-empty"><Bell size={28} /><h3>Select a notification</h3><p>Choose an inbox item to review its details.</p></div>}
        </aside>
      </div>

      <section className="notifications-v25-ops">
        <header className="notifications-v25-section-head"><div><span>Reminder operations</span><h3>Communication work queue</h3><p>Provider configuration and reminder eligibility come from the existing communications engine.</p></div></header>
        <div className="notifications-v25-channel-grid">
          {[
            ['SMS', settings.smsProvider, settings.smsConfigured],
            ['Email', settings.emailProvider.replaceAll('_', ' '), settings.emailConfigured],
            ['Messenger', settings.messengerProvider.replaceAll('_', ' '), settings.messengerConfigured],
          ].map(([label, provider, configured]) => (
            <article key={String(label)}><span>{label}</span><strong>{labelize(String(provider))}</strong><Badge tone={configured ? 'success' : 'neutral'}>{configured ? 'Configured' : 'Not configured'}</Badge></article>
          ))}
          <article><span>Reminder offsets</span><strong>{settings.reminderOffsetsHours.join('h, ')}h</strong><Badge tone="info">{settings.timezone}</Badge></article>
        </div>

        <div className="notifications-v25-ops-grid">
          <article className="notifications-v25-reminder-card"><div><span>Reminder scan</span><h4>{dueReminders.length} due now</h4><p>{upcomingReminders.length} upcoming reminder window{upcomingReminders.length === 1 ? '' : 's'}. Only eligible confirmed appointments are considered.</p></div><Button disabled={!canQueueReminders || isQueueing || dueReminders.length === 0} onClick={() => void queueDueReminders()}><Send size={15} /> {isQueueing ? 'Queueing…' : 'Queue due reminders'}</Button></article>
          <article className="notifications-v25-reminder-card"><div><span>Provider outbox</span><h4>{outbox.length} queued jobs</h4><p>Outbox state is not equivalent to sent or delivered status.</p></div><Badge tone={outbox.length ? 'warning' : 'neutral'}>{outbox.length ? 'Pending provider work' : 'No queued work'}</Badge></article>
          <article className="notifications-v25-reminder-card"><div><span>Delivery failures</span><h4>{failedLogs.length} failures</h4><p>Failures remain visible in appointment messaging history and delivery operations.</p></div><Badge tone={failedLogs.length ? 'danger' : 'success'}>{failedLogs.length ? 'Review required' : 'No failures'}</Badge></article>
        </div>
        {!canQueueReminders && <div className="notifications-v25-feedback is-warning">Your role can view reminder state but cannot queue patient communications.</div>}
        {queueFeedback && <div className={`notifications-v25-feedback is-${queueFeedback.tone}`}>{queueFeedback.message}</div>}
      </section>
    </section>
  )
}
