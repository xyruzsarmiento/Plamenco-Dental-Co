import { createNotification } from '../notifications/notificationStore'
import type { NotificationAction } from '../notifications/notificationTypes'
import { getStoredBranches } from '../branches/branchStore'
import { getStoredProviders } from '../dentists/dentistStore'
import type { Appointment, AppointmentStatus } from '../appointments/appointmentTypes'
import { getStoredPatients } from '../patients/patientStore'
import type { Patient } from '../patients/patientTypes'
import { getStoredServices } from '../services/serviceStore'
import { recordAuditEntry } from '../security/auditLogStore'
import {
  createCommunicationDeliveryLog,
  createCommunicationOutboxEntry,
  getCommunicationSettings,
} from './communicationStore'
import {
  getChannelAvailability,
  getCommunicationPreference,
  getOrderedChannels,
} from './communicationPreferencesStore'
import { getCommunicationTemplate, renderCommunicationTemplate } from './communicationTemplates'
import type {
  AppointmentCommunicationEvent,
  CommunicationChannel,
  CommunicationTemplateKey,
} from './communicationTypes'

const clinicName = 'Plamenco Dental Co.'

const notificationActionByTemplate: Record<CommunicationTemplateKey, NotificationAction> = {
  appointment_requested: 'appointment_requested',
  appointment_confirmed: 'appointment_confirmed',
  appointment_rejected: 'appointment_rejected',
  appointment_rescheduled: 'appointment_rescheduled',
  appointment_cancelled: 'appointment_cancelled',
  appointment_reminder: 'appointment_reminder',
  appointment_no_show: 'appointment_no_show',
  no_show_follow_up: 'no_show_follow_up',
}

function formatAppointmentDate(date: string) {
  const parsed = new Date(`${date}T00:00:00+08:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatAppointmentTime(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  const parsed = new Date(Date.UTC(2000, 0, 1, (hour || 0) - 8, minute || 0))
  return parsed.toLocaleTimeString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatStatus(status: AppointmentStatus) {
  return status.replaceAll('_', ' ')
}

function formatCurrency(cents?: number) {
  if (!cents) return 'To be confirmed'
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100)
}

function getPatientNotificationUserId(patient: Patient) {
  return patient.authUserId || patient.patientId
}

function getAppointmentTemplateVariables(event: AppointmentCommunicationEvent, patient: Patient) {
  const branch = getStoredBranches().find((entry) => entry.id === event.appointment.branchId)
  const provider = getStoredProviders().find((entry) => entry.id === event.appointment.providerId)
  const service = getStoredServices().find((entry) => entry.id === event.appointment.serviceId)
  const oldAppointment = event.oldAppointment

  return {
    first_name: patient.firstName || patient.fullName?.split(' ')[0] || 'Patient',
    appointment_number: event.appointment.appointmentNumber ?? event.appointment.id,
    appointment_date: formatAppointmentDate(event.appointment.date),
    appointment_time: formatAppointmentTime(event.appointment.startTime),
    branch_name: branch?.name ?? 'Plamenco Dental Co.',
    dentist_name: provider?.displayName ?? 'Assigned dentist',
    service_name: service?.name ?? 'Dental service',
    appointment_status: formatStatus(event.appointment.status),
    clinic_name: clinicName,
    estimated_price: formatCurrency(event.appointment.estimatedAmountCents ?? service?.price),
    old_appointment_date: oldAppointment ? formatAppointmentDate(oldAppointment.date) : '',
    old_appointment_time: oldAppointment ? formatAppointmentTime(oldAppointment.startTime) : '',
    reason: event.reason ?? '',
    portal_guidance: 'Please use your authenticated patient portal or contact the clinic for changes.',
  }
}

function getProviderName(channel: CommunicationChannel) {
  const settings = getCommunicationSettings()
  if (channel === 'sms') return settings.smsProvider
  if (channel === 'email') return settings.emailProvider
  if (channel === 'messenger') return settings.messengerProvider
  return 'plamenco_in_app'
}

function isProviderConfigured(channel: CommunicationChannel) {
  const settings = getCommunicationSettings()
  if (channel === 'sms') return settings.smsConfigured
  if (channel === 'email') return settings.emailConfigured
  if (channel === 'messenger') return settings.messengerConfigured
  return true
}

function createIdempotencyKey(event: AppointmentCommunicationEvent, channel: CommunicationChannel) {
  const offset = event.reminderOffsetHours === undefined ? 'event' : `${event.reminderOffsetHours}h`
  const manual = event.manual ? `manual:${Date.now()}` : 'auto'
  return `${event.appointment.id}:${event.templateKey}:${offset}:${channel}:${manual}`
}

function queueServerSideDelivery(params: {
  channel: CommunicationChannel
  provider: string
  recipient: string
  subject?: string
  message: string
  deliveryLogId: string
}) {
  return createCommunicationOutboxEntry({
    deliveryLogId: params.deliveryLogId,
    channel: params.channel,
    provider: params.provider,
    payload: {
      recipient: params.recipient,
      subject: params.subject,
      message: params.message,
    },
    status: 'queued',
    nextAttemptAt: new Date().toISOString(),
  })
}

export function sendAppointmentCommunication(event: AppointmentCommunicationEvent) {
  const patient = getStoredPatients().find((entry) => entry.patientId === event.appointment.patientId)
  if (!patient) return []

  const settings = getCommunicationSettings()
  const preference = getCommunicationPreference(patient.patientId)
  const availability = getChannelAvailability(patient, preference)
  const variables = getAppointmentTemplateVariables(event, patient)
  const logs = []

  for (const channel of getOrderedChannels(preference, settings.defaultChannels)) {
    const channelAvailability = availability.find((entry) => entry.channel === channel)
    const template = getCommunicationTemplate(event.templateKey, channel)
    if (!template) continue

    const rendered = renderCommunicationTemplate(template, variables)
    const idempotencyKey = createIdempotencyKey(event, channel)
    const provider = getProviderName(channel)

    if (!channelAvailability?.available) {
      logs.push(createCommunicationDeliveryLog({
        patientId: patient.patientId,
        appointmentId: event.appointment.id,
        channel,
        templateKey: event.templateKey,
        recipient: channelAvailability?.recipient ?? '',
        subject: rendered.subject,
        message: rendered.body,
        status: 'skipped',
        provider,
        failureReason: channelAvailability?.reason ?? 'Channel is unavailable',
        idempotencyKey,
      }))
      continue
    }

    if (channel === 'in_app') {
      createNotification({
        userId: getPatientNotificationUserId(patient),
        kind: 'appointment',
        action: notificationActionByTemplate[event.templateKey],
        title: rendered.title,
        message: rendered.body,
        priority: event.templateKey === 'appointment_reminder' ? 'normal' : 'high',
        relatedId: event.appointment.id,
      })
      logs.push(createCommunicationDeliveryLog({
        patientId: patient.patientId,
        appointmentId: event.appointment.id,
        channel,
        templateKey: event.templateKey,
        recipient: getPatientNotificationUserId(patient),
        subject: rendered.title,
        message: rendered.body,
        status: 'sent',
        provider,
        sentAt: new Date().toISOString(),
        idempotencyKey,
      }))
      continue
    }

    if (!isProviderConfigured(channel)) {
      logs.push(createCommunicationDeliveryLog({
        patientId: patient.patientId,
        appointmentId: event.appointment.id,
        channel,
        templateKey: event.templateKey,
        recipient: channelAvailability.recipient,
        subject: rendered.subject,
        message: rendered.body,
        status: 'skipped',
        provider,
        failureReason: `${channelAvailability.label} provider is not configured server-side.`,
        idempotencyKey,
      }))
      continue
    }

    const log = createCommunicationDeliveryLog({
      patientId: patient.patientId,
      appointmentId: event.appointment.id,
      channel,
      templateKey: event.templateKey,
      recipient: channelAvailability.recipient,
      subject: rendered.subject,
      message: rendered.body,
      status: 'queued',
      provider,
      queuedAt: new Date().toISOString(),
      idempotencyKey,
    })
    queueServerSideDelivery({
      channel,
      provider,
      recipient: channelAvailability.recipient,
      subject: rendered.subject,
      message: rendered.body,
      deliveryLogId: log.id,
    })
    logs.push(log)
  }

  if (event.manual) {
    recordAuditEntry({
      user: event.actor,
      action: 'communication_manual_resend',
      entity: 'appointment',
      entityId: event.appointment.appointmentNumber ?? event.appointment.id,
      metadata: { templateKey: event.templateKey, appointmentId: event.appointment.id },
    })
  }

  return logs
}

export function notifyAppointmentTransition(
  appointment: Appointment,
  fromStatus: AppointmentStatus,
  toStatus: AppointmentStatus,
  context: { actor: string; reason?: string; oldAppointment?: Appointment },
) {
  if (fromStatus === 'pending' && toStatus === 'confirmed') {
    return sendAppointmentCommunication({ appointment, templateKey: 'appointment_confirmed', actor: context.actor, reason: context.reason })
  }
  if (fromStatus === 'pending' && toStatus === 'rejected') {
    return sendAppointmentCommunication({ appointment, templateKey: 'appointment_rejected', actor: context.actor, reason: context.reason })
  }
  if (toStatus === 'rescheduled') {
    return sendAppointmentCommunication({
      appointment,
      templateKey: 'appointment_rescheduled',
      actor: context.actor,
      reason: context.reason,
      oldAppointment: context.oldAppointment,
    })
  }
  if (toStatus === 'cancelled') {
    return sendAppointmentCommunication({ appointment, templateKey: 'appointment_cancelled', actor: context.actor, reason: context.reason })
  }
  if (toStatus === 'no_show') {
    sendAppointmentCommunication({ appointment, templateKey: 'appointment_no_show', actor: context.actor, reason: context.reason })
    return sendAppointmentCommunication({ appointment, templateKey: 'no_show_follow_up', actor: context.actor, reason: context.reason })
  }

  return []
}
