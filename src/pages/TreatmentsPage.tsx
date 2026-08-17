import { useMemo, useState, useEffect } from 'react'
import { Filter, Plus } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { PageScaffold } from '../components/ui/PageScaffold'
import { getStoredPatients } from '../features/patients/patientStore'
import { PatientSelector } from '../features/treatments/PatientSelector'
import { PatientHeader } from '../features/treatments/PatientHeader'
import { TreatmentTimeline } from '../features/treatments/TreatmentTimeline'
import { TreatmentFormDrawer } from '../features/treatments/TreatmentFormDrawer'
import { createTreatment, deleteTreatment, getStoredTreatments, getTreatmentsByPatient, updateTreatment } from '../features/treatments/treatmentStore'
import type { Treatment, TreatmentFormValues } from '../features/treatments/treatmentTypes'
import { getStoredServices } from '../features/services/serviceStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredProviders } from '../features/dentists/dentistStore'

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
  treatmentDate: new Date().toISOString().slice(0, 10),
  notes: '',
  performedBy: 'Clinical provider',
  createdBy: 'Clinical provider',
})

export function TreatmentsPage() {
  const patients = useMemo(() => getStoredPatients(), [])
  const services = useMemo(() => getStoredServices(), [])
  const branches = useMemo(() => getStoredBranches(), [])
  const providers = useMemo(() => getStoredProviders(), [])

  const [search, setSearch] = useState('')
  const [treatmentSearch, setTreatmentSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [providerFilter, setProviderFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.patientId ?? '')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add')
  const [editingTreatmentId, setEditingTreatmentId] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<TreatmentFormValues>(
    emptyTreatmentForm(patients[0]?.patientId ?? '', services[0]?.id ?? '')
  )

  useEffect(() => {
    if (!selectedPatientId && patients[0]) {
      setSelectedPatientId(patients[0].patientId)
    }
  }, [patients, selectedPatientId])

  const filteredPatients = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return patients

    return patients.filter((patient) => {
      const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase()
      return fullName.includes(query) || patient.patientId.toLowerCase().includes(query)
    })
  }, [patients, search])

  useEffect(() => {
    if (!filteredPatients.some((patient) => patient.patientId === selectedPatientId) && filteredPatients[0]) {
      setSelectedPatientId(filteredPatients[0].patientId)
    }
  }, [filteredPatients, selectedPatientId])

  const selectedPatient = patients.find((patient) => patient.patientId === selectedPatientId) ?? null
  const patientTreatments = useMemo(
    () => (selectedPatient ? getTreatmentsByPatient(selectedPatient.patientId) : []),
    [selectedPatient],
  )

  const serviceOptions = services.map((service) => ({ value: service.id, label: service.name }))
  const patientMap = useMemo(() => new Map(patients.map((patient) => [patient.patientId, patient])), [patients])
  const serviceMap = useMemo(() => new Map(services.map((service) => [service.id, service])), [services])
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches])
  const providerMap = useMemo(() => new Map(providers.map((provider) => [provider.id, provider])), [providers])

  const filteredTreatments = useMemo(() => {
    const query = treatmentSearch.trim().toLowerCase()
    return getStoredTreatments().filter((treatment) => {
      const patient = patientMap.get(treatment.patientId)
      const fullName = patient ? `${patient.firstName} ${patient.lastName}`.toLowerCase() : ''
      const matchesQuery = !query || [
        fullName,
        treatment.patientId,
        treatment.description,
        treatment.serviceNameSnapshot,
        treatment.providerNameSnapshot,
        treatment.appointmentNumber,
      ].join(' ').toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || treatment.status === statusFilter
      const matchesService = serviceFilter === 'all' || treatment.serviceId === serviceFilter
      const matchesBranch = branchFilter === 'all' || treatment.branchId === branchFilter
      const matchesProvider = providerFilter === 'all' || treatment.providerId === providerFilter
      const matchesFrom = !dateFrom || treatment.treatmentDate >= dateFrom
      const matchesTo = !dateTo || treatment.treatmentDate <= dateTo
      return matchesQuery && matchesStatus && matchesService && matchesBranch && matchesProvider && matchesFrom && matchesTo
    })
  }, [branchFilter, dateFrom, dateTo, patientMap, providerFilter, serviceFilter, statusFilter, treatmentSearch])

  const openCreateModal = () => {
    if (!selectedPatient) return
    setFormMode('add')
    setEditingTreatmentId(null)
    setFormValues(emptyTreatmentForm(selectedPatient.patientId, services[0]?.id ?? ''))
    setDrawerOpen(true)
  }

  const openEditModal = (treatment: Treatment) => {
    setFormMode('edit')
    setEditingTreatmentId(treatment.id)
    setFormValues({
      patientId: treatment.patientId,
      dentalRecordId: treatment.dentalRecordId ?? '',
      appointmentId: treatment.appointmentId ?? '',
      appointmentNumber: treatment.appointmentNumber ?? '',
      branchId: treatment.branchId ?? '',
      providerId: treatment.providerId ?? '',
      providerNameSnapshot: treatment.providerNameSnapshot ?? '',
      serviceId: treatment.serviceId,
      serviceNameSnapshot: treatment.serviceNameSnapshot ?? '',
      toothNumber: treatment.toothNumber,
      description: treatment.description,
      cost: treatment.cost,
      priceSnapshotCents: treatment.priceSnapshotCents,
      quantity: treatment.quantity,
      status: treatment.status,
      treatmentDate: treatment.treatmentDate,
      notes: treatment.notes,
      performedBy: treatment.performedBy,
      createdBy: treatment.createdBy,
    })
    setDrawerOpen(true)
  }

  const handleSubmitTreatment = (values: TreatmentFormValues) => {
    if (!selectedPatient) return

    if (formMode === 'add') {
      createTreatment({ ...values, patientId: selectedPatient.patientId })
    } else if (editingTreatmentId) {
      updateTreatment(editingTreatmentId, {
        ...values,
        patientId: selectedPatient.patientId,
      })
    }

    setDrawerOpen(false)
    setEditingTreatmentId(null)
  }

  const handleDeleteTreatment = (treatmentId: string) => {
    deleteTreatment(treatmentId)
  }

  const handleStatusChange = (treatmentId: string, status: Treatment['status']) => {
    const treatment = patientTreatments.find((t) => t.id === treatmentId)
    if (!treatment) return

    updateTreatment(treatmentId, {
      ...treatment,
      status,
    })
  }

  const patientName = selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : 'No patient selected'

  return (
    <PageScaffold
      title="Treatments"
      description="Clinical treatment history and management"
    >
      <div className="treatment-page-premium">
        <div className="treatment-layout">
          {/* Left sidebar: Patient selector */}
          <div className="treatment-sidebar">
            <PatientSelector
              patients={patients}
              search={search}
              onSearchChange={setSearch}
              selectedPatientId={selectedPatientId}
              onSelectPatient={setSelectedPatientId}
            />
          </div>

          {/* Main content: Patient workspace */}
          <div className="treatment-main">
            {selectedPatient ? (
              <>
                <PatientHeader
                  patient={selectedPatient}
                  treatmentCount={patientTreatments.length}
                  lastTreatmentDate={patientTreatments[0]?.treatmentDate ?? null}
                />

                <div className="treatment-operations-filter panel">
                  <div className="treatment-filter-heading">
                    <Filter size={16} />
                    <strong>Treatment operations</strong>
                    <span>{filteredTreatments.length} matching entries</span>
                  </div>
                  <div className="treatment-filter-grid">
                    <input value={treatmentSearch} onChange={(event) => setTreatmentSearch(event.target.value)} placeholder="Search patient, treatment, dentist, appointment" />
                    <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                    <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                      <option value="all">All statuses</option>
                      <option value="planned">Planned</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="in_progress">In progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="voided">Voided</option>
                    </select>
                    <select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}>
                      <option value="all">All procedures</option>
                      {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                    </select>
                    <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
                      <option value="all">All branches</option>
                      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </select>
                    <select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}>
                      <option value="all">All dentists</option>
                      {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}
                    </select>
                  </div>
                  <div className="treatment-operations-list">
                    {filteredTreatments.slice(0, 8).map((treatment) => {
                      const patient = patientMap.get(treatment.patientId)
                      return (
                        <article key={treatment.id} className="treatment-operations-row">
                          <div>
                            <strong>{patient ? `${patient.firstName} ${patient.lastName}` : treatment.patientId}</strong>
                            <span>{treatment.serviceNameSnapshot || serviceMap.get(treatment.serviceId)?.name || treatment.description}</span>
                          </div>
                          <span>{treatment.providerNameSnapshot || providerMap.get(treatment.providerId ?? '')?.displayName || treatment.performedBy}</span>
                          <span>{branchMap.get(treatment.branchId ?? '')?.name || 'No branch'}</span>
                          <span>{treatment.appointmentNumber || 'No appointment'}</span>
                          <span className={`status-badge status-${treatment.status}`}>{treatment.status.replaceAll('_', ' ')}</span>
                        </article>
                      )
                    })}
                    {!filteredTreatments.length && <div className="empty-state-panel">No treatments match the current filters.</div>}
                  </div>
                </div>

                {/* Toolbar */}
                <div className="treatment-workspace-toolbar">
                  <div>
                    <p className="toolbar-label">Treatment history</p>
                    <h3 className="toolbar-title">Clinical timeline</h3>
                  </div>
                  <Button icon={<Plus size={16} />} onClick={openCreateModal}>
                    Add treatment
                  </Button>
                </div>

                {/* Timeline */}
                <TreatmentTimeline
                  treatments={patientTreatments}
                  services={services}
                  onEdit={openEditModal}
                  onDelete={handleDeleteTreatment}
                  onStatusChange={handleStatusChange}
                />
              </>
            ) : (
              <div className="no-patient-selected">
                <p>Select a patient to view treatments</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {drawerOpen && selectedPatient && (
        <TreatmentFormDrawer
          mode={formMode}
          patientName={patientName}
          services={serviceOptions}
          initialValues={formValues}
          onClose={() => {
            setDrawerOpen(false)
            setEditingTreatmentId(null)
          }}
          onSubmit={handleSubmitTreatment}
        />
      )}
    </PageScaffold>
  )
}
