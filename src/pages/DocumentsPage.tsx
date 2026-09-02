import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Archive,
  Download,
  FileBadge,
  FileImage,
  FilePlus2,
  FileSignature,
  FileText,
  Files,
  FolderOpen,
  LockKeyhole,
  Search,
  Share2,
  ShieldCheck,
  UploadCloud,
  UserRound,
  X,
} from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { SkeletonList } from '../components/ui/DesignSystem'
import { EmptyState } from '../components/ui/EmptyState'
import { PageScaffold } from '../components/ui/PageScaffold'
import { Select } from '../components/ui/Select'
import { useAuth } from '../features/auth/AuthContext'
import { usePermissions } from '../features/auth/permissions'
import { DocumentUploadPanel } from '../features/documents/DocumentUploadPanel'
import {
  archiveDocumentPersisted,
  createDocumentPersisted,
  downloadPatientDocumentFile,
  getStoredDocuments,
  loadDocumentsFromSupabase,
  updateDocumentVisibilityPersisted,
  type DocumentCategory,
  type PatientDocument,
} from '../features/documents/documentStore'
import { getStoredPatients } from '../features/patients/patientStore'
import '../styles/documents-workspace-v9.css'
import '../styles/documents-workspace-v10.css'

type VisibilityFilter = 'all' | 'shared' | 'private'

function patientName(patientId: string) {
  const patient = getStoredPatients().find((entry) => entry.patientId === patientId || entry.id === patientId)
  if (!patient) return patientId
  return `${patient.firstName} ${patient.middleName ? `${patient.middleName} ` : ''}${patient.lastName}`
}

function formatBytes(value: number) {
  if (!value) return '0 KB'
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function categoryLabel(value: DocumentCategory) {
  const labels: Record<DocumentCategory, string> = {
    consent: 'Consent form',
    lab_result: 'Lab result',
    medical: 'Medical document',
    other: 'Other',
    prescription: 'Prescription',
    referral: 'Referral',
    treatment: 'Treatment document',
    treatment_photo: 'Treatment photo',
    xray: 'X-ray',
  }
  return labels[value] ?? value.replaceAll('_', ' ')
}

function fileIcon(document: PatientDocument) {
  if (document.category === 'xray' || document.category === 'treatment_photo' || document.fileType.startsWith('image/')) return <FileImage size={18} />
  if (document.category === 'consent') return <FileSignature size={18} />
  if (document.category === 'prescription' || document.category === 'lab_result') return <FileBadge size={18} />
  return <FileText size={18} />
}

export function DocumentsPage() {
  const { user } = useAuth()
  const permissions = usePermissions()
  const canUpload = permissions.can('documents.upload')
  const actor = user?.name || user?.email || 'Clinic user'
  const patients = useMemo(() => getStoredPatients().sort((a, b) => a.lastName.localeCompare(b.lastName)), [])
  const [documents, setDocuments] = useState<PatientDocument[]>(() => getStoredDocuments())
  const [selectedPatientId, setSelectedPatientId] = useState(() => patients[0]?.patientId ?? '')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<DocumentCategory | 'all'>('all')
  const [visibility, setVisibility] = useState<VisibilityFilter>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadDocumentsFromSupabase()
      .then((rows) => {
        if (!cancelled) setDocuments(rows)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Documents could not be loaded.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return documents.filter((document) => {
      if (selectedPatientId && document.patientId !== selectedPatientId) return false
      if (category !== 'all' && document.category !== category) return false
      if (visibility === 'shared' && !document.patientVisible) return false
      if (visibility === 'private' && document.patientVisible) return false
      if (!needle) return true
      return [
        document.fileName,
        document.category,
        document.description,
        document.uploadedBy,
        patientName(document.patientId),
        document.patientId,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle))
    })
  }, [category, documents, query, selectedPatientId, visibility])

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.patientId === selectedPatientId || patient.id === selectedPatientId),
    [patients, selectedPatientId],
  )

  const patientDocuments = useMemo(
    () => selectedPatientId ? documents.filter((document) => document.patientId === selectedPatientId) : documents,
    [documents, selectedPatientId],
  )

  const sharedCount = documents.filter((document) => document.patientVisible).length
  const privateCount = Math.max(0, documents.length - sharedCount)
  const selectedSharedCount = patientDocuments.filter((document) => document.patientVisible).length
  const lastUpload = documents[0]?.createdAt ? formatDate(documents[0].createdAt) : 'None yet'

  async function handleUpload(payload: Parameters<typeof createDocumentPersisted>[0]) {
    setError(null)
    setMessage(null)
    const confirmed = await createDocumentPersisted({ ...payload, uploadedBy: actor, patientVisible: payload.patientVisible ?? false })
    setDocuments([confirmed, ...getStoredDocuments().filter((entry) => entry.id !== confirmed.id)])
    setSelectedPatientId(confirmed.patientId)
    setUploadOpen(false)
    setMessage('Document uploaded to the private patient-documents bucket.')
    return confirmed
  }

  async function handleToggle(documentId: string, patientVisible: boolean) {
    if (busyId) return
    setBusyId(documentId)
    setError(null)
    setMessage(null)
    try {
      const updated = await updateDocumentVisibilityPersisted(documentId, patientVisible)
      setDocuments(getStoredDocuments().map((entry) => entry.id === updated.id ? updated : entry))
      setMessage(patientVisible ? 'Document is now visible in the patient portal.' : 'Document is now private to clinic staff.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Document sharing could not be changed.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleArchive(documentId: string) {
    if (busyId || !window.confirm('Archive this document? It will be removed from clinic lists and the patient portal.')) return
    setBusyId(documentId)
    setError(null)
    setMessage(null)
    try {
      await archiveDocumentPersisted(documentId)
      setDocuments(getStoredDocuments())
      setMessage('Document archived.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Document could not be archived.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDownload(document: PatientDocument) {
    setBusyId(document.id)
    setError(null)
    try {
      await downloadPatientDocumentFile(document)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to download document.')
    } finally {
      setBusyId(null)
    }
  }

  function openUpload() {
    if (!selectedPatientId && patients[0]?.patientId) setSelectedPatientId(patients[0].patientId)
    setUploadOpen(true)
  }

  return (
    <PageScaffold
      eyebrow="Clinical workspace"
      title="Documents"
      description="Manage private patient files and intentionally shared portal documents."
      status={loading ? 'Loading' : `${documents.length} active`}
    >
      <div className="documents-workspace documents-workspace-v10">
        {message && <div className="success-alert">{message}</div>}
        {error && <div className="error-alert" role="alert">{error}</div>}

        <section className="documents-v10-hero">
          <div className="documents-v10-hero-copy">
            <span className="documents-v10-hero-icon"><Files size={22} /></span>
            <div>
              <span className="documents-v10-kicker">Clinical workspace</span>
              <h2>Documents</h2>
              <p>Manage private patient files and intentionally shared portal documents.</p>
            </div>
          </div>
          <div className="documents-v10-hero-actions">
            <div className="documents-v10-count">
              <Files size={17} />
              <span><strong>{documents.length}</strong><small>Active files</small></span>
            </div>
            {canUpload && (
              <Button icon={<UploadCloud size={16} />} onClick={openUpload} disabled={!patients.length}>
                Upload document
              </Button>
            )}
          </div>
        </section>

        <section className="documents-v10-metrics" aria-label="Document summary">
          <article><span><FolderOpen size={17} /></span><div><strong>{filtered.length}</strong><small>In current view</small></div></article>
          <article><span><Share2 size={17} /></span><div><strong>{sharedCount}</strong><small>Shared with portal</small></div></article>
          <article><span><LockKeyhole size={17} /></span><div><strong>{privateCount}</strong><small>Private to clinic</small></div></article>
          <article><span><UploadCloud size={17} /></span><div><strong>{lastUpload}</strong><small>Latest upload</small></div></article>
        </section>

        <section className="documents-toolbar panel documents-v10-toolbar">
          <label className="documents-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search file, patient, uploader..." />
          </label>
          <Select
            label="Patient"
            value={selectedPatientId}
            onChange={(event) => setSelectedPatientId(event.target.value)}
            options={[{ label: 'All patients', value: '' }, ...patients.map((patient) => ({ label: `${patient.lastName}, ${patient.firstName} - ${patient.patientId}`, value: patient.patientId }))]}
          />
          <Select
            label="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value as DocumentCategory | 'all')}
            options={[
              { label: 'All categories', value: 'all' },
              { label: 'X-ray', value: 'xray' },
              { label: 'Consent form', value: 'consent' },
              { label: 'Referral', value: 'referral' },
              { label: 'Prescription', value: 'prescription' },
              { label: 'Lab result', value: 'lab_result' },
              { label: 'Medical document', value: 'medical' },
              { label: 'Treatment document', value: 'treatment' },
              { label: 'Treatment photo', value: 'treatment_photo' },
              { label: 'Other', value: 'other' },
            ]}
          />
          <Select
            label="Sharing"
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as VisibilityFilter)}
            options={[
              { label: 'All files', value: 'all' },
              { label: 'Shared with portal', value: 'shared' },
              { label: 'Private clinic files', value: 'private' },
            ]}
          />
        </section>

        <div className="documents-v10-layout">
          <aside className="documents-v10-context" aria-label="Patient context">
            <div className="documents-v10-context-head">
              <span><UserRound size={18} /></span>
              <div>
                <strong>{selectedPatient ? patientName(selectedPatient.patientId) : 'All patients'}</strong>
                <small>{selectedPatient ? selectedPatient.patientId : 'Library-wide view'}</small>
              </div>
            </div>
            <div className="documents-v10-context-stats">
              <span><strong>{patientDocuments.length}</strong><small>Files</small></span>
              <span><strong>{selectedSharedCount}</strong><small>Shared</small></span>
            </div>
            <div className="documents-v10-privacy-note">
              <LockKeyhole size={16} />
              <p>New uploads stay private to the clinic unless the sharing control is enabled.</p>
            </div>
            {canUpload && (
              <Button variant="secondary" icon={<FilePlus2 size={16} />} onClick={openUpload} disabled={!patients.length}>
                Add patient file
              </Button>
            )}
          </aside>

          <section className="documents-list-shell documents-v10-library" aria-label="Document library">
            <header className="documents-v10-library-head">
              <div>
                <span className="documents-v10-kicker">Existing documents</span>
                <h3>Library results</h3>
              </div>
              <Badge tone="info">{filtered.length} shown</Badge>
            </header>
            {loading ? (
              <SkeletonList items={6} withAvatar />
            ) : filtered.map((document) => (
              <article key={document.id} className="documents-row documents-v10-row">
                <span className="documents-row-icon">{fileIcon(document)}</span>
                <div className="documents-row-main">
                  <strong>{document.fileName}</strong>
                  <span>{patientName(document.patientId)} - {document.patientId}</span>
                  <small>{categoryLabel(document.category)} - {formatDate(document.createdAt)} - {formatBytes(document.sizeBytes)}</small>
                  {document.description && <p>{document.description}</p>}
                </div>
                <div className="documents-v10-meta">
                  <Badge tone={document.patientVisible ? 'success' : 'info'} icon={document.patientVisible ? <Share2 size={13} /> : <LockKeyhole size={13} />}>
                    {document.patientVisible ? 'Shared' : 'Private'}
                  </Badge>
                  <small>Uploaded by {document.uploadedBy || 'Clinic user'}</small>
                </div>
                <div className="documents-row-actions">
                  {document.content && <button type="button" disabled={busyId === document.id} aria-label={`Download ${document.fileName}`} onClick={() => void handleDownload(document)}><Download size={16} /></button>}
                  {canUpload && (
                    <Button size="sm" variant="secondary" onClick={() => void handleToggle(document.id, !document.patientVisible)} disabled={busyId === document.id} icon={<ShieldCheck size={14} />}>
                      {document.patientVisible ? 'Make private' : 'Share'}
                    </Button>
                  )}
                  {canUpload && (
                    <Button size="sm" variant="ghost" onClick={() => void handleArchive(document.id)} disabled={busyId === document.id} icon={<Archive size={14} />}>
                      Archive
                    </Button>
                  )}
                </div>
              </article>
            ))}
            {!loading && !filtered.length && <EmptyState title="No documents found" message="Uploaded patient files that match your filters will appear here." />}
          </section>
        </div>

        {canUpload && uploadOpen && createPortal(
          <div className="documents-v10-upload-shell">
            <div className="documents-v10-upload-backdrop" onClick={() => setUploadOpen(false)} />
            <section className="documents-upload-zone documents-v10-upload-panel" role="dialog" aria-modal="true" aria-labelledby="documents-v10-upload-title">
              <header>
                <div>
                  <span className="documents-v10-kicker">Upload workflow</span>
                  <h3 id="documents-v10-upload-title">{selectedPatientId ? `Upload for ${patientName(selectedPatientId)}` : 'Choose a patient'}</h3>
                  <p>Files are stored privately first. Share with the patient portal only when the document is ready for patient access.</p>
                </div>
                <button type="button" className="modal-close-button documents-v10-close" data-modal-close aria-label="Close upload panel" onClick={() => setUploadOpen(false)}><X size={18} /></button>
              </header>
              <div className="documents-v10-upload-body">
                {!selectedPatientId && (
                  <Select
                    label="Patient"
                    value={selectedPatientId}
                    onChange={(event) => setSelectedPatientId(event.target.value)}
                    options={[{ label: 'Choose patient', value: '' }, ...patients.map((patient) => ({ label: `${patient.lastName}, ${patient.firstName} - ${patient.patientId}`, value: patient.patientId }))]}
                  />
                )}
                {selectedPatientId
                  ? <DocumentUploadPanel patientId={selectedPatientId} uploadedBy={actor} defaultPatientVisible={false} onUpload={handleUpload} onCancel={() => setUploadOpen(false)} />
                  : <EmptyState title="Patient required" message="Select a patient before attaching a clinic document." />}
              </div>
            </section>
          </div>,
          document.body,
        )}
      </div>
    </PageScaffold>
  )
}
