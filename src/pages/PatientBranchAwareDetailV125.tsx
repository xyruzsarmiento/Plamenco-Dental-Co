import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  HeartPulse,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
  UserRound,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { useBranchContext } from '../features/branches/BranchContext'
import { formatCurrency } from '../features/billing/billingStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { loadDentalRecordsFromSupabase } from '../features/dentalRecords/dentalRecordStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { getPatient360Summary } from '../features/patients/patient360Store'
import { loadPatientsFromSupabase } from '../features/patients/patientPersistence'
import { getPatientDisplayName, getStoredPatients } from '../features/patients/patientStore'
import { getRecallDueBucket, getStoredPatientRecalls, listPatientRecalls, type RecallQueueItem } from '../features/recalls/recallStore'
import { getStoredServices } from '../features/services/serviceStore'
import { loadTreatmentsFromSupabase } from '../features/treatments/treatmentStore'
import { syncSupabaseToLocalStorage } from '../lib/supabaseSync'
import '../styles/patient-branch-history-v125.css'
import '../styles/patient-360-premium-v173.css'

type DetailTab = 'overview' | 'visits' | 'care' | 'billing' | 'records'

function formatDate(value?: string) {
  if (!value) return 'Not recorded'
  const source = value.includes('T') ? value : `${value}T00:00:00+08:00`
  const date = new Date(source)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
}

function formatTime(value?: string) {
  if (!value) return ''
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours)) return value
  return `${hours % 12 || 12}:${String(minutes || 0).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function sentence(value?: string) {
  if (!value) return ''
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

export function PatientBranchAwareDetailV125() {
  const navigate = useNavigate()
  const { patientId } = useParams()
  const { activeBranch, isAllBranchesMode } = useBranchContext()
  const [tab, setTab] = useState<DetailTab>('overview')
  const [recalls, setRecalls] = useState<RecallQueueItem[]>([])
  const [revision, setRevision] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(true)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)

  const decodedPatientId = useMemo(() => decodeURIComponent(patientId ?? ''), [patientId])
  const patients = useMemo(() => getStoredPatients(), [revision])
  const patient = useMemo(
    () => patients.find((row) => row.id === decodedPatientId || row.patientId === decodedPatientId) ?? null,
    [decodedPatientId, patients],
  )
  const summary = useMemo(() => (patient ? getPatient360Summary(patient) : null), [patient, revision])
  const branches = useMemo(() => getStoredBranches(), [revision])
  const providers = useMemo(() => getStoredProviders(), [revision])
  const services = useMemo(() => getStoredServices(), [revision])
  const branchMap = useMemo(() => new Map(branches.map((row) => [row.id, row.name])), [branches])
  const providerMap = useMemo(() => new Map(providers.map((row) => [row.id, row.displayName])), [providers])
  const serviceMap = useMemo(() => new Map(services.map((row) => [row.id, row.name])), [services])

  const refreshFromDatabase = useCallback(async () => {
    setIsRefreshing(true)
    setRefreshError(null)
    try {
      await Promise.all([
        loadPatientsFromSupabase({ strict: true }),
        loadDentalRecordsFromSupabase({ strict: true }),
        loadTreatmentsFromSupabase({ strict: true }),
        syncSupabaseToLocalStorage(),
      ])
      setRevision((value) => value + 1)
      setLastRefreshedAt(new Date())
    } catch (error) {
      console.error('[patient 360 refresh failed]', error)
      setRefreshError(error instanceof Error ? error.message : 'Patient data could not be refreshed from the clinic database.')
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refreshFromDatabase()
  }, [refreshFromDatabase, decodedPatientId])

  useEffect(() => {
    if (!patient?.patientId) return
    let active = true
    setRecalls(getStoredPatientRecalls(patient.patientId))
    void listPatientRecalls(patient.patientId)
      .then((rows) => {
        if (active) setRecalls(rows)
      })
      .catch((error) => {
        console.error('[patient recalls load failed]', error)
      })
    return () => {
      active = false
    }
  }, [patient?.patientId, revision])

  if (isRefreshing && !patient) {
    return (
      <section className="patient125-page">
        <div className="patient125-loading" aria-live="polite">
          <span className="patient125-spinner"><RefreshCw size={22} /></span>
          <h2>Loading patient record</h2>
          <p>Getting the latest clinic-wide history from the database.</p>
        </div>
      </section>
    )
  }

  if (!patient || !summary) {
    return (
      <section className="patient125-page">
        <div className="patient125-empty">
          <UserRound size={28} />
          <h2>Patient record not found</h2>
          <p>{refreshError || 'This clinic-wide patient identity could not be resolved.'}</p>
          <Button onClick={() => navigate('/app/patients')}>Back to Patient Records</Button>
        </div>
      </section>
    )
  }

  const branchName = (branchId?: string) => (branchId ? branchMap.get(branchId) ?? 'Unknown branch' : 'Branch not recorded')
  const treatmentBranchById = new Map(summary.treatments.map((item) => [item.id, item.branchId]))
  const clinicalBranchById = new Map(summary.clinicalVisits.map((item) => [item.id, item.branchId]))
  const documentBranch = (document: { treatmentId?: string; clinicalVisitId?: string }) =>
    document.treatmentId
      ? treatmentBranchById.get(document.treatmentId)
      : document.clinicalVisitId
        ? clinicalBranchById.get(document.clinicalVisitId)
        : undefined

  const name = getPatientDisplayName(patient)
  const activeRecalls = recalls.filter((item) => !['completed', 'dismissed', 'cancelled'].includes(item.status))
  const nextAppointment = summary.nextAppointment
  const latestClinical = summary.clinicalVisits[0]
  const latestTreatment = summary.treatments[0]
  const tabs: Array<{ key: DetailTab; label: string; count?: number }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'visits', label: 'Visits', count: summary.appointments.length },
    { key: 'care', label: 'Clinical care', count: summary.clinicalVisits.length + summary.treatments.length },
    { key: 'billing', label: 'Billing', count: summary.invoices.length },
    { key: 'records', label: 'Files & follow-ups', count: summary.documents.length + summary.dentalImages.length + activeRecalls.length },
  ]

  return (
    <section className="patient125-page">
      <div className="patient125-topbar">
        <button type="button" onClick={() => navigate('/app/patients')}><ArrowLeft size={16} />Patient Records</button>
        <div className="patient125-sync-state">
          {refreshError ? <span className="is-error"><ShieldAlert size={14} /> Database refresh issue</span> : <span><CheckCircle2 size={14} /> Database synced</span>}
          <button type="button" onClick={() => void refreshFromDatabase()} disabled={isRefreshing} aria-label="Refresh patient record from database"><RefreshCw size={15} className={isRefreshing ? 'is-spinning' : ''} /><span>{isRefreshing ? 'Refreshing' : 'Refresh'}</span></button>
        </div>
      </div>

      {refreshError && <div className="patient125-alert" role="alert"><ShieldAlert size={18} /><div><strong>Could not fully refresh from Supabase</strong><span>{refreshError} The page is showing the last available synchronized clinic data.</span></div></div>}

      <header className="patient125-hero">
        <div className="patient125-identity">
          <div className="patient125-avatar">{patient.profileImage ? <img src={patient.profileImage} alt="" /> : initials(name)}</div>
          <div className="patient125-identity-copy">
            <div className="patient125-eyebrow-row"><span>Patient 360</span><Badge tone="info">{summary.patientType}</Badge></div>
            <h1>{name}</h1>
            <div className="patient125-meta"><span>{patient.patientId}</span><i /><span>{patient.preferredBranchId ? `Prefers ${branchName(patient.preferredBranchId)}` : 'No preferred branch'}</span></div>
          </div>
        </div>
        <div className="patient125-hero-context"><span>Current workspace</span><strong>{isAllBranchesMode ? 'All Branches' : activeBranch?.name ?? 'Branch workspace'}</strong><small>Patient history remains clinic-wide.</small></div>
      </header>

      <section className="patient125-glance" aria-label="Patient at a glance">
        <article><span className="patient125-glance-icon"><CalendarClock size={18} /></span><div><small>Next appointment</small><strong>{nextAppointment ? formatDate(nextAppointment.date) : 'None scheduled'}</strong><p>{nextAppointment ? `${formatTime(nextAppointment.startTime)} · ${serviceMap.get(nextAppointment.serviceId) ?? 'Dental visit'}` : 'No upcoming visit'}</p></div></article>
        <article><span className="patient125-glance-icon"><Stethoscope size={18} /></span><div><small>Last clinical activity</small><strong>{latestClinical ? formatDate(latestClinical.recordDate) : latestTreatment ? formatDate(latestTreatment.treatmentDate) : 'No history yet'}</strong><p>{latestClinical?.providerNameSnapshot || latestTreatment?.providerNameSnapshot || 'No provider recorded'}</p></div></article>
        <article><span className="patient125-glance-icon"><CircleDollarSign size={18} /></span><div><small>Outstanding balance</small><strong>{formatCurrency(summary.billing.outstandingBalanceCents)}</strong><p>{summary.invoices.length} invoice{summary.invoices.length === 1 ? '' : 's'} on record</p></div></article>
        <article className={activeRecalls.length ? 'has-attention' : ''}><span className="patient125-glance-icon"><HeartPulse size={18} /></span><div><small>Follow-ups</small><strong>{activeRecalls.length}</strong><p>{activeRecalls.length ? 'Needs review' : 'No active follow-ups'}</p></div></article>
      </section>

      <nav className="patient125-tabs" aria-label="Patient record sections">{tabs.map((item) => <button key={item.key} type="button" className={tab === item.key ? 'is-active' : ''} onClick={() => setTab(item.key)}><span>{item.label}</span>{typeof item.count === 'number' && <em>{item.count}</em>}</button>)}</nav>

      {tab === 'overview' && <div className="patient125-overview">
        <section className="patient125-card patient125-primary-card"><header><div><span>Patient snapshot</span><h2>What you need to know</h2></div></header><div className="patient125-profile-grid"><div><Phone size={16} /><span><small>Phone</small><strong>{patient.phone || 'Not recorded'}</strong></span></div><div><Mail size={16} /><span><small>Email</small><strong>{patient.email || 'Not recorded'}</strong></span></div><div><MapPin size={16} /><span><small>Care locations</small><strong>{summary.branchHistory.length ? `${summary.branchHistory.length} branch${summary.branchHistory.length === 1 ? '' : 'es'}` : 'No branch activity'}</strong></span></div><div><CalendarDays size={16} /><span><small>Completed visits</small><strong>{summary.appointmentStats.completed}</strong></span></div></div><div className="patient125-safety-grid"><article className={patient.allergies ? 'has-warning' : ''}><span>Allergies</span><strong>{patient.allergies || 'None reported'}</strong></article><article className={patient.medicalConditions ? 'has-warning' : ''}><span>Medical conditions</span><strong>{patient.medicalConditions || 'None reported'}</strong></article></div></section>
        <aside className="patient125-side-stack"><section className="patient125-card"><header><div><span>Care journey</span><h2>Branch history</h2></div></header><div className="patient125-branch-list">{summary.branchHistory.map((branch) => <div key={branch.id}><MapPin size={15} /><strong>{branch.name}</strong></div>)}{!summary.branchHistory.length && <p className="patient125-muted">No branch-linked activity yet.</p>}</div></section><section className="patient125-card patient125-compact-card"><header><div><span>Data freshness</span><h2>Clinic database</h2></div></header><p className="patient125-muted">This view refreshes clinic records from Supabase before presenting the patient timeline.</p><small className="patient125-refreshed">{lastRefreshedAt ? `Last refreshed ${lastRefreshedAt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}` : 'Using synchronized clinic data'}</small></section></aside>
      </div>}

      {tab === 'visits' && <section className="patient125-card patient125-section-card"><header><div><span>Visit history</span><h2>Appointments</h2><p>All scheduled and completed visits across clinic branches.</p></div><strong className="patient125-total">{summary.appointments.length}</strong></header><div className="patient125-list">{summary.appointments.map((item) => <article key={item.id}><div className="patient125-list-leading"><span className="patient125-date-tile"><strong>{new Date(`${item.date}T00:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', timeZone: 'Asia/Manila' })}</strong><b>{new Date(`${item.date}T00:00:00+08:00`).getDate()}</b></span><div><strong>{serviceMap.get(item.serviceId) ?? 'Dental appointment'}</strong><p>{formatTime(item.startTime)} · {item.providerId ? providerMap.get(item.providerId) ?? 'Dentist' : 'Dentist not assigned'}</p><small>{branchName(item.branchId)}</small></div></div><StatusBadge status={item.status} variant="compact" /></article>)}{!summary.appointments.length && <div className="patient125-zero"><CalendarDays size={22} /><strong>No appointments yet</strong><span>Scheduled visits will appear here.</span></div>}</div></section>}

      {tab === 'care' && <div className="patient125-care-layout"><section className="patient125-card patient125-section-card"><header><div><span>Clinical summaries</span><h2>Dental records</h2><p>Concise clinical documentation from each visit.</p></div><strong className="patient125-total">{summary.clinicalVisits.length}</strong></header><div className="patient125-list">{summary.clinicalVisits.map((item) => <article key={item.id}><div><strong>{sentence(item.visitType) || 'Clinical visit'}</strong><p>{item.patientVisibleSummary || item.assessment || item.chiefComplaint || 'Dental visit summary'}</p><small>{formatDate(item.recordDate)} · {item.providerNameSnapshot || (item.providerId ? providerMap.get(item.providerId) : '') || 'Care team'} · {branchName(item.branchId)}</small></div><StatusBadge status={item.status} variant="compact" /></article>)}{!summary.clinicalVisits.length && <div className="patient125-zero"><Stethoscope size={22} /><strong>No clinical summaries yet</strong><span>Finalized dental records will appear here.</span></div>}</div></section><section className="patient125-card patient125-section-card"><header><div><span>Care delivered</span><h2>Treatments</h2><p>Procedures and services recorded for this patient.</p></div><strong className="patient125-total">{summary.treatments.length}</strong></header><div className="patient125-list">{summary.treatments.map((item) => <article key={item.id}><div><strong>{item.serviceNameSnapshot || serviceMap.get(item.serviceId) || item.description || 'Treatment'}</strong><p>{formatDate(item.treatmentDate)} · {item.providerNameSnapshot || (item.providerId ? providerMap.get(item.providerId) : '') || 'Care team'}</p><small>{branchName(item.branchId)}</small></div><StatusBadge status={item.status} variant="compact" /></article>)}{!summary.treatments.length && <div className="patient125-zero"><HeartPulse size={22} /><strong>No treatments yet</strong><span>Treatment history will appear here.</span></div>}</div></section><section className="patient125-card patient125-section-card patient125-wide-card"><header><div><span>Medication history</span><h2>Prescriptions</h2></div><strong className="patient125-total">{summary.prescriptions.length}</strong></header><div className="patient125-list">{summary.prescriptions.map((item) => <article key={item.id}><div><strong>{item.medication || item.items?.map((rx) => rx.medication).filter(Boolean).join(', ') || 'Prescription'}</strong><p>{formatDate(item.prescriptionDate)} · {item.providerNameSnapshot || item.prescribedBy || 'Prescribing dentist'}</p><small>{branchName(item.branchId)}</small></div><StatusBadge status={item.status} variant="compact" /></article>)}{!summary.prescriptions.length && <div className="patient125-zero"><FileText size={22} /><strong>No prescriptions yet</strong><span>Medication records will appear here.</span></div>}</div></section></div>}

      {tab === 'billing' && <div className="patient125-billing-layout"><section className="patient125-billing-summary"><article><small>Total billed</small><strong>{formatCurrency(summary.billing.totalBilledCents)}</strong></article><article><small>Total paid</small><strong>{formatCurrency(summary.billing.totalPaidCents)}</strong></article><article className={summary.billing.outstandingBalanceCents > 0 ? 'has-balance' : ''}><small>Outstanding</small><strong>{formatCurrency(summary.billing.outstandingBalanceCents)}</strong></article></section><div className="patient125-grid"><section className="patient125-card patient125-section-card"><header><div><span>Invoices</span><h2>Patient billing</h2></div><strong className="patient125-total">{summary.invoices.length}</strong></header><div className="patient125-list">{summary.invoices.map((item) => <article key={item.id}><div><strong>{item.invoiceNumber}</strong><p>{formatDate(item.invoiceDate)} · {branchName(item.branchId)}</p></div><div className="patient125-money"><strong>{formatCurrency(item.balanceCents)}</strong><StatusBadge status={item.status} variant="compact" /></div></article>)}{!summary.invoices.length && <div className="patient125-zero"><CircleDollarSign size={22} /><strong>No invoices yet</strong><span>Billing records will appear here.</span></div>}</div></section><section className="patient125-card patient125-section-card"><header><div><span>Payments & receipts</span><h2>Collections</h2></div><strong className="patient125-total">{summary.receipts.length}</strong></header><div className="patient125-list">{summary.receipts.map((receipt) => <article key={receipt.id}><div><strong>{receipt.receiptNumber}</strong><p>{formatDate(receipt.issuedAt)} · {branchName(receipt.branchId)}</p></div><strong>{formatCurrency(receipt.amountCents)}</strong></article>)}{!summary.receipts.length && <div className="patient125-zero"><FileText size={22} /><strong>No receipts yet</strong><span>Completed payment receipts will appear here.</span></div>}</div></section></div></div>}

      {tab === 'records' && <div className="patient125-records-layout"><section className="patient125-card patient125-section-card"><header><div><span>Patient files</span><h2>Documents</h2><p>Uploaded records and clinical images.</p></div><strong className="patient125-total">{summary.documents.length + summary.dentalImages.length}</strong></header><div className="patient125-list patient125-files-list">{summary.documents.map((item) => <article key={item.id}><div className="patient125-file-icon"><FileText size={17} /></div><div><strong>{item.fileName}</strong><p>{formatDate(item.uploadDate)} · {sentence(item.category)}</p><small>{branchName(documentBranch(item))}</small></div></article>)}{summary.dentalImages.map((item) => <article key={item.id}><div className="patient125-file-icon"><FileText size={17} /></div><div><strong>{item.fileName}</strong><p>{formatDate(item.uploadDate)} · Clinical image</p><small>{branchName(item.treatmentId ? treatmentBranchById.get(item.treatmentId) : undefined)}</small></div></article>)}{!summary.documents.length && !summary.dentalImages.length && <div className="patient125-zero"><FileText size={22} /><strong>No documents yet</strong><span>Patient files will appear here.</span></div>}</div></section><section className="patient125-card patient125-section-card"><header><div><span>Recalls & follow-ups</span><h2>Care reminders</h2><p>Recommendations that may require another visit.</p></div><strong className="patient125-total">{activeRecalls.length}</strong></header><div className="patient125-list">{recalls.map((item) => <article key={item.id}><div><strong>{item.reason || (item.kind === 'follow_up' ? 'Follow-up recommendation' : 'Recall')}</strong><p>{item.dueDate ? `Recommended ${formatDate(item.dueDate)}` : 'Recommended date not set'} · {item.providerName || 'Care team'}</p><small>{branchName(item.branchId)}</small></div><StatusBadge status={getRecallDueBucket(item)} variant="compact" /></article>)}{!recalls.length && <div className="patient125-zero"><HeartPulse size={22} /><strong>No follow-ups</strong><span>No recall or follow-up recommendations are currently recorded.</span></div>}</div></section></div>}
    </section>
  )
}
