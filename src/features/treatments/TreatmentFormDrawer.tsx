import { useState, useEffect, type FormEvent } from 'react'
import { X } from 'lucide-react'
import type { TreatmentFormValues } from './treatmentTypes'

type TreatmentFormDrawerProps = {
  mode: 'add' | 'edit'
  patientName: string
  services: Array<{ value: string; label: string }>
  initialValues: TreatmentFormValues
  onClose: () => void
  onSubmit: (values: TreatmentFormValues) => void
}

export function TreatmentFormDrawer({
  mode,
  patientName,
  services,
  initialValues,
  onClose,
  onSubmit,
}: TreatmentFormDrawerProps) {
  const [values, setValues] = useState<TreatmentFormValues>(initialValues)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValues(initialValues)
  }, [initialValues])

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!values.description.trim()) {
      setError('Treatment description is required')
      return
    }

    if (!values.serviceId) {
      setError('Please select a service')
      return
    }

    onSubmit(values)
  }

  return (
    <div className="treatment-drawer-backdrop" onClick={onClose} role="presentation">
      <div
        className="treatment-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <div className="drawer-header">
          <div>
            <p className="drawer-eyebrow">{mode === 'add' ? 'New' : 'Edit'} treatment</p>
            <h2 id="drawer-title">{patientName}</h2>
          </div>
          <button className="drawer-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form className="drawer-content" onSubmit={handleSubmit}>
          {error && <div className="form-error-alert">{error}</div>}

          {/* Treatment info section */}
          <div className="form-section">
            <h3 className="section-title">Treatment details</h3>
            <div className="form-field-group">
              <label className="form-label">Service</label>
              <select
                className="form-select"
                value={values.serviceId}
                onChange={(e) => setValues({ ...values, serviceId: e.target.value })}
              >
                <option value="">Select service</option>
                {services.map((service) => (
                  <option key={service.value} value={service.value}>
                    {service.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field-group">
              <label className="form-label">Description</label>
              <input
                type="text"
                className="form-input"
                value={values.description}
                onChange={(e) => setValues({ ...values, description: e.target.value })}
                placeholder="e.g., Root canal treatment"
              />
            </div>

            <div className="form-row">
              <div className="form-field-group">
                <label className="form-label">Treatment date</label>
                <input
                  type="date"
                  className="form-input"
                  value={values.treatmentDate}
                  onChange={(e) => setValues({ ...values, treatmentDate: e.target.value })}
                />
              </div>

              <div className="form-field-group">
                <label className="form-label">Status</label>
                <select
                  className="form-select"
                  value={values.status}
                  onChange={(e) => setValues({ ...values, status: e.target.value as any })}
                >
                  <option value="planned">Planned</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          </div>

          {/* Clinical info section */}
          <div className="form-section">
            <h3 className="section-title">Clinical information</h3>

            <div className="form-row">
              <div className="form-field-group">
                <label className="form-label">Tooth number (optional)</label>
                <input
                  type="number"
                  className="form-input"
                  value={values.toothNumber ?? ''}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      toothNumber: e.target.value ? parseInt(e.target.value, 10) : undefined,
                    })
                  }
                  placeholder="1-32"
                  min="1"
                  max="32"
                />
              </div>

              <div className="form-field-group">
                <label className="form-label">Cost (PHP)</label>
                <input
                  type="number"
                  className="form-input"
                  value={values.cost}
                  onChange={(e) => setValues({ ...values, cost: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>

            <div className="form-field-group">
              <label className="form-label">Notes (optional)</label>
              <textarea
                className="form-textarea"
                value={values.notes}
                onChange={(e) => setValues({ ...values, notes: e.target.value })}
                placeholder="Add any notes about this treatment..."
                rows={3}
              />
            </div>
          </div>

          {/* Form actions */}
          <div className="drawer-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {mode === 'add' ? 'Add treatment' : 'Update treatment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
