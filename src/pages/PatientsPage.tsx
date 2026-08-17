import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarClock, ChevronRight, Filter, Mail, Phone, Plus, Search, Stethoscope, Users } from 'lucide-react'
import { Select } from '../components/ui/Select'
import { DentalRecordFormModal } from '../features/dentalRecords/DentalRecordFormModal'
import { createDentalRecord, getPatientName } from '../features/dentalRecords/dentalRecordStore'
import type { DentalRecordFormValues } from '../features/dentalRecords/dentalRecordTypes'
import { PatientFormModal } from '../features/patients/PatientFormModal'
import type { Patient, PatientFormMode, PatientFormValues } from '../features/patients/patientTypes'
import {
  createPatient,
  deletePatient,
  filterPatients,
  getStoredPatients,
  searchPatients,
  updatePatient,
} from '../features/patients/patientStore'
import { getAppointmentsByPatient, getStoredAppointments } from '../features/appointments/appointmentStore'
import { getTreatmentsByPatient } from '../features/treatments/treatmentStore'
import { getStoredServices } from '../features/services/serviceStore'

function getInitials(firstName: string, lastName: string) {
  return `${firstName?.charAt(0) ?? ''}${lastName?.charAt(0) ?? ''}`.toUpperCase()
}

function getAge(dateOfBirth: string) {
  if (!dateOfBirth) return '—'

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
  if (!value) return '—'

  const [hours, minutes] = value.split(':').map(Number)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

export function PatientsPage() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<Patient[]>(() => getStoredPatients())
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [activityFilter, setActivityFilter] = useState('all')
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [formMode, setFormMode] = useState<PatientFormMode>('add')
  const [formValues, setFormValues] = useState<PatientFormValues>({
    firstName: '',
    middleName: '',
    lastName: '',
    dateOfBirth: '',
    sex: 'female',
    phone: '',
    email: '',
    address: '',
    emergencyContact: '',
    emergencyContactPhone: '',
    registrationDate: new Date().toISOString().split('T')[0],
    status: 'active',
    allergies: '',
    medicalConditions: '',
    currentMedications: '',
    previousSurgeries: '',
    medicalNotes: '',
  })
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [recordFormError, setRecordFormError] = useState<string | null>(null)
  const [recordFormValues, setRecordFormValues] = useState<DentalRecordFormValues>({
    patientId: '',
    recordDate: new Date().toISOString().split('T')[0],
    visitType: 'consultation',
    chiefComplaint: '',
    diagnosis: '',
    treatmentPlan: '',
    findings: '',
    treatmentNotes: '',
    followUpDate: '',
    status: 'draft',
    relatedAppointmentId: '',
    createdBy: 'Dr. Santos',
  })

  const appointments = useMemo(() => getStoredAppointments(), [patients])
  const services = useMemo(() => getStoredServices(), [patients])
  const serviceMap = useMemo(() => new Map(services.map((service) => [service.id, service])), [services])

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
  }, [activityFilter, patients, searchQuery, statusFilter])

  function handleAddNew() {
    setSelectedPatient(null)
    setFormMode('add')
    setFormValues({
      firstName: '',
      middleName: '',
      lastName: '',
      dateOfBirth: '',
      sex: 'female',
      phone: '',
      email: '',
      address: '',
      emergencyContact: '',
      emergencyContactPhone: '',
      registrationDate: new Date().toISOString().split('T')[0],
      status: 'active',
      allergies: '',
      medicalConditions: '',
      currentMedications: '',
      previousSurgeries: '',
      medicalNotes: '',
    })
    setFormError(null)
    setShowForm(true)
  }

  function handleEditPatient(patient: Patient) {
    setSelectedPatient(patient)
    setFormMode('edit')
    setFormValues({
      firstName: patient.firstName,
      middleName: patient.middleName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth,
      sex: patient.sex,
      phone: patient.phone,
      email: patient.email,
      address: patient.address,
      emergencyContact: patient.emergencyContact,
      emergencyContactPhone: patient.emergencyContactPhone,
      registrationDate: patient.registrationDate,
      status: patient.status,
      allergies: patient.allergies,
      medicalConditions: patient.medicalConditions,
      currentMedications: patient.currentMedications,
      previousSurgeries: patient.previousSurgeries,
      medicalNotes: patient.medicalNotes,
    })
    setFormError(null)
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
    if (!formValues.emergencyContact.trim()) {
      setFormError('Emergency contact is required')
      return
    }
    if (!formValues.emergencyContactPhone.trim()) {
      setFormError('Emergency contact phone is required')
      return
    }
    if (!formValues.address.trim()) {
      setFormError('Address is required')
      return
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
      diagnosis: '',
      treatmentPlan: '',
      findings: '',
      treatmentNotes: '',
      followUpDate: '',
      status: 'draft',
      relatedAppointmentId: '',
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

    if (!recordFormValues.diagnosis.trim()) {
      setRecordFormError('Diagnosis is required')
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
          <p>Patient records and clinical overview</p>
        </div>
        <button type="button" className="btn btn-primary btn-md" onClick={handleAddNew}>
          <Plus size={16} />
          <span>Add patient</span>
        </button>
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
                    <strong>{patient.firstName} {patient.middleName ? `${patient.middleName} ` : ''}{patient.lastName}</strong>
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
                    <span>Last appointment</span>
                    <strong>{lastAppointment ? formatDisplayDate(lastAppointment.date) : 'No visits yet'}</strong>
                  </div>
                  <div>
                    <span>Upcoming</span>
                    <strong>{nextAppointment ? `${formatDisplayDate(nextAppointment.date)} • ${formatDisplayTime(nextAppointment.startTime)}` : 'No upcoming visits'}</strong>
                  </div>
                </div>

                <div className="patient-card-actions">
                  <button type="button" className="text-button" onClick={(event) => { event.stopPropagation(); setSelectedPatient(patient) }}>
                    View
                  </button>
                  <button type="button" className="text-button" onClick={(event) => { event.stopPropagation(); handleEditPatient(patient) }}>
                    Edit
                  </button>
                  <button type="button" className="text-button" onClick={(event) => { event.stopPropagation(); handleDeletePatient(patient) }}>
                    Delete
                  </button>
                  <button type="button" className="text-button" onClick={(event) => { event.stopPropagation(); navigate('/app/appointments') }}>
                    Appointments
                  </button>
                  <button type="button" className="text-button" onClick={(event) => { event.stopPropagation(); navigate('/app/treatments') }}>
                    Treatments
                  </button>
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
          <aside className="patient-detail-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="patient-detail-header">
              <div className="patient-detail-heading">
                <div className="patient-avatar patient-avatar-large">{getInitials(selectedPatient.firstName, selectedPatient.lastName)}</div>
                <div>
                  <p className="eyebrow">Patient profile</p>
                  <h3>{selectedPatient.firstName} {selectedPatient.middleName ? `${selectedPatient.middleName} ` : ''}{selectedPatient.lastName}</h3>
                  <div className="patient-detail-meta">
                    <span>{selectedPatient.patientId}</span>
                    <span>{getAge(selectedPatient.dateOfBirth)} yrs</span>
                    <span className={`status-badge status-${selectedPatient.status}`}>
                      {selectedPatient.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>
              <button type="button" className="icon-button" aria-label="Close patient details" onClick={() => setSelectedPatient(null)}>
                <ChevronRight size={16} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>

            <div className="patient-detail-body">
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
                      return nextVisit ? `${formatDisplayDate(nextVisit.date)} • ${formatDisplayTime(nextVisit.startTime)}` : 'No upcoming visit'
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
                        detail: `${formatDisplayDate(appointment.date)} • ${formatDisplayTime(appointment.startTime)}`,
                      })),
                      ...getTreatmentsByPatient(selectedPatient.patientId).map((treatment) => ({
                        type: 'treatment',
                        date: treatment.treatmentDate,
                        label: 'Treatment recorded',
                        detail: `${serviceMap.get(treatment.serviceId)?.name ?? 'Service'} • ${treatment.status}`,
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
            </div>

            <div className="patient-detail-actions">
              <button type="button" className="btn btn-secondary btn-md" onClick={() => handleEditPatient(selectedPatient)}>
                Edit
              </button>
              <button type="button" className="btn btn-secondary btn-md" onClick={() => handleAddDentalRecord(selectedPatient)}>
                Add record
              </button>
              <button type="button" className="btn btn-primary btn-md" onClick={() => navigate('/app/appointments')}>
                Appointments
                <ArrowRight size={16} />
              </button>
            </div>
          </aside>
        </div>
      )}
    </section>
  )
}

