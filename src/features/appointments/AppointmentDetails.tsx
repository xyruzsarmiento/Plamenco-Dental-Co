import { X } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import type { Appointment, AppointmentStatus } from './appointmentTypes'
import type { Patient } from '../patients/patientTypes'
import type { Service } from '../services/serviceTypes'

type AppointmentDetailsProps = {
  appointment: Appointment
  patient?: Patient
  service?: Service
  onClose: () => void
  onStatusChange: (status: AppointmentStatus) => void
  canManage?: boolean
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(timeStr: string): string {
  const [hour, minute] = timeStr.split(':')
  const h = Number.parseInt(hour, 10)
  const period = h >= 12 ? 'PM' : 'AM'
  const displayHour = h % 12 === 0 ? 12 : h % 12
  return `${displayHour}:${minute} ${period}`
}

function getStatusLabel(status: AppointmentStatus): string {
  const labels: Record<AppointmentStatus, string> = {
    pending: 'Pending',
    confirmed: 'Approved',
    checked_in: 'Checked In',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No Show',
  }
  return labels[status]
}

function getStatusTone(status: AppointmentStatus): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'pending':
      return 'warning'
    case 'confirmed':
      return 'info'
    case 'checked_in':
    case 'in_progress':
      return 'success'
    case 'completed':
      return 'success'
    case 'cancelled':
    case 'no_show':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function AppointmentDetails({
  appointment,
  onClose,
  onStatusChange,
  patient,
  service,
  canManage,
}: AppointmentDetailsProps) {
  const visibleActions: Array<{ status: AppointmentStatus; label: string }> =
    !canManage
      ? []
      : appointment.status === 'pending'
        ? [{ status: 'confirmed', label: 'Approve' }, { status: 'cancelled', label: 'Reject' }]
        : appointment.status === 'confirmed'
          ? [{ status: 'completed', label: 'Complete' }, { status: 'cancelled', label: 'Cancel' }]
          : appointment.status === 'completed'
            ? []
            : appointment.status === 'cancelled'
              ? []
              : []

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal appointment-details-modal"
        aria-labelledby="appointment-details-title"
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Appointment Details</p>
            <h2 id="appointment-details-title">
              {patient ? `${patient.firstName} ${patient.lastName}` : 'Patient appointment'}
            </h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="appointment-details-content">
          <div className="details-section">
            <div className="details-header">
              <h3>Status</h3>
              <Badge tone={getStatusTone(appointment.status)}>{getStatusLabel(appointment.status)}</Badge>
            </div>
          </div>

          <div className="details-section">
            <h3>Patient</h3>
            {patient && (
              <div className="details-grid">
                <div className="detail-item">
                  <span className="label">Name</span>
                  <span className="value">{patient.firstName} {patient.lastName}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Patient ID</span>
                  <span className="value">{patient.patientId}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Phone</span>
                  <span className="value">{patient.phone}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Email</span>
                  <span className="value">{patient.email}</span>
                </div>
              </div>
            )}
          </div>

          <div className="details-section">
            <h3>Appointment</h3>
            <div className="details-grid">
              <div className="detail-item">
                <span className="label">Service</span>
                <span className="value">{service?.name || 'Unknown'}</span>
              </div>
              <div className="detail-item">
                <span className="label">Date</span>
                <span className="value">{formatDate(appointment.date)}</span>
              </div>
              <div className="detail-item">
                <span className="label">Time</span>
                <span className="value">
                  {formatTime(appointment.startTime)} - {formatTime(appointment.endTime)}
                </span>
              </div>
              <div className="detail-item">
                <span className="label">Duration</span>
                <span className="value">{service?.duration ?? 0} minutes</span>
              </div>
            </div>
          </div>

          {appointment.notes && (
            <div className="details-section">
              <h3>Notes</h3>
              <p className="details-notes">{appointment.notes}</p>
            </div>
          )}

          {canManage && visibleActions.length > 0 && (
            <div className="details-section">
              <h3>Quick Actions</h3>
              <div className="action-buttons">
                {visibleActions.map(({ status, label }) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={status === 'cancelled' ? 'secondary' : 'primary'}
                    onClick={() => onStatusChange(status as AppointmentStatus)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
