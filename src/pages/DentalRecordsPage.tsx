import { CalendarDays, ChevronRight, Clock3, FileText, Mail, Phone, Plus, Search, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { PageScaffold } from '../components/ui/PageScaffold'
import { DentalRecordFormModal } from '../features/dentalRecords/DentalRecordFormModal'
import {
  createDentalRecord,
  deleteDentalRecord,
  getDentalRecordsByPatientId,
  getPatientName,
  updateDentalRecord,
} from '../features/dentalRecords/dentalRecordStore'
import type { DentalRecord, DentalRecordFormValues } from '../features/dentalRecords/dentalRecordTypes'
import { getAppointmentsByPatient } from '../features/appointments/appointmentStore'
import { getStoredPatients } from '../features/patients/patientStore'
import { getTreatmentsByPatient } from '../features/treatments/treatmentStore'

const createEmptyRecordValues = (patientId: string): DentalRecordFormValues => ({
  patientId,
  recordDate: new Date().toISOString().slice(0, 10),
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
  lastUpdatedBy: 'Clinical team',
  createdBy: 'Clinical team',
})

function formatDate(value?: string) {
  if (!value) return 'Not scheduled'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not scheduled' : date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function DentalRecordsPage() {
  const patients = useMemo(() => [...getStoredPatients()].sort((a, b) => a.lastName.localeCompare(b.lastName)), [])
  const [patientSearch, setPatientSearch] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState<string>(patients[0]?.patientId ?? '')
  const [recordDraft, setRecordDraft] = useState<DentalRecordFormValues>(() => createEmptyRecordValues(patients[0]?.patientId ?? ''))
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [recordFormMode, setRecordFormMode] = useState<'add' | 'edit'>('add')
  const [recordError, setRecordError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<DentalRecord | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const filteredPatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase()
    if (!query) return patients

    return patients.filter((patient) => {
      const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase()
      return `${fullName} ${patient.patientId} ${patient.email}`.toLowerCase().includes(query)
    })
  }, [patientSearch, patients])

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.patientId === selectedPatientId) ?? filteredPatients[0] ?? null,
    [filteredPatients, patients, selectedPatientId],
  )

  const patientRecords = useMemo(
    () => (selectedPatient ? getDentalRecordsByPatientId(selectedPatient.patientId) : []),
    [selectedPatient],
  )

  const patientAppointments = useMemo(
    () => (selectedPatient ? getAppointmentsByPatient(selectedPatient.patientId).sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)) : []),
    [selectedPatient],
  )

  const patientTreatments = useMemo(
    () => (selectedPatient ? getTreatmentsByPatient(selectedPatient.patientId) : []),
    [selectedPatient],
  )

  const timeline = useMemo(() => {
    const recordEntries = patientRecords.map((record) => ({
      id: `record-${record.id}`,
      date: record.recordDate || record.createdAt,
      kind: 'record' as const,
      heading: record.chiefComplaint || 'Clinical record',
      summary: `${record.visitType.replace('_', ' ')} • ${record.diagnosis || 'General assessment'}`,
      description: record.treatmentNotes || record.findings || record.treatmentPlan || 'No detailed notes available.',
      status: record.status,
      provider: record.createdBy,
    }))

    const appointmentEntries = patientAppointments.map((appointment) => ({
      id: `appointment-${appointment.id}`,
      date: appointment.date,
      kind: 'appointment' as const,
      heading: appointment.serviceId || 'Appointment',
      summary: `${appointment.startTime} - ${appointment.endTime}`,
      description: appointment.notes || 'Routine visit',
      status: appointment.status,
      provider: 'Clinic scheduling',
    }))

    const treatmentEntries = patientTreatments.map((treatment) => ({
      id: `treatment-${treatment.id}`,
      date: treatment.treatmentDate,
      kind: 'treatment' as const,
      heading: treatment.description,
      summary: `Tooth ${treatment.toothNumber ?? 'N/A'} • ${treatment.status}`,
      description: treatment.notes || 'Treatment plan completed as documented.',
      status: treatment.status,
      provider: 'Treatment plan',
    }))

    return [...recordEntries, ...appointmentEntries, ...treatmentEntries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [patientAppointments, patientRecords, patientTreatments])

  const mostRecentVisit = useMemo(() => {
    const dates = [...patientRecords.map((record) => record.recordDate), ...patientAppointments.map((appointment) => appointment.date), ...patientTreatments.map((treatment) => treatment.treatmentDate)].filter(Boolean)
    if (!dates.length) return 'No visit recorded'
    const latest = dates.reduce((latestValue, current) => (current > latestValue ? current : latestValue), dates[0])
    return formatDate(latest)
  }, [patientAppointments, patientRecords, patientTreatments])

  const nextAppointment = patientAppointments.find((appointment) => appointment.status !== 'cancelled' && appointment.status !== 'no_show' && appointment.status !== 'completed')

  function openCreateRecord() {
    if (!selectedPatient) return
    setRecordFormMode('add')
    setRecordDraft(createEmptyRecordValues(selectedPatient.patientId))
    setRecordError(null)
    setSuccessMessage(null)
    setShowRecordForm(true)
  }

  function openEditRecord(record: DentalRecord) {
    if (!selectedPatient) return
    setRecordFormMode('edit')
    setRecordDraft({
      patientId: record.patientId,
      recordDate: record.recordDate,
      visitType: record.visitType,
      chiefComplaint: record.chiefComplaint,
      clinicalFindings: record.clinicalFindings,
      assessment: record.assessment,
      treatmentPerformed: record.treatmentPerformed,
      recommendations: record.recommendations,
      patientVisibleSummary: record.patientVisibleSummary,
      diagnosis: record.diagnosis,
      treatmentPlan: record.treatmentPlan,
      findings: record.findings,
      treatmentNotes: record.treatmentNotes,
      clinicalNotes: record.clinicalNotes,
      followUpRequired: record.followUpRequired,
      followUpDate: record.followUpDate,
      followUpNotes: record.followUpNotes,
      status: record.status,
      relatedAppointmentId: record.relatedAppointmentId ?? '',
      source: record.source,
      historicalProviderText: record.historicalProviderText,
      finalizedAt: record.finalizedAt,
      finalizedBy: record.finalizedBy,
      lastUpdatedBy: record.lastUpdatedBy,
      createdBy: record.createdBy,
    })
    setRecordError(null)
    setSuccessMessage(null)
    setShowRecordForm(true)
  }

  function handleSubmitRecord() {
    if (!selectedPatient) return
    if (!recordDraft.chiefComplaint.trim()) {
      setRecordError('Chief complaint is required.')
      return
    }
    if (!recordDraft.diagnosis.trim()) {
      setRecordError('Diagnosis is required.')
      return
    }

    setRecordError(null)
    setIsSubmitting(true)

    setTimeout(() => {
      if (recordFormMode === 'edit') {
        const target = patientRecords.find((entry) => entry.patientId === selectedPatient.patientId && entry.recordDate === recordDraft.recordDate)
        if (target) {
          updateDentalRecord(target.id, { ...recordDraft, patientId: selectedPatient.patientId })
        }
      } else {
        createDentalRecord({ ...recordDraft, patientId: selectedPatient.patientId })
      }
      setIsSubmitting(false)
      setSuccessMessage(recordFormMode === 'edit' ? 'Record updated successfully.' : 'Record created successfully.')
      setShowRecordForm(false)
      setSelectedRecord(null)
      setRecordDraft(createEmptyRecordValues(selectedPatient.patientId))
    }, 200)
  }

  function handleDeleteRecord(record: DentalRecord) {
    if (!window.confirm(`Delete this dental record for ${getPatientName(record.patientId)}?`)) {
      return
    }

    deleteDentalRecord(record.id)
    setSelectedRecord(null)
    setSuccessMessage('Dental record deleted.')
  }

  if (!selectedPatient) {
    return (
      <PageScaffold title="Dental Records" description="Clinical history and care notes for each patient.">
        <div className="records-page premium-records-page">
          <div className="records-toolbar">
            <Input value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="Search patient records" />
          </div>
          <div className="empty-state compact">
            <h2>No patient selected</h2>
            <p>Choose a patient to view their clinical timeline and visit history.</p>
          </div>
        </div>
      </PageScaffold>
    )
  }

  return (
    <PageScaffold title="Dental Records" description="Clinical history, visit notes, treatment follow-up, and patient care documentation.">
      <div className="records-page premium-records-page">
        <div className="dental-records-workspace">
          <aside className="dental-records-sidebar panel">
            <div className="sidebar-header">
              <div>
                <p className="eyebrow">Patient directory</p>
                <h3>Clinical records</h3>
              </div>
              <Button variant="secondary" size="sm" onClick={openCreateRecord} icon={<Plus size={14} />}>
                Add record
              </Button>
            </div>

            <label className="field search-field-inline">
              <span className="sr-only">Search patients</span>
              <Search size={14} />
              <input value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="Search patient..." />
            </label>

            <div className="patient-strip-list">
              {filteredPatients.map((patient) => (
                <button
                  type="button"
                  key={patient.id}
                  className={`patient-select-card ${selectedPatient.patientId === patient.patientId ? 'is-active' : ''}`}
                  onClick={() => {
                    setSelectedPatientId(patient.patientId)
                    setSelectedRecord(null)
                    setSuccessMessage(null)
                  }}
                >
                  <div className="avatar-badge">{patient.firstName.charAt(0)}{patient.lastName.charAt(0)}</div>
                  <div className="patient-card-copy">
                    <strong>{patient.firstName} {patient.lastName}</strong>
                    <small>{patient.patientId}</small>
                  </div>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </aside>

          <main className="dental-records-main">
            <div className="records-header-card panel">
              <div className="patient-header-main">
                <div className="patient-header-avatar">{selectedPatient.firstName.charAt(0)}{selectedPatient.lastName.charAt(0)}</div>
                <div>
                  <p className="eyebrow">Patient</p>
                  <h2>{selectedPatient.firstName} {selectedPatient.middleName ? `${selectedPatient.middleName} ` : ''}{selectedPatient.lastName}</h2>
                  <div className="patient-header-meta">
                    <span><UserRound size={14} /> {selectedPatient.patientId}</span>
                    <span><Phone size={14} /> {selectedPatient.phone || 'No phone on file'}</span>
                    <span><Mail size={14} /> {selectedPatient.email || 'No email on file'}</span>
                  </div>
                </div>
              </div>

              <div className="patient-header-actions">
                <Button variant="secondary" size="sm" onClick={openCreateRecord}>Add record</Button>
              </div>
            </div>

            <div className="records-summary-grid">
              <article className="stat-card">
                <span>Last visit</span>
                <strong>{mostRecentVisit}</strong>
              </article>
              <article className="stat-card">
                <span>Records</span>
                <strong>{patientRecords.length}</strong>
              </article>
              <article className="stat-card">
                <span>Follow-up</span>
                <strong>{patientRecords.filter((record) => record.status === 'follow_up' || record.followUpDate).length}</strong>
              </article>
              <article className="stat-card">
                <span>Next appointment</span>
                <strong>{nextAppointment ? formatDate(nextAppointment.date) : 'No event'}</strong>
              </article>
            </div>

            <div className="patient-contact-card panel">
              <div className="panel-header compact-header">
                <h3>Patient profile</h3>
              </div>
              <div className="patient-contact-grid">
                <div><span className="label">Address</span><p>{selectedPatient.address || 'No address on file'}</p></div>
                <div><span className="label">Date of birth</span><p>{formatDate(selectedPatient.dateOfBirth)}</p></div>
                <div><span className="label">Emergency contact</span><p>{selectedPatient.emergencyContact || 'Not provided'}</p></div>
                <div><span className="label">Last visit</span><p>{mostRecentVisit}</p></div>
                <div><span className="label">Upcoming appointment</span><p>{nextAppointment ? `${formatDate(nextAppointment.date)} • ${nextAppointment.startTime}` : 'No upcoming appointment'}</p></div>
                <div><span className="label">Status</span><p>{selectedPatient.status}</p></div>
              </div>
            </div>

            {successMessage && (
              <div className="success-alert" role="status">
                <span>{successMessage}</span>
              </div>
            )}

            <div className="clinical-timeline-section panel">
              <div className="panel-header compact-header">
                <h3>Clinical timeline</h3>
                <span className="muted-label">{timeline.length} entries</span>
              </div>

              {timeline.length === 0 ? (
                <div className="empty-state compact">
                  <FileText size={22} />
                  <h2>No dental records yet.</h2>
                  <p>Start documenting the patient&apos;s clinical history after their first visit.</p>
                </div>
              ) : (
                <div className="clinical-timeline">
                  {timeline.map((entry) => (
                    <article key={entry.id} className="clinical-visit" onClick={() => {
                      if (entry.kind === 'record') {
                        const record = patientRecords.find((item) => item.id === entry.id.replace('record-', ''))
                        if (record) setSelectedRecord(record)
                      }
                    }}>
                      <div className="clinical-visit-marker" aria-hidden="true" />
                      <div className="clinical-visit-body">
                        <div className="clinical-visit-header">
                          <div>
                            <p className="eyebrow">{entry.kind === 'appointment' ? 'Appointment' : entry.kind === 'treatment' ? 'Treatment' : 'Clinical record'}</p>
                            <h3>{entry.heading}</h3>
                          </div>
                          {entry.kind === 'record' && (
                            <div className="record-card-actions">
                              <button type="button" className="icon-button" onClick={() => {
                                const record = patientRecords.find((item) => item.id === entry.id.replace('record-', ''))
                                if (record) openEditRecord(record)
                              }}>
                                Edit
                              </button>
                              <button type="button" className="icon-button icon-button-danger" onClick={() => {
                                const record = patientRecords.find((item) => item.id === entry.id.replace('record-', ''))
                                if (record) handleDeleteRecord(record)
                              }}>
                                Delete
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="clinical-meta-row">
                          <span><CalendarDays size={14} /> {formatDate(entry.date)}</span>
                          <span><Clock3 size={14} /> {entry.status || 'updated'}</span>
                        </div>

                        <p className="clinical-summary">{entry.summary}</p>
                        <p className="clinical-description">{entry.description}</p>

                        <div className="record-footer">
                          <span className="timeline-badge">{entry.provider}</span>
                          {entry.kind === 'record' && (
                            <button type="button" className="text-link" onClick={() => {
                              const record = patientRecords.find((item) => item.id === entry.id.replace('record-', ''))
                              if (record) setSelectedRecord(record)
                            }}>
                              View details
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>

        {showRecordForm && selectedPatient && (
          <DentalRecordFormModal
            patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
            values={recordDraft}
            onChange={setRecordDraft}
            onClose={() => {
              setShowRecordForm(false)
              setRecordError(null)
              setSuccessMessage(null)
              setIsSubmitting(false)
            }}
            onSubmit={handleSubmitRecord}
            error={recordError}
            isSubmitting={isSubmitting}
            successMessage={successMessage}
          />
        )}

        {selectedRecord && (
          <aside className="detail-drawer" role="dialog" aria-modal="true">
            <div className="detail-drawer-header">
              <div>
                <p className="eyebrow">Record detail</p>
                <h3>{selectedRecord.chiefComplaint}</h3>
              </div>
              <button type="button" className="icon-button" onClick={() => setSelectedRecord(null)} aria-label="Close record details">
                ×
              </button>
            </div>

            <div className="detail-grid">
              <div><span className="label">Visit type</span><p>{selectedRecord.visitType.replace('_', ' ')}</p></div>
              <div><span className="label">Date</span><p>{formatDate(selectedRecord.recordDate)}</p></div>
              <div><span className="label">Status</span><p>{selectedRecord.status}</p></div>
              <div><span className="label">Provider</span><p>{selectedRecord.createdBy || 'Clinical team'}</p></div>
              <div className="detail-grid-full"><span className="label">Diagnosis</span><p>{selectedRecord.diagnosis || 'Not provided'}</p></div>
              <div className="detail-grid-full"><span className="label">Findings</span><p>{selectedRecord.findings || 'Not provided'}</p></div>
              <div className="detail-grid-full"><span className="label">Treatment plan</span><p>{selectedRecord.treatmentPlan || 'Not provided'}</p></div>
              <div className="detail-grid-full"><span className="label">Treatment notes</span><p>{selectedRecord.treatmentNotes || 'Not provided'}</p></div>
              <div><span className="label">Follow-up</span><p>{formatDate(selectedRecord.followUpDate)}</p></div>
            </div>

            <div className="detail-actions">
              <Button variant="secondary" onClick={() => openEditRecord(selectedRecord)}>Edit record</Button>
              <Button variant="ghost" onClick={() => handleDeleteRecord(selectedRecord)}>Delete</Button>
            </div>
          </aside>
        )}
      </div>
    </PageScaffold>
  )
}
