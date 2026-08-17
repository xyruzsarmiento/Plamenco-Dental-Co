import { CheckCircle2, Clock3, DollarSign, Eye, PencilLine, XCircle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import type { Service } from './serviceTypes'

type ServiceListProps = {
  services: Service[]
  onView: (service: Service) => void
  onEdit: (service: Service) => void
  onToggleStatus: (service: Service) => void
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return 'Price to be confirmed'
  }

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value)
}

export function ServiceList({ services, onView, onEdit, onToggleStatus }: ServiceListProps) {
  return (
    <div className="service-card-list">
      {services.length === 0 ? (
        <div className="panel empty-state-panel">
          <PencilLine size={20} />
          <h3>No services found</h3>
          <p>Try adjusting the filters or add a new service to the clinic catalogue.</p>
        </div>
      ) : (
        services.map((service) => (
          <article
            key={service.id}
            className={`service-card panel ${service.status === 'inactive' ? 'is-inactive' : ''}`}
            onClick={() => onView(service)}
          >
            <div className="service-card-header-row">
              <div className="service-card-header-copy">
                <span className="service-category-tag">{service.category}</span>
                <h3>{service.name}</h3>
              </div>
              <span className={`status-badge status-${service.status}`}>
                {service.status === 'active' ? 'Active' : 'Inactive'}
              </span>
            </div>

            <p className="service-card-description">{service.description || 'No description provided.'}</p>

            <div className="service-card-metrics">
              <div className="service-metric">
                <span className="metric-icon"><DollarSign size={14} /></span>
                <div>
                  <small>Price</small>
                  <strong>{formatPrice(service.price)}</strong>
                </div>
              </div>
              <div className="service-metric">
                <span className="metric-icon"><Clock3 size={14} /></span>
                <div>
                  <small>Duration</small>
                  <strong>{service.duration} min</strong>
                </div>
              </div>
            </div>

            <div className="service-card-actions">
              <Button variant="secondary" size="sm" icon={<Eye size={14} />} onClick={(event) => {
                event.stopPropagation()
                onView(service)
              }}>
                View
              </Button>
              <Button variant="secondary" size="sm" icon={<PencilLine size={14} />} onClick={(event) => {
                event.stopPropagation()
                onEdit(service)
              }}>
                Edit
              </Button>
              <Button
                variant={service.status === 'active' ? 'secondary' : 'primary'}
                size="sm"
                icon={service.status === 'active' ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleStatus(service)
                }}
              >
                {service.status === 'active' ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </article>
        ))
      )}
    </div>
  )
}
