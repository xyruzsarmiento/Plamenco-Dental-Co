import { Building2, Download, FileBadge, FileImage, FileSignature, FileText, LockKeyhole, Share2, UserRound } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import type { PatientDocument } from './documentStore'

type DocumentCardModel = PatientDocument & {
  branchId?: string
  patientName?: string
  branchName?: string
}

type DocumentCardProps = {
  document: DocumentCardModel
  variant?: 'internal' | 'patient'
  busy?: boolean
  onDownload: (document: DocumentCardModel) => void
  onToggleVisibility?: (document: DocumentCardModel) => void
  onArchive?: (document: DocumentCardModel) => void
}

export function documentCategoryLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export function documentFileSize(value: number) {
  if (!value) return 'Size not recorded'
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function documentDate(value?: string) {
  if (!value) return 'Not recorded'
  const source = value.includes('T') ? value : `${value}T00:00:00+08:00`
  const date = new Date(source)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
}

function iconFor(document: DocumentCardModel) {
  const type = document.fileType.toLowerCase()
  if (type.startsWith('image/') || document.category === 'xray' || document.category === 'treatment_photo') return <FileImage size={21} />
  if (document.category === 'consent') return <FileSignature size={21} />
  if (document.category === 'prescription' || document.category === 'lab_result') return <FileBadge size={21} />
  return <FileText size={21} />
}

export function DocumentCard({ busy, document, onArchive, onDownload, onToggleVisibility, variant = 'internal' }: DocumentCardProps) {
  const patientFacing = variant === 'patient'
  return (
    <article className={`shared-document-card shared-document-card-${variant}`}>
      <span className="shared-document-icon">{iconFor(document)}</span>
      <section className="shared-document-main">
        <div className="shared-document-title">
          <strong>{document.fileName}</strong>
          <Badge tone="info">{documentCategoryLabel(document.category)}</Badge>
        </div>
        <p>{document.description || (patientFacing ? 'Shared securely by your clinic for download.' : 'No description recorded.')}</p>
        <dl>
          {!patientFacing && <div><dt>Patient</dt><dd>{document.patientName || document.patientId || 'Patient not recorded'}</dd></div>}
          {!patientFacing && <div><dt>Branch</dt><dd>{document.branchName || 'Branch not recorded'}</dd></div>}
          <div><dt>Date</dt><dd>{documentDate(document.uploadDate || document.createdAt)}</dd></div>
          <div><dt>Type</dt><dd>{document.fileType || 'File'}</dd></div>
          <div><dt>Size</dt><dd>{documentFileSize(document.sizeBytes)}</dd></div>
          {!patientFacing && <div><dt>Uploaded by</dt><dd>{document.uploadedBy || 'Clinic user'}</dd></div>}
        </dl>
        {!patientFacing && (
          <div className="shared-document-badges">
            <span><Building2 size={13} />{document.branchName || 'No branch'}</span>
            <span>{document.patientVisible ? <Share2 size={13} /> : <LockKeyhole size={13} />}{document.patientVisible ? 'Shared with patient' : 'Private clinic file'}</span>
            {document.patientName && <span><UserRound size={13} />{document.patientName}</span>}
          </div>
        )}
        {(document.treatmentId || document.clinicalVisitId) && <small className="shared-document-linked">Related to {document.treatmentId ? `treatment ${document.treatmentId}` : `visit ${document.clinicalVisitId}`}</small>}
      </section>
      <aside className="shared-document-actions">
        <button type="button" disabled={busy} onClick={() => onDownload(document)}><Download size={14} />{busy ? 'Preparing...' : 'Download'}</button>
        {!patientFacing && onToggleVisibility && <button type="button" disabled={busy} onClick={() => onToggleVisibility(document)}>{document.patientVisible ? 'Make private' : 'Share'}</button>}
        {!patientFacing && onArchive && <button type="button" disabled={busy} onClick={() => onArchive(document)}>Archive</button>}
      </aside>
    </article>
  )
}
