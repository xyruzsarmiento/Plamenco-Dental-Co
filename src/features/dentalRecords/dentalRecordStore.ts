import type { Patient } from '../patients/patientTypes'
import { getStoredPatients } from '../patients/patientStore'
import { recordAuditEntry } from '../security/auditLogStore'
import { getCurrentSessionUserName } from '../security/security'
import { insertRemoteTableRow, updateRemoteTableRow } from '../../lib/supabaseSync'
import type { ClinicalRecordAmendment, ClinicalRecordAmendmentFormValues, DentalRecord, DentalRecordFormValues } from './dentalRecordTypes'
import type { Appointment } from '../appointments/appointmentTypes'
import { getStoredBranches } from '../branches/branchStore'
import { getStoredProviders } from '../dentists/dentistStore'

const DENTAL_RECORD_STORAGE_KEY = 'plamenco.dentalRecords'
const CLINICAL_AMENDMENT_STORAGE_KEY = 'plamenco.clinicalRecordAmendments'

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
    return stored.map(normalizeDentalRecord)
  }

  window.localStorage.setItem(DENTAL_RECORD_STORAGE_KEY, JSON.stringify(seedDentalRecords))
  return seedDentalRecords
}

function normalizeDentalRecord(record: DentalRecord): DentalRecord {
  return {
    ...record,
    clinicalFindings: record.clinicalFindings ?? record.findings ?? '',
    assessment: record.assessment ?? record.diagnosis ?? '',
    treatmentPerformed: record.treatmentPerformed ?? record.treatmentNotes ?? '',
    recommendations: record.recommendations ?? record.treatmentPlan ?? '',
    patientVisibleSummary: record.patientVisibleSummary ?? '',
    findings: record.findings ?? record.clinicalFindings ?? '',
    diagnosis: record.diagnosis ?? record.assessment ?? '',
    treatmentPlan: record.treatmentPlan ?? record.recommendations ?? '',
    treatmentNotes: record.treatmentNotes ?? record.treatmentPerformed ?? '',
    clinicalNotes: record.clinicalNotes ?? '',
    followUpRequired: record.followUpRequired ?? Boolean(record.followUpDate),
    followUpNotes: record.followUpNotes ?? '',
    status: record.status === 'active' || record.status === 'follow_up' || record.status === 'completed' ? 'draft' : record.status,
    source: record.source ?? 'native',
    lastUpdatedBy: record.lastUpdatedBy ?? record.createdBy,
  }
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
    appointment_number: record.appointmentNumber ?? '',
    branch_id: record.branchId ?? null,
    provider_id: record.providerId ?? null,
    provider_name_snapshot: record.providerNameSnapshot ?? '',
    chief_complaint: record.chiefComplaint,
    clinical_findings: record.clinicalFindings,
    assessment: record.assessment,
    treatment_performed: record.treatmentPerformed,
    recommendations: record.recommendations,
    patient_visible_summary: record.patientVisibleSummary,
    diagnosis: record.diagnosis,
    treatment_plan: record.treatmentPlan,
    findings: record.findings,
    treatment_notes: record.treatmentNotes,
    clinical_notes: record.clinicalNotes,
    follow_up_required: record.followUpRequired,
    follow_up_date: record.followUpDate,
    follow_up_notes: record.followUpNotes,
    status: record.status,
    source: record.source,
    historical_provider_text: record.historicalProviderText ?? '',
    finalized_at: record.finalizedAt ?? null,
    finalized_by: record.finalizedBy ?? '',
    last_updated_by: record.lastUpdatedBy,
    related_appointment_id: record.relatedAppointmentId,
    created_by: record.createdBy,
  })
  
  recordAuditEntry({
    user: getCurrentSessionUserName(),
    action: 'clinical_record_created',
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
  if (records[index].status === 'finalized' || records[index].status === 'amended') return null

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
    appointment_number: updated.appointmentNumber ?? '',
    branch_id: updated.branchId ?? null,
    provider_id: updated.providerId ?? null,
    provider_name_snapshot: updated.providerNameSnapshot ?? '',
    chief_complaint: updated.chiefComplaint,
    clinical_findings: updated.clinicalFindings,
    assessment: updated.assessment,
    treatment_performed: updated.treatmentPerformed,
    recommendations: updated.recommendations,
    patient_visible_summary: updated.patientVisibleSummary,
    diagnosis: updated.diagnosis,
    treatment_plan: updated.treatmentPlan,
    findings: updated.findings,
    treatment_notes: updated.treatmentNotes,
    clinical_notes: updated.clinicalNotes,
    follow_up_required: updated.followUpRequired,
    follow_up_date: updated.followUpDate,
    follow_up_notes: updated.followUpNotes,
    status: updated.status,
    source: updated.source,
    historical_provider_text: updated.historicalProviderText ?? '',
    last_updated_by: updated.lastUpdatedBy,
    related_appointment_id: updated.relatedAppointmentId,
  })
  
  recordAuditEntry({
    user: getCurrentSessionUserName(),
    action: 'clinical_record_draft_updated',
    entity: 'dental_record',
    entityId: updated.patientId,
    metadata: { patientId: updated.patientId, recordId: updated.id, visitType: updated.visitType },
  })
  return updated
}

export function getClinicalVisitByAppointment(appointmentId: string) {
  return getStoredDentalRecords().find((record) => record.relatedAppointmentId === appointmentId)
}

export function createClinicalVisitFromAppointment(appointment: Appointment, actor: string): DentalRecord {
  const existing = getClinicalVisitByAppointment(appointment.id)
  if (existing) return existing

  const provider = getStoredProviders().find((entry) => entry.id === appointment.providerId)
  const branch = getStoredBranches().find((entry) => entry.id === appointment.branchId)

  return createDentalRecord({
    patientId: appointment.patientId,
    relatedAppointmentId: appointment.id,
    appointmentNumber: appointment.appointmentNumber,
    branchId: appointment.branchId,
    providerId: appointment.providerId,
    providerNameSnapshot: provider?.displayName,
    recordDate: appointment.date,
    visitType: 'consultation',
    chiefComplaint: appointment.reasonForVisit || appointment.notes || '',
    clinicalFindings: '',
    assessment: '',
    treatmentPerformed: '',
    recommendations: '',
    patientVisibleSummary: '',
    findings: '',
    diagnosis: '',
    treatmentPlan: '',
    treatmentNotes: '',
    clinicalNotes: '',
    followUpRequired: false,
    followUpDate: '',
    followUpNotes: '',
    status: 'draft',
    source: appointment.bookingSource === 'staff_entry' ? 'walk_in' : 'native',
    historicalProviderText: provider?.displayName ?? branch?.name,
    lastUpdatedBy: actor,
    createdBy: actor,
  })
}

export function finalizeDentalRecord(id: string, actor: string): DentalRecord | null {
  const records = getStoredDentalRecords()
  const index = records.findIndex((record) => record.id === id)
  if (index === -1) return null
  if (records[index].status !== 'draft') return null

  const now = new Date().toISOString()
  const updated: DentalRecord = {
    ...records[index],
    status: 'finalized',
    finalizedAt: now,
    finalizedBy: actor,
    lastUpdatedBy: actor,
    updatedAt: now,
  }
  records[index] = updated
  saveStoredDentalRecords(records)
  void updateRemoteTableRow('dental_records', id, {
    status: updated.status,
    finalized_at: updated.finalizedAt,
    finalized_by: updated.finalizedBy,
    last_updated_by: actor,
  })
  recordAuditEntry({
    user: actor,
    action: 'clinical_record_finalized',
    entity: 'dental_record',
    entityId: updated.id,
    metadata: { patientId: updated.patientId, providerId: updated.providerId },
  })
  return updated
}

function safeParseAmendments(value: string | null): ClinicalRecordAmendment[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as ClinicalRecordAmendment[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function getStoredClinicalRecordAmendments() {
  return safeParseAmendments(window.localStorage.getItem(CLINICAL_AMENDMENT_STORAGE_KEY))
}

export function getClinicalRecordAmendments(recordId: string) {
  return getStoredClinicalRecordAmendments()
    .filter((entry) => entry.dentalRecordId === recordId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function addClinicalRecordAmendment(
  recordId: string,
  values: ClinicalRecordAmendmentFormValues,
): ClinicalRecordAmendment | null {
  const record = getStoredDentalRecords().find((entry) => entry.id === recordId)
  if (!record || record.status === 'draft') return null
  if (!values.amendmentText.trim() || !values.reason.trim() || !values.author.trim()) return null

  const now = new Date().toISOString()
  const amendment: ClinicalRecordAmendment = {
    id: `amendment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dentalRecordId: recordId,
    patientId: record.patientId,
    providerId: values.providerId,
    amendmentText: values.amendmentText.trim(),
    reason: values.reason.trim(),
    author: values.author.trim(),
    createdAt: now,
  }
  window.localStorage.setItem(CLINICAL_AMENDMENT_STORAGE_KEY, JSON.stringify([amendment, ...getStoredClinicalRecordAmendments()]))
  const records = getStoredDentalRecords()
  const index = records.findIndex((entry) => entry.id === recordId)
  if (index >= 0) {
    records[index] = { ...records[index], status: 'amended', updatedAt: now, lastUpdatedBy: amendment.author }
    saveStoredDentalRecords(records)
  }
  void insertRemoteTableRow('clinical_record_amendments', {
    id: amendment.id,
    dental_record_id: amendment.dentalRecordId,
    patient_id: amendment.patientId,
    provider_id: amendment.providerId ?? null,
    amendment_text: amendment.amendmentText,
    reason: amendment.reason,
    author: amendment.author,
  })
  recordAuditEntry({
    user: amendment.author,
    action: 'clinical_record_amendment_added',
    entity: 'dental_record',
    entityId: recordId,
    metadata: { patientId: amendment.patientId, providerId: amendment.providerId },
  })
  return amendment
}

export function deleteDentalRecord(id: string): boolean {
  const records = getStoredDentalRecords()
  const index = records.findIndex((record) => record.id === id)

  if (index === -1) return false
  if (records[index].status === 'finalized' || records[index].status === 'amended') return false

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

export { DENTAL_RECORD_STORAGE_KEY, CLINICAL_AMENDMENT_STORAGE_KEY }
