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

export function queueAppointmentReminders(now = new Date(), actor = 'communication-scheduler') {
  const settings = getCommunicationSettings()
  const appointments = getStoredAppointments().filter((appointment) => appointment.status === 'confirmed')
  const queued: ReturnType<typeof sendAppointmentCommunication> = []

  for (const appointment of appointments) {
    const appointmentDate = getManilaAppointmentDate(appointment)
    if (!appointmentDate) continue

    for (const offsetHours of settings.reminderOffsetsHours) {
      const reminderDue = new Date(appointmentDate.getTime() - offsetHours * 60 * 60 * 1000)
      const windowStart = new Date(reminderDue.getTime() - 15 * 60 * 1000)
      const windowEnd = new Date(reminderDue.getTime() + 15 * 60 * 1000)

      if (now < windowStart || now > windowEnd || hasReminderRecord(appointment.id, offsetHours)) continue

      queued.push(...sendAppointmentCommunication({
        appointment,
        templateKey: 'appointment_reminder',
        actor,
        reminderOffsetHours: offsetHours,
      }))
    }
  }

  return queued
}

export function previewEligibleAppointmentReminders(now = new Date()) {
  const settings = getCommunicationSettings()
  return getStoredAppointments()
    .filter((appointment) => appointment.status === 'confirmed')
    .flatMap((appointment) => {
      const appointmentDate = getManilaAppointmentDate(appointment)
      if (!appointmentDate) return []
      return settings.reminderOffsetsHours.map((offsetHours) => ({
        appointment,
        offsetHours,
        dueAt: new Date(appointmentDate.getTime() - offsetHours * 60 * 60 * 1000).toISOString(),
        alreadyQueued: hasReminderRecord(appointment.id, offsetHours),
        isDue: now >= new Date(appointmentDate.getTime() - offsetHours * 60 * 60 * 1000),
      }))
    })
}
