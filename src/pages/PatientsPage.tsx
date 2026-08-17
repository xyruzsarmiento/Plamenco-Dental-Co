import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarClock, ChevronRight, FileText, Filter, Import, Mail, Phone, Plus, Search, Stethoscope, Users } from 'lucide-react'
import { Select } from '../components/ui/Select'
import { usePermissions } from '../features/auth/permissions'
import { DentalRecordFormModal } from '../features/dentalRecords/DentalRecordFormModal'
import { createDentalRecord, getDentalRecordsByPatientId, getPatientName } from '../features/dentalRecords/dentalRecordStore'
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
import { getAppointmentsByPatient, getStoredAppointments } from '../features/appointments/appointmentStore'
import { getTreatmentsByPatient } from '../features/treatments/treatmentStore'
import { getStoredServices } from '../features/services/serviceStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { getDocumentsByPatient, getDentalImagesByPatient } from '../features/documents/documentStore'
import { getInvoicesByPatient, getOutstandingBalanceByPatient, getPaymentsByPatient } from '../features/billing/billingStore'
import { CommunicationHistoryPanel } from '../features/communications/CommunicationHistoryPanel'
import { CommunicationPreferencesPanel } from '../features/communications/CommunicationPreferencesPanel'
import { getCommunicationLogsByPatient } from '../features/communications/communicationStore'
import { getPrescriptionsByPatient } from '../features/prescriptions/prescriptionStore'

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

  const appointments = useMemo(() => getStoredAppointments(), [patients])
  const services = useMemo(() => getStoredServices(), [patients])
  const branches = useMemo(() => getStoredBranches(), [patients])
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches])
  const serviceMap = useMemo(() => new Map(services.map((service) => [service.id, service])), [services])
  const canCreatePatients = permissions.can('patients.create')
  const canEditPatients = permissions.can('patients.edit_basic')
  const canImportPatients = permissions.can('patients.import')
  const canViewHistory = permissions.can('patients.view_history')
  const canViewClinical = permissions.canAny(['clinical_records.view', 'treatments.view'])
  const canCreateClinical = permissions.can('clinical_records.create')
  const canViewBilling = permissions.canAny(['billing.view', 'payments.view'])
  const canViewDocuments = permissions.can('documents.view')

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
              <article key={patient.id} className="patient-directory-card" onClick={() => setSelectedPatient(patient)}>
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
                  <button type="button" className="text-button" onClick={(event) => { event.stopPropagation(); setSelectedPatient(patient) }}>
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
              setSelectedPatient(patient)
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

      {selectedPatient && !showForm && !showRecordForm && (
        <div className="patient-detail-backdrop" onClick={() => setSelectedPatient(null)}>
          <aside className="patient-detail-drawer patient-workspace-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="patient-detail-header">
              <div className="patient-detail-heading">
                <div className="patient-avatar patient-avatar-large">{getInitials(selectedPatient.firstName, selectedPatient.lastName)}</div>
                <div>
                  <p className="eyebrow">Patient workspace</p>
                  <h3>{getPatientDisplayName(selectedPatient)}</h3>
                  <div className="patient-detail-meta">
                    <span>{selectedPatient.patientId}</span>
                    <span>{getAge(selectedPatient.dateOfBirth)} yrs</span>
                    <span>{selectedPatient.phone || 'No phone recorded'}</span>
                    <span>{selectedPatient.preferredBranchId ? branchMap.get(selectedPatient.preferredBranchId)?.name ?? 'Unknown branch' : 'No preferred branch'}</span>
                    <span>{selectedPatient.authUserId ? 'Portal Connected' : 'Portal Not Connected'}</span>
                    <span className={`status-badge status-${selectedPatient.status}`}>
                      {selectedPatient.status === 'active' ? 'Active Patient' : 'Inactive Patient'}
                    </span>
                  </div>
                </div>
              </div>
              <button type="button" className="icon-button" aria-label="Close patient details" onClick={() => setSelectedPatient(null)}>
                <ChevronRight size={16} style={{ transform: 'rotate(45deg)' }} />
              </button>
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
                    <strong>{formatDisplayDate(getAppointmentsByPatient(selectedPatient.patientId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date)}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Upcoming</span>
                    <strong>{(() => {
                      const nextVisit = [...getAppointmentsByPatient(selectedPatient.patientId)]
                        .filter((appointment) => appointment.date >= new Date().toISOString().slice(0, 10) && !['cancelled', 'no_show', 'completed'].includes(appointment.status))
                        .sort((a, b) => a.date.localeCompare(b.date))[0]
                      return nextVisit ? `${formatDisplayDate(nextVisit.date)} - ${formatDisplayTime(nextVisit.startTime)}` : 'No upcoming visit'
                    })()}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Appointments</span>
                    <strong>{getAppointmentsByPatient(selectedPatient.patientId).length}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Treatments</span>
                    <strong>{getTreatmentsByPatient(selectedPatient.patientId).length}</strong>
                  </div>
                </div>
              </div>

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
                  {(() => {
                    const timeline = [
                      ...getAppointmentsByPatient(selectedPatient.patientId).map((appointment) => ({
                        type: 'appointment',
                        date: appointment.date,
                        label: appointment.status === 'completed' ? 'Appointment completed' : appointment.status === 'pending' ? 'Appointment scheduled' : 'Appointment updated',
                        detail: `${formatDisplayDate(appointment.date)} - ${formatDisplayTime(appointment.startTime)}`,
                      })),
                      ...getTreatmentsByPatient(selectedPatient.patientId).map((treatment) => ({
                        type: 'treatment',
                        date: treatment.treatmentDate,
                        label: 'Treatment recorded',
                        detail: `${serviceMap.get(treatment.serviceId)?.name ?? 'Service'} - ${treatment.status}`,
                      })),
                    ]
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .slice(0, 5)

                    return timeline.length ? timeline.map((item, index) => (
                      <li key={`${item.type}-${item.date}-${index}`}>
                        <span className="timeline-dot" />
                        <div>
                          <strong>{item.label}</strong>
                          <small>{item.detail}</small>
                        </div>
                      </li>
                    )) : <li className="timeline-empty">No recent activity recorded.</li>
                  })()}
                </ul>
              </div>
                </>
              )}

              {activeDetailTab === 'appointments' && (
                <div className="detail-section">
                  <div className="detail-section-header">
                    <h4>Appointments</h4>
                  </div>
                  {getAppointmentsByPatient(selectedPatient.patientId).length ? (
                    <div className="workspace-list">
                      {getAppointmentsByPatient(selectedPatient.patientId)
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((appointment) => (
                          <div key={appointment.id} className="workspace-row">
                            <div>
                              <strong>{formatDisplayDate(appointment.date)} - {formatDisplayTime(appointment.startTime)}</strong>
                              <span>{serviceMap.get(appointment.serviceId)?.name ?? 'Service not found'}</span>
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
                  {getTreatmentsByPatient(selectedPatient.patientId).length ? (
                    <div className="workspace-list">
                      {getTreatmentsByPatient(selectedPatient.patientId).map((treatment) => (
                        <div key={treatment.id} className="workspace-row">
                          <div>
                            <strong>{serviceMap.get(treatment.serviceId)?.name ?? 'Service'}</strong>
                            <span>{formatDisplayDate(treatment.treatmentDate)} - {treatment.providerNameSnapshot || treatment.performedBy}</span>
                            <small>{treatment.description || 'No description'} - {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(treatment.priceSnapshotCents / 100)}</small>
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
                  {getDentalRecordsByPatientId(selectedPatient.patientId).length ? (
                    <div className="workspace-list">
                      {getDentalRecordsByPatientId(selectedPatient.patientId).map((record) => (
                        <div key={record.id} className="workspace-row">
                          <div>
                            <strong>{formatDisplayDate(record.recordDate)} - {record.chiefComplaint || 'Clinical visit'}</strong>
                            <span>{record.providerNameSnapshot || record.createdBy} - {record.appointmentNumber || 'Walk-in or historical record'}</span>
                            <small>{record.assessment || record.clinicalFindings || 'Draft documentation in progress.'}</small>
                          </div>
                          <span className={`status-badge status-${record.status}`}>{record.status.replaceAll('_', ' ')}</span>
                        </div>
                      ))}
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
                    <div className="detail-item"><span>Invoices</span><strong>{getInvoicesByPatient(selectedPatient.patientId).length}</strong></div>
                    <div className="detail-item"><span>Payments</span><strong>{getPaymentsByPatient(selectedPatient.patientId).length}</strong></div>
                    <div className="detail-item"><span>Outstanding</span><strong>{getOutstandingBalanceByPatient(selectedPatient.patientId) > 0 ? `PHP ${(getOutstandingBalanceByPatient(selectedPatient.patientId) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'No outstanding balance'}</strong></div>
                  </div>
                </div>
              )}

              {activeDetailTab === 'documents' && (
                <div className="detail-section">
                  <div className="detail-section-header">
                    <h4>Documents</h4>
                  </div>
                  {getDocumentsByPatient(selectedPatient.patientId).length || getDentalImagesByPatient(selectedPatient.patientId).length ? (
                    <div className="workspace-list">
                      {[...getDocumentsByPatient(selectedPatient.patientId), ...getDentalImagesByPatient(selectedPatient.patientId)].map((document) => (
                        <div key={document.id} className="workspace-row">
                          <div>
                            <strong>{document.fileName}</strong>
                            <span>{document.uploadDate} - {document.uploadedBy}</span>
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
                  {getPrescriptionsByPatient(selectedPatient.patientId).length ? (
                    <div className="workspace-list">
                      {getPrescriptionsByPatient(selectedPatient.patientId).map((prescription) => (
                        <div key={prescription.id} className="workspace-row">
                          <div>
                            <strong>{prescription.medication}</strong>
                            <span>{formatDisplayDate(prescription.prescriptionDate)} - {prescription.providerNameSnapshot || prescription.prescribedBy}</span>
                            <small>{prescription.items.length} medication item{prescription.items.length === 1 ? '' : 's'}</small>
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
                    {[...getAppointmentsByPatient(selectedPatient.patientId).map((appointment) => ({
                      type: 'appointment',
                      date: appointment.date,
                      label: appointment.status === 'completed' ? 'Appointment completed' : appointment.status === 'pending' ? 'Appointment scheduled' : 'Appointment updated',
                      detail: `${formatDisplayDate(appointment.date)} - ${formatDisplayTime(appointment.startTime)}`,
                    })), ...getTreatmentsByPatient(selectedPatient.patientId).map((treatment) => ({
                      type: 'treatment',
                      date: treatment.treatmentDate,
                      label: 'Treatment recorded',
                      detail: `${serviceMap.get(treatment.serviceId)?.name ?? 'Service'} - ${treatment.status}`,
                    }))]
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .slice(0, 10)
                      .map((item, index) => (
                        <li key={`${item.type}-${item.date}-${index}`}>
                          <span className="timeline-dot" />
                          <div>
                            <strong>{item.label}</strong>
                            <small>{item.detail}</small>
                          </div>
                        </li>
                      ))}
                    {getAppointmentsByPatient(selectedPatient.patientId).length === 0 && getTreatmentsByPatient(selectedPatient.patientId).length === 0 && (
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

