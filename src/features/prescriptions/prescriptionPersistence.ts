import { supabase } from '../../lib/supabase'
import {
  getStoredPrescriptions,
  saveStoredPrescriptions,
  type Prescription,
  type PrescriptionItem,
  type PrescriptionStatus,
} from './prescriptionStore'

function mapPrescriptionRow(row: Record<string, unknown>): Prescription {
  const rawItems = Array.isArray(row.items) ? row.items : []
  const items: PrescriptionItem[] = rawItems.map((rawItem, index) => {
    const item = rawItem && typeof rawItem === 'object' ? rawItem as Record<string, unknown> : {}
    return {
      id: String(item.id ?? `rx-item-${String(row.id ?? 'unknown')}-${index}`),
      medication: String(item.medication ?? ''),
      strength: String(item.strength ?? ''),
      dosage: String(item.dosage ?? ''),
      frequency: String(item.frequency ?? ''),
      duration: String(item.duration ?? ''),
      instructions: String(item.instructions ?? ''),
    }
  })

  return {
    id: String(row.id ?? ''),
    patientId: String(row.patient_id ?? ''),
    dentalRecordId: row.dental_record_id ? String(row.dental_record_id) : undefined,
    appointmentId: row.appointment_id ? String(row.appointment_id) : undefined,
    branchId: row.branch_id ? String(row.branch_id) : undefined,
    providerId: row.provider_id ? String(row.provider_id) : undefined,
    providerNameSnapshot: row.provider_name_snapshot ? String(row.provider_name_snapshot) : undefined,
    items,
    medication: items.map((item) => item.medication).filter(Boolean).join(', '),
    dosage: items[0]?.dosage ?? '',
    frequency: items[0]?.frequency ?? '',
    duration: items[0]?.duration ?? '',
    instructions: items[0]?.instructions ?? '',
    notes: String(row.notes ?? ''),
    prescribedBy: String(row.prescribed_by ?? ''),
    prescriptionDate: String(row.prescription_date ?? ''),
    status: (String(row.status ?? 'active') as PrescriptionStatus),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? row.created_at ?? ''),
  }
}

/**
 * Loads the prescription registry from PostgreSQL through Supabase.
 * Browser storage is only a post-success cache; it is never treated as the
 * authoritative read source when the database is configured.
 */
export async function loadPrescriptionsFromSupabase(options: { strict?: boolean } = {}): Promise<Prescription[]> {
  if (!supabase) {
    if (options.strict) throw new Error('Clinic database is not configured. Unable to load prescriptions.')
    return getStoredPrescriptions()
  }

  const { data, error } = await supabase
    .from('prescriptions')
    .select('*')
    .order('prescription_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    if (import.meta.env.DEV && error.message) console.error('[prescription persistence] load', error)
    if (options.strict) throw new Error('Unable to load prescriptions from the clinic database.')
    return getStoredPrescriptions()
  }

  const prescriptions = (data ?? []).map((row) => mapPrescriptionRow(row as Record<string, unknown>))
  saveStoredPrescriptions(prescriptions)
  return prescriptions
}
