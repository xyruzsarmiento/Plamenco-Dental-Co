import { supabase } from '../../lib/supabase'
import { getServiceById, servicePriceToCents } from '../services/serviceStore'

export type TreatmentPlanStatus = 'draft' | 'presented' | 'accepted' | 'partially_accepted' | 'declined' | 'superseded' | 'cancelled'
export type TreatmentPlanItemStatus = 'pending' | 'accepted' | 'declined' | 'scheduled' | 'completed' | 'cancelled'

export type TreatmentPlanItem = {
  id: string
  planId: string
  serviceId?: string
  serviceNameSnapshot: string
  description: string
  quantity: number
  catalogPriceSnapshotCents?: number
  quotedPriceCents?: number
  phase: string
  status: TreatmentPlanItemStatus
  providerId?: string
  providerNameSnapshot?: string
  branchId?: string
  patientNotes: string
  internalNotes: string
  sortOrder: number
  appointmentId?: string
  treatmentId?: string
}

export type TreatmentPlan = {
  id: string
  planNumber: string
  patientId: string
  patientDbId: string
  name: string
  description: string
  branchId?: string
  providerId?: string
  providerNameSnapshot?: string
  clinicalVisitId?: string
  versionNumber: number
  supersedesPlanId?: string
  patientNotes: string
  internalNotes: string
  quotedSubtotalCents: number
  discountCents: number
  quotedTotalCents: number
  status: TreatmentPlanStatus
  presentedAt?: string
  decisionAt?: string
  decisionSource?: string
  createdAt: string
  updatedAt: string
  items: TreatmentPlanItem[]
}

export type CreateTreatmentPlanInput = {
  patientId: string
  name: string
  description?: string
  branchId?: string
  providerId?: string
  providerNameSnapshot?: string
  clinicalVisitId?: string
  patientNotes?: string
  internalNotes?: string
  items: Array<{
    serviceId: string
    serviceNameSnapshot: string
    description?: string
    quantity?: number
    catalogPriceSnapshotCents?: number
    quotedPriceCents?: number
    phase?: string
    providerId?: string
    providerNameSnapshot?: string
    branchId?: string
    patientNotes?: string
    internalNotes?: string
  }>
}

function requireSupabase() {
  if (!supabase) throw new Error('Treatment plans are unavailable because Supabase is not configured.')
  return supabase
}

async function resolvePatientDbId(patientId: string) {
  const client = requireSupabase()
  const { data, error } = await client.from('patients').select('id').eq('patient_id', patientId).maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error('Patient record could not be resolved.')
  return String(data.id)
}

function mapItem(row: Record<string, any>): TreatmentPlanItem {
  return {
    id: row.id,
    planId: row.plan_id,
    serviceId: row.service_id ?? undefined,
    serviceNameSnapshot: row.service_name_snapshot ?? '',
    description: row.description ?? '',
    quantity: Number(row.quantity ?? 1),
    catalogPriceSnapshotCents: row.catalog_price_snapshot_cents ?? undefined,
    quotedPriceCents: row.quoted_price_cents ?? undefined,
    phase: row.phase ?? '',
    status: row.status,
    providerId: row.provider_id ?? undefined,
    providerNameSnapshot: row.provider_name_snapshot ?? undefined,
    branchId: row.branch_id ?? undefined,
    patientNotes: row.patient_notes ?? '',
    internalNotes: row.internal_notes ?? '',
    sortOrder: Number(row.sort_order ?? 0),
    appointmentId: row.appointment_id ?? undefined,
    treatmentId: row.treatment_id ?? undefined,
  }
}

function mapPlan(row: Record<string, any>, patientPublicId: string, items: TreatmentPlanItem[]): TreatmentPlan {
  return {
    id: row.id,
    planNumber: row.plan_number ?? `TP-${String(row.id).slice(0, 8).toUpperCase()}`,
    patientId: patientPublicId,
    patientDbId: row.patient_id,
    name: row.name ?? 'Treatment Plan',
    description: row.description ?? '',
    branchId: row.branch_id ?? undefined,
    providerId: row.provider_id ?? undefined,
    providerNameSnapshot: row.provider_name_snapshot ?? undefined,
    clinicalVisitId: row.clinical_visit_id ?? undefined,
    versionNumber: Number(row.version_number ?? 1),
    supersedesPlanId: row.supersedes_plan_id ?? undefined,
    patientNotes: row.patient_notes ?? '',
    internalNotes: row.internal_notes ?? '',
    quotedSubtotalCents: Number(row.quoted_subtotal_cents ?? 0),
    discountCents: Number(row.discount_cents ?? 0),
    quotedTotalCents: Number(row.quoted_total_cents ?? 0),
    status: row.status,
    presentedAt: row.presented_at ?? undefined,
    decisionAt: row.decision_at ?? undefined,
    decisionSource: row.decision_source ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
  }
}

export async function getTreatmentPlansByPatientId(patientId: string): Promise<TreatmentPlan[]> {
  const client = requireSupabase()
  const patientDbId = await resolvePatientDbId(patientId)
  const { data: plans, error } = await client
    .from('treatment_plans')
    .select('*')
    .eq('patient_id', patientDbId)
    .order('created_at', { ascending: false })
  if (error) throw error
  if (!plans?.length) return []

  const ids = plans.map((plan) => plan.id)
  const { data: items, error: itemsError } = await client
    .from('treatment_plan_items')
    .select('*')
    .in('plan_id', ids)
    .order('sort_order', { ascending: true })
  if (itemsError) throw itemsError

  const grouped = new Map<string, TreatmentPlanItem[]>()
  for (const row of items ?? []) {
    const mapped = mapItem(row)
    grouped.set(mapped.planId, [...(grouped.get(mapped.planId) ?? []), mapped])
  }

  return plans.map((plan) => mapPlan(plan, patientId, grouped.get(plan.id) ?? []))
}

export async function createTreatmentPlan(input: CreateTreatmentPlanInput): Promise<TreatmentPlan> {
  if (!input.items.length) throw new Error('Add at least one recommended procedure.')
  const client = requireSupabase()
  const patientDbId = await resolvePatientDbId(input.patientId)

  const pricedItems = input.items.map((item) => {
    const catalogueService = getServiceById(item.serviceId)
    const catalogueCents = catalogueService ? servicePriceToCents(catalogueService.price) : item.catalogPriceSnapshotCents
    const quotedCents = catalogueService ? servicePriceToCents(catalogueService.price) : item.quotedPriceCents
    return {
      ...item,
      serviceNameSnapshot: catalogueService?.name ?? item.serviceNameSnapshot,
      description: item.description ?? catalogueService?.description ?? '',
      catalogPriceSnapshotCents: catalogueCents,
      quotedPriceCents: quotedCents,
    }
  })

  const invalidPrice = pricedItems.some((item) => item.quotedPriceCents == null || item.quotedPriceCents < 0)
  if (invalidPrice) throw new Error('Every quoted item must have a configured price before the plan can be saved.')

  const subtotal = pricedItems.reduce((sum, item) => sum + Number(item.quotedPriceCents ?? 0) * Math.max(1, Number(item.quantity ?? 1)), 0)
  const { data: plan, error } = await client
    .from('treatment_plans')
    .insert({
      patient_id: patientDbId,
      name: input.name.trim() || 'Treatment Plan',
      description: input.description?.trim() ?? '',
      treatments: [],
      overall_cost: subtotal / 100,
      amount_paid: 0,
      status: 'draft',
      branch_id: input.branchId ?? null,
      provider_id: input.providerId ?? null,
      provider_name_snapshot: input.providerNameSnapshot ?? '',
      clinical_visit_id: input.clinicalVisitId ?? null,
      version_number: 1,
      patient_notes: input.patientNotes?.trim() ?? '',
      internal_notes: input.internalNotes?.trim() ?? '',
      quoted_subtotal_cents: subtotal,
      discount_cents: 0,
      quoted_total_cents: subtotal,
    })
    .select('*')
    .single()
  if (error) throw error

  const planNumber = `TP-${String(plan.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`
  const { data: numberedPlan, error: numberError } = await client
    .from('treatment_plans')
    .update({ plan_number: planNumber })
    .eq('id', plan.id)
    .select('*')
    .single()
  if (numberError) throw numberError

  const itemRows = pricedItems.map((item, index) => ({
    plan_id: plan.id,
    service_id: item.serviceId,
    service_name_snapshot: item.serviceNameSnapshot,
    description: item.description?.trim() ?? '',
    quantity: Math.max(1, Number(item.quantity ?? 1)),
    catalog_price_snapshot_cents: item.catalogPriceSnapshotCents ?? item.quotedPriceCents ?? null,
    quoted_price_cents: item.quotedPriceCents ?? null,
    phase: item.phase?.trim() ?? '',
    status: 'pending',
    provider_id: item.providerId ?? input.providerId ?? null,
    provider_name_snapshot: item.providerNameSnapshot ?? input.providerNameSnapshot ?? '',
    branch_id: item.branchId ?? input.branchId ?? null,
    patient_notes: item.patientNotes?.trim() ?? '',
    internal_notes: item.internalNotes?.trim() ?? '',
    sort_order: index,
  }))
  const { data: createdItems, error: itemError } = await client.from('treatment_plan_items').insert(itemRows).select('*')
  if (itemError) throw itemError

  await client.from('treatment_plan_events').insert({
    plan_id: plan.id,
    event_type: 'plan_created',
    source: 'internal',
    metadata: { plan_number: planNumber, item_count: itemRows.length },
  })

  return mapPlan(numberedPlan, input.patientId, (createdItems ?? []).map(mapItem))
}

export async function presentTreatmentPlan(planId: string) {
  const client = requireSupabase()
  const now = new Date().toISOString()
  const { data: authData } = await client.auth.getUser()
  const { data, error } = await client
    .from('treatment_plans')
    .update({ status: 'presented', presented_at: now, presented_by: authData.user?.id ?? null })
    .eq('id', planId)
    .eq('status', 'draft')
    .select('id,status,presented_at')
    .single()
  if (error) throw error
  await client.from('treatment_plan_events').insert({
    plan_id: planId,
    event_type: 'plan_presented',
    actor_auth_user_id: authData.user?.id ?? null,
    source: 'internal',
    metadata: {},
  })
  return data
}

export async function respondToTreatmentPlan(planId: string, decisions: Record<string, 'accepted' | 'declined'>) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('respond_to_treatment_plan', {
    p_plan_id: planId,
    p_item_decisions: decisions,
    p_source: 'patient_portal',
  })
  if (error) throw error
  return data as TreatmentPlanStatus
}

export function formatTreatmentPlanCurrency(cents?: number) {
  if (cents == null) return 'Not recorded'
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100)
}
