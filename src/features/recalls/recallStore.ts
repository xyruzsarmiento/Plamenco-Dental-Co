import { supabase } from '../../lib/supabase'

export type RecallKind = 'recall' | 'follow_up'
export type RecallStatus = 'open' | 'contacted' | 'waiting_patient' | 'booked' | 'needs_rescheduling' | 'completed' | 'dismissed' | 'cancelled'
export type RecallSource = 'clinical_recommendation' | 'completed_treatment' | 'service_rule' | 'manual' | 'historical_import' | 'treatment_plan' | 'other_configured_rule'
export type RecallContactChannel = 'phone' | 'walk_in' | 'sms' | 'email' | 'messenger' | 'in_app' | 'manual_message'
export type RecallContactOutcome = 'reached' | 'no_answer' | 'left_message' | 'patient_will_call' | 'patient_requested_booking' | 'patient_declined' | 'invalid_contact' | 'queued' | 'sent' | 'delivered' | 'failed' | 'cancelled'

export type RecallQueueItem = {
  id: string
  patientId: string
  patientName: string
  phone: string
  email: string
  kind: RecallKind
  sourceType: RecallSource
  sourceId?: string
  branchId?: string
  providerId?: string
  providerName: string
  serviceId?: string
  dueDate?: string
  reason: string
  patientMessage: string
  status: RecallStatus
  linkedAppointmentId?: string
  lastContactAt?: string
  createdAt: string
  updatedAt: string
}

export type RecallContactAttempt = {
  id: string
  recallId: string
  channel: RecallContactChannel
  outcome: RecallContactOutcome
  destinationMasked: string
  notes: string
  deliveryLogId?: string
  attemptedAt: string
}

function client() {
  if (!supabase) throw new Error('Recall & Follow-Up is unavailable because the database connection is not configured.')
  return supabase
}

function manilaBusinessDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function getRecallDueBucket(recall: Pick<RecallQueueItem, 'status' | 'dueDate'>) {
  if (['completed', 'dismissed', 'cancelled'].includes(recall.status)) return recall.status
  if (recall.status === 'booked') return 'booked'
  if (!recall.dueDate) return 'no_date'
  const today = manilaBusinessDate()
  if (recall.dueDate < today) return 'overdue'
  if (recall.dueDate === today) return 'due_today'
  return 'upcoming'
}

function mapRecall(row: Record<string, any>, patient?: Record<string, any>): RecallQueueItem {
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: patient ? `${patient.first_name ?? ''} ${patient.last_name ?? ''}`.trim() || row.patient_id : row.patient_id,
    phone: patient?.phone ?? '',
    email: patient?.email ?? '',
    kind: row.kind,
    sourceType: row.source_type,
    sourceId: row.source_id ?? undefined,
    branchId: row.branch_id ?? undefined,
    providerId: row.provider_id ?? undefined,
    providerName: row.provider_name_snapshot || row.historical_provider_text || 'Unknown / Unmapped Provider',
    serviceId: row.service_id ?? undefined,
    dueDate: row.due_date ?? undefined,
    reason: row.reason ?? '',
    patientMessage: row.patient_message ?? '',
    status: row.status,
    linkedAppointmentId: row.linked_appointment_id ?? undefined,
    lastContactAt: row.last_contact_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listRecallQueue(input?: {
  branchId?: string
  providerId?: string
  status?: RecallStatus
  kind?: RecallKind
  limit?: number
}) {
  const db = client()
  let query = db
    .from('patient_recalls')
    .select('*')
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(Math.min(Math.max(input?.limit ?? 200, 1), 500))

  if (input?.branchId) query = query.eq('branch_id', input.branchId)
  if (input?.providerId) query = query.eq('provider_id', input.providerId)
  if (input?.status) query = query.eq('status', input.status)
  if (input?.kind) query = query.eq('kind', input.kind)

  const { data: recalls, error } = await query
  if (error) throw error
  if (!recalls?.length) return []

  const patientIds = [...new Set(recalls.map((row) => row.patient_id))]
  const { data: patients, error: patientError } = await db
    .from('patients')
    .select('patient_id,first_name,last_name,phone,email')
    .in('patient_id', patientIds)
  if (patientError) throw patientError

  const patientMap = new Map((patients ?? []).map((patient) => [patient.patient_id, patient]))
  return recalls.map((row) => mapRecall(row, patientMap.get(row.patient_id)))
}

export async function listPatientRecalls(patientId: string) {
  const db = client()
  const { data, error } = await db
    .from('patient_recalls')
    .select('*')
    .eq('patient_id', patientId)
    .order('due_date', { ascending: false, nullsFirst: false })
  if (error) throw error
  return (data ?? []).map((row) => mapRecall(row))
}

export async function getRecallContactAttempts(recallId: string) {
  const db = client()
  const { data, error } = await db
    .from('recall_contact_attempts')
    .select('*')
    .eq('recall_id', recallId)
    .order('attempted_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []).map((row): RecallContactAttempt => ({
    id: row.id,
    recallId: row.recall_id,
    channel: row.channel,
    outcome: row.outcome,
    destinationMasked: row.destination_masked ?? '',
    notes: row.notes ?? '',
    deliveryLogId: row.communication_delivery_log_id ?? undefined,
    attemptedAt: row.attempted_at,
  }))
}

export async function createManualRecall(input: {
  patientId: string
  kind: RecallKind
  dueDate?: string
  reason: string
  branchId?: string
  providerId?: string
  providerName?: string
  patientMessage?: string
}) {
  if (!input.reason.trim()) throw new Error('A recall or follow-up reason is required.')
  const db = client()
  const { data: authData, error: authError } = await db.auth.getUser()
  if (authError) throw authError
  if (!authData.user) throw new Error('Your session has expired. Please sign in again.')

  const { data, error } = await db
    .from('patient_recalls')
    .insert({
      patient_id: input.patientId,
      kind: input.kind,
      source_type: 'manual',
      due_date: input.dueDate || null,
      reason: input.reason.trim(),
      branch_id: input.branchId || null,
      provider_id: input.providerId || null,
      provider_name_snapshot: input.providerName?.trim() || '',
      patient_message: input.patientMessage?.trim() || '',
      created_by: authData.user.id,
      source_recorded_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('An equivalent active recall already exists for this patient and due date.')
    throw error
  }
  return mapRecall(data)
}

export async function recordManualRecallContact(input: {
  recallId: string
  channel: 'phone' | 'walk_in' | 'manual_message'
  outcome: Exclude<RecallContactOutcome, 'queued' | 'sent' | 'delivered' | 'failed' | 'cancelled'>
  notes?: string
  destinationMasked?: string
  idempotencyKey?: string
}) {
  const db = client()
  const key = input.idempotencyKey ?? `manual:${input.recallId}:${crypto.randomUUID()}`
  const { data, error } = await db.rpc('record_recall_contact', {
    p_recall_id: input.recallId,
    p_channel: input.channel,
    p_outcome: input.outcome,
    p_idempotency_key: key,
    p_notes: input.notes ?? '',
    p_destination_masked: input.destinationMasked ?? '',
    p_delivery_log_id: null,
  })
  if (error) throw error
  return data as string
}

export async function linkRecallToAppointment(recallId: string, appointmentId: string) {
  if (!appointmentId.trim()) throw new Error('Appointment ID is required.')
  const { error } = await client().rpc('link_recall_appointment', {
    p_recall_id: recallId,
    p_appointment_id: appointmentId.trim(),
  })
  if (error) throw error
}

export async function completeRecall(recallId: string, appointmentId?: string) {
  const { error } = await client().rpc('complete_patient_recall', {
    p_recall_id: recallId,
    p_appointment_id: appointmentId ?? null,
  })
  if (error) throw error
}

export async function dismissRecall(recallId: string, reason: string) {
  const db = client()
  const { data: authData, error: authError } = await db.auth.getUser()
  if (authError) throw authError
  if (!authData.user) throw new Error('Your session has expired. Please sign in again.')
  const now = new Date().toISOString()
  const { error } = await db
    .from('patient_recalls')
    .update({
      status: 'dismissed',
      dismissal_reason: reason.trim(),
      dismissed_at: now,
      dismissed_by: authData.user.id,
      updated_at: now,
    })
    .eq('id', recallId)
  if (error) throw error
}
