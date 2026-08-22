import { Bell, CalendarDays, CheckCheck, Clock3, MapPin } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { getAppointmentsByPatient } from '../appointments/appointmentStore'
import { useAuth } from '../auth/AuthContext'
import { getStoredBranches } from '../branches/branchStore'
import { getStoredServices } from '../services/serviceStore'
import { supabase } from '../../lib/supabase'

type PatientNotificationRow = {
  id: string
  user_email: string
  kind: string | null
  priority: string | null
  title: string
  message: string
  related_id: string | null
  is_read: boolean
  created_at: string
}

function clinicDate(value?: string) {
  if (!value) return 'Not set'
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00+08:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
}

function timeLabel(value?: string) {
  if (!value) return '—'
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours)) return value
  return `${hours % 12 || 12}:${String(minutes || 0).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`
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
  return clinicDate(value)
}

function useSidebarHost() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    let frame = 0
    const ensure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const account = document.querySelector<HTMLElement>('.pv3-sidebar .pv3-account')
        if (!account) return
        let next = account.parentElement?.querySelector<HTMLElement>(':scope > .pv5-notification-host') ?? null
        if (!next) {
          next = document.createElement('div')
          next.className = 'pv5-notification-host'
          account.insertAdjacentElement('afterend', next)
        }
        setHost(next)
      })
    }
    ensure()
    const observer = new MutationObserver(ensure)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      document.querySelector('.pv5-notification-host')?.remove()
    }
  }, [])
  return host
}

function PatientSidebarNotifications() {
  const { user } = useAuth()
  const host = useSidebarHost()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<PatientNotificationRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const unread = useMemo(() => rows.filter((row) => !row.is_read).length, [rows])

  useEffect(() => {
    if (!supabase || !user?.email || user.role !== 'patient') return
    let active = true
    const load = async () => {
      const { data, error: queryError } = await supabase
        .from('notifications')
        .select('id,user_email,kind,priority,title,message,related_id,is_read,created_at')
        .eq('user_email', user.email)
        .order('created_at', { ascending: false })
        .limit(30)
      if (!active) return
      if (queryError) {
        setError('Notifications could not be loaded.')
        return
      }
      setError('')
      setRows((data ?? []) as PatientNotificationRow[])
    }
    void load()
    const channel = supabase
      .channel(`patient-notifications-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_email=eq.${user.email}` }, () => { void load() })
      .subscribe()
    const timer = window.setInterval(() => { void load() }, 60_000)
    return () => {
      active = false
      window.clearInterval(timer)
      void supabase?.removeChannel(channel)
    }
  }, [user?.email, user?.id, user?.role])

  async function markRead(id: string) {
    if (!supabase || !user?.email) return
    setBusyId(id)
    const { error: updateError } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_email', user.email)
    setBusyId(null)
    if (updateError) {
      setError('Could not mark this notification as read.')
      return
    }
    setRows((current) => current.map((row) => row.id === id ? { ...row, is_read: true } : row))
  }

  async function markAllRead() {
    if (!supabase || !user?.email || unread === 0) return
    setBusyId('all')
    const { error: updateError } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_email', user.email)
      .eq('is_read', false)
    setBusyId(null)
    if (updateError) {
      setError('Could not mark notifications as read.')
      return
    }
    setRows((current) => current.map((row) => ({ ...row, is_read: true })))
  }

  if (!host || user?.role !== 'patient') return null

  return createPortal(
    <div className="pv5-notifications">
      <button className={`pv5-notification-trigger ${open ? 'is-open' : ''}`} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span><Bell size={17}/>{unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}</span>
        <span><strong>Notifications</strong><small>{unread ? `${unread} unread` : 'You are all caught up'}</small></span>
        <i>›</i>
      </button>
      {open && <section className="pv5-notification-panel">
        <header>
          <div><span>UPDATES</span><h3>Notifications</h3></div>
          <button type="button" onClick={() => void markAllRead()} disabled={!unread || busyId === 'all'}><CheckCheck size={14}/>Mark all read</button>
        </header>
        {error && <p className="pv5-notification-error">{error}</p>}
        <div className="pv5-notification-list">
          {rows.map((row) => <article key={row.id} className={row.is_read ? '' : 'is-unread'}>
            <span className="pv5-notification-dot" />
            <div><header><strong>{row.title}</strong><small>{relativeDate(row.created_at)}</small></header><p>{row.message}</p><footer><span>{(row.kind || 'clinic update').replaceAll('_', ' ')}</span>{!row.is_read && <button type="button" disabled={busyId === row.id} onClick={() => void markRead(row.id)}>Mark as read</button>}</footer></div>
          </article>)}
          {!rows.length && !error && <div className="pv5-notification-empty"><Bell size={22}/><strong>No notifications yet</strong><p>Appointment, payment and clinic updates will appear here.</p></div>}
        </div>
      </section>}
    </div>,
    host,
  )
}

function DashboardUpcomingEnhancer() {
  const { user } = useAuth()
  useEffect(() => {
    if (!user?.patientId || user.role !== 'patient') return
    let frame = 0
    const render = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const panel = document.querySelector<HTMLElement>('.pv3-next-panel')
        if (!panel) return
        const current = panel.querySelector(':scope > .pv5-upcoming-list')
        current?.remove()
        Array.from(panel.children).forEach((child) => {
          if (!(child instanceof HTMLElement)) return
          if (child.classList.contains('pv3-panel-head')) return
          if (child.classList.contains('pv5-upcoming-list')) return
          child.style.display = 'none'
        })
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
        const appointments = getAppointmentsByPatient(user.patientId!)
          .filter((item) => item.date >= today && !['cancelled', 'rejected', 'no_show', 'completed'].includes(item.status))
          .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
        const services = new Map(getStoredServices().map((item) => [item.id, item.name]))
        const branches = new Map(getStoredBranches().map((item) => [item.id, item.name]))
        const list = document.createElement('div')
        list.className = 'pv5-upcoming-list'
        const visible = appointments.slice(0, 3)
        list.innerHTML = visible.length ? visible.map((item) => `
          <button type="button" class="pv5-upcoming-card" data-open-appointments>
            <span class="pv5-upcoming-date"><strong>${new Date(`${item.date}T00:00:00`).getDate()}</strong><small>${new Date(`${item.date}T00:00:00`).toLocaleDateString('en-PH',{month:'short'}).toUpperCase()}</small></span>
            <span class="pv5-upcoming-copy"><b>${services.get(item.serviceId) ?? 'Dental appointment'}</b><small><span>${timeLabel(item.startTime)}</span><span>${branches.get(item.branchId ?? '') ?? 'Clinic branch'}</span></small></span>
            <em>${item.status.replaceAll('_',' ')}</em>
          </button>`).join('') + (appointments.length > 3 ? `<button class="pv5-upcoming-more" type="button" data-open-appointments>+${appointments.length - 3} more upcoming visit${appointments.length - 3 === 1 ? '' : 's'}</button>` : '') : '<div class="pv5-upcoming-empty"><CalendarDays size="20"></CalendarDays><strong>No upcoming visits</strong><p>Book a visit whenever you are ready.</p></div>'
        panel.appendChild(list)
        list.querySelectorAll<HTMLElement>('[data-open-appointments]').forEach((button) => button.addEventListener('click', () => {
          const nav = Array.from(document.querySelectorAll<HTMLButtonElement>('.pv3-nav button')).find((item) => item.textContent?.trim() === 'Appointments')
          nav?.click()
        }))
      })
    }
    render()
    window.addEventListener('plamenco:appointments-updated', render as EventListener)
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) => node instanceof HTMLElement && node.classList.contains('pv5-upcoming-list')))) return
      render()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('plamenco:appointments-updated', render as EventListener)
      document.querySelectorAll('.pv5-upcoming-list').forEach((node) => node.remove())
    }
  }, [user?.patientId, user?.role])
  return null
}

function PhotoFallbackCleaner() {
  useEffect(() => {
    const clean = () => {
      document.querySelectorAll<HTMLElement>('.pv4-photo-preview').forEach((preview) => {
        const background = getComputedStyle(preview).backgroundImage
        if (background && background !== 'none') preview.textContent = ''
      })
    }
    clean()
    const observer = new MutationObserver(clean)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] })
    return () => observer.disconnect()
  }, [])
  return null
}

export function PatientPortalLiveEnhancements() {
  return <><PatientSidebarNotifications/><DashboardUpcomingEnhancer/><PhotoFallbackCleaner/></>
}
