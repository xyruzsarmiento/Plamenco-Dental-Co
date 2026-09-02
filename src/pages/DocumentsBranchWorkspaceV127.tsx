import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Archive,
  Building2,
  Download,
  FileBadge,
  FileImage,
  FileSignature,
  FileText,
  Files,
  FolderOpen,
  LockKeyhole,
  MoreHorizontal,
  Search,
  Share2,
  Upload,
  UserRound,
  X,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Pagination, SkeletonList } from '../components/ui/DesignSystem'
import { DocumentUploadPanel } from '../features/documents/DocumentUploadPanel'
import { documentCategoryLabel, documentFileSize } from '../features/documents/DocumentCard'
import {
  archiveBranchDocumentV127,
  createBranchDocumentV127,
  loadBranchDocumentsV127,
  setBranchDocumentVisibilityV127,
  type BranchPatientDocument,
} from '../features/documents/branchDocumentStoreV127'
import { downloadPatientDocumentFile, type DocumentCategory } from '../features/documents/documentStore'
import { usePermissions } from '../features/auth/permissions'
import { useBranchContext } from '../features/branches/BranchContext'
import { getStoredPatients } from '../features/patients/patientStore'
import { acquireModalScrollLock } from '../lib/modalScrollLock'
import { getCurrentSessionUserName } from '../features/security/security'

const DOCUMENT_PAGE_SIZE = 10

type VisibilityFilter = 'all' | 'shared' | 'private'
type SortOption = 'newest' | 'oldest'

function shortBranchName(name: string) {
  return name.replace(/^Plamenco Dental Co\.\s*-\s*/i, '') || name
}

function patientName(patient?: ReturnType<typeof getStoredPatients>[number]) {
  if (!patient) return ''
  return patient.fullName || [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ')
}

function formatDate(value?: string) {
  if (!value) return 'Not recorded'
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00+08:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
}

function iconFor(document: BranchPatientDocument) {
  const type = document.fileType.toLowerCase()
  if (type.startsWith('image/') || document.category === 'xray' || document.category === 'treatment_photo') return <FileImage size={19} />
  if (document.category === 'consent') return <FileSignature size={19} />
  if (document.category === 'prescription' || document.category === 'lab_result') return <FileBadge size={19} />
  return <FileText size={19} />
}

export function DocumentsBranchWorkspaceV127() {
  const { can } = usePermissions()
  const { activeBranch, activeBranchId, availableBranches, isAllBranchesMode } = useBranchContext()
  const [documents, setDocuments] = useState<BranchPatientDocument[]>([])
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | 'all'>('all')
  const [patientFilter, setPatientFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all')
  const [sort, setSort] = useState<SortOption>('newest')
  const [page, setPage] = useState(1)
  const [uploadPatientId, setUploadPatientId] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const patients = useMemo(() => getStoredPatients()
    .filter((patient) => patient.status === 'active')
    .sort((a, b) => patientName(a).localeCompare(patientName(b))), [])
  const branchMap = useMemo(() => new Map(availableBranches.map((branch) => [branch.id, branch.name])), [availableBranches])
  const patientMap = useMemo(() => new Map(patients.flatMap((patient) => [[patient.id, patient], [patient.patientId, patient]])), [patients])
  const canUpload = can('documents.upload')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setDocuments(await loadBranchDocumentsV127(isAllBranchesMode ? undefined : activeBranchId ?? undefined))
    } catch (cause) {
      setDocuments([])
      setError(cause instanceof Error ? cause.message : 'Documents could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [activeBranchId, isAllBranchesMode])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { setUploadOpen(false); setUploadPatientId(''); setSelectedId(null); setMenuId(null) }, [activeBranchId, isAllBranchesMode])
  useEffect(() => { setPage(1) }, [branchFilter, categoryFilter, patientFilter, query, sort, visibilityFilter])
  useEffect(() => {
    if (!selectedId && !uploadOpen) return undefined
    return acquireModalScrollLock()
  }, [selectedId, uploadOpen])
  useEffect(() => {
    if (!selectedId && !uploadOpen && !menuId) return undefined
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedId(null)
        setUploadOpen(false)
        setMenuId(null)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [menuId, selectedId, uploadOpen])

  const categories = useMemo(() => Array.from(new Set(documents.map((document) => document.category))).sort(), [documents])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return documents
      .filter((document) => {
        const patient = patientMap.get(document.patientId)
        const branchName = document.branchId ? branchMap.get(document.branchId) ?? '' : 'legacy unresolved branch'
        const matchesSearch = !needle || `${document.fileName} ${document.category} ${document.uploadedBy} ${document.description ?? ''} ${patientName(patient)} ${document.patientId} ${branchName}`.toLowerCase().includes(needle)
        const matchesCategory = categoryFilter === 'all' || document.category === categoryFilter
        const matchesPatient = patientFilter === 'all' || document.patientId === patientFilter || patient?.patientId === patientFilter || patient?.id === patientFilter
        const matchesBranch = branchFilter === 'all' || document.branchId === branchFilter
        const matchesVisibility = visibilityFilter === 'all' || (visibilityFilter === 'shared' ? document.patientVisible : !document.patientVisible)
        return matchesSearch && matchesCategory && matchesPatient && matchesBranch && matchesVisibility
      })
      .sort((a, b) => sort === 'newest'
        ? new Date(b.createdAt || b.uploadDate).getTime() - new Date(a.createdAt || a.uploadDate).getTime()
        : new Date(a.createdAt || a.uploadDate).getTime() - new Date(b.createdAt || b.uploadDate).getTime())
  }, [branchFilter, branchMap, categoryFilter, documents, patientFilter, patientMap, query, sort, visibilityFilter])
  const pageCount = Math.max(1, Math.ceil(filtered.length / DOCUMENT_PAGE_SIZE))
  const effectivePage = Math.min(page, pageCount)
  const visiblePage = filtered.slice((effectivePage - 1) * DOCUMENT_PAGE_SIZE, effectivePage * DOCUMENT_PAGE_SIZE)
  const selectedDocument = selectedId ? documents.find((document) => document.id === selectedId) ?? null : null
  const stats = {
    total: documents.length,
    shared: documents.filter((document) => document.patientVisible).length,
    private: documents.filter((document) => !document.patientVisible).length,
    patients: new Set(documents.map((document) => document.patientId).filter(Boolean)).size,
  }
  const workspaceTitle = isAllBranchesMode ? 'All Branches' : activeBranch ? shortBranchName(activeBranch.name) : 'Branch required'
  const uploadDisabled = !canUpload || isAllBranchesMode || !activeBranchId

  async function toggleVisibility(document: BranchPatientDocument) {
    if (busyId) return
    setBusyId(document.id)
    setError(null)
    setSuccess(null)
    try {
      const updated = await setBranchDocumentVisibilityV127(document.id, !document.patientVisible)
      setDocuments((current) => current.map((item) => item.id === updated.id ? updated : item))
      setSuccess(updated.patientVisible ? 'Document is now shared with the patient.' : 'Document is now private to clinic staff.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Document sharing could not be changed.')
    } finally {
      setBusyId(null)
      setMenuId(null)
    }
  }

  async function archive(document: BranchPatientDocument) {
    if (busyId || !window.confirm(`Archive ${document.fileName}?`)) return
    setBusyId(document.id)
    setError(null)
    setSuccess(null)
    try {
      await archiveBranchDocumentV127(document.id)
      setDocuments((current) => current.filter((item) => item.id !== document.id))
      setSelectedId(null)
      setSuccess('Document archived.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Document could not be archived.')
    } finally {
      setBusyId(null)
      setMenuId(null)
    }
  }

  async function downloadDocument(document: BranchPatientDocument) {
    if (busyId) return
    setBusyId(document.id)
    setError(null)
    try {
      await downloadPatientDocumentFile(document)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Document download is unavailable.')
    } finally {
      setBusyId(null)
    }
  }

  function openUpload() {
    if (uploadDisabled) return
    if (!uploadPatientId && patients[0]?.patientId) setUploadPatientId(patients[0].patientId)
    setUploadOpen(true)
  }

  return (
    <section className="doc149-page">
      <header className="doc149-hero">
        <div>
          <span>Documents</span>
          <h1>Manage patient files</h1>
          <p>Manage patient files and clinic-shared documents.</p>
        </div>
        <div className="doc149-hero-actions">
          <span className="doc149-scope-badge"><Building2 size={14} /> {workspaceTitle}{isAllBranchesMode ? ' - Review only' : ''}</span>
          <Button icon={<Upload size={16} />} disabled={uploadDisabled || !patients.length} title={isAllBranchesMode ? 'Select a branch before uploading a document.' : undefined} onClick={openUpload}>Upload document</Button>
        </div>
      </header>

      {isAllBranchesMode && <p className="doc149-compact-note">Select Pulilan or Plaridel to upload a document.</p>}
      {success && <div className="doc149-alert is-success" role="status">{success}</div>}
      {error && <div className="doc149-alert is-error" role="alert"><span>{error}</span><Button size="sm" variant="secondary" onClick={() => void refresh()}>Retry</Button></div>}

      <section className="doc149-summary" aria-label="Document summary">
        <article><Files size={18} /><span>Total files</span><strong>{stats.total}</strong></article>
        <article><Share2 size={18} /><span>Shared with patients</span><strong>{stats.shared}</strong></article>
        <article><LockKeyhole size={18} /><span>Private</span><strong>{stats.private}</strong></article>
        <article><UserRound size={18} /><span>Patients represented</span><strong>{stats.patients}</strong></article>
      </section>

      <section className="doc149-toolbar" aria-label="Document filters">
        <label className="doc149-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files..." /></label>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as DocumentCategory | 'all')} aria-label="Category filter"><option value="all">All categories</option>{categories.map((category) => <option key={category} value={category}>{documentCategoryLabel(category)}</option>)}</select>
        <select value={patientFilter} onChange={(event) => setPatientFilter(event.target.value)} aria-label="Patient filter"><option value="all">All patients</option>{patients.map((patient) => <option key={patient.id} value={patient.patientId}>{patientName(patient)}</option>)}</select>
        {isAllBranchesMode && <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} aria-label="Branch filter"><option value="all">All branches</option>{availableBranches.map((branch) => <option key={branch.id} value={branch.id}>{shortBranchName(branch.name)}</option>)}</select>}
        <select value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value as VisibilityFilter)} aria-label="Visibility filter"><option value="all">All visibility</option><option value="shared">Shared with patient</option><option value="private">Clinic only</option></select>
        <select value={sort} onChange={(event) => setSort(event.target.value as SortOption)} aria-label="Sort documents"><option value="newest">Newest</option><option value="oldest">Oldest</option></select>
      </section>

      <section className="doc149-library">
        <header><div><span>Document list</span><h2>{filtered.length} files</h2></div></header>
        {loading ? <div className="doc149-loading"><SkeletonList items={6} withAvatar /></div> : filtered.length === 0 ? <div className="doc149-empty"><FolderOpen size={28} /><strong>{documents.length ? 'No documents match these filters.' : 'No documents found.'}</strong><span>{documents.length ? 'Clear filters to widen the document list.' : 'Documents will appear here after an authorized upload.'}</span>{documents.length ? <Button size="sm" variant="secondary" onClick={() => { setQuery(''); setCategoryFilter('all'); setPatientFilter('all'); setBranchFilter('all'); setVisibilityFilter('all') }}>Clear filters</Button> : null}</div> : <div className="doc149-list">
          {visiblePage.map((document) => {
            const patient = patientMap.get(document.patientId)
            const branchName = document.branchId ? branchMap.get(document.branchId) ?? 'Unknown branch' : 'Branch not recorded'
            return <article key={document.id} className="doc149-row">
              <button type="button" className="doc149-row-main" onClick={() => setSelectedId(document.id)}>
                <span className="doc149-file-icon">{iconFor(document)}</span>
                <span className="doc149-file-copy"><strong>{document.fileName}</strong><small>{document.description || 'No description recorded.'}</small></span>
                <span className="doc149-category">{documentCategoryLabel(document.category)}</span>
                <span className="doc149-meta"><UserRound size={14} /> {patientName(patient) || document.patientId}</span>
                <span className="doc149-meta"><Building2 size={14} /> {shortBranchName(branchName)}</span>
                <span className="doc149-meta">{formatDate(document.uploadDate || document.createdAt)}</span>
                <span className="doc149-visibility">{document.patientVisible ? <Share2 size={14} /> : <LockKeyhole size={14} />}{document.patientVisible ? 'Shared' : 'Clinic only'}</span>
              </button>
              <div className="doc149-actions">
                <button type="button" disabled={busyId === document.id} onClick={() => void downloadDocument(document)}><Download size={15} /> Download</button>
                <div className="doc149-menu-wrap">
                  <button type="button" className="doc149-icon-button" aria-haspopup="menu" aria-expanded={menuId === document.id} onClick={() => setMenuId(menuId === document.id ? null : document.id)}><MoreHorizontal size={16} /></button>
                  {menuId === document.id && <div className="doc149-menu" role="menu">
                    {canUpload && <button type="button" role="menuitem" disabled={busyId === document.id} onClick={() => void toggleVisibility(document)}>{document.patientVisible ? <LockKeyhole size={14} /> : <Share2 size={14} />}{document.patientVisible ? 'Make private' : 'Share with patient'}</button>}
                    {canUpload && <button type="button" role="menuitem" disabled={busyId === document.id} onClick={() => void archive(document)}><Archive size={14} /> Archive</button>}
                    <button type="button" role="menuitem" onClick={() => { setSelectedId(document.id); setMenuId(null) }}><FileText size={14} /> Details</button>
                  </div>}
                </div>
              </div>
            </article>
          })}
        </div>}
        {filtered.length > DOCUMENT_PAGE_SIZE && <div className="doc149-pagination"><span>Showing {(effectivePage - 1) * DOCUMENT_PAGE_SIZE + 1}-{Math.min(effectivePage * DOCUMENT_PAGE_SIZE, filtered.length)} of {filtered.length}</span><Pagination page={effectivePage} pageCount={pageCount} onPageChange={setPage} label="Document library pagination" /></div>}
      </section>

      {uploadOpen && activeBranchId && <div className="doc149-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setUploadOpen(false) }}>
        <section className="doc149-upload-modal" role="dialog" aria-modal="true" aria-labelledby="doc149-upload-title">
          <header><div><span>Upload document</span><h2 id="doc149-upload-title">Attach a patient file</h2><p>Files are stored privately first. Share only when ready for patient portal access.</p></div><button type="button" className="doc149-icon-button" onClick={() => setUploadOpen(false)} aria-label="Close upload dialog"><X size={18} /></button></header>
          <label className="doc149-upload-patient"><span>Patient</span><select value={uploadPatientId} onChange={(event) => setUploadPatientId(event.target.value)}><option value="">Choose patient</option>{patients.map((patient) => <option key={patient.id} value={patient.patientId}>{patientName(patient)} - {patient.patientId}</option>)}</select></label>
          {uploadPatientId ? <DocumentUploadPanel
            patientId={uploadPatientId}
            uploadedBy={getCurrentSessionUserName()}
            defaultPatientVisible={false}
            onCancel={() => setUploadOpen(false)}
            onUpload={async (payload) => {
              setError(null)
              setSuccess(null)
              const created = await createBranchDocumentV127({ ...payload, branchId: activeBranchId })
              await refresh()
              setUploadOpen(false)
              setUploadPatientId('')
              setSuccess(`${created.fileName} was uploaded and linked to the patient record.`)
            }}
          /> : <div className="doc149-empty is-small">Choose an existing clinic patient before selecting a file.</div>}
        </section>
      </div>}

      {selectedDocument && <div className="doc149-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null) }}>
        <aside className="doc149-drawer" role="dialog" aria-modal="true" aria-labelledby="doc149-detail-title">
          <header><div><span className="doc149-file-icon">{iconFor(selectedDocument)}</span><div><span>Document details</span><h2 id="doc149-detail-title">{selectedDocument.fileName}</h2><p>{documentCategoryLabel(selectedDocument.category)}</p></div></div><button type="button" className="doc149-icon-button" onClick={() => setSelectedId(null)} aria-label="Close document details"><X size={18} /></button></header>
          <div className="doc149-detail-body">
            <section className="doc149-detail-grid">
              <div><span>Patient</span><strong>{patientName(patientMap.get(selectedDocument.patientId)) || selectedDocument.patientId}</strong></div>
              <div><span>Branch</span><strong>{selectedDocument.branchId ? branchMap.get(selectedDocument.branchId) ?? 'Unknown branch' : 'Branch not recorded'}</strong></div>
              <div><span>Upload date</span><strong>{formatDate(selectedDocument.uploadDate || selectedDocument.createdAt)}</strong></div>
              <div><span>File type</span><strong>{selectedDocument.fileType || 'File'}</strong></div>
              <div><span>File size</span><strong>{documentFileSize(selectedDocument.sizeBytes)}</strong></div>
              <div><span>Uploaded by</span><strong>{selectedDocument.uploadedBy || 'Clinic user'}</strong></div>
              <div><span>Visibility</span><strong>{selectedDocument.patientVisible ? 'Shared with patient' : 'Clinic only'}</strong></div>
              <div><span>Storage</span><strong>{selectedDocument.storagePath ? 'Private bucket file' : 'Legacy file reference'}</strong></div>
            </section>
            <section className="doc149-description"><span>Description</span><p>{selectedDocument.description || 'No description recorded.'}</p></section>
          </div>
          <footer>
            <Button icon={<Download size={15} />} disabled={busyId === selectedDocument.id} onClick={() => void downloadDocument(selectedDocument)}>Download</Button>
            {canUpload && <Button variant="secondary" icon={selectedDocument.patientVisible ? <LockKeyhole size={15} /> : <Share2 size={15} />} disabled={busyId === selectedDocument.id} onClick={() => void toggleVisibility(selectedDocument)}>{selectedDocument.patientVisible ? 'Make private' : 'Share'}</Button>}
            {canUpload && <Button variant="danger" icon={<Archive size={15} />} disabled={busyId === selectedDocument.id} onClick={() => void archive(selectedDocument)}>Archive</Button>}
          </footer>
        </aside>
      </div>}
    </section>
  )
}
