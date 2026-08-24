import { AlertTriangle, ArrowRight, CalendarClock } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStoredAppointments } from '../../features/appointments/appointmentStore'
import { Button } from '../ui/Button'

export function AppointmentRequestAlert() {
  const navigate = useNavigate()
  const pendingRequests = useMemo(() => getStoredAppointments().filter((appointment) => appointment.status === 'pending'), [])

  if (pendingRequests.length === 0) return null

  return (
    <section className="appointment-request-alert" role="status" aria-label="Appointment requests needing review">
      <div className="appointment-request-alert-marker" aria-hidden="true">
        <span><AlertTriangle size={18} /></span>
      </div>
      <div className="appointment-request-alert-copy">
        <div className="appointment-request-alert-eyebrow">
          <span className="appointment-request-alert-pulse" aria-hidden="true" />
          Staff action needed
          <b><CalendarClock size={13} /> {pendingRequests.length} pending request{pendingRequests.length === 1 ? '' : 's'}</b>
        </div>
        <h2>Appointment request{pendingRequests.length === 1 ? '' : 's'} awaiting review</h2>
        <p>Confirm, reject, or schedule the patient request from the appointment workspace.</p>
      </div>
      <div className="appointment-request-alert-action-wrap">
        <Button className="appointment-request-alert-action" icon={<ArrowRight size={16} />} onClick={() => navigate('/app/appointments')}>
          Review now
        </Button>
      </div>
    </section>
  )
}
