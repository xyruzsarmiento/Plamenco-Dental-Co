import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, CalendarClock, ChevronRight, FileText, Filter, Import, Mail, Phone, Plus, Search, Stethoscope, Users } from 'lucide-react'
import { Select } from '../components/ui/Select'
import { usePermissions } from '../features/auth/permissions'
import { DentalRecordFormModal } from '../features/dentalRecords/DentalRecordFormModal'
import { createDentalRecord, getPatientName } from '../features/dentalRecords/dentalRecordStore'
import type { DentalRecordFormValues } from '../features/dentalRecords/dentalRecordTypes'
import { PatientFormModal } from '../features/patients/PatientFormModal'
import { PatientImportModal } from '../features/patients/PatientImportModal'
import type { Patient, PatientFormMode, PatientFormValues, PatientOrigin } from '../features/patients/patientTypes'
import {
  createPatient,
  deletePatient,
  findPotentialPatientDuplicates,
  filterPatients,
  getPatientDisplayName,
  getStoredPatients,
  searchPatients,
  updatePatient,
} from '../features/patients/patientStore'
import { getPatient360Summary } from '../features/patients/patient360Store'
import { getAppointmentsByPatient, getStoredAppointments } from '../features/appointments/appointmentStore'
import { getTreatmentsByPatient } from '../features/treatments/treatmentStore'
import { getStoredServices } from '../features/services/serviceStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { formatCurrency } from '../features/billing/billingStore'
import { CommunicationHistoryPanel } from '../features/communications/CommunicationHistoryPanel'
import { CommunicationPreferencesPanel } from '../features/communications/CommunicationPreferencesPanel'
import { getCommunicationLogsByPatient } from '../features/communications/communicationStore'

function getInitials(firstName: string, lastName: string) {
  return `${firstName?.charAt(0) ?? ''}${lastName?.charAt(0) ?? ''}`.toUpperCase()
}

function getAge(dateOfBirth: string) {
  if (!dateOfBirth) return 'No DOB'

  const today = new Date()
  const birthDate = new Date(dateOfBirth)
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }

  return age
}

function formatDisplayDate(value?: string) {
  if (!value) return 'No record'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No record'

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDisplayTime(value?: string) {
  if (!value) return 'No time'

  const [hours, minutes] = value.split(':').map(Number)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function createEmptyPatientFormValues(): PatientFormValues {
  return {
    authUserId: undefined,
    fullName: '',
    firstName: '',
    middleName: '',
    lastName: '',
    dateOfBirth: '',
    sex: 'female',
    phone: '',
    email: '',
    address: '',
    city: '',
    province: '',
    emergencyContact: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    preferredBranchId: '',
    origin: 'walk_in',
    registrationDate: new Date().toISOString().split('T')[0],
    status: 'active',
    allergies: '',
    medicalConditions: '',
    currentMedications: '',
    previousSurgeries: '',
    medicalNotes: '',
    administrativeNotes: '',
    profileImage: '',
  }
}

const originLabels: Record<PatientOrigin, string> = {
  online_registration: 'Online Registration',
  walk_in: 'Walk-in',
  historical_import: 'Historical Import',
  staff_created: 'Staff Created',
}

type PatientDetailTab = 'overview' | 'appointments' | 'treatments' | 'clinical' | 'prescriptions' | 'billing' | 'documents' | 'communications' | 'activity'

export function PatientsPage() {
  const navigate = useNavigate()
  const { patientId: routePatientId } = useParams()
  const permissions = usePermissions()
  const [patients, setPatients] = useState<Patient[]>(() => getStoredPatients())
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [originFilter, setOriginFilter] = useState('all')
  const [activityFilter, setActivityFilter] = useState('all')
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [activeDetailTab, setActiveDetailTab] = useState<PatientDetailTab>('overview')
  const [formMode, setFormMode] = useState<PatientFormMode>('add')
  const [formValues, setFormValues] = useState<PatientFormValues>(() => createEmptyPatientFormValues())
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<ReturnType<typeof findPotentialPatientDuplicates>>([])
  const [allowDuplicateCreate, setAllowDuplicateCreate] = useState(false)
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [recordFormError, setRecordFormError] = useState<string | null>(null)
  const [recordFormValues, setRecordFormValues] = useState<DentalRecordFormValues>({
    patientId: '',
    recordDate: new Date().toISOString().split('T')[0],
    visitType: 'consultation',
    chiefComplaint: '',
    clinicalFindings: '',
    assessment: '',
    treatmentPerformed: '',
    recommendations: '',
    patientVisibleSummary: '',
    diagnosis: '',
    treatmentPlan: '',
    findings: '',
    treatmentNotes: '',
    clinicalNotes: '',
    followUpRequired: false,
    followUpDate: '',
    followUpNotes: '',
    status: 'draft',
    relatedAppointmentId: '',
    source: 'native',
    lastUpdatedBy: 'Dr. Santos',
    createdBy: 'Dr. Santos',
  })

  function openPatient360(patient: Patient) {
    setActiveDetailTab('overview')
    setSelectedPatient(patient)
    navigate(`/app/patients/${encodeURIComponent(patient.patientId)}`)
  }

  function closePatient360() {
    setSelectedPatient(null)
    navigate('/app/patients')
  }

  const appointments = useMemo(() => getStoredAppointments(), [])
  const services = useMemo(() => getStoredServices(), [])
  const branches = useMemo(() => getStoredBranches(), [])
  const providers = useMemo(() => getStoredProviders(), [])
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches])
  const serviceMap = useMemo(() => new Map(services.map((service) => [service.id, service])), [services])
  const providerMap = useMemo(() => new Map(providers.map((provider) => [provider.id, provider])), [providers])
  const selectedPatient360 = useMemo(() => selectedPatient ? getPatient360Summary(selectedPatient) : null, [selectedPatient])
  const canCreatePatients = permissions.can('patients.create')
  const canEditPatients = permissions.can('patients.edit_basic')
  const canImportPatients = permissions.can('patients.import')
  const canViewHistory = permissions.can('patients.view_history')
  const canViewClinical = permissions.canAny(['clinical_records.view', 'treatments.view'])
  const canCreateClinical = permissions.can('clinical_records.create')
  const canViewBilling = permissions.canAny(['billing.view', 'payments.view'])
  const canViewDocuments = permissions.can('documents.view')

  useEffect(() => {
    if (!routePatientId) {
      return
    }

    const decodedPatientId = decodeURIComponent(routePatientId)
    const patient = patients.find((candidate) => candidate.patientId === decodedPatientId || candidate.id === decodedPatientId)
    setSelectedPatient(patient ?? null)
  }, [patients, routePatientId])

  const summaryMetrics = useMemo(() => {
    const totalPatients = patients.length
    const activePatients = patients.filter((patient) => patient.status === 'active').length
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const newPatients = patients.filter((patient) => {
      const registrationDate = new Date(patient.registrationDate)
      return !Number.isNaN(registrationDate.getTime()) && registrationDate >= thirtyDaysAgo
    }).length
    const upcomingAppointments = appointments.filter((appointment) => {
      const appointmentDate = new Date(`${appointment.date}T00:00:00`)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return appointmentDate >= today && !['cancelled', 'no_show', 'completed'].includes(appointment.status)
    }).length

    return { totalPatients, activePatients, newPatients, upcomingAppointments }
  }, [appointments, patients])

  const filteredPatients = useMemo(() => {
    let result = searchQuery ? searchPatients(searchQuery) : patients
    result = filterPatients(result, { status: statusFilter === 'all' ? undefined : statusFilter })
    if (branchFilter !== 'all') {
      result = result.filter((patient) => patient.preferredBranchId === branchFilter)
    }
    if (originFilter !== 'all') {
      result = result.filter((patient) => (patient.origin ?? 'staff_created') === originFilter)
    }

    if (activityFilter !== 'all') {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - (activityFilter === 'recent' ? 30 : 90))

      result = result.filter((patient) => {
        const patientAppointments = getAppointmentsByPatient(patient.patientId)
        const recentActivity = patientAppointments.some((appointment) => {
          const appointmentDate = new Date(`${appointment.date}T00:00:00`)
          return !Number.isNaN(appointmentDate.getTime()) && appointmentDate >= cutoff
        }) || getTreatmentsByPatient(patient.patientId).some((treatment) => {
          const treatmentDate = new Date(treatment.treatmentDate)
          return !Number.isNaN(treatmentDate.getTime()) && treatmentDate >= cutoff
        })

        return activityFilter === 'recent' ? recentActivity : !recentActivity
      })
    }

    return [...result].sort((a, b) => {
      const aName = `${a.firstName} ${a.lastName}`.toLowerCase()
      const bName = `${b.firstName} ${b.lastName}`.toLowerCase()
      return aName.localeCompare(bName)
    })
  }, [activityFilter, branchFilter, originFilter, patients, searchQuery, statusFilter])

  function handleAddNew() {
    setSelectedPatient(null)
    setFormMode('add')
    setFormValues(createEmptyPatientFormValues())
    setFormError(null)
    setDuplicateWarning([])
    setAllowDuplicateCreate(false)
    setShowForm(true)
  }

  function handleEditPatient(patient: Patient) {
    setSelectedPatient(patient)
    setFormMode('edit')
    setFormValues({
      firstName: patient.firstName,
      middleName: patient.middleName,
      lastName: patient.lastName,
      fullName: patient.fullName ?? getPatientDisplayName(patient),
      authUserId: patient.authUserId,
      dateOfBirth: patient.dateOfBirth,
      sex: patient.sex,
      phone: patient.phone,
      email: patient.email,
      address: patient.address,
      city: patient.city ?? '',
      province: patient.province ?? '',
      emergencyContact: patient.emergencyContact,
      emergencyContactPhone: patient.emergencyContactPhone,
      emergencyContactRelationship: patient.emergencyContactRelationship ?? '',
      preferredBranchId: patient.preferredBranchId ?? '',
      origin: patient.origin ?? 'staff_created',
      registrationDate: patient.registrationDate,
      status: patient.status,
      allergies: patient.allergies,
      medicalConditions: patient.medicalConditions,
      currentMedications: patient.currentMedications,
      previousSurgeries: patient.previousSurgeries,
      medicalNotes: patient.medicalNotes,
      administrativeNotes: patient.administrativeNotes ?? '',
      profileImage: patient.profileImage ?? '',
    })
    setFormError(null)
    setDuplicateWarning([])
    setAllowDuplicateCreate(false)
    setShowForm(true)
  }

  function handleDeletePatient(patient: Patient) {
    if (confirm(`Are you sure you want to remove ${patient.firstName} ${patient.lastName}?`)) {
      deletePatient(patient.id)
      setPatients(getStoredPatients())
      if (selectedPatient?.id === patient.id) {
        setSelectedPatient(null)
      }
    }
  }

  function handleSubmitForm() {
    if (!formValues.firstName.trim()) {
      setFormError('First name is required')
      return
    }
    if (!formValues.lastName.trim()) {
      setFormError('Last name is required')
      return
    }
    if (!formValues.dateOfBirth) {
      setFormError('Date of birth is required')
      return
    }
    if (!formValues.phone.trim()) {
      setFormError('Phone is required')
      return
    }

    if (formMode === 'add' && !allowDuplicateCreate) {
      const matches = findPotentialPatientDuplicates(formValues)
      if (matches.length > 0) {
        setDuplicateWarning(matches)
        setFormError('Possible existing patient found. Review the record below before creating a new patient.')
        return
      }
    }

    if (formMode === 'add') {
      createPatient(formValues)
    } else if (selectedPatient) {
      updatePatient(selectedPatient.id, formValues)
    }

    setPatients(getStoredPatients())
    setShowForm(false)
    setSelectedPatient(null)
    setFormError(null)
    setDuplicateWarning([])
    setAllowDuplicateCreate(false)
  }

  function handleCloseForm() {
    setShowForm(false)
    setFormError(null)
    setSelectedPatient(null)
  }

  function handleAddDentalRecord(patient: Patient) {
    setSelectedPatient(patient)
    setRecordFormValues({
      patientId: patient.patientId,
      recordDate: new Date().toISOString().split('T')[0],
      visitType: 'consultation',
      chiefComplaint: '',
      clinicalFindings: '',
      assessment: '',
      treatmentPerformed: '',
      recommendations: '',
      patientVisibleSummary: '',
      diagnosis: '',
      treatmentPlan: '',
      findings: '',
      treatmentNotes: '',
      clinicalNotes: '',
      followUpRequired: false,
      followUpDate: '',
      followUpNotes: '',
      status: 'draft',
      relatedAppointmentId: '',
      source: 'native',
      lastUpdatedBy: 'Dr. Santos',
      createdBy: 'Dr. Santos',
    })
    setRecordFormError(null)
    setShowRecordForm(true)
  }

  function handleSubmitDentalRecord() {
    if (!selectedPatient) return

    if (!recordFormValues.chiefComplaint.trim()) {
      setRecordFormError('Chief complaint is required')
      return
    }

    if (!recordFormValues.assessment.trim()) {
      setRecordFormError('Assessment is required')
      return
    }

    createDentalRecord({
      ...recordFormValues,
      patientId: selectedPatient.patientId,
    })

    setShowRecordForm(false)
    setRecordFormError(null)
  }

  function handleCloseRecordForm() {
    setShowRecordForm(false)
    setRecordFormError(null)
  }

  return (
    <section className="page-stack patients-workspace">
      <div className="patients-header">
        <div>
          <span className="eyebrow">Patient records</span>
          <h2>PATIENTS</h2>
          <p>Manage patient information, history and clinic activity.</p>
        </div>
        <div className="patients-header-actions">
          {canImportPatients && (
            <button type="button" className="btn btn-secondary btn-md" onClick={() => setShowImport(true)}>
              <Import size={16} />
              <span>Import patients</span>
            </button>
          )}
          {canCreatePatients && (
            <button type="button" className="btn btn-primary btn-md" onClick={handleAddNew}>
              <Plus size={16} />
              <span>Add patient</span>
            </button>
          )}
        </div>
      </div>

      <div className="patients-summary">
        <div className="summary-card">
          <div className="summary-icon"><Users size={18} /></div>
          <div>
            <span>Total patients</span>
            <strong>{summaryMetrics.totalPatients}</strong>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon summary-icon-active"><Stethoscope size={18} /></div>
          <div>
            <span>Active patients</span>
            <strong>{summaryMetrics.activePatients}</strong>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon summary-icon-accent"><CalendarClock size={18} /></div>
          <div>
            <span>New patients</span>
            <strong>{summaryMetrics.newPatients}</strong>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon summary-icon-muted"><Filter size={18} /></div>
          <div>
            <span>Upcoming appointments</span>
            <strong>{summaryMetrics.upcomingAppointments}</strong>
          </div>
        </div>
      </div>

      <div className="patients-toolbar">
        <label className="toolbar-search" htmlFor="patient-search">
          <Search size={18} className="search-icon" />
          <input
            id="patient-search"
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search patients..."
          />
        </label>

        <Select
          label="Status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          options={[
            { label: 'All statuses', value: 'all' },
            { label: 'Active', value: 'active' },
            { label: 'Inactive', value: 'inactive' },
          ]}
        />

        <Select
          label="Branch"
          value={branchFilter}
          onChange={(event) => setBranchFilter(event.target.value)}
          options={[
            { label: 'All branches', value: 'all' },
            ...branches.map((branch) => ({ label: branch.name, value: branch.id })),
          ]}
        />

        <Select
          label="Origin"
          value={originFilter}
          onChange={(event) => setOriginFilter(event.target.value)}
          options={[
            { label: 'All origins', value: 'all' },
            { label: 'Online Registration', value: 'online_registration' },
            { label: 'Walk-in', value: 'walk_in' },
            { label: 'Historical Import', value: 'historical_import' },
            { label: 'Staff Created', value: 'staff_created' },
          ]}
        />

        <Select
          label="Activity"
          value={activityFilter}
          onChange={(event) => setActivityFilter(event.target.value)}
          options={[
            { label: 'All', value: 'all' },
            { label: 'Recent', value: 'recent' },
            { label: 'Dormant', value: 'dormant' },
          ]}
        />
      </div>

      {routePatientId && !selectedPatient && (
        <div className="panel empty-state-panel patient-route-state">
          <Users size={20} />
          <h3>Patient record not found</h3>
          <p>No patient matches {decodeURIComponent(routePatientId)}. Check the patient number or search the directory.</p>
        </div>
      )}

      <div className="patients-directory">
        {filteredPatients.length === 0 ? (
          <div className="panel empty-state-panel">
            <Users size={20} />
            <h3>No patients match your search</h3>
            <p>Try a different name, ID, or email, or add a new patient record.</p>
          </div>
        ) : (
          filteredPatients.map((patient) => {
            const patientAppointments = getAppointmentsByPatient(patient.patientId)
            const sortedAppointments = [...patientAppointments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            const lastAppointment = sortedAppointments[0]
            const nextAppointment = [...sortedAppointments]
              .filter((appointment) => appointment.date >= new Date().toISOString().slice(0, 10) && !['cancelled', 'no_show', 'completed'].includes(appointment.status))
              .sort((a, b) => a.date.localeCompare(b.date))[0]

            return (
              <article key={patient.id} className="patient-directory-card" onClick={() => openPatient360(patient)}>
                <div className="patient-card-header-row">
                  <div className="patient-avatar">{getInitials(patient.firstName, patient.lastName)}</div>
                  <div className="patient-card-copy">
                    <strong>{getPatientDisplayName(patient)}</strong>
                    <small>{patient.patientId}</small>
                  </div>
                  <span className={`status-badge status-${patient.status}`}>
                    {patient.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="patient-card-meta">
                  <div><Mail size={14} /> <span>{patient.email || 'No email on file'}</span></div>
                  <div><Phone size={14} /> <span>{patient.phone || 'No phone on file'}</span></div>
                </div>

                <div className="patient-card-details">
                  <div>
                    <span>Preferred branch</span>
                    <strong>{patient.preferredBranchId ? branchMap.get(patient.preferredBranchId)?.name ?? 'Unknown branch' : 'No preferred branch'}</strong>
                  </div>
                  <div>
                    <span>Origin</span>
                    <strong>{originLabels[patient.origin ?? 'staff_created']}</strong>
                  </div>
                  <div>
                    <span>Last appointment</span>
                    <strong>{lastAppointment ? formatDisplayDate(lastAppointment.date) : 'No visits yet'}</strong>
                  </div>
                  <div>
                    <span>Upcoming</span>
                    <strong>{nextAppointment ? `${formatDisplayDate(nextAppointment.date)} - ${formatDisplayTime(nextAppointment.startTime)}` : 'No upcoming visits'}</strong>
                  </div>
                </div>

                <div className="patient-card-actions">
                  <button type="button" className="text-button" onClick={(event) => { event.stopPropagation(); openPatient360(patient) }}>
                    View
                  </button>
                  {canEditPatients && (
                    <button type="button" className="text-button" onClick={(event) => { event.stopPropagation(); handleEditPatient(patient) }}>
                      Edit
                    </button>
                  )}
                  <button type="button" className="text-button" onClick={(event) => { event.stopPropagation(); navigate('/app/appointments') }}>
                    Appointments
                  </button>
                  {canViewClinical && (
                    <button type="button" className="text-button" onClick={(event) => { event.stopPropagation(); navigate('/app/treatments') }}>
                      Treatments
                    </button>
                  )}
                  {canEditPatients && getAppointmentsByPatient(patient.patientId).length === 0 && getTreatmentsByPatient(patient.patientId).length === 0 && (
                    <button type="button" className="text-button" onClick={(event) => { event.stopPropagation(); handleDeletePatient(patient) }}>
                      Remove
                    </button>
                  )}
                </div>
              </article>
            )
          })
        )}
      </div>

      {showForm && (
        <PatientFormModal
          mode={formMode}
          values={formValues}
          onChange={setFormValues}
          onSubmit={handleSubmitForm}
          onClose={handleCloseForm}
          error={formError}
          duplicateMatches={duplicateWarning}
          onOpenDuplicate={(patientId) => {
            const patient = patients.find((candidate) => candidate.id === patientId)
            if (patient) {
              openPatient360(patient)
              setShowForm(false)
              setDuplicateWarning([])
              setFormError(null)
            }
          }}
          onContinueDuplicate={() => {
            setAllowDuplicateCreate(true)
            setDuplicateWarning([])
            setFormError(null)
          }}
        />
      )}

      {showImport && canImportPatients && (
        <PatientImportModal
          onClose={() => setShowImport(false)}
          onImported={() => setPatients(getStoredPatients())}
        />
      )}

      {showRecordForm && selectedPatient && (
        <DentalRecordFormModal
          patientName={getPatientName(selectedPatient.patientId)}
          values={recordFormValues}
          onChange={setRecordFormValues}
          onSubmit={handleSubmitDentalRecord}
          onClose={handleCloseRecordForm}
          error={recordFormError}
        />
      )}

      {selectedPatient && selectedPatient360 && !showForm && !showRecordForm && (
        <div className="patient-detail-backdrop" onClick={closePatient360}>
          <aside className="patient-detail-drawer patient-workspace-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="patient-detail-header">
              <div className="patient-detail-heading">
                <div className="patient-avatar patient-avatar-large">
                  {selectedPatient.profileImage ? <img src={selectedPatient.profileImage} alt="" /> : getInitials(selectedPatient.firstName, selectedPatient.lastName)}
                </div>
                <div>
                  <p className="eyebrow">Patient 360</p>
                  <h3>{getPatientDisplayName(selectedPatient)}</h3>
                  <div className="patient-detail-meta">
                    <span>{selectedPatient.patientId}</span>
                    <span>{selectedPatient360.patientType}</span>
                    <span>{getAge(selectedPatient.dateOfBirth)} yrs</span>
                    <span>{selectedPatient.phone || 'No phone recorded'}</span>
                    <span>{selectedPatient.email || 'No email recorded'}</span>
                    <span>{selectedPatient.preferredBranchId ? branchMap.get(selectedPatient.preferredBranchId)?.name ?? 'Unknown branch' : 'No preferred branch'}</span>
                    <span>{selectedPatient.authUserId ? 'Portal Connected' : 'Portal Not Connected'}</span>
                    <span className={`status-badge status-${selectedPatient.status}`}>
                      {selectedPatient.status === 'active' ? 'Active Patient' : 'Inactive Patient'}
                    </span>
                  </div>
                </div>
              </div>
              <button type="button" className="icon-button" aria-label="Close patient details" onClick={closePatient360}>
                <ChevronRight size={16} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>

            <div className="patient-360-context">
              <div>
                <span>Next appointment</span>
                <strong>{selectedPatient360.nextAppointment ? `${formatDisplayDate(selectedPatient360.nextAppointment.date)} - ${formatDisplayTime(selectedPatient360.nextAppointment.startTime)}` : 'No upcoming visit'}</strong>
                <small>{selectedPatient360.nextAppointment ? serviceMap.get(selectedPatient360.nextAppointment.serviceId)?.name ?? 'Service not found' : 'Ready for booking'}</small>
              </div>
              <div>
                <span>Last visit</span>
                <strong>{selectedPatient360.lastVisit ? formatDisplayDate(selectedPatient360.lastVisit.date) : 'No previous visit'}</strong>
                <small>{selectedPatient360.lastVisit?.providerId ? selectedPatient360.providerHistory[0]?.name ?? 'Dentist not recorded' : 'Dentist not recorded'}</small>
              </div>
              <div>
                <span>Outstanding balance</span>
                <strong>{selectedPatient360.billing.outstandingBalanceCents > 0 ? formatCurrency(selectedPatient360.billing.outstandingBalanceCents) : 'No balance'}</strong>
                <small>{selectedPatient360.invoices.length} invoice{selectedPatient360.invoices.length === 1 ? '' : 's'}</small>
              </div>
              <div>
                <span>Recent dentist</span>
                <strong>{selectedPatient360.providerHistory[0]?.name ?? 'No dentist yet'}</strong>
                <small>{selectedPatient360.providerHistory.length > 1 ? `${selectedPatient360.providerHistory.length} providers in history` : 'Provider history'}</small>
              </div>
            </div>

            <div className="patient-workspace-tabs" aria-label="Patient workspace sections">
              {[
                { key: 'overview', label: 'Overview', show: true },
                { key: 'appointments', label: 'Appointments', show: canViewHistory },
                { key: 'treatments', label: 'Treatments', show: permissions.can('treatments.view') },
                { key: 'clinical', label: 'Clinical Records', show: permissions.can('clinical_records.view') },
                { key: 'prescriptions', label: 'Prescriptions', show: permissions.can('prescriptions.view') },
                { key: 'billing', label: 'Billing & Payments', show: canViewBilling },
                { key: 'documents', label: 'Documents', show: canViewDocuments },
                { key: 'communications', label: 'Communications', show: true },
                { key: 'activity', label: 'Activity', show: canViewHistory },
              ].filter((tab) => tab.show).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={activeDetailTab === tab.key ? 'is-active' : ''}
                  onClick={() => setActiveDetailTab(tab.key as PatientDetailTab)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="patient-detail-body patient-workspace-body">
              {activeDetailTab === 'overview' && (
                <>
              <div className="detail-section">
                <div className="detail-section-header">
                  <h4>Profile</h4>
                </div>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span>Contact</span>
                    <strong>{selectedPatient.phone || 'No phone recorded'}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Email</span>
                    <strong>{selectedPatient.email || 'No email recorded'}</strong>
                  </div>
                  <div className="detail-item detail-item-wide">
                    <span>Address</span>
                    <strong>{selectedPatient.address || 'No address recorded'}</strong>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <div className="detail-section-header">
                  <h4>Overview</h4>
                </div>
                <div className="detail-grid detail-grid-mini">
                  <div className="detail-item">
                    <span>Last visit</span>
                    <strong>{selectedPatient360.lastVisit ? formatDisplayDate(selectedPatient360.lastVisit.date) : 'No previous visit'}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Upcoming</span>
                    <strong>{selectedPatient360.nextAppointment ? `${formatDisplayDate(selectedPatient360.nextAppointment.date)} - ${formatDisplayTime(selectedPatient360.nextAppointment.startTime)}` : 'No upcoming visit'}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Completed</span>
                    <strong>{selectedPatient360.appointmentStats.completed}</strong>
                  </div>
                  <div className="detail-item">
                    <span>No Shows</span>
                    <strong>{selectedPatient360.appointmentStats.noShow}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Cancelled</span>
                    <strong>{selectedPatient360.appointmentStats.cancelled}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Treatments</span>
                    <strong>{selectedPatient360.treatments.length}</strong>
                  </div>
                </div>
              </div>

              <div className="patient-360-split">
                <div className="detail-section">
                  <div className="detail-section-header">
                    <h4>Clinical alerts</h4>
                  </div>
                  <div className="patient-alert-list">
                    {selectedPatient.allergies ? <span>Allergy: {selectedPatient.allergies}</span> : <span>No allergies reported</span>}
                    {selectedPatient.medicalConditions ? <span>Medical conditions recorded</span> : <span>No medical conditions reported</span>}
                    {selectedPatient.currentMedications ? <span>Current medications recorded</span> : <span>No current medications recorded</span>}
                  </div>
                </div>

                <div className="detail-section">
                  <div className="detail-section-header">
                    <h4>Branch & dentist history</h4>
                  </div>
                  <div className="patient-alert-list">
                    <span>{selectedPatient360.branchHistory.map((branch) => branch.name).join(', ') || 'No branch activity yet'}</span>
                    <span>{selectedPatient360.providerHistory.map((provider) => provider.name).slice(0, 4).join(', ') || 'No provider history yet'}</span>
                  </div>
                </div>
              </div>

              {(selectedPatient360.legacy.isHistorical || selectedPatient360.duplicateCandidates.length > 0) && (
                <div className="detail-section">
                  <div className="detail-section-header">
                    <h4>Record quality</h4>
                  </div>
                  <div className="patient-alert-list">
                    {selectedPatient360.legacy.isHistorical && (
                      <span>Historical record{selectedPatient360.legacy.importBatchId ? ` from batch ${selectedPatient360.legacy.importBatchId}` : ''}{selectedPatient360.legacy.importSourceRow ? `, row ${selectedPatient360.legacy.importSourceRow}` : ''}</span>
                    )}
                    {selectedPatient360.legacy.originalImportedName && <span>Original imported name: {selectedPatient360.legacy.originalImportedName}</span>}
                    {selectedPatient360.duplicateCandidates.length > 0 && <span>{selectedPatient360.duplicateCandidates.length} possible duplicate match{selectedPatient360.duplicateCandidates.length === 1 ? '' : 'es'} found. Review only; no automatic merge.</span>}
                  </div>
                </div>
              )}

              <div className="detail-section">
                <div className="detail-section-header">
                  <h4>Clinical details</h4>
                </div>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span>Emergency contact</span>
                    <strong>{selectedPatient.emergencyContact || 'Not provided'}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Emergency phone</span>
                    <strong>{selectedPatient.emergencyContactPhone || 'Not provided'}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Allergies</span>
                    <strong>{selectedPatient.allergies || 'None reported'}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Medical conditions</span>
                    <strong>{selectedPatient.medicalConditions || 'None reported'}</strong>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <div className="detail-section-header">
                  <h4>Recent activity</h4>
                </div>
                <ul className="patient-timeline">
                  {selectedPatient360.activities.length ? selectedPatient360.activities.slice(0, 6).map((item) => (
                      <li key={item.id}>
                        <span className="timeline-dot" />
                        <div>
                          <strong>{item.label}</strong>
                          <small>{formatDisplayDate(item.date)} - {item.module}{item.actor ? ` - ${item.actor}` : ''}</small>
                          <p>{item.description}</p>
                        </div>
                      </li>
                    )) : <li className="timeline-empty">No recent activity recorded.</li>}
                </ul>
              </div>
                </>
              )}

              {activeDetailTab === 'appointments' && (
                <div className="detail-section">
                  <div className="detail-section-header">
                    <h4>Appointments</h4>
                  </div>
                  <div className="detail-grid detail-grid-mini">
                    <div className="detail-item"><span>Total</span><strong>{selectedPatient360.appointmentStats.total}</strong></div>
                    <div className="detail-item"><span>Upcoming</span><strong>{selectedPatient360.appointmentStats.upcoming}</strong></div>
                    <div className="detail-item"><span>Completed</span><strong>{selectedPatient360.appointmentStats.completed}</strong></div>
                    <div className="detail-item"><span>Cancelled</span><strong>{selectedPatient360.appointmentStats.cancelled}</strong></div>
                    <div className="detail-item"><span>No Show</span><strong>{selectedPatient360.appointmentStats.noShow}</strong></div>
                    <div className="detail-item"><span>Rescheduled</span><strong>{selectedPatient360.appointmentStats.rescheduled}</strong></div>
                  </div>
                  {selectedPatient360.appointments.length ? (
                    <div className="workspace-list">
                      {selectedPatient360.appointments.map((appointment) => (
                          <div key={appointment.id} className="workspace-row">
                            <div>
                              <strong>{formatDisplayDate(appointment.date)} - {formatDisplayTime(appointment.startTime)}</strong>
                              <span>{serviceMap.get(appointment.serviceId)?.name ?? 'Service not found'} - {appointment.branchId ? branchMap.get(appointment.branchId)?.name ?? 'Unknown branch' : 'No branch recorded'}</span>
                              <small>
                                {appointment.providerId ? providerMap.get(appointment.providerId)?.displayName ?? 'Dentist not found' : 'No dentist assigned'} - {(appointment.bookingSource ?? 'staff_entry').replaceAll('_', ' ')}
                                {(appointment.depositStatus && appointment.depositStatus !== 'not_required') ? ` - Deposit ${appointment.depositStatus.replaceAll('_', ' ')}` : ''}
                              </small>
                            </div>
                            <span className={`status-badge status-${appointment.status}`}>{appointment.status.replaceAll('_', ' ')}</span>
                          </div>
                        ))}
                    </div>
                  ) : <div className="empty-state-panel">No appointment history recorded.</div>}
                </div>
              )}

              {activeDetailTab === 'treatments' && (
                <div className="detail-section">
                  <div className="detail-section-header">
                    <h4>Treatment history</h4>
                  </div>
                  {selectedPatient360.treatments.length ? (
                    <div className="workspace-list">
                      {selectedPatient360.treatments.map((treatment) => (
                        <div key={treatment.id} className="workspace-row">
                          <div>
                            <strong>{serviceMap.get(treatment.serviceId)?.name ?? 'Service'}</strong>
                            <span>{formatDisplayDate(treatment.treatmentDate)} - {treatment.providerNameSnapshot || treatment.performedBy}</span>
                            <small>
                              {treatment.branchId ? branchMap.get(treatment.branchId)?.name ?? 'Unknown branch' : 'No branch recorded'}
                              {treatment.toothNumber ? ` - Tooth ${treatment.toothNumber}` : ''}
                              {treatment.dentalRecordId ? ` - Visit ${treatment.dentalRecordId}` : ''}
                              {` - Snapshot ${new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(treatment.priceSnapshotCents / 100)}`}
                            </small>
                          </div>
                          <span className={`status-badge status-${treatment.status}`}>{treatment.status.replaceAll('_', ' ')}</span>
                        </div>
                      ))}
                    </div>
                  ) : <div className="empty-state-panel">No treatment history recorded.</div>}
                </div>
              )}

              {activeDetailTab === 'clinical' && (
                <div className="detail-section">
                  <div className="detail-section-header">
                    <h4>Clinical records</h4>
                  </div>
                  {selectedPatient360.clinicalVisits.length ? (
                    <div className="workspace-list">
                      {selectedPatient360.clinicalVisits.map((record) => {
                        const visitTreatments = selectedPatient360.treatments.filter((treatment) => treatment.dentalRecordId === record.id)
                        const visitPrescriptions = selectedPatient360.prescriptions.filter((prescription) => prescription.dentalRecordId === record.id)
                        return (
                          <div key={record.id} className="workspace-row">
                            <div>
                              <strong>{formatDisplayDate(record.recordDate)} - {record.chiefComplaint || 'Clinical visit'}</strong>
                              <span>
                                {record.providerNameSnapshot || (record.providerId ? providerMap.get(record.providerId)?.displayName : '') || record.historicalProviderText || record.createdBy}
                                {' - '}
                                {record.branchId ? branchMap.get(record.branchId)?.name ?? 'Unknown branch' : 'No branch recorded'}
                              </span>
                              <small>
                                {record.appointmentNumber || 'Walk-in or historical record'} - {visitTreatments.length} treatment{visitTreatments.length === 1 ? '' : 's'} - {visitPrescriptions.length} prescription{visitPrescriptions.length === 1 ? '' : 's'}
                                {record.followUpRequired ? ` - Follow up ${formatDisplayDate(record.followUpDate)}` : ''}
                              </small>
                              <p>{record.assessment || record.clinicalFindings || record.patientVisibleSummary || 'Draft documentation in progress.'}</p>
                            </div>
                            <span className={`status-badge status-${record.status}`}>{record.status.replaceAll('_', ' ')}</span>
                          </div>
                        )
                      })}
                    </div>
                  ) : <div className="empty-state-panel">No clinical visit records documented.</div>}
                </div>
              )}

              {activeDetailTab === 'billing' && (
                <div className="detail-section">
                  <div className="detail-section-header">
                    <h4>Billing & payments</h4>
                  </div>
                  <div className="detail-grid detail-grid-mini">
                    <div className="detail-item"><span>Total billed</span><strong>{formatCurrency(selectedPatient360.billing.totalBilledCents)}</strong></div>
                    <div className="detail-item"><span>Total paid</span><strong>{formatCurrency(selectedPatient360.billing.totalPaidCents)}</strong></div>
                    <div className="detail-item"><span>Refunds</span><strong>{formatCurrency(selectedPatient360.billing.totalRefundedCents)}</strong></div>
                    <div className="detail-item"><span>Outstanding</span><strong>{selectedPatient360.billing.outstandingBalanceCents > 0 ? formatCurrency(selectedPatient360.billing.outstandingBalanceCents) : 'No outstanding balance'}</strong></div>
                    <div className="detail-item"><span>Invoices</span><strong>{selectedPatient360.invoices.length}</strong></div>
                    <div className="detail-item"><span>Receipts</span><strong>{selectedPatient360.receipts.length}</strong></div>
                  </div>
                  <div className="workspace-list">
                    {selectedPatient360.invoices.slice(0, 5).map((invoice) => (
                      <div key={invoice.id} className="workspace-row">
                        <div>
                          <strong>{invoice.invoiceNumber}</strong>
                          <span>{formatDisplayDate(invoice.invoiceDate)} - {invoice.branchId ? branchMap.get(invoice.branchId)?.name ?? 'Unknown branch' : 'No branch recorded'} - {invoice.status.replaceAll('_', ' ')}</span>
                          <small>{invoice.items.length} line item{invoice.items.length === 1 ? '' : 's'} - paid {formatCurrency(invoice.amountPaidCents)}</small>
                        </div>
                        <strong>{formatCurrency(invoice.balanceCents)}</strong>
                      </div>
                    ))}
                    {selectedPatient360.invoices.length === 0 && (
                      <div className="empty-state-panel">No invoices created for this patient.</div>
                    )}
                  </div>
                  <div className="workspace-list">
                    {selectedPatient360.ledger.slice(0, 6).map((entry) => (
                      <div key={`${entry.kind}-${entry.id}`} className="workspace-row">
                        <div>
                          <strong>{entry.label}</strong>
                          <span>{formatDisplayDate(entry.date)}</span>
                        </div>
                        <strong>{formatCurrency(entry.runningBalanceCents)}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="workspace-list">
                    {selectedPatient360.payments.slice(0, 5).map((payment) => (
                      <div key={payment.id} className="workspace-row">
                        <div>
                          <strong>{payment.paymentNumber}</strong>
                          <span>{formatDisplayDate(payment.date)} - {payment.paymentMethod.replaceAll('_', ' ')} - {payment.status.replaceAll('_', ' ')}</span>
                          <small>{payment.referenceNumber || payment.source.replaceAll('_', ' ')}</small>
                        </div>
                        <strong>{formatCurrency(payment.amountCents)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeDetailTab === 'documents' && (
                <div className="detail-section">
                  <div className="detail-section-header">
                    <h4>Documents</h4>
                  </div>
                  {selectedPatient360.documents.length || selectedPatient360.dentalImages.length ? (
                    <div className="workspace-list">
                      {[...selectedPatient360.documents, ...selectedPatient360.dentalImages].map((document) => (
                        <div key={document.id} className="workspace-row">
                          <div>
                            <strong>{document.fileName}</strong>
                            <span>{formatDisplayDate(document.uploadDate)} - {document.uploadedBy}</span>
                            <small>
                              {'category' in document ? document.category.replaceAll('_', ' ') : document.kind.replaceAll('_', ' ')}
                              {'clinicalVisitId' in document && document.clinicalVisitId ? ` - Visit ${document.clinicalVisitId}` : ''}
                              {'treatmentId' in document && document.treatmentId ? ` - Treatment ${document.treatmentId}` : ''}
                            </small>
                          </div>
                          <FileText size={16} />
                        </div>
                      ))}
                    </div>
                  ) : <div className="empty-state-panel">No patient documents recorded.</div>}
                </div>
              )}

              {activeDetailTab === 'prescriptions' && (
                <div className="detail-section">
                  <div className="detail-section-header">
                    <h4>Prescriptions</h4>
                  </div>
                  {selectedPatient360.prescriptions.length ? (
                    <div className="workspace-list">
                      {selectedPatient360.prescriptions.map((prescription) => (
                        <div key={prescription.id} className="workspace-row">
                          <div>
                            <strong>{prescription.medication}</strong>
                            <span>{formatDisplayDate(prescription.prescriptionDate)} - {prescription.providerNameSnapshot || prescription.prescribedBy}</span>
                            <small>
                              {prescription.branchId ? branchMap.get(prescription.branchId)?.name ?? 'Unknown branch' : 'No branch recorded'}
                              {prescription.dentalRecordId ? ` - Visit ${prescription.dentalRecordId}` : ''}
                              {` - ${prescription.items.length} medication item${prescription.items.length === 1 ? '' : 's'}`}
                            </small>
                          </div>
                          <span className={`status-badge status-${prescription.status}`}>{prescription.status}</span>
                        </div>
                      ))}
                    </div>
                  ) : <div className="empty-state-panel">No prescriptions recorded.</div>}
                </div>
              )}
              {activeDetailTab === 'communications' && (
                <div className="detail-section">
                  <div className="detail-section-header">
                    <h4>Communications</h4>
                  </div>
                  <CommunicationPreferencesPanel
                    patient={selectedPatient}
                    actor="clinic-user"
                    canEdit={canEditPatients || permissions.can('notifications.send')}
                  />
                  <CommunicationHistoryPanel logs={getCommunicationLogsByPatient(selectedPatient.patientId)} />
                </div>
              )}
              {activeDetailTab === 'activity' && (
                <div className="detail-section">
                  <div className="detail-section-header">
                    <h4>Activity</h4>
                  </div>
                  <ul className="patient-timeline">
                    {selectedPatient360.activities.slice(0, 30).map((item) => (
                        <li key={item.id}>
                          <span className="timeline-dot" />
                          <div>
                            <strong>{item.label}</strong>
                            <small>{formatDisplayDate(item.date)} - {item.module}{item.actor ? ` - ${item.actor}` : ''}</small>
                            <p>{item.description}</p>
                          </div>
                        </li>
                      ))}
                    {selectedPatient360.activities.length === 0 && (
                      <li className="timeline-empty">No recent activity recorded.</li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            <div className="patient-detail-actions">
              {canEditPatients && (
                <button type="button" className="btn btn-secondary btn-md" onClick={() => handleEditPatient(selectedPatient)}>
                  Edit basic information
                </button>
              )}
              {canCreateClinical && (
                <button type="button" className="btn btn-secondary btn-md" onClick={() => handleAddDentalRecord(selectedPatient)}>
                  Add record
                </button>
              )}
              <button type="button" className="btn btn-primary btn-md" onClick={() => navigate('/app/appointments')}>
                Book appointment
                <ArrowRight size={16} />
              </button>
            </div>
          </aside>
        </div>
      )}
    </section>
  )
}

