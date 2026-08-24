import { CalendarDays, Pencil, Trash2 } from 'lucide-react'
import { StatusBadge } from '../../components/ui/Badge'
import type { DentalRecord } from './dentalRecordTypes'

type DentalRecordListProps = {
  records: DentalRecord[]
  onEdit: (record: DentalRecord) => void
  onDelete: (record: DentalRecord) => void
}

function formatDate(value: string) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function DentalRecordList({ records, onDelete, onEdit }: DentalRecordListProps) {
  if (records.length === 0) {
    return null
  }

  return (
    <div className="clinical-timeline">
      {records.map((record) => (
        <article key={record.id} className="clinical-visit">
          <div className="clinical-visit-marker" aria-hidden="true" />
          <div className="clinical-visit-body">
            <div className="clinical-visit-header">
              <div>
                <p className="eyebrow">{record.visitType.replace('_', ' ')}</p>
                <h3>{record.chiefComplaint}</h3>
              </div>
              <div className="record-card-actions">
                <button type="button" className="icon-button" aria-label="Edit dental record" onClick={() => onEdit(record)}>
                  <Pencil size={16} />
                </button>
                <button type="button" className="icon-button icon-button-danger" aria-label="Delete dental record" onClick={() => onDelete(record)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="clinical-meta-row">
              <span>
                <CalendarDays size={14} />
                {formatDate(record.recordDate)}
              </span>
              <StatusBadge status={record.status} variant="compact" />
            </div>

            <div className="clinical-grid">
              <div>
                <span className="label">Date</span>
                <p>{formatDate(record.recordDate)}</p>
              </div>
              <div>
                <span className="label">Chief complaint</span>
                <p>{record.chiefComplaint || 'Not provided'}</p>
              </div>
              <div>
                <span className="label">Diagnosis</span>
                <p>{record.diagnosis || 'Not provided'}</p>
              </div>
              <div>
                <span className="label">Treatment</span>
                <p>{record.treatmentPlan || 'Not provided'}</p>
              </div>
              <div className="clinical-grid-full">
                <span className="label">Clinical notes</span>
                <p>{record.treatmentNotes || record.findings || 'Not provided'}</p>
              </div>
              <div>
                <span className="label">Follow-up</span>
                <p>{record.followUpDate ? formatDate(record.followUpDate) : 'Not scheduled'}</p>
              </div>
              <div>
                <span className="label">Findings</span>
                <p>{record.findings || 'Not provided'}</p>
              </div>
            </div>

            <div className="record-footer">
              <StatusBadge status={record.status} variant="compact" />
              {record.followUpDate && (
                <small>Follow-up: {formatDate(record.followUpDate)}</small>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}
