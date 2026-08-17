export type DocumentCategory = 'xray' | 'consent' | 'medical' | 'treatment' | 'other'
export type DentalImageKind = 'xray' | 'before' | 'after' | 'treatment_photo'

export type PatientDocument = {
  id: string
  patientId: string
  fileName: string
  fileType: string
  category: DocumentCategory
  uploadDate: string
  uploadedBy: string
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

type CreateDocumentInput = {
  patientId: string
  fileName: string
  fileType: string
  category: DocumentCategory
  uploadedBy: string
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

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  } as Storage
}

function getStorage(): Storage {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
    return globalThis.localStorage
  }

  const globalWithMemory = globalThis as typeof globalThis & {
    __plamencoDocMemoryStorage?: Storage
  }

  if (globalWithMemory.__plamencoDocMemoryStorage) {
    return globalWithMemory.__plamencoDocMemoryStorage
  }

  const created = createMemoryStorage()
  globalWithMemory.__plamencoDocMemoryStorage = created
  return created
}

function safeParse<T>(value: string | null): T | null {
  if (!value) return null

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function ensureValidAllowedFile(fileName: string, fileType: string) {
  const lowerName = fileName.toLowerCase()
  const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.doc', '.docx', '.txt']
  const hasAllowedExtension = allowedExtensions.some((extension) => lowerName.endsWith(extension))
  const allowedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
  const hasAllowedMime = allowedMimeTypes.includes(fileType)

  if (!hasAllowedExtension && !hasAllowedMime) {
    throw new Error('Unsupported file type. Please upload a supported medical document or image.')
  }
}

function getContentSize(content: string): number {
  if (!content) return 0
  return new Blob([content]).size
}

export function canAccessPatientFiles(userRole: DocumentAccessRole | undefined): boolean {
  return userRole === 'admin' || userRole === 'staff'
}

export function getStoredDocuments(): PatientDocument[] {
  const stored = safeParse<PatientDocument[]>(getStorage().getItem(DOCUMENT_STORAGE_KEY))
  if (stored?.length) {
    return stored
  }

  const seedDocuments: PatientDocument[] = []

  getStorage().setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(seedDocuments))
  return seedDocuments
}

export function getStoredDentalImages(): DentalImage[] {
  const stored = safeParse<DentalImage[]>(getStorage().getItem(DENTAL_IMAGE_STORAGE_KEY))
  if (stored?.length) {
    return stored
  }

  const seedImages: DentalImage[] = []

  getStorage().setItem(DENTAL_IMAGE_STORAGE_KEY, JSON.stringify(seedImages))
  return seedImages
}

export function saveStoredDocuments(documents: PatientDocument[]) {
  getStorage().setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(documents))
}

export function saveStoredDentalImages(images: DentalImage[]) {
  getStorage().setItem(DENTAL_IMAGE_STORAGE_KEY, JSON.stringify(images))
}

export function getDocumentsByPatient(patientId: string): PatientDocument[] {
  return getStoredDocuments()
    .filter((document) => document.patientId === patientId)
    .sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())
}

export function getDentalImagesByPatient(patientId: string): DentalImage[] {
  return getStoredDentalImages()
    .filter((image) => image.patientId === patientId)
    .sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())
}

export function getDentalImagesByTreatment(patientId: string, treatmentId: string): DentalImage[] {
  return getDentalImagesByPatient(patientId).filter((image) => image.treatmentId === treatmentId)
}

export function createDocument({ patientId, fileName, fileType, category, uploadedBy, content }: CreateDocumentInput): PatientDocument {
  if (!patientId.trim()) {
    throw new Error('Patient is required for document upload.')
  }

  if (!fileName.trim()) {
    throw new Error('File name is required.')
  }

  if (!uploadedBy.trim()) {
    throw new Error('Uploaded by is required.')
  }

  ensureValidAllowedFile(fileName, fileType)

  const now = new Date().toISOString()
  const document: PatientDocument = {
    id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    patientId,
    fileName,
    fileType,
    category,
    uploadDate: now.slice(0, 10),
    uploadedBy,
    content,
    sizeBytes: getContentSize(content),
    createdAt: now,
    updatedAt: now,
  }

  const documents = getStoredDocuments()
  documents.push(document)
  saveStoredDocuments(documents)
  return document
}

export function createDentalImage({ patientId, treatmentId, fileName, fileType, kind, content, uploadedBy }: CreateDentalImageInput): DentalImage {
  if (!patientId.trim()) {
    throw new Error('Patient is required for dental image upload.')
  }

  if (!fileName.trim()) {
    throw new Error('Image file name is required.')
  }

  if (!uploadedBy.trim()) {
    throw new Error('Uploaded by is required.')
  }

  ensureValidAllowedFile(fileName, fileType)

  const now = new Date().toISOString()
  const image: DentalImage = {
    id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    patientId,
    treatmentId,
    fileName,
    fileType,
    kind,
    content,
    uploadDate: now.slice(0, 10),
    uploadedBy,
    createdAt: now,
    updatedAt: now,
  }

  const images = getStoredDentalImages()
  images.push(image)
  saveStoredDentalImages(images)
  return image
}

export function deleteDocument(documentId: string): boolean {
  const documents = getStoredDocuments()
  const index = documents.findIndex((document) => document.id === documentId)

  if (index === -1) {
    return false
  }

  documents.splice(index, 1)
  saveStoredDocuments(documents)
  return true
}

export function deleteDentalImage(imageId: string): boolean {
  const images = getStoredDentalImages()
  const index = images.findIndex((image) => image.id === imageId)

  if (index === -1) {
    return false
  }

  images.splice(index, 1)
  saveStoredDentalImages(images)
  return true
}

export function getDocumentDownloadUrl(document: PatientDocument): string {
  return document.content
}

export { DOCUMENT_STORAGE_KEY, DENTAL_IMAGE_STORAGE_KEY }
