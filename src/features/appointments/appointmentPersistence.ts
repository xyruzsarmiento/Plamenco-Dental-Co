import { supabase } from '../../lib/supabase'
import { getStoredPatients } from '../patients/patientStore'
import { getStoredServices, servicePriceToCents } from '../services/serviceStore'
import { recordAuditEntry } from '../security/auditLogStore'
import type { Appointment, AppointmentFormValues, AppointmentStatus } from './appointmentTypes'
import {
  allowedAppointmentTransitions,
  getStoredAppointmentHistory,
  getStoredAppointments,
  saveStoredAppointmentHistory,
  saveStoredAppointments,
} from './appointmentStore'

function patientDatabaseId(patientRef: string) {
  return getStoredPatients().find((patient) => patient.id === patientRef || patient.patientId === patientRef)?.id ?? patientRef
}

function patientReferenceFromDatabaseId(patientId: string) {
  return getStoredPatients().find((patient) => patient.id === patientId)?.patientId ?? patientId
}

export function mapAppointmentRow(row: Record<string, any>): Appointment {
  return {
    id: String(row.id),
    appointmentNumber: row.appointment_number ?? undefined,
    patientId: patientReferenceFromDatabaseId(String(row.patient_id ?? '')),
    branchId: row.branch_id ?? undefined,
    providerId: row.provider_id ?? undefined,
    serviceId: String(row.service_id ?? ''),
    operatoryId: row.operatory_id ?? undefined,
    date: row.appointment_date ?? '',
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : '',
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : '',
    durationMinutes: row.duration_minutes == null ? undefined : Number(row.duration_minutes),
    estimatedAmountCents: row.estimated_amount_cents == null ? undefined : Number(row.estimated_amount_cents),
    paymentStatus: row.payment_status ?? 'not_billed',
    depositStatus: row.deposit_status ?? 'not_required',
    depositRequiredCents: Number(row.deposit_required_cents ?? 0),
    depositPaidCents: Number(row.deposit_paid_cents ?? 0),
    reasonForVisit: row.reason_for_visit ?? '',
    patientNotes: row.patient_notes ?? '',
    internalNotes: row.internal_notes ?? '',
    bookingSource: row.booking_source ?? 'staff_entry',
    checkedInAt: row.checked_in_at ?? undefined,
    checkedInBy: row.checked_in_by ?? undefined,
    waitingAt: row.waiting_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    startedBy: row.started_by ?? undefined,
    completedAt: row.completed_at ?? undefined,
    completedBy: row.completed_by ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    cancelledBy: row.cancelled_by ?? undefined,
    noShowAt: row.no_show_at ?? undefined,
    noShowBy: row.no_show_by ?? undefined,
    rescheduledAt: row.rescheduled_at ?? undefined,
    rescheduledBy: row.rescheduled_by ?? undefined,
    notes: row.notes ?? '',
    status: row.status ?? 'pending',
    createdBy: row.created_by ?? '',
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }
}

function replaceCachedAppointment(confirmed: Appointment) {
  const cached = getStoredAppointments().filter((appointment) => appointment.id !== confirmed.id)
  saveStoredAppointments([...cached, confirmed])
}

function mutationError(message: string, cause?: { message?: string; code?: string } | null) {
  if (import.meta.env.DEV && cause) console.error('[appointment persistence]', cause)
  if (cause?.code === '23P01' || String(cause?.message ?? '').toLowerCase().includes('overlap')) {
    return new Error('The appointment could not be saved because that time slot is no longer available.')
  }
  return new Error(message)
}

async function appendHistoryAfterPersistence(input: {
  appointment: Appointment
  eventType: string
  actor: string
  fromStatus?: AppointmentStatus
  toStatus?: AppointmentStatus
  reason?: string
  notes?: string
}) {
  if (!supabase) return
  const changedAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('appointment_status_history')
    .insert({
      appointment_id: input.appointment.id,
      event_type: input.eventType,
      from_status: input.fromStatus ?? null,
      to_status: input.toStatus ?? null,
      changed_by: input.actor,
      changed_at: changedAt,
      reason: input.reason ?? '',
      notes: input.notes ?? '',
      metadata: {
        appointmentNumber: input.appointment.appointmentNumber,
        branchId: input.appointment.branchId,
        providerId: input.appointment.providerId,
        serviceId: input.appointment.serviceId,
      },
    })
    .select('*')
    .single()

  if (error || !data) {
    if (import.meta.env.DEV) console.error('[appointment history persistence]', error)
    return
  }

  const localEntry = {
    id: String((data as Record<string, any>).id),
    appointmentId: input.appointment.id,
    appointmentNumber: input.appointment.appointmentNumber,
    eventType: input.eventType as any,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    changedBy: input.actor,
    changedAt: String((data as Record<string, any>).changed_at ?? changedAt),
    reason: input.reason,
    notes: input.notes,
    metadata: (data as Record<string, any>).metadata ?? {},
  }
  saveStoredAppointmentHistory([localEntry, ...getStoredAppointmentHistory()].slice(0, 1000))
}

export async function loadAppointmentsFromSupabase(options: { strict?: boolean } = {}): Promise<Appointment[]> {
  if (!supabase) {
    if (options.strict) throw new Error('Clinic database is not configured. Unable to load appointments.')
    return getStoredAppointments()
  }

  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .order('appointment_date', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) {
    if (options.strict) throw new Error('Unable to load appointments from the clinic database.')
    return getStoredAppointments()
  }

  const appointments = (data ?? []).map((row) => mapAppointmentRow(row as Record<string, any>))
  saveStoredAppointments(appointments)
  return appointments
}

export async function createAppointmentPersisted(values: AppointmentFormValues, createdBy: string): Promise<Appointment> {
  if (!supabase) throw new Error('Clinic database is not configured. Appointments cannot be saved safely.')

  const service = getStoredServices().find((entry) => entry.id === values.serviceId)
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      patient_id: patientDatabaseId(values.patientId),
      branch_id: values.branchId || null,
      provider_id: values.providerId || null,
      service_id: values.serviceId,
      operatory_id: values.operatoryId || null,
      appointment_date: values.date,
      start_time: values.startTime,
      end_time: values.endTime,
      duration_minutes: values.durationMinutes ?? service?.duration ?? null,
      estimated_amount_cents: values.estimatedAmountCents ?? (service ? servicePriceToCents(service.price) : null),
      payment_status: values.paymentStatus ?? 'not_billed',
      deposit_status: values.depositStatus ?? 'not_required',
      deposit_required_cents: values.depositRequiredCents ?? 0,
      deposit_paid_cents: values.depositPaidCents ?? 0,
      reason_for_visit: values.reasonForVisit ?? '',
      patient_notes: values.patientNotes ?? '',
      internal_notes: values.internalNotes ?? '',
      booking_source: values.bookingSource ?? 'staff_entry',
      notes: values.notes ?? '',
      status: values.status ?? 'pending',
      created_by: createdBy,
    })
    .select('*')
    .single()

  if (error || !data) throw mutationError('The appointment could not be saved. Your changes were not submitted.', error)

  const confirmed = mapAppointmentRow(data as Record<string, any>)
  replaceCachedAppointment(confirmed)
  await appendHistoryAfterPersistence({ appointment: confirmed, eventType: 'created', actor: createdBy, toStatus: confirmed.status, notes: confirmed.notes })
  return confirmed
}

export async function createPatientPortalAppointmentPersisted(input: {
  branchId: string
  serviceId: string
  providerId?: string
  date: string
  startTime: string
  notes?: string
}): Promise<Appointment> {
  if (!supabase) throw new Error('Clinic database is not configured. Appointment requests cannot be submitted safely.')

  const { data, error } = await supabase.rpc('create_patient_portal_appointment', {
    p_branch_id: input.branchId,
    p_service_id: input.serviceId,
    p_provider_id: input.providerId || null,
    p_appointment_date: input.date,
    p_start_time: input.startTime,
    p_notes: input.notes?.trim() ?? '',
  })

  if (error || !data) throw mutationError('The appointment request could not be submitted.', error)
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('The clinic database did not return the saved appointment.')

  const confirmed = mapAppointmentRow(row as Record<string, any>)
  replaceCachedAppointment(confirmed)
  return confirmed
}

function operationalFields(nextStatus: AppointmentStatus, actor: string) {
  const now = new Date().toISOString()
  switch (nextStatus) {
    case 'checked_in': return { checked_in_at: now, checked_in_by: actor }
    case 'waiting': return { waiting_at: now }
    case 'in_progress': return { started_at: now, started_by: actor }
    case 'completed': return { completed_at: now, completed_by: actor }
    case 'cancelled': return { cancelled_at: now, cancelled_by: actor }
    case 'no_show': return { no_show_at: now, no_show_by: actor }
    case 'rescheduled': return { rescheduled_at: now, rescheduled_by: actor }
    default: return {}
  }
}

function statusEventType(nextStatus: AppointmentStatus) {
  if (nextStatus === 'checked_in') return 'checked_in'
  if (nextStatus === 'waiting') return 'moved_to_waiting'
  if (nextStatus === 'in_progress') return 'started'
  if (nextStatus === 'completed') return 'completed'
  if (nextStatus === 'cancelled') return 'cancelled'
  if (nextStatus === 'no_show') return 'no_show'
  if (nextStatus === 'rescheduled') return 'rescheduled'
  return 'status_changed'
}

export async function transitionAppointmentStatusPersisted(
  id: string,
  nextStatus: AppointmentStatus,
  context: { actor: string; reason?: string; notes?: string; expectedUpdatedAt?: string },
): Promise<Appointment> {
  if (!supabase) throw new Error('Clinic database is not configured. Appointment status cannot be changed safely.')

  const current = getStoredAppointments().find((appointment) => appointment.id === id)
  if (!current) throw new Error('Appointment was not found.')
  if (!allowedAppointmentTransitions[current.status]?.includes(nextStatus)) {
    throw new Error(`This appointment cannot move from ${current.status.replaceAll('_', ' ')} to ${nextStatus.replaceAll('_', ' ')}.`)
  }

  let request = supabase
    .from('appointments')
    .update({ status: nextStatus, ...operationalFields(nextStatus, context.actor) })
    .eq('id', id)
    .eq('status', current.status)

  if (context.expectedUpdatedAt) request = request.eq('updated_at', context.expectedUpdatedAt)

  const { data, error } = await request.select('*').maybeSingle()
  if (error) throw mutationError('The appointment status could not be changed.', error)
  if (!data) throw new Error('This appointment has already changed. Refresh and try again.')

  const confirmed = mapAppointmentRow(data as Record<string, any>)
  replaceCachedAppointment(confirmed)
  await appendHistoryAfterPersistence({
    appointment: confirmed,
    eventType: statusEventType(nextStatus),
    actor: context.actor,
    fromStatus: current.status,
    toStatus: nextStatus,
    reason: context.reason,
    notes: context.notes,
  })
  recordAuditEntry({
    user: context.actor,
    action: 'appointment_status_changed',
    entity: 'appointment',
    entityId: confirmed.appointmentNumber ?? confirmed.id,
    metadata: { appointmentId: confirmed.id, fromStatus: current.status, toStatus: nextStatus, reason: context.reason },
  })
  return confirmed
}

export async function updateAppointmentPersisted(id: string, values: Partial<Appointment>): Promise<Appointment> {
  if (!supabase) throw new Error('Clinic database is not configured. Appointment changes cannot be saved safely.')

  const current = getStoredAppointments().find((appointment) => appointment.id === id)
  if (!current) throw new Error('Appointment was not found.')

  const row: Record<string, unknown> = {}
  if (values.branchId !== undefined) row.branch_id = values.branchId || null
  if (values.providerId !== undefined) row.provider_id = values.providerId || null
  if (values.serviceId !== undefined) row.service_id = values.serviceId
  if (values.operatoryId !== undefined) row.operatory_id = values.operatoryId || null
  if (values.date !== undefined) row.appointment_date = values.date
  if (values.startTime !== undefined) row.start_time = values.startTime
  if (values.endTime !== undefined) row.end_time = values.endTime
  if (values.durationMinutes !== undefined) row.duration_minutes = values.durationMinutes
  if (values.estimatedAmountCents !== undefined) row.estimated_amount_cents = values.estimatedAmountCents
  if (values.reasonForVisit !== undefined) row.reason_for_visit = values.reasonForVisit
  if (values.patientNotes !== undefined) row.patient_notes = values.patientNotes
  if (values.internalNotes !== undefined) row.internal_notes = values.internalNotes
  if (values.notes !== undefined) row.notes = values.notes

  const { data, error } = await supabase.from('appointments').update(row).eq('id', id).eq('updated_at', current.updatedAt).select('*').maybeSingle()
  if (error) throw mutationError('The appointment could not be updated.', error)
  if (!data) throw new Error('This appointment has already changed. Refresh and try again.')

  const confirmed = mapAppointmentRow(data as Record<string, any>)
  replaceCachedAppointment(confirmed)
  return confirmed
}
