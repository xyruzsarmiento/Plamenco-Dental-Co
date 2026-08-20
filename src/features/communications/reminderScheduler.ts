import { getStoredAppointments } from '../appointments/appointmentStore'
import type { Appointment } from '../appointments/appointmentTypes'
import { getCommunicationDeliveryLogs, getCommunicationSettings } from './communicationStore'
import { sendAppointmentCommunication } from './communicationService'

function getManilaAppointmentDate(appointment: Appointment) {
  const parsed = new Date(`${appointment.date}T${appointment.startTime}:00+08:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function hasReminderRecord(appointmentId: string, offsetHours: number) {
  const needle = `${appointmentId}:appointment_reminder:${offsetHours}h:`
  return getCommunicationDeliveryLogs().some((log) => log.idempotencyKey.includes(needle))
}

export type AppointmentReminderPreview = {
  appointment: Appointment
  offsetHours: number
  dueAt: string
  appointmentAt: string
  alreadyQueued: boolean
  isDue: boolean
  isExpired: boolean
}

export function previewEligibleAppointmentReminders(now = new Date()): AppointmentReminderPreview[] {
  const settings = getCommunicationSettings()

  return getStoredAppointments()
    .filter((appointment) => appointment.status === 'confirmed')
    .flatMap((appointment) => {
      const appointmentDate = getManilaAppointmentDate(appointment)
      if (!appointmentDate) return []

      return settings.reminderOffsetsHours.map((offsetHours) => {
        const dueAt = new Date(appointmentDate.getTime() - offsetHours * 60 * 60 * 1000)
        const alreadyQueued = hasReminderRecord(appointment.id, offsetHours)
        const isExpired = now >= appointmentDate
        return {
          appointment,
          offsetHours,
          dueAt: dueAt.toISOString(),
          appointmentAt: appointmentDate.toISOString(),
          alreadyQueued,
          isDue: !isExpired && !alreadyQueued && now >= dueAt,
          isExpired,
        }
      })
    })
}

/**
 * Queues at most one reminder offset per appointment per scan.
 *
 * A browser/manual scan can run later than the exact reminder minute, so due reminders
 * remain eligible until the appointment starts. When multiple configured offsets were
 * missed, only the most recent due offset is queued to avoid sending several stale
 * reminders at once. Idempotency remains enforced by the communication delivery log.
 */
export function queueAppointmentReminders(now = new Date(), actor = 'communication-scheduler') {
  const dueByAppointment = new Map<string, AppointmentReminderPreview[]>()

  for (const preview of previewEligibleAppointmentReminders(now)) {
    if (!preview.isDue) continue
    const current = dueByAppointment.get(preview.appointment.id) ?? []
    current.push(preview)
    dueByAppointment.set(preview.appointment.id, current)
  }

  const queued: ReturnType<typeof sendAppointmentCommunication> = []

  for (const candidates of dueByAppointment.values()) {
    // The most recent configured reminder is the smallest offset that is already due.
    const reminder = [...candidates].sort((a, b) => a.offsetHours - b.offsetHours)[0]
    if (!reminder) continue

    queued.push(...sendAppointmentCommunication({
      appointment: reminder.appointment,
      templateKey: 'appointment_reminder',
      actor,
      reminderOffsetHours: reminder.offsetHours,
    }))
  }

  return queued
}
