import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Layers3,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserRound,
  X,
  XCircle,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { PageScaffold } from '../components/ui/PageScaffold'
import { usePermissions } from '../features/auth/permissions'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { getStoredPatients } from '../features/patients/patientStore'
import { getStoredServices } from '../features/services/serviceStore'
import {
  createTreatmentPlan,
  formatTreatmentPlanCurrency,
  getTreatmentPlansByPatientId,
  presentTreatmentPlan,
  type TreatmentPlan,
} from '../features/treatmentPlans/treatmentPlanStore'

function humanize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

function formatDate(value?: string) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
}

type DraftItem = { serviceId: string; quantity: number; phase: string }

export function TreatmentPlansPageV13() {
  const { can } = usePermissions()
  const patients = useMemo(() => getStoredPatients(), [])
  const services = useMemo(() => getStoredServices().filter((service) => service.status === 'active'), [])
  const branches = useMemo(() => getStoredBranches(), [])
  const providers = useMemo(() => getStoredProviders(), [])

  const [patientSearch, setPatientSearch] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.patientId ?? '')
  const [plans, setPlans] = useState<TreatmentPlan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<TreatmentPlan | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
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

  const selectedPatient = patients.find((patient) => patient.patientId === selectedPatientId)
  const canCreate = can('treatments.create')
  const canEdit = can('treatments.edit')

  const filteredPatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase()
    if (!query) return patients
    return patients.filter((patient) => `${patient.firstName} ${patient.lastName} ${patient.patientId} ${patient.phone} ${patient.email}`.toLowerCase().includes(query))
  }, [patientSearch, patients])

  const planMetrics = useMemo(() => {
    const active = plans.filter((plan) => ['draft', 'presented', 'partially_accepted', 'accepted'].includes(plan.status)).length
    const accepted = plans.filter((plan) => plan.status === 'accepted' || plan.status === 'partially_accepted').length
    const quoted = plans.reduce((sum, plan) => sum + plan.quotedTotalCents, 0)
    const procedures = plans.reduce((sum, plan) => sum + plan.items.length, 0)
    return { active, accepted, quoted, procedures }
  }, [plans])

  const statusCounts = useMemo(() => {
    return ['draft', 'presented', 'accepted', 'partially_accepted', 'declined'].map((status) => ({
      status,
      count: plans.filter((plan) => plan.status === status).length,
    }))
  }, [plans])

  const draftEstimateCents = useMemo(() => items.reduce((sum, item) => {
    const service = services.find((entry) => entry.id === item.serviceId)
    return sum + Number(service?.price ?? 0) * Math.max(1, item.quantity)
  }, 0), [items, services])

  async function refresh(patientId = selectedPatientId) {
    if (!patientId) {
      setPlans([])
      return
    }
    setState('loading')
    setError(null)
    try {
      const nextPlans = await getTreatmentPlansByPatientId(patientId)
      setPlans(nextPlans)
      if (selectedPlan) {
        setSelectedPlan(nextPlans.find((plan) => plan.id === selectedPlan.id) ?? null)
      }
      setState('idle')
    } catch (cause) {
      setState('error')
      setError(cause instanceof Error ? cause.message : 'Could not load treatment plans.')
    }
  }

  useEffect(() => {
    void refresh(selectedPatientId)
    setSelectedPlan(null)
  }, [selectedPatientId])

  function addItem() {
    const service = services.find((entry) => !items.some((item) => item.serviceId === entry.id)) ?? services[0]
    if (!service) return
    setItems((current) => [...current, { serviceId: service.id, quantity: 1, phase: '' }])
  }

  function openCreate() {
    setError(null)
    setName('Treatment Plan')
    setDescription('')
    setBranchId(selectedPatient?.preferredBranchId ?? '')
    setProviderId('')
    setPatientNotes('')
    setInternalNotes('')
    const firstService = services[0]
    setItems(firstService ? [{ serviceId: firstService.id, quantity: 1, phase: '' }] : [])
    setShowCreate(true)
  }

  async function handleCreate() {
    if (!selectedPatient || !items.length) return
    if (!name.trim()) {
      setError('Plan name is required.')
      return
    }

    const mappedItems = items.map((item) => {
      const service = services.find((entry) => entry.id === item.serviceId)
      return {
        serviceId: item.serviceId,
        serviceNameSnapshot: service?.name ?? 'Service',
        description: service?.description ?? '',
        quantity: item.quantity,
        phase: item.phase,
        catalogPriceSnapshotCents: service?.price,
        quotedPriceCents: service?.price,
        providerId: providerId || undefined,
        providerNameSnapshot: providers.find((provider) => provider.id === providerId)?.displayName,
        branchId: branchId || undefined,
      }
    })

    if (mappedItems.some((item) => item.quotedPriceCents == null)) {
      setError('One or more services do not have a configured price. Configure the service price before saving this estimate.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await createTreatmentPlan({
        patientId: selectedPatient.patientId,
        name,
        description,
        branchId: branchId || undefined,
        providerId: providerId || undefined,
        providerNameSnapshot: providers.find((provider) => provider.id === providerId)?.displayName,
        patientNotes,
        internalNotes,
        items: mappedItems,
      })
      setShowCreate(false)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Treatment plan could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePresent(plan: TreatmentPlan) {
    if (!canEdit || plan.status !== 'draft') return
    setError(null)
    try {
      await presentTreatmentPlan(plan.id)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Treatment plan could not be presented.')
    }
  }

  return (
    <PageScaffold title="Treatment Plans" description="Recommended care, estimates, patient decisions, and scheduling handoff.">
      <section className="tp13-page">
        <header className="tp13-command-header">
          <div>
            <span className="tp13-kicker">Care planning workspace</span>
            <h2>Plan recommended care with clarity</h2>
            <p>Build structured treatment recommendations, preserve quoted estimates, and track patient decisions without mixing estimates with billing.</p>
          </div>
          {canCreate && <Button icon={<Plus size={17} />} onClick={openCreate}>Create treatment plan</Button>}
        </header>

        <div className="tp13-layout">
          <aside className="tp13-patient-rail">
            <div className="tp13-rail-head">
              <div><span>Patient directory</span><strong>{patients.length} patients</strong></div>
              <UserRound size={18} />
            </div>
            <label className="tp13-search">
              <Search size={16} />
              <input value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="Search patients..." />
            </label>
            <div className="tp13-patient-list">
              {filteredPatients.map((patient) => (
                <button key={patient.id} type="button" className={selectedPatientId === patient.patientId ? 'is-active' : ''} onClick={() => setSelectedPatientId(patient.patientId)}>
                  <span className="tp13-avatar">{initials(patient.firstName, patient.lastName)}</span>
                  <span><strong>{patient.firstName} {patient.lastName}</strong><small>{patient.patientId}</small></span>
                  <ChevronRight size={15} />
                </button>
              ))}
              {!filteredPatients.length && <div className="tp13-no-match">No patient matches your search.</div>}
            </div>
          </aside>

          <main className="tp13-main">
            {selectedPatient ? (
              <>
                <section className="tp13-patient-hero">
                  <div className="tp13-patient-identity">
                    <span className="tp13-avatar tp13-avatar-lg">{initials(selectedPatient.firstName, selectedPatient.lastName)}</span>
                    <div>
                      <span className="tp13-kicker">Selected patient</span>
                      <h2>{selectedPatient.firstName} {selectedPatient.middleName ? `${selectedPatient.middleName} ` : ''}{selectedPatient.lastName}</h2>
                      <p>{selectedPatient.patientId} · {selectedPatient.phone || 'No phone'} · {selectedPatient.email || 'No email'}</p>
                    </div>
                  </div>
                  <div className="tp13-patient-meta">
                    <span>{selectedPatient.status}</span>
                    <small>{selectedPatient.preferredBranchId ? branches.find((branch) => branch.id === selectedPatient.preferredBranchId)?.name ?? 'Preferred branch set' : 'No preferred branch'}</small>
                  </div>
                </section>

                <section className="tp13-metrics">
                  <article><span><Layers3 size={16} /> Active plans</span><strong>{planMetrics.active}</strong><small>{plans.length} total plan{plans.length === 1 ? '' : 's'}</small></article>
                  <article><span><CheckCircle2 size={16} /> Accepted</span><strong>{planMetrics.accepted}</strong><small>Accepted or partially accepted</small></article>
                  <article><span><Sparkles size={16} /> Estimated value</span><strong>{formatTreatmentPlanCurrency(planMetrics.quoted)}</strong><small>Estimate only — not billed amount</small></article>
                  <article><span><Stethoscope size={16} /> Procedures</span><strong>{planMetrics.procedures}</strong><small>Recommended plan items</small></article>
                </section>

                <div className="tp13-insight-grid">
                  <section className="tp13-status-card">
                    <div className="tp13-section-head"><div><span className="tp13-kicker">Decision pipeline</span><h3>Plan status mix</h3></div><ShieldCheck size={18} /></div>
                    <div className="tp13-status-bars">
                      {statusCounts.map((item) => {
                        const max = Math.max(1, ...statusCounts.map((entry) => entry.count))
                        return <div key={item.status}><span>{humanize(item.status)}</span><div><i style={{ width: `${(item.count / max) * 100}%` }} /></div><strong>{item.count}</strong></div>
                      })}
                    </div>
                  </section>

                  <section className="tp13-guidance-card">
                    <div className="tp13-section-head"><div><span className="tp13-kicker">Financial clarity</span><h3>Estimate ≠ invoice</h3></div><FileText size={18} /></div>
                    <p>Treatment plan totals represent quoted care estimates. Billing, invoices, collections, refunds, and receivables remain separate financial records.</p>
                    <div className="tp13-guidance-points"><span>Quoted care estimate</span><span>Patient decision tracking</span><span>Scheduling handoff</span></div>
                  </section>
                </div>

                {error && <div className="tp13-error" role="alert">{error}</div>}
                {state === 'loading' && <div className="tp13-loading">Loading treatment plans…</div>}
                {state === 'error' && <div className="tp13-loading"><Button variant="secondary" onClick={() => void refresh()}>Retry</Button></div>}

                {state === 'idle' && (
                  <section className="tp13-plans-section">
                    <div className="tp13-section-head tp13-plans-head">
                      <div><span className="tp13-kicker">Care recommendations</span><h3>Treatment plan registry</h3><p>Review versions, quoted procedures, decisions, and readiness for scheduling.</p></div>
                      <span className="tp13-count-pill">{plans.length} plan{plans.length === 1 ? '' : 's'}</span>
                    </div>

                    {plans.length ? (
                      <div className="tp13-plan-grid">
                        {plans.map((plan) => {
                          const acceptedItems = plan.items.filter((item) => ['accepted', 'scheduled', 'completed'].includes(item.status)).length
                          const scheduledItems = plan.items.filter((item) => item.status === 'scheduled').length
                          return (
                            <article className="tp13-plan-card" key={plan.id}>
                              <div className="tp13-plan-top">
                                <div><span className="tp13-kicker">{plan.planNumber} · v{plan.versionNumber}</span><h3>{plan.name}</h3><p>{plan.providerNameSnapshot || 'Provider not mapped'} · {branches.find((branch) => branch.id === plan.branchId)?.name || 'Branch not mapped'}</p></div>
                                <span className={`tp13-status status-${plan.status}`}>{humanize(plan.status)}</span>
                              </div>
                              {plan.description && <p className="tp13-plan-description">{plan.description}</p>}
                              <div className="tp13-plan-metrics">
                                <div><span>Estimated total</span><strong>{formatTreatmentPlanCurrency(plan.quotedTotalCents)}</strong></div>
                                <div><span>Procedures</span><strong>{plan.items.length}</strong></div>
                                <div><span>Accepted</span><strong>{acceptedItems}</strong></div>
                                <div><span>Scheduled</span><strong>{scheduledItems}</strong></div>
                              </div>
                              <div className="tp13-procedure-preview">
                                {plan.items.slice(0, 3).map((item) => (
                                  <div key={item.id}><span><strong>{item.serviceNameSnapshot}</strong><small>{item.phase || 'No phase'} · Qty {item.quantity}</small></span><span>{formatTreatmentPlanCurrency(item.quotedPriceCents)}</span><em className={`status-${item.status}`}>{humanize(item.status)}</em></div>
                                ))}
                                {plan.items.length > 3 && <span className="tp13-more-items">+{plan.items.length - 3} more procedure{plan.items.length - 3 === 1 ? '' : 's'}</span>}
                              </div>
                              <div className="tp13-plan-footer">
                                <button type="button" onClick={() => setSelectedPlan(plan)}>View full plan</button>
                                <span>{formatDate(plan.createdAt)}</span>
                                {plan.status === 'draft' && canEdit && <Button size="sm" onClick={() => void handlePresent(plan)}><Send size={14} /> Present plan</Button>}
                              </div>
                              {plan.status === 'accepted' && <div className="tp13-state-note is-success"><CheckCircle2 size={14} /> Accepted — ready for scheduling handoff.</div>}
                              {plan.status === 'declined' && <div className="tp13-state-note is-danger"><XCircle size={14} /> Declined — retained in treatment history.</div>}
                            </article>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="tp13-empty">
                        <ClipboardList size={30} />
                        <h3>No treatment plans yet</h3>
                        <p>Build the first care recommendation for this patient when a clinical plan is ready.</p>
                        {canCreate && <Button onClick={openCreate} icon={<Plus size={16} />}>Create first plan</Button>}
                      </div>
                    )}
                  </section>
                )}
              </>
            ) : <div className="tp13-empty"><UserRound size={28} /><h3>No patient selected</h3><p>Choose a patient to manage treatment plans.</p></div>}
          </main>
        </div>

        {showCreate && selectedPatient && (
          <div className="tp13-modal-backdrop" onClick={() => setShowCreate(false)}>
            <section className="tp13-modal" role="dialog" aria-modal="true" aria-labelledby="tp13-create-title" onClick={(event) => event.stopPropagation()}>
              <header className="tp13-modal-head">
                <div><span className="tp13-kicker">New care recommendation · {selectedPatient.patientId}</span><h2 id="tp13-create-title">Create treatment plan</h2><p>{selectedPatient.firstName} {selectedPatient.lastName}</p></div>
                <button type="button" aria-label="Close" onClick={() => setShowCreate(false)}><X size={19} /></button>
              </header>

              <div className="tp13-modal-body">
                <section className="tp13-editor-section">
                  <div className="tp13-editor-heading"><span>01</span><div><h3>Plan context</h3><p>Name the recommendation and connect it to the appropriate clinic context.</p></div></div>
                  <div className="tp13-form-grid">
                    <label><span>Plan name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
                    <label><span>Branch</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Not mapped</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
                    <label><span>Recommending provider</span><select value={providerId} onChange={(event) => setProviderId(event.target.value)}><option value="">Not mapped</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select></label>
                    <label className="tp13-span-2"><span>Description</span><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Clinical rationale or plan summary" /></label>
                  </div>
                </section>

                <section className="tp13-editor-section">
                  <div className="tp13-editor-heading"><span>02</span><div><h3>Recommended procedures</h3><p>Add services, quantities, and optional care phases.</p></div><Button variant="secondary" size="sm" onClick={addItem}><Plus size={14} /> Add procedure</Button></div>
                  <div className="tp13-item-list">
                    {items.map((item, index) => {
                      const service = services.find((entry) => entry.id === item.serviceId)
                      return (
                        <article className="tp13-item-card" key={`${item.serviceId}-${index}`}>
                          <div className="tp13-item-number">{String(index + 1).padStart(2, '0')}</div>
                          <div className="tp13-item-fields">
                            <label><span>Service</span><select value={item.serviceId} onChange={(event) => setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, serviceId: event.target.value } : entry))}>{services.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
                            <label><span>Quantity</span><input type="number" min="1" value={item.quantity} onChange={(event) => setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: Math.max(1, Number(event.target.value) || 1) } : entry))} /></label>
                            <label><span>Phase</span><input value={item.phase} placeholder="Optional" onChange={(event) => setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, phase: event.target.value } : entry))} /></label>
                          </div>
                          <div className="tp13-item-price"><span>Quoted estimate</span><strong>{service ? formatTreatmentPlanCurrency(Number(service.price) * item.quantity) : 'Price not configured'}</strong><small>{service ? `${formatTreatmentPlanCurrency(service.price)} each` : 'Configure service pricing first'}</small></div>
                          <button className="tp13-remove-item" type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                        </article>
                      )
                    })}
                    {!items.length && <div className="tp13-item-empty">Add at least one recommended procedure.</div>}
                  </div>
                </section>

                <section className="tp13-editor-section">
                  <div className="tp13-editor-heading"><span>03</span><div><h3>Communication notes</h3><p>Separate patient-facing guidance from internal clinical context.</p></div></div>
                  <div className="tp13-form-grid">
                    <label><span>Patient-facing notes</span><textarea rows={4} value={patientNotes} onChange={(event) => setPatientNotes(event.target.value)} placeholder="What the patient should understand about this plan" /></label>
                    <label><span>Internal clinical notes</span><textarea rows={4} value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} placeholder="Internal context for the clinic team" /></label>
                  </div>
                </section>
              </div>

              <footer className="tp13-modal-footer">
                <div className="tp13-estimate-summary"><span>Estimated treatment plan total</span><strong>{formatTreatmentPlanCurrency(draftEstimateCents)}</strong><small>Estimate only. Billing is handled separately.</small></div>
                <div><Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button><Button disabled={saving || !items.length} onClick={() => void handleCreate()}>{saving ? 'Saving…' : 'Save draft plan'}</Button></div>
              </footer>
            </section>
          </div>
        )}

        {selectedPlan && (
          <div className="tp13-detail-backdrop" onClick={() => setSelectedPlan(null)}>
            <aside className="tp13-detail-panel" role="dialog" aria-modal="true" aria-labelledby="tp13-detail-title" onClick={(event) => event.stopPropagation()}>
              <header><div><span className="tp13-kicker">{selectedPlan.planNumber} · version {selectedPlan.versionNumber}</span><h2 id="tp13-detail-title">{selectedPlan.name}</h2><p>{selectedPlan.providerNameSnapshot || 'Provider not mapped'} · {branches.find((branch) => branch.id === selectedPlan.branchId)?.name || 'Branch not mapped'}</p></div><button type="button" aria-label="Close" onClick={() => setSelectedPlan(null)}><X size={19} /></button></header>
              <div className="tp13-detail-summary"><div><span>Status</span><strong>{humanize(selectedPlan.status)}</strong></div><div><span>Estimated total</span><strong>{formatTreatmentPlanCurrency(selectedPlan.quotedTotalCents)}</strong></div><div><span>Procedures</span><strong>{selectedPlan.items.length}</strong></div><div><span>Created</span><strong>{formatDate(selectedPlan.createdAt)}</strong></div></div>
              {selectedPlan.description && <section className="tp13-detail-section"><span>Plan summary</span><p>{selectedPlan.description}</p></section>}
              <section className="tp13-detail-section"><span>Recommended procedures</span><div className="tp13-detail-items">{selectedPlan.items.map((item) => <div key={item.id}><span><strong>{item.serviceNameSnapshot}</strong><small>{item.phase || 'No phase'} · Qty {item.quantity}</small></span><span>{formatTreatmentPlanCurrency(item.quotedPriceCents)}</span><em className={`status-${item.status}`}>{humanize(item.status)}</em></div>)}</div></section>
              {selectedPlan.patientNotes && <section className="tp13-detail-section"><span>Patient-facing notes</span><p>{selectedPlan.patientNotes}</p></section>}
              <div className="tp13-detail-note">Estimated treatment plan total. Billing is handled separately.</div>
              <footer>{selectedPlan.status === 'draft' && canEdit && <Button onClick={() => void handlePresent(selectedPlan)}><Send size={14} /> Present plan</Button>}<Button variant="secondary" onClick={() => setSelectedPlan(null)}>Close</Button></footer>
            </aside>
          </div>
        )}
      </section>
    </PageScaffold>
  )
}
