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
  createCommunicationDeliveryLogPersisted,
  createCommunicationOutboxEntry,
  createCommunicationOutboxEntryPersisted,
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
  'invoice.created': 'outstanding_balance',
  'invoice.paid': 'payment_received',
  'payment.submitted': 'outstanding_balance',
  'payment.confirmed': 'payment_received',
  'payment.rejected': 'outstanding_balance',
  'payment.refunded': 'payment_received',
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
  patientId?: string
  branchId?: string
  recipient: string
  subject?: string
  message: string
  deliveryLogId: string
}) {
  return createCommunicationOutboxEntry({
    deliveryLogId: params.deliveryLogId,
    channel: params.channel,
    provider: params.provider,
    patientId: params.patientId,
    branchId: params.branchId,
    payload: {
      recipient: params.recipient,
      subject: params.subject,
      message: params.message,
    },
    status: 'queued',
    nextAttemptAt: new Date().toISOString(),
  })
}

function queueServerSideDeliveryPersisted(params: {
  channel: CommunicationChannel
  provider: string
  patientId?: string
  branchId?: string
  recipient: string
  subject?: string
  message: string
  deliveryLogId: string
}) {
  return createCommunicationOutboxEntryPersisted({
    deliveryLogId: params.deliveryLogId,
    channel: params.channel,
    provider: params.provider,
    patientId: params.patientId,
    branchId: params.branchId,
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
        branchId: event.appointment.branchId,
        appointmentId: event.appointment.id,
        relatedType: 'appointment',
        relatedId: event.appointment.id,
        channel,
        templateKey: event.templateKey,
        recipient: channelAvailability?.recipient ?? '',
        subject: rendered.subject,
        message: rendered.body,
        status: 'skipped',
        provider,
        dispatchMode: event.manual ? 'manual' : 'automated',
        sentBy: event.manual ? event.actor : undefined,
        businessEvent: event.templateKey,
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
        branchId: event.appointment.branchId,
        appointmentId: event.appointment.id,
        relatedType: 'appointment',
        relatedId: event.appointment.id,
        channel,
        templateKey: event.templateKey,
        recipient: getPatientNotificationUserId(patient),
        subject: rendered.title,
        message: rendered.body,
        status: 'sent',
        provider,
        sentAt: new Date().toISOString(),
        dispatchMode: event.manual ? 'manual' : 'automated',
        sentBy: event.manual ? event.actor : undefined,
        businessEvent: event.templateKey,
        idempotencyKey,
      }))
      continue
    }

    if (!isProviderConfigured(channel)) {
      logs.push(createCommunicationDeliveryLog({
        patientId: patient.patientId,
        branchId: event.appointment.branchId,
        appointmentId: event.appointment.id,
        relatedType: 'appointment',
        relatedId: event.appointment.id,
        channel,
        templateKey: event.templateKey,
        recipient: channelAvailability.recipient,
        subject: rendered.subject,
        message: rendered.body,
        status: 'skipped',
        provider,
        dispatchMode: event.manual ? 'manual' : 'automated',
        sentBy: event.manual ? event.actor : undefined,
        businessEvent: event.templateKey,
        failureReason: `${channelAvailability.label} provider is not configured server-side.`,
        idempotencyKey,
      }))
      continue
    }

    const log = createCommunicationDeliveryLog({
      patientId: patient.patientId,
      branchId: event.appointment.branchId,
      appointmentId: event.appointment.id,
      relatedType: 'appointment',
      relatedId: event.appointment.id,
      channel,
      templateKey: event.templateKey,
      recipient: channelAvailability.recipient,
      subject: rendered.subject,
      message: rendered.body,
      status: 'queued',
      provider,
      queuedAt: new Date().toISOString(),
      dispatchMode: event.manual ? 'manual' : 'automated',
      sentBy: event.manual ? event.actor : undefined,
      businessEvent: event.templateKey,
      idempotencyKey,
    })
    queueServerSideDelivery({
      channel,
      provider,
      patientId: patient.patientId,
      branchId: event.appointment.branchId,
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

export async function sendAppointmentCommunicationPersisted(event: AppointmentCommunicationEvent) {
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
      logs.push(await createCommunicationDeliveryLogPersisted({
        patientId: patient.patientId,
        branchId: event.appointment.branchId,
        appointmentId: event.appointment.id,
        relatedType: 'appointment',
        relatedId: event.appointment.id,
        channel,
        templateKey: event.templateKey,
        recipient: channelAvailability?.recipient ?? '',
        subject: rendered.subject,
        message: rendered.body,
        status: 'skipped',
        provider,
        dispatchMode: event.manual ? 'manual' : 'automated',
        sentBy: event.manual ? event.actor : undefined,
        businessEvent: event.templateKey,
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
      logs.push(await createCommunicationDeliveryLogPersisted({
        patientId: patient.patientId,
        branchId: event.appointment.branchId,
        appointmentId: event.appointment.id,
        relatedType: 'appointment',
        relatedId: event.appointment.id,
        channel,
        templateKey: event.templateKey,
        recipient: getPatientNotificationUserId(patient),
        subject: rendered.title,
        message: rendered.body,
        status: 'sent',
        provider,
        sentAt: new Date().toISOString(),
        dispatchMode: event.manual ? 'manual' : 'automated',
        sentBy: event.manual ? event.actor : undefined,
        businessEvent: event.templateKey,
        idempotencyKey,
      }))
      continue
    }

    if (!isProviderConfigured(channel)) {
      logs.push(await createCommunicationDeliveryLogPersisted({
        patientId: patient.patientId,
        branchId: event.appointment.branchId,
        appointmentId: event.appointment.id,
        relatedType: 'appointment',
        relatedId: event.appointment.id,
        channel,
        templateKey: event.templateKey,
        recipient: channelAvailability.recipient,
        subject: rendered.subject,
        message: rendered.body,
        status: 'skipped',
        provider,
        dispatchMode: event.manual ? 'manual' : 'automated',
        sentBy: event.manual ? event.actor : undefined,
        businessEvent: event.templateKey,
        failureReason: `${channelAvailability.label} provider is not configured server-side.`,
        idempotencyKey,
      }))
      continue
    }

    const log = await createCommunicationDeliveryLogPersisted({
      patientId: patient.patientId,
      branchId: event.appointment.branchId,
      appointmentId: event.appointment.id,
      relatedType: 'appointment',
      relatedId: event.appointment.id,
      channel,
      templateKey: event.templateKey,
      recipient: channelAvailability.recipient,
      subject: rendered.subject,
      message: rendered.body,
      status: 'queued',
      provider,
      queuedAt: new Date().toISOString(),
      dispatchMode: event.manual ? 'manual' : 'automated',
      sentBy: event.manual ? event.actor : undefined,
      businessEvent: event.templateKey,
      idempotencyKey,
    })
    await queueServerSideDeliveryPersisted({
      channel,
      provider,
      patientId: patient.patientId,
      branchId: event.appointment.branchId,
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

function getManualTemplateVariables(patient: Patient) {
  return {
    first_name: patient.firstName || patient.fullName?.split(' ')[0] || 'Patient',
    appointment_number: '',
    appointment_date: '',
    appointment_time: '',
    branch_name: 'Plamenco Dental Co.',
    dentist_name: '',
    service_name: '',
    appointment_status: '',
    clinic_name: clinicName,
    estimated_price: '',
    old_appointment_date: '',
    old_appointment_time: '',
    reason: '',
    portal_guidance: 'Please contact the clinic for assistance.',
  }
}

export function sendManualPatientCommunication(input: {
  patientId: string
  templateKey: CommunicationTemplateKey
  actor: string
  branchId?: string
  channels?: CommunicationChannel[]
  subjectOverride?: string
  messageOverride?: string
  relatedType?: 'patient' | 'appointment' | 'payment' | 'invoice' | 'manual'
  relatedId?: string
}) {
  const patient = getStoredPatients().find((entry) => entry.patientId === input.patientId)
  if (!patient) throw new Error('Patient not found.')
  const settings = getCommunicationSettings()
  const preference = getCommunicationPreference(patient.patientId)
  const availability = getChannelAvailability(patient, preference)
  const channels = input.channels?.length ? input.channels : getOrderedChannels(preference, settings.defaultChannels)
  const logs = []

  for (const channel of channels) {
    const channelAvailability = availability.find((entry) => entry.channel === channel)
    const template = getCommunicationTemplate(input.templateKey, channel)
    if (!template && !input.messageOverride) continue
    const rendered = template ? renderCommunicationTemplate(template, getManualTemplateVariables(patient)) : { title: 'Manual message', subject: input.subjectOverride, body: input.messageOverride ?? '' }
    const subject = input.subjectOverride ?? rendered.subject
    const message = input.messageOverride ?? rendered.body
    const provider = getProviderName(channel)
    const idempotencyKey = `manual:${patient.patientId}:${input.templateKey}:${channel}:${Date.now()}`

    if (!channelAvailability?.available) {
      logs.push(createCommunicationDeliveryLog({
        patientId: patient.patientId,
        branchId: input.branchId,
        relatedType: input.relatedType ?? 'manual',
        relatedId: input.relatedId,
        channel,
        templateKey: input.templateKey,
        recipient: channelAvailability?.recipient ?? '',
        subject,
        message,
        status: 'skipped',
        provider,
        dispatchMode: 'manual',
        sentBy: input.actor,
        businessEvent: 'manual_message',
        failureReason: channelAvailability?.reason ?? 'Channel is unavailable',
        idempotencyKey,
      }))
      continue
    }

    if (channel === 'in_app') {
      const isPaymentTemplate = input.templateKey.startsWith('invoice.') || input.templateKey.startsWith('payment.')
      createNotification({
        userId: getPatientNotificationUserId(patient),
        kind: isPaymentTemplate ? 'payment' : 'appointment',
        action: notificationActionByTemplate[input.templateKey],
        title: rendered.title,
        message,
        priority: 'normal',
        relatedId: input.relatedId ?? patient.patientId,
      })
      logs.push(createCommunicationDeliveryLog({
        patientId: patient.patientId,
        branchId: input.branchId,
        relatedType: input.relatedType ?? 'manual',
        relatedId: input.relatedId,
        channel,
        templateKey: input.templateKey,
        recipient: getPatientNotificationUserId(patient),
        subject: rendered.title,
        message,
        status: 'sent',
        provider,
        sentAt: new Date().toISOString(),
        dispatchMode: 'manual',
        sentBy: input.actor,
        businessEvent: 'manual_message',
        idempotencyKey,
      }))
      continue
    }

    if (!isProviderConfigured(channel)) {
      logs.push(createCommunicationDeliveryLog({
        patientId: patient.patientId,
        branchId: input.branchId,
        relatedType: input.relatedType ?? 'manual',
        relatedId: input.relatedId,
        channel,
        templateKey: input.templateKey,
        recipient: channelAvailability.recipient,
        subject,
        message,
        status: 'skipped',
        provider,
        dispatchMode: 'manual',
        sentBy: input.actor,
        businessEvent: 'manual_message',
        failureReason: `${channelAvailability.label} provider is not configured server-side.`,
        idempotencyKey,
      }))
      continue
    }

    const log = createCommunicationDeliveryLog({
      patientId: patient.patientId,
      branchId: input.branchId,
      relatedType: input.relatedType ?? 'manual',
      relatedId: input.relatedId,
      channel,
      templateKey: input.templateKey,
      recipient: channelAvailability.recipient,
      subject,
      message,
      status: 'queued',
      provider,
      queuedAt: new Date().toISOString(),
      dispatchMode: 'manual',
      sentBy: input.actor,
      businessEvent: 'manual_message',
      idempotencyKey,
    })
    queueServerSideDelivery({ channel, provider, patientId: patient.patientId, branchId: input.branchId, recipient: channelAvailability.recipient, subject, message, deliveryLogId: log.id })
    logs.push(log)
  }

  recordAuditEntry({
    user: input.actor,
    action: 'communication_manual_resend',
    entity: 'patient',
    entityId: patient.patientId,
    metadata: { templateKey: input.templateKey, channelCount: logs.length, relatedType: input.relatedType ?? 'manual' },
  })

  return logs
}
