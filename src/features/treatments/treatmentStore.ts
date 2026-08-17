import type { Service } from '../services/serviceTypes'
import { getStoredServices } from '../services/serviceStore'
import { recordAuditEntry } from '../security/auditLogStore'
import { getCurrentSessionUserName } from '../security/security'
import { insertRemoteTableRow, updateRemoteTableRow } from '../../lib/supabaseSync'
import type { Treatment, TreatmentPlan, TreatmentFormValues, TreatmentPlanFormValues } from './treatmentTypes'

const TREATMENT_STORAGE_KEY = 'plamenco.treatments'
const TREATMENT_PLAN_STORAGE_KEY = 'plamenco.treatmentPlans'

const seedTreatments: Treatment[] = []

const seedTreatmentPlans: TreatmentPlan[] = []

function safeParseTreatments<T>(value: string | null): T | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as T
    return parsed
  } catch {
    return null
  }
}

export function getStoredTreatments(): Treatment[] {
  const stored = safeParseTreatments<Treatment[]>(window.localStorage.getItem(TREATMENT_STORAGE_KEY))
  if (stored?.length) return stored

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
  return getStoredTreatments()
    .filter((treatment) => treatment.patientId === patientId)
    .sort((a, b) => new Date(b.treatmentDate).getTime() - new Date(a.treatmentDate).getTime())
}

export function getTreatmentPlansByPatient(patientId: string): TreatmentPlan[] {
  return getStoredTreatmentPlans().filter((plan) => plan.patientId === patientId)
}

export function createTreatment(values: TreatmentFormValues): Treatment {
  const treatments = getStoredTreatments()
  const now = new Date().toISOString()
  const treatment: Treatment = {
    id: `treatment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    ...values,
    createdAt: now,
    updatedAt: now,
  }

  treatments.push(treatment)
  saveStoredTreatments(treatments)
  
  // Persist to Supabase asynchronously
  void insertRemoteTableRow('treatments', {
    id: treatment.id,
    patient_id: treatment.patientId,
    dental_record_id: treatment.dentalRecordId,
    service_id: treatment.serviceId,
    tooth_number: treatment.toothNumber,
    description: treatment.description,
    cost: treatment.cost,
    status: treatment.status,
    treatment_date: treatment.treatmentDate,
    notes: treatment.notes,
  })
  
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

  const updated: Treatment = {
    ...treatments[index],
    ...values,
    updatedAt: new Date().toISOString(),
  }

  treatments[index] = updated
  saveStoredTreatments(treatments)
  
  // Persist to Supabase asynchronously
  void updateRemoteTableRow('treatments', id, {
    description: updated.description,
    cost: updated.cost,
    status: updated.status,
    treatment_date: updated.treatmentDate,
    notes: updated.notes,
  })
  
  return updated
}

export function deleteTreatment(id: string): boolean {
  const treatments = getStoredTreatments()
  const index = treatments.findIndex((treatment) => treatment.id === id)

  if (index === -1) return false

  treatments.splice(index, 1)
  saveStoredTreatments(treatments)
  return true
}

export function createTreatmentPlan(values: TreatmentPlanFormValues): TreatmentPlan {
  const plans = getStoredTreatmentPlans()
  const now = new Date().toISOString()
  const plan: TreatmentPlan = {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
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
