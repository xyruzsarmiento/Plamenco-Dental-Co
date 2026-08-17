export type AuditAction =
  | 'patient_created'
  | 'patient_updated'
  | 'patient_import_completed'
  | 'appointment_status_changed'
  | 'communication_preference_changed'
  | 'communication_template_updated'
  | 'communication_manual_resend'
  | 'communication_settings_changed'
  | 'clinical_record_created'
  | 'clinical_record_draft_updated'
  | 'clinical_record_finalized'
  | 'clinical_record_amendment_added'
  | 'prescription_created'
  | 'clinical_document_uploaded'
  | 'dental_record_created'
  | 'dental_record_updated'
  | 'treatment_created'
  | 'invoice_created'
  | 'payment_recorded'
  | 'staff_account_changed'
  | 'provider_created'
  | 'provider_updated'
  | 'provider_branch_assignment_changed'
  | 'provider_schedule_updated'
  | 'provider_availability_changed'
  | 'branch_updated'
  | 'settings_changed'

export function formatAuditAction(action: AuditAction) {
  const map: Record<AuditAction, { label: string; description: string }> = {
    patient_created: { label: 'Patient created', description: 'A new patient profile was created.' },
    patient_updated: { label: 'Patient updated', description: 'Patient details were updated.' },
    patient_import_completed: { label: 'Patient import completed', description: 'A historical patient import batch was confirmed.' },
    appointment_status_changed: { label: 'Appointment status changed', description: 'An appointment moved through the clinic workflow.' },
    communication_preference_changed: { label: 'Communication preference changed', description: 'A patient communication preference was updated.' },
    communication_template_updated: { label: 'Communication template updated', description: 'A communication template was revised.' },
    communication_manual_resend: { label: 'Communication resend triggered', description: 'A user manually requested a patient communication.' },
    communication_settings_changed: { label: 'Communication settings updated', description: 'Communication integration settings were changed.' },
    clinical_record_created: { label: 'Clinical record created', description: 'A clinical visit record was created.' },
    clinical_record_draft_updated: { label: 'Clinical record draft updated', description: 'A draft clinical visit was updated.' },
    clinical_record_finalized: { label: 'Clinical record finalized', description: 'A clinical visit record was finalized.' },
    clinical_record_amendment_added: { label: 'Clinical amendment added', description: 'An amendment was added to a finalized clinical record.' },
    prescription_created: { label: 'Prescription created', description: 'A provider created a prescription.' },
    clinical_document_uploaded: { label: 'Clinical document uploaded', description: 'A clinical document was attached to patient care history.' },
    dental_record_created: { label: 'Dental record added', description: 'A new dental record was created.' },
    dental_record_updated: { label: 'Dental record updated', description: 'A dental record was revised.' },
    treatment_created: { label: 'Treatment recorded', description: 'A new treatment was added to care history.' },
    invoice_created: { label: 'Invoice created', description: 'A billing invoice was created.' },
    payment_recorded: { label: 'Payment received', description: 'A payment entry was recorded for a patient.' },
    staff_account_changed: { label: 'Staff account updated', description: 'A staff account was changed.' },
    provider_created: { label: 'Dentist account created', description: 'A provider profile was created.' },
    provider_updated: { label: 'Dentist account updated', description: 'A provider profile was updated.' },
    provider_branch_assignment_changed: { label: 'Dentist branch assignment updated', description: 'A provider branch assignment changed.' },
    provider_schedule_updated: { label: 'Dentist schedule updated', description: 'A provider working schedule changed.' },
    provider_availability_changed: { label: 'Dentist availability updated', description: 'A provider availability exception changed.' },
    branch_updated: { label: 'Branch information updated', description: 'A clinic branch was updated.' },
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
