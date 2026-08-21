import type { Appointment, AppointmentFormValues, AppointmentStatus, AppointmentStatusHistoryEntry, AppointmentWaitlistEntry, Operatory, ScheduleBlock } from './appointmentTypes'
import { insertRemoteTableRow, updateRemoteTableRow } from '../../lib/supabaseSync'
import { notifyAppointmentTransition, sendAppointmentCommunication } from '../communications/communicationService'
import { getCommunicationLogsByAppointment } from '../communications/communicationStore'
import { getStoredServices, servicePriceToCents } from '../services/serviceStore'
import { recordAuditEntry } from '../security/auditLogStore'

const APPOINTMENT_STORAGE_KEY = 'plamenco.appointments'
const APPOINTMENT_HISTORY_STORAGE_KEY = 'plamenco.appointmentStatusHistory'
const OPERATORY_STORAGE_KEY = 'plamenco.appointment.operatories'
const SCHEDULE_BLOCK_STORAGE_KEY = 'plamenco.appointment.scheduleBlocks'
const WAITLIST_STORAGE_KEY = 'plamenco.appointment.waitlist'

type ScheduleConflictDetail =
  | { type: 'provider' | 'operatory'; appointment: Appointment }
  | { type: 'block'; block: ScheduleBlock }

const seedAppointments: Appointment[] = []

function safeParseAppointments(value: string | null): Appointment[] | null {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as Appointment[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function getStoredAppointments(): Appointment[] {
  const stored = safeParseAppointments(window.localStorage.getItem(APPOINTMENT_STORAGE_KEY))

  if (stored?.length) {
    return stored.map(normalizeAppointment)
  }

  window.localStorage.setItem(APPOINTMENT_STORAGE_KEY, JSON.stringify(seedAppointments))
  return seedAppointments
}

function normalizeAppointment(appointment: Appointment): Appointment {
  return {
    ...appointment,
    appointmentNumber: appointment.appointmentNumber ?? generateDisplayAppointmentNumber([appointment], appointment.id),
    bookingSource: appointment.bookingSource ?? (appointment.createdBy === 'patient-portal' ? 'patient_portal' : 'staff_entry'),
    paymentStatus: appointment.paymentStatus ?? 'not_billed',
    depositStatus: appointment.depositStatus ?? 'not_required',
    depositRequiredCents: appointment.depositRequiredCents ?? 0,
    depositPaidCents: appointment.depositPaidCents ?? 0,
  }
}

function mapAppointmentToRemoteRow(appointment: Appointment) {
  return {
    id: appointment.id,
    appointment_number: appointment.appointmentNumber ?? null,
    patient_id: appointment.patientId,
    branch_id: appointment.branchId || null,
    provider_id: appointment.providerId || null,
    service_id: appointment.serviceId,
    operatory_id: appointment.operatoryId || null,
    appointment_date: appointment.date,
    start_time: appointment.startTime,
    end_time: appointment.endTime,
    duration_minutes: appointment.durationMinutes ?? null,
    estimated_amount_cents: appointment.estimatedAmountCents ?? null,
    payment_status: appointment.paymentStatus ?? 'not_billed',
    deposit_status: appointment.depositStatus ?? 'not_required',
    deposit_required_cents: appointment.depositRequiredCents ?? 0,
    deposit_paid_cents: appointment.depositPaidCents ?? 0,
    reason_for_visit: appointment.reasonForVisit ?? '',
    patient_notes: appointment.patientNotes ?? '',
    internal_notes: appointment.internalNotes ?? '',
    booking_source: appointment.bookingSource ?? 'staff_entry',
    checked_in_at: appointment.checkedInAt ?? null,
    checked_in_by: appointment.checkedInBy ?? '',
    waiting_at: appointment.waitingAt ?? null,
    started_at: appointment.startedAt ?? null,
    started_by: appointment.startedBy ?? '',
    completed_at: appointment.completedAt ?? null,
    completed_by: appointment.completedBy ?? '',
    cancelled_at: appointment.cancelledAt ?? null,
    cancelled_by: appointment.cancelledBy ?? '',
    no_show_at: appointment.noShowAt ?? null,
    no_show_by: appointment.noShowBy ?? '',
    rescheduled_at: appointment.rescheduledAt ?? null,
    rescheduled_by: appointment.rescheduledBy ?? '',
    notes: appointment.notes,
    status: appointment.status,
    created_by: appointment.createdBy,
  }
}

function safeParseHistory(value: string | null): AppointmentStatusHistoryEntry[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as AppointmentStatusHistoryEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function safeParseList<T>(value: string | null): T[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as T[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function nowIso() {
  return new Date().toISOString()
}

export const allowedAppointmentTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['checked_in', 'rescheduled', 'cancelled', 'no_show'],
  checked_in: ['waiting', 'in_progress', 'cancelled'],
  waiting: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  rejected: [],
  cancelled: [],
  no_show: [],
  rescheduled: [],
}

export function getStoredAppointmentHistory(): AppointmentStatusHistoryEntry[] {
  return safeParseHistory(window.localStorage.getItem(APPOINTMENT_HISTORY_STORAGE_KEY))
}

export function saveStoredAppointmentHistory(entries: AppointmentStatusHistoryEntry[]) {
  window.localStorage.setItem(APPOINTMENT_HISTORY_STORAGE_KEY, JSON.stringify(entries))
}

export function getAppointmentHistory(appointmentId: string) {
  return getStoredAppointmentHistory()
    .filter((entry) => entry.appointmentId === appointmentId)
    .sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime())
}

function appendAppointmentHistory(entry: AppointmentStatusHistoryEntry) {
  saveStoredAppointmentHistory([entry, ...getStoredAppointmentHistory()].slice(0, 1000))
  void insertRemoteTableRow('appointment_status_history', {
    id: entry.id,
    appointment_id: entry.appointmentId,
    event_type: entry.eventType,
    from_status: entry.fromStatus ?? null,
    to_status: entry.toStatus ?? null,
    changed_by: entry.changedBy,
    changed_at: entry.changedAt,
    reason: entry.reason ?? '',
    notes: entry.notes ?? '',
    metadata: entry.metadata ?? {},
  })
  return entry
}

export function getOperatories(): Operatory[] {
  return safeParseList<Operatory>(window.localStorage.getItem(OPERATORY_STORAGE_KEY))
}

export function saveOperatories(operatories: Operatory[]) {
  window.localStorage.setItem(OPERATORY_STORAGE_KEY, JSON.stringify(operatories))
}

export function createOperatory(input: Omit<Operatory, 'id' | 'createdAt' | 'updatedAt'>) {
  const timestamp = nowIso()
  const operatory: Operatory = {
    id: `operatory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...input,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  saveOperatories([operatory, ...getOperatories()])
  void insertRemoteTableRow('operatories', {
    id: operatory.id,
    name: operatory.name,
    branch_id: operatory.branchId,
    status: operatory.status,
    notes: operatory.notes,
  })
  return operatory
}

export function getScheduleBlocks(): ScheduleBlock[] {
  return safeParseList<ScheduleBlock>(window.localStorage.getItem(SCHEDULE_BLOCK_STORAGE_KEY))
}

export function saveScheduleBlocks(blocks: ScheduleBlock[]) {
  window.localStorage.setItem(SCHEDULE_BLOCK_STORAGE_KEY, JSON.stringify(blocks))
}

export function createScheduleBlock(input: Omit<ScheduleBlock, 'id' | 'createdAt' | 'updatedAt'>) {
  const timestamp = nowIso()
  const block: ScheduleBlock = {
    id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...input,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  saveScheduleBlocks([block, ...getScheduleBlocks()])
  void insertRemoteTableRow('schedule_blocks', {
    id: block.id,
    branch_id: block.branchId,
    provider_id: block.providerId || null,
    operatory_id: block.operatoryId || null,
    block_date: block.date,
    start_time: block.fullDay ? null : block.startTime || null,
    end_time: block.fullDay ? null : block.endTime || null,
    full_day: block.fullDay,
    block_type: block.type,
    reason: block.reason,
    notes: block.notes,
    created_by: block.createdBy,
  })
  return block
}

export function getAffectedAppointmentsForScheduleBlock(block: Pick<ScheduleBlock, 'branchId' | 'date' | 'endTime' | 'fullDay' | 'operatoryId' | 'providerId' | 'startTime'>) {
  return getStoredAppointments().filter((appointment) => {
    if (!isBlockingAppointmentStatus(appointment.status)) return false
    if (appointment.date !== block.date) return false
    if (appointment.branchId !== block.branchId) return false
    if (block.providerId && appointment.providerId !== block.providerId) return false
    if (block.operatoryId && appointment.operatoryId !== block.operatoryId) return false
    if (block.fullDay) return true
    if (!block.startTime || !block.endTime) return true
    return appointment.startTime < block.endTime && appointment.endTime > block.startTime
  })
}

export function getWaitlistEntries(): AppointmentWaitlistEntry[] {
  return safeParseList<AppointmentWaitlistEntry>(window.localStorage.getItem(WAITLIST_STORAGE_KEY))
}

export function saveWaitlistEntries(entries: AppointmentWaitlistEntry[]) {
  window.localStorage.setItem(WAITLIST_STORAGE_KEY, JSON.stringify(entries))
}

export function createWaitlistEntry(input: Omit<AppointmentWaitlistEntry, 'id' | 'createdAt' | 'updatedAt'>) {
  const timestamp = nowIso()
  const entry: AppointmentWaitlistEntry = {
    id: `waitlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...input,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  saveWaitlistEntries([entry, ...getWaitlistEntries()])
  void insertRemoteTableRow('appointment_waitlist', {
    id: entry.id,
    patient_id: entry.patientId,
    branch_id: entry.branchId,
    service_id: entry.serviceId,
    preferred_provider_id: entry.preferredProviderId || null,
    preferred_date_start: entry.preferredDateStart,
    preferred_date_end: entry.preferredDateEnd,
    preferred_time_start: entry.preferredTimeStart || null,
    preferred_time_end: entry.preferredTimeEnd || null,
    priority: entry.priority,
    status: entry.status,
    notes: entry.notes,
    created_by: entry.createdBy,
  })
  return entry
}

export function canTransitionAppointmentStatus(from: AppointmentStatus, to: AppointmentStatus) {
  return allowedAppointmentTransitions[from]?.includes(to) ?? false
}

function getOperationalFields(status: AppointmentStatus, actor: string, timestamp: string): Partial<Appointment> {
  switch (status) {
    case 'checked_in':
      return { checkedInAt: timestamp, checkedInBy: actor }
    case 'waiting':
      return { waitingAt: timestamp }
    case 'in_progress':
      return { startedAt: timestamp, startedBy: actor }
    case 'completed':
      return { completedAt: timestamp, completedBy: actor }
    case 'cancelled':
      return { cancelledAt: timestamp, cancelledBy: actor }
    case 'no_show':
      return { noShowAt: timestamp, noShowBy: actor }
    case 'rescheduled':
      return { rescheduledAt: timestamp, rescheduledBy: actor }
    default:
      return {}
  }
}

export function generateDisplayAppointmentNumber(appointments: Appointment[], fallbackSeed?: string) {
  const highest = appointments.reduce((max, appointment) => {
    const numericId = Number((appointment.appointmentNumber ?? '').replace('APT-', ''))
    return Number.isFinite(numericId) ? Math.max(max, numericId) : max
  }, 0)

  if (highest > 0) return `APT-${String(highest + 1).padStart(6, '0')}`
  if (fallbackSeed) {
    const digits = fallbackSeed.replace(/\D/g, '').slice(-6)
    if (digits) return `APT-${digits.padStart(6, '0')}`
  }
  return `APT-${String(Date.now()).slice(-6)}`
}

export function addMinutesToTime(time: string, minutes: number) {
  const [hour, minute] = time.split(':').map(Number)
  const date = new Date(2000, 0, 1, hour, minute + minutes, 0, 0)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function isBlockingAppointmentStatus(status: Appointment['status']) {
  return !['cancelled', 'rejected', 'no_show'].includes(status)
}

export function saveStoredAppointments(appointments: Appointment[]) {
  window.localStorage.setItem(APPOINTMENT_STORAGE_KEY, JSON.stringify(appointments))
}

export function getAppointmentById(id: string): Appointment | undefined {
  return getStoredAppointments().find((appt) => appt.id === id)
}

export function getAppointmentsByPatient(patientId: string): Appointment[] {
  return getStoredAppointments().filter((appt) => appt.patientId === patientId)
}

export function getAppointmentsByDate(date: string): Appointment[] {
  return getStoredAppointments().filter((appt) => appt.date === date)
}

export function getAppointmentsInDateRange(startDate: string, endDate: string): Appointment[] {
  return getStoredAppointments().filter((appt) => appt.date >= startDate && appt.date <= endDate)
}

export function getTodayAppointments(): Appointment[] {
  const today = new Date().toISOString().split('T')[0]
  return getAppointmentsByDate(today)
}

export function checkScheduleConflict(
  date: string,
  startTime: string,
  endTime: string,
  excludeId?: string,
  providerId?: string,
  branchId?: string,
  operatoryId?: string
): boolean {
  const appointments = getAppointmentsByDate(date).filter(
    (appt) =>
      isBlockingAppointmentStatus(appt.status) &&
      (!excludeId || appt.id !== excludeId) &&
      (
        (!!providerId && appt.providerId === providerId) ||
        (!!operatoryId && appt.operatoryId === operatoryId)
      ) &&
      (!branchId || appt.branchId === branchId)
  )

  for (const appt of appointments) {
    const existingStart = appt.startTime
    const existingEnd = appt.endTime

    if (startTime < existingEnd && endTime > existingStart) {
      return true
    }
  }

  return false
}

export function getScheduleConflictDetail(
  date: string,
  startTime: string,
  endTime: string,
  excludeId?: string,
  providerId?: string,
  branchId?: string,
  operatoryId?: string
): ScheduleConflictDetail | null {
  const appointmentConflict = getAppointmentsByDate(date).find((appt) => (
    isBlockingAppointmentStatus(appt.status) &&
    (!excludeId || appt.id !== excludeId) &&
    (!branchId || appt.branchId === branchId) &&
    (
      (!!providerId && appt.providerId === providerId) ||
      (!!operatoryId && appt.operatoryId === operatoryId)
    ) &&
    startTime < appt.endTime &&
    endTime > appt.startTime
  ))
  if (appointmentConflict) {
    return { type: appointmentConflict.providerId === providerId ? 'provider' : 'operatory', appointment: appointmentConflict }
  }

  const blockConflict = getScheduleBlocks().find((block) => (
    block.date === date &&
    block.branchId === branchId &&
    (block.fullDay || (!!block.startTime && !!block.endTime && startTime < block.endTime && endTime > block.startTime)) &&
    (!block.providerId || block.providerId === providerId) &&
    (!block.operatoryId || block.operatoryId === operatoryId)
  ))
  if (blockConflict) return { type: 'block', block: blockConflict }
  return null
}

export function createAppointment(
  values: AppointmentFormValues,
  createdBy: string
): Appointment | null {
  if (checkScheduleConflict(values.date, values.startTime, values.endTime, undefined, values.providerId, values.branchId, values.operatoryId)) {
    return null
  }

  const appointments = getStoredAppointments()
  const now = new Date().toISOString()
  const id = `appt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const service = getStoredServices().find((entry) => entry.id === values.serviceId)

  const appointment: Appointment = {
    id,
    appointmentNumber: generateDisplayAppointmentNumber(appointments),
    ...values,
    durationMinutes: values.durationMinutes ?? service?.duration ?? undefined,
    estimatedAmountCents: service ? servicePriceToCents(service.price) : values.estimatedAmountCents,
    paymentStatus: values.paymentStatus ?? 'not_billed',
    depositStatus: values.depositStatus ?? 'not_required',
    depositRequiredCents: values.depositRequiredCents ?? 0,
    depositPaidCents: values.depositPaidCents ?? 0,
    bookingSource: values.bookingSource ?? (createdBy === 'patient-portal' ? 'patient_portal' : 'staff_entry'),
    createdBy,
    createdAt: now,
    updatedAt: now,
  }

  appointments.push(appointment)
  saveStoredAppointments(appointments)
  appendAppointmentHistory({
    id: `appt-history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    appointmentId: appointment.id,
    appointmentNumber: appointment.appointmentNumber,
    eventType: 'created',
    toStatus: appointment.status,
    changedBy: createdBy,
    changedAt: now,
    notes: appointment.notes,
    metadata: {
      branchId: appointment.branchId,
      providerId: appointment.providerId,
      serviceId: appointment.serviceId,
      bookingSource: appointment.bookingSource,
    },
  })

  void insertRemoteTableRow('appointments', mapAppointmentToRemoteRow(appointment))

  return appointment
}

export function transitionAppointmentStatus(
  id: string,
  nextStatus: AppointmentStatus,
  context: {
    actor: string
    reason?: string
    notes?: string
    expectedUpdatedAt?: string
  },
): { appointment?: Appointment; error?: string } {
  const appointments = getStoredAppointments()
  const index = appointments.findIndex((appt) => appt.id === id)
  if (index === -1) return { error: 'Appointment was not found.' }

  const current = appointments[index]
  if (context.expectedUpdatedAt && current.updatedAt !== context.expectedUpdatedAt) {
    return { error: 'This appointment has already been updated. Refresh and try again.' }
  }

  if (!canTransitionAppointmentStatus(current.status, nextStatus)) {
    return { error: `This appointment cannot move from ${current.status.replaceAll('_', ' ')} to ${nextStatus.replaceAll('_', ' ')}.` }
  }

  const now = new Date().toISOString()
  const updated: Appointment = {
    ...current,
    ...getOperationalFields(nextStatus, context.actor, now),
    status: nextStatus,
    updatedAt: now,
  }

  appointments[index] = updated
  saveStoredAppointments(appointments)
  void updateRemoteTableRow('appointments', id, mapAppointmentToRemoteRow(updated))

  const eventType = nextStatus === 'checked_in'
    ? 'checked_in'
    : nextStatus === 'waiting'
      ? 'moved_to_waiting'
      : nextStatus === 'in_progress'
        ? 'started'
        : nextStatus === 'completed'
          ? 'completed'
          : nextStatus === 'cancelled'
            ? 'cancelled'
            : nextStatus === 'no_show'
              ? 'no_show'
              : nextStatus === 'rescheduled'
                ? 'rescheduled'
                : 'status_changed'

  appendAppointmentHistory({
    id: `appt-history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    appointmentId: updated.id,
    appointmentNumber: updated.appointmentNumber,
    eventType,
    fromStatus: current.status,
    toStatus: nextStatus,
    changedBy: context.actor,
    changedAt: now,
    reason: context.reason,
    notes: context.notes,
    metadata: {
      branchId: updated.branchId,
      providerId: updated.providerId,
      scheduledDate: updated.date,
      startTime: updated.startTime,
      endTime: updated.endTime,
    },
  })

  recordAuditEntry({
    user: context.actor,
    action: 'appointment_status_changed',
    entity: 'appointment',
    entityId: updated.appointmentNumber ?? updated.id,
    metadata: {
      appointmentId: updated.id,
      fromStatus: current.status,
      toStatus: nextStatus,
      reason: context.reason,
    },
  })

  notifyAppointmentTransition(updated, current.status, nextStatus, {
    actor: context.actor,
    reason: context.reason,
    oldAppointment: current,
  })

  return { appointment: updated }
}

export function updateAppointment(
  id: string,
  values: Partial<Appointment>
): Appointment | null {
  const appointments = getStoredAppointments()
  const index = appointments.findIndex((appt) => appt.id === id)

  if (index === -1) {
    return null
  }

  const appointment = appointments[index]

  if (values.date || values.startTime || values.endTime) {
    const date = values.date ?? appointment.date
    const startTime = values.startTime ?? appointment.startTime
    const endTime = values.endTime ?? appointment.endTime

    if (checkScheduleConflict(date, startTime, endTime, id, values.providerId ?? appointment.providerId, values.branchId ?? appointment.branchId)) {
      return null
    }
  }

  const now = new Date().toISOString()
  const updated: Appointment = {
    ...appointment,
    ...values,
    updatedAt: now,
  }

  appointments[index] = updated
  saveStoredAppointments(appointments)

  void updateRemoteTableRow('appointments', id, mapAppointmentToRemoteRow(updated))

  return updated
}

export function rescheduleAppointment(
  id: string,
  values: Pick<AppointmentFormValues, 'branchId' | 'providerId' | 'date' | 'startTime' | 'endTime'>,
  context: { actor: string; reason?: string; notes?: string; expectedUpdatedAt?: string },
): { appointment?: Appointment; error?: string } {
  const appointments = getStoredAppointments()
  const current = appointments.find((appointment) => appointment.id === id)
  if (!current) return { error: 'Appointment was not found.' }
  if (context.expectedUpdatedAt && current.updatedAt !== context.expectedUpdatedAt) {
    return { error: 'This appointment has already been updated. Refresh and try again.' }
  }
  if (!['confirmed', 'checked_in', 'waiting'].includes(current.status)) {
    return { error: 'Only active appointments can be rescheduled.' }
  }
  if (checkScheduleConflict(values.date, values.startTime, values.endTime, id, values.providerId, values.branchId)) {
    return { error: 'The selected dentist is no longer available at that time.' }
  }

  const updated = updateAppointment(id, {
    ...values,
    status: 'rescheduled',
    rescheduledAt: new Date().toISOString(),
    rescheduledBy: context.actor,
  })
  if (!updated) return { error: 'Unable to reschedule appointment.' }

  appendAppointmentHistory({
    id: `appt-history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    appointmentId: updated.id,
    appointmentNumber: updated.appointmentNumber,
    eventType: 'rescheduled',
    fromStatus: current.status,
    toStatus: 'rescheduled',
    changedBy: context.actor,
    changedAt: updated.updatedAt,
    reason: context.reason,
    notes: context.notes,
    metadata: {
      oldDate: current.date,
      oldStartTime: current.startTime,
      oldEndTime: current.endTime,
      oldBranchId: current.branchId,
      oldProviderId: current.providerId,
      newDate: updated.date,
      newStartTime: updated.startTime,
      newEndTime: updated.endTime,
      newBranchId: updated.branchId,
      newProviderId: updated.providerId,
    },
  })

  notifyAppointmentTransition(updated, current.status, 'rescheduled', {
    actor: context.actor,
    reason: context.reason,
    oldAppointment: current,
  })

  return { appointment: updated }
}

export function resendAppointmentCommunication(
  id: string,
  templateKey: 'appointment_confirmed' | 'appointment_reminder' | 'appointment_rescheduled',
  actor: string,
) {
  const appointment = getAppointmentById(id)
  if (!appointment) return { error: 'Appointment was not found.' }
  const recentSameMessage = getCommunicationLogsByAppointment(id).find((log) => {
    if (log.templateKey !== templateKey) return false
    return Date.now() - new Date(log.createdAt).getTime() < 2 * 60 * 1000
  })
  if (recentSameMessage) {
    return { error: 'This message was already sent or recorded in the last 2 minutes.' }
  }
  const logs = sendAppointmentCommunication({ appointment, templateKey, actor, manual: true })
  return { logs }
}

export function reassignAppointmentProvider(
  id: string,
  providerId: string,
  context: { actor: string; reason?: string; notes?: string; expectedUpdatedAt?: string },
): { appointment?: Appointment; error?: string } {
  const appointments = getStoredAppointments()
  const current = appointments.find((appointment) => appointment.id === id)
  if (!current) return { error: 'Appointment was not found.' }
  if (context.expectedUpdatedAt && current.updatedAt !== context.expectedUpdatedAt) {
    return { error: 'This appointment has already been updated. Refresh and try again.' }
  }
  if (!current.branchId) return { error: 'Appointment must have a branch before changing dentist.' }
  if (checkScheduleConflict(current.date, current.startTime, current.endTime, id, providerId, current.branchId)) {
    return { error: 'The selected dentist is no longer available for this appointment time.' }
  }

  const updated = updateAppointment(id, { providerId })
  if (!updated) return { error: 'Unable to change dentist assignment.' }

  appendAppointmentHistory({
    id: `appt-history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    appointmentId: updated.id,
    appointmentNumber: updated.appointmentNumber,
    eventType: 'provider_changed',
    changedBy: context.actor,
    changedAt: updated.updatedAt,
    reason: context.reason,
    notes: context.notes,
    metadata: {
      oldProviderId: current.providerId,
      newProviderId: providerId,
    },
  })

  return { appointment: updated }
}

export function deleteAppointment(id: string): boolean {
  const appointments = getStoredAppointments()
  const index = appointments.findIndex((appt) => appt.id === id)

  if (index === -1) {
    return false
  }

  appointments.splice(index, 1)
  saveStoredAppointments(appointments)
  return true
}

export function searchAppointments(query: string): Appointment[] {
  if (!query.trim()) {
    return getStoredAppointments()
  }

  const lower = query.toLowerCase()
  return getStoredAppointments().filter((appt) => {
    return appt.id.toLowerCase().includes(lower) || appt.notes.toLowerCase().includes(lower)
  })
}

export function filterAppointments(
  appointments: Appointment[],
  filters: {
    status?: string
    dateFrom?: string
    dateTo?: string
    patientId?: string
    branchId?: string
    providerId?: string
  }
): Appointment[] {
  let result = appointments

  if (filters.status) {
    result = result.filter((a) => a.status === filters.status)
  }

  if (filters.dateFrom) {
    result = result.filter((a) => a.date >= filters.dateFrom!)
  }

  if (filters.dateTo) {
    result = result.filter((a) => a.date <= filters.dateTo!)
  }

  if (filters.patientId) {
    result = result.filter((a) => a.patientId === filters.patientId)
  }

  if (filters.branchId) {
    result = result.filter((a) => a.branchId === filters.branchId)
  }

  if (filters.providerId) {
    result = result.filter((a) => a.providerId === filters.providerId)
  }

  return result
}

export function sortAppointments(
  appointments: Appointment[],
  key: 'date' | 'patient' | 'status',
  direction: 'asc' | 'desc'
): Appointment[] {
  const sorted = [...appointments]

  sorted.sort((a, b) => {
    let aVal: string
    let bVal: string

    switch (key) {
      case 'date':
        aVal = `${a.date}T${a.startTime}`
        bVal = `${b.date}T${b.startTime}`
        break
      case 'patient':
        aVal = a.patientId
        bVal = b.patientId
        break
      case 'status':
        aVal = a.status
        bVal = b.status
        break
      default:
        return 0
    }

    const comparison = aVal.localeCompare(bVal)
    return direction === 'asc' ? comparison : -comparison
  })

  return sorted
}

export { APPOINTMENT_STORAGE_KEY }
