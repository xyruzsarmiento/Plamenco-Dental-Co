import { supabase } from '../../lib/supabase'

export type FormTemplateStatus = 'draft' | 'published' | 'archived'
export type FormVersionStatus = 'draft' | 'published' | 'archived'
export type SignatureMethod = 'none' | 'typed_acknowledgement' | 'drawn'
export type FormCategory = 'patient_registration' | 'medical_history' | 'general_consent' | 'data_privacy' | 'treatment_specific' | 'photo_image' | 'other'
export type FormAppliesTo = 'new_patient' | 'clinic_wide' | 'appointment' | 'treatment' | 'manual'

export type FormTemplateAdminRow = {
  id: string
  title: string
  description: string
  category: FormCategory
  status: FormTemplateStatus
  appliesTo: FormAppliesTo
  branchId?: string
  currentVersionId?: string
  currentVersionNumber?: number
  currentVersionStatus?: FormVersionStatus
  requiresSignature?: boolean
  signatureMethod?: SignatureMethod
  effectiveDate?: string
  createdAt: string
  updatedAt: string
}

export type FormVersionAdminRow = {
  id: string
  templateId: string
  versionNumber: number
  content: string
  requiresSignature: boolean
  signatureMethod: SignatureMethod
  effectiveDate?: string
  publishedAt?: string
  publishedBy?: string
  versionStatus: FormVersionStatus
  createdAt: string
  updatedAt: string
}

export type FormAssignmentSummary = {
  id: string
  patientId: string
  templateVersionId: string
  appointmentId?: string
  clinicalVisitId?: string
  branchId?: string
  treatmentPlanId?: string
  treatmentId?: string
  status: 'assigned' | 'viewed' | 'in_progress' | 'signed' | 'declined' | 'superseded'
  assignmentSource: string
  assignedAt: string
  completedAt?: string
}

function requireSupabase() {
  if (!supabase) throw new Error('Forms & Consent is unavailable because the database connection is not configured.')
  return supabase
}

function mapVersion(row: Record<string, any>): FormVersionAdminRow {
  return {
    id: row.id,
    templateId: row.template_id,
    versionNumber: row.version_number,
    content: row.content ?? '',
    requiresSignature: Boolean(row.requires_signature),
    signatureMethod: (row.signature_method ?? 'none') as SignatureMethod,
    effectiveDate: row.effective_date ?? undefined,
    publishedAt: row.published_at ?? undefined,
    publishedBy: row.published_by ?? undefined,
    versionStatus: (row.version_status ?? (row.published_at ? 'published' : 'draft')) as FormVersionStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  }
}

export async function listFormTemplates(): Promise<FormTemplateAdminRow[]> {
  const client = requireSupabase()
  const { data: templates, error } = await client
    .from('form_templates')
    .select('id,title,description,category,status,applies_to,branch_id,current_version_id,created_at,updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw error

  const currentIds = (templates ?? []).map((entry) => entry.current_version_id).filter(Boolean)
  const { data: versions, error: versionError } = currentIds.length
    ? await client
        .from('form_template_versions')
        .select('id,version_number,version_status,requires_signature,signature_method,effective_date')
        .in('id', currentIds)
    : { data: [], error: null }
  if (versionError) throw versionError

  const versionMap = new Map((versions ?? []).map((version) => [version.id, version]))
  return (templates ?? []).map((row) => {
    const current = row.current_version_id ? versionMap.get(row.current_version_id) : undefined
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? '',
      category: row.category,
      status: row.status,
      appliesTo: row.applies_to,
      branchId: row.branch_id ?? undefined,
      currentVersionId: row.current_version_id ?? undefined,
      currentVersionNumber: current?.version_number ?? undefined,
      currentVersionStatus: current?.version_status ?? undefined,
      requiresSignature: current ? Boolean(current.requires_signature) : undefined,
      signatureMethod: current?.signature_method ?? undefined,
      effectiveDate: current?.effective_date ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })
}

export async function listFormVersions(templateId: string): Promise<FormVersionAdminRow[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('form_template_versions')
    .select('*')
    .eq('template_id', templateId)
    .order('version_number', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapVersion)
}

export async function createFormTemplateDraft(input: {
  title: string
  description: string
  category: FormCategory
  appliesTo: FormAppliesTo
  content: string
  requiresSignature: boolean
  signatureMethod: SignatureMethod
  effectiveDate?: string
  branchId?: string
}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('create_form_template_draft', {
    p_title: input.title,
    p_description: input.description,
    p_category: input.category,
    p_applies_to: input.appliesTo,
    p_content: input.content,
    p_requires_signature: input.requiresSignature,
    p_signature_method: input.requiresSignature ? input.signatureMethod : 'none',
    p_effective_date: input.effectiveDate || null,
    p_branch_id: input.branchId || null,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.template_id || !row?.version_id) throw new Error('Draft was not created.')
  return { templateId: row.template_id as string, versionId: row.version_id as string, versionNumber: Number(row.version_number) }
}

export async function updateDraftVersion(input: {
  versionId: string
  content: string
  requiresSignature: boolean
  signatureMethod: SignatureMethod
  effectiveDate?: string
}) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('form_template_versions')
    .update({
      content: input.content,
      requires_signature: input.requiresSignature,
      signature_method: input.requiresSignature ? input.signatureMethod : 'none',
      effective_date: input.effectiveDate || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.versionId)
    .eq('version_status', 'draft')
    .select('*')
    .single()
  if (error) throw error
  return mapVersion(data)
}

export async function createNextDraftVersion(templateId: string) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('create_form_version_draft', { p_template_id: templateId })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.version_id) throw new Error('New draft version was not created.')
  return { versionId: row.version_id as string, versionNumber: Number(row.version_number) }
}

export async function publishVersion(versionId: string) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('publish_form_version', { p_version_id: versionId })
  if (error) throw error
  return data as string
}

export async function archiveTemplate(templateId: string) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('archive_form_template', { p_template_id: templateId })
  if (error) throw error
  return data as string
}

export async function assignPublishedForm(input: {
  patientId: string
  templateVersionId: string
  appointmentId?: string
  clinicalVisitId?: string
  branchId?: string
  treatmentPlanId?: string
  treatmentId?: string
}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('assign_patient_form', {
    p_patient_id: input.patientId,
    p_template_version_id: input.templateVersionId,
    p_appointment_id: input.appointmentId || null,
    p_clinical_visit_id: input.clinicalVisitId || null,
    p_branch_id: input.branchId || null,
    p_treatment_plan_id: input.treatmentPlanId || null,
    p_treatment_id: input.treatmentId || null,
    p_source: 'manual',
  })
  if (error) throw error
  return data as string
}

export async function listAssignments(limit = 100): Promise<FormAssignmentSummary[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('patient_form_assignments')
    .select('id,patient_id,template_version_id,appointment_id,clinical_visit_id,branch_id,treatment_plan_id,treatment_id,status,assignment_source,assigned_at,completed_at')
    .order('assigned_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    patientId: row.patient_id,
    templateVersionId: row.template_version_id,
    appointmentId: row.appointment_id ?? undefined,
    clinicalVisitId: row.clinical_visit_id ?? undefined,
    branchId: row.branch_id ?? undefined,
    treatmentPlanId: row.treatment_plan_id ?? undefined,
    treatmentId: row.treatment_id ?? undefined,
    status: row.status,
    assignmentSource: row.assignment_source ?? 'manual',
    assignedAt: row.assigned_at,
    completedAt: row.completed_at ?? undefined,
  }))
}

export function sanitizeFormPreview(value: string) {
  // The admin editor stores plain text in Part 38. This defensive sanitizer is kept
  // for legacy/imported content that may contain HTML-like markup.
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*(["']).*?\1/gi, '')
    .replace(/javascript:/gi, '')
}
