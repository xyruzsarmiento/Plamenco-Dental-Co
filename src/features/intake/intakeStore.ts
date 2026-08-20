import { supabase } from '../../lib/supabase'

export type IntakeStatus = 'not_started' | 'in_progress' | 'submitted' | 'needs_review' | 'complete' | 'needs_update'
export type ConsentStatus = 'assigned' | 'viewed' | 'in_progress' | 'signed' | 'declined' | 'superseded'

export type PatientIntake = {
  id: string
  patientId: string
  appointmentId?: string
  branchId?: string
  status: IntakeStatus
  medicalHistoryConfirmedAt?: string
  submittedAt?: string
  reviewedAt?: string
  source: 'patient' | 'staff' | 'historical_import'
  createdAt: string
  updatedAt: string
}

export type MedicalHistoryRevision = {
  id: string
  patientId: string
  intakeId?: string
  allergies: string
  medicalConditions: string
  currentMedications: string
  previousSurgeries: string
  medicalNotes: string
  confirmedNoAllergies: boolean
  source: 'patient' | 'staff' | 'dentist' | 'associate_dentist' | 'historical_import'
  changedAt: string
}

export type AssignedPatientForm = {
  assignmentId: string
  patientId: string
  templateVersionId: string
  status: ConsentStatus
  appointmentId?: string
  clinicalVisitId?: string
  branchId?: string
  assignedAt: string
  title: string
  description: string
  category: string
  versionNumber: number
  content: string
  requiresSignature: boolean
}

function requireSupabase() {
  if (!supabase) throw new Error('Patient intake is unavailable because the database connection is not configured.')
  return supabase
}

function mapIntake(row: Record<string, any>): PatientIntake {
  return {
    id: row.id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id ?? undefined,
    branchId: row.branch_id ?? undefined,
    status: row.status,
    medicalHistoryConfirmedAt: row.medical_history_confirmed_at ?? undefined,
    submittedAt: row.submitted_at ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getLatestPatientIntake(patientId: string) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('patient_intakes')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data ? mapIntake(data) : null
}

export async function ensurePatientIntake(patientId: string, appointmentId?: string, branchId?: string) {
  const client = requireSupabase()
  const existingQuery = client.from('patient_intakes').select('*').eq('patient_id', patientId)
  const scopedQuery = appointmentId ? existingQuery.eq('appointment_id', appointmentId) : existingQuery.is('appointment_id', null)
  const { data: existing, error: lookupError } = await scopedQuery.limit(1).maybeSingle()
  if (lookupError) throw lookupError
  if (existing) return mapIntake(existing)

  const { data, error } = await client
    .from('patient_intakes')
    .insert({
      patient_id: patientId,
      appointment_id: appointmentId ?? null,
      branch_id: branchId ?? null,
      status: 'in_progress',
      source: 'patient',
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      const retryQuery = client.from('patient_intakes').select('*').eq('patient_id', patientId)
      const scopedRetry = appointmentId ? retryQuery.eq('appointment_id', appointmentId) : retryQuery.is('appointment_id', null)
      const { data: retried, error: retryError } = await scopedRetry.limit(1).single()
      if (retryError) throw retryError
      return mapIntake(retried)
    }
    throw error
  }
  return mapIntake(data)
}

export async function getMedicalHistoryRevisions(patientId: string, limit = 20): Promise<MedicalHistoryRevision[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('medical_history_revisions')
    .select('*')
    .eq('patient_id', patientId)
    .order('changed_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    patientId: row.patient_id,
    intakeId: row.intake_id ?? undefined,
    allergies: row.allergies ?? '',
    medicalConditions: row.medical_conditions ?? '',
    currentMedications: row.current_medications ?? '',
    previousSurgeries: row.previous_surgeries ?? '',
    medicalNotes: row.medical_notes ?? '',
    confirmedNoAllergies: Boolean(row.confirmed_no_allergies),
    source: row.source,
    changedAt: row.changed_at,
  }))
}

export async function savePatientMedicalHistory(input: {
  patientId: string
  intakeId?: string
  allergies: string
  medicalConditions: string
  currentMedications: string
  previousSurgeries: string
  medicalNotes: string
  confirmedNoAllergies: boolean
}) {
  const client = requireSupabase()
  const { data: authData, error: authError } = await client.auth.getUser()
  if (authError) throw authError
  if (!authData.user) throw new Error('Your session has expired. Please sign in again.')

  const now = new Date().toISOString()
  const { error: revisionError } = await client.from('medical_history_revisions').insert({
    patient_id: input.patientId,
    intake_id: input.intakeId ?? null,
    allergies: input.allergies.trim(),
    medical_conditions: input.medicalConditions.trim(),
    current_medications: input.currentMedications.trim(),
    previous_surgeries: input.previousSurgeries.trim(),
    medical_notes: input.medicalNotes.trim(),
    confirmed_no_allergies: input.confirmedNoAllergies,
    source: 'patient',
    changed_by: authData.user.id,
  })
  if (revisionError) throw revisionError

  const { error: patientError } = await client
    .from('patients')
    .update({
      allergies: input.confirmedNoAllergies ? '' : input.allergies.trim(),
      medical_conditions: input.medicalConditions.trim(),
      current_medications: input.currentMedications.trim(),
      previous_surgeries: input.previousSurgeries.trim(),
      medical_notes: input.medicalNotes.trim(),
      updated_at: now,
    })
    .eq('patient_id', input.patientId)
  if (patientError) throw patientError

  if (input.intakeId) {
    const { error: intakeError } = await client
      .from('patient_intakes')
      .update({ medical_history_confirmed_at: now, status: 'in_progress', updated_at: now })
      .eq('id', input.intakeId)
    if (intakeError) throw intakeError
  }

  return now
}

export async function getAssignedPatientForms(patientId: string): Promise<AssignedPatientForm[]> {
  const client = requireSupabase()
  const { data: assignments, error } = await client
    .from('patient_form_assignments')
    .select('id,patient_id,template_version_id,status,appointment_id,clinical_visit_id,branch_id,assigned_at')
    .eq('patient_id', patientId)
    .order('assigned_at', { ascending: false })

  if (error) throw error
  if (!assignments?.length) return []

  const versionIds = [...new Set(assignments.map((assignment) => assignment.template_version_id))]
  const { data: versions, error: versionError } = await client
    .from('form_template_versions')
    .select('id,template_id,version_number,content,requires_signature')
    .in('id', versionIds)
  if (versionError) throw versionError

  const templateIds = [...new Set((versions ?? []).map((version) => version.template_id))]
  const { data: templates, error: templateError } = templateIds.length
    ? await client.from('form_templates').select('id,title,description,category').in('id', templateIds)
    : { data: [], error: null }
  if (templateError) throw templateError

  const versionMap = new Map((versions ?? []).map((version) => [version.id, version]))
  const templateMap = new Map((templates ?? []).map((template) => [template.id, template]))

  return assignments.map((assignment) => {
    const version = versionMap.get(assignment.template_version_id)
    const template = version ? templateMap.get(version.template_id) : undefined
    return {
      assignmentId: assignment.id,
      patientId: assignment.patient_id,
      templateVersionId: assignment.template_version_id,
      status: assignment.status,
      appointmentId: assignment.appointment_id ?? undefined,
      clinicalVisitId: assignment.clinical_visit_id ?? undefined,
      branchId: assignment.branch_id ?? undefined,
      assignedAt: assignment.assigned_at,
      title: template?.title ?? 'Clinic form',
      description: template?.description ?? '',
      category: template?.category ?? 'other',
      versionNumber: version?.version_number ?? 0,
      content: version?.content ?? '',
      requiresSignature: Boolean(version?.requires_signature),
    }
  })
}

export async function markAssignedFormViewed(assignmentId: string) {
  const client = requireSupabase()
  const { error } = await client
    .from('patient_form_assignments')
    .update({ status: 'viewed', viewed_at: new Date().toISOString() })
    .eq('id', assignmentId)
    .eq('status', 'assigned')
  if (error) throw error
}

export async function submitAssignedForm(input: {
  form: AssignedPatientForm
  signedByName: string
  decline?: boolean
}) {
  const client = requireSupabase()
  const { data: authData, error: authError } = await client.auth.getUser()
  if (authError) throw authError
  if (!authData.user) throw new Error('Your session has expired. Please sign in again.')

  const status = input.decline ? 'declined' : 'signed'
  if (!input.decline && input.form.requiresSignature && !input.signedByName.trim()) {
    throw new Error('Enter the signer name before submitting this form.')
  }

  const submittedAt = new Date().toISOString()
  const { error } = await client.from('patient_form_submissions').insert({
    assignment_id: input.form.assignmentId,
    patient_id: input.form.patientId,
    template_version_id: input.form.templateVersionId,
    form_content_snapshot: input.form.content,
    response_data: {},
    status,
    signed_by_name: input.decline ? null : input.signedByName.trim(),
    signed_at: input.decline ? null : submittedAt,
    submitted_by: authData.user.id,
    submitted_at: submittedAt,
    appointment_id: input.form.appointmentId ?? null,
    clinical_visit_id: input.form.clinicalVisitId ?? null,
    branch_id: input.form.branchId ?? null,
  })
  if (error) {
    if (error.code === '23505') throw new Error('This form has already been submitted.')
    throw error
  }

  const { error: assignmentError } = await client
    .from('patient_form_assignments')
    .update({ status, completed_at: submittedAt })
    .eq('id', input.form.assignmentId)
  if (assignmentError) throw assignmentError

  return submittedAt
}

export async function submitPatientIntake(intakeId: string) {
  const client = requireSupabase()
  const submittedAt = new Date().toISOString()
  const { data, error } = await client
    .from('patient_intakes')
    .update({ status: 'submitted', submitted_at: submittedAt, updated_at: submittedAt })
    .eq('id', intakeId)
    .select('*')
    .single()
  if (error) throw error
  return mapIntake(data)
}
