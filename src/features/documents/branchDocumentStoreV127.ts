import { supabase } from '../../lib/supabase'
import { createUuid } from '../../lib/id'
import { getStoredPatients } from '../patients/patientStore'
import {
  archiveDocumentPersisted,
  createPatientDocumentSignedUrl,
  getStoredDocuments,
  PATIENT_DOCUMENT_BUCKET,
  saveStoredDocuments,
  type CreateDocumentInput,
  type PatientDocument,
} from './documentStore'

export type BranchPatientDocument = PatientDocument & { branchId?: string }
export type BranchCreateDocumentInput = CreateDocumentInput & { branchId: string }

function patientReferenceFromDatabaseId(value: string) {
  return getStoredPatients().find((patient) => patient.id === value)?.patientId ?? value
}

function resolvePatientDatabaseId(patientRef: string) {
  return getStoredPatients().find((patient) => patient.id === patientRef || patient.patientId === patientRef)?.id
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document'
}

function inferMimeType(fileName: string, fileType: string) {
  if (fileType && fileType !== 'application/octet-stream') return fileType
  const lowerName = fileName.toLowerCase()
  if (lowerName.endsWith('.pdf')) return 'application/pdf'
  if (lowerName.endsWith('.png')) return 'image/png'
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg'
  if (lowerName.endsWith('.gif')) return 'image/gif'
  if (lowerName.endsWith('.webp')) return 'image/webp'
  if (lowerName.endsWith('.doc')) return 'application/msword'
  if (lowerName.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (lowerName.endsWith('.txt')) return 'text/plain'
  return 'application/octet-stream'
}

function ensureAllowedFile(fileName: string, fileType: string) {
  const lowerName = fileName.toLowerCase()
  const extensions = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.doc', '.docx', '.txt']
  const mimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
  if (!extensions.some((extension) => lowerName.endsWith(extension)) && !mimeTypes.includes(fileType)) {
    throw new Error('Unsupported file type. Please upload a supported medical document or image.')
  }
}

async function dataUrlToBlob(content: string, fileType: string) {
  const response = await fetch(content)
  if (!response.ok) throw new Error('The selected file could not be prepared for upload.')
  const blob = await response.blob()
  if (blob.size <= 0) throw new Error('The selected file is empty. Choose a valid patient document.')
  if (blob.size > 10 * 1024 * 1024) throw new Error('Document must be 10 MB or smaller.')
  return blob.type ? blob : new Blob([blob], { type: fileType })
}

function mapRow(row: Record<string, any>, content = ''): BranchPatientDocument {
  const createdAt = String(row.created_at ?? new Date().toISOString())
  return {
    id: String(row.id),
    patientId: patientReferenceFromDatabaseId(String(row.patient_id ?? '')),
    branchId: row.branch_id ?? undefined,
    clinicalVisitId: row.clinical_visit_id ?? undefined,
    treatmentId: row.treatment_id ?? undefined,
    fileName: String(row.name ?? ''),
    fileType: String(row.file_type ?? 'application/octet-stream'),
    category: row.category ?? 'other',
    uploadDate: createdAt.slice(0, 10),
    uploadedBy: String(row.uploaded_by ?? ''),
    description: row.description ?? undefined,
    storagePath: row.storage_path ?? undefined,
    patientVisible: Boolean(row.patient_visible),
    archivedAt: row.archived_at ?? undefined,
    content,
    sizeBytes: Number(row.size_bytes ?? 0),
    createdAt,
    updatedAt: String(row.updated_at ?? createdAt),
  }
}

export async function loadBranchDocumentsV127(branchId?: string): Promise<BranchPatientDocument[]> {
  const client = supabase
  if (!client) throw new Error('Clinic database is not configured. Documents cannot be loaded safely.')
  let query = client.from('documents').select('*').is('archived_at', null).order('created_at', { ascending: false })
  if (branchId) query = query.eq('branch_id', branchId)
  const { data, error } = await query
  if (error) throw new Error(error.message || 'Unable to load patient documents from the clinic database.')
  const rows = await Promise.all((data ?? []).map(async (value) => {
    const row = value as Record<string, any>
    const path = String(row.storage_path ?? '')
    return mapRow(row, path ? await createPatientDocumentSignedUrl(path, 300) : String(row.file_url ?? ''))
  }))
  saveStoredDocuments(rows)
  return rows
}

export async function createBranchDocumentV127(input: BranchCreateDocumentInput): Promise<BranchPatientDocument> {
  const client = supabase
  if (!client) throw new Error('Clinic database is not configured. Documents cannot be uploaded safely.')
  if (!input.branchId) throw new Error('Choose a specific clinic branch before uploading a document.')
  if (!input.patientId.trim()) throw new Error('Patient is required for document upload.')
  if (!input.fileName.trim()) throw new Error('File name is required.')
  ensureAllowedFile(input.fileName, input.fileType)

  const patientDbId = resolvePatientDatabaseId(input.patientId)
  if (!patientDbId) throw new Error('The patient database record could not be resolved. Refresh and try again.')
  const mimeType = inferMimeType(input.fileName, input.file?.type || input.fileType)
  const blob = input.file ?? await dataUrlToBlob(input.content, mimeType)
  if (blob.size <= 0) throw new Error('The selected file is empty. Choose a valid patient document.')
  if (blob.size > 10 * 1024 * 1024) throw new Error('Document must be 10 MB or smaller.')
  const storagePath = `patient-documents/${patientDbId}/${createUuid()}-${sanitizeFileName(input.fileName)}`

  const { error: uploadError } = await client.storage.from(PATIENT_DOCUMENT_BUCKET).upload(storagePath, blob, {
    contentType: mimeType,
    cacheControl: '3600',
    upsert: false,
  })
  if (uploadError) {
    if (import.meta.env.DEV) console.error('[branch document storage upload]', uploadError)
    throw new Error(`The document could not be uploaded. No document record was created. ${uploadError.message}`)
  }

  try {
    const { data, error } = await client.rpc('create_document_metadata_branch', {
      p_patient_id: input.patientId,
      p_branch_id: input.branchId,
      p_clinical_visit_id: input.clinicalVisitId ?? null,
      p_treatment_id: input.treatmentId ?? null,
      p_name: input.fileName.trim(),
      p_file_type: mimeType,
      p_category: input.category,
      p_description: input.description?.trim() ?? '',
      p_storage_path: storagePath,
      p_size_bytes: blob.size,
      p_patient_visible: input.patientVisible ?? true,
    })
    if (error || !data) throw error ?? new Error('Document metadata was not returned.')
    const content = await createPatientDocumentSignedUrl(storagePath, 300)
    const created = mapRow(data as Record<string, any>, content)
    saveStoredDocuments([created, ...loadLocalDocumentsWithout(created.id)])
    return created
  } catch (cause) {
    const { error: cleanupError } = await client.storage.from(PATIENT_DOCUMENT_BUCKET).remove([storagePath])
    if (import.meta.env.DEV) {
      console.error('[branch document metadata]', cause)
      if (cleanupError) console.error('[branch document orphan cleanup]', cleanupError)
    }
    const detail = cause instanceof Error ? cause.message : 'Document metadata could not be saved.'
    throw new Error(cleanupError
      ? `${detail} The uploaded file may require administrator cleanup.`
      : `${detail} The uploaded file was removed.`)
  }
}

function loadLocalDocumentsWithout(documentId: string) {
  return getStoredDocuments().filter((document) => document.id !== documentId)
}

export async function setBranchDocumentVisibilityV127(documentId: string, patientVisible: boolean) {
  const client = supabase
  if (!client) throw new Error('Clinic database is not configured. Document sharing cannot be changed safely.')
  const { data, error } = await client.from('documents').update({ patient_visible: patientVisible }).eq('id', documentId).select('*').single()
  if (error || !data) throw new Error(error?.message || 'Document visibility could not be updated.')
  const row = data as Record<string, any>
  const path = String(row.storage_path ?? '')
  return mapRow(row, path ? await createPatientDocumentSignedUrl(path, 300) : '')
}

export async function archiveBranchDocumentV127(documentId: string) {
  return archiveDocumentPersisted(documentId) as Promise<BranchPatientDocument>
}
