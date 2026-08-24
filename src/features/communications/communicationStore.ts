import { insertRemoteTableRow, updateRemoteTableRow } from '../../lib/supabaseSync'
import { isSupabaseConfigured } from '../../lib/supabase'
import type {
  CommunicationDeliveryLog,
  CommunicationOutboxEntry,
  CommunicationSettings,
} from './communicationTypes'

const DELIVERY_LOG_STORAGE_KEY = 'plamenco.communication.deliveryLogs'
const OUTBOX_STORAGE_KEY = 'plamenco.communication.outbox'
const SETTINGS_STORAGE_KEY = 'plamenco.communication.settings'

const nowIso = () => new Date().toISOString()

const defaultSettings: CommunicationSettings = {
  smsProvider: 'semaphore',
  smsSenderName: 'PLAMENCO',
  smsConfigured: false,
  emailProvider: 'not_configured',
  emailConfigured: false,
  messengerProvider: 'meta_messenger',
  messengerConfigured: false,
  defaultChannels: ['in_app', 'sms', 'email', 'messenger'],
  reminderOffsetsHours: [48, 24, 2],
  maxRetryAttempts: 3,
  timezone: 'Asia/Manila',
  updatedAt: nowIso(),
  updatedBy: 'system',
}

function getStorage(): Storage {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) return globalThis.localStorage
  const globalWithMemory = globalThis as typeof globalThis & { __plamencoCommunicationStorage?: Storage }
  if (globalWithMemory.__plamencoCommunicationStorage) return globalWithMemory.__plamencoCommunicationStorage
  const store = new Map<string, string>()
  const memory = {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  } as Storage
  globalWithMemory.__plamencoCommunicationStorage = memory
  return memory
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

function safeParseSettings(value: string | null): CommunicationSettings | null {
  if (!value) return null
  try {
    return JSON.parse(value) as CommunicationSettings
  } catch {
    return null
  }
}

export function getCommunicationSettings(): CommunicationSettings {
  return safeParseSettings(getStorage().getItem(SETTINGS_STORAGE_KEY)) ?? defaultSettings
}

export function saveCommunicationSettings(settings: CommunicationSettings) {
  getStorage().setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  return settings
}

export function getCommunicationDeliveryLogs(): CommunicationDeliveryLog[] {
  return safeParseList<CommunicationDeliveryLog>(getStorage().getItem(DELIVERY_LOG_STORAGE_KEY))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function saveCommunicationDeliveryLogs(logs: CommunicationDeliveryLog[]) {
  getStorage().setItem(DELIVERY_LOG_STORAGE_KEY, JSON.stringify(logs.slice(0, 2000)))
}

export function getCommunicationLogsByPatient(patientId: string) {
  return getCommunicationDeliveryLogs().filter((log) => log.patientId === patientId)
}

export function getCommunicationLogsByAppointment(appointmentId: string) {
  return getCommunicationDeliveryLogs().filter((log) => log.appointmentId === appointmentId)
}

export function findCommunicationLogByIdempotencyKey(idempotencyKey: string) {
  return getCommunicationDeliveryLogs().find((log) => log.idempotencyKey === idempotencyKey)
}

export function createCommunicationDeliveryLog(
  input: Omit<CommunicationDeliveryLog, 'id' | 'attemptCount' | 'createdAt' | 'updatedAt'> & { attemptCount?: number },
) {
  const now = nowIso()
  const existing = findCommunicationLogByIdempotencyKey(input.idempotencyKey)
  if (existing) return existing

  const log: CommunicationDeliveryLog = {
    id: `comm-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    attemptCount: input.attemptCount ?? 0,
    maxAttempts: input.maxAttempts ?? getCommunicationSettings().maxRetryAttempts,
    dispatchMode: input.dispatchMode ?? 'automated',
    createdAt: now,
    updatedAt: now,
    ...input,
  }

  saveCommunicationDeliveryLogs([log, ...getCommunicationDeliveryLogs()])
  void insertRemoteTableRow('communication_delivery_logs', mapDeliveryLogToRemoteRow(log))
  return log
}

export async function createCommunicationDeliveryLogPersisted(
  input: Omit<CommunicationDeliveryLog, 'id' | 'attemptCount' | 'createdAt' | 'updatedAt'> & { attemptCount?: number },
) {
  const now = nowIso()
  const existing = findCommunicationLogByIdempotencyKey(input.idempotencyKey)
  if (existing) return existing

  const log: CommunicationDeliveryLog = {
    id: `comm-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    attemptCount: input.attemptCount ?? 0,
    maxAttempts: input.maxAttempts ?? getCommunicationSettings().maxRetryAttempts,
    dispatchMode: input.dispatchMode ?? 'automated',
    createdAt: now,
    updatedAt: now,
    ...input,
  }

  const remote = await insertRemoteTableRow('communication_delivery_logs', mapDeliveryLogToRemoteRow(log))
  if (isSupabaseConfigured && !remote) throw new Error('Communication log could not be saved to Supabase.')
  saveCommunicationDeliveryLogs([log, ...getCommunicationDeliveryLogs()])
  return log
}

export function updateCommunicationDeliveryLog(id: string, updates: Partial<CommunicationDeliveryLog>) {
  const logs = getCommunicationDeliveryLogs()
  const index = logs.findIndex((log) => log.id === id)
  if (index === -1) return null

  const updated = { ...logs[index], ...updates, updatedAt: nowIso() }
  logs[index] = updated
  saveCommunicationDeliveryLogs(logs)
  void updateRemoteTableRow('communication_delivery_logs', id, mapDeliveryLogToRemoteRow(updated))
  return updated
}

export function getCommunicationOutbox(): CommunicationOutboxEntry[] {
  return safeParseList<CommunicationOutboxEntry>(getStorage().getItem(OUTBOX_STORAGE_KEY))
    .sort((a, b) => new Date(a.nextAttemptAt).getTime() - new Date(b.nextAttemptAt).getTime())
}

export function saveCommunicationOutbox(entries: CommunicationOutboxEntry[]) {
  getStorage().setItem(OUTBOX_STORAGE_KEY, JSON.stringify(entries.slice(0, 2000)))
}

export function createCommunicationOutboxEntry(input: Omit<CommunicationOutboxEntry, 'id' | 'attempts' | 'createdAt' | 'updatedAt'>) {
  const now = nowIso()
  const entry: CommunicationOutboxEntry = {
    id: `comm-outbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    attempts: 0,
    maxAttempts: input.maxAttempts ?? getCommunicationSettings().maxRetryAttempts,
    createdAt: now,
    updatedAt: now,
    ...input,
  }
  saveCommunicationOutbox([entry, ...getCommunicationOutbox()])
  void insertRemoteTableRow('communication_outbox', {
    id: entry.id,
    delivery_log_id: entry.deliveryLogId,
    channel: entry.channel,
    provider: entry.provider,
    patient_id: entry.patientId ?? null,
    branch_id: entry.branchId ?? null,
    payload: entry.payload,
    status: entry.status,
    attempts: entry.attempts,
    max_attempts: entry.maxAttempts ?? null,
    next_attempt_at: entry.nextAttemptAt,
  })
  return entry
}

export async function createCommunicationOutboxEntryPersisted(input: Omit<CommunicationOutboxEntry, 'id' | 'attempts' | 'createdAt' | 'updatedAt'>) {
  const now = nowIso()
  const entry: CommunicationOutboxEntry = {
    id: `comm-outbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    attempts: 0,
    maxAttempts: input.maxAttempts ?? getCommunicationSettings().maxRetryAttempts,
    createdAt: now,
    updatedAt: now,
    ...input,
  }
  const remote = await insertRemoteTableRow('communication_outbox', {
    id: entry.id,
    delivery_log_id: entry.deliveryLogId,
    channel: entry.channel,
    provider: entry.provider,
    patient_id: entry.patientId ?? null,
    branch_id: entry.branchId ?? null,
    payload: entry.payload,
    status: entry.status,
    attempts: entry.attempts,
    max_attempts: entry.maxAttempts ?? null,
    next_attempt_at: entry.nextAttemptAt,
  })
  if (isSupabaseConfigured && !remote) throw new Error('Communication outbox job could not be saved to Supabase.')
  saveCommunicationOutbox([entry, ...getCommunicationOutbox()])
  return entry
}

export function updateCommunicationOutboxEntry(id: string, updates: Partial<CommunicationOutboxEntry>) {
  const entries = getCommunicationOutbox()
  const index = entries.findIndex((entry) => entry.id === id)
  if (index === -1) return null
  const updated = { ...entries[index], ...updates, updatedAt: nowIso() }
  entries[index] = updated
  saveCommunicationOutbox(entries)
  void updateRemoteTableRow('communication_outbox', id, {
    delivery_log_id: updated.deliveryLogId,
    channel: updated.channel,
    provider: updated.provider,
    patient_id: updated.patientId ?? null,
    branch_id: updated.branchId ?? null,
    payload: updated.payload,
    status: updated.status,
    attempts: updated.attempts,
    max_attempts: updated.maxAttempts ?? null,
    next_attempt_at: updated.nextAttemptAt,
  })
  return updated
}

export function retryCommunicationDelivery(logId: string, actor: string) {
  const log = getCommunicationDeliveryLogs().find((entry) => entry.id === logId)
  if (!log) throw new Error('Communication delivery log not found.')
  if (!['failed', 'queued', 'sending'].includes(log.status)) throw new Error('Only failed or queued communications can be retried.')
  const settings = getCommunicationSettings()
  const nextAttemptAt = new Date().toISOString()
  const updatedLog = updateCommunicationDeliveryLog(log.id, {
    status: 'queued',
    queuedAt: nextAttemptAt,
    failedAt: undefined,
    nextRetryAt: nextAttemptAt,
    lastRetryAt: nextAttemptAt,
    failureReason: '',
    attemptCount: log.attemptCount + 1,
  }) ?? log
  const existingOutbox = getCommunicationOutbox().find((entry) => entry.deliveryLogId === log.id && entry.status !== 'sent')
  if (existingOutbox) {
    updateCommunicationOutboxEntry(existingOutbox.id, {
      status: 'queued',
      attempts: existingOutbox.attempts + 1,
      nextAttemptAt,
    })
  } else {
    createCommunicationOutboxEntry({
      deliveryLogId: log.id,
      channel: log.channel,
      provider: log.provider,
      patientId: log.patientId,
      branchId: log.branchId,
      payload: {
        recipient: log.recipient,
        subject: log.subject,
        message: log.message,
      },
      status: 'queued',
      maxAttempts: log.maxAttempts ?? settings.maxRetryAttempts,
      nextAttemptAt,
    })
  }
  return updateCommunicationDeliveryLog(updatedLog.id, { businessEvent: updatedLog.businessEvent ?? `retry_requested_by:${actor}` }) ?? updatedLog
}

function mapDeliveryLogToRemoteRow(log: CommunicationDeliveryLog) {
  return {
    id: log.id,
    patient_id: log.patientId,
    branch_id: log.branchId ?? null,
    appointment_id: log.appointmentId ?? null,
    payment_id: log.paymentId ?? null,
    related_type: log.relatedType ?? null,
    related_id: log.relatedId ?? null,
    channel: log.channel,
    template_key: log.templateKey,
    recipient: log.recipient,
    subject: log.subject ?? '',
    message: log.message,
    status: log.status,
    provider: log.provider,
    provider_message_id: log.providerMessageId ?? '',
    attempt_count: log.attemptCount,
    max_attempts: log.maxAttempts ?? null,
    idempotency_key: log.idempotencyKey,
    dispatch_mode: log.dispatchMode ?? 'automated',
    sent_by: log.sentBy ?? '',
    business_event: log.businessEvent ?? '',
    queued_at: log.queuedAt ?? null,
    sent_at: log.sentAt ?? null,
    delivered_at: log.deliveredAt ?? null,
    failed_at: log.failedAt ?? null,
    next_retry_at: log.nextRetryAt ?? null,
    last_retry_at: log.lastRetryAt ?? null,
    failure_reason: log.failureReason ?? '',
  }
}

export { DELIVERY_LOG_STORAGE_KEY, OUTBOX_STORAGE_KEY, SETTINGS_STORAGE_KEY }
