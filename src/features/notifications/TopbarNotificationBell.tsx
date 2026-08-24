import { Bell, CheckCheck } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../../lib/supabase'
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

type PatientNotificationRow = {
  id: string
  kind: string | null
  title: string
  message: string
  is_read: boolean
  created_at: string
}

export function TopbarNotificationBell({ className = '' }: { className?: string }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<BellRow[]>([])
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)

  const isPatient = user?.role === 'patient'
  const unread = useMemo(() => rows.filter((row) => !row.isRead).length, [rows])
  const recentRows = rows.slice(0, 5)
  const viewAllHref = isPatient ? undefined : '/app/notifications'

  useEffect(() => {
    if (!open) return
    const handlePointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
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
    if (!user) {
      setRows([])
      return
    }

    if (!isPatient) {
      const loadInternal = () => setRows(getNotificationsByUser(user.id).map(mapInternalNotification))
      loadInternal()
      window.addEventListener('storage', loadInternal)
      return () => window.removeEventListener('storage', loadInternal)
    }

    if (!supabase || !user.email) {
      setRows([])
      return
    }

    const db = supabase
    let active = true
    const loadPatient = async () => {
      const { data, error: queryError } = await db
        .from('notifications')
        .select('id,kind,title,message,is_read,created_at')
        .eq('user_email', user.email)
        .order('created_at', { ascending: false })
        .limit(30)

      if (!active) return
      if (queryError) {
        setError('Notifications could not be loaded.')
        return
      }

      setError('')
      setRows(((data ?? []) as PatientNotificationRow[]).map((row) => ({
        id: row.id,
        title: row.title,
        message: row.message,
        kind: row.kind || 'clinic update',
        isRead: row.is_read,
        createdAt: row.created_at,
      })))
    }

    void loadPatient()
    const timer = window.setInterval(() => { void loadPatient() }, 60_000)
    const channel = db
      .channel(`topbar-patient-notifications-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_email=eq.${user.email}` }, () => {
        void loadPatient()
      })
      .subscribe()

    return () => {
      active = false
      window.clearInterval(timer)
      void db.removeChannel(channel)
    }
  }, [isPatient, user])

  async function markRead(id: string) {
    if (!user) return
    setBusyId(id)
    if (isPatient) {
      if (!supabase || !user.email) {
        setBusyId('')
        return
      }
      const { error: updateError } = await supabase.from('notifications').update({ is_read: true }).eq('id', id).eq('user_email', user.email)
      setBusyId('')
      if (updateError) {
        setError('Could not mark this notification as read.')
        return
      }
    } else {
      markNotificationAsRead(id)
      setBusyId('')
    }
    setRows((current) => current.map((row) => row.id === id ? { ...row, isRead: true } : row))
  }

  async function markAllRead() {
    if (!user || unread === 0) return
    setBusyId('all')
    if (isPatient) {
      if (!supabase || !user.email) {
        setBusyId('')
        return
      }
      const { error: updateError } = await supabase.from('notifications').update({ is_read: true }).eq('user_email', user.email).eq('is_read', false)
      setBusyId('')
      if (updateError) {
        setError('Could not mark notifications as read.')
        return
      }
    } else {
      markAllNotificationsAsRead(user.id)
      setBusyId('')
    }
    setRows((current) => current.map((row) => ({ ...row, isRead: true })))
  }

  return (
    <div className={`topbar-notification-bell ${className}`} ref={rootRef}>
      <button
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

      {open && (
        <section className="topbar-notification-popover" aria-label="Recent notifications">
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
        </section>
      )}
    </div>
  )
}
