import type { Service } from '../services/serviceTypes'
import { getStoredServices, servicePriceToCents } from '../services/serviceStore'
import { getStoredPatients } from '../patients/patientStore'
import { recordAuditEntry } from '../security/auditLogStore'
import { getCurrentSessionUserName } from '../security/security'
import { insertRemoteTableRow, updateRemoteTableRow } from '../../lib/supabaseSync'
import { createUuid } from '../../lib/id'
import type { Treatment, TreatmentPlan, TreatmentFormValues, TreatmentPlanFormValues } from './treatmentTypes'

const TREATMENT_STORAGE_KEY = 'plamenco.treatments'
const TREATMENT_PLAN_STORAGE_KEY = 'plamenco.treatmentPlans'

const seedTreatments: Treatment[] = []
const seedTreatmentPlans: TreatmentPlan[] = []

function safeParseTreatments<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
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

function patientRefs(patientRef: string) {
  const patient = resolvePatient(patientRef)
  return new Set([patientRef, patient?.id, patient?.patientId].filter(Boolean) as string[])
}

function optionalId(value?: string) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function serviceSnapshotCents(treatment: Partial<Treatment>, service?: Service) {
  if (Number.isFinite(treatment.priceSnapshotCents) && Number(treatment.priceSnapshotCents) > 0) return Number(treatment.priceSnapshotCents)
  if (service) return servicePriceToCents(service.price)
  if (Number.isFinite(treatment.cost) && Number(treatment.cost) > 0) return Math.round(Number(treatment.cost) * 100)
  return 0
}

function normalizeTreatment(treatment: Treatment): Treatment {
  const service = getStoredServices().find((entry) => entry.id === treatment.serviceId)
  const patient = resolvePatient(treatment.patientId)
  return {
    ...treatment,
    patientId: patient?.patientId ?? treatment.patientId,
    serviceNameSnapshot: treatment.serviceNameSnapshot ?? service?.name ?? '',
    priceSnapshotCents: serviceSnapshotCents(treatment, service),
    quantity: treatment.quantity ?? 1,
    providerNameSnapshot: treatment.providerNameSnapshot ?? treatment.performedBy ?? '',
    performedBy: treatment.performedBy ?? treatment.providerNameSnapshot ?? treatment.createdBy ?? 'Clinical provider',
    createdBy: treatment.createdBy ?? treatment.performedBy ?? 'Clinical provider',
  }
}

function remoteTreatmentRow(treatment: Treatment) {
  return {
    id: treatment.id,
    patient_id: patientDatabaseId(treatment.patientId),
    dental_record_id: optionalId(treatment.dentalRecordId),
    appointment_id: optionalId(treatment.appointmentId),
    appointment_number: treatment.appointmentNumber ?? '',
    branch_id: optionalId(treatment.branchId),
    provider_id: optionalId(treatment.providerId),
    provider_name_snapshot: treatment.providerNameSnapshot ?? '',
    service_id: treatment.serviceId,
    service_name_snapshot: treatment.serviceNameSnapshot ?? '',
    tooth_number: treatment.toothNumber ?? null,
    description: treatment.description,
    cost: treatment.cost,
    price_snapshot_cents: treatment.priceSnapshotCents,
    quantity: treatment.quantity,
    status: treatment.status,
    treatment_date: treatment.treatmentDate,
    notes: treatment.notes,
    performed_by: treatment.performedBy,
    created_by: treatment.createdBy,
  }
}

export function getStoredTreatments(): Treatment[] {
  const stored = safeParseTreatments<Treatment[]>(window.localStorage.getItem(TREATMENT_STORAGE_KEY))
  if (stored?.length) return stored.map(normalizeTreatment)
  window.localStorage.setItem(TREATMENT_STORAGE_KEY, JSON.stringify(seedTreatments))
  return seedTreatments
}

export function getStoredTreatmentPlans(): TreatmentPlan[] {
  const stored = safeParseTreatments<TreatmentPlan[]>(window.localStorage.getItem(TREATMENT_PLAN_STORAGE_KEY))
  if (stored?.length) return stored
  window.localStorage.setItem(TREATMENT_PLAN_STORAGE_KEY, JSON.stringify(seedTreatmentPlans))
  return seedTreatmentPlans
}

export function saveStoredTreatments(treatments: Treatment[]) {
  window.localStorage.setItem(TREATMENT_STORAGE_KEY, JSON.stringify(treatments))
}

export function saveStoredTreatmentPlans(plans: TreatmentPlan[]) {
  window.localStorage.setItem(TREATMENT_PLAN_STORAGE_KEY, JSON.stringify(plans))
}

export function getTreatmentsByPatient(patientId: string): Treatment[] {
  const refs = patientRefs(patientId)
  return getStoredTreatments()
    .filter((treatment) => refs.has(treatment.patientId))
    .sort((a, b) => new Date(b.treatmentDate).getTime() - new Date(a.treatmentDate).getTime())
}

export function getTreatmentsByClinicalVisit(dentalRecordId: string): Treatment[] {
  return getStoredTreatments()
    .filter((treatment) => treatment.dentalRecordId === dentalRecordId)
    .sort((a, b) => new Date(b.treatmentDate).getTime() - new Date(a.treatmentDate).getTime())
}

export function getTreatmentPlansByPatient(patientId: string): TreatmentPlan[] {
  const refs = patientRefs(patientId)
  return getStoredTreatmentPlans().filter((plan) => refs.has(plan.patientId))
}

export function createTreatment(values: TreatmentFormValues): Treatment {
  if (!values.treatmentDate) throw new Error('Treatment date is required.')
  if (!values.serviceId) throw new Error('Treatment service is required.')
  const patient = resolvePatient(values.patientId)
  if (!patient) throw new Error('Patient record could not be resolved for this treatment.')

  const treatments = getStoredTreatments()
  const now = new Date().toISOString()
  const service = getStoredServices().find((entry) => entry.id === values.serviceId)
  const priceSnapshotCents = values.priceSnapshotCents && values.priceSnapshotCents > 0
    ? values.priceSnapshotCents
    : service ? servicePriceToCents(service.price) : Math.max(0, Math.round(Number(values.cost || 0) * 100))
  const treatment: Treatment = {
    id: createUuid(),
    ...values,
    patientId: patient.patientId,
    serviceNameSnapshot: values.serviceNameSnapshot || service?.name || '',
    priceSnapshotCents,
    quantity: Math.max(1, values.quantity ?? 1),
    performedBy: values.performedBy || values.providerNameSnapshot || values.createdBy || getCurrentSessionUserName(),
    createdBy: values.createdBy || getCurrentSessionUserName(),
    createdAt: now,
    updatedAt: now,
  }

  treatments.push(treatment)
  saveStoredTreatments(treatments)
  void insertRemoteTableRow('treatments', remoteTreatmentRow(treatment))

  recordAuditEntry({
    user: getCurrentSessionUserName(),
    action: 'treatment_created',
    entity: 'treatment',
    entityId: treatment.patientId,
    metadata: { patientId: treatment.patientId, treatmentId: treatment.id, description: treatment.description },
  })
  return treatment
}

export function updateTreatment(id: string, values: TreatmentFormValues): Treatment | null {
  const treatments = getStoredTreatments()
  const index = treatments.findIndex((treatment) => treatment.id === id)
  if (index === -1) return null
  if (treatments[index].status === 'completed') return null
  if (!values.treatmentDate) throw new Error('Treatment date is required.')

  const service = getStoredServices().find((entry) => entry.id === values.serviceId)
  const patient = resolvePatient(values.patientId)
  const updated: Treatment = {
    ...treatments[index],
    ...values,
    patientId: patient?.patientId ?? values.patientId,
    serviceNameSnapshot: values.serviceNameSnapshot || service?.name || treatments[index].serviceNameSnapshot,
    priceSnapshotCents: values.priceSnapshotCents && values.priceSnapshotCents > 0
      ? values.priceSnapshotCents
      : service ? servicePriceToCents(service.price) : treatments[index].priceSnapshotCents,
    quantity: Math.max(1, values.quantity ?? treatments[index].quantity),
    updatedAt: new Date().toISOString(),
  }

  treatments[index] = updated
  saveStoredTreatments(treatments)
  const row = remoteTreatmentRow(updated)
  delete (row as Record<string, unknown>).id
  delete (row as Record<string, unknown>).patient_id
  void updateRemoteTableRow('treatments', id, row)
  return updated
}

export function deleteTreatment(id: string): boolean {
  const treatments = getStoredTreatments()
  const index = treatments.findIndex((treatment) => treatment.id === id)
  if (index === -1) return false
  if (treatments[index].status === 'completed') return false
  treatments.splice(index, 1)
  saveStoredTreatments(treatments)
  return true
}

export function voidTreatment(id: string, actor: string): Treatment | null {
  const treatments = getStoredTreatments()
  const index = treatments.findIndex((treatment) => treatment.id === id)
  if (index === -1) return null
  const updated = { ...treatments[index], status: 'voided' as const, updatedAt: new Date().toISOString() }
  treatments[index] = updated
  saveStoredTreatments(treatments)
  void updateRemoteTableRow('treatments', id, { status: 'voided' })
  recordAuditEntry({
    user: actor,
    action: 'treatment_created',
    entity: 'treatment',
    entityId: updated.id,
    metadata: { patientId: updated.patientId, treatmentId: updated.id, voided: true },
  })
  return updated
}

export function createTreatmentPlan(values: TreatmentPlanFormValues): TreatmentPlan {
  const plans = getStoredTreatmentPlans()
  const now = new Date().toISOString()
  const plan: TreatmentPlan = {
    id: createUuid(),
    ...values,
    createdAt: now,
    updatedAt: now,
  }
  plans.push(plan)
  saveStoredTreatmentPlans(plans)
  return plan
}

export function getServiceById(serviceId: string): Service | undefined {
  return getStoredServices().find((service) => service.id === serviceId)
}

export function getTreatmentProgress(plan: TreatmentPlan): number {
  const treatments = getStoredTreatments().filter((treatment) => plan.treatments.includes(treatment.id))
  if (!treatments.length) return 0
  const completed = treatments.filter((treatment) => treatment.status === 'completed').length
  return Math.round((completed / treatments.length) * 100)
}

export function getTreatmentPlanStatus(plan: TreatmentPlan): string {
  const progress = getTreatmentProgress(plan)
  if (progress >= 100) return 'Completed'
  if (progress > 0) return 'In Progress'
  return 'Planned'
}

export { TREATMENT_STORAGE_KEY, TREATMENT_PLAN_STORAGE_KEY }
