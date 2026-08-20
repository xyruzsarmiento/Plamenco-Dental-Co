import { CalendarClock, ClipboardList, MapPin, Send, Stethoscope, UserRound, Wallet, X } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { formatCurrency, getInvoicesByPatient } from '../billing/billingStore'
import { CommunicationHistoryPanel } from '../communications/CommunicationHistoryPanel'
import { getCommunicationLogsByAppointment } from '../communications/communicationStore'
import type { CommunicationTemplateKey } from '../communications/communicationTypes'
import type { Appointment, AppointmentStatus } from './appointmentTypes'
import type { Patient } from '../patients/patientTypes'
import type { Service } from '../services/serviceTypes'
import type { Branch } from '../branches/branchTypes'
import type { Provider } from '../dentists/dentistTypes'
import type { Operatory } from './appointmentTypes'

type AppointmentDetailsProps = {
  appointment: Appointment
  patient?: Patient
  service?: Service
  branch?: Branch
  provider?: Provider
  operatory?: Operatory
  onClose: () => void
  onStatusChange: (status: AppointmentStatus) => void
  onActionRequest?: (appointment: Appointment, status: AppointmentStatus, label: string, requiresReason?: boolean) => void
  onManualResend?: (appointment: Appointment, templateKey: CommunicationTemplateKey) => void
  onOpenPatientRecord?: (appointment: Appointment) => void
  onOpenClinicalRecord?: (appointment: Appointment) => void
  history?: Array<{
    id: string
    eventType: string
    fromStatus?: AppointmentStatus
    toStatus?: AppointmentStatus
    changedBy: string
    changedAt: string
    reason?: string
    notes?: string
  }>
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
    rejected: 'Rejected',
    checked_in: 'Checked In',
    waiting: 'Waiting',
    rescheduled: 'Rescheduled',
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
    case 'rescheduled':
      return 'info'
    case 'checked_in':
    case 'waiting':
    case 'in_progress':
      return 'success'
    case 'completed':
      return 'success'
    case 'cancelled':
    case 'rejected':
    case 'no_show':
      return 'danger'
    default:
      return 'neutral'
  }
}

function formatHistoryEvent(eventType: string, status?: AppointmentStatus) {
  const map: Record<string, string> = {
    created: 'Booking created',
    status_changed: status ? `Appointment ${getStatusLabel(status).toLowerCase()}` : 'Appointment updated',
    checked_in: 'Patient checked in',
    moved_to_waiting: 'Added to waiting queue',
    started: 'Treatment started',
    completed: 'Appointment completed',
    cancelled: 'Appointment cancelled',
    no_show: 'Marked as no show',
    rescheduled: 'Appointment rescheduled',
    provider_changed: 'Dentist assignment changed',
  }
  return map[eventType] ?? 'Appointment activity recorded'
}

function communicationStatusLabel(status?: string) {
  if (!status) return 'No communication recorded'
  const labels: Record<string, string> = {
    queued: 'Queued',
    sending: 'Sending',
    sent: 'Sent to provider',
    delivered: 'Delivered',
    failed: 'Failed',
    skipped: 'Skipped',
  }
  return labels[status] ?? status.replaceAll('_', ' ')
}

export function AppointmentDetails({
  appointment,
  onClose,
  onStatusChange,
  patient,
  branch,
  provider,
  operatory,
  service,
  history = [],
  onActionRequest,
  onManualResend,
  onOpenPatientRecord,
  onOpenClinicalRecord,
  canManage,
}: AppointmentDetailsProps) {
  const communicationLogs = getCommunicationLogsByAppointment(appointment.id)
  const latestCommunication = [...communicationLogs].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
  const patientInvoices = patient
    ? getInvoicesByPatient(patient.patientId).filter((invoice) => invoice.status !== 'void')
    : []
  const outstandingBalanceCents = patientInvoices.reduce((sum, invoice) => sum + Math.max(invoice.balanceCents, 0), 0)

  const visibleActions: Array<{ status: AppointmentStatus; label: string; reason?: boolean }> =
    !canManage
      ? []
      : appointment.status === 'pending'
        ? [{ status: 'confirmed', label: 'Confirm' }, { status: 'rejected', label: 'Reject', reason: true }]
        : appointment.status === 'confirmed'
          ? [
              { status: 'checked_in', label: 'Check In' },
              { status: 'rescheduled', label: 'Mark Rescheduled', reason: true },
              { status: 'cancelled', label: 'Cancel', reason: true },
              { status: 'no_show', label: 'Mark No Show', reason: true },
            ]
          : appointment.status === 'checked_in'
            ? [{ status: 'waiting', label: 'Move to Waiting' }, { status: 'in_progress', label: 'Start Visit' }]
            : appointment.status === 'waiting'
              ? [{ status: 'in_progress', label: 'Start Visit' }]
              : appointment.status === 'in_progress'
                ? [{ status: 'completed', label: 'Complete Visit' }]
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
            <p className="eyebrow">{appointment.appointmentNumber ?? appointment.id}</p>
            <h2 id="appointment-details-title">
              {patient ? `${patient.firstName} ${patient.lastName}` : 'Patient appointment'}
            </h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="appointment-details-content">
          <div className="details-section appointment-detail-hero">
            <div className="details-header">
              <h3>Status</h3>
              <Badge tone={getStatusTone(appointment.status)}>{getStatusLabel(appointment.status)}</Badge>
            </div>
            <div className="appointment-detail-metrics">
              <div><CalendarClock size={16} /><span>{formatDate(appointment.date)}</span></div>
              <div><MapPin size={16} /><span>{branch?.name ?? 'No branch assigned'}</span></div>
              <div><Stethoscope size={16} /><span>{provider?.displayName ?? 'No dentist assigned'}</span></div>
              <div><Wallet size={16} /><span>{outstandingBalanceCents > 0 ? `${formatCurrency(outstandingBalanceCents)} outstanding` : 'No outstanding balance'}</span></div>
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
                  <span className="value">{patient.phone || 'No phone recorded'}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Email</span>
                  <span className="value">{patient.email || 'No email recorded'}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Outstanding Balance</span>
                  <span className="value">{outstandingBalanceCents > 0 ? formatCurrency(outstandingBalanceCents) : 'Paid / no outstanding balance'}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Latest Appointment Communication</span>
                  <span className="value">{communicationStatusLabel(latestCommunication?.status)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="details-section">
            <h3>Schedule</h3>
            <div className="details-grid">
              <div className="detail-item">
                <span className="label">Appointment number</span>
                <span className="value">{appointment.appointmentNumber ?? appointment.id}</span>
              </div>
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
                <span className="value">{appointment.durationMinutes ?? service?.duration ?? 0} minutes</span>
              </div>
              <div className="detail-item">
                <span className="label">Branch</span>
                <span className="value">{branch?.name ?? 'No branch assigned'}</span>
              </div>
              <div className="detail-item">
                <span className="label">Assigned Dentist</span>
                <span className="value">{provider?.displayName ?? 'No dentist assigned'}</span>
              </div>
              <div className="detail-item">
                <span className="label">Operatory / Chair</span>
                <span className="value">{operatory?.name ?? 'Not assigned'}</span>
              </div>
              <div className="detail-item">
                <span className="label">Estimated Amount</span>
                <span className="value">{appointment.estimatedAmountCents || service?.price ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format((appointment.estimatedAmountCents ?? service?.price ?? 0) / 100) : 'Price to be confirmed'}</span>
              </div>
              <div className="detail-item">
                <span className="label">Payment Status</span>
                <span className="value">{(appointment.paymentStatus ?? 'not_billed').replaceAll('_', ' ')}</span>
              </div>
              <div className="detail-item">
                <span className="label">Deposit</span>
                <span className="value">
                  {(appointment.depositStatus ?? 'not_required').replaceAll('_', ' ')}
                  {appointment.depositRequiredCents ? ` - ${new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format((appointment.depositPaidCents ?? 0) / 100)} paid of ${new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(appointment.depositRequiredCents / 100)}` : ''}
                </span>
              </div>
              <div className="detail-item">
                <span className="label">Booking Source</span>
                <span className="value">{(appointment.bookingSource ?? 'staff_entry').replaceAll('_', ' ')}</span>
              </div>
              <div className="detail-item">
                <span className="label">Checked In</span>
                <span className="value">{appointment.checkedInAt ? new Date(appointment.checkedInAt).toLocaleString() : 'Not checked in'}</span>
              </div>
              <div className="detail-item">
                <span className="label">Started</span>
                <span className="value">{appointment.startedAt ? new Date(appointment.startedAt).toLocaleString() : 'Not started'}</span>
              </div>
              <div className="detail-item">
                <span className="label">Completed</span>
                <span className="value">{appointment.completedAt ? new Date(appointment.completedAt).toLocaleString() : 'Not completed'}</span>
              </div>
            </div>
          </div>

          <div className="details-section">
            <h3>Booking Notes</h3>
            <div className="details-grid">
              <div className="detail-item">
                <span className="label">Reason for Visit</span>
                <span className="value">{appointment.reasonForVisit || appointment.notes || 'No reason recorded'}</span>
              </div>
              <div className="detail-item">
                <span className="label">Patient Notes</span>
                <span className="value">{appointment.patientNotes || 'No patient notes'}</span>
              </div>
              <div className="detail-item">
                <span className="label">Internal Notes</span>
                <span className="value">{appointment.internalNotes || 'No internal notes'}</span>
              </div>
              <div className="detail-item">
                <span className="label">Created By</span>
                <span className="value">{appointment.createdBy}</span>
              </div>
            </div>
          </div>

          {canManage && visibleActions.length > 0 && (
            <div className="details-section">
              <h3>Quick Actions</h3>
              <div className="action-buttons">
                {onOpenPatientRecord && (
                  <Button size="sm" variant="secondary" onClick={() => onOpenPatientRecord(appointment)}>
                    <UserRound size={14} />
                    Open Patient Record
                  </Button>
                )}
                {appointment.status === 'in_progress' && onOpenClinicalRecord && (
                  <Button size="sm" variant="secondary" onClick={() => onOpenClinicalRecord(appointment)}>
                    <ClipboardList size={14} />
                    Open Clinical Record
                  </Button>
                )}
                {visibleActions.map(({ status, label, reason }) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={status === 'cancelled' ? 'secondary' : 'primary'}
                    onClick={() => onActionRequest ? onActionRequest(appointment, status, label, reason) : onStatusChange(status as AppointmentStatus)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="details-section">
            <div className="details-header">
              <div>
                <h3>Communications</h3>
                <p className="muted-text">Latest status: {communicationStatusLabel(latestCommunication?.status)}</p>
              </div>
              {canManage && onManualResend && (
                <div className="action-buttons">
                  {appointment.status === 'confirmed' && (
                    <Button size="sm" variant="secondary" onClick={() => onManualResend(appointment, 'appointment_confirmed')}>
                      <Send size={14} />
                      Resend Confirmation
                    </Button>
                  )}
                  {['confirmed', 'checked_in', 'waiting'].includes(appointment.status) && (
                    <Button size="sm" variant="secondary" onClick={() => onManualResend(appointment, 'appointment_reminder')}>
                      <Send size={14} />
                      Resend Reminder
                    </Button>
                  )}
                  {appointment.status === 'rescheduled' && (
                    <Button size="sm" variant="secondary" onClick={() => onManualResend(appointment, 'appointment_rescheduled')}>
                      <Send size={14} />
                      Send Reschedule Message
                    </Button>
                  )}
                </div>
              )}
            </div>
            <CommunicationHistoryPanel
              logs={communicationLogs}
              emptyMessage="No appointment communications recorded."
            />
          </div>

          <div className="details-section">
            <h3>Activity</h3>
            <ul className="appointment-history-list">
              {history.length ? history.map((entry) => (
                <li key={entry.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{formatHistoryEvent(entry.eventType, entry.toStatus)}</strong>
                    <small>{new Date(entry.changedAt).toLocaleString()} - {entry.changedBy}</small>
                    {(entry.reason || entry.notes) && <p>{entry.reason || entry.notes}</p>}
                  </div>
                </li>
              )) : (
                <li className="timeline-empty">No activity history recorded.</li>
              )}
            </ul>
          </div>

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
