import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../auth/AuthContext'
import {
  acceptUnassignedAppointmentPersisted,
  loadAppointmentsFromSupabase,
} from './appointmentPersistence'
import type { Appointment } from './appointmentTypes'
import '../../styles/dentist-request-acceptance-v206.css'
import '../../styles/appointment-workspace-compact-v207.css'

type Feedback = {
  appointmentId: string
  tone: 'success' | 'danger'
  message: string
} | null

export function DentistRequestAcceptancePanel() {
  const { user } = useAuth()
  const isDentist = user?.role === 'dentist' || user?.role === 'associate_dentist'
  const [requests, setRequests] = useState<Appointment[]>([])
  const [cardTargets, setCardTargets] = useState<HTMLElement[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  async function refreshRequests() {
    const rows = await loadAppointmentsFromSupabase({ strict: true })
    setRequests(rows.filter((appointment) => appointment.status === 'pending' && !appointment.providerId))
    return rows
  }

  async function acceptRequest(request: Appointment) {
    if (!isDentist || savingId) return
    setSavingId(request.id)
    setFeedback(null)

    try {
      const updated = await acceptUnassignedAppointmentPersisted({
        appointmentId: request.id,
        actor: user?.email || user?.name || 'Dentist',
        expectedUpdatedAt: request.updatedAt,
      })

      await refreshRequests()
      setLoadError(null)
      setFeedback({
        appointmentId: request.id,
        tone: 'success',
        message: `Appointment ${updated.appointmentNumber ?? updated.id} confirmed and assigned to you.`,
      })
    } catch (error) {
      setFeedback({
        appointmentId: request.id,
        tone: 'danger',
        message: error instanceof Error ? error.message : 'The appointment request could not be approved.',
      })
    } finally {
      setSavingId(null)
    }
  }

  useEffect(() => {
    const classifyAlerts = () => {
      document.querySelectorAll<HTMLElement>('.sa-appointments-requests-panel .inline-alert').forEach((alert) => {
        const message = alert.textContent?.trim() ?? ''
        const isConfirmed = /^Appointment\s+.+\s+confirmed\.?$/i.test(message)
        alert.classList.toggle('appointment-request-success-v206', isConfirmed)
        if (isConfirmed) alert.setAttribute('role', 'status')
      })
    }

    classifyAlerts()
    const observer = new MutationObserver(classifyAlerts)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isDentist || !user?.id) {
      setRequests([])
      return
    }

    let active = true

    const load = async () => {
      try {
        const rows = await loadAppointmentsFromSupabase({ strict: true })
        if (!active) return
        setRequests(rows.filter((appointment) => appointment.status === 'pending' && !appointment.providerId))
        setLoadError(null)
      } catch (error) {
        if (!active) return
        setLoadError(error instanceof Error ? error.message : 'Appointment requests could not be loaded from Supabase.')
      }
    }

    void load()
    const timer = window.setInterval(() => void load(), 15_000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [isDentist, user?.id])

  useEffect(() => {
    if (!isDentist) {
      setCardTargets([])
      return
    }

    const resolveTargets = () => {
      const next = Array.from(document.querySelectorAll<HTMLElement>('.sa-appointments-requests-panel .sa-appointments-request-card'))
      setCardTargets((current) => {
        if (current.length === next.length && current.every((target, index) => target === next[index])) return current
        return next
      })
    }

    resolveTargets()
    const observer = new MutationObserver(resolveTargets)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [isDentist])

  if (!isDentist) return null

  const portals = cardTargets.map((target, index) => {
    const request = requests[index]
    if (!request) return null
    const currentFeedback = feedback?.appointmentId === request.id ? feedback : null

    return createPortal(
      <div className="dentist-card-approval-v206" data-appointment-id={request.id}>
        <div className="dentist-card-approval-copy-v206">
          <span className="dentist-card-approval-kicker-v206"><ShieldCheck size={14} /> Dentist approval</span>
          <strong>Approve and assign this request to yourself</strong>
          <small>Supabase will confirm your branch assignment and appointment availability before assigning the request to you.</small>
        </div>

        {currentFeedback && (
          <div className={`dentist-card-feedback-v206 is-${currentFeedback.tone}`} role="status">
            {currentFeedback.message}
          </div>
        )}

        <Button
          className="dentist-card-approve-button-v206"
          disabled={Boolean(savingId)}
          onClick={(event) => {
            event.stopPropagation()
            void acceptRequest(request)
          }}
        >
          <CheckCircle2 size={16} />
          {savingId === request.id ? 'Approving…' : 'Approve & assign to me'}
        </Button>
      </div>,
      target,
      `dentist-approval-${request.id}`,
    )
  }).filter(Boolean)

  return (
    <>
      {loadError && cardTargets[0] && createPortal(
        <div className="dentist-card-feedback-v206 is-danger dentist-card-load-error-v206" role="alert">{loadError}</div>,
        cardTargets[0],
      )}
      {portals}
    </>
  )
}
