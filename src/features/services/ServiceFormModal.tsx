import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Service, ServiceFormValues, ServiceStatus } from './serviceTypes'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { Button } from '../../components/ui/Button'

const CATEGORIES = ['Preventive', 'Restorative', 'Surgical', 'Cosmetic', 'Orthodontics']

type ServiceFormModalProps = {
  mode: 'add' | 'edit'
  service?: Service
  onSubmit: (values: ServiceFormValues) => Promise<void> | void
  onClose: () => void
  isSubmitting?: boolean
}

export function ServiceFormModal({ mode, service, onSubmit, onClose, isSubmitting = false }: ServiceFormModalProps) {
  const [values, setValues] = useState<ServiceFormValues>({
    name: '',
    description: '',
    category: 'Preventive',
    duration: 30,
    price: 0,
    status: 'active',
  })

  const [error, setError] = useState('')

  useEffect(() => {
    if (mode === 'edit' && service) {
      setValues({
        name: service.name,
        description: service.description,
        category: service.category,
        duration: service.duration,
        price: service.price,
        status: service.status,
      })
    }
  }, [mode, service])

  function handleChange(key: keyof ServiceFormValues, value: string | number | ServiceStatus) {
    setValues((prev) => ({ ...prev, [key]: value }))
    setError('')
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!values.name.trim()) {
      setError('Service name is required.')
      return
    }

    if (!values.description.trim()) {
      setError('Service description is required.')
      return
    }

    if (values.duration <= 0) {
      setError('Duration must be greater than 0 minutes.')
      return
    }

    if (values.price < 0) {
      setError('Price cannot be negative.')
      return
    }

    await onSubmit(values)
  }

  const title = mode === 'add' ? 'Add service' : 'Edit service'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal service-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p>Service management</p>
            <h2>{title}</h2>
          </div>
          <button className="modal-close" type="button" onClick={onClose} title="Close form" aria-label="Close form">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form service-modal-form">
          {error && <div className="form-error">{error}</div>}

          <div className="form-section">
            <div className="form-grid">
              <Input
                label="Service name"
                type="text"
                value={values.name}
                onChange={(event) => handleChange('name', event.target.value)}
                placeholder="e.g. Preventive exam"
              />
              <Select
                label="Category"
                value={values.category}
                onChange={(event) => handleChange('category', event.target.value)}
                options={CATEGORIES.map((category) => ({ value: category, label: category }))}
              />
            </div>

            <Textarea
              label="Description"
              value={values.description}
              onChange={(event) => handleChange('description', event.target.value)}
              placeholder="Describe the treatment and what patients can expect."
              rows={4}
            />
          </div>

          <div className="form-section">
            <div className="form-grid">
              <Input
                label="Price (PHP)"
                type="number"
                step="100"
                min="0"
                value={values.price}
                onChange={(event) => handleChange('price', Number(event.target.value) || 0)}
              />
              <Input
                label="Duration (minutes)"
                type="number"
                min="1"
                value={values.duration}
                onChange={(event) => handleChange('duration', Number(event.target.value) || 30)}
              />
            </div>
          </div>

          <div className="form-section">
            <Select
              label="Status"
              value={values.status}
              onChange={(event) => handleChange('status', event.target.value as ServiceStatus)}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
          </div>

          <div className="modal-actions">
            <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : mode === 'add' ? 'Add service' : 'Update service'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
