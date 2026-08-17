import type { Patient } from '../patients/patientTypes'
import { getStoredPatients } from '../patients/patientStore'
import { recordAuditEntry } from '../security/auditLogStore'
import { getCurrentSessionUserName } from '../security/security'
import { insertRemoteTableRow, updateRemoteTableRow } from '../../lib/supabaseSync'
import type { DentalRecord, DentalRecordFormValues } from './dentalRecordTypes'

const DENTAL_RECORD_STORAGE_KEY = 'plamenco.dentalRecords'

const seedDentalRecords: DentalRecord[] = []

function safeParseDentalRecords(value: string | null): DentalRecord[] | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as DentalRecord[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function getStoredDentalRecords(): DentalRecord[] {
  const stored = safeParseDentalRecords(window.localStorage.getItem(DENTAL_RECORD_STORAGE_KEY))

  if (stored?.length) {
    return stored
  }

  window.localStorage.setItem(DENTAL_RECORD_STORAGE_KEY, JSON.stringify(seedDentalRecords))
  return seedDentalRecords
}

export function saveStoredDentalRecords(records: DentalRecord[]) {
  window.localStorage.setItem(DENTAL_RECORD_STORAGE_KEY, JSON.stringify(records))
}

export function getDentalRecordsByPatientId(patientId: string): DentalRecord[] {
  return getStoredDentalRecords()
    .filter((record) => record.patientId === patientId)
    .sort((a, b) => new Date(b.recordDate).getTime() - new Date(a.recordDate).getTime())
}

export function createDentalRecord(values: DentalRecordFormValues): DentalRecord {
  const records = getStoredDentalRecords()
  const now = new Date().toISOString()

  const record: DentalRecord = {
    id: `record-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    ...values,
    createdAt: now,
    updatedAt: now,
  }

  records.push(record)
  saveStoredDentalRecords(records)
  
  // Persist to Supabase asynchronously
  void insertRemoteTableRow('dental_records', {
    id: record.id,
    patient_id: record.patientId,
    record_date: record.recordDate,
    visit_type: record.visitType,
    chief_complaint: record.chiefComplaint,
    diagnosis: record.diagnosis,
    treatment_plan: record.treatmentPlan,
    findings: record.findings,
    treatment_notes: record.treatmentNotes,
    follow_up_date: record.followUpDate,
    status: record.status,
    related_appointment_id: record.relatedAppointmentId,
    created_by: record.createdBy,
  })
  
  recordAuditEntry({
    user: getCurrentSessionUserName(),
    action: 'dental_record_created',
    entity: 'dental_record',
    entityId: record.patientId,
    metadata: { patientId: record.patientId, recordId: record.id, visitType: record.visitType },
  })
  return record
}

export function updateDentalRecord(id: string, values: DentalRecordFormValues): DentalRecord | null {
  const records = getStoredDentalRecords()
  const index = records.findIndex((record) => record.id === id)

  if (index === -1) return null

  const updated: DentalRecord = {
    ...records[index],
    ...values,
    updatedAt: new Date().toISOString(),
  }

  records[index] = updated
  saveStoredDentalRecords(records)
  
  // Persist to Supabase asynchronously
  void updateRemoteTableRow('dental_records', id, {
    record_date: updated.recordDate,
    visit_type: updated.visitType,
    chief_complaint: updated.chiefComplaint,
    diagnosis: updated.diagnosis,
    treatment_plan: updated.treatmentPlan,
    findings: updated.findings,
    treatment_notes: updated.treatmentNotes,
    follow_up_date: updated.followUpDate,
    status: updated.status,
    related_appointment_id: updated.relatedAppointmentId,
  })
  
  recordAuditEntry({
    user: getCurrentSessionUserName(),
    action: 'dental_record_updated',
    entity: 'dental_record',
    entityId: updated.patientId,
    metadata: { patientId: updated.patientId, recordId: updated.id, visitType: updated.visitType },
  })
  return updated
}

export function deleteDentalRecord(id: string): boolean {
  const records = getStoredDentalRecords()
  const index = records.findIndex((record) => record.id === id)

  if (index === -1) return false

  records.splice(index, 1)
  saveStoredDentalRecords(records)
  return true
}

export function getPatientName(patientId: string): string {
  const patient = getStoredPatients().find((entry: Patient) => entry.patientId === patientId)
  if (!patient) return 'Unknown patient'
  return `${patient.firstName} ${patient.middleName ? `${patient.middleName} ` : ''}${patient.lastName}`.trim()
}

export function searchDentalRecords(query: string): DentalRecord[] {
  const lowerQuery = query.trim().toLowerCase()
  if (!lowerQuery) return getStoredDentalRecords()

  return getStoredDentalRecords().filter((record) => {
    const patientName = getPatientName(record.patientId).toLowerCase()
    return [
      patientName,
      record.patientId,
      record.chiefComplaint,
      record.diagnosis,
      record.treatmentPlan,
      record.visitType,
      record.status,
    ]
      .join(' ')
      .toLowerCase()
      .includes(lowerQuery)
  })
}

export function sortDentalRecords(records: DentalRecord[], key: 'recordDate' | 'patientId' | 'status', direction: 'asc' | 'desc') {
  const sorted = [...records]

  sorted.sort((a, b) => {
    let result = 0

    if (key === 'recordDate') {
      result = new Date(a.recordDate).getTime() - new Date(b.recordDate).getTime()
    } else if (key === 'patientId') {
      result = a.patientId.localeCompare(b.patientId)
    } else {
      result = a.status.localeCompare(b.status)
    }

    return direction === 'asc' ? result : -result
  })

  return sorted
}

export { DENTAL_RECORD_STORAGE_KEY }
