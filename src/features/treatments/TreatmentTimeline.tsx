import { Edit, Trash2, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import type { Treatment } from './treatmentTypes'
import type { Service } from '../services/serviceTypes'

type TreatmentTimelineProps = {
  treatments: Treatment[]
  services: Service[]
  onEdit: (treatment: Treatment) => void
  onDelete: (treatmentId: string) => void
  onStatusChange: (treatmentId: string, status: Treatment['status']) => void
}

const STATUS_ICONS = {
  planned: AlertCircle,
  scheduled: Clock,
  in_progress: Clock,
  completed: CheckCircle,
  cancelled: AlertCircle,
}

const STATUS_COLORS = {
  planned: '#E5D2A5',
  scheduled: '#C6A15B',
  in_progress: '#C6A15B',
  completed: '#2A5F4A',
  cancelled: '#7D4F4F',
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function TreatmentTimeline({
  treatments,
  services,
  onEdit,
  onDelete,
  onStatusChange,
}: TreatmentTimelineProps) {
  if (treatments.length === 0) {
    return (
      <div className="timeline-empty-state">
        <div className="empty-state-icon">📋</div>
        <h3>No treatments yet</h3>
        <p>Add your first treatment to begin tracking patient care</p>
      </div>
    )
  }

  return (
    <div className="treatment-timeline">
      {treatments.map((treatment, index) => {
        const service = services.find((s) => s.id === treatment.serviceId)
        const StatusIcon = STATUS_ICONS[treatment.status]

        return (
          <div key={treatment.id} className="timeline-item-wrapper">
            {/* Timeline line connector */}
            {index < treatments.length - 1 && <div className="timeline-line" />}

            {/* Timeline node */}
            <div className="timeline-node-wrapper">
              <div
                className="timeline-node"
                style={{ borderColor: STATUS_COLORS[treatment.status] }}
              >
                <StatusIcon size={16} style={{ color: STATUS_COLORS[treatment.status] }} />
              </div>
            </div>

            {/* Treatment card */}
            <div className="timeline-card">
              <div className="card-header">
                <div className="card-header-left">
                  <h4 className="card-title">{treatment.description}</h4>
                  <p className="card-date">
                    {new Date(treatment.treatmentDate).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>

                <select
                  className={`card-status-select status-${treatment.status}`}
                  value={treatment.status}
                  onChange={(e) => onStatusChange(treatment.id, e.target.value as Treatment['status'])}
                >
                  <option value="planned">Planned</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="card-content">
                {service && <p className="card-service">{service.name}</p>}

                <div className="card-metadata-grid">
                  <div className="metadata-cell">
                    <span className="metadata-label">Cost</span>
                    <span className="metadata-value">{formatCurrency(treatment.cost)}</span>
                  </div>
                  {treatment.toothNumber && (
                    <div className="metadata-cell">
                      <span className="metadata-label">Tooth</span>
                      <span className="metadata-value">#{treatment.toothNumber}</span>
                    </div>
                  )}
                </div>

                {treatment.notes && <p className="card-notes">{treatment.notes}</p>}
              </div>

              <div className="card-actions">
                <button
                  className="action-button edit-button"
                  onClick={() => onEdit(treatment)}
                  title="Edit treatment"
                >
                  <Edit size={14} />
                  Edit
                </button>
                <button
                  className="action-button delete-button"
                  onClick={() => onDelete(treatment.id)}
                  title="Delete treatment"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
