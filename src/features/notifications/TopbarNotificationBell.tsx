import { Bell, CheckCheck } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { loadCurrentUserNotifications, markAllLiveNotificationsRead, markLiveNotificationRead } from './notificationLiveStore'
import {
  getNotificationsByUser,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from './notificationStore'
import type { AppNotification } from './notificationTypes'

type BellRow = {
  id: string
  title: string
  message: string
  kind: string
  isRead: boolean
  createdAt: string
}

function relativeDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m ago`
  if (diff < day) return `${Math.floor(diff / hour)}h ago`
  if (diff < day * 7) return `${Math.floor(diff / day)}d ago`
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })
}

function mapInternalNotification(notification: AppNotification): BellRow {
  return {
    id: notification.id,
    title: notification.title,
    message: notification.message,
    kind: notification.kind,
    isRead: notification.isRead,
    createdAt: notification.createdAt,
  }
}

export function TopbarNotificationBell({ className = '' }: { className?: string }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<BellRow[]>([])
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLElement | null>(null)
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({})

  const unread = useMemo(() => rows.filter((row) => !row.isRead).length, [rows])
  const recentRows = rows.slice(0, 5)
  const viewAllHref = user?.role === 'patient' ? undefined : '/app/notifications'

  useEffect(() => {
    if (!open) return
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const positionPopover = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(380, window.innerWidth - 24)
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width))
      setPopoverStyle({
        position: 'fixed',
        top: Math.min(window.innerHeight - 80, rect.bottom + 10),
        left,
        width,
      })
    }
    positionPopover()
    window.addEventListener('resize', positionPopover)
    window.addEventListener('scroll', positionPopover, true)
    return () => {
      window.removeEventListener('resize', positionPopover)
      window.removeEventListener('scroll', positionPopover, true)
    }
  }, [open])

  useEffect(() => {
    if (!user) {
      setRows([])
      return
    }

    const db = supabase
    let active = true
    const loadNotifications = async () => {
      if (!db) {
        setRows(getNotificationsByUser(user.id).map(mapInternalNotification))
        return
      }
      try {
        const liveRows = await loadCurrentUserNotifications(30)
        if (!active) return
        setError('')
        setRows((liveRows ?? []).map(mapInternalNotification))
      } catch (cause) {
        if (!active) return
        setError(cause instanceof Error ? cause.message : 'Notifications could not be loaded.')
        setRows(getNotificationsByUser(user.id).map(mapInternalNotification))
      }
    }

    void loadNotifications()
    const timer = window.setInterval(() => { void loadNotifications() }, 60_000)
    window.addEventListener('storage', loadNotifications)
    window.addEventListener('plamenco:notifications-refresh', loadNotifications)
    const channel = db
      ?.channel(`topbar-notifications-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        void loadNotifications()
      })
      .subscribe()

    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('storage', loadNotifications)
      window.removeEventListener('plamenco:notifications-refresh', loadNotifications)
      if (channel) void db?.removeChannel(channel)
    }
  }, [user])

  async function markRead(id: string) {
    if (!user) return
    setBusyId(id)
    if (supabase) {
      try {
        await markLiveNotificationRead(id)
      } catch {
        setError('Could not mark this notification as read.')
        setBusyId('')
        return
      }
      setBusyId('')
    } else {
      markNotificationAsRead(id)
      setBusyId('')
    }
    setRows((current) => current.map((row) => row.id === id ? { ...row, isRead: true } : row))
  }

  async function markAllRead() {
    if (!user || unread === 0) return
    setBusyId('all')
    if (supabase) {
      try {
        await markAllLiveNotificationsRead()
      } catch {
        setError('Could not mark notifications as read.')
        setBusyId('')
        return
      }
      setBusyId('')
    } else {
      markAllNotificationsAsRead(user.id)
      setBusyId('')
    }
    setRows((current) => current.map((row) => ({ ...row, isRead: true })))
  }

  return (
    <div className={`topbar-notification-bell ${className}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={open ? 'is-open' : ''}
        aria-label={unread ? `Open notifications, ${unread} unread` : 'Open notifications'}
        title={unread ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={18} />
        {unread > 0 && <span>{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && createPortal(
        <section className="topbar-notification-popover topbar-notification-popover-v153" aria-label="Recent notifications" ref={popoverRef} style={popoverStyle}>
          <header>
            <div><span>Updates</span><h3>Notifications</h3></div>
            <button type="button" onClick={() => void markAllRead()} disabled={!unread || busyId === 'all'}>
              <CheckCheck size={14} />Mark all read
            </button>
          </header>
          {error && <p className="topbar-notification-error">{error}</p>}
          <div className="topbar-notification-list">
            {recentRows.map((row) => (
              <article key={row.id} className={row.isRead ? '' : 'is-unread'}>
                <i />
                <div>
                  <div><strong>{row.title}</strong><small>{relativeDate(row.createdAt)}</small></div>
                  <p>{row.message}</p>
                  <footer>
                    <span>{row.kind.replaceAll('_', ' ')}</span>
                    {!row.isRead && <button type="button" disabled={busyId === row.id} onClick={() => void markRead(row.id)}>Mark read</button>}
                  </footer>
                </div>
              </article>
            ))}
            {!recentRows.length && !error && <div className="topbar-notification-empty"><Bell size={22} /><strong>No notifications yet</strong><p>You are all caught up.</p></div>}
          </div>
          {viewAllHref && <Link to={viewAllHref} onClick={() => setOpen(false)}>View all notifications</Link>}
        </section>,
        document.body,
      )}
    </div>
  )
}
