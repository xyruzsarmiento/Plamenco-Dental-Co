import { useEffect, useRef, useState } from 'react'
import { CalendarDays, CheckCircle2, Stethoscope, X } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { loadAppointmentsFromSupabase } from '../features/appointments/appointmentPersistence'
import { APPOINTMENT_STORAGE_KEY, getStoredAppointments } from '../features/appointments/appointmentStore'
import type { Appointment } from '../features/appointments/appointmentTypes'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { getStoredPatients } from '../features/patients/patientStore'
import { getStoredServices } from '../features/services/serviceStore'
import { AppointmentsPage } from './AppointmentsPage'

type AppointmentNotice = {
  kind: 'created' | 'approved'
  appointment: Appointment
}

function formatDate(date: string) {
  if (!date) return 'Date not available'
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
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

function AppointmentSuccessModal({ notice, onClose }: { notice: AppointmentNotice; onClose: () => void }) {
  const appointment = notice.appointment
  const patient = getStoredPatients().find((entry) => entry.id === appointment.patientId || entry.patientId === appointment.patientId)
  const service = getStoredServices().find((entry) => entry.id === appointment.serviceId)
  const branch = getStoredBranches().find((entry) => entry.id === appointment.branchId)
  const provider = getStoredProviders().find((entry) => entry.id === appointment.providerId)
  const approved = notice.kind === 'approved'

  return (
    <div className="modal-backdrop appointment-success-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose()
    }}>
      <section className="modal appointment-success-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-success-title">
        <button className="icon-button appointment-success-close" type="button" aria-label="Close confirmation" onClick={onClose}><X size={18} /></button>
        <div className="appointment-success-icon"><CheckCircle2 size={30} /></div>
        <p className="eyebrow">{approved ? 'Request approved' : 'Appointment created'}</p>
        <h2 id="appointment-success-title">{approved ? 'Appointment confirmed' : 'Booking saved successfully'}</h2>
        <p className="appointment-success-copy">
          {approved
            ? 'The appointment is now confirmed and saved in the clinic database.'
            : 'The appointment request has been saved in the clinic database and is ready for review.'}
        </p>

        <div className="appointment-success-summary">
          <div><span>Patient</span><strong>{patient ? `${patient.firstName} ${patient.lastName}` : appointment.patientId}</strong></div>
          <div><span>Appointment</span><strong>{appointment.appointmentNumber ?? appointment.id}</strong></div>
          <div><span>Date & time</span><strong><CalendarDays size={14} />{formatDate(appointment.date)} · {formatTime(appointment.startTime)}</strong></div>
          <div><span>Service</span><strong><Stethoscope size={14} />{service?.name ?? 'Dental service'}</strong></div>
          <div><span>Branch</span><strong>{branch?.name ?? 'Clinic branch'}</strong></div>
          <div><span>Dentist</span><strong>{provider?.displayName ?? 'Assigned dentist'}</strong></div>
        </div>

        <div className="appointment-success-actions">
          <Button onClick={onClose}>{approved ? 'Continue to appointments' : 'Done'}</Button>
        </div>
      </section>
    </div>
  )
}

export function AppointmentsPageV38() {
  const [ready, setReady] = useState(false)
  const [version, setVersion] = useState(0)
  const [notice, setNotice] = useState<AppointmentNotice | null>(null)
  const previousRef = useRef<Map<string, Appointment>>(new Map())
  const hydratingRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function hydrate() {
      hydratingRef.current = true
      try {
        const rows = await loadAppointmentsFromSupabase({ strict: false })
        if (cancelled) return
        previousRef.current = new Map(rows.map((appointment) => [appointment.id, appointment]))
        setVersion((current) => current + 1)
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

    const timer = window.setInterval(() => {
      if (hydratingRef.current) return
      const currentRows = getStoredAppointments()
      const current = new Map(currentRows.map((appointment) => [appointment.id, appointment]))
      const previous = previousRef.current

      for (const appointment of currentRows) {
        const before = previous.get(appointment.id)
        if (!before) {
          setNotice({ kind: 'created', appointment })
          break
        }
        if (before.status === 'pending' && appointment.status === 'confirmed') {
          setNotice({ kind: 'approved', appointment })
          window.setTimeout(() => {
            hydratingRef.current = true
            void loadAppointmentsFromSupabase({ strict: false })
              .then((rows) => {
                previousRef.current = new Map(rows.map((entry) => [entry.id, entry]))
                setVersion((currentVersion) => currentVersion + 1)
              })
              .finally(() => { hydratingRef.current = false })
          }, 650)
          break
        }
      }

      previousRef.current = current
    }, 300)

    return () => window.clearInterval(timer)
  }, [ready])

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
      <AppointmentsPage key={version} />
      {notice && <AppointmentSuccessModal notice={notice} onClose={() => setNotice(null)} />}
    </div>
  )
}
