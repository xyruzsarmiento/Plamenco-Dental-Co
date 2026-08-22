import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Building2, CalendarDays, Check, CheckCircle2, Clock3, MapPin, ShieldCheck, Stethoscope, UserRound, X } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { loadAppointmentsFromSupabase } from '../features/appointments/appointmentPersistence'
import { APPOINTMENT_STORAGE_KEY, getStoredAppointments } from '../features/appointments/appointmentStore'
import type { Appointment } from '../features/appointments/appointmentTypes'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { getStoredPatients } from '../features/patients/patientStore'
import { getStoredServices } from '../features/services/serviceStore'
import '../styles/appointments-confirmation-v41.css'
import '../styles/internal-appointments-final-v104.css'
import { AppointmentsPage } from './AppointmentsPage'

type AppointmentNotice = {
  kind: 'created' | 'approved'
  appointment: Appointment
}

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function formatDate(date: string) {
  if (!date) return 'Date not available'
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(time: string) {
  if (!time) return 'Time not available'
  const [hour, minute] = time.split(':').map(Number)
  const date = new Date()
  date.setHours(hour || 0, minute || 0, 0, 0)
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

function clickWorkspaceTab(label: string) {
  const root = document.querySelector('.appointments-v40')
  const tabs = Array.from(root?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
  const tab = tabs.find((button) => button.textContent?.toLowerCase().includes(label.toLowerCase()))
  tab?.click()
  return Boolean(tab)
}

function requestsWorkspaceIsActive() {
  const root = document.querySelector('.appointments-v40')
  const tabs = Array.from(root?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
  return tabs.some((button) => button.getAttribute('aria-selected') === 'true' && button.textContent?.toLowerCase().includes('requests'))
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function focusConfirmedAppointment(appointment: Appointment) {
  window.setTimeout(() => {
    if (appointment.date === manilaToday()) {
      clickWorkspaceTab("Today's flow") || clickWorkspaceTab('Today’s flow')
      window.setTimeout(() => {
        document.querySelector('.sa-appointments-flow-board')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
      return
    }

    clickWorkspaceTab('Calendar')
    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.appointments-v40 #appointment-date-filter')
      if (input) setReactInputValue(input, appointment.date)
      document.querySelector('.sa-appointments-calendar-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }, 20)
}

function openRequestsWorkspace(scroll = false) {
  window.setTimeout(() => {
    clickWorkspaceTab('Requests')
    if (scroll) {
      window.setTimeout(() => {
        document.querySelector('.sa-appointments-requests-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
    }
  }, 35)
}

function AppointmentSuccessModal({
  notice,
  onClose,
  onContinue,
}: {
  notice: AppointmentNotice
  onClose: () => void
  onContinue: () => void
}) {
  const appointment = notice.appointment
  const patient = getStoredPatients().find((entry) => entry.id === appointment.patientId || entry.patientId === appointment.patientId)
  const service = getStoredServices().find((entry) => entry.id === appointment.serviceId)
  const branch = getStoredBranches().find((entry) => entry.id === appointment.branchId)
  const provider = getStoredProviders().find((entry) => entry.id === appointment.providerId)
  const approved = notice.kind === 'approved'
  const isToday = appointment.date === manilaToday()

  return (
    <div className="modal-backdrop appointment-success-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose()
    }}>
      <section className="appointment-success-modal appointment-success-modal-v42" role="dialog" aria-modal="true" aria-labelledby="appointment-success-title">
        <button className="appointment-success-close" type="button" aria-label="Close confirmation" onClick={onClose}><X size={18} /></button>

        <div className="appointment-success-hero">
          <div className="appointment-success-orb"><Check size={28} strokeWidth={2.4} /></div>
          <div className="appointment-success-status-row">
            <span className="appointment-success-status"><ShieldCheck size={13} />{approved ? 'CONFIRMED' : 'SAVED TO DATABASE'}</span>
            <span className="appointment-success-number">{appointment.appointmentNumber ?? 'Appointment'}</span>
          </div>
          <p className="appointment-success-kicker">{approved ? 'Scheduling decision complete' : 'New booking request'}</p>
          <h2 id="appointment-success-title">{approved ? 'Appointment confirmed' : 'Appointment request created'}</h2>
          <p className="appointment-success-copy">
            {approved
              ? `This visit is now confirmed and will appear in ${isToday ? "Today's flow" : 'the calendar'} at its scheduled time.`
              : 'The booking request is safely stored in Supabase and ready for clinic review.'}
          </p>
        </div>

        <div className="appointment-success-schedule-card">
          <div className="appointment-success-date-icon"><CalendarDays size={21} /></div>
          <div className="appointment-success-schedule-copy">
            <span>Scheduled visit</span>
            <strong>{formatDate(appointment.date)}</strong>
            <small><Clock3 size={13} />{formatTime(appointment.startTime)} – {formatTime(appointment.endTime)}</small>
          </div>
          <span className={`appointment-success-state ${approved ? 'is-confirmed' : 'is-pending'}`}>
            <CheckCircle2 size={13} />{approved ? 'Confirmed' : 'Pending review'}
          </span>
        </div>

        <div className="appointment-success-primary-grid">
          <article className="appointment-success-person-card">
            <span className="appointment-success-detail-icon"><UserRound size={17} /></span>
            <div><small>Patient</small><strong>{patient ? `${patient.firstName} ${patient.lastName}` : appointment.patientId}</strong><span>{patient?.patientId ?? appointment.patientId}</span></div>
          </article>
          <article className="appointment-success-person-card">
            <span className="appointment-success-detail-icon"><Stethoscope size={17} /></span>
            <div><small>Service</small><strong>{service?.name ?? 'Dental service'}</strong><span>{service?.duration ? `${service.duration} minute visit` : 'Scheduled service'}</span></div>
          </article>
        </div>

        <div className="appointment-success-meta-grid">
          <div><span><Building2 size={14} />Clinic branch</span><strong>{branch?.name ?? 'Clinic branch'}</strong></div>
          <div><span><Stethoscope size={14} />Dentist</span><strong>{provider?.displayName ?? 'Assigned dentist'}</strong></div>
          <div className="appointment-success-meta-wide"><span><MapPin size={14} />Location</span><strong>{[branch?.city, branch?.province].filter(Boolean).join(', ') || branch?.address || 'Clinic location'}</strong></div>
        </div>

        <div className="appointment-success-footer">
          <button type="button" className="appointment-success-secondary" onClick={onClose}>Close</button>
          <Button onClick={onContinue}>
            {approved ? (isToday ? "View today's flow" : 'View in calendar') : 'Open requests'}
            <ArrowRight size={15} />
          </Button>
        </div>
      </section>
    </div>
  )
}

export function AppointmentsPageV38() {
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState<AppointmentNotice | null>(null)
  const [renderVersion, setRenderVersion] = useState(0)
  const previousRef = useRef<Map<string, Appointment>>(new Map())
  const hydratingRef = useRef(false)
  const verifyingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false

    async function hydrate() {
      hydratingRef.current = true
      try {
        const rows = await loadAppointmentsFromSupabase({ strict: false })
        if (cancelled) return
        previousRef.current = new Map(rows.map((appointment) => [appointment.id, appointment]))
      } finally {
        hydratingRef.current = false
        if (!cancelled) setReady(true)
      }
    }

    void hydrate()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!ready) return

    function refreshRequestsWorkspace(scroll = false) {
      setRenderVersion((version) => version + 1)
      openRequestsWorkspace(scroll)
    }

    function verifyCreatedAppointment(appointment: Appointment) {
      const verificationKey = `${appointment.id}:created`
      if (verifyingRef.current.has(verificationKey)) return
      verifyingRef.current.add(verificationKey)

      window.setTimeout(() => {
        void loadAppointmentsFromSupabase({ strict: true })
          .then((rows) => {
            const remote = rows.find((entry) => entry.id === appointment.id)
            previousRef.current = new Map(rows.map((entry) => [entry.id, entry]))
            if (remote) {
              setNotice({ kind: 'created', appointment: remote })
              refreshRequestsWorkspace(false)
            }
          })
          .catch((error) => {
            console.error('[appointment verification failed]', error)
          })
          .finally(() => {
            verifyingRef.current.delete(verificationKey)
          })
      }, 450)
    }

    const timer = window.setInterval(() => {
      if (hydratingRef.current) return

      const currentRows = getStoredAppointments()
      const current = new Map(currentRows.map((appointment) => [appointment.id, appointment]))
      const previous = previousRef.current
      const keepRequestsOpen = requestsWorkspaceIsActive()
      let createdAppointment: Appointment | null = null
      let requestDecisionChanged = false

      for (const appointment of currentRows) {
        const before = previous.get(appointment.id)
        if (!before) {
          createdAppointment = appointment
          verifyCreatedAppointment(appointment)
          continue
        }

        if (before.status !== appointment.status) {
          if (before.status === 'pending') {
            requestDecisionChanged = true
            if (appointment.status === 'confirmed') {
              setNotice({ kind: 'approved', appointment })
            }
          }
        }
      }

      if (createdAppointment) {
        refreshRequestsWorkspace(true)
      } else if (requestDecisionChanged) {
        setRenderVersion((version) => version + 1)
        if (keepRequestsOpen) openRequestsWorkspace(false)
      }

      previousRef.current = current
    }, 100)

    return () => window.clearInterval(timer)
  }, [ready])

  function handleContinue() {
    if (!notice) return
    const currentNotice = notice
    setNotice(null)
    if (currentNotice.kind === 'approved') {
      focusConfirmedAppointment(currentNotice.appointment)
    } else {
      openRequestsWorkspace(true)
    }
  }

  if (!ready) {
    return (
      <div className="appointments-v40 appointment-bootstrap-state">
        <div className="appointment-bootstrap-card">
          <span className="appointment-bootstrap-spinner" />
          <strong>Loading appointments</strong>
          <p>Syncing the latest clinic schedule from Supabase.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="appointments-v40" data-storage-key={APPOINTMENT_STORAGE_KEY}>
      <AppointmentsPage key={renderVersion} />
      {notice && <AppointmentSuccessModal notice={notice} onClose={() => setNotice(null)} onContinue={handleContinue} />}
    </div>
  )
}
