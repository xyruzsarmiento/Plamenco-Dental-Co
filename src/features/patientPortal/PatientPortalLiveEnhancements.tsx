import { useEffect } from 'react'
import { getAppointmentsByPatient } from '../appointments/appointmentStore'
import { useAuth } from '../auth/AuthContext'
import { getStoredBranches } from '../branches/branchStore'
import { getStoredServices } from '../services/serviceStore'

function timeLabel(value?: string) {
  if (!value) return '-'
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours)) return value
  return `${hours % 12 || 12}:${String(minutes || 0).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`
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

        panel.querySelector(':scope > .pv5-upcoming-list')?.remove()
        Array.from(panel.children).forEach((child) => {
          if (!(child instanceof HTMLElement)) return
          if (child.classList.contains('pv3-panel-head') || child.classList.contains('pv5-upcoming-list')) return
          child.style.display = 'none'
        })

        const today = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Manila',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date())

        const appointments = getAppointmentsByPatient(user.patientId!)
          .filter((item) => item.date >= today && !['cancelled', 'rejected', 'no_show', 'completed'].includes(item.status))
          .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))

        const services = new Map(getStoredServices().map((item) => [item.id, item.name]))
        const branches = new Map(getStoredBranches().map((item) => [item.id, item.name]))
        const list = document.createElement('div')
        list.className = 'pv5-upcoming-list'

        const visible = appointments.slice(0, 3)
        list.innerHTML = visible.length
          ? visible.map((item) => `
              <button type="button" class="pv5-upcoming-card" data-open-appointments>
                <span class="pv5-upcoming-date">
                  <strong>${new Date(`${item.date}T00:00:00`).getDate()}</strong>
                  <small>${new Date(`${item.date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short' }).toUpperCase()}</small>
                </span>
                <span class="pv5-upcoming-copy">
                  <b>${services.get(item.serviceId) ?? 'Dental appointment'}</b>
                  <small><span>${timeLabel(item.startTime)}</span><span>${branches.get(item.branchId ?? '') ?? 'Clinic branch'}</span></small>
                </span>
                <em>${item.status.replaceAll('_', ' ')}</em>
              </button>
            `).join('') + (
              appointments.length > 3
                ? `<button class="pv5-upcoming-more" type="button" data-open-appointments>+${appointments.length - 3} more upcoming visit${appointments.length - 3 === 1 ? '' : 's'}</button>`
                : ''
            )
          : '<div class="pv5-upcoming-empty"><span aria-hidden="true">📅</span><strong>No upcoming visits</strong><p>Book a visit whenever you are ready.</p></div>'

        panel.appendChild(list)
        list.querySelectorAll<HTMLElement>('[data-open-appointments]').forEach((button) => {
          button.addEventListener('click', () => {
            const nav = Array.from(document.querySelectorAll<HTMLButtonElement>('.pv3-nav button'))
              .find((item) => item.textContent?.trim() === 'Appointments')
            nav?.click()
          })
        })
      })
    }

    render()

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => Array.from(mutation.addedNodes).some(
        (node) => node instanceof HTMLElement && node.classList.contains('pv5-upcoming-list'),
      ))) return
      render()
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
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
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    })

    return () => observer.disconnect()
  }, [])

  return null
}

export function PatientPortalLiveEnhancements() {
  return (
    <>
      <DashboardUpcomingEnhancer/>
      <PhotoFallbackCleaner/>
    </>
  )
}
