import { useMemo, useState } from 'react'
import { Activity, CalendarDays, CircleDollarSign, Filter, Plus, Search, Stethoscope, UserRound } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { PageScaffold } from '../components/ui/PageScaffold'
import { TreatmentFormDrawerV12 } from '../features/treatments/TreatmentFormDrawerV12'
import { getStoredPatients } from '../features/patients/patientStore'
import { getStoredServices } from '../features/services/serviceStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { createTreatment, deleteTreatment, getStoredTreatments, updateTreatment } from '../features/treatments/treatmentStore'
import type { Treatment, TreatmentFormValues, TreatmentStatus } from '../features/treatments/treatmentTypes'

const emptyTreatmentForm = (patientId: string, serviceId: string): TreatmentFormValues => ({
  patientId,
  dentalRecordId: '',
  appointmentId: '',
  appointmentNumber: '',
  branchId: '',
  providerId: '',
  providerNameSnapshot: '',
  serviceId,
  serviceNameSnapshot: '',
  toothNumber: undefined,
  description: '',
  cost: 0,
  priceSnapshotCents: 0,
  quantity: 1,
  status: 'planned',
  treatmentDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
  notes: '',
  performedBy: 'Clinical provider',
  createdBy: 'Clinical provider',
})

function formatDate(value?: string) {
  if (!value) return 'No date'
  const date = new Date(`${value}T00:00:00+08:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(cents / 100)
}

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

const statusOrder: TreatmentStatus[] = ['planned', 'scheduled', 'in_progress', 'completed', 'cancelled', 'voided']

export function TreatmentsPageV12() {
  const patients = useMemo(() => getStoredPatients(), [])
  const services = useMemo(() => getStoredServices(), [])
  const branches = useMemo(() => getStoredBranches(), [])
  const providers = useMemo(() => getStoredProviders(), [])
  const [treatments, setTreatments] = useState<Treatment[]>(() => getStoredTreatments())
  const [patientSearch, setPatientSearch] = useState('')
  const [workspaceSearch, setWorkspaceSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [providerFilter, setProviderFilter] = useState('all')
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.patientId ?? '')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mode, setMode] = useState<'add' | 'edit'>('add')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<TreatmentFormValues>(() => emptyTreatmentForm(patients[0]?.patientId ?? '', services[0]?.id ?? ''))

  const serviceMap = useMemo(() => new Map(services.map((service) => [service.id, service])), [services])
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches])
  const providerMap = useMemo(() => new Map(providers.map((provider) => [provider.id, provider])), [providers])
  const selectedPatient = patients.find((patient) => patient.patientId === selectedPatientId) ?? null

  const filteredPatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase()
    if (!query) return patients
    return patients.filter((patient) => `${patient.firstName} ${patient.lastName} ${patient.patientId} ${patient.email} ${patient.phone}`.toLowerCase().includes(query))
  }, [patientSearch, patients])

  const patientTreatments = useMemo(() => treatments.filter((treatment) => treatment.patientId === selectedPatientId).sort((a, b) => b.treatmentDate.localeCompare(a.treatmentDate)), [selectedPatientId, treatments])
  const completed = patientTreatments.filter((item) => item.status === 'completed').length
  const active = patientTreatments.filter((item) => ['planned', 'scheduled', 'in_progress'].includes(item.status)).length
  const totalValue = patientTreatments.reduce((sum, item) => sum + item.priceSnapshotCents * Math.max(1, item.quantity), 0)
  const latestTreatment = patientTreatments[0]

  const statusData = statusOrder.map((status) => ({ status, count: patientTreatments.filter((item) => item.status === status).length }))
  const maxStatus = Math.max(1, ...statusData.map((item) => item.count))
  const serviceData = services.map((service) => ({ service, count: patientTreatments.filter((item) => item.serviceId === service.id).length })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count).slice(0, 5)
  const maxService = Math.max(1, ...serviceData.map((item) => item.count))

  const filteredTreatments = useMemo(() => {
    const query = workspaceSearch.trim().toLowerCase()
    return patientTreatments.filter((treatment) => {
      const haystack = `${treatment.description} ${treatment.serviceNameSnapshot} ${serviceMap.get(treatment.serviceId)?.name ?? ''} ${treatment.providerNameSnapshot} ${treatment.performedBy} ${treatment.appointmentNumber}`.toLowerCase()
      return (!query || haystack.includes(query))
        && (statusFilter === 'all' || treatment.status === statusFilter)
        && (serviceFilter === 'all' || treatment.serviceId === serviceFilter)
        && (branchFilter === 'all' || treatment.branchId === branchFilter)
        && (providerFilter === 'all' || treatment.providerId === providerFilter)
    })
  }, [branchFilter, patientTreatments, providerFilter, serviceFilter, serviceMap, statusFilter, workspaceSearch])

  function openCreate() {
    if (!selectedPatient) return
    setMode('add')
    setEditingId(null)
    setFormValues(emptyTreatmentForm(selectedPatient.patientId, services[0]?.id ?? ''))
    setDrawerOpen(true)
  }

  function openEdit(treatment: Treatment) {
    setMode('edit')
    setEditingId(treatment.id)
    setFormValues({ ...treatment })
    setDrawerOpen(true)
  }

  function submitTreatment(values: TreatmentFormValues) {
    if (!selectedPatient) return
    if (mode === 'add') createTreatment({ ...values, patientId: selectedPatient.patientId })
    else if (editingId) updateTreatment(editingId, { ...values, patientId: selectedPatient.patientId })
    setTreatments(getStoredTreatments())
    setDrawerOpen(false)
    setEditingId(null)
  }

  function removeTreatment(id: string) {
    deleteTreatment(id)
    setTreatments(getStoredTreatments())
  }

  function changeStatus(treatment: Treatment, status: TreatmentStatus) {
    updateTreatment(treatment.id, { ...treatment, status })
    setTreatments(getStoredTreatments())
  }

  return (
    <PageScaffold title="Treatments" description="Clinical treatment history and management.">
      <section className="tx12-page">
        <header className="tx12-command">
          <div>
            <span className="tx12-kicker">Treatment management</span>
            <h2>Clinical care workspace</h2>
            <p>Track planned, active and completed procedures with patient context, provider accountability and treatment value.</p>
          </div>
          <Button onClick={openCreate} icon={<Plus size={17} />} disabled={!selectedPatient}>Add treatment</Button>
        </header>

        <div className="tx12-layout">
          <aside className="tx12-patients">
            <div className="tx12-panel-head"><div><span>Patient directory</span><strong>{patients.length} records</strong></div><UserRound size={18} /></div>
            <label className="tx12-search"><Search size={16} /><input value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} placeholder="Search patient or ID" /></label>
            <div className="tx12-patient-list">
              {filteredPatients.map((patient) => {
                const count = treatments.filter((treatment) => treatment.patientId === patient.patientId).length
                return <button type="button" key={patient.id} className={patient.patientId === selectedPatientId ? 'is-active' : ''} onClick={() => setSelectedPatientId(patient.patientId)}><span className="tx12-avatar">{initials(patient.firstName, patient.lastName)}</span><span><strong>{patient.firstName} {patient.lastName}</strong><small>{patient.patientId}</small></span><b>{count}</b></button>
              })}
            </div>
          </aside>

          <main className="tx12-main">
            {selectedPatient ? <>
              <section className="tx12-patient-hero">
                <div className="tx12-identity"><span className="tx12-avatar tx12-avatar-lg">{initials(selectedPatient.firstName, selectedPatient.lastName)}</span><div><span className="tx12-kicker">Selected patient</span><h2>{selectedPatient.firstName} {selectedPatient.lastName}</h2><p>{selectedPatient.patientId} · {selectedPatient.phone || 'No phone'} · {selectedPatient.email || 'No email'}</p></div></div>
                <span className={`tx12-patient-status ${selectedPatient.status === 'active' ? 'is-active' : ''}`}>{selectedPatient.status}</span>
              </section>

              <section className="tx12-metrics">
                <article><span><Activity size={16}/> Active care</span><strong>{active}</strong><small>planned, scheduled or in progress</small></article>
                <article><span><Stethoscope size={16}/> Completed</span><strong>{completed}</strong><small>{patientTreatments.length} total treatments</small></article>
                <article><span><CircleDollarSign size={16}/> Treatment value</span><strong>{formatMoney(totalValue)}</strong><small>configured treatment values</small></article>
                <article><span><CalendarDays size={16}/> Latest activity</span><strong>{latestTreatment ? formatDate(latestTreatment.treatmentDate) : 'No activity'}</strong><small>{latestTreatment?.description || 'No treatment recorded'}</small></article>
              </section>

              <div className="tx12-insight-grid">
                <section className="tx12-insight-card">
                  <div className="tx12-section-head"><div><span className="tx12-kicker">Care pipeline</span><h3>Status distribution</h3></div><Activity size={18}/></div>
                  <div className="tx12-bars">{statusData.map((item) => <div key={item.status}><div><span>{item.status.replaceAll('_',' ')}</span><strong>{item.count}</strong></div><i><b style={{ width: `${(item.count / maxStatus) * 100}%` }}/></i></div>)}</div>
                </section>
                <section className="tx12-insight-card">
                  <div className="tx12-section-head"><div><span className="tx12-kicker">Procedure mix</span><h3>Most used services</h3></div><Stethoscope size={18}/></div>
                  {serviceData.length ? <div className="tx12-bars">{serviceData.map((item) => <div key={item.service.id}><div><span>{item.service.name}</span><strong>{item.count}</strong></div><i><b style={{ width: `${(item.count / maxService) * 100}%` }}/></i></div>)}</div> : <div className="tx12-insight-empty">No procedure mix yet.</div>}
                </section>
              </div>

              <section className="tx12-management">
                <div className="tx12-management-head"><div><span className="tx12-kicker">Treatment registry</span><h3>Manage patient treatments</h3><p>Search and act on this patient's actual treatment records.</p></div><Button onClick={openCreate} icon={<Plus size={16}/>}>New treatment</Button></div>
                <div className="tx12-filterbar">
                  <label className="tx12-search tx12-search-wide"><Search size={16}/><input value={workspaceSearch} onChange={(e)=>setWorkspaceSearch(e.target.value)} placeholder="Search treatment, provider or appointment"/></label>
                  <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}><option value="all">All statuses</option>{statusOrder.map((status)=><option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</select>
                  <select value={serviceFilter} onChange={(e)=>setServiceFilter(e.target.value)}><option value="all">All procedures</option>{services.map((service)=><option key={service.id} value={service.id}>{service.name}</option>)}</select>
                  <select value={branchFilter} onChange={(e)=>setBranchFilter(e.target.value)}><option value="all">All branches</option>{branches.map((branch)=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
                  <select value={providerFilter} onChange={(e)=>setProviderFilter(e.target.value)}><option value="all">All dentists</option>{providers.map((provider)=><option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select>
                </div>

                {filteredTreatments.length ? <div className="tx12-treatment-list">{filteredTreatments.map((treatment)=>{
                  const service = serviceMap.get(treatment.serviceId)
                  const branch = branchMap.get(treatment.branchId ?? '')
                  const provider = providerMap.get(treatment.providerId ?? '')
                  return <article key={treatment.id} className="tx12-treatment-card">
                    <div className="tx12-card-date"><strong>{formatDate(treatment.treatmentDate)}</strong><span>{treatment.toothNumber ? `Tooth ${treatment.toothNumber}` : 'General'}</span></div>
                    <div className="tx12-card-main"><div className="tx12-card-title"><div><span className="tx12-kicker">{service?.name || treatment.serviceNameSnapshot || 'Treatment'}</span><h4>{treatment.description || 'Treatment record'}</h4></div><span className={`tx12-status status-${treatment.status}`}>{treatment.status.replaceAll('_',' ')}</span></div><div className="tx12-card-meta"><span>{provider?.displayName || treatment.providerNameSnapshot || treatment.performedBy}</span><span>{branch?.name || 'No branch'}</span><span>{treatment.appointmentNumber || 'No linked appointment'}</span><strong>{formatMoney(treatment.priceSnapshotCents * Math.max(1,treatment.quantity))}</strong></div>{treatment.notes && <p>{treatment.notes}</p>}</div>
                    <div className="tx12-card-actions"><button type="button" onClick={()=>openEdit(treatment)}>Edit</button><select value={treatment.status} onChange={(e)=>changeStatus(treatment,e.target.value as TreatmentStatus)}>{statusOrder.map((status)=><option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</select><button type="button" className="danger" onClick={()=>removeTreatment(treatment.id)}>Delete</button></div>
                  </article>
                })}</div> : <div className="tx12-empty"><Filter size={24}/><h3>No treatments match</h3><p>Adjust the filters or add the patient's first treatment.</p><Button onClick={openCreate} icon={<Plus size={16}/>}>Add treatment</Button></div>}
              </section>
            </> : <div className="tx12-empty"><UserRound size={28}/><h3>No patient selected</h3><p>Select a patient to manage treatments.</p></div>}
          </main>
        </div>
      </section>

      {drawerOpen && selectedPatient && <TreatmentFormDrawerV12 mode={mode} patient={selectedPatient} services={services} branches={branches} providers={providers} initialValues={formValues} onClose={()=>{setDrawerOpen(false);setEditingId(null)}} onSubmit={submitTreatment}/>} 
    </PageScaffold>
  )
}
