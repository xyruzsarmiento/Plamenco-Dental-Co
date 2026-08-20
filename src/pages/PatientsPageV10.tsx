import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CalendarDays, FileText, Import, Mail, Phone, Plus, Search, Stethoscope, UserRound, UsersRound, WalletCards } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Select'
import { usePermissions } from '../features/auth/permissions'
import { getStoredAppointments, getAppointmentsByPatient } from '../features/appointments/appointmentStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { formatCurrency } from '../features/billing/billingStore'
import { CommunicationHistoryPanel } from '../features/communications/CommunicationHistoryPanel'
import { CommunicationPreferencesPanel } from '../features/communications/CommunicationPreferencesPanel'
import { getCommunicationLogsByPatient } from '../features/communications/communicationStore'
import { DentalRecordFormModal } from '../features/dentalRecords/DentalRecordFormModal'
import { createDentalRecord, getPatientName } from '../features/dentalRecords/dentalRecordStore'
import type { DentalRecordFormValues } from '../features/dentalRecords/dentalRecordTypes'
import { getPatient360Summary } from '../features/patients/patient360Store'
import { PatientFormModal } from '../features/patients/PatientFormModal'
import { PatientImportModal } from '../features/patients/PatientImportModal'
import {
  createPatient,
  findPotentialPatientDuplicates,
  filterPatients,
  getPatientDisplayName,
  getStoredPatients,
  searchPatients,
  updatePatient,
} from '../features/patients/patientStore'
import type { Patient, PatientFormMode, PatientFormValues, PatientOrigin } from '../features/patients/patientTypes'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { getStoredServices } from '../features/services/serviceStore'
import { getTreatmentsByPatient } from '../features/treatments/treatmentStore'

type DetailTab = 'overview' | 'appointments' | 'treatments' | 'billing' | 'documents' | 'communications' | 'activity'

const originLabels: Record<PatientOrigin, string> = {
  online_registration: 'Online registration',
  walk_in: 'Walk-in',
  historical_import: 'Historical import',
  staff_created: 'Staff created',
}

function initials(patient: Patient) {
  return `${patient.firstName?.[0] ?? ''}${patient.lastName?.[0] ?? ''}`.toUpperCase()
}

function formatDate(value?: string) {
  if (!value) return 'No record'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
}

function formatTime(value?: string) {
  if (!value) return 'No time'
  const [hours, minutes] = value.split(':').map(Number)
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

function ageFromDob(value?: string) {
  if (!value) return 'DOB unavailable'
  const birth = new Date(value)
  if (Number.isNaN(birth.getTime())) return 'DOB unavailable'
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const month = now.getMonth() - birth.getMonth()
  if (month < 0 || (month === 0 && now.getDate() < birth.getDate())) age -= 1
  return `${age} years old`
}

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function emptyPatientValues(): PatientFormValues {
  return {
    authUserId: undefined,
    fullName: '', firstName: '', middleName: '', lastName: '', dateOfBirth: '', sex: 'female', phone: '', email: '', address: '', city: '', province: '',
    emergencyContact: '', emergencyContactPhone: '', emergencyContactRelationship: '', preferredBranchId: '', origin: 'walk_in', registrationDate: manilaToday(), status: 'active',
    allergies: '', medicalConditions: '', currentMedications: '', previousSurgeries: '', medicalNotes: '', administrativeNotes: '', profileImage: '',
  }
}

function registrationSeries(patients: Patient[]) {
  const formatter = new Intl.DateTimeFormat('en-PH', { month: 'short', timeZone: 'Asia/Manila' })
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() - (5 - index))
    const year = date.getFullYear()
    const month = date.getMonth()
    return {
      label: formatter.format(date),
      value: patients.filter((patient) => {
        const registered = new Date(patient.registrationDate)
        return !Number.isNaN(registered.getTime()) && registered.getFullYear() === year && registered.getMonth() === month
      }).length,
    }
  })
}

function PatientGrowthChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const width = 720
  const height = 220
  const max = Math.max(1, ...data.map((item) => item.value))
  const points = data.map((item, index) => ({
    ...item,
    x: 38 + (index * (width - 76)) / Math.max(1, data.length - 1),
    y: 24 + (height - 68) * (1 - item.value / max),
  }))
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  const area = points.length ? `${path} L ${points.at(-1)!.x} ${height - 38} L ${points[0].x} ${height - 38} Z` : ''
  return (
    <div className="patient-growth-card-v10">
      <div className="patient-growth-copy-v10"><span>Patient growth</span><strong>Registrations</strong><small>Actual registrations across the last six calendar months.</small></div>
      <div className="patient-growth-chart-v10">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={data.map((item) => `${item.label}: ${item.value}`).join(', ')}>
          {[0, 1, 2].map((line) => <line key={line} x1="38" x2={width - 38} y1={42 + line * 54} y2={42 + line * 54} className="patient-growth-grid-v10" />)}
          <path d={area} className="patient-growth-area-v10" />
          <path d={path} className="patient-growth-line-v10" />
          {points.map((point) => <g key={point.label}><circle cx={point.x} cy={point.y} r="5" /><text x={point.x} y={height - 12} textAnchor="middle">{point.label}</text><title>{point.value}</title></g>)}
        </svg>
      </div>
    </div>
  )
}

export function PatientsPageV10() {
  const navigate = useNavigate()
  const { patientId: routePatientId } = useParams()
  const permissions = usePermissions()
  const [patients, setPatients] = useState<Patient[]>(() => getStoredPatients())
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [originFilter, setOriginFilter] = useState('all')
  const [detailTab, setDetailTab] = useState<DetailTab>('overview')
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [formMode, setFormMode] = useState<PatientFormMode>('add')
  const [formValues, setFormValues] = useState<PatientFormValues>(() => emptyPatientValues())
  const [formError, setFormError] = useState<string | null>(null)
  const [duplicateMatches, setDuplicateMatches] = useState<ReturnType<typeof findPotentialPatientDuplicates>>([])
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [recordError, setRecordError] = useState<string | null>(null)
  const [recordValues, setRecordValues] = useState<DentalRecordFormValues>({
    patientId: '', recordDate: manilaToday(), visitType: 'consultation', chiefComplaint: '', clinicalFindings: '', assessment: '', treatmentPerformed: '', recommendations: '', patientVisibleSummary: '', diagnosis: '', treatmentPlan: '', findings: '', treatmentNotes: '', clinicalNotes: '', followUpRequired: false, followUpDate: '', followUpNotes: '', status: 'draft', relatedAppointmentId: '', source: 'native', lastUpdatedBy: 'Clinic user', createdBy: 'Clinic user',
  })

  const appointments = useMemo(() => getStoredAppointments(), [patients])
  const branches = useMemo(() => getStoredBranches(), [])
  const services = useMemo(() => getStoredServices(), [])
  const providers = useMemo(() => getStoredProviders(), [])
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches])
  const serviceMap = useMemo(() => new Map(services.map((service) => [service.id, service])), [services])
  const providerMap = useMemo(() => new Map(providers.map((provider) => [provider.id, provider])), [providers])
  const selectedPatient = useMemo(() => {
    if (!routePatientId) return null
    const id = decodeURIComponent(routePatientId)
    return patients.find((patient) => patient.patientId === id || patient.id === id) ?? null
  }, [patients, routePatientId])
  const patient360 = useMemo(() => selectedPatient ? getPatient360Summary(selectedPatient) : null, [selectedPatient])

  const canCreate = permissions.can('patients.create')
  const canEdit = permissions.can('patients.edit_basic')
  const canImport = permissions.can('patients.import')
  const canClinical = permissions.can('clinical_records.create')

  const metrics = useMemo(() => {
    const today = manilaToday()
    const thirtyDays = new Date()
    thirtyDays.setDate(thirtyDays.getDate() - 30)
    return {
      total: patients.length,
      active: patients.filter((patient) => patient.status === 'active').length,
      newPatients: patients.filter((patient) => new Date(patient.registrationDate) >= thirtyDays).length,
      upcoming: appointments.filter((appointment) => appointment.date >= today && !['cancelled', 'completed', 'no_show'].includes(appointment.status)).length,
    }
  }, [appointments, patients])

  const filteredPatients = useMemo(() => {
    let rows = query ? searchPatients(query) : patients
    rows = filterPatients(rows, { status: statusFilter === 'all' ? undefined : statusFilter })
    if (branchFilter !== 'all') rows = rows.filter((patient) => patient.preferredBranchId === branchFilter)
    if (originFilter !== 'all') rows = rows.filter((patient) => (patient.origin ?? 'staff_created') === originFilter)
    return [...rows].sort((a, b) => getPatientDisplayName(a).localeCompare(getPatientDisplayName(b)))
  }, [branchFilter, originFilter, patients, query, statusFilter])

  const growth = useMemo(() => registrationSeries(patients), [patients])

  useEffect(() => { setDetailTab('overview') }, [routePatientId])

  function openAdd() {
    setFormMode('add'); setFormValues(emptyPatientValues()); setFormError(null); setDuplicateMatches([]); setAllowDuplicate(false); setShowForm(true)
  }

  function openEdit(patient: Patient) {
    setFormMode('edit')
    setFormValues({
      authUserId: patient.authUserId, fullName: patient.fullName ?? getPatientDisplayName(patient), firstName: patient.firstName, middleName: patient.middleName, lastName: patient.lastName, dateOfBirth: patient.dateOfBirth, sex: patient.sex,
      phone: patient.phone, email: patient.email, address: patient.address, city: patient.city ?? '', province: patient.province ?? '', emergencyContact: patient.emergencyContact, emergencyContactPhone: patient.emergencyContactPhone,
      emergencyContactRelationship: patient.emergencyContactRelationship ?? '', preferredBranchId: patient.preferredBranchId ?? '', origin: patient.origin ?? 'staff_created', registrationDate: patient.registrationDate, status: patient.status,
      allergies: patient.allergies, medicalConditions: patient.medicalConditions, currentMedications: patient.currentMedications, previousSurgeries: patient.previousSurgeries, medicalNotes: patient.medicalNotes, administrativeNotes: patient.administrativeNotes ?? '', profileImage: patient.profileImage ?? '',
    })
    setFormError(null); setDuplicateMatches([]); setAllowDuplicate(false); setShowForm(true)
  }

  function savePatient() {
    if (!formValues.firstName.trim() || !formValues.lastName.trim() || !formValues.dateOfBirth || !formValues.phone.trim()) {
      setFormError('First name, last name, date of birth, and phone are required.')
      return
    }
    if (formMode === 'add' && !allowDuplicate) {
      const matches = findPotentialPatientDuplicates(formValues)
      if (matches.length) { setDuplicateMatches(matches); setFormError('Possible existing patient found. Review before creating another record.'); return }
    }
    if (formMode === 'add') createPatient(formValues)
    else if (selectedPatient) updatePatient(selectedPatient.id, formValues)
    setPatients(getStoredPatients()); setShowForm(false); setFormError(null); setDuplicateMatches([]); setAllowDuplicate(false)
  }

  function openRecord(patient: Patient) {
    setRecordValues((current) => ({ ...current, patientId: patient.patientId, recordDate: manilaToday() }))
    setRecordError(null)
    setShowRecordForm(true)
  }

  function saveRecord() {
    if (!selectedPatient) return
    if (!recordValues.chiefComplaint.trim() || !recordValues.assessment.trim()) { setRecordError('Chief complaint and assessment are required.'); return }
    createDentalRecord({ ...recordValues, patientId: selectedPatient.patientId })
    setShowRecordForm(false); setRecordError(null)
  }

  if (routePatientId && !selectedPatient) {
    return <section className="patient-records-v10"><div className="patient-empty-v10"><UsersRound size={28} /><h2>Patient record not found</h2><p>No patient matches {decodeURIComponent(routePatientId)}.</p><Button onClick={() => navigate('/app/patients')}>Back to patient records</Button></div></section>
  }

  if (selectedPatient && patient360) {
    const branchName = selectedPatient.preferredBranchId ? branchMap.get(selectedPatient.preferredBranchId)?.name ?? 'Unknown branch' : 'No preferred branch'
    const tabs: Array<{ key: DetailTab; label: string }> = [
      { key: 'overview', label: 'Overview' }, { key: 'appointments', label: 'Appointments' }, { key: 'treatments', label: 'Treatments' }, { key: 'billing', label: 'Billing' }, { key: 'documents', label: 'Documents' }, { key: 'communications', label: 'Communications' }, { key: 'activity', label: 'Activity' },
    ]
    return (
      <section className="patient-profile-v10">
        <div className="patient-profile-topbar-v10">
          <button type="button" onClick={() => navigate('/app/patients')}><ArrowLeft size={16} /> Patient records</button>
          <div className="patient-profile-top-actions-v10">
            {canEdit && <Button variant="secondary" onClick={() => openEdit(selectedPatient)}>Edit profile</Button>}
            {canClinical && <Button variant="secondary" onClick={() => openRecord(selectedPatient)}>Add clinical record</Button>}
            <Button onClick={() => navigate('/app/appointments')}>Book appointment <ArrowRight size={15} /></Button>
          </div>
        </div>

        <header className="patient-profile-hero-v10">
          <div className="patient-profile-identity-v10">
            <div className="patient-profile-avatar-v10">{selectedPatient.profileImage ? <img src={selectedPatient.profileImage} alt="" /> : initials(selectedPatient)}</div>
            <div><span className="patient-profile-kicker-v10">Patient 360</span><h2>{getPatientDisplayName(selectedPatient)}</h2><p>{selectedPatient.patientId} · {ageFromDob(selectedPatient.dateOfBirth)} · {branchName}</p></div>
          </div>
          <div className="patient-profile-status-v10">
            <Badge tone={selectedPatient.status === 'active' ? 'success' : 'neutral'}>{selectedPatient.status}</Badge>
            <span>{selectedPatient.authUserId ? 'Portal connected' : 'Portal not connected'}</span>
          </div>
        </header>

        <div className="patient-profile-snapshot-v10">
          <article><CalendarDays size={18} /><span>Next appointment</span><strong>{patient360.nextAppointment ? formatDate(patient360.nextAppointment.date) : 'No upcoming visit'}</strong><small>{patient360.nextAppointment ? `${formatTime(patient360.nextAppointment.startTime)} · ${serviceMap.get(patient360.nextAppointment.serviceId)?.name ?? 'Service'}` : 'Ready for booking'}</small></article>
          <article><Stethoscope size={18} /><span>Last visit</span><strong>{patient360.lastVisit ? formatDate(patient360.lastVisit.date) : 'No previous visit'}</strong><small>{patient360.lastVisit?.providerId ? providerMap.get(patient360.lastVisit.providerId)?.displayName ?? 'Dentist not recorded' : 'Dentist not recorded'}</small></article>
          <article><WalletCards size={18} /><span>Outstanding balance</span><strong>{formatCurrency(patient360.billing.outstandingBalanceCents)}</strong><small>{patient360.invoices.length} invoice{patient360.invoices.length === 1 ? '' : 's'}</small></article>
          <article><UserRound size={18} /><span>Patient type</span><strong>{patient360.patientType}</strong><small>{patient360.appointmentStats.completed} completed visits</small></article>
        </div>

        <nav className="patient-profile-tabs-v10" aria-label="Patient record sections">
          {tabs.map((tab) => <button key={tab.key} type="button" className={detailTab === tab.key ? 'is-active' : ''} onClick={() => setDetailTab(tab.key)}>{tab.label}</button>)}
        </nav>

        <div className="patient-profile-body-v10">
          {detailTab === 'overview' && <div className="patient-profile-overview-v10">
            <section className="patient-profile-panel-v10 patient-profile-main-v10"><div className="patient-profile-section-head-v10"><div><span>Clinical context</span><h3>Health & contact profile</h3></div></div><div className="patient-profile-detail-grid-v10">
              <div><span>Phone</span><strong>{selectedPatient.phone || 'Not recorded'}</strong></div><div><span>Email</span><strong>{selectedPatient.email || 'Not recorded'}</strong></div><div><span>Address</span><strong>{selectedPatient.address || 'Not recorded'}</strong></div><div><span>Emergency contact</span><strong>{selectedPatient.emergencyContact || 'Not recorded'}</strong></div>
            </div><div className="patient-clinical-alerts-v10"><div className={selectedPatient.allergies ? 'is-alert' : ''}><span>Allergies</span><strong>{selectedPatient.allergies || 'None reported'}</strong></div><div><span>Medical conditions</span><strong>{selectedPatient.medicalConditions || 'None reported'}</strong></div><div><span>Current medications</span><strong>{selectedPatient.currentMedications || 'None recorded'}</strong></div></div></section>
            <aside className="patient-profile-panel-v10"><div className="patient-profile-section-head-v10"><div><span>Care history</span><h3>Engagement</h3></div></div><div className="patient-engagement-v10"><div><strong>{patient360.appointmentStats.completed}</strong><span>Completed</span></div><div><strong>{patient360.appointmentStats.noShow}</strong><span>No-shows</span></div><div><strong>{patient360.treatments.length}</strong><span>Treatments</span></div><div><strong>{patient360.providerHistory.length}</strong><span>Providers</span></div></div><div className="patient-mini-timeline-v10">{patient360.activities.slice(0, 4).map((item) => <div key={item.id}><span /><div><strong>{item.label}</strong><small>{formatDate(item.date)} · {item.module}</small></div></div>)}{!patient360.activities.length && <p>No activity recorded.</p>}</div></aside>
          </div>}

          {detailTab === 'appointments' && <section className="patient-profile-panel-v10"><div className="patient-profile-section-head-v10"><div><span>Visit history</span><h3>Appointments</h3></div><strong>{patient360.appointments.length}</strong></div><div className="patient-record-list-v10">{patient360.appointments.map((appointment) => <article key={appointment.id}><div><strong>{formatDate(appointment.date)} · {formatTime(appointment.startTime)}</strong><span>{serviceMap.get(appointment.serviceId)?.name ?? 'Service'} · {appointment.providerId ? providerMap.get(appointment.providerId)?.displayName ?? 'Dentist' : 'No dentist'}</span></div><Badge tone={appointment.status === 'completed' ? 'success' : appointment.status === 'cancelled' || appointment.status === 'no_show' ? 'danger' : 'info'}>{appointment.status.replaceAll('_', ' ')}</Badge></article>)}{!patient360.appointments.length && <div className="patient-empty-inline-v10">No appointments recorded.</div>}</div></section>}

          {detailTab === 'treatments' && <section className="patient-profile-panel-v10"><div className="patient-profile-section-head-v10"><div><span>Care delivered</span><h3>Treatments</h3></div><strong>{patient360.treatments.length}</strong></div><div className="patient-record-list-v10">{patient360.treatments.map((treatment) => <article key={treatment.id}><div><strong>{treatment.serviceNameSnapshot || serviceMap.get(treatment.serviceId)?.name || 'Treatment'}</strong><span>{formatDate(treatment.treatmentDate)} · {treatment.providerId ? providerMap.get(treatment.providerId)?.displayName ?? 'Dentist' : 'No dentist'}</span></div><Badge tone={treatment.status === 'completed' ? 'success' : 'info'}>{treatment.status}</Badge></article>)}{!patient360.treatments.length && <div className="patient-empty-inline-v10">No treatments recorded.</div>}</div></section>}

          {detailTab === 'billing' && <div className="patient-profile-overview-v10"><section className="patient-profile-panel-v10"><div className="patient-profile-section-head-v10"><div><span>Receivables</span><h3>Invoices</h3></div><strong>{formatCurrency(patient360.billing.outstandingBalanceCents)}</strong></div><div className="patient-record-list-v10">{patient360.invoices.map((invoice) => <article key={invoice.id}><div><strong>{invoice.invoiceNumber}</strong><span>{formatDate(invoice.invoiceDate)} · {invoice.status.replaceAll('_', ' ')}</span></div><strong>{formatCurrency(invoice.balanceCents)}</strong></article>)}{!patient360.invoices.length && <div className="patient-empty-inline-v10">No invoices recorded.</div>}</div></section><section className="patient-profile-panel-v10"><div className="patient-profile-section-head-v10"><div><span>Collections</span><h3>Payments</h3></div><strong>{patient360.payments.length}</strong></div><div className="patient-record-list-v10">{patient360.payments.map((payment) => <article key={payment.id}><div><strong>{payment.paymentNumber}</strong><span>{formatDate(payment.date)} · {payment.paymentMethod.replaceAll('_', ' ')}</span></div><strong>{formatCurrency(payment.amountCents)}</strong></article>)}{!patient360.payments.length && <div className="patient-empty-inline-v10">No payments recorded.</div>}</div></section></div>}

          {detailTab === 'documents' && <section className="patient-profile-panel-v10"><div className="patient-profile-section-head-v10"><div><span>Patient files</span><h3>Documents</h3></div><strong>{patient360.documents.length + patient360.dentalImages.length}</strong></div><div className="patient-record-list-v10">{[...patient360.documents, ...patient360.dentalImages].map((document) => <article key={document.id}><div><strong>{document.fileName}</strong><span>{formatDate(document.uploadDate)} · {document.uploadedBy}</span></div><FileText size={17} /></article>)}{!patient360.documents.length && !patient360.dentalImages.length && <div className="patient-empty-inline-v10">No documents recorded.</div>}</div></section>}

          {detailTab === 'communications' && <section className="patient-profile-panel-v10"><div className="patient-profile-section-head-v10"><div><span>Preferences & delivery history</span><h3>Communications</h3></div></div><CommunicationPreferencesPanel patient={selectedPatient} actor="clinic-user" canEdit={canEdit || permissions.can('notifications.send')} /><CommunicationHistoryPanel logs={getCommunicationLogsByPatient(selectedPatient.patientId)} /></section>}

          {detailTab === 'activity' && <section className="patient-profile-panel-v10"><div className="patient-profile-section-head-v10"><div><span>Audit context</span><h3>Patient activity</h3></div><strong>{patient360.activities.length}</strong></div><div className="patient-activity-list-v10">{patient360.activities.map((item) => <article key={item.id}><span /><div><strong>{item.label}</strong><small>{formatDate(item.date)} · {item.module}{item.actor ? ` · ${item.actor}` : ''}</small><p>{item.description}</p></div></article>)}{!patient360.activities.length && <div className="patient-empty-inline-v10">No activity recorded.</div>}</div></section>}
        </div>

        {showForm && <PatientFormModal mode={formMode} values={formValues} onChange={setFormValues} onSubmit={savePatient} onClose={() => setShowForm(false)} error={formError} duplicateMatches={duplicateMatches} onOpenDuplicate={(id) => { const patient = patients.find((row) => row.id === id); if (patient) navigate(`/app/patients/${encodeURIComponent(patient.patientId)}`); setShowForm(false) }} onContinueDuplicate={() => { setAllowDuplicate(true); setDuplicateMatches([]); setFormError(null) }} />}
        {showRecordForm && <DentalRecordFormModal patientName={getPatientName(selectedPatient.patientId)} values={recordValues} onChange={setRecordValues} onSubmit={saveRecord} onClose={() => setShowRecordForm(false)} error={recordError} />}
      </section>
    )
  }

  return (
    <section className="patient-records-v10">
      <header className="patient-records-header-v10">
        <div><span className="patient-profile-kicker-v10">Patient intelligence</span><h2>Patient records</h2><p>Search, review and manage the clinic's patient population from one workspace.</p></div>
        <div className="patient-records-actions-v10">{canImport && <Button variant="secondary" onClick={() => setShowImport(true)}><Import size={16} /> Import</Button>}{canCreate && <Button onClick={openAdd}><Plus size={16} /> Add patient</Button>}</div>
      </header>

      <div className="patient-records-insights-v10">
        <div className="patient-metrics-stack-v10">
          <article><UsersRound size={18} /><span>Total patients</span><strong>{metrics.total}</strong><small>All patient records</small></article>
          <article><Stethoscope size={18} /><span>Active</span><strong>{metrics.active}</strong><small>Currently active records</small></article>
          <article><UserRound size={18} /><span>New in 30 days</span><strong>{metrics.newPatients}</strong><small>Recent registrations</small></article>
          <article><CalendarDays size={18} /><span>Upcoming visits</span><strong>{metrics.upcoming}</strong><small>Open future appointments</small></article>
        </div>
        <PatientGrowthChart data={growth} />
      </div>

      <section className="patient-directory-shell-v10">
        <div className="patient-directory-toolbar-v10">
          <label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, patient ID, phone or email" /></label>
          <Select label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} options={[{ label: 'All statuses', value: 'all' }, { label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }]} />
          <Select label="Branch" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} options={[{ label: 'All branches', value: 'all' }, ...branches.map((branch) => ({ label: branch.name, value: branch.id }))]} />
          <Select label="Origin" value={originFilter} onChange={(event) => setOriginFilter(event.target.value)} options={[{ label: 'All origins', value: 'all' }, { label: 'Online registration', value: 'online_registration' }, { label: 'Walk-in', value: 'walk_in' }, { label: 'Historical import', value: 'historical_import' }, { label: 'Staff created', value: 'staff_created' }]} />
        </div>

        <div className="patient-directory-head-v10"><div><span>Patient</span><span>Contact</span><span>Care context</span><span>Next visit</span><span /></div></div>
        <div className="patient-directory-list-v10">
          {filteredPatients.map((patient) => {
            const patientAppointments = getAppointmentsByPatient(patient.patientId)
            const next = patientAppointments.filter((appointment) => appointment.date >= manilaToday() && !['cancelled', 'completed', 'no_show'].includes(appointment.status)).sort((a, b) => a.date.localeCompare(b.date))[0]
            const treatmentCount = getTreatmentsByPatient(patient.patientId).length
            return <article key={patient.id} className="patient-directory-row-v10" onClick={() => navigate(`/app/patients/${encodeURIComponent(patient.patientId)}`)}>
              <div className="patient-directory-person-v10"><div className="patient-directory-avatar-v10">{initials(patient)}</div><div><strong>{getPatientDisplayName(patient)}</strong><span>{patient.patientId}</span><Badge tone={patient.status === 'active' ? 'success' : 'neutral'}>{patient.status}</Badge></div></div>
              <div className="patient-directory-contact-v10"><span><Mail size={14} />{patient.email || 'No email'}</span><span><Phone size={14} />{patient.phone || 'No phone'}</span></div>
              <div className="patient-directory-context-v10"><strong>{patient.preferredBranchId ? branchMap.get(patient.preferredBranchId)?.name ?? 'Unknown branch' : 'No preferred branch'}</strong><span>{originLabels[patient.origin ?? 'staff_created']} · {treatmentCount} treatment{treatmentCount === 1 ? '' : 's'}</span></div>
              <div className="patient-directory-next-v10"><strong>{next ? formatDate(next.date) : 'No upcoming visit'}</strong><span>{next ? `${formatTime(next.startTime)} · ${serviceMap.get(next.serviceId)?.name ?? 'Service'}` : 'No appointment scheduled'}</span></div>
              <button type="button" aria-label={`Open ${getPatientDisplayName(patient)}`} onClick={(event) => { event.stopPropagation(); navigate(`/app/patients/${encodeURIComponent(patient.patientId)}`) }}><ArrowRight size={17} /></button>
            </article>
          })}
          {!filteredPatients.length && <div className="patient-empty-inline-v10">No patient records match the current filters.</div>}
        </div>
      </section>

      {showForm && <PatientFormModal mode={formMode} values={formValues} onChange={setFormValues} onSubmit={savePatient} onClose={() => setShowForm(false)} error={formError} duplicateMatches={duplicateMatches} onOpenDuplicate={(id) => { const patient = patients.find((row) => row.id === id); if (patient) navigate(`/app/patients/${encodeURIComponent(patient.patientId)}`); setShowForm(false) }} onContinueDuplicate={() => { setAllowDuplicate(true); setDuplicateMatches([]); setFormError(null) }} />}
      {showImport && <PatientImportModal onClose={() => setShowImport(false)} onImported={() => setPatients(getStoredPatients())} />}
    </section>
  )
}
