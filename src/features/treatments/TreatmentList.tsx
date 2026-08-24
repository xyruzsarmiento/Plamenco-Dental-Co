import { CreditCard } from 'lucide-react'
import { StatusBadge } from '../../components/ui/Badge'
import type { Treatment } from './treatmentTypes'
import { getServiceById } from './treatmentStore'
import { getPatientName } from '../dentalRecords/dentalRecordStore'

type TreatmentListProps = {
  treatments: Treatment[]
}

export function TreatmentList({ treatments }: TreatmentListProps) {
  if (treatments.length === 0) {
    return null
  }

  return (
    <div className="treatment-list premium-treatment-list">
      {treatments.map((treatment) => {
        const service = getServiceById(treatment.serviceId)
        const patientName = getPatientName(treatment.patientId)

        return (
          <article key={treatment.id} className="treatment-card premium-treatment-card">
            <div className="treatment-card-header">
              <div className="treatment-title-group">
                <p className="eyebrow">{treatment.status.replace('_', ' ')}</p>
                <h3>{treatment.description}</h3>
              </div>
              <StatusBadge status={treatment.status} variant="compact" />
            </div>

            <div className="treatment-meta-grid">
              <div className="meta-item">
                <span className="meta-label">Patient</span>
                <span className="meta-value">{patientName}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Service</span>
                <span className="meta-value">{service?.name ?? 'Service not found'}</span>
              </div>
              {treatment.toothNumber && (
                <div className="meta-item">
                  <span className="meta-label">Tooth</span>
                  <span className="meta-value">#{treatment.toothNumber}</span>
                </div>
              )}
              <div className="meta-item">
                <span className="meta-label">Date</span>
                <span className="meta-value">
                  {new Date(treatment.treatmentDate).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </div>

            <div className="treatment-details-row">
              <div className="detail-item cost-detail">
                <CreditCard size={14} />
                <span>₱{treatment.cost.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="detail-item status-detail">
                <StatusBadge status={treatment.status} variant="compact" />
              </div>
            </div>

            {treatment.notes && (
              <div className="treatment-notes-section">
                <p className="notes-label">Notes</p>
                <p className="treatment-notes">{treatment.notes}</p>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
