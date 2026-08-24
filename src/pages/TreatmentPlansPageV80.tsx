import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, ChevronRight, FileText, Plus, Search, Send, ShieldCheck, Sparkles, Stethoscope, Trash2, UserRound, X } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Pagination, SkeletonList } from '../components/ui/DesignSystem'
import { PageScaffold } from '../components/ui/PageScaffold'
import { usePermissions } from '../features/auth/permissions'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { getStoredPatients } from '../features/patients/patientStore'
import { getStoredServices, servicePriceToCents } from '../features/services/serviceStore'
import {
  createTreatmentPlan,
  formatTreatmentPlanCurrency,
  getTreatmentPlansByPatientId,
  presentTreatmentPlan,
  type TreatmentPlan,
} from '../features/treatmentPlans/treatmentPlanStore'

type DraftItem = {
  key: string
  serviceId: string
  quantity: number
  phase: string
  quotedPricePhp: string
}

const PLAN_PAGE_SIZE_OPTIONS = [10, 20, 50]

function humanize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

function formatDate(value?: string) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
}

function newDraftItem(serviceId: string, price: number): DraftItem {
  return {
    key: `${serviceId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    serviceId,
    quantity: 1,
    phase: '',
    quotedPricePhp: Number.isFinite(price) ? String(price) : '',
  }
}

export function TreatmentPlansPageV80() {
  const { can } = usePermissions()
  const patients = useMemo(() => getStoredPatients(), [])
  const services = useMemo(() => getStoredServices().filter((service) => service.status === 'active'), [])
  const branches = useMemo(() => getStoredBranches().filter((branch) => branch.status === 'active'), [])
  const providers = useMemo(() => getStoredProviders().filter((provider) => provider.status === 'active'), [])

  const [patientSearch, setPatientSearch] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.patientId ?? '')
  const [plans, setPlans] = useState<TreatmentPlan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<TreatmentPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('Treatment Plan')
  const [description, setDescription] = useState('')
  const [branchId, setBranchId] = useState('')
  const [providerId, setProviderId] = useState('')
  const [patientNotes, setPatientNotes] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [planPage, setPlanPage] = useState(1)
  const [planPageSize, setPlanPageSize] = useState(10)

  const selectedPatient = patients.find((patient) => patient.patientId === selectedPatientId)
  const filteredPatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase()
    if (!query) return patients
    return patients.filter((patient) => `${patient.firstName} ${patient.lastName} ${patient.patientId} ${patient.phone} ${patient.email}`.toLowerCase().includes(query))
  }, [patientSearch, patients])

  const quotedTotal = useMemo(() => items.reduce((sum, item) => {
    const pricePhp = Number(item.quotedPricePhp)
    if (!Number.isFinite(pricePhp) || pricePhp < 0) return sum
    return sum + Math.round(pricePhp * 100) * Math.max(1, item.quantity)
  }, 0), [items])

  const metrics = useMemo(() => ({
    active: plans.filter((plan) => ['draft', 'presented', 'accepted', 'partially_accepted'].includes(plan.status)).length,
    accepted: plans.filter((plan) => ['accepted', 'partially_accepted'].includes(plan.status)).length,
    value: plans.reduce((sum, plan) => sum + plan.quotedTotalCents, 0),
    procedures: plans.reduce((sum, plan) => sum + plan.items.length, 0),
  }), [plans])

  const planPageCount = Math.max(1, Math.ceil(plans.length / planPageSize))
  const effectivePlanPage = Math.min(planPage, planPageCount)
  const visiblePlans = useMemo(() => {
    const start = (effectivePlanPage - 1) * planPageSize
    return plans.slice(start, start + planPageSize)
  }, [effectivePlanPage, planPageSize, plans])

  useEffect(() => {
    setPlanPage(1)
  }, [planPageSize, selectedPatientId])

  useEffect(() => {
    setPlanPage((current) => Math.min(current, planPageCount))
  }, [planPageCount])

  async function refresh(patientId = selectedPatientId) {
    if (!patientId) return setPlans([])
    setLoading(true)
    setError(null)
    try {
      const rows = await getTreatmentPlansByPatientId(patientId)
      setPlans(rows)
      setSelectedPlan((current) => current ? rows.find((row) => row.id === current.id) ?? null : null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load treatment plans.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setSelectedPlan(null)
    void refresh(selectedPatientId)
  }, [selectedPatientId])

  function openCreate() {
    const first = services[0]
    setName('Treatment Plan')
    setDescription('')
    setBranchId(selectedPatient?.preferredBranchId ?? '')
    setProviderId('')
    setPatientNotes('')
    setInternalNotes('')
    setItems(first ? [newDraftItem(first.id, first.price)] : [])
    setError(null)
    setShowCreate(true)
  }

  function addItem() {
    const service = services.find((entry) => !items.some((item) => item.serviceId === entry.id)) ?? services[0]
    if (service) setItems((current) => [...current, newDraftItem(service.id, service.price)])
  }

  function changeService(key: string, serviceId: string) {
    const service = services.find((entry) => entry.id === serviceId)
    setItems((current) => current.map((item) => item.key === key ? {
      ...item,
      serviceId,
      quotedPricePhp: service ? String(service.price) : '',
    } : item))
  }

  async function createPlan() {
    if (!selectedPatient) return
    if (!name.trim()) return setError('Plan name is required.')
    if (!items.length) return setError('Add at least one recommended procedure.')
    if (items.some((item) => !item.serviceId || !Number.isFinite(Number(item.quotedPricePhp)) || Number(item.quotedPricePhp) < 0)) {
      return setError('Every procedure needs a valid quoted price.')
    }

    setSaving(true)
    setError(null)
    try {
      await createTreatmentPlan({
        patientId: selectedPatient.patientId,
        name: name.trim(),
        description: description.trim(),
        branchId: branchId || undefined,
        providerId: providerId || undefined,
        providerNameSnapshot: providers.find((provider) => provider.id === providerId)?.displayName,
        patientNotes: patientNotes.trim(),
        internalNotes: internalNotes.trim(),
        items: items.map((item) => {
          const service = services.find((entry) => entry.id === item.serviceId)
          return {
            serviceId: item.serviceId,
            serviceNameSnapshot: service?.name ?? 'Service',
            description: service?.description ?? '',
            quantity: item.quantity,
            phase: item.phase.trim(),
            catalogPriceSnapshotCents: service ? servicePriceToCents(service.price) : undefined,
            quotedPriceCents: Math.round(Number(item.quotedPricePhp) * 100),
            providerId: providerId || undefined,
            providerNameSnapshot: providers.find((provider) => provider.id === providerId)?.displayName,
            branchId: branchId || undefined,
          }
        }),
      })
      setShowCreate(false)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Treatment plan could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function present(plan: TreatmentPlan) {
    try {
      setError(null)
      await presentTreatmentPlan(plan.id)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Treatment plan could not be presented.')
    }
  }

  return (
    <PageScaffold title="Treatment Plans" description="Recommended care, estimates, patient decisions, and scheduling handoff.">
      <section className="tp80-page">
        <header className="tp80-hero">
          <div><span className="tp80-eyebrow"><Sparkles size={14} /> Care planning</span><h2>Structured treatment planning</h2><p>Build clear care recommendations, quote procedures accurately, and keep every plan connected to the patient record.</p></div>
          {can('treatments.create') && <Button icon={<Plus size={16} />} onClick={openCreate} disabled={!selectedPatient}>Create treatment plan</Button>}
        </header>

        <div className="tp80-layout">
          <aside className="tp80-patient-rail">
            <div className="tp80-rail-title"><div><span>Patient directory</span><strong>{patients.length} patients</strong></div><UserRound size={18} /></div>
            <label className="tp80-search"><Search size={16} /><input value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="Search patient or ID" /></label>
            <div className="tp80-patient-list">
              {filteredPatients.map((patient) => <button key={patient.id} type="button" className={selectedPatientId === patient.patientId ? 'is-active' : ''} onClick={() => setSelectedPatientId(patient.patientId)}><span className="tp80-avatar">{initials(patient.firstName, patient.lastName)}</span><span><strong>{patient.firstName} {patient.lastName}</strong><small>{patient.patientId}</small></span><ChevronRight size={15} /></button>)}
            </div>
          </aside>

          <main className="tp80-main">
            {selectedPatient ? <>
              <section className="tp80-patient-card"><div className="tp80-identity"><span className="tp80-avatar is-large">{initials(selectedPatient.firstName, selectedPatient.lastName)}</span><div><span className="tp80-eyebrow">Selected patient</span><h3>{selectedPatient.firstName} {selectedPatient.lastName}</h3><p>{selectedPatient.patientId} · {selectedPatient.phone || 'No phone'} · {selectedPatient.email || 'No email'}</p></div></div><span className="tp80-patient-status">{selectedPatient.status}</span></section>

              <section className="tp80-metrics"><article><span>Active plans</span><strong>{metrics.active}</strong><small>Open care recommendations</small></article><article><span>Accepted</span><strong>{metrics.accepted}</strong><small>Patient-approved plans</small></article><article><span>Quoted value</span><strong>{formatTreatmentPlanCurrency(metrics.value)}</strong><small>Estimate, not billed amount</small></article><article><span>Procedures</span><strong>{metrics.procedures}</strong><small>Across all plans</small></article></section>

              {error && <div className="tp80-error" role="alert">{error}</div>}
              <section className="tp80-registry">
                <div className="tp80-section-head"><div><span className="tp80-eyebrow">Care recommendations</span><h3>Treatment plan registry</h3><p>Review quoted procedures, current decision state, and scheduling readiness.</p></div><span>{plans.length} plan{plans.length === 1 ? '' : 's'}</span></div>
                {loading ? <SkeletonList items={5} withAvatar /> : plans.length ? (
                  <>
                    <div className="tp80-plan-grid">
                      {visiblePlans.map((plan) => (
                        <article key={plan.id} className="tp80-plan-card">
                          <div className="tp80-plan-head">
                            <div><small>{plan.planNumber} · v{plan.versionNumber}</small><h3>{plan.name}</h3><p>{plan.providerNameSnapshot || 'Dentist not assigned'} · {branches.find((branch) => branch.id === plan.branchId)?.name || 'Branch not assigned'}</p></div>
                            <span className={`tp80-status status-${plan.status}`}>{humanize(plan.status)}</span>
                          </div>
                          {plan.description && <p className="tp80-description">{plan.description}</p>}
                          <div className="tp80-plan-stats"><div><span>Estimate</span><strong>{formatTreatmentPlanCurrency(plan.quotedTotalCents)}</strong></div><div><span>Procedures</span><strong>{plan.items.length}</strong></div><div><span>Created</span><strong>{formatDate(plan.createdAt)}</strong></div></div>
                          <div className="tp80-preview">{plan.items.slice(0, 3).map((item) => <div key={item.id}><span><strong>{item.serviceNameSnapshot}</strong><small>{item.phase || 'No phase'} · Qty {item.quantity}</small></span><b>{formatTreatmentPlanCurrency(item.quotedPriceCents)}</b></div>)}</div>
                          <footer><button type="button" onClick={() => setSelectedPlan(plan)}>View full plan</button>{plan.status === 'draft' && can('treatments.edit') && <Button size="sm" onClick={() => void present(plan)}><Send size={14} /> Present</Button>}</footer>
                        </article>
                      ))}
                    </div>
                    <Pagination page={effectivePlanPage} pageCount={planPageCount} totalItems={plans.length} pageSize={planPageSize} pageSizeOptions={PLAN_PAGE_SIZE_OPTIONS} onPageChange={setPlanPage} onPageSizeChange={setPlanPageSize} label="Treatment plan registry pages" />
                  </>
                ) : <div className="tp80-empty"><FileText size={24} /><h3>No treatment plans yet</h3><p>Create the first care recommendation for this patient.</p></div>}
              </section>
            </> : <div className="tp80-empty"><UserRound size={26} /><h3>No patient selected</h3></div>}
          </main>
        </div>

        {showCreate && (
          <div className="tp80-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setShowCreate(false) }}>
            <section className="tp80-create-modal" role="dialog" aria-modal="true" aria-labelledby="tp80-create-title">
              <header><div><span className="tp80-modal-icon"><Stethoscope size={20} /></span><div><span className="tp80-eyebrow">New care estimate</span><h2 id="tp80-create-title">Create treatment plan</h2><p>Build a patient-specific recommendation with editable quoted pricing.</p></div></div><button type="button" onClick={() => setShowCreate(false)} disabled={saving} aria-label="Close"><X size={18} /></button></header>
              <div className="tp80-create-body">
                <section className="tp80-form-section"><div className="tp80-form-title"><span>01</span><div><h3>Plan context</h3><p>Name the plan and assign the clinical context.</p></div></div><div className="tp80-form-grid"><label><span>Plan name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Branch</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Not assigned</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label><span>Dentist</span><select value={providerId} onChange={(event) => setProviderId(event.target.value)}><option value="">Not assigned</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select></label><label className="is-wide"><span>Description</span><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Clinical goal and plan summary" /></label></div></section>

                <section className="tp80-form-section"><div className="tp80-form-title is-action"><div><span>02</span><div><h3>Recommended procedures</h3><p>The catalogue price is a starting point; the quoted PHP amount is editable.</p></div></div><Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={addItem}>Add procedure</Button></div><div className="tp80-items">{items.map((item, index) => { const service = services.find((entry) => entry.id === item.serviceId); const unitCents = Math.round((Number(item.quotedPricePhp) || 0) * 100); return <article key={item.key} className="tp80-item"><span className="tp80-item-index">{String(index + 1).padStart(2, '0')}</span><div className="tp80-item-fields"><label><span>Service</span><select value={item.serviceId} onChange={(event) => changeService(item.key, event.target.value)}>{services.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><label><span>Quantity</span><input type="number" min="1" value={item.quantity} onChange={(event) => setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, quantity: Math.max(1, Number(event.target.value) || 1) } : entry))} /></label><label><span>Phase</span><input value={item.phase} onChange={(event) => setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, phase: event.target.value } : entry))} placeholder="Optional" /></label><label className="is-quote"><span>Quoted price (PHP)</span><input type="number" min="0" step="0.01" value={item.quotedPricePhp} onChange={(event) => setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, quotedPricePhp: event.target.value } : entry))} /><small>Catalogue: {service ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(service.price) : '—'}</small></label></div><div className="tp80-item-total"><span>Line estimate</span><strong>{formatTreatmentPlanCurrency(unitCents * item.quantity)}</strong></div><button type="button" className="tp80-remove" onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))} aria-label="Remove procedure"><Trash2 size={16} /></button></article> })}</div></section>

                <section className="tp80-form-section"><div className="tp80-form-title"><span>03</span><div><h3>Notes</h3><p>Separate patient-facing information from internal clinical context.</p></div></div><div className="tp80-form-grid"><label><span>Patient-facing notes</span><textarea rows={3} value={patientNotes} onChange={(event) => setPatientNotes(event.target.value)} /></label><label><span>Internal notes</span><textarea rows={3} value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} /></label></div></section>
                {error && <div className="tp80-error" role="alert">{error}</div>}
              </div>
              <footer className="tp80-create-footer"><div><span>Quoted estimate</span><strong>{formatTreatmentPlanCurrency(quotedTotal)}</strong><small>{items.length} procedure{items.length === 1 ? '' : 's'}</small></div><div><Button variant="secondary" onClick={() => setShowCreate(false)} disabled={saving}>Cancel</Button><Button onClick={() => void createPlan()} disabled={saving || !items.length}>{saving ? 'Saving to database…' : 'Create plan'}</Button></div></footer>
            </section>
          </div>
        )}

        {selectedPlan && (
          <div className="tp80-backdrop tp80-detail-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedPlan(null) }}>
            <section className="tp80-detail-modal" role="dialog" aria-modal="true" aria-labelledby="tp80-detail-title">
              <header className="tp80-detail-hero"><div className="tp80-detail-heading"><span className="tp80-modal-icon"><ShieldCheck size={20} /></span><div><span className="tp80-eyebrow">{selectedPlan.planNumber} · Version {selectedPlan.versionNumber}</span><h2 id="tp80-detail-title">{selectedPlan.name}</h2><p>{selectedPlan.providerNameSnapshot || 'Dentist not assigned'} · {branches.find((branch) => branch.id === selectedPlan.branchId)?.name || 'Branch not assigned'}</p></div></div><button type="button" onClick={() => setSelectedPlan(null)} aria-label="Close full plan"><X size={19} /></button></header>
              <div className="tp80-detail-body">
                <div className="tp80-detail-metrics"><article><span>Status</span><strong className={`tp80-status status-${selectedPlan.status}`}>{humanize(selectedPlan.status)}</strong></article><article><span>Quoted estimate</span><strong>{formatTreatmentPlanCurrency(selectedPlan.quotedTotalCents)}</strong></article><article><span>Procedures</span><strong>{selectedPlan.items.length}</strong></article><article><span>Created</span><strong>{formatDate(selectedPlan.createdAt)}</strong></article></div>
                {selectedPlan.description && <section className="tp80-detail-section"><div className="tp80-detail-section-title"><FileText size={16} /><span>Plan summary</span></div><p>{selectedPlan.description}</p></section>}
                <section className="tp80-detail-section"><div className="tp80-detail-section-title"><Stethoscope size={16} /><span>Recommended procedures</span></div><div className="tp80-detail-items">{selectedPlan.items.map((item, index) => <article key={item.id}><span className="tp80-item-index">{String(index + 1).padStart(2, '0')}</span><div><strong>{item.serviceNameSnapshot}</strong><small>{item.phase || 'No phase assigned'} · Quantity {item.quantity}</small></div><div className="tp80-detail-price"><span>Quoted</span><strong>{formatTreatmentPlanCurrency(item.quotedPriceCents)}</strong></div><em className={`tp80-status status-${item.status}`}>{humanize(item.status)}</em></article>)}</div></section>
                {selectedPlan.patientNotes && <section className="tp80-detail-section"><div className="tp80-detail-section-title"><UserRound size={16} /><span>Patient-facing notes</span></div><p>{selectedPlan.patientNotes}</p></section>}
                <div className="tp80-finance-note"><CheckCircle2 size={17} /><div><strong>Estimate only</strong><p>This treatment-plan amount is a quoted care estimate. Invoices and payments remain separate billing records.</p></div></div>
              </div>
              <footer className="tp80-detail-footer"><div><CalendarDays size={15} /><span>Last updated {formatDate(selectedPlan.updatedAt)}</span></div><div>{selectedPlan.status === 'draft' && can('treatments.edit') && <Button onClick={() => void present(selectedPlan)}><Send size={14} /> Present plan</Button>}<Button variant="secondary" onClick={() => setSelectedPlan(null)}>Close</Button></div></footer>
            </section>
          </div>
        )}
      </section>
    </PageScaffold>
  )
}

