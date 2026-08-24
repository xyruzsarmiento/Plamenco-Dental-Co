import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { Download, Eye, FileText, LockKeyhole, Share2, Trash2, Upload, UploadCloud } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import type { DocumentCategory, PatientDocument } from './documentStore'

type DocumentUploadPanelProps = {
  patientId: string
  onUpload: (payload: {
    patientId: string
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
  const [readingFile, setReadingFile] = useState(false)
  const [progress, setProgress] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function processFile(file: File | undefined) {
    if (!file) return

    setFileName(file.name)
    setFileType(file.type || 'application/octet-stream')
    setReadingFile(true)
    setProgress(20)
    setError(null)

    const reader = new FileReader()
    reader.onload = () => {
      setContent(String(reader.result ?? ''))
      setProgress(100)
      setReadingFile(false)
    }
    reader.onerror = () => {
      setReadingFile(false)
      setProgress(0)
      setError('The selected file could not be read.')
    }
    reader.readAsDataURL(file)
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
    if (saving || readingFile || !content || !fileName.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onUpload({
        patientId,
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
        <Button onClick={() => void handleSubmit()} icon={<Upload size={16} />} disabled={!content || !fileName.trim() || readingFile || saving}>
          {saving ? 'Saving to database...' : 'Upload document'}
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
  if (documents.length === 0) return null

  return (
    <div className="document-list">
      {documents.map((document) => (
        <article key={document.id} className="document-card">
          <div className="document-icon"><FileText size={18} /></div>
          <div className="document-details">
            <strong>{document.fileName}</strong>
            <span>{document.category.replaceAll('_', ' ')}</span>
            <small>{new Date(document.uploadDate).toLocaleDateString()} - {document.uploadedBy}</small>
            <small>{document.patientVisible ? 'Shared with patient' : 'Private clinic file'}</small>
          </div>
          <div className="document-actions">
            {document.content && <a href={document.content} target="_blank" rel="noreferrer" aria-label={`Preview ${document.fileName}`}><Eye size={16} /></a>}
            {document.content && <a href={document.content} download={document.fileName} aria-label={`Download ${document.fileName}`}><Download size={16} /></a>}
            {onToggleVisibility && (
              <button type="button" disabled={busyId === document.id} aria-label={`${document.patientVisible ? 'Make private' : 'Share'} ${document.fileName}`} onClick={() => onToggleVisibility(document.id, !document.patientVisible)}>
                {document.patientVisible ? 'Private' : 'Share'}
              </button>
            )}
            {onDelete && <button type="button" disabled={busyId === document.id} aria-label={`Archive ${document.fileName}`} onClick={() => onDelete(document.id)}><Trash2 size={16} /></button>}
          </div>
        </article>
      ))}
    </div>
  )
}
