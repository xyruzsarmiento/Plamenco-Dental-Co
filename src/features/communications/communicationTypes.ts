import type { Appointment } from '../appointments/appointmentTypes'

export type CommunicationChannel = 'sms' | 'email' | 'messenger' | 'in_app'

export type CommunicationTemplateKey =
  | 'appointment_requested'
  | 'appointment_confirmed'
  | 'appointment_rejected'
  | 'appointment_rescheduled'
  | 'appointment_cancelled'
  | 'appointment_reminder'
  | 'appointment_no_show'
  | 'no_show_follow_up'

export type CommunicationStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'skipped'

export type CommunicationPreference = {
  patientId: string
  smsEnabled: boolean
  emailEnabled: boolean
  messengerEnabled: boolean
  inAppEnabled: boolean
  preferredChannel: CommunicationChannel
  messengerRecipientId?: string
  messengerConnectedAt?: string
  consentUpdatedAt?: string
  consentUpdatedBy?: string
  createdAt: string
  updatedAt: string
}

export type ChannelAvailability = {
  channel: CommunicationChannel
  label: string
  enabled: boolean
  available: boolean
  recipient: string
  reason?: string
}

export type CommunicationTemplate = {
  key: CommunicationTemplateKey
  channel: CommunicationChannel
  title: string
  subject?: string
  body: string
  updatedAt: string
  updatedBy: string
}

export type CommunicationDeliveryLog = {
  id: string
  patientId: string
  appointmentId?: string
  channel: CommunicationChannel
  templateKey: CommunicationTemplateKey
  recipient: string
  subject?: string
  message: string
  status: CommunicationStatus
  provider: string
  providerMessageId?: string
  attemptCount: number
  idempotencyKey: string
  queuedAt?: string
  sentAt?: string
  deliveredAt?: string
  failedAt?: string
  failureReason?: string
  createdAt: string
  updatedAt: string
}

export type CommunicationOutboxEntry = {
  id: string
  deliveryLogId: string
  channel: CommunicationChannel
  provider: string
  payload: Record<string, string | number | boolean | null | undefined>
  status: 'queued' | 'processing' | 'sent' | 'failed'
  attempts: number
  nextAttemptAt: string
  createdAt: string
  updatedAt: string
}

export type CommunicationSettings = {
  smsProvider: 'semaphore'
  smsSenderName: string
  smsConfigured: boolean
  emailProvider: 'supabase_edge_function' | 'not_configured'
  emailConfigured: boolean
  messengerProvider: 'meta_messenger'
  messengerConfigured: boolean
  defaultChannels: CommunicationChannel[]
  reminderOffsetsHours: number[]
  maxRetryAttempts: number
  timezone: 'Asia/Manila'
  updatedAt: string
  updatedBy: string
}

export type AppointmentCommunicationEvent = {
  appointment: Appointment
  templateKey: CommunicationTemplateKey
  actor: string
  reason?: string
  oldAppointment?: Appointment
  reminderOffsetHours?: number
  manual?: boolean
}
