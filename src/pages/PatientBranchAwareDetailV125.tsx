import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, FileText, HeartPulse, Landmark, Pill, ReceiptText, Stethoscope, UserRound } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { useBranchContext } from '../features/branches/BranchContext'
import { formatCurrency } from '../features/billing/billingStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { getPatient360Summary } from '../features/patients/patient360Store'
import { getPatientDisplayName, getStoredPatients } from '../features/patients/patientStore'
import { getRecallDueBucket, getStoredPatientRecalls, listPatientRecalls, type RecallQueueItem } from '../features/recalls/recallStore'
import { getStoredServices } from '../features/services/serviceStore'

type DetailTab = 'overview' | 'appointments' | 'clinical' | 'treatments' | 'prescriptions' | 'billing' | 'documents' | 'recalls'

function formatDate(value?: string) {
  if (!value) return 'Not recorded'
  const source = value.includes('T') ? value : `${value}T00:00:00+08:00`
  const date = new Date(source)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(value?: string) {
  if (!value) return ''
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours)) return value
  return `${hours % 12 || 12}:${String(minutes || 0).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

export function PatientBranchAwareDetailV125() {
  const navigate = useNavigate()
  const { patientId } = useParams()
  const { activeBranch, isAllBranchesMode } = useBranchContext()
  const [tab, setTab] = useState<DetailTab>('overview')
  const [recalls, setRecalls] = useState<RecallQueueItem[]>([])
  const patients = useMemo(() => getStoredPatients(), [])
  const patient = useMemo(() => {
    const decoded = decodeURIComponent(patientId ?? '')
    return patients.find((row) => row.id === decoded || row.patientId === decoded) ?? null
  }, [patientId, patients])
  const summary = useMemo(() => patient ? getPatient360Summary(patient) : null, [patient])
  const branches = useMemo(() => getStoredBranches(), [])
  const providers = useMemo(() => getStoredProviders(), [])
  const services = useMemo(() => getStoredServices(), [])
  const branchMap = useMemo(() => new Map(branches.map((row) => [row.id, row.name])), [branches])
  const providerMap = useMemo(() => new Map(providers.map((row) => [row.id, row.displayName])), [providers])
  const serviceMap = useMemo(() => new Map(services.map((row) => [row.id, row.name])), [services])

  useEffect(() => {
    if (!patient?.patientId) return
    let active = true
    setRecalls(getStoredPatientRecalls(patient.patientId))
    void listPatientRecalls(patient.patientId)
      .then((rows) => { if (active) setRecalls(rows) })
      .catch(() => undefined)
    return () => { active = false }
  }, [patient?.patientId])

  if (!patient || !summary) {
    return <section className="patient125-page"><div className="patient125-empty"><UserRound size={28}/><h2>Patient record not found</h2><p>This clinic-wide patient identity could not be resolved.</p><Button onClick={() => navigate('/app/patients')}>Back to Patient Records</Button></div></section>
  }

  const branchName = (branchId?: string) => branchId ? branchMap.get(branchId) ?? 'Unknown branch' : 'Branch not recorded'
  const treatmentBranchById = new Map(summary.treatments.map((item) => [item.id, item.branchId]))
  const clinicalBranchById = new Map(summary.clinicalVisits.map((item) => [item.id, item.branchId]))
  const documentBranch = (document: { treatmentId?: string; clinicalVisitId?: string }) =>
    document.treatmentId ? treatmentBranchById.get(document.treatmentId) : document.clinicalVisitId ? clinicalBranchById.get(document.clinicalVisitId) : undefined
  const name = getPatientDisplayName(patient)
  const tabs: Array<{ key: DetailTab; label: string }> = [
    { key: 'overview', label: 'Overview' }, { key: 'appointments', label: 'Appointments' }, { key: 'clinical', label: 'Dental summaries' },
    { key: 'treatments', label: 'Treatments' }, { key: 'prescriptions', label: 'Prescriptions' }, { key: 'billing', label: 'Billing' },
    { key: 'documents', label: 'Documents' }, { key: 'recalls', label: 'Recalls' },
  ]

  return <section className="patient125-page">
    <div className="patient125-topbar"><button type="button" onClick={() => navigate('/app/patients')}><ArrowLeft size={15}/>Patient Records</button><Badge tone="info">Clinic-wide identity</Badge></div>
    <header className="patient125-hero">
      <div className="patient125-avatar">{patient.profileImage ? <img src={patient.profileImage} alt=""/> : initials(name)}</div>
      <div><span>PATIENT 360 · ALL CLINIC HISTORY</span><h1>{name}</h1><p>{patient.patientId} · Preferred branch: {patient.preferredBranchId ? branchName(patient.preferredBranchId) : 'Not set'}</p></div>
      <aside><strong>{isAllBranchesMode ? 'All Branches' : activeBranch?.name ?? 'Branch workspace'}</strong><small>The workspace changes operational actions, not this patient's identity or longitudinal care history.</small></aside>
    </header>

    <section className="patient125-kpis">
      <article><CalendarDays size={17}/><span>Appointments</span><strong>{summary.appointments.length}</strong><small>{summary.appointmentStats.completed} completed</small></article>
      <article><Stethoscope size={17}/><span>Clinical summaries</span><strong>{summary.clinicalVisits.length}</strong><small>{summary.branchHistory.length} branch{summary.branchHistory.length === 1 ? '' : 'es'} in history</small></article>
      <article><ReceiptText size={17}/><span>Outstanding</span><strong>{formatCurrency(summary.billing.outstandingBalanceCents)}</strong><small>{summary.invoices.length} invoice{summary.invoices.length === 1 ? '' : 's'}</small></article>
      <article><HeartPulse size={17}/><span>Active follow-ups</span><strong>{recalls.filter((item) => !['completed','dismissed','cancelled'].includes(item.status)).length}</strong><small>Across clinic branches</small></article>
    </section>

    <nav className="patient125-tabs" aria-label="Patient clinic-wide record sections">{tabs.map((item) => <button key={item.key} type="button" className={tab === item.key ? 'is-active' : ''} onClick={() => setTab(item.key)}>{item.label}</button>)}</nav>

    {tab === 'overview' && <div className="patient125-grid">
      <section className="patient125-card"><span>CARE LOCATIONS</span><h2>Branch history</h2><p>Patient identity is shared; these are the locations where branch-owned activity has occurred.</p><div className="patient125-branch-list">{summary.branchHistory.map((branch) => <div key={branch.id}><Landmark size={15}/><strong>{branch.name}</strong></div>)}{!summary.branchHistory.length && <small>No branch-linked activity yet.</small>}</div></section>
      <section className="patient125-card"><span>CONTACT & SAFETY</span><h2>Patient profile</h2><dl><div><dt>Phone</dt><dd>{patient.phone || 'Not recorded'}</dd></div><div><dt>Email</dt><dd>{patient.email || 'Not recorded'}</dd></div><div><dt>Allergies</dt><dd>{patient.allergies || 'None reported'}</dd></div><div><dt>Medical conditions</dt><dd>{patient.medicalConditions || 'None reported'}</dd></div></dl></section>
    </div>}

    {tab === 'appointments' && <section className="patient125-card"><header><div><span>VISIT HISTORY</span><h2>Appointments</h2></div><strong>{summary.appointments.length}</strong></header><div className="patient125-list">{summary.appointments.map((item) => <article key={item.id}><div><strong>{formatDate(item.date)} · {formatTime(item.startTime)}</strong><p>{serviceMap.get(item.serviceId) ?? 'Dental appointment'} · {item.providerId ? providerMap.get(item.providerId) ?? 'Dentist' : 'Dentist not assigned'}</p><Badge tone="info">{branchName(item.branchId)}</Badge></div><StatusBadge status={item.status} variant="compact"/></article>)}{!summary.appointments.length && <p>No appointments recorded.</p>}</div></section>}

    {tab === 'clinical' && <section className="patient125-card"><header><div><span>DENTAL SUMMARIES</span><h2>Clinical visit records</h2></div><strong>{summary.clinicalVisits.length}</strong></header><div className="patient125-list">{summary.clinicalVisits.map((item) => <article key={item.id}><div><strong>{formatDate(item.recordDate)} · {item.visitType?.replaceAll('_',' ') ?? 'Clinical visit'}</strong><p>{item.patientVisibleSummary || item.assessment || item.chiefComplaint || 'Dental visit summary'}</p><Badge tone="info">{branchName(item.branchId)}</Badge></div><small>{item.providerNameSnapshot || (item.providerId ? providerMap.get(item.providerId) : '') || 'Care team'}</small></article>)}{!summary.clinicalVisits.length && <p>No dental summaries recorded.</p>}</div></section>}

    {tab === 'treatments' && <section className="patient125-card"><header><div><span>CARE DELIVERED</span><h2>Treatments</h2></div><strong>{summary.treatments.length}</strong></header><div className="patient125-list">{summary.treatments.map((item) => <article key={item.id}><div><strong>{item.serviceNameSnapshot || serviceMap.get(item.serviceId) || item.description || 'Treatment'}</strong><p>{formatDate(item.treatmentDate)} · {item.providerNameSnapshot || (item.providerId ? providerMap.get(item.providerId) : '') || 'Care team'}</p><Badge tone="info">{branchName(item.branchId)}</Badge></div><StatusBadge status={item.status} variant="compact"/></article>)}{!summary.treatments.length && <p>No treatments recorded.</p>}</div></section>}

    {tab === 'prescriptions' && <section className="patient125-card"><header><div><span>MEDICATION</span><h2>Prescriptions</h2></div><strong>{summary.prescriptions.length}</strong></header><div className="patient125-list">{summary.prescriptions.map((item) => <article key={item.id}><div><strong>{item.medication || item.items?.map((rx) => rx.medication).filter(Boolean).join(', ') || 'Prescription'}</strong><p>{formatDate(item.prescriptionDate)} · {item.providerNameSnapshot || item.prescribedBy || 'Prescribing dentist'}</p><Badge tone="info">{branchName(item.branchId)}</Badge></div><StatusBadge status={item.status} variant="compact"/></article>)}{!summary.prescriptions.length && <p>No prescriptions recorded.</p>}</div></section>}

    {tab === 'billing' && <div className="patient125-grid"><section className="patient125-card"><header><div><span>INVOICES</span><h2>Patient billing</h2></div><strong>{formatCurrency(summary.billing.outstandingBalanceCents)}</strong></header><div className="patient125-list">{summary.invoices.map((item) => <article key={item.id}><div><strong>{item.invoiceNumber}</strong><p>{formatDate(item.invoiceDate)}</p><Badge tone="info">{branchName(item.branchId)}</Badge></div><strong>{formatCurrency(item.balanceCents)}</strong></article>)}</div></section><section className="patient125-card"><header><div><span>PAYMENTS & RECEIPTS</span><h2>Collections</h2></div><strong>{summary.receipts.length}</strong></header><div className="patient125-list">{summary.receipts.map((receipt) => <article key={receipt.id}><div><strong>{receipt.receiptNumber}</strong><p>{formatDate(receipt.issuedAt)}</p><Badge tone="info">{branchName(receipt.branchId)}</Badge></div><strong>{formatCurrency(receipt.amountCents)}</strong></article>)}</div></section></div>}

    {tab === 'documents' && <section className="patient125-card"><header><div><span>PATIENT FILES</span><h2>Documents</h2></div><strong>{summary.documents.length + summary.dentalImages.length}</strong></header><div className="patient125-list">{summary.documents.map((item) => <article key={item.id}><div><strong>{item.fileName}</strong><p>{formatDate(item.uploadDate)} · {item.category.replaceAll('_',' ')}</p><Badge tone="info">{branchName(documentBranch(item))}</Badge></div><FileText size={17}/></article>)}{summary.dentalImages.map((item) => <article key={item.id}><div><strong>{item.fileName}</strong><p>{formatDate(item.uploadDate)} · clinical image</p><Badge tone="info">{branchName(item.treatmentId ? treatmentBranchById.get(item.treatmentId) : undefined)}</Badge></div><FileText size={17}/></article>)}{!summary.documents.length && !summary.dentalImages.length && <p>No documents recorded.</p>}</div></section>}

    {tab === 'recalls' && <section className="patient125-card"><header><div><span>RECALLS & FOLLOW-UPS</span><h2>Recommendations</h2></div><strong>{recalls.length}</strong></header><div className="patient125-list">{recalls.map((item) => <article key={item.id}><div><strong>{item.reason || (item.kind === 'follow_up' ? 'Follow-up recommendation' : 'Recall')}</strong><p>{item.dueDate ? `Recommended ${formatDate(item.dueDate)}` : 'Recommended date not set'} · {item.providerName || 'Care team'}</p><Badge tone="info">{branchName(item.branchId)}</Badge></div><StatusBadge status={getRecallDueBucket(item)} variant="compact"/></article>)}{!recalls.length && <p>No recalls or follow-ups recorded.</p>}</div></section>}
  </section>
}
