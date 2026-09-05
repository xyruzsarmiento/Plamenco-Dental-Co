import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Activity, CheckCircle2, Clock3, PhilippinePeso, Sparkles, Stethoscope, X } from 'lucide-react'
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
    <div className="svc15-modal-backdrop svc-premium-backdrop" onClick={onClose}>
      <section className="svc15-modal svc-premium-modal" role="dialog" aria-modal="true" aria-labelledby="svc15-modal-title" onClick={(event) => event.stopPropagation()}>
        <header className="svc15-modal-head svc-premium-head">
          <div className="svc-premium-titleline">
            <span className="svc-premium-head-icon"><Stethoscope size={21} /></span>
            <div>
              <span>Service catalogue</span>
              <h2 id="svc15-modal-title">{mode === 'add' ? 'Create service' : 'Edit service'}</h2>
              <p>Configure the patient-facing procedure, clinical duration, catalogue price and availability in one place.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close service editor"><X size={20} /></button>
        </header>

        <form onSubmit={submit} className="svc15-modal-body svc-premium-body">
          <div className="svc15-form-grid svc-premium-grid">
            <main className="svc15-form-main svc-premium-form">
              <section className="svc15-form-section svc-premium-section">
                <div className="svc15-section-title svc-premium-section-title">
                  <span className="svc-premium-section-icon"><Sparkles size={17} /></span>
                  <div><strong>Service identity</strong><span>How this procedure appears to staff and patients.</span></div>
                </div>
                <label className="svc-premium-field"><span>Service name</span><input value={values.name} onChange={(event) => set('name', event.target.value)} placeholder="e.g. Preventive dental cleaning" autoFocus /></label>
                <label className="svc-premium-field"><span>Description</span><textarea value={values.description} onChange={(event) => set('description', event.target.value)} rows={4} placeholder="Briefly describe the procedure and what the patient can expect." /><small>{values.description.trim().length}/240 recommended characters</small></label>
                <div className="svc15-two-col svc-premium-two-col">
                  <label className="svc-premium-field"><span>Category</span><select value={values.category} onChange={(event) => set('category', event.target.value)}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
                  <label className="svc-premium-field"><span>Availability</span><select value={values.status} onChange={(event) => set('status', event.target.value as ServiceStatus)}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
                </div>
              </section>

              <section className="svc15-form-section svc-premium-section">
                <div className="svc15-section-title svc-premium-section-title">
                  <span className="svc-premium-section-icon"><Activity size={17} /></span>
                  <div><strong>Pricing & duration</strong><span>Used by booking, treatment planning and billing workflows.</span></div>
                </div>
                <div className="svc15-two-col svc-premium-two-col">
                  <label className="svc-premium-field"><span>Catalogue price</span><div className="svc15-input-icon svc-premium-input-icon"><PhilippinePeso size={16} /><input type="number" min="0" step="1" value={values.price} onChange={(event) => set('price', Number(event.target.value) || 0)} placeholder="0" /></div></label>
                  <label className="svc-premium-field"><span>Appointment duration</span><div className="svc15-input-icon svc-premium-input-icon"><Clock3 size={16} /><input type="number" min="1" step="5" value={values.duration} onChange={(event) => set('duration', Number(event.target.value) || 30)} /><em>min</em></div></label>
                </div>
              </section>

              {error && <div className="svc15-form-error svc-premium-error" role="alert">{error}</div>}
            </main>

            <aside className="svc15-preview svc-premium-preview" aria-label="Service preview">
              <div className="svc-premium-preview-label"><span>Live preview</span><small>Patient-facing card</small></div>
              <div className="svc15-preview-card svc-premium-preview-card">
                <div className="svc-premium-preview-top">
                  <span className="svc-premium-preview-icon"><Stethoscope size={20} /></span>
                  <b className={values.status === 'active' ? 'is-active' : ''}>{values.status}</b>
                </div>
                <small className="svc-premium-preview-category">{values.category || 'Category'}</small>
                <h3>{values.name.trim() || 'Untitled service'}</h3>
                <p>{values.description.trim() || 'Your service description will appear here.'}</p>
                <div className="svc15-preview-metrics svc-premium-preview-metrics">
                  <div><span>Price</span><strong>{values.price > 0 ? `₱${values.price.toLocaleString('en-PH')}` : 'To confirm'}</strong></div>
                  <div><span>Duration</span><strong>{values.duration} min</strong></div>
                </div>
              </div>
              <div className="svc-premium-db-note"><CheckCircle2 size={16} /><span>Changes are saved to the clinic database after validation.</span></div>
            </aside>
          </div>

          <footer className="svc15-modal-actions svc-premium-actions">
            <span className="svc-premium-actions-note">{mode === 'add' ? 'Create a new catalogue entry' : 'Update the existing catalogue entry'}</span>
            <div><Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</Button><Button type="submit" disabled={isSubmitting || Boolean(duplicate)}>{isSubmitting ? 'Saving…' : mode === 'add' ? 'Create service' : 'Save changes'}</Button></div>
          </footer>
        </form>
      </section>
    </div>
  )
}
