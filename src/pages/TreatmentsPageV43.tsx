import { useEffect, useMemo, useState } from 'react'
import { Activity, CalendarDays, ChevronRight, CircleDollarSign, Filter, Plus, Search, Sparkles, Stethoscope, UserRound } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Pagination } from '../components/ui/DesignSystem'
import { MostPerformedTreatmentsV45, PlannedVsPerformedV45 } from '../components/ui/TreatmentAnalyticsV45'
import { TreatmentFormDrawerV12 } from '../features/treatments/TreatmentFormDrawerV12'
import { getStoredPatients } from '../features/patients/patientStore'
import { getStoredServices } from '../features/services/serviceStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { createTreatment, deleteTreatment, getStoredTreatments, updateTreatment } from '../features/treatments/treatmentStore'
import type { Treatment, TreatmentFormValues, TreatmentStatus } from '../features/treatments/treatmentTypes'
import { buildEnterpriseReportSnapshot, formatReportCurrency } from '../features/reports/reportStore'

const statusOrder: TreatmentStatus[] = ['planned', 'scheduled', 'in_progress', 'completed', 'cancelled', 'voided']
const TREATMENT_PAGE_SIZE_OPTIONS = [10, 20, 50]

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
  if (!value) return 'No activity'
  const date = new Date(`${value}T00:00:00+08:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(cents / 100)
}

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

function statusLabel(status: TreatmentStatus) {
  return status.replaceAll('_', ' ')
}

export function TreatmentsPageV43() {
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
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [isMutating, setIsMutating] = useState(false)
  const [treatmentPage, setTreatmentPage] = useState(1)
  const [treatmentPageSize, setTreatmentPageSize] = useState(10)

  const patientMap = useMemo(() => new Map(patients.map((patient) => [patient.patientId, patient])), [patients])
  const serviceMap = useMemo(() => new Map(services.map((service) => [service.id, service])), [services])
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches])
  const providerMap = useMemo(() => new Map(providers.map((provider) => [provider.id, provider])), [providers])
  const selectedPatient = patientMap.get(selectedPatientId) ?? null

  const filteredPatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase()
    if (!query) return patients
    return patients.filter((patient) => `${patient.firstName} ${patient.lastName} ${patient.patientId} ${patient.email} ${patient.phone}`.toLowerCase().includes(query))
  }, [patientSearch, patients])

  const patientTreatments = useMemo(() => treatments.filter((treatment) => treatment.patientId === selectedPatientId).sort((a, b) => b.treatmentDate.localeCompare(a.treatmentDate)), [selectedPatientId, treatments])
  const active = patientTreatments.filter((item) => ['planned', 'scheduled', 'in_progress'].includes(item.status)).length
  const completed = patientTreatments.filter((item) => item.status === 'completed').length
  const totalValue = patientTreatments.reduce((sum, item) => sum + item.priceSnapshotCents * Math.max(1, item.quantity), 0)
  const latestTreatment = patientTreatments[0]

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

  const treatmentPageCount = Math.max(1, Math.ceil(filteredTreatments.length / treatmentPageSize))
  const effectiveTreatmentPage = Math.min(treatmentPage, treatmentPageCount)
  const visibleTreatments = useMemo(() => {
    const start = (effectiveTreatmentPage - 1) * treatmentPageSize
    return filteredTreatments.slice(start, start + treatmentPageSize)
  }, [effectiveTreatmentPage, filteredTreatments, treatmentPageSize])

  useEffect(() => {
    setTreatmentPage(1)
  }, [branchFilter, providerFilter, selectedPatientId, serviceFilter, statusFilter, treatmentPageSize, workspaceSearch])

  useEffect(() => {
    setTreatmentPage((current) => Math.min(current, treatmentPageCount))
  }, [treatmentPageCount])

  const snapshot = useMemo(() => buildEnterpriseReportSnapshot({ filters: { preset: 'this_month' } }), [treatments])
  const treatmentRows = useMemo(() => [...snapshot.treatments].sort((a, b) => b.performedCount - a.performedCount).slice(0, 7), [snapshot])
  const analyticsRows = useMemo(() => treatmentRows.map((row) => ({
    label: row.serviceName,
    performed: row.performedCount,
    planned: row.plannedCount,
    billedLabel: formatReportCurrency(row.billedRevenueCents),
  })), [treatmentRows])
  const performedTotal = treatmentRows.reduce((sum, row) => sum + row.performedCount, 0)

  function openCreate() {
    if (!selectedPatient || isMutating) return
    setMutationError(null)
    setMode('add')
    setEditingId(null)
    setFormValues(emptyTreatmentForm(selectedPatient.patientId, services[0]?.id ?? ''))
    setDrawerOpen(true)
  }

  function openEdit(treatment: Treatment) {
    if (isMutating) return
    setMutationError(null)
    setMode('edit')
    setEditingId(treatment.id)
    setFormValues({ ...treatment })
    setDrawerOpen(true)
  }

  async function submitTreatment(values: TreatmentFormValues) {
    if (!selectedPatient || isMutating) return
    setIsMutating(true)
    setMutationError(null)
    try {
      if (mode === 'add') await createTreatment({ ...values, patientId: selectedPatient.patientId })
      else if (editingId) await updateTreatment(editingId, { ...values, patientId: selectedPatient.patientId })
      setTreatments(getStoredTreatments())
      setDrawerOpen(false)
      setEditingId(null)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Treatment could not be saved.'
      setMutationError(message)
      throw new Error(message)
    } finally {
      setIsMutating(false)
    }
  }

  async function removeTreatment(id: string) {
    if (isMutating) return
    const treatment = treatments.find((entry) => entry.id === id)
    if (!treatment) return
    if (!window.confirm('Void this treatment record? The record will be preserved in clinical history.')) return
    setIsMutating(true)
    setMutationError(null)
    try {
      await deleteTreatment(id)
      setTreatments(getStoredTreatments())
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : 'Treatment could not be voided.')
    } finally {
      setIsMutating(false)
    }
  }

  async function changeStatus(treatment: Treatment, status: TreatmentStatus) {
    if (isMutating || treatment.status === status) return
    setIsMutating(true)
    setMutationError(null)
    try {
      await updateTreatment(treatment.id, { ...treatment, status })
      setTreatments(getStoredTreatments())
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : 'Treatment status could not be changed.')
    } finally {
      setIsMutating(false)
    }
  }

  return (
    <section className="tx43-page">
      <header className="tx43-hero">
        <div className="tx43-hero-copy">
          <span className="tx43-eyebrow"><Sparkles size={14} /> Procedure execution</span>
          <h2>Treatments</h2>
          <p>Track actual procedures that are planned, in progress, or completed. Proposed care belongs in Treatment Plans; visit notes belong in Dental Records.</p>
        </div>
        <Button onClick={openCreate} icon={<Plus size={17} />} disabled={!selectedPatient || isMutating}>New treatment</Button>
      </header>

      {mutationError && <div className="tx12-form-error" role="alert">{mutationError}</div>}

      <section className="tx43-analytics">
        <article className="tx43-insight tx43-insight-primary">
          <div className="tx43-insight-head">
            <div><span>Clinical demand</span><h3>Most performed treatments</h3><p>Current-month procedures ranked by completed clinical activity. Hover or focus a row for exact values.</p></div>
            <div className="tx43-insight-stat"><strong>{performedTotal}</strong><span>performed</span></div>
          </div>
          <MostPerformedTreatmentsV45 rows={analyticsRows} />
        </article>

        <article className="tx43-insight tx43-pipeline-card">
          <div className="tx43-insight-head">
            <div><span>Care pipeline</span><h3>Planned vs performed</h3><p>Compare planned procedure demand against recorded clinical completion by service.</p></div>
          </div>
          <PlannedVsPerformedV45 rows={analyticsRows} />
        </article>
      </section>

      <section className="tx43-workspace">
        <aside className="tx43-directory">
          <div className="tx43-directory-head">
            <div><span>Patient directory</span><strong>{patients.length} records</strong></div>
            <UserRound size={19} />
          </div>
          <label className="tx43-search"><Search size={16} /><input value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="Search patient or ID" /></label>
          <div className="tx43-patient-list">
            {filteredPatients.map((patient) => {
              const count = treatments.filter((treatment) => treatment.patientId === patient.patientId).length
              return (
                <button type="button" key={patient.id} className={patient.patientId === selectedPatientId ? 'is-active' : ''} onClick={() => setSelectedPatientId(patient.patientId)}>
                  <span className="tx43-avatar">{initials(patient.firstName, patient.lastName)}</span>
                  <span className="tx43-patient-copy"><strong>{patient.firstName} {patient.lastName}</strong><small>{patient.patientId}</small></span>
                  <span className="tx43-count">{count}</span>
                  <ChevronRight size={15} />
                </button>
              )
            })}
            {!filteredPatients.length && <div className="tx43-directory-empty">No patients match your search.</div>}
          </div>
        </aside>

        <main className="tx43-main">
          {selectedPatient ? <>
            <section className="tx43-patient-context">
              <div className="tx43-identity">
                <span className="tx43-avatar tx43-avatar-lg">{initials(selectedPatient.firstName, selectedPatient.lastName)}</span>
                <div><span className="tx43-eyebrow">Selected patient</span><h3>{selectedPatient.firstName} {selectedPatient.lastName}</h3><p>{selectedPatient.patientId} · {selectedPatient.phone || 'No phone'} · {selectedPatient.email || 'No email'}</p></div>
              </div>
              <span className={`tx43-patient-status ${selectedPatient.status === 'active' ? 'is-active' : ''}`}>{selectedPatient.status}</span>
            </section>

            <section className="tx43-kpis">
              <article><span><Activity size={16} /> Active care</span><strong>{active}</strong><small>planned, scheduled or in progress</small></article>
              <article><span><Stethoscope size={16} /> Completed</span><strong>{completed}</strong><small>{patientTreatments.length} total treatment records</small></article>
              <article><span><CircleDollarSign size={16} /> Treatment value</span><strong>{formatMoney(totalValue)}</strong><small>configured treatment values</small></article>
              <article><span><CalendarDays size={16} /> Latest activity</span><strong>{latestTreatment ? formatDate(latestTreatment.treatmentDate) : 'No activity'}</strong><small>{latestTreatment?.description || 'No treatment recorded'}</small></article>
            </section>

            <section className="tx43-management">
              <div className="tx43-management-head">
                <div><span className="tx43-eyebrow">Actual care items</span><h3>Patient treatment registry</h3><p>Review procedure status, appointment link, dentist, branch, amount, and notes for care that is happening or has happened.</p></div>
                <Button onClick={openCreate} icon={<Plus size={16} />} disabled={isMutating}>Add treatment</Button>
              </div>

              <div className="tx43-filterbar">
                <label className="tx43-search tx43-search-wide"><Search size={16} /><input value={workspaceSearch} onChange={(event) => setWorkspaceSearch(event.target.value)} placeholder="Search treatment, provider or appointment" /></label>
                <label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{statusOrder.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
                <label><span>Procedure</span><select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}><option value="all">All procedures</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
                <label><span>Branch</span><select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}><option value="all">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
                <label><span>Dentist</span><select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}><option value="all">All dentists</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select></label>
              </div>

              {filteredTreatments.length ? (
                <>
                  <div className="tx43-treatment-list">
                    {visibleTreatments.map((treatment) => {
                      const service = serviceMap.get(treatment.serviceId)
                      const branch = branchMap.get(treatment.branchId ?? '')
                      const provider = providerMap.get(treatment.providerId ?? '')
                      return (
                        <article key={treatment.id} className="tx43-treatment-card">
                          <div className="tx43-card-top">
                            <div className="tx43-card-service"><span>{service?.name || treatment.serviceNameSnapshot || 'Treatment'}</span><h4>{treatment.description || 'Treatment record'}</h4></div>
                            <span className={`tx43-status status-${treatment.status}`}>{statusLabel(treatment.status)}</span>
                          </div>
                          <div className="tx43-card-details">
                            <div><span>Date</span><strong>{formatDate(treatment.treatmentDate)}</strong></div>
                            <div><span>Tooth</span><strong>{treatment.toothNumber ? `#${treatment.toothNumber}` : 'General'}</strong></div>
                            <div><span>Dentist</span><strong>{provider?.displayName || treatment.providerNameSnapshot || treatment.performedBy}</strong></div>
                            <div><span>Branch</span><strong>{branch?.name || 'No branch'}</strong></div>
                            <div><span>Appointment</span><strong>{treatment.appointmentNumber || 'Not linked'}</strong></div>
                            <div><span>Value</span><strong>{formatMoney(treatment.priceSnapshotCents * Math.max(1, treatment.quantity))}</strong></div>
                          </div>
                          {treatment.notes && <p className="tx43-card-notes">{treatment.notes}</p>}
                          <div className="tx43-card-actions">
                            <button type="button" disabled={isMutating || ['completed', 'voided'].includes(treatment.status)} onClick={() => openEdit(treatment)}>Edit details</button>
                            <select disabled={isMutating || ['completed', 'voided'].includes(treatment.status)} aria-label={`Change status for ${treatment.description || 'treatment'}`} value={treatment.status} onChange={(event) => void changeStatus(treatment, event.target.value as TreatmentStatus)}>{statusOrder.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select>
                            <button type="button" disabled={isMutating || ['completed', 'voided'].includes(treatment.status)} className="danger" onClick={() => void removeTreatment(treatment.id)}>Void</button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                  <Pagination
                    page={effectiveTreatmentPage}
                    pageCount={treatmentPageCount}
                    totalItems={filteredTreatments.length}
                    pageSize={treatmentPageSize}
                    pageSizeOptions={TREATMENT_PAGE_SIZE_OPTIONS}
                    onPageChange={setTreatmentPage}
                    onPageSizeChange={setTreatmentPageSize}
                    label="Patient treatment registry pages"
                  />
                </>
              ) : (
                <div className="tx43-empty"><Filter size={24} /><h3>No treatments match</h3><p>Adjust the filters or add the patient's first treatment.</p><Button onClick={openCreate} icon={<Plus size={16} />}>Add treatment</Button></div>
              )}
            </section>
          </> : <div className="tx43-empty"><UserRound size={28} /><h3>No patient selected</h3><p>Select a patient to manage treatments.</p></div>}
        </main>
      </section>

      {drawerOpen && selectedPatient && <TreatmentFormDrawerV12 mode={mode} patient={selectedPatient} services={services} branches={branches} providers={providers} initialValues={formValues} onClose={() => { if (!isMutating) { setDrawerOpen(false); setEditingId(null) } }} onSubmit={submitTreatment} />}
    </section>
  )
}
