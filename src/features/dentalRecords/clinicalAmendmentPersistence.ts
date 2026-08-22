import { supabase } from '../../lib/supabase'
import type { ClinicalRecordAmendment } from './dentalRecordTypes'
import { getStoredClinicalRecordAmendments, getStoredDentalRecords, saveStoredDentalRecords } from './dentalRecordStore'

const CLINICAL_AMENDMENT_STORAGE_KEY = 'plamenco.clinicalRecordAmendments'

export async function addClinicalRecordAmendmentPersisted(input: {
  dentalRecordId: string
  amendmentText: string
  reason: string
  providerId?: string
}): Promise<ClinicalRecordAmendment> {
  if (!supabase) throw new Error('Clinic database is not configured. Clinical amendments cannot be saved safely.')
  const { data, error } = await supabase.rpc('add_clinical_record_amendment', {
    p_dental_record_id: input.dentalRecordId,
    p_amendment_text: input.amendmentText,
    p_reason: input.reason,
    p_provider_id: input.providerId ?? null,
  })
  if (error || !data?.amendment || !data?.record) throw new Error('The amendment could not be saved. The clinical record was left unchanged.')

  const row = data.amendment as Record<string, any>
  const amendment: ClinicalRecordAmendment = {
    id: String(row.id),
    dentalRecordId: String(row.dental_record_id),
    patientId: String(row.patient_id),
    providerId: row.provider_id ?? undefined,
    amendmentText: row.amendment_text ?? '',
    reason: row.reason ?? '',
    author: row.author ?? '',
    createdAt: row.created_at ?? new Date().toISOString(),
  }
  window.localStorage.setItem(CLINICAL_AMENDMENT_STORAGE_KEY, JSON.stringify([amendment, ...getStoredClinicalRecordAmendments().filter((entry) => entry.id !== amendment.id)]))

  const confirmedRecord = data.record as Record<string, any>
  const records = getStoredDentalRecords().map((record) => record.id === input.dentalRecordId ? {
    ...record,
    status: 'amended' as const,
    lastUpdatedBy: confirmedRecord.last_updated_by ?? amendment.author,
    updatedAt: confirmedRecord.updated_at ?? amendment.createdAt,
  } : record)
  saveStoredDentalRecords(records)
  return amendment
}
