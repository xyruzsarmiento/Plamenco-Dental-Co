import { getStoredPatients } from '../patients/patientStore'
import { recordAuditEntry } from '../security/auditLogStore'
import { getCurrentSessionUserName } from '../security/security'
import { insertRemoteTableRow } from '../../lib/supabaseSync'
import { supabase } from '../../lib/supabase'
import { createUuid } from '../../lib/id'
import type { ClinicalRecordAmendment, ClinicalRecordAmendmentFormValues, DentalRecord, DentalRecordFormValues } from './dentalRecordTypes'
import type { Appointment } from '../appointments/appointmentTypes'
import { getStoredBranches } from '../branches/branchStore'
import { getStoredProviders } from '../dentists/dentistStore'
import { createClinicalFollowUpRecallFromRecord } from '../recalls/recallStore'

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

function resolvePatient(patientRef: string) {
  return getStoredPatients().find((patient) => patient.id === patientRef || patient.patientId === patientRef)
}

function patientDatabaseId(patientRef: string) {
  return resolvePatient(patientRef)?.id ?? patientRef
}

function patientReferenceFromDatabaseId(patientId: string) {
  return getStoredPatients().find((patient) => patient.id === patientId)?.patientId ?? patientId
}

function patientRefs(patientRef: string) {
  const patient = resolvePatient(patientRef)
  return new Set([patientRef, patient?.id, patient?.patientId].filter(Boolean) as string[])
}

function nullableDate(value?: string) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function nullableId(value?: string) {
  const normalized = value?.trim()
  return normalized ? normalized : null
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

function remoteRecordRow(record: DentalRecord) {
  return {
    id: record.id,
    patient_id: patientDatabaseId(record.patientId),
    record_date: record.recordDate,
    visit_type: record.visitType,
    appointment_number: record.appointmentNumber ?? '',
    branch_id: nullableId(record.branchId),
    provider_id: nullableId(record.providerId),
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
    follow_up_date: nullableDate(record.followUpDate),
    follow_up_notes: record.followUpNotes,
    status: record.status,
    source: record.source,
    historical_provider_text: record.historicalProviderText ?? '',
    finalized_at: record.finalizedAt ?? null,
    finalized_by: record.finalizedBy ?? '',
    last_updated_by: record.lastUpdatedBy,
    related_appointment_id: nullableId(record.relatedAppointmentId),
    created_by: record.createdBy,
  }
}

function mapSupabaseDentalRecordRow(row: Record<string, any>): DentalRecord {
  return normalizeDentalRecord({
    id: String(row.id),
    patientId: patientReferenceFromDatabaseId(String(row.patient_id ?? '')),
    recordDate: row.record_date ?? '',
    visitType: row.visit_type ?? 'consultation',
    appointmentNumber: row.appointment_number ?? undefined,
    branchId: row.branch_id ?? undefined,
    providerId: row.provider_id ?? undefined,
    providerNameSnapshot: row.provider_name_snapshot ?? undefined,
    chiefComplaint: row.chief_complaint ?? '',
    clinicalFindings: row.clinical_findings ?? '',
    assessment: row.assessment ?? '',
    treatmentPerformed: row.treatment_performed ?? '',
    recommendations: row.recommendations ?? '',
    patientVisibleSummary: row.patient_visible_summary ?? '',
    diagnosis: row.diagnosis ?? '',
    treatmentPlan: row.treatment_plan ?? '',
    findings: row.findings ?? '',
    treatmentNotes: row.treatment_notes ?? '',
    clinicalNotes: row.clinical_notes ?? '',
    followUpRequired: Boolean(row.follow_up_required),
    followUpDate: row.follow_up_date ?? '',
    followUpNotes: row.follow_up_notes ?? '',
    status: row.status ?? 'draft',
    relatedAppointmentId: row.related_appointment_id ?? undefined,
    source: row.source ?? 'native',
    historicalProviderText: row.historical_provider_text ?? undefined,
    finalizedAt: row.finalized_at ?? undefined,
    finalizedBy: row.finalized_by ?? undefined,
    lastUpdatedBy: row.last_updated_by ?? row.created_by ?? '',
    createdBy: row.created_by ?? '',
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  })
}

function replaceCachedDentalRecord(confirmed: DentalRecord) {
  const records = getStoredDentalRecords().filter((record) => record.id !== confirmed.id)
  saveStoredDentalRecords([confirmed, ...records])
}

function persistenceError(message: string, cause?: { message?: string } | null) {
  if (import.meta.env.DEV && cause?.message) console.error('[dental record persistence]', cause)
  return new Error(message)
}

export function getStoredDentalRecords(): DentalRecord[] {
  const stored = safeParseDentalRecords(window.localStorage.getItem(DENTAL_RECORD_STORAGE_KEY))
  if (stored?.length) return stored.map(normalizeDentalRecord)
  window.localStorage.setItem(DENTAL_RECORD_STORAGE_KEY, JSON.stringify(seedDentalRecords))
  return seedDentalRecords
}

export function saveStoredDentalRecords(records: DentalRecord[]) {
  window.localStorage.setItem(DENTAL_RECORD_STORAGE_KEY, JSON.stringify(records))
}

export function getDentalRecordsByPatientId(patientId: string): DentalRecord[] {
  const refs = patientRefs(patientId)
  return getStoredDentalRecords()
    .filter((record) => refs.has(record.patientId))
    .sort((a, b) => new Date(b.recordDate).getTime() - new Date(a.recordDate).getTime())
}

export async function createDentalRecord(values: DentalRecordFormValues): Promise<DentalRecord> {
  if (!supabase) throw new Error('Clinic database is not configured. Clinical records cannot be saved safely.')
  if (['finalized', 'amended'].includes(values.status) && values.followUpRequired && !values.followUpDate?.trim()) throw new Error('A follow-up date is required before finalizing this clinical recommendation.')

  const now = new Date().toISOString()
  const draft: DentalRecord = {
    id: createUuid(),
    ...values,
    followUpDate: values.followUpDate ?? '',
    relatedAppointmentId: values.relatedAppointmentId || undefined,
    createdAt: now,
    updatedAt: now,
  }
  const row = remoteRecordRow(draft) as Record<string, unknown>
  delete row.id

  const { data, error } = await supabase.from('dental_records').insert(row).select('*').single()
  if (error || !data) throw persistenceError('Clinical record could not be saved. Your changes were not submitted.', error)

  const confirmed = mapSupabaseDentalRecordRow(data as Record<string, any>)
  if (['finalized', 'amended'].includes(confirmed.status) && (confirmed.followUpRequired || confirmed.followUpDate) && confirmed.followUpDate) {
    await createClinicalFollowUpRecallFromRecord({
      patientId: confirmed.patientId,
      clinicalVisitId: confirmed.id,
      dueDate: confirmed.followUpDate,
      reason: confirmed.followUpNotes || confirmed.recommendations || confirmed.patientVisibleSummary || confirmed.chiefComplaint || 'Clinical follow-up recommended',
      branchId: confirmed.branchId,
      providerId: confirmed.providerId,
      providerName: confirmed.providerNameSnapshot || confirmed.historicalProviderText,
    })
  }
  replaceCachedDentalRecord(confirmed)
  recordAuditEntry({
    user: getCurrentSessionUserName(),
    action: 'clinical_record_created',
    entity: 'dental_record',
    entityId: confirmed.patientId,
    metadata: { patientId: confirmed.patientId, recordId: confirmed.id, visitType: confirmed.visitType },
  })
  return confirmed
}

export async function updateDentalRecord(id: string, values: DentalRecordFormValues): Promise<DentalRecord> {
  if (!supabase) throw new Error('Clinic database is not configured. Clinical records cannot be saved safely.')

  const current = getStoredDentalRecords().find((record) => record.id === id)
  if (!current) throw new Error('Clinical record was not found.')
  if (current.status !== 'draft') throw new Error('Only draft clinical records can be edited.')

  const candidate: DentalRecord = {
    ...current,
    ...values,
    id: current.id,
    patientId: current.patientId,
    createdBy: current.createdBy,
    relatedAppointmentId: values.relatedAppointmentId || undefined,
    updatedAt: current.updatedAt,
  }
  const row = remoteRecordRow(candidate) as Record<string, unknown>
  delete row.id
  delete row.patient_id
  delete row.created_by
  delete row.status

  const { data, error } = await supabase
    .from('dental_records')
    .update(row)
    .eq('id', id)
    .eq('status', 'draft')
    .select('*')
    .maybeSingle()

  if (error) throw persistenceError('Clinical record could not be saved. Your changes were not submitted.', error)
  if (!data) throw new Error('This clinical record is no longer editable. Refresh and try again.')

  const confirmed = mapSupabaseDentalRecordRow(data as Record<string, any>)
  replaceCachedDentalRecord(confirmed)
  recordAuditEntry({
    user: getCurrentSessionUserName(),
    action: 'clinical_record_draft_updated',
    entity: 'dental_record',
    entityId: confirmed.patientId,
    metadata: { patientId: confirmed.patientId, recordId: confirmed.id, visitType: confirmed.visitType },
  })
  return confirmed
}

export function getClinicalVisitByAppointment(appointmentId: string) {
  return getStoredDentalRecords().find((record) => record.relatedAppointmentId === appointmentId)
}

export async function createClinicalVisitFromAppointment(appointment: Appointment, actor: string): Promise<DentalRecord> {
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

export async function finalizeDentalRecord(id: string, actor: string): Promise<DentalRecord> {
  if (!supabase) throw new Error('Clinic database is not configured. Clinical records cannot be finalized safely.')

  const current = getStoredDentalRecords().find((record) => record.id === id)
  if (current?.followUpRequired && !current.followUpDate?.trim()) throw new Error('A follow-up date is required before finalizing this clinical recommendation.')

  const { data, error } = await supabase
    .from('dental_records')
    .update({
      status: 'finalized',
      finalized_at: new Date().toISOString(),
      finalized_by: actor,
      last_updated_by: actor,
    })
    .eq('id', id)
    .eq('status', 'draft')
    .select('*')
    .maybeSingle()

  if (error) throw persistenceError('Clinical record could not be finalized.', error)
  if (!data) throw new Error('This clinical record was already finalized or changed. Refresh before trying again.')

  const confirmed = mapSupabaseDentalRecordRow(data as Record<string, any>)
  if ((confirmed.followUpRequired || confirmed.followUpDate) && confirmed.followUpDate) {
    await createClinicalFollowUpRecallFromRecord({
      patientId: confirmed.patientId,
      clinicalVisitId: confirmed.id,
      dueDate: confirmed.followUpDate,
      reason: confirmed.followUpNotes || confirmed.recommendations || confirmed.patientVisibleSummary || confirmed.chiefComplaint || 'Clinical follow-up recommended',
      branchId: confirmed.branchId,
      providerId: confirmed.providerId,
      providerName: confirmed.providerNameSnapshot || confirmed.historicalProviderText,
    })
  }
  replaceCachedDentalRecord(confirmed)
  recordAuditEntry({
    user: actor,
    action: 'clinical_record_finalized',
    entity: 'dental_record',
    entityId: confirmed.id,
    metadata: { patientId: confirmed.patientId, providerId: confirmed.providerId },
  })
  return confirmed
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

export function addClinicalRecordAmendment(recordId: string, values: ClinicalRecordAmendmentFormValues): ClinicalRecordAmendment | null {
  const record = getStoredDentalRecords().find((entry) => entry.id === recordId)
  if (!record || record.status === 'draft') return null
  if (!values.amendmentText.trim() || !values.reason.trim() || !values.author.trim()) return null

  const now = new Date().toISOString()
  const amendment: ClinicalRecordAmendment = {
    id: createUuid(),
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
    patient_id: patientDatabaseId(amendment.patientId),
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

export async function deleteDentalRecord(id: string): Promise<boolean> {
  if (!supabase) throw new Error('Clinic database is not configured. Clinical records cannot be deleted safely.')
  const current = getStoredDentalRecords().find((record) => record.id === id)
  if (!current || current.status !== 'draft') return false

  const { data, error } = await supabase
    .from('dental_records')
    .delete()
    .eq('id', id)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle()

  if (error) throw persistenceError('Draft clinical record could not be deleted.', error)
  if (!data) return false

  saveStoredDentalRecords(getStoredDentalRecords().filter((record) => record.id !== id))
  return true
}

export function getPatientName(patientId: string): string {
  const patient = resolvePatient(patientId)
  if (!patient) return 'Unknown patient'
  return `${patient.firstName} ${patient.middleName ? `${patient.middleName} ` : ''}${patient.lastName}`.trim()
}

export function searchDentalRecords(query: string): DentalRecord[] {
  const lowerQuery = query.trim().toLowerCase()
  if (!lowerQuery) return getStoredDentalRecords()
  return getStoredDentalRecords().filter((record) => {
    const patientName = getPatientName(record.patientId).toLowerCase()
    return [patientName, record.patientId, record.chiefComplaint, record.diagnosis, record.treatmentPlan, record.visitType, record.status]
      .join(' ')
      .toLowerCase()
      .includes(lowerQuery)
  })
}

export function sortDentalRecords(records: DentalRecord[], key: 'recordDate' | 'patientId' | 'status', direction: 'asc' | 'desc') {
  const sorted = [...records]
  sorted.sort((a, b) => {
    let result = 0
    if (key === 'recordDate') result = new Date(a.recordDate).getTime() - new Date(b.recordDate).getTime()
    else if (key === 'patientId') result = a.patientId.localeCompare(b.patientId)
    else result = a.status.localeCompare(b.status)
    return direction === 'asc' ? result : -result
  })
  return sorted
}

export { DENTAL_RECORD_STORAGE_KEY, CLINICAL_AMENDMENT_STORAGE_KEY }
