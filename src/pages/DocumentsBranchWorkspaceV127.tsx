import { useEffect, useMemo, useState } from 'react'
import { Building2, FileText, FolderOpen, LockKeyhole, Search, Share2, Upload } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { DocumentUploadPanel } from '../features/documents/DocumentUploadPanel'
import {
  archiveBranchDocumentV127,
  createBranchDocumentV127,
  loadBranchDocumentsV127,
  setBranchDocumentVisibilityV127,
  type BranchPatientDocument,
} from '../features/documents/branchDocumentStoreV127'
import { usePermissions } from '../features/auth/permissions'
import { useBranchContext } from '../features/branches/BranchContext'
import { getStoredPatients } from '../features/patients/patientStore'
import { getCurrentSessionUserName } from '../features/security/security'

function shortBranchName(name: string) {
  return name.replace(/^Plamenco Dental Co\.\s*-\s*/i, '') || name
}

function formatBytes(value: number) {
  if (!value) return '—'
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentsBranchWorkspaceV127() {
  const { can } = usePermissions()
  const { activeBranch, activeBranchId, availableBranches, isAllBranchesMode } = useBranchContext()
  const [documents, setDocuments] = useState<BranchPatientDocument[]>([])
  const [query, setQuery] = useState('')
  const [patientId, setPatientId] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const patients = useMemo(() => getStoredPatients().filter((patient) => patient.status === 'active').sort((a, b) => (a.fullName || `${a.firstName} ${a.lastName}`).localeCompare(b.fullName || `${b.firstName} ${b.lastName}`)), [])
  const branchMap = useMemo(() => new Map(availableBranches.map((branch) => [branch.id, branch.name])), [availableBranches])
  const canUpload = can('documents.upload')

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      setDocuments(await loadBranchDocumentsV127(isAllBranchesMode ? undefined : activeBranchId ?? undefined))
    } catch (cause) {
      setDocuments([])
      setError(cause instanceof Error ? cause.message : 'Unable to load documents.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [activeBranchId, isAllBranchesMode])
  useEffect(() => { setUploadOpen(false); setPatientId('') }, [activeBranchId, isAllBranchesMode])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return documents
    return documents.filter((document) => {
      const patient = patients.find((entry) => entry.id === document.patientId || entry.patientId === document.patientId)
      const patientName = patient?.fullName || `${patient?.firstName ?? ''} ${patient?.lastName ?? ''}`
      const branchName = document.branchId ? branchMap.get(document.branchId) ?? '' : 'legacy unresolved branch'
      return `${document.fileName} ${document.category} ${document.uploadedBy} ${patientName} ${branchName}`.toLowerCase().includes(needle)
    })
  }, [branchMap, documents, patients, query])

  async function toggleVisibility(document: BranchPatientDocument) {
    setBusyId(document.id)
    setError(null)
    try {
      const updated = await setBranchDocumentVisibilityV127(document.id, !document.patientVisible)
      setDocuments((current) => current.map((item) => item.id === updated.id ? updated : item))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update document sharing.')
    } finally { setBusyId(null) }
  }

  async function archive(document: BranchPatientDocument) {
    if (!window.confirm(`Archive ${document.fileName}?`)) return
    setBusyId(document.id)
    setError(null)
    try {
      await archiveBranchDocumentV127(document.id)
      setDocuments((current) => current.filter((item) => item.id !== document.id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to archive document.')
    } finally { setBusyId(null) }
  }

  const workspaceTitle = isAllBranchesMode ? 'All Branches' : activeBranch ? shortBranchName(activeBranch.name) : 'Branch required'

  return (
    <section className="doc127-page">
      <header className="doc127-hero">
        <div>
          <span className="doc127-eyebrow">Patient document management</span>
          <h1>Documents</h1>
          <p>Patient files remain part of one clinic-wide record. Operational access follows the branch where each document originated.</p>
        </div>
        <div className="doc127-context" aria-label="Current document branch scope">
          <Building2 size={18} />
          <span><small>{isAllBranchesMode ? 'EXECUTIVE DOCUMENT VIEW' : 'DOCUMENT WORKSPACE'}</small><strong>{workspaceTitle}</strong></span>
        </div>
      </header>

      {isAllBranchesMode && (
        <div className="doc127-safety-note"><LockKeyhole size={18} /><div><strong>All Branches is a review view.</strong><span>Choose Pulilan or Plaridel in the topbar before uploading a new operational document. Existing patient-shared documents remain visible to the patient regardless of originating branch.</span></div></div>
      )}

      <div className="doc127-toolbar">
        <label className="doc127-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search file, patient, category, branch" /></label>
        <Button icon={<Upload size={16} />} disabled={!canUpload || isAllBranchesMode || !activeBranchId} onClick={() => setUploadOpen((value) => !value)}>{uploadOpen ? 'Close upload' : 'Upload document'}</Button>
      </div>

      {uploadOpen && activeBranchId && activeBranch && (
        <section className="doc127-upload-card">
          <header><div><span>UPLOAD TO PATIENT RECORD</span><h2>{shortBranchName(activeBranch.name)} Branch</h2><p>The branch is locked to the current workspace. The patient identity remains clinic-wide.</p></div></header>
          <label className="doc127-patient-select"><span>Patient</span><select value={patientId} onChange={(event) => setPatientId(event.target.value)}><option value="">Choose patient</option>{patients.map((patient) => <option key={patient.id} value={patient.patientId}>{patient.fullName || `${patient.firstName} ${patient.lastName}`} · {patient.patientId}</option>)}</select></label>
          {patientId ? (
            <DocumentUploadPanel
              patientId={patientId}
              uploadedBy={getCurrentSessionUserName()}
              defaultPatientVisible={false}
              onCancel={() => setUploadOpen(false)}
              onUpload={async (payload) => {
                const created = await createBranchDocumentV127({ ...payload, branchId: activeBranchId })
                setDocuments((current) => [created, ...current])
                setUploadOpen(false)
                setPatientId('')
              }}
            />
          ) : <div className="doc127-empty-inline">Choose an existing clinic patient before selecting a file.</div>}
        </section>
      )}

      {error && <div className="doc127-error" role="alert">{error}</div>}

      <section className="doc127-library">
        <header><div><span>DOCUMENT LIBRARY</span><h2>{isAllBranchesMode ? 'Branch comparison library' : `${workspaceTitle} documents`}</h2></div><strong>{visible.length}</strong></header>
        {loading ? <div className="doc127-state">Loading branch-authorized documents…</div> : visible.length === 0 ? <div className="doc127-state"><FolderOpen size={26} /><strong>No documents in this scope</strong><span>Documents will appear here after an authorized upload.</span></div> : (
          <div className="doc127-grid">
            {visible.map((document) => {
              const patient = patients.find((entry) => entry.id === document.patientId || entry.patientId === document.patientId)
              const patientName = patient?.fullName || `${patient?.firstName ?? ''} ${patient?.lastName ?? ''}`.trim() || document.patientId
              const branchName = document.branchId ? branchMap.get(document.branchId) ?? 'Unknown branch' : 'Legacy · branch unresolved'
              return <article key={document.id} className="doc127-card">
                <div className="doc127-file-icon"><FileText size={20} /></div>
                <div className="doc127-file-main"><strong>{document.fileName}</strong><span>{patientName}</span><small>{document.category.replaceAll('_', ' ')} · {formatBytes(document.sizeBytes)} · {new Date(document.createdAt).toLocaleDateString('en-PH')}</small></div>
                <div className="doc127-branch"><Building2 size={14} /><span>{branchName}</span></div>
                <div className="doc127-sharing">{document.patientVisible ? <Share2 size={14} /> : <LockKeyhole size={14} />}<span>{document.patientVisible ? 'Shared with patient' : 'Clinic private'}</span></div>
                <div className="doc127-actions">
                  {document.content && <a className="doc127-link" href={document.content} target="_blank" rel="noreferrer">Open</a>}
                  {canUpload && <button type="button" disabled={busyId === document.id} onClick={() => void toggleVisibility(document)}>{document.patientVisible ? 'Make private' : 'Share'}</button>}
                  {canUpload && <button type="button" disabled={busyId === document.id} onClick={() => void archive(document)}>Archive</button>}
                </div>
              </article>
            })}
          </div>
        )}
      </section>
    </section>
  )
}
