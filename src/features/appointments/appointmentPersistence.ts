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
    proposedProviderId: row.proposed_provider_id ?? undefined,
    providerAcceptedAt: row.provider_accepted_at ?? undefined,
    providerAcceptedBy: row.provider_accepted_by ?? undefined,
    providerDeclinedAt: row.provider_declined_at ?? undefined,
    providerDeclinedBy: row.provider_declined_by ?? undefined,
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
  const rawMessage = String(cause?.message ?? '')
  const normalized = rawMessage.toLowerCase()
  if (cause?.code === 'PGRST202' || normalized.includes('assign_appointment_provider') || normalized.includes('nominate_appointment_provider') || normalized.includes('accept_nominated_appointment') || normalized.includes('decline_nominated_appointment')) {
    return new Error('Dentist assignment and acceptance are not installed in the clinic database yet. No changes were saved.')
  }
  if (cause?.code === '42501') {
    return new Error(rawMessage || 'You do not have permission to perform this appointment action.')
  }
  if (cause?.code === '23P01' || normalized.includes('overlap')) {
    return new Error('The appointment could not be saved because that time slot is no longer available.')
  }
  if (normalized.includes('not assigned to the selected branch') || normalized.includes('appointment branch')) {
    return new Error('This dentist is not assigned to the selected branch.')
  }
  if (normalized.includes('already has another appointment at this time') || normalized.includes('already has an appointment during this time')) {
    return new Error('This dentist already has an appointment during this time.')
  }
  if (normalized.includes('only the assigned dentist can update')) {
    return new Error('Only the assigned dentist can update this clinical appointment step.')
  }
  if (normalized.includes('not assigned to this appointment branch')) {
    return new Error('This dentist is not assigned to the appointment branch.')
  }
  if (normalized.includes('choose and confirm a dentist')) {
    return new Error('Choose and confirm a dentist before confirming this appointment.')
  }
  if (normalized.includes('use the reschedule workflow')) {
    return new Error('Use the reschedule workflow to change appointment date or time.')
  }
  if (normalized.includes('matching appointment')) {
    return new Error('This patient already has a matching appointment at this time.')
  }
  if (normalized.includes('not available at the requested time')) {
    return new Error('This dentist is not available at the requested time.')
  }
  if (normalized.includes('not available for that date and time')) {
    return new Error('The selected dentist is not available for that date and time.')
  }
  if (normalized.includes('inactive and cannot be assigned')) {
    return new Error('This dentist is inactive and cannot be assigned.')
  }
  if (normalized.includes('already been updated')) {
    return new Error('This appointment has already been updated.')
  }
  if (normalized.includes('missing a branch')) {
    return new Error('This appointment request is missing a branch. No changes were saved.')
  }
  return new Error(message)
}

function patientBookingError(cause?: { message?: string; code?: string } | null) {
  if (import.meta.env.DEV && cause) console.error('[patient appointment request]', cause)
  const message = String(cause?.message ?? '').toLowerCase()
  if (cause?.code === '42501' || message.includes('authentication') || message.includes('session expired')) {
    return new Error('Your session expired. Please sign in again.')
  }
  if (message.includes('closed')) return new Error('The clinic is closed at the selected time.')
  if (message.includes('already') || message.includes('duplicate')) return new Error('This appointment request already exists.')
  if (message.includes('no longer available') || message.includes('operatory') || message.includes('slot') || cause?.code === '23P01') {
    return new Error('This time is no longer available. Please choose another slot.')
  }
  if (message.includes('service')) return new Error('Selected service is not available for patient booking at this branch.')
  if (message.includes('branch')) return new Error('Selected branch is not available.')
  if (message.includes('time') || message.includes('date')) return new Error('Choose a valid appointment date and time.')
  return new Error('Appointment request could not be saved. No appointment was created.')
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

  let { data, error } = await supabase.rpc('create_patient_appointment_request', {
    p_branch_id: input.branchId,
    p_service_id: input.serviceId,
    p_appointment_date: input.date,
    p_start_time: input.startTime,
    p_notes: input.notes?.trim() ?? '',
  })

  if (error && (error.code === 'PGRST202' || String(error.message ?? '').toLowerCase().includes('create_patient_appointment_request'))) {
    const fallback = await supabase.rpc('create_patient_portal_appointment', {
      p_branch_id: input.branchId,
      p_service_id: input.serviceId,
      p_provider_id: null,
      p_appointment_date: input.date,
      p_start_time: input.startTime,
      p_notes: input.notes?.trim() ?? '',
    })
    data = fallback.data
    error = fallback.error
  }

  if (error || !data) throw patientBookingError(error)
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Appointment request could not be saved. No appointment was created.')

  const confirmed = mapAppointmentRow(row as Record<string, any>)
  replaceCachedAppointment(confirmed)
  return confirmed
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

  const { data, error } = await supabase.rpc('transition_appointment_status_v134', {
    p_appointment_id: id,
    p_next_status: nextStatus,
    p_actor: context.actor,
    p_reason: context.reason ?? '',
    p_notes: context.notes ?? '',
    p_expected_updated_at: context.expectedUpdatedAt ?? null,
  })
  if (error || !data) throw mutationError('The appointment status could not be changed.', error)
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('This appointment has already changed. Refresh and try again.')

  const confirmed = mapAppointmentRow(row as Record<string, any>)
  replaceCachedAppointment(confirmed)
  recordAuditEntry({
    user: context.actor,
    action: 'appointment_status_changed',
    entity: 'appointment',
    entityId: confirmed.appointmentNumber ?? confirmed.id,
    metadata: { appointmentId: confirmed.id, fromStatus: current.status, toStatus: nextStatus, reason: context.reason },
  })
  return confirmed
}

export async function assignAppointmentProviderPersisted(input: {
  appointmentId: string
  providerId: string
  actor: string
  expectedUpdatedAt?: string
}): Promise<Appointment> {
  if (!supabase) throw new Error('Clinic database is not configured. Appointment assignment cannot be saved safely.')
  const current = getStoredAppointments().find((appointment) => appointment.id === input.appointmentId)
  if (!current) throw new Error('Appointment was not found.')

  const { data, error } = await supabase.rpc('assign_appointment_provider', {
    p_appointment_id: input.appointmentId,
    p_provider_id: input.providerId,
    p_actor: input.actor,
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
  })

  if (error || !data) throw mutationError('The dentist could not be assigned for this appointment request.', error)
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('The clinic database did not return the confirmed appointment request.')

  const confirmed = mapAppointmentRow(row as Record<string, any>)
  replaceCachedAppointment(confirmed)
  if (current.proposedProviderId !== confirmed.proposedProviderId) {
    await appendHistoryAfterPersistence({
      appointment: confirmed,
      eventType: 'provider_changed',
      actor: input.actor,
      notes: confirmed.notes,
    })
  }
  if (current.status !== confirmed.status) {
    await appendHistoryAfterPersistence({
      appointment: confirmed,
      eventType: statusEventType(confirmed.status),
      actor: input.actor,
      fromStatus: current.status,
      toStatus: confirmed.status,
      notes: confirmed.notes,
    })
  }
  recordAuditEntry({
    user: input.actor,
    action: 'appointment_status_changed',
    entity: 'appointment',
    entityId: confirmed.appointmentNumber ?? confirmed.id,
    metadata: { appointmentId: confirmed.id, providerId: confirmed.providerId, status: confirmed.status },
  })
  return confirmed
}

export async function acceptNominatedAppointmentPersisted(input: {
  appointmentId: string
  actor: string
  expectedUpdatedAt?: string
}): Promise<Appointment> {
  if (!supabase) throw new Error('Clinic database is not configured. Appointment acceptance cannot be saved safely.')
  const current = getStoredAppointments().find((appointment) => appointment.id === input.appointmentId)
  if (!current) throw new Error('Appointment was not found.')

  const { data, error } = await supabase.rpc('accept_nominated_appointment', {
    p_appointment_id: input.appointmentId,
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
  })

  if (error || !data) throw mutationError('The appointment request could not be accepted.', error)
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('The clinic database did not return the accepted appointment.')

  const confirmed = mapAppointmentRow(row as Record<string, any>)
  replaceCachedAppointment(confirmed)
  if (current.providerId !== confirmed.providerId) {
    await appendHistoryAfterPersistence({
      appointment: confirmed,
      eventType: 'provider_changed',
      actor: input.actor,
      notes: confirmed.notes,
    })
  }
  if (current.status !== confirmed.status) {
    await appendHistoryAfterPersistence({
      appointment: confirmed,
      eventType: statusEventType(confirmed.status),
      actor: input.actor,
      fromStatus: current.status,
      toStatus: confirmed.status,
      notes: confirmed.notes,
    })
  }
  recordAuditEntry({
    user: input.actor,
    action: 'appointment_status_changed',
    entity: 'appointment',
    entityId: confirmed.appointmentNumber ?? confirmed.id,
    metadata: { appointmentId: confirmed.id, providerId: confirmed.providerId, status: confirmed.status },
  })
  return confirmed
}

export async function declineNominatedAppointmentPersisted(input: {
  appointmentId: string
  actor: string
  expectedUpdatedAt?: string
}): Promise<Appointment> {
  if (!supabase) throw new Error('Clinic database is not configured. Appointment decline cannot be saved safely.')
  const current = getStoredAppointments().find((appointment) => appointment.id === input.appointmentId)
  if (!current) throw new Error('Appointment was not found.')

  const { data, error } = await supabase.rpc('decline_nominated_appointment', {
    p_appointment_id: input.appointmentId,
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
  })

  if (error || !data) throw mutationError('The appointment request could not be declined.', error)
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('The clinic database did not return the declined appointment request.')

  const confirmed = mapAppointmentRow(row as Record<string, any>)
  replaceCachedAppointment(confirmed)
  if (current.proposedProviderId !== confirmed.proposedProviderId) {
    await appendHistoryAfterPersistence({
      appointment: confirmed,
      eventType: 'provider_changed',
      actor: input.actor,
      notes: confirmed.notes,
    })
  }
  recordAuditEntry({
    user: input.actor,
    action: 'appointment_status_changed',
    entity: 'appointment',
    entityId: confirmed.appointmentNumber ?? confirmed.id,
    metadata: { appointmentId: confirmed.id, declinedProviderId: current.proposedProviderId, status: confirmed.status },
  })
  return confirmed
}

export async function acceptUnassignedAppointmentPersisted(input: {
  appointmentId: string
  providerId?: string
  actor: string
  expectedUpdatedAt?: string
}): Promise<Appointment> {
  if (!supabase) throw new Error('Clinic database is not configured. Appointment acceptance cannot be saved safely.')

  const { data, error } = await supabase.rpc('accept_unassigned_appointment', {
    p_appointment_id: input.appointmentId,
    p_provider_id: input.providerId ?? null,
    p_actor: input.actor,
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
  })

  if (error || !data) throw mutationError('The appointment request could not be accepted.', error)
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('The clinic database did not return the accepted appointment.')

  const confirmed = mapAppointmentRow(row as Record<string, any>)
  replaceCachedAppointment(confirmed)
  recordAuditEntry({
    user: input.actor,
    action: 'appointment_status_changed',
    entity: 'appointment',
    entityId: confirmed.appointmentNumber ?? confirmed.id,
    metadata: { appointmentId: confirmed.id, providerId: confirmed.providerId, status: confirmed.status },
  })
  return confirmed
}

export async function rescheduleAppointmentPersisted(
  id: string,
  values: Pick<AppointmentFormValues, 'branchId' | 'providerId' | 'date' | 'startTime' | 'endTime'>,
  context: { actor: string; reason?: string; notes?: string; expectedUpdatedAt?: string },
): Promise<Appointment> {
  if (!supabase) throw new Error('Clinic database is not configured. Appointment changes cannot be saved safely.')

  const current = getStoredAppointments().find((appointment) => appointment.id === id)
  if (!current) throw new Error('Appointment was not found.')
  if (!allowedAppointmentTransitions[current.status]?.includes('rescheduled')) {
    throw new Error(`This appointment cannot move from ${current.status.replaceAll('_', ' ')} to rescheduled.`)
  }

  const { data, error } = await supabase.rpc('reschedule_appointment_v134', {
    p_appointment_id: id,
    p_branch_id: values.branchId || null,
    p_provider_id: values.providerId || null,
    p_appointment_date: values.date,
    p_start_time: values.startTime,
    p_end_time: values.endTime,
    p_actor: context.actor,
    p_reason: context.reason ?? '',
    p_notes: context.notes ?? '',
    p_expected_updated_at: context.expectedUpdatedAt ?? null,
  })
  if (error || !data) throw mutationError('The appointment could not be rescheduled.', error)
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('This appointment has already changed. Refresh and try again.')

  const confirmed = mapAppointmentRow(row as Record<string, any>)
  replaceCachedAppointment(confirmed)
  recordAuditEntry({
    user: context.actor,
    action: 'appointment_status_changed',
    entity: 'appointment',
    entityId: confirmed.appointmentNumber ?? confirmed.id,
    metadata: {
      appointmentId: confirmed.id,
      oldDate: current.date,
      oldStartTime: current.startTime,
      oldEndTime: current.endTime,
      oldProviderId: current.providerId,
      newDate: confirmed.date,
      newStartTime: confirmed.startTime,
      newEndTime: confirmed.endTime,
      newProviderId: confirmed.providerId,
      reason: context.reason,
    },
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
