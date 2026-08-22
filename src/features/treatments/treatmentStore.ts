import type { Service } from '../services/serviceTypes'
import { getStoredServices, servicePriceToCents } from '../services/serviceStore'
import { getStoredPatients } from '../patients/patientStore'
import { recordAuditEntry } from '../security/auditLogStore'
import { getCurrentSessionUserName } from '../security/security'
import { supabase } from '../../lib/supabase'
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

function patientReferenceFromDatabaseId(patientId: string) {
  return getStoredPatients().find((patient) => patient.id === patientId)?.patientId ?? patientId
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

function mapTreatmentRow(row: Record<string, any>): Treatment {
  return normalizeTreatment({
    id: String(row.id),
    patientId: patientReferenceFromDatabaseId(String(row.patient_id ?? '')),
    dentalRecordId: row.dental_record_id ?? undefined,
    appointmentId: row.appointment_id ?? undefined,
    appointmentNumber: row.appointment_number ?? undefined,
    branchId: row.branch_id ?? undefined,
    providerId: row.provider_id ?? undefined,
    providerNameSnapshot: row.provider_name_snapshot ?? '',
    serviceId: String(row.service_id ?? ''),
    serviceNameSnapshot: row.service_name_snapshot ?? '',
    toothNumber: row.tooth_number ?? undefined,
    description: row.description ?? '',
    cost: Number(row.cost ?? 0),
    priceSnapshotCents: Number(row.price_snapshot_cents ?? 0),
    quantity: Number(row.quantity ?? 1),
    status: row.status ?? 'planned',
    treatmentDate: row.treatment_date ?? '',
    notes: row.notes ?? '',
    performedBy: row.performed_by ?? '',
    createdBy: row.created_by ?? '',
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  })
}

function mapTreatmentPlanRow(row: Record<string, any>): TreatmentPlan {
  return {
    id: String(row.id),
    patientId: patientReferenceFromDatabaseId(String(row.patient_id ?? '')),
    name: row.name ?? '',
    description: row.description ?? '',
    treatments: Array.isArray(row.treatments) ? row.treatments.map(String) : [],
    overallCost: Number(row.overall_cost ?? 0),
    amountPaid: Number(row.amount_paid ?? 0),
    status: row.status ?? 'planned',
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }
}

function replaceCachedTreatment(confirmed: Treatment) {
  saveStoredTreatments([confirmed, ...getStoredTreatments().filter((entry) => entry.id !== confirmed.id)])
}

function replaceCachedTreatmentPlan(confirmed: TreatmentPlan) {
  saveStoredTreatmentPlans([confirmed, ...getStoredTreatmentPlans().filter((entry) => entry.id !== confirmed.id)])
}

function persistenceError(message: string, cause?: { message?: string } | null) {
  if (import.meta.env.DEV && cause?.message) console.error('[treatment persistence]', cause)
  return new Error(message)
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

export async function createTreatment(values: TreatmentFormValues): Promise<Treatment> {
  if (!supabase) throw new Error('Clinic database is not configured. Treatment records cannot be saved safely.')
  if (!values.treatmentDate) throw new Error('Treatment date is required.')
  if (!values.serviceId) throw new Error('Treatment service is required.')
  const patient = resolvePatient(values.patientId)
  if (!patient) throw new Error('Patient record could not be resolved for this treatment.')

  const service = getStoredServices().find((entry) => entry.id === values.serviceId)
  const priceSnapshotCents = values.priceSnapshotCents && values.priceSnapshotCents > 0
    ? values.priceSnapshotCents
    : service ? servicePriceToCents(service.price) : Math.max(0, Math.round(Number(values.cost || 0) * 100))
  const draft: Treatment = {
    id: '',
    ...values,
    patientId: patient.patientId,
    serviceNameSnapshot: values.serviceNameSnapshot || service?.name || '',
    priceSnapshotCents,
    quantity: Math.max(1, values.quantity ?? 1),
    performedBy: values.performedBy || values.providerNameSnapshot || values.createdBy || getCurrentSessionUserName(),
    createdBy: values.createdBy || getCurrentSessionUserName(),
    createdAt: '',
    updatedAt: '',
  }

  const { data, error } = await supabase.from('treatments').insert(remoteTreatmentRow(draft)).select('*').single()
  if (error || !data) throw persistenceError('Treatment could not be saved. Your changes were not submitted.', error)

  const confirmed = mapTreatmentRow(data as Record<string, any>)
  replaceCachedTreatment(confirmed)
  recordAuditEntry({
    user: getCurrentSessionUserName(),
    action: 'treatment_created',
    entity: 'treatment',
    entityId: confirmed.patientId,
    metadata: { patientId: confirmed.patientId, treatmentId: confirmed.id, description: confirmed.description },
  })
  return confirmed
}

export async function updateTreatment(id: string, values: TreatmentFormValues): Promise<Treatment> {
  if (!supabase) throw new Error('Clinic database is not configured. Treatment records cannot be saved safely.')
  const current = getStoredTreatments().find((treatment) => treatment.id === id)
  if (!current) throw new Error('Treatment record was not found.')
  if (current.status === 'completed' || current.status === 'voided') throw new Error('Completed or voided treatment records cannot be edited.')
  if (!values.treatmentDate) throw new Error('Treatment date is required.')

  const service = getStoredServices().find((entry) => entry.id === values.serviceId)
  const patient = resolvePatient(values.patientId)
  if (!patient) throw new Error('Patient record could not be resolved for this treatment.')
  const candidate: Treatment = {
    ...current,
    ...values,
    id: current.id,
    patientId: patient.patientId,
    serviceNameSnapshot: values.serviceNameSnapshot || service?.name || current.serviceNameSnapshot,
    priceSnapshotCents: values.priceSnapshotCents && values.priceSnapshotCents > 0
      ? values.priceSnapshotCents
      : service ? servicePriceToCents(service.price) : current.priceSnapshotCents,
    quantity: Math.max(1, values.quantity ?? current.quantity),
    createdBy: current.createdBy,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
  }
  const row = remoteTreatmentRow(candidate) as Record<string, unknown>
  delete row.patient_id
  delete row.created_by

  const { data, error } = await supabase
    .from('treatments')
    .update(row)
    .eq('id', id)
    .eq('updated_at', current.updatedAt)
    .not('status', 'in', '(completed,voided)')
    .select('*')
    .maybeSingle()

  if (error) throw persistenceError('Treatment could not be updated.', error)
  if (!data) throw new Error('This treatment was already changed or is no longer editable. Refresh and try again.')
  const confirmed = mapTreatmentRow(data as Record<string, any>)
  replaceCachedTreatment(confirmed)
  return confirmed
}

export async function deleteTreatment(id: string, actor = getCurrentSessionUserName()): Promise<boolean> {
  const current = getStoredTreatments().find((treatment) => treatment.id === id)
  if (!current) return false
  await voidTreatment(id, actor)
  return true
}

export async function voidTreatment(id: string, actor: string): Promise<Treatment> {
  if (!supabase) throw new Error('Clinic database is not configured. Treatment records cannot be voided safely.')
  const current = getStoredTreatments().find((treatment) => treatment.id === id)
  if (!current) throw new Error('Treatment record was not found.')
  if (current.status === 'completed') throw new Error('Completed treatment history cannot be voided from this workflow.')
  if (current.status === 'voided') return current

  const { data, error } = await supabase
    .from('treatments')
    .update({ status: 'voided' })
    .eq('id', id)
    .eq('updated_at', current.updatedAt)
    .neq('status', 'completed')
    .select('*')
    .maybeSingle()

  if (error) throw persistenceError('Treatment could not be voided.', error)
  if (!data) throw new Error('This treatment was already changed. Refresh and try again.')
  const confirmed = mapTreatmentRow(data as Record<string, any>)
  replaceCachedTreatment(confirmed)
  recordAuditEntry({
    user: actor,
    action: 'treatment_updated',
    entity: 'treatment',
    entityId: confirmed.id,
    metadata: { patientId: confirmed.patientId, treatmentId: confirmed.id, voided: true },
  })
  return confirmed
}

export async function createTreatmentPlan(values: TreatmentPlanFormValues): Promise<TreatmentPlan> {
  if (!supabase) throw new Error('Clinic database is not configured. Treatment plans cannot be saved safely.')
  const patient = resolvePatient(values.patientId)
  if (!patient) throw new Error('Patient record could not be resolved for this treatment plan.')
  if (!values.name.trim()) throw new Error('Treatment plan name is required.')

  const { data, error } = await supabase
    .from('treatment_plans')
    .insert({
      patient_id: patient.id,
      name: values.name.trim(),
      description: values.description ?? '',
      treatments: values.treatments ?? [],
      overall_cost: values.overallCost ?? 0,
      amount_paid: values.amountPaid ?? 0,
      status: values.status ?? 'planned',
    })
    .select('*')
    .single()

  if (error || !data) throw persistenceError('Treatment plan could not be saved.', error)
  const confirmed = mapTreatmentPlanRow(data as Record<string, any>)
  replaceCachedTreatmentPlan(confirmed)
  return confirmed
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
