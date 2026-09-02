import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, ExternalLink, FileClock, HeartPulse, MapPin, RefreshCw, Send, Stethoscope, UserRound, Wallet, X } from 'lucide-react'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { formatCurrency, getInvoicesByPatient } from '../billing/billingStore'
import { CommunicationHistoryPanel } from '../communications/CommunicationHistoryPanel'
import { getCommunicationLogsByAppointment } from '../communications/communicationStore'
import type { CommunicationTemplateKey } from '../communications/communicationTypes'
import { getTreatmentsByPatient } from '../treatments/treatmentStore'
import { getRecallDueBucket, getStoredPatientRecalls, listPatientRecalls, type RecallQueueItem } from '../recalls/recallStore'
import type { Appointment, AppointmentStatus, Operatory } from './appointmentTypes'
import type { Patient } from '../patients/patientTypes'
import type { Service } from '../services/serviceTypes'
import type { Branch } from '../branches/branchTypes'
import type { Provider } from '../dentists/dentistTypes'

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
  onManualResend?: (appointment: Appointment, templateKey: CommunicationTemplateKey) => void | Promise<void>
  communicationPendingKey?: string | null
  communicationFeedback?: { tone: 'success' | 'warning' | 'danger' | 'info'; message: string } | null
  onOpenPatientRecord?: (appointment: Appointment) => void
  onOpenClinicalRecord?: (appointment: Appointment) => void
  onBookFollowUp?: (appointment: Appointment, recall: RecallQueueItem) => void
  onViewFollowUpRecommendation?: (recall: RecallQueueItem) => void
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
  return new Date(`${dateStr}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila',
  })
}

function formatShortDate(dateStr: string): string {
  const parsed = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00+08:00`)
  return Number.isNaN(parsed.getTime()) ? dateStr : parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
}

function formatTime(timeStr: string): string {
  const [hour, minute] = timeStr.split(':')
  const h = Number.parseInt(hour, 10)
  const period = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 === 0 ? 12 : h % 12}:${minute} ${period}`
}

function getStatusLabel(status: AppointmentStatus): string {
  const labels: Record<AppointmentStatus, string> = {
    pending: 'Pending', confirmed: 'Confirmed', rejected: 'Rejected', checked_in: 'Checked In', waiting: 'Waiting',
    rescheduled: 'Rescheduled', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No Show',
  }
  return labels[status]
}

function formatHistoryEvent(eventType: string, status?: AppointmentStatus) {
  const map: Record<string, string> = {
    created: 'Booking created',
    status_changed: status ? `Appointment ${getStatusLabel(status).toLowerCase()}` : 'Appointment updated',
    checked_in: 'Patient checked in', moved_to_waiting: 'Added to waiting queue', started: 'Treatment started',
    completed: 'Appointment completed', cancelled: 'Appointment cancelled', no_show: 'Marked as no show',
    rescheduled: 'Appointment rescheduled', provider_changed: 'Dentist assignment changed',
  }
  return map[eventType] ?? 'Appointment activity recorded'
}

function communicationStatusLabel(status?: string) {
  if (!status) return 'No communication recorded'
  const labels: Record<string, string> = { queued: 'Queued', sending: 'Sending', sent: 'Sent to provider', delivered: 'Delivered', failed: 'Failed', skipped: 'Skipped' }
  return labels[status] ?? status.replaceAll('_', ' ')
}

function getActionLabel(status: AppointmentStatus, fallback: string) {
  const labels: Partial<Record<AppointmentStatus, string>> = {
    confirmed: 'Confirm appointment',
    rejected: 'Reject request',
    checked_in: 'Check In',
    waiting: 'Move to Waiting',
    in_progress: 'Start Visit',
    completed: 'Complete Appointment',
    rescheduled: 'Reschedule',
    cancelled: 'Cancel appointment',
    no_show: 'Mark No Show',
  }
  return labels[status] ?? fallback
}

export function AppointmentDetails({
  appointment, onClose, onStatusChange, patient, branch, provider, operatory, service, history = [],
  onActionRequest, onManualResend, onOpenPatientRecord, onOpenClinicalRecord, onBookFollowUp, onViewFollowUpRecommendation, canManage, communicationFeedback, communicationPendingKey,
}: AppointmentDetailsProps) {
  const communicationLogs = getCommunicationLogsByAppointment(appointment.id)
  const latestCommunication = [...communicationLogs].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
  const lastPatientMessage = [...communicationLogs]
    .filter((log) => ['appointment_confirmed', 'appointment_reminder', 'appointment_rescheduled'].includes(log.templateKey))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
  const patientInvoices = patient ? getInvoicesByPatient(patient.patientId).filter((invoice) => invoice.status !== 'void') : []
  const outstandingBalanceCents = patientInvoices.reduce((sum, invoice) => sum + Math.max(invoice.balanceCents, 0), 0)
  const treatmentHistory = patient ? getTreatmentsByPatient(patient.patientId) : []
  const [patientFollowUps, setPatientFollowUps] = useState<RecallQueueItem[]>([])

  useEffect(() => {
    let active = true
    if (!patient?.patientId) {
      setPatientFollowUps([])
      return () => { active = false }
    }

    setPatientFollowUps(getStoredPatientRecalls(patient.patientId))
    void listPatientRecalls(patient.patientId)
      .then((items) => { if (active) setPatientFollowUps(items) })
      .catch(() => { if (active) setPatientFollowUps(getStoredPatientRecalls(patient.patientId)) })

    return () => { active = false }
  }, [patient?.patientId])

  const activeFollowUps = useMemo(() => patientFollowUps
    .filter((item) => !['completed', 'dismissed', 'cancelled'].includes(item.status))
    .sort((a, b) => String(a.dueDate ?? '9999-12-31').localeCompare(String(b.dueDate ?? '9999-12-31'))), [patientFollowUps])
  const nextFollowUp = activeFollowUps[0]
  const canBookNextFollowUp = Boolean(nextFollowUp && nextFollowUp.status !== 'booked' && !nextFollowUp.linkedAppointmentId)

  const visibleActions: Array<{ status: AppointmentStatus; label: string; reason?: boolean }> = !canManage ? []
    : appointment.status === 'pending' ? [...(appointment.providerId ? [{ status: 'confirmed' as const, label: 'Confirm' }] : []), { status: 'rejected', label: 'Reject', reason: true }]
    : appointment.status === 'confirmed' ? [
      { status: 'checked_in', label: 'Check In' }, { status: 'rescheduled', label: 'Mark Rescheduled', reason: true },
      { status: 'cancelled', label: 'Cancel', reason: true }, { status: 'no_show', label: 'Mark No Show', reason: true },
    ]
    : appointment.status === 'checked_in' ? [{ status: 'waiting', label: 'Move to Waiting' }, { status: 'in_progress', label: 'Start Visit' }]
    : appointment.status === 'waiting' ? [{ status: 'in_progress', label: 'Start Visit' }]
    : appointment.status === 'in_progress' ? [{ status: 'completed', label: 'Complete Visit' }]
    : []
  const patientFlowStatuses: AppointmentStatus[] = ['confirmed', 'checked_in', 'waiting', 'in_progress', 'completed']
  const exceptionStatuses: AppointmentStatus[] = ['rejected', 'rescheduled', 'cancelled', 'no_show']
  const primaryFlowByStatus: Partial<Record<AppointmentStatus, AppointmentStatus>> = {
    pending: 'confirmed',
    confirmed: 'checked_in',
    checked_in: 'in_progress',
    waiting: 'in_progress',
    in_progress: 'completed',
  }
  const primaryFlowStatus = primaryFlowByStatus[appointment.status]
  const patientFlowActions = visibleActions
    .filter((action) => patientFlowStatuses.includes(action.status))
    .sort((a, b) => (a.status === primaryFlowStatus ? -1 : b.status === primaryFlowStatus ? 1 : 0))
  const exceptionActions = visibleActions.filter((action) => exceptionStatuses.includes(action.status))
  const communicationActions: Array<{ key: CommunicationTemplateKey; label: string }> = !canManage || !onManualResend ? []
    : appointment.status === 'confirmed' ? [
      { key: 'appointment_confirmed', label: 'Send confirmation' },
      { key: 'appointment_reminder', label: 'Resend reminder' },
    ]
    : ['checked_in', 'waiting'].includes(appointment.status) ? [{ key: 'appointment_reminder', label: 'Resend reminder' }]
    : appointment.status === 'rescheduled' ? [{ key: 'appointment_rescheduled', label: 'Send reschedule' }]
    : []
  const recentCommunicationLogs = communicationLogs
    .filter((log) => ['appointment_confirmed', 'appointment_reminder', 'appointment_rescheduled'].includes(log.templateKey))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const invokeStatusAction = (status: AppointmentStatus, label: string, reason?: boolean) => {
    if (onActionRequest) onActionRequest(appointment, status, label, reason)
    else onStatusChange(status)
  }

  return (
    <div className="modal-backdrop appointment-details-backdrop-v40" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="modal appointment-details-modal appointment-details-modal-v40" aria-labelledby="appointment-details-title" role="dialog" aria-modal="true">
        <header className="appointment-details-v40-header">
          <div className="appointment-details-v40-identity">
            <span className="appointment-details-v40-kicker">Appointment workspace · {appointment.appointmentNumber ?? appointment.id}</span>
            <div className="appointment-details-v40-title-row">
              <div>
                <h2 id="appointment-details-title">{patient ? `${patient.firstName} ${patient.lastName}` : 'Patient appointment'}</h2>
                <p>{service?.name ?? 'Service not identified'} · {formatDate(appointment.date)}</p>
              </div>
              <StatusBadge status={appointment.status} label={getStatusLabel(appointment.status)} />
            </div>
          </div>
          <button className="appointment-details-v40-close" type="button" aria-label="Close appointment details" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="appointment-details-v40-body">
          <section className="appointment-details-v40-overview">
            <article><CalendarClock size={17} /><div><span>Schedule</span><strong>{formatTime(appointment.startTime)} – {formatTime(appointment.endTime)}</strong><small>{appointment.durationMinutes ?? service?.duration ?? 0} minutes</small></div></article>
            <article><MapPin size={17} /><div><span>Branch</span><strong>{branch?.name ?? 'Not assigned'}</strong><small>{operatory?.name ?? 'No chair assigned'}</small></div></article>
            <article><Stethoscope size={17} /><div><span>Dentist</span><strong>{provider?.displayName ?? 'Not assigned'}</strong><small>{service?.name ?? 'Service unavailable'}</small></div></article>
            <article><Wallet size={17} /><div><span>Patient balance</span><strong>{outstandingBalanceCents > 0 ? formatCurrency(outstandingBalanceCents) : 'No outstanding balance'}</strong><small>{(appointment.paymentStatus ?? 'not_billed').replaceAll('_', ' ')}</small></div></article>
          </section>

          <div className="appointment-details-v40-grid">
            <div className="appointment-details-v40-main">
              <section className="appointment-details-v40-card">
                <div className="appointment-details-v40-section-head"><div><span>Patient profile</span><h3>Contact & care context</h3></div>{onOpenPatientRecord && <Button size="sm" variant="secondary" onClick={() => onOpenPatientRecord(appointment)}><UserRound size={14}/>Open patient</Button>}</div>
                <div className="appointment-details-v40-info-grid">
                  <div><span>Patient ID</span><strong>{patient?.patientId ?? appointment.patientId}</strong></div>
                  <div><span>Phone</span><strong>{patient?.phone || 'No phone recorded'}</strong></div>
                  <div><span>Email</span><strong>{patient?.email || 'No email recorded'}</strong></div>
                  <div><span>Communication</span><strong>{communicationStatusLabel(latestCommunication?.status)}</strong></div>
                </div>
              </section>

              <section className="appointment-details-v40-card contextual-followup-card">
                <div className="appointment-details-v40-section-head">
                  <div><span>Care continuity</span><h3>Recommended follow-up</h3><p>Clinical recall data remains available without the standalone queue page.</p></div>
                  <HeartPulse size={18}/>
                </div>
                {nextFollowUp ? (
                  <div className="contextual-followup-summary">
                    <span className={`contextual-followup-badge is-${getRecallDueBucket(nextFollowUp)}`}>{getRecallDueBucket(nextFollowUp).replaceAll('_', ' ')}</span>
                    <div>
                      <strong>{nextFollowUp.dueDate ? formatShortDate(nextFollowUp.dueDate) : 'Date not set'}</strong>
                      <p>{nextFollowUp.reason || 'Follow-up recommended'}</p>
                      <small>{nextFollowUp.providerName || provider?.displayName || 'Dentist not recorded'} · {nextFollowUp.status.replaceAll('_', ' ')}</small>
                    </div>
                    <div className="contextual-followup-actions">
                      {onBookFollowUp && canBookNextFollowUp && <Button size="sm" onClick={() => onBookFollowUp(appointment, nextFollowUp)}>Book follow-up</Button>}
                      {nextFollowUp.linkedAppointmentId && <small><ExternalLink size={12} /> Linked to appointment {nextFollowUp.linkedAppointmentId}</small>}
                      {onViewFollowUpRecommendation && <Button size="sm" variant="secondary" onClick={() => onViewFollowUpRecommendation(nextFollowUp)}>View recommendation</Button>}
                      {!onViewFollowUpRecommendation && onOpenPatientRecord && <Button size="sm" variant="secondary" onClick={() => onOpenPatientRecord(appointment)}>View recommendation</Button>}
                    </div>
                  </div>
                ) : (
                  <div className="appointment-details-v40-empty">No active clinical recall or follow-up recommendation recorded for this patient.</div>
                )}
              </section>

              <section className="appointment-details-v40-card">
                <div className="appointment-details-v40-section-head"><div><span>Appointment details</span><h3>Booking & schedule</h3></div></div>
                <div className="appointment-details-v40-info-grid three-col">
                  <div><span>Appointment no.</span><strong>{appointment.appointmentNumber ?? appointment.id}</strong></div>
                  <div><span>Date</span><strong>{formatShortDate(appointment.date)}</strong></div>
                  <div><span>Booking source</span><strong>{(appointment.bookingSource ?? 'staff_entry').replaceAll('_', ' ')}</strong></div>
                  <div><span>Estimated amount</span><strong>{appointment.estimatedAmountCents || service?.price ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format((appointment.estimatedAmountCents ?? service?.price ?? 0) / 100) : 'Price to be confirmed'}</strong></div>
                  <div><span>Deposit</span><strong>{(appointment.depositStatus ?? 'not_required').replaceAll('_', ' ')}</strong></div>
                  <div><span>Created by</span><strong>{appointment.createdBy || 'Clinic user'}</strong></div>
                </div>
              </section>

              <section className="appointment-details-v40-card">
                <div className="appointment-details-v40-section-head"><div><span>Clinical context</span><h3>Treatment history</h3><p>Latest recorded treatments for this patient.</p></div><FileClock size={18}/></div>
                {treatmentHistory.length ? (
                  <div className="appointment-details-v40-treatment-list">
                    {treatmentHistory.map((treatment) => (
                      <article key={treatment.id}>
                        <div className="appointment-details-v40-treatment-date"><span>{formatShortDate(treatment.treatmentDate)}</span><StatusBadge status={treatment.status} variant="compact" /></div>
                        <div className="appointment-details-v40-treatment-copy"><strong>{treatment.serviceNameSnapshot || treatment.description || 'Treatment'}</strong><span>{treatment.description || 'No treatment description recorded'}</span><small>{treatment.providerNameSnapshot || treatment.performedBy || 'Provider not recorded'}{treatment.toothNumber ? ` · Tooth ${treatment.toothNumber}` : ''}</small></div>
                      </article>
                    ))}
                  </div>
                ) : <div className="appointment-details-v40-empty">No treatment history recorded for this patient.</div>}
              </section>

              <section className="appointment-details-v40-card">
                <div className="appointment-details-v40-section-head"><div><span>Notes</span><h3>Booking context</h3></div></div>
                <div className="appointment-details-v40-notes">
                  <div><span>Reason for visit</span><p>{appointment.reasonForVisit || appointment.notes || 'No reason recorded.'}</p></div>
                  <div><span>Patient notes</span><p>{appointment.patientNotes || 'No patient notes.'}</p></div>
                  <div><span>Internal notes</span><p>{appointment.internalNotes || 'No internal notes.'}</p></div>
                </div>
              </section>
            </div>

            <aside className="appointment-details-v40-side">
              {canManage && (
                <section className="appointment-details-v40-card appointment-details-v40-actions-card">
                  <div className="appointment-details-v40-section-head"><div><span>Workflow</span><h3>Quick actions</h3></div></div>
                  <div className="appointment-details-v40-workflow">
                    <section className="appointment-details-v40-action-group">
                      <div className="appointment-details-v40-action-heading"><span>Patient flow</span><small>{patientFlowActions.length ? 'Next valid appointment step' : `${getStatusLabel(appointment.status)} has no active flow step`}</small></div>
                      {appointment.status === 'in_progress' && onOpenClinicalRecord && <Button className="appointment-details-v40-action is-secondary-flow" variant="secondary" onClick={() => onOpenClinicalRecord(appointment)}><ClipboardList size={14}/>Open clinical record</Button>}
                      {patientFlowActions.length ? patientFlowActions.map(({ status, label, reason }) => (
                        <Button
                          key={status}
                          className={`appointment-details-v40-action ${status === primaryFlowStatus ? 'is-primary-flow' : 'is-secondary-flow'}`}
                          variant={status === primaryFlowStatus ? 'primary' : 'secondary'}
                          onClick={() => invokeStatusAction(status, getActionLabel(status, label), reason)}
                        >
                          {status === 'completed' ? <CheckCircle2 size={14}/> : <ClipboardList size={14}/>}
                          {getActionLabel(status, label)}
                        </Button>
                      )) : <div className="appointment-details-v40-action-empty">No patient-flow action available for this status.</div>}
                    </section>

                    <section className="appointment-details-v40-action-group">
                      <div className="appointment-details-v40-action-heading"><span>Communication</span><small>{lastPatientMessage ? `Last sent ${new Date(lastPatientMessage.createdAt).toLocaleString('en-PH')}` : 'No patient message sent yet'}</small></div>
                      {communicationActions.length ? communicationActions.map((action) => {
                        const pending = communicationPendingKey === `${appointment.id}:${action.key}`
                        return (
                          <Button
                            key={action.key}
                            className="appointment-details-v40-action is-communication"
                            size="sm"
                            variant="secondary"
                            disabled={Boolean(communicationPendingKey)}
                            onClick={() => onManualResend?.(appointment, action.key)}
                          >
                            <Send size={14}/>{pending ? 'Sending...' : action.label}
                          </Button>
                        )
                      }) : <div className="appointment-details-v40-action-empty">No communication action is available for this status.</div>}
                    </section>

                    {exceptionActions.length > 0 && (
                      <section className="appointment-details-v40-action-group is-exceptions">
                        <div className="appointment-details-v40-action-heading"><span>Appointment changes</span><small>Use only when the schedule changes or the visit cannot proceed.</small></div>
                        <div className="appointment-details-v40-exception-grid">
                          {exceptionActions.map(({ status, label, reason }) => (
                            <Button
                              key={status}
                              className={`appointment-details-v40-action is-exception is-${status}`}
                              variant={status === 'cancelled' || status === 'no_show' || status === 'rejected' ? 'danger' : 'secondary'}
                              onClick={() => invokeStatusAction(status, getActionLabel(status, label), reason)}
                            >
                              {status === 'rescheduled' ? <RefreshCw size={14}/> : <AlertTriangle size={14}/>}
                              {getActionLabel(status, label)}
                            </Button>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                </section>
              )}

              <section className="appointment-details-v40-card">
                <div className="appointment-details-v40-section-head"><div><span>Communications</span><h3>Recent messaging</h3><p>{recentCommunicationLogs.length ? `${recentCommunicationLogs.length} appointment message${recentCommunicationLogs.length === 1 ? '' : 's'} recorded` : `Latest status: ${communicationStatusLabel(latestCommunication?.status)}`}</p></div></div>
                {communicationFeedback && <div className={`appointment-details-v40-communication-feedback is-${communicationFeedback.tone}`} role={communicationFeedback.tone === 'danger' ? 'alert' : 'status'}>{communicationFeedback.message}</div>}
                <div className="appointment-details-v40-communication-history">
                  <CommunicationHistoryPanel logs={recentCommunicationLogs} emptyMessage="No appointment communications recorded." />
                </div>
              </section>

              <section className="appointment-details-v40-card">
                <div className="appointment-details-v40-section-head"><div><span>Timeline</span><h3>Appointment activity</h3></div></div>
                <ul className="appointment-details-v40-timeline">
                  {history.length ? history.map((entry) => <li key={entry.id}><i/><div><strong>{formatHistoryEvent(entry.eventType, entry.toStatus)}</strong><span>{new Date(entry.changedAt).toLocaleString('en-PH')} · {entry.changedBy}</span>{(entry.reason || entry.notes) && <p>{entry.reason || entry.notes}</p>}</div></li>) : <li className="is-empty">No activity history recorded.</li>}
                </ul>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </div>
  )
}
