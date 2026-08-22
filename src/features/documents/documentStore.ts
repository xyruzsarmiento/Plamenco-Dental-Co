import { supabase } from '../../lib/supabase'
import { createUuid } from '../../lib/id'
import { getStoredPatients } from '../patients/patientStore'

export type DocumentCategory = 'xray' | 'treatment_photo' | 'consent' | 'referral' | 'prescription' | 'lab_result' | 'medical' | 'treatment' | 'other'
export type DentalImageKind = 'xray' | 'before' | 'after' | 'treatment_photo'

export type PatientDocument = {
  id: string
  patientId: string
  clinicalVisitId?: string
  treatmentId?: string
  fileName: string
  fileType: string
  category: DocumentCategory
  uploadDate: string
  uploadedBy: string
  description?: string
  storagePath?: string
  patientVisible?: boolean
  content: string
  sizeBytes: number
  createdAt: string
  updatedAt: string
}

export type DentalImage = {
  id: string
  patientId: string
  treatmentId?: string
  fileName: string
  fileType: string
  kind: DentalImageKind
  content: string
  uploadDate: string
  uploadedBy: string
  createdAt: string
  updatedAt: string
}

export type DocumentAccessRole = 'admin' | 'staff'

export type CreateDocumentInput = {
  patientId: string
  clinicalVisitId?: string
  treatmentId?: string
  fileName: string
  fileType: string
  category: DocumentCategory
  uploadedBy: string
  description?: string
  storagePath?: string
  patientVisible?: boolean
  content: string
}

type CreateDentalImageInput = {
  patientId: string
  treatmentId?: string
  fileName: string
  fileType: string
  kind: DentalImageKind
  content: string
  uploadedBy: string
}

const DOCUMENT_STORAGE_KEY = 'plamenco.documents'
const DENTAL_IMAGE_STORAGE_KEY = 'plamenco.dentalImages'
const PATIENT_DOCUMENT_BUCKET = 'patient-documents'

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  } as Storage
}

function getStorage(): Storage {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) return globalThis.localStorage
  const globalWithMemory = globalThis as typeof globalThis & { __plamencoDocMemoryStorage?: Storage }
  if (globalWithMemory.__plamencoDocMemoryStorage) return globalWithMemory.__plamencoDocMemoryStorage
  const created = createMemoryStorage()
  globalWithMemory.__plamencoDocMemoryStorage = created
  return created
}

function safeParse<T>(value: string | null): T | null {
  if (!value) return null
  try { return JSON.parse(value) as T } catch { return null }
}

function ensureValidAllowedFile(fileName: string, fileType: string) {
  const lowerName = fileName.toLowerCase()
  const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.doc', '.docx', '.txt']
  const hasAllowedExtension = allowedExtensions.some((extension) => lowerName.endsWith(extension))
  const allowedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
  const hasAllowedMime = allowedMimeTypes.includes(fileType)
  if (!hasAllowedExtension && !hasAllowedMime) throw new Error('Unsupported file type. Please upload a supported medical document or image.')
}

function getContentSize(content: string): number {
  if (!content) return 0
  return new Blob([content]).size
}

function patientReferenceFromDatabaseId(value: string) {
  return getStoredPatients().find((patient) => patient.id === value)?.patientId ?? value
}

function resolvePatientDatabaseId(patientRef: string) {
  return getStoredPatients().find((patient) => patient.id === patientRef || patient.patientId === patientRef)?.id
}

function sanitizeFileName(fileName: string) {
  const cleaned = fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned || 'document'
}

async function dataUrlToBlob(content: string, fileType: string) {
  const response = await fetch(content)
  if (!response.ok) throw new Error('The selected file could not be prepared for upload.')
  const blob = await response.blob()
  if (blob.size > 10 * 1024 * 1024) throw new Error('Document must be 10 MB or smaller.')
  return blob.type ? blob : new Blob([blob], { type: fileType })
}

async function signedDocumentUrl(storagePath: string) {
  if (!supabase || !storagePath) return ''
  const { data, error } = await supabase.storage.from(PATIENT_DOCUMENT_BUCKET).createSignedUrl(storagePath, 3600)
  if (error) return ''
  return data?.signedUrl ?? ''
}

function mapDocumentRow(row: Record<string, any>, content = ''): PatientDocument {
  const createdAt = row.created_at ?? new Date().toISOString()
  return {
    id: String(row.id),
    patientId: patientReferenceFromDatabaseId(String(row.patient_id ?? '')),
    clinicalVisitId: row.clinical_visit_id ?? undefined,
    treatmentId: row.treatment_id ?? undefined,
    fileName: String(row.name ?? ''),
    fileType: String(row.file_type ?? 'application/octet-stream'),
    category: (row.category ?? 'other') as DocumentCategory,
    uploadDate: String(createdAt).slice(0, 10),
    uploadedBy: String(row.uploaded_by ?? ''),
    description: row.description ?? undefined,
    storagePath: row.storage_path ?? undefined,
    patientVisible: Boolean(row.patient_visible),
    content,
    sizeBytes: Number(row.size_bytes ?? 0),
    createdAt,
    updatedAt: createdAt,
  }
}

export function canAccessPatientFiles(userRole: DocumentAccessRole | undefined): boolean {
  return userRole === 'admin' || userRole === 'staff'
}

export function getStoredDocuments(): PatientDocument[] {
  const stored = safeParse<PatientDocument[]>(getStorage().getItem(DOCUMENT_STORAGE_KEY))
  if (stored?.length) return stored
  getStorage().setItem(DOCUMENT_STORAGE_KEY, JSON.stringify([]))
  return []
}

export function getStoredDentalImages(): DentalImage[] {
  const stored = safeParse<DentalImage[]>(getStorage().getItem(DENTAL_IMAGE_STORAGE_KEY))
  if (stored?.length) return stored
  getStorage().setItem(DENTAL_IMAGE_STORAGE_KEY, JSON.stringify([]))
  return []
}

export function saveStoredDocuments(documents: PatientDocument[]) { getStorage().setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(documents)) }
export function saveStoredDentalImages(images: DentalImage[]) { getStorage().setItem(DENTAL_IMAGE_STORAGE_KEY, JSON.stringify(images)) }

export function getDocumentsByPatient(patientId: string): PatientDocument[] {
  return getStoredDocuments().filter((document) => document.patientId === patientId).sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())
}

export async function loadDocumentsFromSupabase(): Promise<PatientDocument[]> {
  if (!supabase) return getStoredDocuments()
  const { data, error } = await supabase.from('documents').select('*').order('created_at', { ascending: false })
  if (error) throw new Error('Unable to load patient documents from the clinic database.')
  const mapped = await Promise.all((data ?? []).map(async (row) => {
    const storagePath = String((row as Record<string, any>).storage_path ?? '')
    return mapDocumentRow(row as Record<string, any>, storagePath ? await signedDocumentUrl(storagePath) : String((row as Record<string, any>).file_url ?? ''))
  }))
  saveStoredDocuments(mapped)
  return mapped
}

export function getDentalImagesByPatient(patientId: string): DentalImage[] {
  return getStoredDentalImages().filter((image) => image.patientId === patientId).sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())
}

export function getDentalImagesByTreatment(patientId: string, treatmentId: string): DentalImage[] {
  return getDentalImagesByPatient(patientId).filter((image) => image.treatmentId === treatmentId)
}

export async function createDocumentPersisted(input: CreateDocumentInput): Promise<PatientDocument> {
  if (!supabase) throw new Error('Clinic database is not configured. Documents cannot be uploaded safely.')
  if (!input.patientId.trim()) throw new Error('Patient is required for document upload.')
  if (!input.fileName.trim()) throw new Error('File name is required.')
  ensureValidAllowedFile(input.fileName, input.fileType)

  const patientDbId = resolvePatientDatabaseId(input.patientId)
  if (!patientDbId) throw new Error('The patient database record could not be resolved. Refresh and try again.')
  const blob = await dataUrlToBlob(input.content, input.fileType)
  const storagePath = `${patientDbId}/${createUuid()}-${sanitizeFileName(input.fileName)}`

  const { error: uploadError } = await supabase.storage.from(PATIENT_DOCUMENT_BUCKET).upload(storagePath, blob, {
    contentType: input.fileType || blob.type || 'application/octet-stream',
    cacheControl: '3600',
    upsert: false,
  })
  if (uploadError) {
    if (import.meta.env.DEV) console.error('[document storage upload]', uploadError)
    throw new Error('The document could not be uploaded. No document record was created.')
  }

  try {
    const { data, error } = await supabase.rpc('create_document_metadata', {
      p_patient_id: input.patientId,
      p_clinical_visit_id: input.clinicalVisitId ?? null,
      p_treatment_id: input.treatmentId ?? null,
      p_name: input.fileName.trim(),
      p_file_type: input.fileType || blob.type || 'application/octet-stream',
      p_category: input.category,
      p_description: input.description?.trim() ?? '',
      p_storage_path: storagePath,
      p_size_bytes: blob.size,
      p_patient_visible: input.patientVisible ?? true,
    })
    if (error || !data) throw error ?? new Error('Document metadata was not returned.')

    const content = await signedDocumentUrl(storagePath)
    const confirmed = mapDocumentRow(data as Record<string, any>, content)
    saveStoredDocuments([confirmed, ...getStoredDocuments().filter((entry) => entry.id !== confirmed.id)])
    return confirmed
  } catch (cause) {
    const { error: cleanupError } = await supabase.storage.from(PATIENT_DOCUMENT_BUCKET).remove([storagePath])
    if (import.meta.env.DEV) {
      console.error('[document metadata]', cause)
      if (cleanupError) console.error('[document orphan cleanup]', cleanupError)
    }
    throw new Error(cleanupError
      ? 'Document metadata could not be saved and the uploaded file may require administrator cleanup.'
      : 'Document metadata could not be saved. The uploaded file was removed.')
  }
}

/** Legacy local-only helper retained for inactive/test code. Active UI must use createDocumentPersisted. */
export function createDocument({ patientId, clinicalVisitId, treatmentId, fileName, fileType, category, uploadedBy, description, storagePath, content, patientVisible }: CreateDocumentInput): PatientDocument {
  if (!patientId.trim()) throw new Error('Patient is required for document upload.')
  if (!fileName.trim()) throw new Error('File name is required.')
  if (!uploadedBy.trim()) throw new Error('Uploaded by is required.')
  ensureValidAllowedFile(fileName, fileType)
  const now = new Date().toISOString()
  const document: PatientDocument = { id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, patientId, clinicalVisitId, treatmentId, fileName, fileType, category, uploadDate: now.slice(0, 10), uploadedBy, description, storagePath, patientVisible, content, sizeBytes: getContentSize(content), createdAt: now, updatedAt: now }
  saveStoredDocuments([...getStoredDocuments(), document])
  return document
}

export function createDentalImage({ patientId, treatmentId, fileName, fileType, kind, content, uploadedBy }: CreateDentalImageInput): DentalImage {
  if (!patientId.trim()) throw new Error('Patient is required for dental image upload.')
  if (!fileName.trim()) throw new Error('Image file name is required.')
  if (!uploadedBy.trim()) throw new Error('Uploaded by is required.')
  ensureValidAllowedFile(fileName, fileType)
  const now = new Date().toISOString()
  const image: DentalImage = { id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, patientId, treatmentId, fileName, fileType, kind, content, uploadDate: now.slice(0, 10), uploadedBy, createdAt: now, updatedAt: now }
  saveStoredDentalImages([...getStoredDentalImages(), image])
  return image
}

export function deleteDocument(documentId: string): boolean {
  const documents = getStoredDocuments()
  const index = documents.findIndex((document) => document.id === documentId)
  if (index === -1) return false
  documents.splice(index, 1)
  saveStoredDocuments(documents)
  return true
}

export function deleteDentalImage(imageId: string): boolean {
  const images = getStoredDentalImages()
  const index = images.findIndex((image) => image.id === imageId)
  if (index === -1) return false
  images.splice(index, 1)
  saveStoredDentalImages(images)
  return true
}

export function getDocumentDownloadUrl(document: PatientDocument): string { return document.content }

export { DOCUMENT_STORAGE_KEY, DENTAL_IMAGE_STORAGE_KEY, PATIENT_DOCUMENT_BUCKET }
