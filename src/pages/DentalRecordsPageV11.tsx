import {
  Activity,
  CalendarDays,
  ChevronRight,
  ClipboardPlus,
  Clock3,
  FileText,
  HeartPulse,
  Mail,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { PageScaffold } from '../components/ui/PageScaffold'
import { StatusBadge } from '../components/ui/Badge'
import { DentalRecordFormModal } from '../features/dentalRecords/DentalRecordFormModal'
import {
  createDentalRecord,
  deleteDentalRecord,
  getPatientName,
  loadDentalRecordsFromSupabase,
  updateDentalRecord,
} from '../features/dentalRecords/dentalRecordStore'
import type { DentalRecord, DentalRecordFormValues } from '../features/dentalRecords/dentalRecordTypes'
import { getAppointmentsByPatient } from '../features/appointments/appointmentStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { useBranchContext } from '../features/branches/BranchContext'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { getStoredPatients } from '../features/patients/patientStore'
import { loadPatientsFromSupabase } from '../features/patients/patientPersistence'
import { loadTreatmentsFromSupabase } from '../features/treatments/treatmentStore'
import type { Treatment } from '../features/treatments/treatmentTypes'

const createEmptyRecordValues = (patientId: string, branchId = ''): DentalRecordFormValues => ({
  patientId,
  branchId,
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
  return Number.isNaN(date.getTime()) ? 'Not scheduled' : date.toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(value?: string) {
  if (!value) return 'No time'
  const [hours, minutes] = value.split(':').map(Number)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

export function DentalRecordsPageV11() {
  const { activeBranchId, availableBranches, isAllBranchesMode } = useBranchContext()
  const [patients, setPatients] = useState(() => [...getStoredPatients()].sort((a, b) => a.lastName.localeCompare(b.lastName)))
  const branchMap = useMemo(() => new Map(getStoredBranches().map((branch) => [branch.id, branch.name])), [])
  const providerMap = useMemo(() => new Map(getStoredProviders().map((provider) => [provider.id, provider.displayName])), [])
  const [patientSearch, setPatientSearch] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState<string>(patients[0]?.patientId ?? '')
  const [recordDraft, setRecordDraft] = useState<DentalRecordFormValues>(() => createEmptyRecordValues(patients[0]?.patientId ?? '', activeBranchId ?? ''))
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [recordFormMode, setRecordFormMode] = useState<'add' | 'edit'>('add')
  const [recordError, setRecordError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<DentalRecord | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [recordFilter, setRecordFilter] = useState<'all' | 'finalized' | 'draft'>('all')
  const [records, setRecords] = useState<DentalRecord[]>([])
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [isLoadingRecords, setIsLoadingRecords] = useState(true)

  useEffect(() => {
    let active = true
    setIsLoadingRecords(true)
    setRecordError(null)
    void loadPatientsFromSupabase({ strict: true }).then(async (nextPatients) => {
      const [nextRecords, nextTreatments] = await Promise.all([
        loadDentalRecordsFromSupabase({ strict: true }),
        loadTreatmentsFromSupabase({ strict: true }),
      ])
      if (!active) return
      setPatients([...nextPatients].sort((a, b) => a.lastName.localeCompare(b.lastName)))
      setSelectedPatientId((current) => current || nextPatients[0]?.patientId || '')
      setRecords(nextRecords)
      setTreatments(nextTreatments)
    }).catch((cause) => {
      if (!active) return
      setRecordError(cause instanceof Error ? cause.message : 'Clinical data could not be loaded from the clinic database.')
    }).finally(() => {
      if (active) setIsLoadingRecords(false)
    })
    return () => { active = false }
  }, [])

  const filteredPatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase()
    if (!query) return patients
    return patients.filter((patient) => `${patient.firstName} ${patient.lastName} ${patient.patientId} ${patient.email} ${patient.phone}`.toLowerCase().includes(query))
  }, [patientSearch, patients])

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.patientId === selectedPatientId) ?? filteredPatients[0] ?? null,
    [filteredPatients, patients, selectedPatientId],
  )

  const patientRecords = useMemo(() => {
    if (!selectedPatient) return []
    return records
      .filter((record) => record.patientId === selectedPatient.patientId || record.patientId === selectedPatient.id)
      .sort((a, b) => new Date(b.recordDate).getTime() - new Date(a.recordDate).getTime())
  }, [records, selectedPatient])
  const patientAppointments = useMemo(
    () => selectedPatient ? getAppointmentsByPatient(selectedPatient.patientId).sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)) : [],
    [selectedPatient],
  )
  const patientTreatments = useMemo(() => selectedPatient
    ? treatments.filter((treatment) => treatment.patientId === selectedPatient.patientId || treatment.patientId === selectedPatient.id)
    : [], [selectedPatient, treatments])

  const timeline = useMemo(() => {
    const records = patientRecords.map((record) => ({
      id: `record-${record.id}`,
      date: record.recordDate || record.createdAt,
      kind: 'record' as const,
      heading: record.chiefComplaint || 'Clinical visit documentation',
      summary: record.diagnosis || record.assessment || 'Clinical assessment',
      description: record.clinicalFindings || record.findings || record.clinicalNotes || record.treatmentPerformed || 'No detailed notes available.',
      status: record.status,
      provider: record.providerNameSnapshot || (record.providerId ? providerMap.get(record.providerId) : '') || record.createdBy || 'Clinical team',
      branch: record.branchId ? branchMap.get(record.branchId) ?? 'Unknown branch' : 'Branch not recorded',
      appointment: record.appointmentNumber || record.relatedAppointmentId || '',
      linkedTreatments: patientTreatments.filter((treatment) => treatment.dentalRecordId === record.id).length,
    }))
    const appointments = patientAppointments.map((appointment) => ({
      id: `appointment-${appointment.id}`,
      date: appointment.date,
      kind: 'appointment' as const,
      heading: 'Scheduled appointment',
      summary: `${formatTime(appointment.startTime)} – ${formatTime(appointment.endTime)}`,
      description: appointment.reasonForVisit || appointment.notes || 'Clinic appointment',
      status: appointment.status,
      provider: 'Clinic scheduling',
    }))
    const treatments = patientTreatments.map((treatment) => ({
      id: `treatment-${treatment.id}`,
      date: treatment.treatmentDate,
      kind: 'treatment' as const,
      heading: treatment.description || 'Treatment',
      summary: treatment.toothNumber ? `Tooth ${treatment.toothNumber}` : 'Treatment record',
      description: treatment.notes || 'Treatment documented in the patient record.',
      status: treatment.status,
      provider: 'Treatment history',
    }))
    void appointments
    void treatments
    return records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [branchMap, patientAppointments, patientRecords, patientTreatments, providerMap])

  const mostRecentVisit = useMemo(() => {
    const dates = patientRecords.map((record) => record.recordDate).filter(Boolean)
    if (!dates.length) return 'No visit yet'
    return formatDate(dates.reduce((latest, current) => current > latest ? current : latest, dates[0]))
  }, [patientRecords])

  const nextAppointment = patientAppointments.find((appointment) => appointment.date >= new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) && !['cancelled', 'no_show', 'completed', 'rejected'].includes(appointment.status))
  const followUps = patientRecords.filter((record) => record.followUpRequired || record.followUpDate)
  const finalizedRecords = patientRecords.filter((record) => record.status === 'finalized').length
  const draftRecords = patientRecords.filter((record) => record.status === 'draft').length
  const visibleTimeline = useMemo(() => timeline.filter((entry) => recordFilter === 'all' || entry.status === recordFilter), [recordFilter, timeline])

  function selectPatient(patientId: string) {
    setSelectedPatientId(patientId)
    setSelectedRecord(null)
    setSuccessMessage(null)
  }

  function openCreateRecord() {
    if (!selectedPatient) return
    const preferredBranchId = selectedPatient.preferredBranchId && availableBranches.some((branch) => branch.id === selectedPatient.preferredBranchId)
      ? selectedPatient.preferredBranchId
      : ''
    const branchId = activeBranchId || preferredBranchId || (availableBranches.length === 1 ? availableBranches[0].id : '')
    setRecordFormMode('add')
    setRecordDraft(createEmptyRecordValues(selectedPatient.id, branchId))
    setRecordError(null)
    setSuccessMessage(null)
    setSelectedRecord(null)
    setShowRecordForm(true)
  }

  function openEditRecord(record: DentalRecord) {
    setRecordFormMode('edit')
    setSelectedRecord(record)
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

  async function handleSubmitRecord() {
    if (!selectedPatient || isSubmitting) return
    if (!recordDraft.branchId?.trim()) return setRecordError('Select the clinic branch for this clinical record.')
    if (!recordDraft.chiefComplaint.trim()) return setRecordError('Chief complaint is required.')
    if (!recordDraft.diagnosis.trim()) return setRecordError('Diagnosis is required.')
    setRecordError(null)
    setIsSubmitting(true)

    try {
      if (recordFormMode === 'edit') {
        if (!selectedRecord) throw new Error('Clinical record was not found. Refresh and try again.')
        await updateDentalRecord(selectedRecord.id, { ...recordDraft, patientId: selectedPatient.id })
      } else {
        await createDentalRecord({ ...recordDraft, patientId: selectedPatient.id })
      }
      setRecords(await loadDentalRecordsFromSupabase({ strict: true }))
      setSuccessMessage(recordFormMode === 'edit' ? 'Record updated successfully.' : 'Record created successfully.')
      setShowRecordForm(false)
      setSelectedRecord(null)
      setRecordDraft(createEmptyRecordValues(selectedPatient.id, activeBranchId ?? ''))
    } catch (cause) {
      setRecordError(cause instanceof Error ? cause.message : 'Clinical record could not be saved.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDeleteRecord(record: DentalRecord) {
    if (isSubmitting) return
    if (!window.confirm(`Delete this draft dental record for ${getPatientName(record.patientId)}? Finalized records cannot be deleted.`)) return
    setIsSubmitting(true)
    setSuccessMessage(null)
    try {
      const deleted = await deleteDentalRecord(record.id)
      if (!deleted) throw new Error('Only draft clinical records can be deleted.')
      setRecords(await loadDentalRecordsFromSupabase({ strict: true }))
      setSelectedRecord(null)
      setSuccessMessage('Draft dental record deleted.')
    } catch (cause) {
      setRecordError(cause instanceof Error ? cause.message : 'Dental record could not be deleted.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!selectedPatient) {
    return (
      <PageScaffold title="Dental Records" description="Clinical documentation, visit history, follow-up, and care continuity.">
        <div className="dr11-empty-page">
          <FileText size={28} />
          <h2>No patient records available</h2>
          <p>Add a patient first, then return here to create clinical documentation.</p>
        </div>
      </PageScaffold>
    )
  }

  return (
    <PageScaffold title="Dental Records" description="Clinical visit documentation: findings, diagnosis, notes, and finalized care summaries.">
      <section className="dr11-page">
        <header className="dr11-command-header">
          <div className="dr11-command-title">
            <span className="dr11-command-icon"><FileText size={22} /></span>
            <div><span className="dr11-kicker">Patient chart</span><h2>Dental records</h2><p>Review visit notes, clinical findings, diagnoses, and follow-up care.</p></div>
          </div>
          <Button onClick={openCreateRecord} icon={<ClipboardPlus size={17} />}>New record</Button>
        </header>

        <div className="dr11-layout">
          <aside className="dr11-directory">
            <div className="dr11-directory-head">
              <div>
                <span>Patient directory</span>
                <strong>{patients.length} patients</strong>
              </div>
              <UserRound size={18} />
            </div>

            <label className="dr11-search">
              <Search size={16} />
              <input value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="Search name, ID, phone..." />
            </label>

            <div className="dr11-patient-list">
              {filteredPatients.map((patient) => {
                const patientRecordCount = records.filter((record) => record.patientId === patient.patientId || record.patientId === patient.id).length
                return (
                  <button key={patient.id} type="button" className={selectedPatient.patientId === patient.patientId ? 'is-active' : ''} onClick={() => selectPatient(patient.patientId)}>
                    <span className="dr11-avatar">{initials(patient.firstName, patient.lastName)}</span>
                    <span className="dr11-patient-copy">
                      <strong>{patient.firstName} {patient.lastName}</strong>
                      <small>{patient.patientId}</small>
                    </span>
                    <span className="dr11-record-count">{patientRecordCount}</span>
                    <ChevronRight size={15} />
                  </button>
                )
              })}
              {filteredPatients.length === 0 && <div className="dr11-no-match">No patient matches your search.</div>}
            </div>
          </aside>

          <main className="dr11-main">
            <section className="dr11-patient-hero">
              <div className="dr11-patient-identity">
                <span className="dr11-avatar dr11-avatar-lg">{initials(selectedPatient.firstName, selectedPatient.lastName)}</span>
                <div>
                  <span className="dr11-kicker">Patient chart</span>
                  <h2>{selectedPatient.firstName} {selectedPatient.middleName ? `${selectedPatient.middleName} ` : ''}{selectedPatient.lastName}</h2>
                  <div className="dr11-contact-row">
                    <span><UserRound size={14} /> {selectedPatient.patientId}</span>
                    <span><Phone size={14} /> {selectedPatient.phone || 'No phone'}</span>
                    <span><Mail size={14} /> {selectedPatient.email || 'No email'}</span>
                  </div>
                </div>
              </div>
              <div className="dr11-patient-status">
                <StatusBadge status={selectedPatient.status} variant="compact" />
                <small>{selectedPatient.preferredBranchId ? 'Preferred branch configured' : 'No preferred branch'}</small>
              </div>
            </section>

            <section className="dr11-metrics">
              <article><span><CalendarDays size={16} /> Last visit</span><strong>{mostRecentVisit}</strong><small>{timeline.length} total timeline entries</small></article>
              <article><span><FileText size={16} /> Clinical records</span><strong>{patientRecords.length}</strong><small>{finalizedRecords} finalized · {draftRecords} draft</small></article>
              <article><span><HeartPulse size={16} /> Follow-up</span><strong>{followUps.length}</strong><small>{followUps[0]?.followUpDate ? `Next ${formatDate(followUps[0].followUpDate)}` : 'No scheduled follow-up'}</small></article>
              <article><span><Clock3 size={16} /> Next appointment</span><strong>{nextAppointment ? formatDate(nextAppointment.date) : 'No visit booked'}</strong><small>{nextAppointment ? formatTime(nextAppointment.startTime) : 'Scheduling is clear'}</small></article>
            </section>

            <div className="dr11-content-grid">
              <section className="dr11-clinical-summary">
                <div className="dr11-section-head">
                  <div><span className="dr11-kicker">Medical context</span><h3>Clinical profile</h3></div>
                  <ShieldAlert size={18} />
                </div>
                <div className="dr11-profile-grid">
                  <div><span>Allergies</span><strong>{selectedPatient.allergies || 'None reported'}</strong></div>
                  <div><span>Medical conditions</span><strong>{selectedPatient.medicalConditions || 'None reported'}</strong></div>
                  <div><span>Current medications</span><strong>{selectedPatient.currentMedications || 'None reported'}</strong></div>
                  <div><span>Emergency contact</span><strong>{selectedPatient.emergencyContact || 'Not provided'}</strong><small>{selectedPatient.emergencyContactPhone || 'No phone recorded'}</small></div>
                  <div><span>Date of birth</span><strong>{formatDate(selectedPatient.dateOfBirth)}</strong></div>
                  <div><span>Address</span><strong>{selectedPatient.address || 'No address on file'}</strong></div>
                </div>
              </section>

              <section className="dr11-activity-card">
                <div className="dr11-section-head">
                  <div><span className="dr11-kicker">Connected care</span><h3>Related activity</h3></div>
                  <Activity size={18} />
                </div>
                <div className="dr11-mix-list">
                  <div><span><FileText size={15} /> Clinical records</span><strong>{patientRecords.length}</strong></div>
                  <div><span><CalendarDays size={15} /> Appointments</span><strong>{patientAppointments.length}</strong></div>
                  <div><span><HeartPulse size={15} /> Treatments</span><strong>{patientTreatments.length}</strong></div>
                </div>
              </section>
            </div>

            {successMessage && <div className="dr11-success" role="status">{successMessage}</div>}
            {recordError && !showRecordForm && <div className="tp13-error" role="alert">{recordError}</div>}
            {isLoadingRecords && <div className="dr11-loading" role="status">Loading clinical records from the clinic database...</div>}

            <section className="dr11-timeline-card">
              <div className="dr11-section-head dr11-timeline-head">
                <div><span className="dr11-kicker">Visit history</span><h3>Clinical records</h3><p>Open a record to review its findings, diagnosis, care notes, and follow-up.</p></div>
                <span className="dr11-count-pill">{visibleTimeline.length} shown</span>
              </div>

              {timeline.length > 0 && <div className="dr11-record-filters" aria-label="Filter clinical records by status">
                {([['all', 'All records'], ['finalized', 'Finalized'], ['draft', 'Drafts']] as const).map(([value, label]) => <button key={value} type="button" className={recordFilter === value ? 'is-active' : ''} aria-pressed={recordFilter === value} onClick={() => setRecordFilter(value)}>{label}</button>)}
              </div>}

              {visibleTimeline.length === 0 ? (
                <div className="dr11-empty-timeline">
                  <FileText size={28} />
                  <h3>{timeline.length ? 'No records in this view' : 'No clinical history yet'}</h3>
                  <p>{timeline.length ? 'Choose another status to see this patient’s records.' : 'Create the first clinical record after the patient’s consultation or treatment.'}</p>
                  {!timeline.length && <Button onClick={openCreateRecord} icon={<Plus size={16} />}>Create first record</Button>}
                </div>
              ) : (
                <div className="dr11-timeline">
                  {visibleTimeline.map((entry) => {
                    const record = entry.kind === 'record' ? patientRecords.find((item) => item.id === entry.id.replace('record-', '')) : undefined
                    return (
                      <article key={entry.id} className={`dr11-event dr11-event-${entry.kind}`} onClick={() => record && setSelectedRecord(record)}>
                        <div className="dr11-event-date"><strong>{formatDate(entry.date)}</strong><span>{entry.kind}</span></div>
                        <div className="dr11-event-marker" />
                        <div className="dr11-event-body">
                          <div className="dr11-event-top">
                            <div><span className="dr11-kicker">{entry.kind === 'record' ? 'Clinical record' : entry.kind}</span><h4>{entry.heading}</h4></div>
                            <StatusBadge status={entry.status} variant="compact" />
                          </div>
                          <strong className="dr11-event-summary">{entry.summary}</strong>
                          <p>{entry.description}</p>
                          <div className="dr11-event-footer"><span>{entry.provider}</span><span>{entry.branch}</span>{entry.appointment && <span>Appointment {entry.appointment}</span>}{entry.linkedTreatments > 0 && <span>{entry.linkedTreatments} linked treatment{entry.linkedTreatments === 1 ? '' : 's'}</span>}{record && <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedRecord(record) }}>View record</button>}</div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </main>
        </div>

        {showRecordForm && (
          <DentalRecordFormModal
            branches={availableBranches}
            branchLocked={!isAllBranchesMode && Boolean(activeBranchId)}
            patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
            values={recordDraft}
            onChange={setRecordDraft}
            onClose={() => { if (!isSubmitting) { setShowRecordForm(false); setRecordError(null); setSuccessMessage(null) } }}
            onSubmit={handleSubmitRecord}
            error={recordError}
            isSubmitting={isSubmitting}
            successMessage={successMessage}
          />
        )}

        {selectedRecord && !showRecordForm && (
          <div className="dr11-detail-backdrop" onClick={() => setSelectedRecord(null)}>
            <aside className="dr11-detail-panel" role="dialog" aria-modal="true" aria-labelledby="dr11-record-title" onClick={(event) => event.stopPropagation()}>
              <div className="dr11-detail-head">
                <div><span className="dr11-kicker">Clinical record detail</span><h2 id="dr11-record-title">{selectedRecord.chiefComplaint}</h2><p>{formatDate(selectedRecord.recordDate)} · {selectedRecord.createdBy || 'Clinical team'}</p></div>
                <button type="button" aria-label="Close record details" onClick={() => setSelectedRecord(null)}><X size={19} /></button>
              </div>
              <div className="dr11-detail-status"><span>{selectedRecord.visitType.replaceAll('_', ' ')}</span><StatusBadge status={selectedRecord.status} variant="compact" /></div>
              <div className="dr11-detail-sections">
                <section><span>Diagnosis</span><p>{selectedRecord.diagnosis || 'Not provided'}</p></section>
                <section><span>Clinical findings</span><p>{selectedRecord.clinicalFindings || selectedRecord.findings || 'Not provided'}</p></section>
                <section><span>Assessment</span><p>{selectedRecord.assessment || 'Not provided'}</p></section>
                <section><span>Treatment performed</span><p>{selectedRecord.treatmentPerformed || 'Not provided'}</p></section>
                <section><span>Treatment plan</span><p>{selectedRecord.treatmentPlan || 'Not provided'}</p></section>
                <section><span>Recommendations</span><p>{selectedRecord.recommendations || 'Not provided'}</p></section>
                <section><span>Follow-up</span><p>{selectedRecord.followUpDate ? `${formatDate(selectedRecord.followUpDate)}${selectedRecord.followUpNotes ? ` · ${selectedRecord.followUpNotes}` : ''}` : 'No follow-up scheduled'}</p></section>
              </div>
              <div className="dr11-detail-actions">
                {selectedRecord.status === 'draft' && <Button variant="secondary" onClick={() => openEditRecord(selectedRecord)}>Edit record</Button>}
                {selectedRecord.status === 'draft' && <Button variant="ghost" onClick={() => void handleDeleteRecord(selectedRecord)}>Delete draft</Button>}
              </div>
            </aside>
          </div>
        )}
      </section>
    </PageScaffold>
  )
}
