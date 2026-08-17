export type AuditAction =
  | 'patient_created'
  | 'patient_updated'
  | 'dental_record_created'
  | 'dental_record_updated'
  | 'treatment_created'
  | 'invoice_created'
  | 'payment_recorded'
  | 'staff_account_changed'
  | 'settings_changed'

export function formatAuditAction(action: AuditAction) {
  const map: Record<AuditAction, { label: string; description: string }> = {
    patient_created: { label: 'Patient created', description: 'A new patient profile was created.' },
    patient_updated: { label: 'Patient updated', description: 'Patient details were updated.' },
    dental_record_created: { label: 'Dental record added', description: 'A new dental record was created.' },
    dental_record_updated: { label: 'Dental record updated', description: 'A dental record was revised.' },
    treatment_created: { label: 'Treatment recorded', description: 'A new treatment was added to care history.' },
    invoice_created: { label: 'Invoice created', description: 'A billing invoice was created.' },
    payment_recorded: { label: 'Payment received', description: 'A payment entry was recorded for a patient.' },
    staff_account_changed: { label: 'Staff account updated', description: 'A staff account was changed.' },
    settings_changed: { label: 'Settings updated', description: 'Clinic settings were updated.' },
  }

  return map[action] ?? { label: 'Activity logged', description: 'System activity was recorded.' }
}

export type AuditLogEntry = {
  id: string
  user: string
  action: AuditAction
  entity: string
  entityId: string
  timestamp: string
  metadata: Record<string, string | number | boolean | null | undefined>
}

const AUDIT_LOG_STORAGE_KEY = 'plamenco.audit.logs'

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  } as Storage
}

function getStorage(): Storage {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
    return globalThis.localStorage
  }

  const globalWithMemory = globalThis as typeof globalThis & {
    __plamencoAuditMemoryStorage?: Storage
  }

  if (globalWithMemory.__plamencoAuditMemoryStorage) {
    return globalWithMemory.__plamencoAuditMemoryStorage
  }

  const created = createMemoryStorage()
  globalWithMemory.__plamencoAuditMemoryStorage = created
  return created
}

function safeParse<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export function getStoredAuditLogs(): AuditLogEntry[] {
  const stored = safeParse<AuditLogEntry[]>(getStorage().getItem(AUDIT_LOG_STORAGE_KEY))
  return Array.isArray(stored) ? stored : []
}

export function saveStoredAuditLogs(entries: AuditLogEntry[]) {
  getStorage().setItem(AUDIT_LOG_STORAGE_KEY, JSON.stringify(entries))
}

export function recordAuditEntry({
  user,
  action,
  entity,
  entityId,
  metadata,
}: {
  user: string
  action: AuditAction
  entity: string
  entityId: string
  metadata?: Record<string, string | number | boolean | null | undefined>
}) {
  const entry: AuditLogEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    user,
    action,
    entity,
    entityId,
    timestamp: new Date().toISOString(),
    metadata: metadata ?? {},
  }

  const next = [entry, ...getStoredAuditLogs()].slice(0, 250)
  saveStoredAuditLogs(next)
  return entry
}

export function getAuditLogsByEntity(entity: string, entityId?: string) {
  return getStoredAuditLogs().filter((entry) => {
    if (entry.entity !== entity) return false
    return entityId ? entry.entityId === entityId : true
  })
}

export function getRecentAuditLogs(limit = 25) {
  return getStoredAuditLogs().slice(0, limit)
}

export { AUDIT_LOG_STORAGE_KEY }
