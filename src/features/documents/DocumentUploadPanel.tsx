import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { LockKeyhole, Share2, Upload, UploadCloud } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { DocumentCard } from './DocumentCard'
import { downloadPatientDocumentFile, type DocumentCategory, type PatientDocument } from './documentStore'

type DocumentUploadPanelProps = {
  patientId: string
  onUpload: (payload: {
    patientId: string
    file: File
    fileName: string
    fileType: string
    category: DocumentCategory
    uploadedBy: string
    description?: string
    patientVisible?: boolean
    content: string
  }) => Promise<unknown> | unknown
  uploadedBy?: string
  defaultPatientVisible?: boolean
  onCancel?: () => void
}

export function DocumentUploadPanel({ defaultPatientVisible = false, onCancel, patientId, onUpload, uploadedBy = 'Clinic user' }: DocumentUploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileType, setFileType] = useState('application/pdf')
  const [category, setCategory] = useState<DocumentCategory>('medical')
  const [description, setDescription] = useState('')
  const [patientVisible, setPatientVisible] = useState(defaultPatientVisible)
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [readingFile, setReadingFile] = useState(false)
  const [progress, setProgress] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function processFile(file: File | undefined) {
    if (!file) return
    const lowerName = file.name.toLowerCase()
    const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.doc', '.docx', '.txt']
    const allowedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    if (file.size <= 0) {
      setError('The selected file is empty. Choose a valid patient document.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Document must be 10 MB or smaller.')
      return
    }
    if (!allowedExtensions.some((extension) => lowerName.endsWith(extension)) && !allowedMimeTypes.includes(file.type)) {
      setError('Unsupported file type. Please upload a supported medical document or image.')
      return
    }

    setFileName(file.name)
    setFileType(file.type || 'application/octet-stream')
    setReadingFile(true)
    setProgress(100)
    setError(null)
    setFile(file)
    setContent(file.name)
    setReadingFile(false)
  }

  function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    processFile(event.target.files?.[0])
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (saving) return
    processFile(event.dataTransfer.files?.[0])
  }

  async function handleSubmit() {
    if (saving || readingFile || !file || !fileName.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onUpload({
        patientId,
        file,
        fileName,
        fileType,
        category,
        uploadedBy,
        description,
        patientVisible,
        content,
      })

      setFileName('')
      setFileType('application/pdf')
      setCategory('medical')
      setDescription('')
      setPatientVisible(defaultPatientVisible)
      setContent('')
      setFile(null)
      setProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The document could not be uploaded.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="upload-panel document-upload-panel-v10">
      <div
        className={`document-dropzone-v10 ${content ? 'has-file' : ''}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <input ref={fileInputRef} type="file" onChange={handleFilesSelected} disabled={saving} className="document-file-input-v10" />
        <span className="document-dropzone-icon-v10"><UploadCloud size={22} /></span>
        <div>
          <strong>{fileName || 'Drop a patient document here'}</strong>
          <small>{fileName ? `${fileType || 'Unknown file type'}` : 'PDF, image, Word, or text file up to 10 MB.'}</small>
        </div>
        <Button variant="secondary" icon={<Upload size={16} />} onClick={() => fileInputRef.current?.click()} disabled={saving}>
          Select file
        </Button>
      </div>

      {readingFile && (
        <div className="upload-progress">
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          <small>Preparing file...</small>
        </div>
      )}

      <div className="form-grid">
        <Input label="File name" value={fileName} onChange={(event) => setFileName(event.target.value)} disabled={saving} />
        <Select
          label="Category"
          value={category}
          onChange={(event) => setCategory(event.target.value as DocumentCategory)}
          disabled={saving}
          options={[
            { label: 'X-ray', value: 'xray' },
            { label: 'Consent form', value: 'consent' },
            { label: 'Referral', value: 'referral' },
            { label: 'Prescription', value: 'prescription' },
            { label: 'Lab result', value: 'lab_result' },
            { label: 'Medical document', value: 'medical' },
            { label: 'Treatment document', value: 'treatment' },
            { label: 'Other', value: 'other' },
          ]}
        />
        <Input label="Uploaded by" value={uploadedBy} disabled />
        <Input label="File type" value={fileType} onChange={(event) => setFileType(event.target.value)} disabled={saving} />
      </div>

      <Textarea label="Description" value={description} onChange={(event) => setDescription(event.target.value)} disabled={saving} />
      <label className={`document-share-toggle document-share-toggle-v10 ${patientVisible ? 'is-shared' : ''}`}>
        <input type="checkbox" checked={patientVisible} onChange={(event) => setPatientVisible(event.target.checked)} disabled={saving} />
        <span className="document-share-icon-v10">{patientVisible ? <Share2 size={16} /> : <LockKeyhole size={16} />}</span>
        <span>
          <strong>{patientVisible ? 'Shared with patient portal' : 'Private to clinic'}</strong>
          <small>{patientVisible ? 'The patient can view this document in their portal.' : 'Only authorized clinic users can access this file.'}</small>
        </span>
      </label>

      {error && <div className="error-alert" role="alert">{error}</div>}

      <div className="modal-actions">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button onClick={() => void handleSubmit()} icon={<Upload size={16} />} disabled={!file || !fileName.trim() || readingFile || saving}>
          {saving ? 'Saving document...' : 'Upload document'}
        </Button>
      </div>
    </div>
  )
}

type DocumentListProps = {
  documents: PatientDocument[]
  onDelete?: (documentId: string) => void
  onToggleVisibility?: (documentId: string, patientVisible: boolean) => void
  busyId?: string | null
}

export function DocumentList({ busyId, documents, onDelete, onToggleVisibility }: DocumentListProps) {
  const [actionError, setActionError] = useState<string | null>(null)
  if (documents.length === 0) return null

  async function downloadDocument(document: PatientDocument) {
    setActionError(null)
    try {
      await downloadPatientDocumentFile(document)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Document download is unavailable.')
    }
  }

  return (
    <div className="document-list">
      {actionError && <div className="error-alert" role="alert">{actionError}</div>}
      {documents.map((document) => (
        <DocumentCard
          key={document.id}
          document={document}
          busy={busyId === document.id}
          onDownload={(item) => void downloadDocument(item)}
          onToggleVisibility={onToggleVisibility ? (item) => onToggleVisibility(item.id, !item.patientVisible) : undefined}
          onArchive={onDelete ? (item) => onDelete(item.id) : undefined}
        />
      ))}
    </div>
  )
}
