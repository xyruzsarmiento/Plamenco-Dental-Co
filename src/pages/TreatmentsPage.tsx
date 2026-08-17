import { useMemo, useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { PageScaffold } from '../components/ui/PageScaffold'
import { getStoredPatients } from '../features/patients/patientStore'
import { PatientSelector } from '../features/treatments/PatientSelector'
import { PatientHeader } from '../features/treatments/PatientHeader'
import { TreatmentTimeline } from '../features/treatments/TreatmentTimeline'
import { TreatmentFormDrawer } from '../features/treatments/TreatmentFormDrawer'
import { createTreatment, deleteTreatment, getTreatmentsByPatient, updateTreatment } from '../features/treatments/treatmentStore'
import type { Treatment, TreatmentFormValues } from '../features/treatments/treatmentTypes'
import { getStoredServices } from '../features/services/serviceStore'

const emptyTreatmentForm = (patientId: string, serviceId: string): TreatmentFormValues => ({
  patientId,
  dentalRecordId: '',
  serviceId,
  toothNumber: undefined,
  description: '',
  cost: 0,
  status: 'planned',
  treatmentDate: new Date().toISOString().slice(0, 10),
  notes: '',
})

export function TreatmentsPage() {
  const patients = useMemo(() => getStoredPatients(), [])
  const services = useMemo(() => getStoredServices(), [])

  const [search, setSearch] = useState('')
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
      serviceId: treatment.serviceId,
      toothNumber: treatment.toothNumber,
      description: treatment.description,
      cost: treatment.cost,
      status: treatment.status,
      treatmentDate: treatment.treatmentDate,
      notes: treatment.notes,
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
