import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardList, Plus, Send, X, XCircle } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { PageScaffold } from '../components/ui/PageScaffold'
import { StatusBadge } from '../components/ui/Badge'
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

export function TreatmentPlansPage() {
  const { can } = usePermissions()
  const patients = useMemo(() => getStoredPatients(), [])
  const services = useMemo(() => getStoredServices().filter((service) => service.status === 'active'), [])
  const branches = useMemo(() => getStoredBranches(), [])
  const providers = useMemo(() => getStoredProviders(), [])
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.patientId ?? '')
  const [plans, setPlans] = useState<TreatmentPlan[]>([])
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
  const [items, setItems] = useState<Array<{ serviceId: string; quantity: number; phase: string }>>([])

  const selectedPatient = patients.find((patient) => patient.patientId === selectedPatientId)
  const canCreate = can('treatments.create')
  const canEdit = can('treatments.edit')

  async function refresh(patientId = selectedPatientId) {
    if (!patientId) {
      setPlans([])
      return
    }
    setState('loading')
    setError(null)
    try {
      setPlans(await getTreatmentPlansByPatientId(patientId))
      setState('idle')
    } catch (cause) {
      setState('error')
      setError(cause instanceof Error ? cause.message : 'Could not load treatment plans.')
    }
  }

  useEffect(() => {
    void refresh(selectedPatientId)
  }, [selectedPatientId])

  function addItem() {
    const service = services.find((entry) => !items.some((item) => item.serviceId === entry.id)) ?? services[0]
    if (!service) return
    setItems((current) => [...current, { serviceId: service.id, quantity: 1, phase: '' }])
  }

  async function handleCreate() {
    if (!selectedPatient || !items.length) return
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
      setError('One or more services do not have a configured price. Configure the service price before presenting an estimate.')
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
      setName('Treatment Plan')
      setDescription('')
      setPatientNotes('')
      setInternalNotes('')
      setItems([])
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
    <PageScaffold
      title="Treatment Plans"
      description="Recommended care, historical estimates, patient decisions, and scheduling handoff"
      actions={canCreate ? <Button icon={<Plus size={16} />} onClick={() => { setShowCreate(true); if (!items.length) addItem() }}>Create Plan</Button> : undefined}
    >
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <label>
            <span>Patient</span>
            <select value={selectedPatientId} onChange={(event) => setSelectedPatientId(event.target.value)}>
              {patients.map((patient) => (
                <option key={patient.patientId} value={patient.patientId}>{patient.firstName} {patient.lastName} · {patient.patientId}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error && <div className="error-alert">{error}</div>}
      {state === 'loading' && <div className="panel">Loading treatment plans...</div>}
      {state === 'error' && <div className="panel"><Button variant="secondary" onClick={() => void refresh()}>Retry</Button></div>}

      {state === 'idle' && (
        <div className="panel-grid">
          {plans.map((plan) => (
            <article className="panel" key={plan.id}>
              <div className="section-heading-row">
                <div>
                  <p className="eyebrow">{plan.planNumber} · v{plan.versionNumber}</p>
                  <h3>{plan.name}</h3>
                  <p>{plan.providerNameSnapshot || 'Unknown / Unmapped Provider'} · {branches.find((branch) => branch.id === plan.branchId)?.name || 'Unknown / Unmapped Branch'}</p>
                </div>
                <StatusBadge status={plan.status} />
              </div>
              {plan.description && <p>{plan.description}</p>}
              <div className="metric-grid compact">
                <div><span>Estimated total</span><strong>{formatTreatmentPlanCurrency(plan.quotedTotalCents)}</strong></div>
                <div><span>Items</span><strong>{plan.items.length}</strong></div>
                <div><span>Accepted</span><strong>{plan.items.filter((item) => item.status === 'accepted' || item.status === 'scheduled' || item.status === 'completed').length}</strong></div>
                <div><span>Scheduled</span><strong>{plan.items.filter((item) => item.status === 'scheduled').length}</strong></div>
              </div>
              <div className="treatment-operations-list">
                {plan.items.map((item) => (
                  <div className="treatment-operations-row" key={item.id}>
                    <div>
                      <strong>{item.serviceNameSnapshot}</strong>
                      <span>{item.phase || 'No phase'} · Qty {item.quantity}</span>
                    </div>
                    <span>{formatTreatmentPlanCurrency(item.quotedPriceCents)}</span>
                    <StatusBadge status={item.status} variant="compact" />
                  </div>
                ))}
              </div>
              {plan.patientNotes && <p><strong>Patient-facing notes:</strong> {plan.patientNotes}</p>}
              <div className="action-buttons">
                {plan.status === 'draft' && canEdit && <Button onClick={() => void handlePresent(plan)}><Send size={14} /> Present Plan</Button>}
                {plan.status === 'accepted' && <span className="success-alert"><CheckCircle2 size={14} /> Accepted plan — ready for scheduling handoff.</span>}
                {plan.status === 'declined' && <span className="error-alert"><XCircle size={14} /> Declined — preserved in treatment history.</span>}
              </div>
            </article>
          ))}
          {!plans.length && <div className="empty-state-panel"><ClipboardList size={20} /><p>No treatment plans recorded for this patient.</p></div>}
        </div>
      )}

      {showCreate && selectedPatient && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-treatment-plan-title">
            <div className="modal-header">
              <div><p className="eyebrow">{selectedPatient.patientId}</p><h2 id="create-treatment-plan-title">Create Treatment Plan</h2></div>
              <button className="icon-button" type="button" aria-label="Close treatment plan dialog" onClick={() => setShowCreate(false)}><X size={19} /></button>
            </div>
            <div className="form-grid">
              <label><span>Plan name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
              <label><span>Branch</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Unknown / Unmapped</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
              <label><span>Recommending provider</span><select value={providerId} onChange={(event) => setProviderId(event.target.value)}><option value="">Unknown / Unmapped Provider</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select></label>
              <label><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            </div>

            <div className="section-heading-row"><h3>Recommended procedures</h3><Button variant="secondary" onClick={addItem}><Plus size={14} /> Add Item</Button></div>
            <div className="clinical-linked-list">
              {items.map((item, index) => {
                const service = services.find((entry) => entry.id === item.serviceId)
                return (
                  <div className="clinical-inline-form" key={`${item.serviceId}-${index}`}>
                    <label><span>Service</span><select value={item.serviceId} onChange={(event) => setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, serviceId: event.target.value } : entry))}>{services.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {formatTreatmentPlanCurrency(entry.price)}</option>)}</select></label>
                    <label><span>Quantity</span><input type="number" min="1" value={item.quantity} onChange={(event) => setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: Math.max(1, Number(event.target.value) || 1) } : entry))} /></label>
                    <label><span>Phase</span><input value={item.phase} placeholder="Optional" onChange={(event) => setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, phase: event.target.value } : entry))} /></label>
                    <div><span>Quoted price</span><strong>{service ? formatTreatmentPlanCurrency(service.price) : 'Price not configured'}</strong></div>
                    <Button variant="secondary" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
                  </div>
                )
              })}
            </div>

            <div className="form-grid">
              <label><span>Patient-facing notes</span><textarea value={patientNotes} onChange={(event) => setPatientNotes(event.target.value)} /></label>
              <label><span>Internal clinical notes</span><textarea value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} /></label>
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button disabled={saving || !items.length} onClick={() => void handleCreate()}>{saving ? 'Saving...' : 'Save Draft'}</Button>
            </div>
          </section>
        </div>
      )}
    </PageScaffold>
  )
}
