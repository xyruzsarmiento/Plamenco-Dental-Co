import { insertRemoteTableRow, updateRemoteTableRow } from '../../lib/supabaseSync'
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
    createdAt: now,
    updatedAt: now,
    ...input,
  }

  saveCommunicationDeliveryLogs([log, ...getCommunicationDeliveryLogs()])
  void insertRemoteTableRow('communication_delivery_logs', mapDeliveryLogToRemoteRow(log))
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
    payload: entry.payload,
    status: entry.status,
    attempts: entry.attempts,
    next_attempt_at: entry.nextAttemptAt,
  })
  return entry
}

function mapDeliveryLogToRemoteRow(log: CommunicationDeliveryLog) {
  return {
    id: log.id,
    patient_id: log.patientId,
    appointment_id: log.appointmentId ?? null,
    channel: log.channel,
    template_key: log.templateKey,
    recipient: log.recipient,
    subject: log.subject ?? '',
    message: log.message,
    status: log.status,
    provider: log.provider,
    provider_message_id: log.providerMessageId ?? '',
    attempt_count: log.attemptCount,
    idempotency_key: log.idempotencyKey,
    queued_at: log.queuedAt ?? null,
    sent_at: log.sentAt ?? null,
    delivered_at: log.deliveredAt ?? null,
    failed_at: log.failedAt ?? null,
    failure_reason: log.failureReason ?? '',
  }
}

export { DELIVERY_LOG_STORAGE_KEY, OUTBOX_STORAGE_KEY, SETTINGS_STORAGE_KEY }
