import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Activity, Clock3, PhilippinePeso, Sparkles, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import type { Service, ServiceFormValues, ServiceStatus } from './serviceTypes'

const CATEGORIES = ['Preventive', 'Restorative', 'Surgical', 'Cosmetic', 'Orthodontics', 'General']

type Props = {
  mode: 'add' | 'edit'
  service?: Service
  existingServices: Service[]
  onSubmit: (values: ServiceFormValues) => Promise<void> | void
  onClose: () => void
  isSubmitting?: boolean
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function ServiceFormModalV15({ mode, service, existingServices, onSubmit, onClose, isSubmitting = false }: Props) {
  const [values, setValues] = useState<ServiceFormValues>({ name: '', description: '', category: 'Preventive', duration: 30, price: 0, status: 'active' })
  const [error, setError] = useState('')

  useEffect(() => {
    if (mode === 'edit' && service) {
      setValues({ name: service.name, description: service.description, category: service.category, duration: service.duration, price: service.price, status: service.status })
    }
  }, [mode, service])

  const duplicate = useMemo(() => existingServices.find((entry) => entry.id !== service?.id && normalize(entry.name) === normalize(values.name) && normalize(entry.category) === normalize(values.category)), [existingServices, service?.id, values.category, values.name])

  function set<K extends keyof ServiceFormValues>(key: K, value: ServiceFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!values.name.trim()) return setError('Service name is required.')
    if (!values.description.trim()) return setError('Add a short patient-facing service description.')
    if (values.duration <= 0) return setError('Duration must be greater than 0 minutes.')
    if (values.price < 0) return setError('Price cannot be negative.')
    if (duplicate) return setError(`${duplicate.name} already exists in ${duplicate.category}. Edit the existing service instead of creating a duplicate.`)
    await onSubmit(values)
  }

  return (
    <div className="svc15-modal-backdrop" onClick={onClose}>
      <section className="svc15-modal" role="dialog" aria-modal="true" aria-labelledby="svc15-modal-title" onClick={(event) => event.stopPropagation()}>
        <header className="svc15-modal-head">
          <div><span>Service catalogue</span><h2 id="svc15-modal-title">{mode === 'add' ? 'Create a clinic service' : 'Edit clinic service'}</h2><p>Define how this procedure appears across scheduling, treatment planning and billing.</p></div>
          <button type="button" onClick={onClose} aria-label="Close service editor"><X size={20} /></button>
        </header>

        <form onSubmit={submit} className="svc15-modal-body">
          <div className="svc15-form-grid">
            <section className="svc15-form-main">
              <div className="svc15-form-section">
                <div className="svc15-section-title"><Sparkles size={17} /><div><strong>Service identity</strong><span>Patient-facing catalogue information</span></div></div>
                <label><span>Service name</span><input value={values.name} onChange={(event) => set('name', event.target.value)} placeholder="e.g. Preventive exam" autoFocus /></label>
                <label><span>Description</span><textarea value={values.description} onChange={(event) => set('description', event.target.value)} rows={5} placeholder="Describe the procedure and what patients can expect." /></label>
                <div className="svc15-two-col">
                  <label><span>Category</span><select value={values.category} onChange={(event) => set('category', event.target.value)}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
                  <label><span>Status</span><select value={values.status} onChange={(event) => set('status', event.target.value as ServiceStatus)}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
                </div>
              </div>

              <div className="svc15-form-section">
                <div className="svc15-section-title"><Activity size={17} /><div><strong>Operational setup</strong><span>Used by booking and clinical workflows</span></div></div>
                <div className="svc15-two-col">
                  <label><span>Price (PHP)</span><div className="svc15-input-icon"><PhilippinePeso size={16} /><input type="number" min="0" step="1" value={values.price} onChange={(event) => set('price', Number(event.target.value) || 0)} /></div></label>
                  <label><span>Duration</span><div className="svc15-input-icon"><Clock3 size={16} /><input type="number" min="1" value={values.duration} onChange={(event) => set('duration', Number(event.target.value) || 30)} /><em>min</em></div></label>
                </div>
              </div>
              {error && <div className="svc15-form-error" role="alert">{error}</div>}
            </section>

            <aside className="svc15-preview">
              <span>Live preview</span>
              <div className="svc15-preview-card">
                <div><small>{values.category || 'Category'}</small><b className={values.status === 'active' ? 'is-active' : ''}>{values.status}</b></div>
                <h3>{values.name.trim() || 'Untitled service'}</h3>
                <p>{values.description.trim() || 'Your service description will appear here.'}</p>
                <div className="svc15-preview-metrics"><div><span>Price</span><strong>{values.price > 0 ? `₱${values.price.toLocaleString('en-PH')}` : 'To confirm'}</strong></div><div><span>Duration</span><strong>{values.duration} min</strong></div></div>
              </div>
              <p className="svc15-preview-note">Service pricing is the catalogue price used by downstream treatment-plan and billing workflows.</p>
            </aside>
          </div>

          <footer className="svc15-modal-actions"><Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</Button><Button type="submit" disabled={isSubmitting || Boolean(duplicate)}>{isSubmitting ? 'Saving…' : mode === 'add' ? 'Create service' : 'Save changes'}</Button></footer>
        </form>
      </section>
    </div>
  )
}
