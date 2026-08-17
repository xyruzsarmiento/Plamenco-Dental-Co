import { useRef, useState } from 'react'
import { Download, Eye, FileText, Trash2, Upload } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import type { DocumentCategory, PatientDocument } from './documentStore'

type DocumentUploadPanelProps = {
  patientId: string
  onUpload: (payload: {
    patientId: string
    fileName: string
    fileType: string
    category: DocumentCategory
    uploadedBy: string
    content: string
  }) => void
}

export function DocumentUploadPanel({ patientId, onUpload }: DocumentUploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileType, setFileType] = useState('application/pdf')
  const [category, setCategory] = useState<DocumentCategory>('medical')
  const [uploadedBy, setUploadedBy] = useState('Front desk')
  const [content, setContent] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setFileType(file.type || 'application/octet-stream')
    setUploading(true)
    setProgress(20)

    const reader = new FileReader()
    reader.onload = () => {
      setContent(String(reader.result ?? ''))
      setProgress(100)
      window.setTimeout(() => setUploading(false), 350)
    }
    reader.onerror = () => {
      setUploading(false)
      setProgress(0)
    }
    reader.readAsDataURL(file)
  }

  function handleSubmit() {
    if (!content || !fileName.trim()) {
      return
    }

    onUpload({
      patientId,
      fileName,
      fileType,
      category,
      uploadedBy,
      content,
    })

    setFileName('')
    setFileType('application/pdf')
    setCategory('medical')
    setUploadedBy('Front desk')
    setContent('')
    setProgress(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="upload-panel">
      <div className="upload-row">
        <input ref={fileInputRef} type="file" onChange={handleFilesSelected} />
        <Button variant="secondary" icon={<Upload size={16} />} onClick={() => fileInputRef.current?.click()}>
          Select file
        </Button>
      </div>

      {uploading && (
        <div className="upload-progress">
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
          <small>{progress}% uploaded</small>
        </div>
      )}

      <div className="form-grid">
        <Input label="File name" value={fileName} onChange={(event) => setFileName(event.target.value)} />
        <Select
          label="Category"
          value={category}
          onChange={(event) => setCategory(event.target.value as DocumentCategory)}
          options={[
            { label: 'X-ray', value: 'xray' },
            { label: 'Consent form', value: 'consent' },
            { label: 'Medical document', value: 'medical' },
            { label: 'Treatment document', value: 'treatment' },
            { label: 'Other', value: 'other' },
          ]}
        />
        <Input label="Uploaded by" value={uploadedBy} onChange={(event) => setUploadedBy(event.target.value)} />
        <Input label="File type" value={fileType} onChange={(event) => setFileType(event.target.value)} />
      </div>

      <div className="modal-actions">
        <Button onClick={handleSubmit} icon={<Upload size={16} />} disabled={!content || !fileName.trim()}>
          Upload document
        </Button>
      </div>
    </div>
  )
}

type DocumentListProps = {
  documents: PatientDocument[]
  onDelete: (documentId: string) => void
}

export function DocumentList({ documents, onDelete }: DocumentListProps) {
  if (documents.length === 0) {
    return null
  }

  return (
    <div className="document-list">
      {documents.map((document) => (
        <article key={document.id} className="document-card">
          <div className="document-icon">
            <FileText size={18} />
          </div>
          <div className="document-details">
            <strong>{document.fileName}</strong>
            <span>{document.category}</span>
            <small>{new Date(document.uploadDate).toLocaleDateString()} • {document.uploadedBy}</small>
          </div>
          <div className="document-actions">
            <a href={document.content} target="_blank" rel="noreferrer" aria-label={`Preview ${document.fileName}`}>
              <Eye size={16} />
            </a>
            <a href={document.content} download={document.fileName} aria-label={`Download ${document.fileName}`}>
              <Download size={16} />
            </a>
            <button type="button" aria-label={`Delete ${document.fileName}`} onClick={() => onDelete(document.id)}>
              <Trash2 size={16} />
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}
