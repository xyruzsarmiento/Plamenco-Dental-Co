import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, CheckCircle2, Clock3, Stethoscope, UserRound } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../auth/AuthContext'
import {
  acceptNominatedAppointmentPersisted,
  acceptUnassignedAppointmentPersisted,
} from './appointmentPersistence'
import { getStoredAppointments } from './appointmentStore'
import type { Appointment } from './appointmentTypes'
import { getStoredBranches } from '../branches/branchStore'
import { getStoredProviders } from '../dentists/dentistStore'
import { getStoredPatients } from '../patients/patientStore'
import { getStoredServices } from '../services/serviceStore'
import '../../styles/dentist-request-acceptance-v206.css'

function formatRequestDate(value: string) {
  if (!value) return 'Date unavailable'
  return new Date(`${value}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatRequestTime(value: string) {
  if (!value) return 'Time unavailable'
  const [hour, minute] = value.split(':').map(Number)
  const date = new Date()
  date.setHours(hour || 0, minute || 0, 0, 0)
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

function normalize(value?: string) {
  return value?.trim().toLowerCase() ?? ''
}

export function DentistRequestAcceptancePanel() {
  const { user } = useAuth()
  const isDentist = user?.role === 'dentist' || user?.role === 'associate_dentist'
  const [appointments, setAppointments] = useState<Appointment[]>(() => getStoredAppointments())
  const [savingId, setSavingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!isDentist) return
    const refresh = () => setAppointments(getStoredAppointments())
    refresh()
    const timer = window.setInterval(refresh, 500)
    return () => window.clearInterval(timer)
  }, [isDentist])

  useEffect(() => {
    if (!isDentist) {
      setPortalTarget(null)
      return
    }

    const resolveTarget = () => {
      const target = document.querySelector<HTMLElement>('.sa-appointments-requests-panel')
      setPortalTarget((current) => current === target ? current : target)
    }

    resolveTarget()
    const observer = new MutationObserver(resolveTarget)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [isDentist])

  const provider = useMemo(() => {
    if (!user || !isDentist) return undefined
    const email = normalize(user.email)
    const name = normalize(user.name)

    return getStoredProviders().find((entry) =>
      entry.status === 'active' && (
        entry.profileId === user.id ||
        (email && normalize(entry.email) === email) ||
        (name && normalize(entry.displayName) === name)
      ),
    )
  }, [isDentist, user])

  const requests = useMemo(() => {
    if (!provider) return []
    return appointments
      .filter((appointment) =>
        appointment.status === 'pending' &&
        !appointment.providerId &&
        (!appointment.proposedProviderId || appointment.proposedProviderId === provider.id),
      )
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))
  }, [appointments, provider])

  if (!isDentist || !portalTarget) return null

  const patientMap = new Map(getStoredPatients().map((patient) => [patient.id, patient]))
  const serviceMap = new Map(getStoredServices().map((service) => [String(service.id), service]))
  const branchMap = new Map(getStoredBranches().map((branch) => [branch.id, branch]))

  async function acceptRequest(request: Appointment) {
    if (!provider || savingId) return
    setSavingId(request.id)
    setFeedback(null)

    try {
      const actor = user?.email || provider.displayName || 'Dentist'
      const updated = request.proposedProviderId === provider.id
        ? await acceptNominatedAppointmentPersisted({
            appointmentId: request.id,
            actor,
            expectedUpdatedAt: request.updatedAt,
          })
        : await acceptUnassignedAppointmentPersisted({
            appointmentId: request.id,
            providerId: provider.id,
            actor,
            expectedUpdatedAt: request.updatedAt,
          })

      setAppointments(getStoredAppointments())
      setFeedback(`Appointment ${updated.appointmentNumber ?? updated.id} accepted. You are now the assigned dentist.`)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'The appointment request could not be accepted.')
    } finally {
      setSavingId(null)
    }
  }

  const content = !provider ? (
    <section className="dentist-request-panel-v206 is-warning" aria-label="Dentist appointment requests">
      <div>
        <strong>Appointment approval unavailable</strong>
        <span>Your account could not be matched to an active dentist profile. Check that the dentist profile uses the same account/email.</span>
      </div>
    </section>
  ) : requests.length ? (
    <section className="dentist-request-panel-v206 is-inline" aria-label="Dentist appointment requests">
      <header>
        <div>
          <span className="dentist-request-kicker-v206"><Stethoscope size={14} /> Dentist approval</span>
          <h2>Accept a request and assign it to yourself</h2>
          <p>Dentists do not need to choose a provider here. Approval automatically assigns the selected request to your dentist profile and confirms it after database conflict checks.</p>
        </div>
        <span className="dentist-request-count-v206">{requests.length}</span>
      </header>

      {feedback && <div className="dentist-request-feedback-v206" role="status">{feedback}</div>}

      <div className="dentist-request-list-v206">
        {requests.map((request) => {
          const patient = patientMap.get(request.patientId)
          const service = serviceMap.get(String(request.serviceId))
          const branch = request.branchId ? branchMap.get(request.branchId) : undefined
          const nominated = request.proposedProviderId === provider.id

          return (
            <article key={request.id} className="dentist-request-card-v206">
              <div className="dentist-request-main-v206">
                <span className="dentist-request-icon-v206"><UserRound size={18} /></span>
                <div>
                  <strong>{patient ? `${patient.firstName} ${patient.lastName}` : 'Patient'}</strong>
                  <span>{service?.name ?? 'Dental service'} · {branch?.name ?? 'Clinic branch'}</span>
                </div>
              </div>
              <div className="dentist-request-schedule-v206">
                <span><CalendarDays size={14} />{formatRequestDate(request.date)}</span>
                <span><Clock3 size={14} />{formatRequestTime(request.startTime)}</span>
              </div>
              <div className="dentist-request-action-v206">
                {nominated && <small>Requested specifically for you</small>}
                <Button disabled={Boolean(savingId)} onClick={() => void acceptRequest(request)}>
                  <CheckCircle2 size={16} />{savingId === request.id ? 'Approving…' : 'Approve & assign to me'}
                </Button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  ) : feedback ? (
    <div className="dentist-request-feedback-v206" role="status">{feedback}</div>
  ) : null

  return content ? createPortal(content, portalTarget) : null
}
