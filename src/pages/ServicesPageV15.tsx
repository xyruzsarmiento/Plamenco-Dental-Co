import { useMemo, useState } from 'react'
import { Activity, CheckCircle2, Clock3, Eye, Filter, Layers3, PencilLine, Plus, Search, ShieldCheck, Stethoscope, XCircle } from 'lucide-react'
import { PageScaffold } from '../components/ui/PageScaffold'
import { Button } from '../components/ui/Button'
import { ServiceFormModalV15 } from '../features/services/ServiceFormModalV15'
import type { Service, ServiceFormValues, ServiceStatus } from '../features/services/serviceTypes'
import { createService, getStoredServices, toggleServiceStatus, updateService } from '../features/services/serviceStore'

function money(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 'Price to confirm'
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value)
}

function keyFor(service: Service) {
  const name = service.name.trim().toLowerCase().replace(/\s+/g, ' ')
  const category = service.category.trim().toLowerCase().replace(/\s+/g, ' ')
  return `${name}::${category}`
}

function dedupeServices(services: Service[]) {
  const map = new Map<string, Service>()
  for (const service of services) {
    const key = keyFor(service)
    const existing = map.get(key)
    if (!existing || new Date(service.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) map.set(key, service)
  }
  return Array.from(map.values())
}

export function ServicesPageV15() {
  const [services, setServices] = useState<Service[]>(() => getStoredServices())
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState<'all' | ServiceStatus>('all')
  const [showForm, setShowForm] = useState(false)
  const [mode, setMode] = useState<'add' | 'edit'>('add')
  const [editing, setEditing] = useState<Service | undefined>()
  const [viewing, setViewing] = useState<Service | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const uniqueServices = useMemo(() => dedupeServices(services), [services])
  const duplicateCount = services.length - uniqueServices.length
  const categories = useMemo(() => Array.from(new Set(uniqueServices.map((service) => service.category))).sort(), [uniqueServices])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return uniqueServices
      .filter((service) => !query || `${service.name} ${service.description} ${service.category}`.toLowerCase().includes(query))
      .filter((service) => category === 'all' || service.category === category)
      .filter((service) => status === 'all' || service.status === status)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [category, search, status, uniqueServices])

  const summary = useMemo(() => ({
    total: uniqueServices.length,
    active: uniqueServices.filter((service) => service.status === 'active').length,
    inactive: uniqueServices.filter((service) => service.status === 'inactive').length,
    avgDuration: uniqueServices.length ? Math.round(uniqueServices.reduce((sum, service) => sum + service.duration, 0) / uniqueServices.length) : 0,
  }), [uniqueServices])

  function refresh(message?: string) {
    setServices(getStoredServices())
    setFeedback(message ?? null)
  }

  function add() {
    setMode('add')
    setEditing(undefined)
    setShowForm(true)
    setFeedback(null)
  }

  function edit(service: Service) {
    setMode('edit')
    setEditing(service)
    setViewing(null)
    setShowForm(true)
    setFeedback(null)
  }

  async function save(values: ServiceFormValues) {
    setSaving(true)
    try {
      if (mode === 'add') createService(values)
      else if (editing) updateService(editing.id, values)
      setShowForm(false)
      setEditing(undefined)
      refresh(mode === 'add' ? 'Service added to the clinic catalogue.' : 'Service changes saved.')
    } finally {
      setSaving(false)
    }
  }

  function toggle(service: Service) {
    const updated = toggleServiceStatus(service.id)
    if (updated) refresh(`${updated.name} is now ${updated.status}.`)
  }

  return (
    <PageScaffold title="Services" description="Manage the clinic catalogue, pricing, duration and service availability.">
      <section className="svc15-page">
        <header className="svc15-command">
          <div><span>Clinic catalogue</span><h2>Service operations</h2><p>Maintain one clean source of truth for procedures used by booking, treatment planning and billing.</p></div>
          <Button onClick={add} icon={<Plus size={17} />}>Add service</Button>
        </header>

        <section className="svc15-metrics">
          <article><div className="svc15-metric-icon"><Layers3 size={18} /></div><span>Total services</span><strong>{summary.total}</strong><small>Unique catalogue entries</small></article>
          <article><div className="svc15-metric-icon is-success"><CheckCircle2 size={18} /></div><span>Active</span><strong>{summary.active}</strong><small>Available in current workflows</small></article>
          <article><div className="svc15-metric-icon"><XCircle size={18} /></div><span>Inactive</span><strong>{summary.inactive}</strong><small>Retained but unavailable</small></article>
          <article><div className="svc15-metric-icon"><Clock3 size={18} /></div><span>Average duration</span><strong>{summary.avgDuration} min</strong><small>Across unique services</small></article>
        </section>

        <section className="svc15-toolbar">
          <label className="svc15-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search procedures, descriptions or categories" /></label>
          <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as 'all' | ServiceStatus)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        </section>

        {duplicateCount > 0 && <div className="svc15-dedupe-note"><ShieldCheck size={17} /><div><strong>{duplicateCount} duplicate catalogue {duplicateCount === 1 ? 'entry' : 'entries'} hidden</strong><span>Cards with the same normalized service name and category are collapsed to the most recently updated record.</span></div></div>}
        {feedback && <div className="svc15-feedback" role="status">{feedback}</div>}

        <div className="svc15-section-head"><div><span>Service library</span><h3>{filtered.length} {filtered.length === 1 ? 'service' : 'services'}</h3></div><div className="svc15-view-label"><Filter size={15} /> Filtered catalogue</div></div>

        {filtered.length ? (
          <div className="svc15-grid">
            {filtered.map((service) => (
              <article key={service.id} className={`svc15-card ${service.status === 'inactive' ? 'is-inactive' : ''}`}>
                <div className="svc15-card-top"><span className="svc15-category">{service.category}</span><span className={`svc15-status ${service.status === 'active' ? 'is-active' : ''}`}>{service.status}</span></div>
                <div className="svc15-card-icon"><Stethoscope size={21} /></div>
                <h3>{service.name}</h3>
                <p>{service.description || 'No description provided.'}</p>
                <div className="svc15-card-metrics"><div><span>Catalogue price</span><strong>{money(service.price)}</strong></div><div><span>Duration</span><strong>{service.duration} min</strong></div></div>
                <div className="svc15-card-actions"><Button variant="secondary" size="sm" icon={<Eye size={14} />} onClick={() => setViewing(service)}>Details</Button><Button variant="secondary" size="sm" icon={<PencilLine size={14} />} onClick={() => edit(service)}>Edit</Button><button type="button" className="svc15-toggle" onClick={() => toggle(service)}>{service.status === 'active' ? 'Deactivate' : 'Activate'}</button></div>
              </article>
            ))}
          </div>
        ) : (
          <div className="svc15-empty"><Search size={24} /><h3>No services match this view</h3><p>Adjust your filters or create a new service.</p><Button onClick={add} icon={<Plus size={15} />}>Add service</Button></div>
        )}

        {showForm && <ServiceFormModalV15 mode={mode} service={editing} existingServices={uniqueServices} onSubmit={save} onClose={() => { setShowForm(false); setEditing(undefined) }} isSubmitting={saving} />}

        {viewing && (
          <div className="svc15-modal-backdrop" onClick={() => setViewing(null)}>
            <aside className="svc15-detail" role="dialog" aria-modal="true" aria-labelledby="svc15-detail-title" onClick={(event) => event.stopPropagation()}>
              <div className="svc15-detail-head"><div><span>Service detail</span><h2 id="svc15-detail-title">{viewing.name}</h2><p>{viewing.category} · {viewing.status}</p></div><button type="button" onClick={() => setViewing(null)} aria-label="Close service details">×</button></div>
              <div className="svc15-detail-body"><div className="svc15-detail-icon"><Activity size={24} /></div><p>{viewing.description || 'No description provided.'}</p><div className="svc15-detail-metrics"><div><span>Catalogue price</span><strong>{money(viewing.price)}</strong></div><div><span>Duration</span><strong>{viewing.duration} minutes</strong></div><div><span>Status</span><strong>{viewing.status}</strong></div><div><span>Category</span><strong>{viewing.category}</strong></div></div></div>
              <div className="svc15-detail-actions"><Button variant="secondary" onClick={() => setViewing(null)}>Close</Button><Button onClick={() => edit(viewing)}>Edit service</Button></div>
            </aside>
          </div>
        )}
      </section>
    </PageScaffold>
  )
}
