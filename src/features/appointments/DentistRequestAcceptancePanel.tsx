import { useEffect, useMemo, useState } from 'react'
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
import { getProviderBranchAssignments, getStoredProviders } from '../dentists/dentistStore'
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

export function DentistRequestAcceptancePanel() {
  const { user } = useAuth()
  const isDentist = user?.role === 'dentist' || user?.role === 'associate_dentist'
  const [appointments, setAppointments] = useState<Appointment[]>(() => getStoredAppointments())
  const [savingId, setSavingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!isDentist) return
    const refresh = () => setAppointments(getStoredAppointments())
    refresh()
    const timer = window.setInterval(refresh, 500)
    return () => window.clearInterval(timer)
  }, [isDentist])

  const provider = useMemo(() => {
    if (!user || !isDentist) return undefined
    const email = user.email?.trim().toLowerCase()
    return getStoredProviders().find((entry) =>
      entry.status === 'active' && (
        entry.profileId === user.id ||
        (email && entry.email?.trim().toLowerCase() === email)
      ),
    )
  }, [isDentist, user])

  const providerBranchIds = useMemo(() => {
    if (!provider) return new Set<string>()
    return new Set(
      getProviderBranchAssignments()
        .filter((assignment) => assignment.providerId === provider.id && assignment.status === 'active')
        .map((assignment) => assignment.branchId),
    )
  }, [provider])

  const requests = useMemo(() => {
    if (!provider) return []
    return appointments
      .filter((appointment) =>
        appointment.status === 'pending' &&
        !appointment.providerId &&
        Boolean(appointment.branchId && providerBranchIds.has(appointment.branchId)) &&
        (!appointment.proposedProviderId || appointment.proposedProviderId === provider.id),
      )
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))
  }, [appointments, provider, providerBranchIds])

  if (!isDentist) return null

  if (!provider) {
    return (
      <section className="dentist-request-panel-v206 is-warning" aria-label="Dentist appointment requests">
        <div><strong>Dentist appointment requests</strong><span>Your signed-in account is not linked to an active dentist provider profile, so requests cannot be accepted safely.</span></div>
      </section>
    )
  }

  if (!requests.length) return null

  async function acceptRequest(request: Appointment) {
    if (!provider || savingId) return
    setSavingId(request.id)
    setFeedback(null)
    try {
      const actor = user?.email || provider.displayName || 'Dentist'
      if (request.proposedProviderId === provider.id) {
        await acceptNominatedAppointmentPersisted({
          appointmentId: request.id,
          actor,
          expectedUpdatedAt: request.updatedAt,
        })
      } else {
        await acceptUnassignedAppointmentPersisted({
          appointmentId: request.id,
          providerId: provider.id,
          actor,
          expectedUpdatedAt: request.updatedAt,
        })
      }
      setAppointments(getStoredAppointments())
      setFeedback('Appointment request accepted and confirmed.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'The appointment request could not be accepted.')
    } finally {
      setSavingId(null)
    }
  }

  const patientMap = new Map(getStoredPatients().map((patient) => [patient.id, patient]))
  const serviceMap = new Map(getStoredServices().map((service) => [String(service.id), service]))
  const branchMap = new Map(getStoredBranches().map((branch) => [branch.id, branch]))

  return (
    <section className="dentist-request-panel-v206" aria-label="Dentist appointment requests">
      <header>
        <div>
          <span className="dentist-request-kicker-v206"><Stethoscope size={14} /> Dentist decision queue</span>
          <h2>Requests you can accept</h2>
          <p>Accepting a request assigns it to you and confirms the appointment in Supabase after conflict and branch validation.</p>
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
                {nominated && <small>Requested for you</small>}
                <Button disabled={Boolean(savingId)} onClick={() => void acceptRequest(request)}>
                  <CheckCircle2 size={16} />{savingId === request.id ? 'Accepting…' : 'Accept request'}
                </Button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
