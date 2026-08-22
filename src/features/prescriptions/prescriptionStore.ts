import { insertRemoteTableRow } from '../../lib/supabaseSync'
import { supabase } from '../../lib/supabase'
import { getStoredBranches } from '../branches/branchStore'
import { getStoredProviders } from '../dentists/dentistStore'
import { recordAuditEntry } from '../security/auditLogStore'

export type PrescriptionStatus = 'active' | 'completed' | 'voided'

export type PrescriptionItem = {
  id: string
  medication: string
  strength: string
  dosage: string
  frequency: string
  duration: string
  instructions: string
}

export type Prescription = {
  id: string
  patientId: string
  dentalRecordId?: string
  appointmentId?: string
  branchId?: string
  providerId?: string
  providerNameSnapshot?: string
  items: PrescriptionItem[]
  medication: string
  dosage: string
  frequency: string
  duration: string
  instructions: string
  notes: string
  prescribedBy: string
  prescriptionDate: string
  status: PrescriptionStatus
  createdAt: string
  updatedAt: string
}

export type PrescriptionInput = {
  patientId: string
  dentalRecordId?: string
  appointmentId?: string
  branchId?: string
  providerId?: string
  providerNameSnapshot?: string
  items?: Array<Omit<PrescriptionItem, 'id'>>
  medication?: string
  strength?: string
  dosage?: string
  frequency?: string
  duration?: string
  instructions?: string
  notes?: string
  prescribedBy: string
  prescriptionDate?: string
  status?: PrescriptionStatus
}

const PRESCRIPTION_STORAGE_KEY = 'plamenco.prescriptions'

function safeParse<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  } as Storage
}

function getStorage(): Storage {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) return globalThis.localStorage
  const globalWithMemory = globalThis as typeof globalThis & { __plamencoPrescriptionMemoryStorage?: Storage }
  if (globalWithMemory.__plamencoPrescriptionMemoryStorage) return globalWithMemory.__plamencoPrescriptionMemoryStorage
  const memory = createMemoryStorage()
  globalWithMemory.__plamencoPrescriptionMemoryStorage = memory
  return memory
}

function normalizePrescription(prescription: Prescription): Prescription {
  const fallbackItem: PrescriptionItem = {
    id: `rx-item-${prescription.id}`,
    medication: prescription.medication ?? '',
    strength: '',
    dosage: prescription.dosage ?? '',
    frequency: prescription.frequency ?? '',
    duration: prescription.duration ?? '',
    instructions: prescription.instructions ?? '',
  }
  const items = prescription.items?.length ? prescription.items : [fallbackItem].filter((item) => item.medication)
  return {
    ...prescription,
    items,
    medication: items.map((item) => item.medication).join(', '),
    dosage: items[0]?.dosage ?? prescription.dosage ?? '',
    frequency: items[0]?.frequency ?? prescription.frequency ?? '',
    duration: items[0]?.duration ?? prescription.duration ?? '',
    instructions: items[0]?.instructions ?? prescription.instructions ?? '',
    notes: prescription.notes ?? '',
    status: prescription.status ?? 'active',
  }
}

function mapPrescriptionRow(row: Record<string, any>): Prescription {
  const rawItems = Array.isArray(row.items) ? row.items : []
  const items: PrescriptionItem[] = rawItems.map((item: Record<string, any>, index: number) => ({
    id: String(item.id ?? `rx-item-${row.id}-${index}`),
    medication: String(item.medication ?? ''),
    strength: String(item.strength ?? ''),
    dosage: String(item.dosage ?? ''),
    frequency: String(item.frequency ?? ''),
    duration: String(item.duration ?? ''),
    instructions: String(item.instructions ?? ''),
  }))
  return normalizePrescription({
    id: String(row.id),
    patientId: String(row.patient_id ?? ''),
    dentalRecordId: row.dental_record_id ?? undefined,
    appointmentId: row.appointment_id ?? undefined,
    branchId: row.branch_id ?? undefined,
    providerId: row.provider_id ?? undefined,
    providerNameSnapshot: row.provider_name_snapshot ?? undefined,
    items,
    medication: items.map((item) => item.medication).join(', '),
    dosage: items[0]?.dosage ?? '',
    frequency: items[0]?.frequency ?? '',
    duration: items[0]?.duration ?? '',
    instructions: items[0]?.instructions ?? '',
    notes: row.notes ?? '',
    prescribedBy: row.prescribed_by ?? '',
    prescriptionDate: row.prescription_date ?? '',
    status: row.status ?? 'active',
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  })
}

function cleanPrescriptionItems(input: PrescriptionInput): PrescriptionItem[] {
  const sourceItems = input.items?.length
    ? input.items
    : [{
        medication: input.medication ?? '',
        strength: input.strength ?? '',
        dosage: input.dosage ?? '',
        frequency: input.frequency ?? '',
        duration: input.duration ?? '',
        instructions: input.instructions ?? '',
      }]
  if (!sourceItems.length) throw new Error('At least one medication is required.')

  const cleanItems = sourceItems.map((item, index) => ({
    id: `rx-item-${Date.now()}-${index}`,
    medication: item.medication.trim(),
    strength: item.strength.trim(),
    dosage: item.dosage.trim(),
    frequency: item.frequency.trim(),
    duration: item.duration.trim(),
    instructions: item.instructions.trim(),
  })).filter((item) => item.medication && item.dosage && item.frequency)

  if (!cleanItems.length) throw new Error('Medication, dosage, and frequency are required.')
  return cleanItems
}

export function getStoredPrescriptions(): Prescription[] {
  const stored = safeParse<Prescription[]>(getStorage().getItem(PRESCRIPTION_STORAGE_KEY))
  if (stored?.length) return stored.map(normalizePrescription)
  getStorage().setItem(PRESCRIPTION_STORAGE_KEY, JSON.stringify([]))
  return []
}

export function saveStoredPrescriptions(prescriptions: Prescription[]) {
  getStorage().setItem(PRESCRIPTION_STORAGE_KEY, JSON.stringify(prescriptions))
}

export function getPrescriptionsByPatient(patientId: string): Prescription[] {
  return getStoredPrescriptions()
    .filter((prescription) => prescription.patientId === patientId && prescription.status !== 'voided')
    .sort((a, b) => new Date(b.prescriptionDate).getTime() - new Date(a.prescriptionDate).getTime())
}

export function getPrescriptionsByClinicalVisit(dentalRecordId: string): Prescription[] {
  return getStoredPrescriptions()
    .filter((prescription) => prescription.dentalRecordId === dentalRecordId && prescription.status !== 'voided')
    .sort((a, b) => new Date(b.prescriptionDate).getTime() - new Date(a.prescriptionDate).getTime())
}

/**
 * Database-first prescription creation for active production UI callers.
 * The RPC derives the authenticated clinical actor/provider and validates the
 * linked patient/visit before returning a confirmed row. Local storage is only
 * updated after PostgreSQL succeeds.
 */
export async function createPrescriptionPersisted(input: PrescriptionInput): Promise<Prescription> {
  if (!supabase) throw new Error('Clinic database is not configured. Prescriptions cannot be saved safely.')
  if (!input.patientId.trim()) throw new Error('Patient is required.')
  const cleanItems = cleanPrescriptionItems(input)

  const { data, error } = await supabase.rpc('create_prescription', {
    p_patient_id: input.patientId,
    p_dental_record_id: input.dentalRecordId ?? null,
    p_appointment_id: input.appointmentId ?? null,
    p_branch_id: input.branchId ?? null,
    p_items: cleanItems,
    p_notes: input.notes?.trim() ?? '',
    p_prescription_date: input.prescriptionDate ?? new Date().toISOString().slice(0, 10),
  })

  if (error || !data) {
    if (import.meta.env.DEV && error?.message) console.error('[prescription persistence]', error)
    throw new Error('Prescription could not be saved. Your changes were not submitted.')
  }

  const confirmed = mapPrescriptionRow(data as Record<string, any>)
  saveStoredPrescriptions([confirmed, ...getStoredPrescriptions().filter((entry) => entry.id !== confirmed.id)])
  return confirmed
}

/**
 * Legacy local-first helper retained for compatibility with inactive/test code.
 * Active routed UI must use createPrescriptionPersisted instead.
 */
export function createPrescription(input: PrescriptionInput): Prescription {
  if (!input.patientId.trim()) throw new Error('Patient is required.')
  const cleanItems = cleanPrescriptionItems(input)
  if (!input.prescribedBy.trim()) throw new Error('Prescriber is required.')

  const now = new Date().toISOString()
  const provider = input.providerId ? getStoredProviders().find((entry) => entry.id === input.providerId) : undefined
  const prescription: Prescription = {
    id: `rx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    patientId: input.patientId,
    dentalRecordId: input.dentalRecordId,
    appointmentId: input.appointmentId,
    branchId: input.branchId,
    providerId: input.providerId,
    providerNameSnapshot: input.providerNameSnapshot ?? provider?.displayName,
    items: cleanItems,
    medication: cleanItems.map((item) => item.medication).join(', '),
    dosage: cleanItems[0]?.dosage ?? '',
    frequency: cleanItems[0]?.frequency ?? '',
    duration: cleanItems[0]?.duration ?? '',
    instructions: cleanItems[0]?.instructions ?? '',
    notes: input.notes?.trim() ?? '',
    prescribedBy: input.prescribedBy.trim(),
    prescriptionDate: input.prescriptionDate ?? now.slice(0, 10),
    status: input.status ?? 'active',
    createdAt: now,
    updatedAt: now,
  }

  saveStoredPrescriptions([prescription, ...getStoredPrescriptions()])
  void insertRemoteTableRow('prescriptions', {
    id: prescription.id,
    patient_id: prescription.patientId,
    dental_record_id: prescription.dentalRecordId ?? null,
    appointment_id: prescription.appointmentId ?? null,
    branch_id: prescription.branchId ?? null,
    provider_id: prescription.providerId ?? null,
    provider_name_snapshot: prescription.providerNameSnapshot ?? '',
    items: prescription.items,
    notes: prescription.notes,
    prescribed_by: prescription.prescribedBy,
    prescription_date: prescription.prescriptionDate,
    status: prescription.status,
  })
  recordAuditEntry({
    user: prescription.prescribedBy,
    action: 'prescription_created',
    entity: 'prescription',
    entityId: prescription.id,
    metadata: { patientId: prescription.patientId, dentalRecordId: prescription.dentalRecordId, providerId: prescription.providerId },
  })
  return prescription
}

export function getPrescriptionPrintableText(prescription: Prescription): string {
  const branch = prescription.branchId ? getStoredBranches().find((entry) => entry.id === prescription.branchId) : undefined
  return [
    'Plamenco Dental Co.',
    branch?.name ?? 'Clinic branch to be confirmed',
    'Prescription',
    `Patient ID: ${prescription.patientId}`,
    `Date: ${prescription.prescriptionDate}`,
    `Prescribing Dentist: ${prescription.providerNameSnapshot || prescription.prescribedBy}`,
    '',
    ...prescription.items.flatMap((item, index) => [
      `${index + 1}. ${item.medication}${item.strength ? ` - ${item.strength}` : ''}`,
      `Dosage: ${item.dosage}`,
      `Frequency: ${item.frequency}`,
      `Duration: ${item.duration}`,
      `Instructions: ${item.instructions || 'As directed'}`,
      '',
    ]),
    prescription.notes ? `Notes: ${prescription.notes}` : '',
  ].filter(Boolean).join('\n')
}

export { PRESCRIPTION_STORAGE_KEY }
