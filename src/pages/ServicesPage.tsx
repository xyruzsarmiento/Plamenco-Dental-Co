import { useMemo, useState } from 'react'
import { ArrowRight, BriefcaseBusiness, CheckCircle2, Clock3, DollarSign, Filter, Plus, Search, Stethoscope, X } from 'lucide-react'
import { PageScaffold } from '../components/ui/PageScaffold'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { ServiceList } from '../features/services/ServiceList'
import { ServiceFormModal } from '../features/services/ServiceFormModal'
import type { Service, ServiceFormValues, ServiceStatus } from '../features/services/serviceTypes'
import {
  getStoredServices,
  createService,
  updateService,
  toggleServiceStatus,
  searchServices,
  filterServices,
  sortServices,
  paginateServices,
  getCategories,
} from '../features/services/serviceStore'

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

export function ServicesPage() {
  const [services, setServices] = useState<Service[]>(() => getStoredServices())
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | ''>('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add')
  const [selectedService, setSelectedService] = useState<Service | undefined>()
  const [detailService, setDetailService] = useState<Service | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const categories = useMemo(() => getCategories(), [services])

  const filteredServices = useMemo(() => {
    let result = searchServices(searchQuery)

    result = filterServices(result, {
      status: statusFilter || undefined,
      category: categoryFilter || undefined,
    })

    return sortServices(result, 'name', 'asc')
  }, [searchQuery, statusFilter, categoryFilter, services])

  const totalPages = Math.max(1, Math.ceil(filteredServices.length / 8))
  const paginatedServices = useMemo(
    () => paginateServices(filteredServices, currentPage, 8),
    [filteredServices, currentPage]
  )

  const summary = useMemo(
    () => ({
      active: services.filter((service) => service.status === 'active').length,
      inactive: services.filter((service) => service.status === 'inactive').length,
      total: services.length,
    }),
    [services]
  )

  function refreshServices() {
    setServices(getStoredServices())
  }

  function handleAddService() {
    setFormMode('add')
    setSelectedService(undefined)
    setFeedback(null)
    setShowForm(true)
  }

  function handleEditService(service: Service) {
    setFormMode('edit')
    setSelectedService(service)
    setFeedback(null)
    setShowForm(true)
  }

  function handleViewService(service: Service) {
    setDetailService(service)
  }

  function handleToggleStatus(service: Service) {
    const updated = toggleServiceStatus(service.id)
    if (updated) {
      setFeedback({
        tone: 'success',
        message: `${updated.name} is now ${updated.status === 'active' ? 'active' : 'inactive'}.`,
      })
      refreshServices()
    }
  }

  async function handleSubmitForm(values: ServiceFormValues) {
    setFeedback(null)
    setIsSubmitting(true)

    try {
      if (formMode === 'add') {
        createService(values)
      } else if (selectedService) {
        updateService(selectedService.id, values)
      }

      refreshServices()
      setShowForm(false)
      setCurrentPage(1)
      setSelectedService(undefined)
      setFeedback({
        tone: 'success',
        message: formMode === 'add' ? 'Service created successfully.' : 'Service updated successfully.',
      })
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to save this service right now.',
      })
      throw error
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleCloseForm() {
    setShowForm(false)
    setSelectedService(undefined)
    setFeedback(null)
  }

  return (
    <PageScaffold title="Services" description="Manage clinic services, pricing, and availability across the practice." status="Operations ready">
      <div className="services-workspace">
        <div className="services-hero">
          <div>
            <p className="section-kicker">Clinic catalogue</p>
            <h3>Services</h3>
          </div>

          <Button
            variant="secondary"
            size="sm"
            icon={<Plus size={15} />}
            onClick={handleAddService}
            className="services-page-action"
          >
            Add Service
          </Button>
        </div>

        <div className="services-summary">
          <div className="summary-card">
            <div className="summary-icon"><BriefcaseBusiness size={18} /></div>
            <div>
              <span>Total services</span>
              <strong>{summary.total}</strong>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon summary-icon-active"><CheckCircle2 size={18} /></div>
            <div>
              <span>Active</span>
              <strong>{summary.active}</strong>
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-icon summary-icon-muted"><Filter size={18} /></div>
            <div>
              <span>Inactive</span>
              <strong>{summary.inactive}</strong>
            </div>
          </div>
        </div>

        <div className="services-toolbar">
          <label className="toolbar-search" htmlFor="service-search">
            <Search size={18} className="search-icon" />
            <input
              id="service-search"
              type="text"
              placeholder="Search service names, descriptions, or categories"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setCurrentPage(1)
              }}
              className="search-input"
            />
          </label>

          <div className="toolbar-filters">
            <Select
              label="Category"
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value)
                setCurrentPage(1)
              }}
              options={[
                { value: '', label: 'All categories' },
                ...categories.map((category) => ({ value: category, label: category })),
              ]}
            />
            <Select
              label="Status"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as ServiceStatus | '')
                setCurrentPage(1)
              }}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
          </div>
        </div>

        {feedback && (
          <div className={`services-feedback services-feedback-${feedback.tone}`} role="status">
            {feedback.message}
          </div>
        )}

        <ServiceList
          services={paginatedServices}
          onView={handleViewService}
          onEdit={handleEditService}
          onToggleStatus={handleToggleStatus}
        />

        {filteredServices.length === 0 && (
          <div className="panel empty-state-panel">
            <Stethoscope size={22} />
            <h3>No services match your filters</h3>
            <p>Try a different search term or add a new clinic service.</p>
          </div>
        )}

        {filteredServices.length > 0 && totalPages > 1 && (
          <div className="pagination-bar">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <ServiceFormModal
          mode={formMode}
          service={selectedService}
          onSubmit={handleSubmitForm}
          onClose={handleCloseForm}
          isSubmitting={isSubmitting}
        />
      )}

      {detailService && (
        <div className="modal-backdrop" onClick={() => setDetailService(null)}>
          <div className="modal service-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p>Service detail</p>
                <h2>{detailService.name}</h2>
              </div>
              <button className="modal-close" type="button" aria-label="Close service details" onClick={() => setDetailService(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-content">
              <div className="service-detail-body">
                <div className="service-detail-topline">
                  <span className="service-category-tag">{detailService.category}</span>
                  <span className={`status-badge status-${detailService.status}`}>
                    {detailService.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <p className="service-detail-description">{detailService.description || 'No description available for this service.'}</p>

                <div className="service-detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Price</span>
                    <strong>{formatPrice(detailService.price)}</strong>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Duration</span>
                    <strong>{detailService.duration} minutes</strong>
                  </div>
                </div>

                <div className="detail-divider" />

                <div className="service-detail-meta">
                  <div className="meta-row">
                    <DollarSign size={16} />
                    <span>{formatPrice(detailService.price)}</span>
                  </div>
                  <div className="meta-row">
                    <Clock3 size={16} />
                    <span>{detailService.duration} minutes</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setDetailService(null)}>
                Close
              </Button>
              <Button onClick={() => { setDetailService(null); handleEditService(detailService) }}>
                Edit service
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageScaffold>
  )
}
