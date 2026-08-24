import {
  Activity,
  ArrowRight,
  Banknote,
  CalendarCheck2,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Download,
  FileText,
  FileUser,
  HeartPulse,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  Pill,
  Printer,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DashboardGreeting } from '../components/dashboard/DashboardGreeting'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Pagination, PortalSkeleton } from '../components/ui/DesignSystem'
import { AccountSecurityPanel } from '../features/auth/AccountSecurityPanel'
import { useAuth } from '../features/auth/AuthContext'
import { getAppointmentsByPatient } from '../features/appointments/appointmentStore'
import { createPatientPortalAppointmentPersisted } from '../features/appointments/appointmentPersistence'
import { getAppointmentAvailability, getEligibleProviders } from '../features/appointments/availabilityEngine'
import {
  getInvoicesByPatient,
  getOutstandingBalanceByPatient,
  getPaymentsByPatient,
  getPaymentMethodLabel,
  getReceiptsByPatient,
} from '../features/billing/billingStore'
import { canPrintOfficialReceipt, downloadOfficialReceiptHtml, openOfficialReceiptWindow } from '../features/billing/receiptDocument'
import { getStoredBranches } from '../features/branches/branchStore'
import { CommunicationPreferencesPanel } from '../features/communications/CommunicationPreferencesPanel'
import { getDentalRecordsByPatientId } from '../features/dentalRecords/dentalRecordStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { createPatientDocumentSignedUrl, getDocumentsByPatient, type DocumentCategory, type PatientDocument } from '../features/documents/documentStore'
import { getCurrentPatientForAuthenticatedUser } from '../features/patients/patientStore'
import { TopbarNotificationBell } from '../features/notifications/TopbarNotificationBell'
import { updateMyPatientProfilePersisted } from '../features/patients/patientPersistence'
import type { Patient } from '../features/patients/patientTypes'
import { checkPatientQrPayment, createPatientQrPayment, type PatientQrPaymentSession } from '../features/patientPortal/patientPaymentPersistence'
import { hydratePatientPortalFromDatabase } from '../features/patientPortal/patientPortalHydration'
import { getPrescriptionsByPatient } from '../features/prescriptions/prescriptionStore'
import { getRecallDueBucket, getStoredPatientRecalls, linkRecallToAppointment, listPatientRecalls, type RecallQueueItem } from '../features/recalls/recallStore'
import { getStoredServices } from '../features/services/serviceStore'
import { getStoredTreatmentPlans, getTreatmentsByPatient } from '../features/treatments/treatmentStore'

const navItems = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'booking', label: 'Book a Visit', icon: CalendarDays },
  { key: 'appointments', label: 'Appointments', icon: CalendarCheck2 },
  { key: 'dental-records', label: 'Dental Records', icon: FileText },
  { key: 'recalls', label: 'Recalls & Follow-ups', icon: HeartPulse },
  { key: 'treatments', label: 'Treatments', icon: HeartPulse },
  { key: 'prescriptions', label: 'Prescriptions', icon: Pill },
  { key: 'payments', label: 'Payments', icon: WalletCards },
  { key: 'documents', label: 'Documents', icon: FileUser },
  { key: 'profile', label: 'Profile', icon: UserRound },
] as const

type TabKey = (typeof navItems)[number]['key']
type Appointment = ReturnType<typeof getAppointmentsByPatient>[number]
type DentalRecord = ReturnType<typeof getDentalRecordsByPatientId>[number]
type PatientPrescription = ReturnType<typeof getPrescriptionsByPatient>[number]
type PatientPayment = ReturnType<typeof getPaymentsByPatient>[number]
type DocumentFilter = 'all' | DocumentCategory

const navItemByKey = new Map(navItems.map((item) => [item.key, item]))
const TREATMENT_PAGE_SIZE = 5
const patientNavigationGroups: Array<{ title: string; keys: TabKey[] }> = [
  { title: 'Overview', keys: ['dashboard'] },
  { title: 'Care', keys: ['booking', 'appointments', 'dental-records', 'recalls', 'treatments', 'prescriptions'] },
  { title: 'Financial & Files', keys: ['payments', 'documents'] },
  { title: 'Account', keys: ['profile'] },
]

function money(cents: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100)
}

function serviceMoney(pesos: number) {
  if (!Number.isFinite(pesos) || pesos <= 0) return 'Price to be confirmed'
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(pesos)
}

function fileSize(bytes: number) {
  if (!bytes) return 'Size not recorded'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function clinicDate(value?: string) {
  if (!value) return 'Not set'
  const source = value.includes('T') ? value : `${value}T00:00:00+08:00`
  const date = new Date(source)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
}

function clinicDateTime(value?: string) {
  if (!value) return 'Not recorded'
  const source = value.includes('T') ? value : `${value}T00:00:00+08:00`
  const date = new Date(source)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
}

function timeLabel(value?: string) {
  if (!value) return '—'
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours)) return value
  return `${hours % 12 || 12}:${String(minutes || 0).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`
}

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', hour: '2-digit', hour12: false,
  }).format(new Date()))
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function statusLabel(value?: string) {
  if (!value) return 'Not set'
  const labels: Record<string, string> = {
    pending: 'Awaiting confirmation', confirmed: 'Confirmed', rejected: 'Not approved', cancelled: 'Cancelled',
    rescheduled: 'Rescheduled', no_show: 'Missed', checked_in: 'Checked in', waiting: 'Waiting', in_progress: 'In progress',
    completed: 'Completed', draft: 'Preparing', finalized: 'Available', amended: 'Updated', unpaid: 'Payment due',
    partially_paid: 'Partially paid', paid: 'Paid', void: 'Cancelled', voided: 'Cancelled', processing: 'Processing', failed: 'Failed',
    active: 'Active', planned: 'Planned', presented: 'Presented', accepted: 'Accepted', declined: 'Declined', not_billed: 'Not billed',
    open: 'Open', contacted: 'Contacted', waiting_patient: 'Waiting for you', booked: 'Booked', needs_rescheduling: 'Needs rescheduling', dismissed: 'Dismissed',
  }
  return labels[value] ?? value.replaceAll('_', ' ')
}

function PatientStatusBadge({ status, variant = 'standard' }: { status?: string; variant?: 'standard' | 'compact' }) {
  return <StatusBadge status={status} label={statusLabel(status)} variant={variant} />
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

function EmptyState({ icon: Icon, title, copy, action }: {
  icon: typeof FileText
  title: string
  copy: string
  action?: React.ReactNode
}) {
  return <div className="pv3-empty"><span><Icon size={22} /></span><h3>{title}</h3><p>{copy}</p>{action}</div>
}

function PageHead({ eyebrow, title, copy, action }: {
  eyebrow: string
  title: string
  copy: string
  action?: React.ReactNode
}) {
  return <div className="pv3-page-head"><div><span>{eyebrow}</span><h2>{title}</h2><p>{copy}</p></div>{action}</div>
}

function CareTrendChart({ appointments, treatments, payments }: {
  appointments: ReturnType<typeof getAppointmentsByPatient>
  treatments: ReturnType<typeof getTreatmentsByPatient>
  payments: ReturnType<typeof getPaymentsByPatient>
}) {
  const [range, setRange] = useState<6 | 12>(6)
  const [hovered, setHovered] = useState<number | null>(null)
  const data = useMemo(() => {
    const now = new Date()
    return Array.from({ length: range }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (range - index - 1), 1)
      const year = date.getFullYear()
      const month = date.getMonth()
      const visits = appointments.filter((item) => {
        const d = new Date(`${item.date}T00:00:00`)
        return d.getFullYear() === year && d.getMonth() === month && item.status !== 'cancelled'
      }).length
      const care = treatments.filter((item) => {
        if (!item.treatmentDate) return false
        const d = new Date(`${item.treatmentDate}T00:00:00`)
        return d.getFullYear() === year && d.getMonth() === month
      }).length
      const paid = payments.filter((item) => {
        const d = new Date(`${item.date}T00:00:00`)
        return d.getFullYear() === year && d.getMonth() === month && item.status === 'completed'
      }).length
      return { label: date.toLocaleDateString('en-PH', { month: 'short' }), score: visits * 3 + care * 2 + paid, visits, care }
    })
  }, [appointments, payments, range, treatments])

  const max = Math.max(...data.map((item) => item.score), 1)
  const points = data.map((item, index) => ({
    x: 24 + (index * 312) / Math.max(data.length - 1, 1),
    y: 92 - (item.score / max) * 58,
  }))
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')

  return <section className="pv3-panel pv3-chart-panel">
    <div className="pv3-panel-head">
      <div><span>CARE ACTIVITY</span><h3>Your care trend</h3><p>A compact view of visits and completed care.</p></div>
      <div className="pv3-segmented"><button className={range === 6 ? 'is-active' : ''} onClick={() => setRange(6)}>6M</button><button className={range === 12 ? 'is-active' : ''} onClick={() => setRange(12)}>12M</button></div>
    </div>
    <div className="pv3-chart-wrap">
      <svg viewBox="0 0 360 120" role="img" aria-label="Care trend chart">
        <defs><linearGradient id="pv3Area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity=".18"/><stop offset="100%" stopColor="#2563eb" stopOpacity="0"/></linearGradient></defs>
        {[34, 63, 92].map((y) => <line key={y} x1="24" x2="336" y1={y} y2={y} stroke="#edf1f7" strokeWidth="1" />)}
        <path d={`${path} L ${points.at(-1)?.x ?? 336} 100 L ${points[0]?.x ?? 24} 100 Z`} fill="url(#pv3Area)" />
        <path d={path} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => <g key={`${data[index].label}-${index}`} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)}>
          <circle cx={point.x} cy={point.y} r={hovered === index ? 5 : 3.5} fill="#fff" stroke="#2563eb" strokeWidth="2.4" />
          <circle cx={point.x} cy={point.y} r="11" fill="transparent" style={{ cursor: 'pointer' }} />
          <text x={point.x} y="116" textAnchor="middle" fontSize="8" fill="#7f8b9d">{data[index].label}</text>
          {hovered === index && <g><rect x={Math.max(3, Math.min(point.x - 39, 278))} y={Math.max(3, point.y - 31)} width="78" height="23" rx="6" fill="#172033"/><text x={Math.max(42, Math.min(point.x, 317))} y={Math.max(18, point.y - 16)} textAnchor="middle" fontSize="7.5" fill="#fff">{data[index].visits} visits · {data[index].care} care</text></g>}
        </g>)}
      </svg>
    </div>
  </section>
}

export function PatientPortalPage() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, signOut } = useAuth()
  const requestedTab = searchParams.get('tab') as TabKey | null
  const initialTab = navItems.some((item) => item.key === requestedTab) ? requestedTab! : 'dashboard'

  const [patient, setPatient] = useState<Patient | null>(null)
  const [lookupState, setLookupState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>(initialTab)
  const [mobileNav, setMobileNav] = useState(false)
  const [revision, setRevision] = useState(0)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [appointmentView, setAppointmentView] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming')
  const [selectedRecord, setSelectedRecord] = useState<DentalRecord | null>(null)
  const [selectedPrescription, setSelectedPrescription] = useState<PatientPrescription | null>(null)
  const [selectedRecall, setSelectedRecall] = useState<RecallQueueItem | null>(null)
  const [selectedPayment, setSelectedPayment] = useState<PatientPayment | null>(null)
  const [paymentHistoryView, setPaymentHistoryView] = useState<'all' | 'receipts'>('all')
  const [pendingBookingRecall, setPendingBookingRecall] = useState<RecallQueueItem | null>(null)
  const [documentFilter, setDocumentFilter] = useState<DocumentFilter>('all')
  const [recordLimit, setRecordLimit] = useState(6)
  const [treatmentPage, setTreatmentPage] = useState(1)
  const [prescriptionLimit, setPrescriptionLimit] = useState(6)

  const [bookingStep, setBookingStep] = useState(0)
  const [bookingBusy, setBookingBusy] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null)
  const [booking, setBooking] = useState({ serviceId: '', branchId: '', providerId: '', date: '', startTime: '', notes: '' })

  const [profileEditing, setProfileEditing] = useState(false)
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [profilePhotoMessage, setProfilePhotoMessage] = useState<string | null>(null)
  const [profileImage, setProfileImage] = useState('')
  const [profile, setProfile] = useState({
    firstName: '', middleName: '', lastName: '', dateOfBirth: '', email: '', phone: '', address: '',
    emergencyContact: '', emergencyContactPhone: '', emergencyContactRelationship: '',
  })

  const [payMode, setPayMode] = useState<'none' | 'cash' | 'online'>('none')
  const [payInvoiceId, setPayInvoiceId] = useState<string | null>(null)
  const [paySession, setPaySession] = useState<PatientQrPaymentSession | null>(null)
  const [payBusy, setPayBusy] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [payStatus, setPayStatus] = useState<string | null>(null)

  const resolvedPatientId = user?.role === 'patient' ? user.patientId ?? patientId : patientId

  useEffect(() => {
    let alive = true
    async function load() {
      if (!user || user.role !== 'patient') { if (alive) setLookupState('missing'); return }
      setLookupState('loading')
      try {
        const row = await getCurrentPatientForAuthenticatedUser(user.id)
        if (!alive) return
        if (!row) { setPatient(null); setLookupState('missing'); return }
        setPatient(row)
        setLookupState('ready')
      } catch (error) {
        if (!alive) return
        setLookupError(error instanceof Error ? error.message : 'Unable to load your patient record.')
        setLookupState('error')
      }
    }
    void load()
    return () => { alive = false }
  }, [patientId, user])

  useEffect(() => {
    if (!patient) return
    setProfileImage(patient.profileImage ?? '')
    setProfile({
      firstName: patient.firstName, middleName: patient.middleName, lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth, email: patient.email, phone: patient.phone, address: patient.address,
      emergencyContact: patient.emergencyContact, emergencyContactPhone: patient.emergencyContactPhone,
      emergencyContactRelationship: patient.emergencyContactRelationship ?? '',
    })
  }, [patient])

  useEffect(() => {
    document.body.classList.toggle('pv3-nav-lock', mobileNav)
    return () => document.body.classList.remove('pv3-nav-lock')
  }, [mobileNav])

  const appointments = useMemo(() => { void revision; return patient ? getAppointmentsByPatient(patient.patientId) : [] }, [patient, revision])
  const records = useMemo(() => { void revision; return patient ? getDentalRecordsByPatientId(patient.patientId) : [] }, [patient, revision])
  const recalls = useMemo(() => { void revision; return patient ? getStoredPatientRecalls(patient.patientId) : [] }, [patient, revision])
  const treatments = useMemo(() => { void revision; return patient ? getTreatmentsByPatient(patient.patientId) : [] }, [patient, revision])
  const plans = useMemo(() => { void revision; return patient ? getStoredTreatmentPlans().filter((item) => item.patientId === patient.patientId) : [] }, [patient, revision])
  const prescriptions = useMemo(() => { void revision; return patient ? getPrescriptionsByPatient(patient.patientId) : [] }, [patient, revision])
  const invoices = useMemo(() => { void revision; return patient ? getInvoicesByPatient(patient.patientId) : [] }, [patient, revision])
  const payments = useMemo(() => { void revision; return patient ? getPaymentsByPatient(patient.patientId) : [] }, [patient, revision])
  const receipts = useMemo(() => { void revision; return patient ? getReceiptsByPatient(patient.patientId) : [] }, [patient, revision])
  const documents = useMemo(() => { void revision; return patient ? getDocumentsByPatient(patient.patientId) : [] }, [patient, revision])
  const balance = useMemo(() => { void revision; return patient ? getOutstandingBalanceByPatient(patient.patientId) : 0 }, [patient, revision])

  const services = useMemo(() => getStoredServices().filter((item) => item.status === 'active' && item.onlineBookable !== false && item.internalOnly !== true), [revision])
  const branches = useMemo(() => getStoredBranches().filter((item) => item.status === 'active'), [revision])
  const providers = useMemo(() => booking.branchId ? getEligibleProviders(booking.branchId) : [], [booking.branchId, revision])
  const serviceMap = useMemo(() => new Map(getStoredServices().map((item) => [item.id, item])), [revision])
  const branchMap = useMemo(() => new Map(getStoredBranches().map((item) => [item.id, item])), [revision])
  const providerMap = useMemo(() => new Map(getStoredProviders().map((item) => [item.id, item])), [revision])

  const selectedService = services.find((item) => item.id === booking.serviceId)
  const selectedBranch = branches.find((item) => item.id === booking.branchId)
  const selectedProvider = providerMap.get(booking.providerId)
  const openInvoices = invoices.filter((invoice) => invoice.balanceCents > 0 && invoice.status !== 'void')
  const selectedPayInvoice = invoices.find((invoice) => invoice.id === payInvoiceId) ?? null
  const availability = useMemo(() => {
    if (!booking.date || !booking.serviceId || !booking.branchId) return { status: 'missing_context' as const, slots: [], eligibleProviderCount: 0, scheduledProviderCount: 0 }
    return getAppointmentAvailability({ branchId: booking.branchId, serviceId: booking.serviceId, providerId: booking.providerId || undefined, date: booking.date })
  }, [booking.branchId, booking.date, booking.providerId, booking.serviceId, revision])

  const nextAppointment = useMemo(() => [...appointments]
    .filter((item) => !['cancelled', 'no_show', 'completed'].includes(item.status))
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))[0], [appointments])
  const appointmentGroups = useMemo(() => {
    const cancelledStatuses = ['cancelled', 'no_show', 'rejected']
    const upcoming = appointments
      .filter((item) => !cancelledStatuses.includes(item.status) && item.status !== 'completed')
      .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
    const past = appointments
      .filter((item) => item.status === 'completed')
      .sort((a, b) => `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`))
    const cancelled = appointments
      .filter((item) => cancelledStatuses.includes(item.status))
      .sort((a, b) => `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`))
    return { upcoming, past, cancelled }
  }, [appointments])
  const visibleAppointments = appointmentGroups[appointmentView]
  const nextRecall = useMemo(() => recalls.find((item) => !['completed', 'dismissed', 'cancelled'].includes(item.status)), [recalls])
  const completedTreatments = treatments.filter((item) => item.status === 'completed').length
  const treatmentProgress = treatments.length ? Math.round((completedTreatments / treatments.length) * 100) : 0
  const fullName = patient ? `${patient.firstName} ${patient.middleName ? `${patient.middleName} ` : ''}${patient.lastName}`.trim() : ''
  const activePlan = plans.find((item) => ['planned', 'scheduled', 'in_progress'].includes(item.status)) ?? plans[0]
  const recentDocuments = [...documents].sort((a, b) => String(b.uploadDate).localeCompare(String(a.uploadDate))).slice(0, 2)
  const recentPrescriptions = [...prescriptions]
    .filter((item) => item.status !== 'voided')
    .sort((a, b) => String(b.prescriptionDate).localeCompare(String(a.prescriptionDate)))
    .slice(0, 2)
  const sortedRecords = [...records].sort((a, b) => String(b.recordDate).localeCompare(String(a.recordDate)))
  const visibleRecords = sortedRecords.slice(0, recordLimit)
  const sortedTreatments = [...treatments].sort((a, b) => String(b.treatmentDate || b.createdAt).localeCompare(String(a.treatmentDate || a.createdAt)))
  const treatmentPageCount = Math.max(1, Math.ceil(sortedTreatments.length / TREATMENT_PAGE_SIZE))
  const safeTreatmentPage = Math.min(Math.max(treatmentPage, 1), treatmentPageCount)
  const treatmentStartIndex = sortedTreatments.length ? (safeTreatmentPage - 1) * TREATMENT_PAGE_SIZE : 0
  const treatmentEndIndex = Math.min(treatmentStartIndex + TREATMENT_PAGE_SIZE, sortedTreatments.length)
  const visibleTreatments = sortedTreatments.slice(treatmentStartIndex, treatmentEndIndex)
  const sortedPrescriptions = [...prescriptions].sort((a, b) => String(b.prescriptionDate).localeCompare(String(a.prescriptionDate)))
  const visiblePrescriptions = sortedPrescriptions.slice(0, prescriptionLimit)
  const recallAppointments = useMemo(() => new Map(appointments.map((item) => [item.id, item])), [appointments])
  const receiptMap = useMemo(() => new Map(receipts.map((item) => [item.paymentId, item])), [receipts])
  const paidAmount = payments.filter((item) => ['completed', 'partially_refunded', 'refunded'].includes(item.status)).reduce((sum, item) => sum + item.allocatedCents, 0)
  const invoiceTotal = invoices.filter((item) => item.status !== 'void').reduce((sum, item) => sum + item.totalCents, 0)
  const recentPayments = payments.slice(0, 8)
  const paymentsWithReceipts = payments.filter((payment) => payment.status === 'completed' && receiptMap.has(payment.id))
  const visiblePaymentHistory = paymentHistoryView === 'receipts' ? paymentsWithReceipts : recentPayments
  const documentCategories = useMemo(() => Array.from(new Set(documents.map((item) => item.category))), [documents])
  const visibleDocuments = documentFilter === 'all' ? documents : documents.filter((item) => item.category === documentFilter)
  const canBookRecall = (recall: RecallQueueItem) => !recall.linkedAppointmentId && !['booked', 'completed', 'dismissed', 'cancelled'].includes(recall.status)

  useEffect(() => {
    setTreatmentPage(1)
  }, [resolvedPatientId, treatments.length])

  useEffect(() => {
    if (treatmentPage > treatmentPageCount) setTreatmentPage(treatmentPageCount)
  }, [treatmentPage, treatmentPageCount])

  useEffect(() => {
    if (!paySession || payMode !== 'online') return
    let cancelled = false
    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const result = await checkPatientQrPayment(paySession.paymentId)
          if (cancelled) return
          if (result.completed) {
            window.clearInterval(interval)
            setPayStatus('Payment confirmed automatically. Your balance and receipt are updated.')
            await hydratePatientPortalFromDatabase()
            if (!cancelled) setRevision((value) => value + 1)
          }
        } catch {
          // Keep polling silent. The manual status action surfaces any error to the patient.
        }
      })()
    }, 5000)
    return () => { cancelled = true; window.clearInterval(interval) }
  }, [payMode, paySession])

  if (!resolvedPatientId) return <Navigate to="/login" replace />
  if (lookupState === 'loading') return <PortalSkeleton variant="patient" message="Loading your latest clinic information" />
  if (lookupState === 'error') return <div className="pv3-loading"><strong>We could not load your portal</strong><small>{lookupError}</small></div>
  if (!patient) return <div className="pv3-loading"><strong>No patient record found</strong><small>Please contact the clinic so your account can be linked.</small></div>

  function openTab(next: TabKey) {
    setTab(next)
    setMobileNav(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function updateBooking(key: keyof typeof booking, value: string) {
    setBooking((current) => {
      if (key === 'serviceId') return { ...current, serviceId: value, startTime: '' }
      if (key === 'branchId') return { ...current, branchId: value, providerId: '', date: '', startTime: '' }
      if (key === 'providerId' || key === 'date') return { ...current, [key]: value, startTime: '' }
      return { ...current, [key]: value }
    })
    setBookingError(null)
  }

  function bookRecallFollowUp(recall: RecallQueueItem) {
    if (!canBookRecall(recall)) return
    const nextBooking = {
      serviceId: recall.serviceId ?? '',
      branchId: recall.branchId ?? '',
      providerId: recall.providerId ?? '',
      date: recall.dueDate && recall.dueDate >= manilaToday() ? recall.dueDate : '',
      startTime: '',
      notes: `Follow-up request for: ${recall.reason || statusLabel(recall.kind)}${recall.patientMessage ? `\n${recall.patientMessage}` : ''}`,
    }
    setPendingBookingRecall(recall)
    setSelectedRecall(null)
    setBookingSuccess(null)
    setBookingError(null)
    setBooking(nextBooking)
    setBookingStep(nextBooking.serviceId ? nextBooking.branchId ? nextBooking.providerId ? 3 : 2 : 1 : 0)
    openTab('booking')
  }

  async function bookingNext() {
    if (bookingBusy) return
    if (bookingStep === 0 && !booking.serviceId) return setBookingError('Choose a service to continue.')
    if (bookingStep === 1 && !booking.branchId) return setBookingError('Choose a clinic branch to continue.')
    if (bookingStep === 3 && (!booking.date || !booking.startTime)) return setBookingError('Choose an available date and time.')
    if (bookingStep < 4) { setBookingStep((value) => value + 1); return }
    const slot = availability.slots.find((item) => item.startTime === booking.startTime && (!booking.providerId || item.providerId === booking.providerId))
    if (!slot || !selectedService) return setBookingError('That time is no longer available. Please select another slot.')
    setBookingBusy(true)
    setBookingError(null)
    try {
      const appointment = await createPatientPortalAppointmentPersisted({
        branchId: booking.branchId, serviceId: booking.serviceId, providerId: slot.providerId,
        date: booking.date, startTime: booking.startTime, notes: booking.notes.trim(),
      })
      if (pendingBookingRecall) {
        await linkRecallToAppointment(pendingBookingRecall.id, appointment.id)
        await listPatientRecalls(appointment.patientId)
        setPendingBookingRecall(null)
      }
      setBookingSuccess(appointment.appointmentNumber ?? appointment.id)
      setRevision((value) => value + 1)
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : 'Unable to submit this appointment request.')
    } finally {
      setBookingBusy(false)
    }
  }

  function resetBooking() {
    setBooking({ serviceId: '', branchId: '', providerId: '', date: '', startTime: '', notes: '' })
    setBookingStep(0)
    setBookingSuccess(null)
    setBookingError(null)
    setPendingBookingRecall(null)
  }

  async function saveProfile() {
    if (profileBusy) return
    setProfileBusy(true)
    setProfileMessage(null)
    try {
      const updated = await updateMyPatientProfilePersisted({ ...profile, profileImage })
      setPatient(updated)
      setProfileEditing(false)
      setProfileMessage('Profile updated successfully.')
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Unable to save your profile.')
    } finally {
      setProfileBusy(false)
    }
  }

  async function syncPatientAuthEmail(email: string) {
    const updated = await updateMyPatientProfilePersisted({ ...profile, email, profileImage })
    setPatient(updated)
    setProfile((current) => ({ ...current, email: updated.email }))
  }

  function handlePatientProfileImage(file?: File) {
    if (!file) return
    setProfilePhotoMessage(null)
    setProfileMessage(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setProfilePhotoMessage('Upload a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfilePhotoMessage('Profile photo must be 2 MB or smaller.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setProfileImage(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsDataURL(file)
  }

  function choosePayment(invoiceId: string, mode: 'cash' | 'online') {
    setPayInvoiceId(invoiceId)
    setPayMode(mode)
    setPaySession(null)
    setPayError(null)
    setPayStatus(null)
  }

  function getPatientReceiptPayload(payment: PatientPayment) {
    if (!patient) return
    if (payment.patientId !== patient.patientId) return
    const receipt = receiptMap.get(payment.id)
    const invoice = invoices.find((item) => item.id === payment.invoiceId)
    const branch = branchMap.get(receipt?.branchId ?? payment.branchId ?? invoice?.branchId ?? '')
    return { receipt, payment, invoice, patient: { name: fullName, patientId: patient.patientId }, branch }
  }

  function printPatientReceipt(payment: PatientPayment) {
    const payload = getPatientReceiptPayload(payment)
    if (!payload || !canPrintOfficialReceipt(payload)) return
    openOfficialReceiptWindow(payload)
  }

  function downloadPatientReceipt(payment: PatientPayment) {
    const payload = getPatientReceiptPayload(payment)
    if (!payload || !canPrintOfficialReceipt(payload)) return
    downloadOfficialReceiptHtml(payload)
  }

  async function openPatientDocument(document: PatientDocument) {
    const opened = window.open('', '_blank', 'noopener,noreferrer')
    let url = document.content
    if (!url && document.storagePath) url = await createPatientDocumentSignedUrl(document.storagePath, 300)
    if (!url) {
      opened?.close()
      window.alert('This document could not be opened. Please refresh the portal and try again.')
      return
    }
    if (opened) opened.location.href = url
    else window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function startQrPayment() {
    if (!payInvoiceId || payBusy) return
    setPayBusy(true)
    setPayError(null)
    setPayStatus(null)
    try {
      const session = await createPatientQrPayment(payInvoiceId)
      setPaySession(session)
      setPayStatus('QR ready. Payment status will refresh automatically after you pay.')
    } catch (error) {
      setPayError(error instanceof Error ? error.message : 'Unable to start online payment.')
    } finally {
      setPayBusy(false)
    }
  }

  async function checkQrStatus() {
    if (!paySession || payBusy) return
    setPayBusy(true)
    setPayError(null)
    try {
      const result = await checkPatientQrPayment(paySession.paymentId)
      if (result.completed) {
        setPayStatus('Payment confirmed. Your invoice and receipt have been updated.')
        await hydratePatientPortalFromDatabase()
        setRevision((value) => value + 1)
      } else {
        setPayStatus('Payment is not confirmed yet. We will keep checking automatically.')
      }
    } catch (error) {
      setPayError(error instanceof Error ? error.message : 'Unable to confirm payment status.')
    } finally {
      setPayBusy(false)
    }
  }

  const pageCopy: Record<TabKey, [string, string]> = {
    dashboard: ['Overview', 'A clear snapshot of your visits, care progress and account.'],
    booking: ['Book a Visit', 'Choose a service and reserve a real available clinic schedule.'],
    appointments: ['Appointments', 'Review upcoming and previous visits with complete appointment details.'],
    'dental-records': ['Dental Records', 'Patient-visible summaries from completed clinical visits.'],
    recalls: ['Recalls & Follow-ups', 'Recommended return visits and follow-up coordination shared by your clinic.'],
    treatments: ['Treatments', 'Follow your treatment plan, progress, schedule and quoted care.'],
    prescriptions: ['Prescriptions', 'Read medication and dosage instructions issued by your dentist.'],
    payments: ['Payments & Invoices', 'Review balances and pay an issued invoice in clinic or through QR Ph.'],
    documents: ['Documents', 'Secure files your clinic has intentionally shared with you.'],
    profile: ['Profile', 'Manage contact, emergency and communication information.'],
  }

  return <div className="pv3-shell">
    <button className={`pv3-backdrop ${mobileNav ? 'is-open' : ''}`} type="button" aria-label="Close navigation" onClick={() => setMobileNav(false)} />
    <aside className={`pv3-sidebar ${mobileNav ? 'is-open' : ''}`}>
      <div className="pv3-brand"><span>P</span><div><strong>Plamenco</strong><small>Dental Co.</small></div><button type="button" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18}/></button></div>
      <nav className="pv3-nav" aria-label="Patient portal navigation">
        {patientNavigationGroups.map((group) => (
          <section className="pv3-nav-section" key={group.title} aria-label={group.title}>
            <p>{group.title}</p>
            {group.keys.map((key) => {
              const item = navItemByKey.get(key)
              if (!item) return null
              const Icon = item.icon
              return <button key={item.key} type="button" className={tab === item.key ? 'is-active' : ''} onClick={() => openTab(item.key)}><Icon size={18}/><span>{item.label}</span></button>
            })}
          </section>
        ))}
      </nav>
      <div className="pv3-sidebar-footer">
        <div className="pv3-account">
          <span className="pv3-avatar" style={profileImage ? { backgroundImage: `url(${profileImage})` } : undefined}>{!profileImage && initials(fullName)}</span>
          <div><strong>{fullName}</strong><small>{patient.patientId}</small></div>
        </div>
        <div className="pv3-secure"><LockKeyhole size={15}/><span><strong>Secure patient access</strong><small>Private clinic information</small></span></div>
        <button type="button" className="pv3-signout" onClick={() => { void signOut(); navigate('/login', { replace: true }) }}><LogOut size={16}/><span>Sign out</span></button>
      </div>
    </aside>

    <main className="pv3-main">
      <header className="pv3-topbar">
        <button className="pv3-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20}/></button>
        <div className="pv3-topbar-copy"><span>{greeting()}</span><h1>{pageCopy[tab][0]}</h1><p>{pageCopy[tab][1]}</p></div>
        <div className="pv3-topbar-actions-v8"><TopbarNotificationBell className="is-patient" /><button className="pv3-top-book" onClick={() => openTab('booking')}><CalendarDays size={15}/><span>Book visit</span></button></div>
      </header>

      <div className="pv3-content">
        {tab === 'dashboard' && <section className="pv3-dashboard-v2">
          <DashboardGreeting
            variant="patient"
            eyebrow="Patient dashboard"
            name={patient.firstName}
            subtitle="Here's what's coming up in your dental care."
            signal="Your care view"
            icon={<HeartPulse size={18} />}
            actions={
              <>
                <button type="button" onClick={() => openTab('booking')}><CalendarDays size={15} />Book visit</button>
                {nextAppointment && <button type="button" className="is-secondary" onClick={() => setSelectedAppointment(nextAppointment)}><CalendarCheck2 size={15} />View appointment</button>}
              </>
            }
          />

          <div className="pv3-dashboard-priority">
            <section className="pv3-care-card pv3-next-visit">
              <div className="pv3-care-card-head"><span><CalendarCheck2 size={18}/></span><div><small>NEXT APPOINTMENT</small><h3>{nextAppointment ? clinicDate(nextAppointment.date) : 'No visit scheduled'}</h3></div></div>
              {nextAppointment ? (
                <>
                  <div className="pv3-appointment-focus">
                    <div className="pv3-date-tile"><strong>{new Date(`${nextAppointment.date}T00:00:00`).getDate()}</strong><span>{new Date(`${nextAppointment.date}T00:00:00`).toLocaleDateString('en-PH',{month:'short'}).toUpperCase()}</span></div>
                    <div>
                      <PatientStatusBadge status={nextAppointment.status} />
                      <h4>{serviceMap.get(nextAppointment.serviceId)?.name ?? 'Dental appointment'}</h4>
                      <dl>
                        <div><dt>Time</dt><dd><Clock3 size={14}/>{timeLabel(nextAppointment.startTime)}</dd></div>
                        <div><dt>Dentist</dt><dd><Stethoscope size={14}/>{providerMap.get(nextAppointment.providerId ?? '')?.displayName ?? 'Assigned by clinic'}</dd></div>
                        <div><dt>Branch</dt><dd><MapPin size={14}/>{branchMap.get(nextAppointment.branchId ?? '')?.name ?? 'Clinic branch'}</dd></div>
                      </dl>
                    </div>
                  </div>
                  <button type="button" className="pv3-dashboard-link" onClick={() => setSelectedAppointment(nextAppointment)}>View appointment <ChevronRight size={15}/></button>
                </>
              ) : (
                <div className="pv3-soft-empty"><CalendarDays size={22}/><div><strong>No upcoming appointment</strong><p>Choose an available time when you are ready for your next visit.</p></div><button type="button" onClick={() => openTab('booking')}>Book now</button></div>
              )}
            </section>

            {balance > 0 && (
              <section className="pv3-care-card pv3-balance-card">
                <div className="pv3-care-card-head"><span><CircleDollarSign size={18}/></span><div><small>PAYMENT DUE</small><h3>{money(balance)}</h3></div></div>
                <p>{openInvoices.length} open invoice{openInvoices.length === 1 ? '' : 's'} awaiting payment.</p>
                <button type="button" className="pv3-dashboard-link" onClick={() => openTab('payments')}>Review payments <ChevronRight size={15}/></button>
              </section>
            )}
          </div>

          <div className="pv3-dashboard-care-grid">
            <section className="pv3-care-card">
              <div className="pv3-care-card-head"><span><HeartPulse size={18}/></span><div><small>UPCOMING FOLLOW-UP</small><h3>{nextRecall?.dueDate ? clinicDate(nextRecall.dueDate) : 'No follow-up due'}</h3></div></div>
              {nextRecall ? (
                <div className="pv3-care-summary">
                  <PatientStatusBadge status={nextRecall.status} />
                  <p>{nextRecall.reason || (nextRecall.kind === 'follow_up' ? 'Follow-up recommended by your care team.' : 'Routine recall recommended by your care team.')}</p>
                  <small>{nextRecall.providerName ? `Dentist: ${nextRecall.providerName}` : 'Plamenco Dental Co.'}</small>
                  <button type="button" className="pv3-dashboard-link" onClick={() => openTab('recalls')}>View follow-up <ChevronRight size={15}/></button>
                </div>
              ) : <div className="pv3-compact-empty">Your clinic has not posted a follow-up recommendation right now.</div>}
            </section>

            <section className="pv3-care-card">
              <div className="pv3-care-card-head"><span><CheckCircle2 size={18}/></span><div><small>TREATMENT PROGRESS</small><h3>{activePlan ? activePlan.name : 'No active treatment plan'}</h3></div></div>
              {activePlan ? (
                <div className="pv3-care-summary">
                  <div className="pv3-treatment-status"><PatientStatusBadge status={activePlan.status} /><strong>{treatmentProgress}%</strong></div>
                  <div className="pv3-progress"><i style={{width:`${treatmentProgress}%`}}/></div>
                  <p>{activePlan.description || `${completedTreatments} of ${treatments.length} treatment item${treatments.length === 1 ? '' : 's'} completed.`}</p>
                  <button type="button" className="pv3-dashboard-link" onClick={() => openTab('treatments')}>View treatments <ChevronRight size={15}/></button>
                </div>
              ) : <div className="pv3-compact-empty">Treatment plans shared by your dentist will appear here.</div>}
            </section>
          </div>

          <div className="pv3-dashboard-secondary">
            <section className="pv3-care-card">
              <div className="pv3-care-card-head"><span><FileUser size={18}/></span><div><small>RECENT DOCUMENTS</small><h3>Clinic-shared files</h3></div></div>
              <div className="pv3-dashboard-list">
                {recentDocuments.map((document) => <article key={document.id}><span><FileUser size={16}/></span><div><strong>{document.fileName}</strong><p>{document.category.replaceAll('_',' ')} - {clinicDate(document.uploadDate)}</p></div><a className="portal-link" href={document.content || '#'} data-patient-document-id={document.id}>Open</a></article>)}
                {!recentDocuments.length && <div className="pv3-compact-empty">No shared documents yet.</div>}
              </div>
              {recentDocuments.length > 0 && <button type="button" className="pv3-dashboard-link" onClick={() => openTab('documents')}>View documents <ChevronRight size={15}/></button>}
            </section>

            <section className="pv3-care-card">
              <div className="pv3-care-card-head"><span><Pill size={18}/></span><div><small>PRESCRIPTIONS</small><h3>{recentPrescriptions.length ? 'Recent medication notes' : 'No active prescriptions'}</h3></div></div>
              <div className="pv3-dashboard-list">
                {recentPrescriptions.map((rx) => <article key={rx.id}><span><Pill size={16}/></span><div><strong>{rx.medication || rx.items?.map((item)=>item.medication).filter(Boolean).join(', ') || 'Prescription'}</strong><p>{statusLabel(rx.status)} - Issued {clinicDate(rx.prescriptionDate)}</p></div><PatientStatusBadge status={rx.status} /></article>)}
                {!recentPrescriptions.length && <div className="pv3-compact-empty">Prescriptions from your dentist will appear here when relevant.</div>}
              </div>
              {recentPrescriptions.length > 0 && <button type="button" className="pv3-dashboard-link" onClick={() => openTab('prescriptions')}>View prescriptions <ChevronRight size={15}/></button>}
            </section>
          </div>
        </section>}

        {tab === ('dashboard-legacy' as TabKey) && <>
          <section className="pv3-greeting">
            <div><span className="pv3-wave">👋</span><div><p>{greeting()}</p><h2>Welcome back, <em>{patient.firstName}</em></h2><span>Here is a quick look at your dental care today.</span></div></div>
            <div className="pv3-greeting-actions"><button onClick={() => openTab('booking')}><CalendarDays size={16}/>Book a visit</button><button onClick={() => openTab('payments')}><WalletCards size={16}/>View billing</button></div>
          </section>

          <section className="pv3-kpis">
            <article><span><CalendarCheck2 size={17}/></span><div><small>NEXT VISIT</small><strong>{nextAppointment ? clinicDate(nextAppointment.date) : 'No visit'}</strong><p>{nextAppointment ? `${timeLabel(nextAppointment.startTime)} · ${serviceMap.get(nextAppointment.serviceId)?.name ?? 'Appointment'}` : 'Book when you are ready'}</p></div></article>
            <article><span><HeartPulse size={17}/></span><div><small>NEXT FOLLOW-UP</small><strong>{nextRecall?.dueDate ? clinicDate(nextRecall.dueDate) : 'None due'}</strong><p>{nextRecall ? statusLabel(nextRecall.status) : 'No active recall on file'}</p></div></article>
            <article className={balance > 0 ? 'is-due' : ''}><span><CircleDollarSign size={17}/></span><div><small>OUTSTANDING</small><strong>{money(balance)}</strong><p>{openInvoices.length ? `${openInvoices.length} open invoice${openInvoices.length === 1 ? '' : 's'}` : 'Your account is settled'}</p></div></article>
            <article><span><FileText size={17}/></span><div><small>SHARED RECORDS</small><strong>{records.length + documents.length}</strong><p>{records.length} clinical · {documents.length} documents</p></div></article>
          </section>

          <div className="pv3-dashboard-grid">
            <CareTrendChart appointments={appointments} treatments={treatments} payments={payments}/>
            <section className="pv3-panel pv3-next-panel"><div className="pv3-panel-head"><div><span>NEXT APPOINTMENT</span><h3>Your upcoming visit</h3></div><button onClick={() => openTab('appointments')}>View all <ChevronRight size={14}/></button></div>{nextAppointment ? <div className="pv3-next-card"><div className="pv3-date-tile"><strong>{new Date(`${nextAppointment.date}T00:00:00`).getDate()}</strong><span>{new Date(`${nextAppointment.date}T00:00:00`).toLocaleDateString('en-PH',{month:'short'}).toUpperCase()}</span></div><div><PatientStatusBadge status={nextAppointment.status} /><h4>{serviceMap.get(nextAppointment.serviceId)?.name ?? 'Dental appointment'}</h4><p><Clock3 size={14}/>{timeLabel(nextAppointment.startTime)}</p><p><MapPin size={14}/>{branchMap.get(nextAppointment.branchId ?? '')?.name ?? 'Clinic branch'}</p></div></div> : <EmptyState icon={CalendarDays} title="No upcoming visit" copy="Choose an available schedule whenever you are ready." action={<Button size="sm" onClick={() => openTab('booking')}>Book a visit</Button>}/>}</section>
          </div>

          <div className="pv3-dashboard-grid lower">
            <section className="pv3-panel"><div className="pv3-panel-head"><div><span>TREATMENT PLAN</span><h3>Current care plan</h3></div><button onClick={() => openTab('treatments')}>Details <ChevronRight size={14}/></button></div>{plans[0] ? <div className="pv3-plan-summary"><div><strong>{plans[0].name}</strong><PatientStatusBadge status={plans[0].status} /></div><p>{plans[0].description || 'Your treatment plan is being coordinated by your dentist.'}</p><div className="pv3-progress"><i style={{width:`${treatmentProgress}%`}}/></div><footer><span>{treatmentProgress}% complete</span>{Number(plans[0].quotedTotalCents ?? 0) > 0 && <strong>{money(Number(plans[0].quotedTotalCents))}</strong>}</footer></div> : <EmptyState icon={HeartPulse} title="No active care plan" copy="Your dentist will publish a treatment plan here when appropriate."/>}</section>
            <section className="pv3-panel"><div className="pv3-panel-head"><div><span>RECENT ACTIVITY</span><h3>Latest updates</h3></div></div><div className="pv3-activity">{[
              ...appointments.slice(-2).map((item) => ({ key:`a-${item.id}`, title:'Appointment update', copy:`${serviceMap.get(item.serviceId)?.name ?? 'Visit'} · ${statusLabel(item.status)}`, date:item.date, Icon:CalendarDays })),
              ...payments.slice(-2).map((item) => ({ key:`p-${item.id}`, title:'Payment recorded', copy:`${money(item.amountCents)} · ${statusLabel(item.status)}`, date:item.date, Icon:CreditCard })),
              ...records.slice(-2).map((item) => ({ key:`r-${item.id}`, title:'Dental summary shared', copy:item.chiefComplaint || 'Clinical summary', date:item.recordDate, Icon:FileText })),
              ...recalls.slice(0,2).map((item) => ({ key:`f-${item.id}`, title:item.kind === 'follow_up' ? 'Follow-up recommended' : 'Recall reminder', copy:item.reason || statusLabel(item.status), date:item.dueDate ?? item.createdAt, Icon:HeartPulse })),
            ].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5).map((item)=><div key={item.key}><span><item.Icon size={15}/></span><section><strong>{item.title}</strong><p>{item.copy}</p></section><small>{clinicDate(item.date)}</small></div>)}{!appointments.length&&!payments.length&&!records.length&&!recalls.length&&<EmptyState icon={Activity} title="Nothing new yet" copy="Clinic activity will appear here."/>}</div></section>
          </div>
        </>}

        {tab === 'booking' && <section className="pv3-page pv3-booking-v3">
          <PageHead eyebrow="GUIDED BOOKING" title="Book a visit" copy="Choose one step at a time. Available slots are checked against clinic schedules, dentist availability and existing bookings."/>
          {bookingSuccess ? <div className="pv3-success"><span><CheckCircle2 size={30}/></span><h2>Appointment request sent</h2><p>Reference <strong>{bookingSuccess}</strong> is now waiting for clinic confirmation.</p><div><Button onClick={() => openTab('appointments')}>View appointments</Button><Button variant="secondary" onClick={resetBooking}>Book another</Button></div></div> : <div className="pv3-booking-shell-v3">
            <section className="pv3-book-stage">
              <div className="pv3-book-progress-v3">{['Service','Branch','Dentist','Date & time','Review'].map((label,index)=><div key={label} className={index < bookingStep ? 'is-complete' : index === bookingStep ? 'is-current' : ''}><span>{index < bookingStep ? <Check size={13}/> : index+1}</span><small>{label}</small></div>)}</div>
              {bookingError && <div className="pv3-alert is-error">{bookingError}</div>}
              <div className="pv3-book-step-card">
                {bookingStep===0&&<><div className="pv3-step-title"><span><Stethoscope size={18}/></span><div><h3>Choose the reason for your visit</h3><p>Select a service from the clinic catalog. Fees and durations stay connected to the same internal service records.</p></div></div><div className="pv3-service-grid pv3-picker-grid">{services.map((service)=><button type="button" key={service.id} className={booking.serviceId===service.id?'is-selected':''} onClick={()=>updateBooking('serviceId',service.id)}><span className="pv3-service-icon"><Stethoscope size={18}/></span><div><strong>{service.name}</strong><p>{service.description || 'Dental service'}</p><small>{service.duration} min</small></div><b>{serviceMoney(service.price)}</b></button>)}</div>{!services.length&&<div className="pv3-inline-empty">No online-bookable services are available right now. Please contact the clinic.</div>}</>}
                {bookingStep===1&&<><div className="pv3-step-title"><span><MapPin size={18}/></span><div><h3>Choose your clinic branch</h3><p>Pick the location where you want this appointment to happen.</p></div></div><div className="pv3-choice-grid pv3-picker-grid">{branches.map((branch)=><button type="button" key={branch.id} className={booking.branchId===branch.id?'is-selected':''} onClick={()=>updateBooking('branchId',branch.id)}><MapPin size={20}/><strong>{branch.name}</strong><small>{[branch.city,branch.province].filter(Boolean).join(', ') || 'Plamenco Dental Co.'}</small></button>)}</div>{!branches.length&&<div className="pv3-inline-empty">No active branches are available for online booking.</div>}</>}
                {bookingStep===2&&<><div className="pv3-step-title"><span><Stethoscope size={18}/></span><div><h3>Choose a dentist</h3><p>Select a preferred dentist, or let the clinic match you to the earliest qualified availability.</p></div></div><div className="pv3-choice-grid pv3-picker-grid"><button type="button" className={!booking.providerId?'is-selected':''} onClick={()=>updateBooking('providerId','')}><Sparkles size={20}/><strong>Any available dentist</strong><small>Use the earliest matching availability</small></button>{providers.map((provider)=><button type="button" key={provider.id} className={booking.providerId===provider.id?'is-selected':''} onClick={()=>updateBooking('providerId',provider.id)}><Stethoscope size={20}/><strong>{provider.displayName}</strong><small>{provider.role.replaceAll('_',' ')}</small></button>)}</div>{booking.branchId&&!providers.length&&<div className="pv3-inline-empty">No dentist schedule is available for this branch yet.</div>}</>}
                {bookingStep===3&&<><div className="pv3-step-title"><span><CalendarDays size={18}/></span><div><h3>Pick an available date and time</h3><p>Unavailable or already booked times are removed before you can select them.</p></div></div><div className="pv3-schedule-picker"><label className="pv3-field pv3-date-field"><span>Preferred date</span><input type="date" min={manilaToday()} value={booking.date} onChange={(e)=>updateBooking('date',e.target.value)}/></label><div className="pv3-slot-grid">{availability.slots.map((slot)=><button type="button" key={`${slot.providerId}-${slot.startTime}-${slot.operatoryId ?? 'none'}`} className={booking.startTime===slot.startTime&&booking.providerId===slot.providerId?'is-selected':''} onClick={()=>{setBooking((current)=>({...current,startTime:slot.startTime,providerId:slot.providerId}));setBookingError(null)}}><Clock3 size={15}/><strong>{timeLabel(slot.startTime)}</strong><small>{slot.providerName}</small></button>)}</div></div>{booking.date&&!availability.slots.length&&<div className="pv3-inline-empty">No available slots for this selection. Try another date or dentist.</div>}</>}
                {bookingStep===4&&<><div className="pv3-step-title"><span><ShieldCheck size={18}/></span><div><h3>Review your appointment request</h3><p>Confirm the details before sending this request to the clinic team.</p></div></div><div className="pv3-review-grid pv3-review-v3"><div><span>Service</span><strong>{selectedService?.name ?? '—'}</strong></div><div><span>Dentist</span><strong>{selectedProvider?.displayName ?? 'Any available dentist'}</strong></div><div><span>Branch</span><strong>{selectedBranch?.name ?? '—'}</strong></div><div><span>Date</span><strong>{clinicDate(booking.date)}</strong></div><div><span>Time</span><strong>{timeLabel(booking.startTime)}</strong></div><div><span>Estimated amount</span><strong>{selectedService?serviceMoney(selectedService.price):'—'}</strong></div></div><label className="pv3-field"><span>Notes for the clinic</span><textarea rows={4} value={booking.notes} onChange={(e)=>updateBooking('notes',e.target.value)} placeholder="Symptoms, concerns, or anything your care team should know."/></label><div className="pv3-info-note"><Banknote size={17}/><div><strong>Payment is handled after billing</strong><p>Once the clinic issues an invoice, you can pay in person or through QR Ph from Payments.</p></div></div></>}
              </div>
              <footer className="pv3-book-actions pv3-book-actions-v3"><Button variant="secondary" disabled={bookingStep===0||bookingBusy} onClick={()=>setBookingStep((step)=>Math.max(0,step-1))}><ChevronLeft size={15}/>Back</Button><Button disabled={bookingBusy} onClick={()=>void bookingNext()}>{bookingBusy?'Submitting...':bookingStep===4?'Confirm request':'Continue'}{bookingStep<4&&<ArrowRight size={15}/>}</Button></footer>
            </section>
            <aside className="pv3-book-summary-v3"><span>VISIT SUMMARY</span><h3>{selectedService?.name ?? 'Your next dental visit'}</h3><p>{selectedService?.description || 'Your choices appear here as you move through booking.'}</p><dl><div><dt>Branch</dt><dd>{selectedBranch?.name ?? 'Choose a branch'}</dd></div><div><dt>Dentist</dt><dd>{selectedProvider?.displayName ?? 'Any available dentist'}</dd></div><div><dt>Schedule</dt><dd>{booking.date?`${clinicDate(booking.date)} - ${timeLabel(booking.startTime)}`:'Choose date and time'}</dd></div><div><dt>Estimated amount</dt><dd>{selectedService?serviceMoney(selectedService.price):'—'}</dd></div></dl><small>Final availability is revalidated before the appointment request is saved.</small></aside>
          </div>}
        </section>}

        {tab === ('booking-legacy' as TabKey) && <section className="pv3-page">
          <PageHead eyebrow="APPOINTMENT REQUEST" title="Book your next visit" copy="A guided booking experience connected to your clinic's live service catalog and appointment availability."/>
          {bookingSuccess ? <div className="pv3-success"><span><CheckCircle2 size={30}/></span><h2>Appointment request sent</h2><p>Reference <strong>{bookingSuccess}</strong> is now waiting for clinic confirmation.</p><div><Button onClick={() => openTab('appointments')}>View appointments</Button><Button variant="secondary" onClick={resetBooking}>Book another</Button></div></div> : <div className="pv3-book-layout">
            <section className="pv3-panel pv3-book-card">
              <div className="pv3-book-steps">{['Service','Branch','Dentist','Schedule','Review'].map((label,index)=><div key={label} className={index <= bookingStep ? 'is-active' : ''}><span>{index < bookingStep ? <Check size={13}/> : index+1}</span><small>{label}</small></div>)}</div>
              {bookingError && <div className="pv3-alert is-error">{bookingError}</div>}
              <div className="pv3-book-body">
                {bookingStep===0&&<><div className="pv3-step-title"><span><Stethoscope size={18}/></span><div><h3>Select a service</h3><p>Prices are pulled from the same clinic service catalog used by internal portals.</p></div></div><div className="pv3-service-grid">{services.map((service)=><button key={service.id} className={booking.serviceId===service.id?'is-selected':''} onClick={()=>updateBooking('serviceId',service.id)}><span className="pv3-service-icon"><Stethoscope size={18}/></span><div><strong>{service.name}</strong><p>{service.description || 'Dental service'}</p><small>{service.duration} min</small></div><b>{serviceMoney(service.price)}</b></button>)}</div></>}
                {bookingStep===1&&<><div className="pv3-step-title"><span><MapPin size={18}/></span><div><h3>Choose a clinic branch</h3><p>Select the branch that is most convenient for your visit.</p></div></div><div className="pv3-choice-grid">{branches.map((branch)=><button key={branch.id} className={booking.branchId===branch.id?'is-selected':''} onClick={()=>updateBooking('branchId',branch.id)}><MapPin size={20}/><strong>{branch.name}</strong><small>{[branch.city,branch.province].filter(Boolean).join(', ') || 'Plamenco Dental Co.'}</small></button>)}</div></>}
                {bookingStep===2&&<><div className="pv3-step-title"><span><Stethoscope size={18}/></span><div><h3>Choose your dentist</h3><p>Select a provider or let the clinic assign an available dentist.</p></div></div><div className="pv3-choice-grid"><button className={!booking.providerId?'is-selected':''} onClick={()=>updateBooking('providerId','')}><Sparkles size={20}/><strong>Any available dentist</strong><small>Use the earliest matching availability</small></button>{providers.map((provider)=><button key={provider.id} className={booking.providerId===provider.id?'is-selected':''} onClick={()=>updateBooking('providerId',provider.id)}><Stethoscope size={20}/><strong>{provider.displayName}</strong><small>{provider.role.replaceAll('_',' ')}</small></button>)}</div></>}
                {bookingStep===3&&<><div className="pv3-step-title"><span><CalendarDays size={18}/></span><div><h3>Pick a date and time</h3><p>Booked or conflicting provider slots are automatically removed from availability.</p></div></div><label className="pv3-field pv3-date-field"><span>Preferred date</span><input type="date" min={manilaToday()} value={booking.date} onChange={(e)=>updateBooking('date',e.target.value)}/></label><div className="pv3-slot-grid">{availability.slots.map((slot)=><button key={`${slot.providerId}-${slot.startTime}-${slot.operatoryId ?? 'none'}`} className={booking.startTime===slot.startTime&&booking.providerId===slot.providerId?'is-selected':''} onClick={()=>{setBooking((current)=>({...current,startTime:slot.startTime,providerId:slot.providerId}));setBookingError(null)}}><Clock3 size={15}/><strong>{timeLabel(slot.startTime)}</strong><small>{slot.providerName}</small></button>)}</div>{booking.date&&!availability.slots.length&&<div className="pv3-inline-empty">No available slots for this selection. Try another date or dentist.</div>}</>}
                {bookingStep===4&&<><div className="pv3-step-title"><span><ShieldCheck size={18}/></span><div><h3>Review appointment</h3><p>Confirm the details before sending your request.</p></div></div><div className="pv3-review-grid"><div><span>Service</span><strong>{selectedService?.name ?? '—'}</strong></div><div><span>Estimated fee</span><strong>{selectedService?serviceMoney(selectedService.price):'—'}</strong></div><div><span>Branch</span><strong>{selectedBranch?.name ?? '—'}</strong></div><div><span>Dentist</span><strong>{selectedProvider?.displayName ?? 'Any available dentist'}</strong></div><div><span>Date</span><strong>{clinicDate(booking.date)}</strong></div><div><span>Time</span><strong>{timeLabel(booking.startTime)}</strong></div></div><label className="pv3-field"><span>Notes for the clinic</span><textarea rows={4} value={booking.notes} onChange={(e)=>updateBooking('notes',e.target.value)} placeholder="Symptoms, concerns, or anything your care team should know."/></label><div className="pv3-info-note"><Banknote size={17}/><div><strong>Payment is handled after billing</strong><p>Once the clinic issues an invoice, you can pay in person or through QR Ph from Payments.</p></div></div></>}
              </div>
              <footer className="pv3-book-actions"><Button variant="secondary" disabled={bookingStep===0||bookingBusy} onClick={()=>setBookingStep((step)=>Math.max(0,step-1))}><ChevronLeft size={15}/>Back</Button><Button disabled={bookingBusy} onClick={()=>void bookingNext()}>{bookingBusy?'Submitting…':bookingStep===4?'Confirm appointment':'Continue'}{bookingStep<4&&<ArrowRight size={15}/>}</Button></footer>
            </section>
            <aside className="pv3-panel pv3-book-summary"><span>VISIT SUMMARY</span><h3>{selectedService?.name ?? 'Your next dental visit'}</h3><p>{selectedService?.description || 'Build your appointment step by step.'}</p><div className="pv3-book-price"><span>Estimated fee</span><strong>{selectedService?serviceMoney(selectedService.price):'—'}</strong></div><ul><li><MapPin size={15}/><span>{selectedBranch?.name ?? 'Choose a branch'}</span></li><li><Stethoscope size={15}/><span>{selectedProvider?.displayName ?? 'Any available dentist'}</span></li><li><CalendarDays size={15}/><span>{booking.date?`${clinicDate(booking.date)} · ${timeLabel(booking.startTime)}`:'Choose a schedule'}</span></li></ul><small>The selected time is revalidated by PostgreSQL when the appointment is submitted.</small></aside>
          </div>}
        </section>}

        {tab === 'appointments' && <section className="pv3-page pv3-appointments-v3">
          <PageHead eyebrow="YOUR VISITS" title="Appointments" copy="Upcoming, past and cancelled requests, with patient-safe appointment details." action={<Button size="sm" onClick={()=>openTab('booking')}>Book a visit</Button>}/>
          <div className="pv3-appointment-tabs" role="tablist" aria-label="Appointment sections">
            {([
              ['upcoming','Upcoming',appointmentGroups.upcoming.length],
              ['past','Past',appointmentGroups.past.length],
              ['cancelled','Cancelled',appointmentGroups.cancelled.length],
            ] as const).map(([key,label,count])=><button key={key} type="button" role="tab" aria-selected={appointmentView===key} className={appointmentView===key?'is-active':''} onClick={()=>setAppointmentView(key)}><span>{label}</span><strong>{count}</strong></button>)}
          </div>
          <div className="pv3-appointment-list pv3-appointment-list-v3">
            {visibleAppointments.map((item)=><button type="button" key={item.id} className="pv3-appointment-card pv3-appointment-card-v3" onClick={()=>setSelectedAppointment(item)}><div className="pv3-date-tile"><strong>{new Date(`${item.date}T00:00:00`).getDate()}</strong><span>{new Date(`${item.date}T00:00:00`).toLocaleDateString('en-PH',{month:'short'}).toUpperCase()}</span></div><section><div><PatientStatusBadge status={item.status} /><small>{item.appointmentNumber ?? item.id}</small></div><h3>{serviceMap.get(item.serviceId)?.name ?? 'Dental appointment'}</h3><p><Clock3 size={14}/>{timeLabel(item.startTime)}<span>-</span><Stethoscope size={14}/>{providerMap.get(item.providerId ?? '')?.displayName ?? 'Dentist assigned by clinic'}</p><p><MapPin size={14}/>{branchMap.get(item.branchId ?? '')?.name ?? 'Clinic branch'}</p></section><aside><PatientStatusBadge status={item.paymentStatus ?? 'not_billed'} variant="compact" /><ChevronRight size={17}/></aside></button>)}
            {!visibleAppointments.length&&<EmptyState icon={CalendarDays} title={appointmentView==='upcoming'?'No upcoming appointments':appointmentView==='past'?'No completed visits yet':'No cancelled appointments'} copy={appointmentView==='upcoming'?'When you book or receive confirmation for a future visit, it will appear here.':appointmentView==='past'?'Completed appointments will appear here after your clinic closes the visit.':'Cancelled, rejected or missed appointments will appear here for reference.'} action={appointmentView==='upcoming'?<Button onClick={()=>openTab('booking')}>Book appointment</Button>:undefined}/>}
          </div>
        </section>}

        {tab === ('appointments-legacy' as TabKey) && <section className="pv3-page">
          <PageHead eyebrow="YOUR VISITS" title="Appointments" copy="Every upcoming and previous appointment, with clinic status and complete visit details." action={<Button size="sm" onClick={()=>openTab('booking')}>Book a visit</Button>}/>
          <div className="pv3-appointment-stats"><div><span>Upcoming</span><strong>{appointments.filter((item)=>!['completed','cancelled','no_show','rejected'].includes(item.status)).length}</strong></div><div><span>Completed</span><strong>{appointments.filter((item)=>item.status==='completed').length}</strong></div><div><span>Total visits</span><strong>{appointments.length}</strong></div></div>
          <div className="pv3-appointment-list">{[...appointments].sort((a,b)=>`${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`)).map((item)=><button key={item.id} className="pv3-appointment-card" onClick={()=>setSelectedAppointment(item)}><div className="pv3-date-tile"><strong>{new Date(`${item.date}T00:00:00`).getDate()}</strong><span>{new Date(`${item.date}T00:00:00`).toLocaleDateString('en-PH',{month:'short'}).toUpperCase()}</span></div><section><div><PatientStatusBadge status={item.status} /><small>{item.appointmentNumber ?? item.id}</small></div><h3>{serviceMap.get(item.serviceId)?.name ?? 'Dental appointment'}</h3><p><Clock3 size={14}/>{timeLabel(item.startTime)}<span>•</span><MapPin size={14}/>{branchMap.get(item.branchId ?? '')?.name ?? 'Clinic branch'}</p></section><aside><span>{providerMap.get(item.providerId ?? '')?.displayName ?? 'Dentist assigned by clinic'}</span><PatientStatusBadge status={item.paymentStatus ?? 'not_billed'} variant="compact" /><ChevronRight size={17}/></aside></button>)}{!appointments.length&&<EmptyState icon={CalendarDays} title="No appointments yet" copy="When you book your first visit, it will appear here." action={<Button onClick={()=>openTab('booking')}>Book appointment</Button>}/>}</div>
        </section>}

        {tab === 'dental-records' && <section className="pv3-page pv3-clinical-history-v4">
          <PageHead eyebrow="CLINICAL HISTORY" title="Dental records" copy="Patient-visible visit summaries and follow-up notes shared by your clinic."/>
          <section className="pv3-history-summary">
            <article><FileText size={20}/><span><strong>{records.length}</strong><small>Shared records</small></span></article>
            <article><CheckCircle2 size={20}/><span><strong>{records.filter((item)=>['finalized','amended'].includes(item.status)).length}</strong><small>Finalized summaries</small></span></article>
            <article><CalendarCheck2 size={20}/><span><strong>{sortedRecords[0]?clinicDate(sortedRecords[0].recordDate):'None yet'}</strong><small>Most recent visit</small></span></article>
          </section>
          <section className="pv3-history-panel">
            <header><div><span>VISIT TIMELINE</span><h3>Your clinical summaries</h3><p>Click any record to view the patient-facing details your care team has shared.</p></div></header>
            <div className="pv3-history-timeline">
              {visibleRecords.map((record)=><button type="button" key={record.id} onClick={()=>setSelectedRecord(record)}><span className="pv3-history-dot"><FileText size={17}/></span><section><div><PatientStatusBadge status={record.status} /><small>{clinicDate(record.recordDate)}</small></div><h3>{record.chiefComplaint || 'Dental visit summary'}</h3><p>{record.visitType.replaceAll('_',' ')}{record.followUpDate?` - Follow-up ${clinicDate(record.followUpDate)}`:''}</p></section><ChevronRight size={18}/></button>)}
              {!records.length&&<EmptyState icon={FileText} title="No shared dental records" copy="Your dentist can publish patient-visible visit summaries here after care is finalized."/>}
            </div>
            {visibleRecords.length < sortedRecords.length && <button type="button" className="pv3-load-more" onClick={()=>setRecordLimit((value)=>value+6)}>Load more records</button>}
          </section>
        </section>}

        {tab === ('dental-records-legacy' as TabKey) && <section className="pv3-page">
          <PageHead eyebrow="CLINICAL SUMMARIES" title="Dental Records" copy="Finalized patient-visible summaries from your clinical visits. Click a record to view details."/>
          <div className="pv3-record-overview"><div><FileText size={20}/><span><strong>{records.length}</strong><small>Shared records</small></span></div><div><CheckCircle2 size={20}/><span><strong>{records.filter((item)=>['finalized','amended'].includes(item.status)).length}</strong><small>Finalized summaries</small></span></div><div><CalendarCheck2 size={20}/><span><strong>{records[0]?clinicDate(records[0].recordDate):'—'}</strong><small>Most recent record</small></span></div></div>
          <div className="pv3-record-list">{records.map((record)=><button key={record.id} onClick={()=>setSelectedRecord(record)}><span className="pv3-record-icon"><FileText size={19}/></span><section><div><PatientStatusBadge status={record.status} /><small>{clinicDate(record.recordDate)}</small></div><h3>{record.chiefComplaint || 'Dental visit summary'}</h3><p>{record.visitType.replaceAll('_',' ')}{record.followUpDate?` · Follow-up ${clinicDate(record.followUpDate)}`:''}</p></section><ChevronRight size={18}/></button>)}{!records.length&&<EmptyState icon={FileText} title="No shared dental records" copy="Your dentist can publish patient-visible visit summaries here after care is finalized."/>}</div>
        </section>}

        {tab === 'recalls' && <section className="pv3-page pv3-recalls-v5">
          <header className="pv3-recalls-hero-v5">
            <div><span><HeartPulse size={14}/> Recommended return visits</span><h2>Recalls & Follow-Ups</h2><p>Future care recommendations shared by your clinic, with booking status and related appointment details.</p></div>
            <Button size="sm" onClick={()=>openTab('booking')}><CalendarDays size={15}/>Book a visit</Button>
          </header>
          <div className="pv3-recall-summary-v5">
            <article><span><HeartPulse size={18}/></span><div><strong>{recalls.filter((item)=>!['completed','dismissed','cancelled'].includes(item.status)).length}</strong><small>Active recommendations</small></div></article>
            <article><span><CalendarDays size={18}/></span><div><strong>{nextRecall?.dueDate ? clinicDate(nextRecall.dueDate) : 'None'}</strong><small>Next recommended date</small></div></article>
            <article><span><CheckCircle2 size={18}/></span><div><strong>{recalls.filter((item)=>item.status==='booked'||Boolean(item.linkedAppointmentId)).length}</strong><small>Already booked</small></div></article>
          </div>
          <div className="pv3-recall-list-v5">
            {recalls.map((item: RecallQueueItem)=>{
              const linkedAppointment = item.linkedAppointmentId ? recallAppointments.get(item.linkedAppointmentId) : undefined
              const relatedTreatment = item.sourceId ? treatments.find((treatment)=>treatment.id === item.sourceId) : undefined
              const branchName = item.branchId ? branchMap.get(item.branchId)?.name : ''
              const title = item.reason || (item.kind === 'follow_up' ? 'Follow-up recommended' : 'Recall reminder')
              return (
                <article
                  key={item.id}
                  className="pv3-recall-card-v5"
                  role="button"
                  tabIndex={0}
                  aria-label={`Open recall details for ${title}`}
                  onClick={()=>setSelectedRecall(item)}
                  onKeyDown={(event)=>{
                    if(event.key==='Enter'||event.key===' '){
                      event.preventDefault()
                      setSelectedRecall(item)
                    }
                  }}
                >
                  <span className="pv3-recall-icon-v5"><HeartPulse size={19}/></span>
                  <section className="pv3-recall-main-v5">
                    <div className="pv3-recall-card-top-v5"><PatientStatusBadge status={item.status} />{getRecallDueBucket(item)==='overdue'&&<PatientStatusBadge status="overdue" />}<small>{item.kind.replaceAll('_',' ')}</small></div>
                    <h3>{title}</h3>
                    <p>{item.patientMessage || 'Your clinic recommends a return visit.'}</p>
                    <dl>
                      <div><dt>Recommended</dt><dd>{item.dueDate ? clinicDate(item.dueDate) : 'No date set'}</dd></div>
                      <div><dt>Dentist</dt><dd>{item.providerName || 'Care team'}</dd></div>
                      <div><dt>Related care</dt><dd>{relatedTreatment?.serviceNameSnapshot || (item.sourceId ? `${item.sourceType.replaceAll('_',' ')} ${item.sourceId}` : item.sourceType.replaceAll('_',' '))}</dd></div>
                      <div><dt>Branch</dt><dd>{branchName || 'Clinic branch'}</dd></div>
                    </dl>
                  </section>
                  <aside className="pv3-recall-action-v5">
                    {linkedAppointment ? <span className="pv3-linked-appointment-v5">Booked: {linkedAppointment.appointmentNumber ?? linkedAppointment.id}</span> : <span>{item.linkedAppointmentId ? `Appointment ${item.linkedAppointmentId}` : 'Not booked'}</span>}
                    {canBookRecall(item)&&<button type="button" onClick={(event)=>{event.stopPropagation();bookRecallFollowUp(item)}} onKeyDown={(event)=>event.stopPropagation()}><CalendarDays size={14}/>Book follow-up</button>}
                    <b>Details <ChevronRight size={15}/></b>
                  </aside>
                </article>
              )
            })}
            {!recalls.length&&<EmptyState icon={HeartPulse} title="No recalls or follow-ups" copy="When your clinic recommends a future return visit, it will appear here." action={<Button onClick={()=>openTab('booking')}>Book a visit</Button>}/>}
          </div>
        </section>}

        {tab === 'treatments' && <section className="pv3-page pv3-treatments-v4">
          <PageHead eyebrow="CARE PLAN" title="Treatments" copy="A patient-friendly view of planned, ongoing and completed dental care."/>
          <section className="pv3-treatment-overview-v4">
            <div><span>OVERALL PROGRESS</span><strong>{treatmentProgress}%</strong><p>{completedTreatments} of {treatments.length} treatment item{treatments.length===1?'':'s'} completed</p><div className="pv3-progress"><i style={{width:`${treatmentProgress}%`}}/></div></div>
            <aside><small>CURRENT PLAN</small><h3>{activePlan?.name ?? 'No active plan'}</h3><p>{activePlan?.description || 'Your dentist will share treatment plan details when appropriate.'}</p>{activePlan&&<PatientStatusBadge status={activePlan.status} />}</aside>
          </section>
          <section className="pv3-treatment-panel-v4">
            <header><div><span>TREATMENT HISTORY</span><h3>Care items</h3><p>Costs shown here reflect patient-facing treatment records when available.</p></div></header>
            <div className="pv3-treatment-cards-v4">
              {visibleTreatments.map((item,index)=><article key={item.id}><div className={`pv3-treatment-marker ${item.status==='completed'?'is-done':''}`}>{item.status==='completed'?<Check size={14}/>:treatmentStartIndex+index+1}</div><section><div><PatientStatusBadge status={item.status} />{item.toothNumber&&<small>Tooth {item.toothNumber}</small>}</div><h3>{item.serviceNameSnapshot || item.description || 'Dental treatment'}</h3><p>{item.description || 'Care item added by your dentist.'}</p><dl><div><dt>Dentist</dt><dd>{item.providerNameSnapshot || providerMap.get(item.providerId ?? '')?.displayName || 'Care team'}</dd></div><div><dt>Date</dt><dd>{item.treatmentDate?clinicDate(item.treatmentDate):'To be scheduled'}</dd></div><div><dt>Cost</dt><dd>{Number(item.priceSnapshotCents??0)>0?money(Number(item.priceSnapshotCents)):'To be confirmed'}</dd></div></dl></section></article>)}
              {!treatments.length&&<EmptyState icon={HeartPulse} title="No treatments yet" copy="Treatment items created by your dentist will appear here."/>}
            </div>
            {sortedTreatments.length > TREATMENT_PAGE_SIZE && <div className="pv3-treatment-pagination-v6"><span>Showing {treatmentStartIndex + 1}-{treatmentEndIndex} of {sortedTreatments.length}</span><Pagination page={safeTreatmentPage} pageCount={treatmentPageCount} onPageChange={setTreatmentPage} label="Treatment history pagination" /></div>}
          </section>
        </section>}

        {tab === ('treatments-legacy' as TabKey) && <section className="pv3-page">
          <PageHead eyebrow="CARE PLAN" title="Treatments" copy="A detailed view of planned, active and completed care."/>
          <div className="pv3-treatment-hero"><section><span>OVERALL PROGRESS</span><strong>{treatmentProgress}%</strong><p>{completedTreatments} of {treatments.length} treatment items completed</p><div className="pv3-progress"><i style={{width:`${treatmentProgress}%`}}/></div></section><aside><span>Current plan</span><h3>{plans[0]?.name ?? 'No active plan'}</h3><PatientStatusBadge status={plans[0]?.status ?? 'planned'} />{Number(plans[0]?.quotedTotalCents ?? 0)>0&&<div><small>Quoted total</small><strong>{money(Number(plans[0]?.quotedTotalCents))}</strong></div>}</aside></div>
          <div className="pv3-treatment-layout"><section className="pv3-panel"><div className="pv3-panel-head"><div><span>TREATMENT TIMELINE</span><h3>Your care items</h3></div></div><div className="pv3-treatment-list">{treatments.map((item,index)=><article key={item.id}><div className={`pv3-treatment-marker ${item.status==='completed'?'is-done':''}`}>{item.status==='completed'?<Check size={14}/>:index+1}</div><section><div><PatientStatusBadge status={item.status} />{item.toothNumber&&<small>Tooth {item.toothNumber}</small>}</div><h4>{item.serviceNameSnapshot || item.description || 'Dental treatment'}</h4><p>{item.description || 'Care item added by your dentist.'}</p><footer><span><CalendarDays size={13}/>{item.treatmentDate?clinicDate(item.treatmentDate):'To be scheduled'}</span>{Number(item.priceSnapshotCents??0)>0&&<strong>{money(Number(item.priceSnapshotCents))}</strong>}</footer></section></article>)}{!treatments.length&&<EmptyState icon={HeartPulse} title="No treatments yet" copy="Treatment items created by your dentist will appear here."/>}</div></section><aside className="pv3-panel pv3-plan-detail"><span>PLAN DETAILS</span><h3>{plans[0]?.name ?? 'Treatment plan'}</h3><p>{plans[0]?.description || 'No detailed treatment plan has been shared yet.'}</p><dl><div><dt>Status</dt><dd>{statusLabel(plans[0]?.status)}</dd></div><div><dt>Items</dt><dd>{treatments.length}</dd></div><div><dt>Completed</dt><dd>{completedTreatments}</dd></div><div><dt>Remaining</dt><dd>{Math.max(treatments.length-completedTreatments,0)}</dd></div></dl></aside></div>
        </section>}

        {tab === 'prescriptions' && <section className="pv3-page pv3-prescriptions-v4">
          <PageHead eyebrow="MEDICATION" title="Prescriptions" copy="Read-only medication instructions issued by your dentist."/>
          <div className="pv3-rx-cards-v4">{visiblePrescriptions.map((rx)=><button type="button" key={rx.id} onClick={()=>setSelectedPrescription(rx)}><header><span><Pill size={19}/></span><PatientStatusBadge status={rx.status} /></header><small>Issued {clinicDate(rx.prescriptionDate)}</small><h3>{rx.medication || rx.items?.map((item)=>item.medication).filter(Boolean).join(', ') || 'Prescription'}</h3><dl><div><dt>Dosage</dt><dd>{rx.dosage || rx.items?.[0]?.dosage || 'As directed'}</dd></div><div><dt>Frequency</dt><dd>{rx.frequency || rx.items?.[0]?.frequency || 'As directed'}</dd></div><div><dt>Duration</dt><dd>{rx.duration || rx.items?.[0]?.duration || 'As directed'}</dd></div></dl>{rx.instructions&&<p>{rx.instructions}</p>}<footer><span><Stethoscope size={14}/>{rx.providerNameSnapshot || 'Prescribing dentist'}</span><span>View details <ChevronRight size={14}/></span></footer></button>)}{!prescriptions.length&&<EmptyState icon={Pill} title="No prescriptions" copy="Medication orders created by your dentist during a clinical visit will appear here."/>}</div>
          {visiblePrescriptions.length < sortedPrescriptions.length && <button type="button" className="pv3-load-more" onClick={()=>setPrescriptionLimit((value)=>value+6)}>Load more prescriptions</button>}
        </section>}

        {tab === ('prescriptions-legacy' as TabKey) && <section className="pv3-page">
          <PageHead eyebrow="MEDICATION" title="Prescriptions" copy="Read-only medication and dosage instructions issued by your dentist. Prescription creation remains inside the clinical workspace."/>
          <div className="pv3-rx-grid">{prescriptions.map((rx)=><article key={rx.id}><header><span><Pill size={19}/></span><PatientStatusBadge status={rx.status} /></header><small>Issued {clinicDate(rx.prescriptionDate)}</small><h3>{rx.medication || rx.items?.map((item)=>item.medication).filter(Boolean).join(', ') || 'Prescription'}</h3><div>{rx.items?.map((item)=><section key={item.id}><strong>{item.medication}</strong>{item.strength&&<span>{item.strength}</span>}<dl><div><dt>Dosage</dt><dd>{item.dosage||'As directed'}</dd></div><div><dt>Frequency</dt><dd>{item.frequency||'As directed'}</dd></div><div><dt>Duration</dt><dd>{item.duration||'As directed'}</dd></div></dl>{item.instructions&&<p>{item.instructions}</p>}</section>)}</div>{rx.providerNameSnapshot&&<footer><Stethoscope size={14}/><span>Prescribed by {rx.providerNameSnapshot}</span></footer>}</article>)}{!prescriptions.length&&<EmptyState icon={Pill} title="No prescriptions" copy="Medication orders created by your dentist during a clinical visit will appear here."/>}</div>
        </section>}

        {tab === 'payments' && <section className="pv3-page pv3-payments-v6">
          <PageHead eyebrow="FINANCIAL CENTER" title="Payments & Receipts" copy="Review your invoices, payments, remaining balances and official clinic receipts."/>
          <section className="pv3-payments-summary-v6">
            <article className={balance > 0 ? 'is-due' : 'is-clear'}><span><CircleDollarSign size={20}/></span><div><small>Outstanding balance</small><strong>{money(balance)}</strong><p>{openInvoices.length?`${openInvoices.length} open invoice${openInvoices.length===1?'':'s'}`:'Your account is settled'}</p></div></article>
            <article><span><CheckCircle2 size={20}/></span><div><small>Paid amount</small><strong>{money(paidAmount)}</strong><p>Completed posted payments</p></div></article>
            <article className={receipts.length ? 'is-receipt-action' : ''}><span><ReceiptText size={20}/></span><div><small>Official receipts</small><strong>{receipts.length}</strong><p>{receipts.length ? 'Open completed payments with receipts' : 'Generated from completed payments'}</p>{receipts.length>0&&<button type="button" onClick={()=>setPaymentHistoryView('receipts')}>View receipts</button>}</div></article>
            <article><span><FileText size={20}/></span><div><small>Total invoiced</small><strong>{money(invoiceTotal)}</strong><p>{invoices.length} invoice{invoices.length===1?'':'s'} on file</p></div></article>
          </section>
          <div className="pv3-payments-layout-v6">
            <section className="pv3-payments-panel-v6">
              <div className="pv3-payments-panel-head-v6"><div><span>INVOICES</span><h3>Balances to review</h3></div><Badge tone={balance > 0 ? 'danger' : 'success'}>{balance > 0 ? 'Payment due' : 'Settled'}</Badge></div>
              <div className="pv3-invoice-list-v6">
                {invoices.map((invoice)=><article key={invoice.id} className={invoice.balanceCents > 0 ? 'is-open' : ''}><header><div><span><ReceiptText size={18}/></span><section><strong>{invoice.invoiceNumber}</strong><p>Issued {clinicDate(invoice.invoiceDate)}{invoice.dueDate?` · Due ${clinicDate(invoice.dueDate)}`:''}</p></section></div><PatientStatusBadge status={invoice.status} /></header><div className="pv3-invoice-services-v6">{invoice.items.slice(0,3).map((item)=><span key={item.id}>{item.description}</span>)}{invoice.items.length>3&&<span>{invoice.items.length-3} more item{invoice.items.length-3===1?'':'s'}</span>}{!invoice.items.length&&<span>Dental services</span>}</div><div className="pv3-invoice-money"><div><span>Total</span><strong>{money(invoice.totalCents)}</strong></div><div><span>Paid</span><strong>{money(invoice.amountPaidCents)}</strong></div><div className="is-due"><span>Remaining</span><strong>{money(invoice.balanceCents)}</strong></div></div>{invoice.balanceCents>0&&invoice.status!=='void'&&<footer><button type="button" onClick={()=>choosePayment(invoice.id,'cash')}><Banknote size={15}/>Pay in clinic</button><button type="button" className="is-online" onClick={()=>choosePayment(invoice.id,'online')}><QrCode size={15}/>Pay with QR Ph</button></footer>}</article>)}
                {!invoices.length&&<EmptyState icon={CheckCircle2} title="No invoices yet" copy="Clinic invoices and balances will appear here after care is billed."/>}
              </div>
            </section>
            <aside className="pv3-payments-panel-v6">
              <div className="pv3-payments-panel-head-v6"><div><span>PAYMENT HISTORY</span><h3>{paymentHistoryView==='receipts'?'Receipts available':'Recent payments'}</h3></div><span>{visiblePaymentHistory.length}</span></div>
              {receipts.length>0&&<div className="pv3-payment-filter-v7"><button type="button" className={paymentHistoryView==='all'?'is-active':''} onClick={()=>setPaymentHistoryView('all')}>All</button><button type="button" className={paymentHistoryView==='receipts'?'is-active':''} onClick={()=>setPaymentHistoryView('receipts')}>Receipts</button></div>}
              <div className="pv3-payment-history-v6">{visiblePaymentHistory.map((payment)=>{const receipt=receiptMap.get(payment.id);const hasReceipt=payment.status==='completed'&&Boolean(receipt);return <article key={payment.id} className={hasReceipt?'has-receipt':''} tabIndex={0} role="button" aria-label={hasReceipt?`View official receipt ${receipt?.receiptNumber}`:`View payment ${payment.paymentNumber || payment.id}`} onClick={()=>setSelectedPayment(payment)} onKeyDown={(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelectedPayment(payment)}}}><span className="pv3-pay-icon">{hasReceipt?<ReceiptText size={15}/>:<CreditCard size={15}/>}</span><section><strong>{payment.paymentNumber || money(payment.amountCents)}</strong><p>{clinicDate(payment.date)} · {getPaymentMethodLabel(payment.paymentMethod)}</p><small>{hasReceipt ? `Receipt ${receipt?.receiptNumber}` : payment.status === 'completed' ? 'Receipt posting pending' : 'Receipt unavailable until completed'}</small></section><div><PatientStatusBadge status={payment.status} /><strong>{money(payment.amountCents)}</strong>{hasReceipt&&<button type="button" onClick={(event)=>{event.stopPropagation();setSelectedPayment(payment)}}>View receipt</button>}</div></article>})}{!payments.length&&<EmptyState icon={CreditCard} title="No payments yet" copy="Completed clinic payments and receipt links will appear here."/>}{payments.length>0&&!visiblePaymentHistory.length&&<EmptyState icon={ReceiptText} title="No receipts in this view" copy="Completed payments with official receipts will appear here."/>}</div>
              {receipts.length>0&&<button type="button" className="pv3-receipts-v6" onClick={()=>setPaymentHistoryView('receipts')}><ReceiptText size={16}/><span>{receipts.length} official receipt{receipts.length===1?'':'s'} available</span><strong>View receipts</strong></button>}
            </aside>
          </div>
        </section>}

        {tab === 'documents' && <section className="pv3-page pv3-documents-v7">
          <PageHead eyebrow="SECURE FILE CENTER" title="Documents" copy="Clinic-shared files, referrals, consent copies and images opened through secure patient access."/>
          <section className="pv3-document-summary-v7"><article><FileUser size={20}/><div><strong>{documents.length}</strong><span>Shared files</span></div></article><article><ShieldCheck size={20}/><div><strong>{documents.filter((item)=>item.patientVisible!==false).length}</strong><span>Patient-visible</span></div></article><article><CalendarDays size={20}/><div><strong>{documents[0]?.uploadDate ? clinicDate(documents[0].uploadDate) : 'None yet'}</strong><span>Most recent</span></div></article></section>
          {documents.length>6&&<div className="pv3-document-filters-v7"><button type="button" className={documentFilter==='all'?'is-active':''} onClick={()=>setDocumentFilter('all')}>All</button>{documentCategories.map((category)=><button key={category} type="button" className={documentFilter===category?'is-active':''} onClick={()=>setDocumentFilter(category)}>{category.replaceAll('_',' ')}</button>)}</div>}
          <div className="pv3-document-list-v7">{visibleDocuments.map((document)=><article key={document.id}><span className="pv3-document-icon-v7"><FileUser size={21}/></span><section><div><strong>{document.fileName}</strong><Badge tone="info">{document.category.replaceAll('_',' ')}</Badge></div><p>{document.description || 'Shared securely by your clinic'}</p><dl><div><dt>Date</dt><dd>{clinicDate(document.uploadDate)}</dd></div><div><dt>Type</dt><dd>{document.fileType || 'File'}</dd></div><div><dt>Size</dt><dd>{fileSize(document.sizeBytes)}</dd></div></dl>{(document.treatmentId||document.clinicalVisitId)&&<small>Related to {document.treatmentId ? `treatment ${document.treatmentId}` : `visit ${document.clinicalVisitId}`}</small>}</section><aside><button type="button" onClick={()=>void openPatientDocument(document)}>Preview / Download <ArrowRight size={14}/></button></aside></article>)}{!visibleDocuments.length&&<EmptyState icon={FileUser} title={documents.length?'No documents in this category':'No shared documents'} copy={documents.length?'Choose another category to view shared files.':'Files only appear here when your clinic intentionally marks them visible to you.'}/>}</div>
        </section>}

        {tab === 'profile' && <section className="pv3-page unified-profile-page">
          <header className="unified-profile-hero">
            <div className="unified-profile-identity">
              <label className={`unified-profile-avatar ${profileEditing ? 'is-editable' : ''}`} style={profileImage?{backgroundImage:`url(${profileImage})`}:undefined} aria-label={profileEditing ? 'Change profile photo' : 'Patient profile photo'}>
                {!profileImage&&initials(fullName)}
                {profileEditing&&<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>handlePatientProfileImage(event.target.files?.[0])}/>}
                {profileEditing&&<span aria-hidden="true"><Camera size={17}/></span>}
              </label>
              <div className="unified-profile-title">
                <span>Patient account</span>
                <h2>{fullName}</h2>
                <p>{patient.patientId} - Verified patient</p>
                <div className="unified-profile-meta"><PatientStatusBadge status="active" /><span><ShieldCheck size={14}/> Patient Portal</span><span>{profile.email || patient.email || 'No email'}</span></div>
              </div>
            </div>
            <div className="unified-profile-actions">
              {profileEditing ? (
                <>
                  <Button size="sm" variant="secondary" disabled={profileBusy} onClick={()=>{setProfileEditing(false);setProfilePhotoMessage(null);setProfileMessage(null);setProfileImage(patient.profileImage ?? '')}}>Cancel</Button>
                  <Button size="sm" disabled={profileBusy} onClick={()=>void saveProfile()}>{profileBusy?'Saving...':'Save changes'}</Button>
                </>
              ) : <Button size="sm" onClick={()=>setProfileEditing(true)}>Edit profile</Button>}
            </div>
          </header>
          {(profileMessage||profilePhotoMessage)&&<div className={`pv3-alert ${profilePhotoMessage?'is-error':''}`}>{profilePhotoMessage||profileMessage}</div>}
          <div className="unified-profile-layout"><section className="unified-profile-panel"><header><span><UserRound size={18}/></span><div><h3>Personal information</h3><p>Details your clinic uses for appointments and patient account updates.</p></div></header><div className="pv3-profile-fields unified-profile-fields">{[
            ['firstName','First name','text'],['middleName','Middle name','text'],['lastName','Last name','text'],['dateOfBirth','Date of birth','date'],['phone','Phone','tel'],['address','Address','text'],['emergencyContact','Emergency contact','text'],['emergencyContactPhone','Emergency phone','tel'],['emergencyContactRelationship','Relationship','text'],
          ].map(([key,label,type])=><label key={key}><span>{label}</span><input type={type} disabled={!profileEditing} value={profile[key as keyof typeof profile]} onChange={(event)=>setProfile((current)=>({...current,[key]:event.target.value}))}/></label>)}<label><span>Account email</span><input type="email" disabled value={profile.email || patient.email || ''}/></label></div></section><aside className="unified-profile-panel pv3-communication"><header><span><ShieldCheck size={18}/></span><div><h3>Notification preferences</h3><p>Choose how the clinic may contact you about appointments and care.</p></div></header><CommunicationPreferencesPanel patient={patient} actor={user?.id ?? patient.patientId} /></aside><AccountSecurityPanel currentEmail={profile.email || patient.email || user?.email || ''} onEmailSynced={syncPatientAuthEmail}/></div>
        </section>}
      </div>
    </main>

    {selectedAppointment && <div className="pv3-modal-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&setSelectedAppointment(null)}><section className="pv3-detail-modal"><header><div><span>APPOINTMENT DETAILS</span><h2>{serviceMap.get(selectedAppointment.serviceId)?.name ?? 'Dental appointment'}</h2><p>{selectedAppointment.appointmentNumber ?? selectedAppointment.id}</p></div><button type="button" aria-label="Close appointment details" onClick={()=>setSelectedAppointment(null)}><X size={19}/></button></header><div className="pv3-detail-status"><PatientStatusBadge status={selectedAppointment.status} /><PatientStatusBadge status={selectedAppointment.paymentStatus ?? 'not_billed'} variant="compact" /></div><div className="pv3-detail-grid"><div><span>Date</span><strong>{clinicDate(selectedAppointment.date)}</strong></div><div><span>Time</span><strong>{timeLabel(selectedAppointment.startTime)}</strong></div><div><span>Branch</span><strong>{branchMap.get(selectedAppointment.branchId ?? '')?.name ?? 'Clinic branch'}</strong></div><div><span>Dentist</span><strong>{providerMap.get(selectedAppointment.providerId ?? '')?.displayName ?? 'Assigned by clinic'}</strong></div><div><span>Service</span><strong>{serviceMap.get(selectedAppointment.serviceId)?.name ?? 'Dental service'}</strong></div><div><span>Estimated fee</span><strong>{serviceMap.get(selectedAppointment.serviceId)?serviceMoney(serviceMap.get(selectedAppointment.serviceId)!.price):'—'}</strong></div></div>{selectedAppointment.reasonForVisit&&<section className="pv3-detail-note"><span>Reason for visit</span><p>{selectedAppointment.reasonForVisit}</p></section>}<footer><Button variant="secondary" onClick={()=>setSelectedAppointment(null)}>Close</Button></footer></section></div>}

    {selectedRecord && <div className="pv3-modal-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&setSelectedRecord(null)}><section className="pv3-detail-modal pv3-record-modal"><header><div><span>DENTAL RECORD</span><h2>{selectedRecord.chiefComplaint || 'Dental visit summary'}</h2><p>{clinicDate(selectedRecord.recordDate)}</p></div><button type="button" aria-label="Close dental record details" onClick={()=>setSelectedRecord(null)}><X size={19}/></button></header><div className="pv3-record-hero"><span><FileText size={21}/></span><div><PatientStatusBadge status={selectedRecord.status} /><h3>{selectedRecord.visitType.replaceAll('_',' ')}</h3><p>This is the patient-visible summary finalized by your clinical team.</p></div></div><div className="pv3-detail-grid"><div><span>Visit date</span><strong>{clinicDate(selectedRecord.recordDate)}</strong></div><div><span>Record status</span><strong>{statusLabel(selectedRecord.status)}</strong></div><div><span>Visit type</span><strong>{selectedRecord.visitType.replaceAll('_',' ')}</strong></div><div><span>Follow-up</span><strong>{selectedRecord.followUpDate?clinicDate(selectedRecord.followUpDate):'Not scheduled'}</strong></div></div><section className="pv3-detail-note"><span>Visit summary</span><p>{selectedRecord.chiefComplaint || 'Your dentist has shared a finalized dental visit summary.'}</p></section><div className="pv3-record-privacy"><ShieldCheck size={16}/><span>Internal clinical notes, assessments and private dentist-only fields are intentionally not exposed in the patient portal.</span></div><footer><Button variant="secondary" onClick={()=>setSelectedRecord(null)}>Close record</Button></footer></section></div>}

    {selectedPayment && (()=>{const receipt=receiptMap.get(selectedPayment.id);const invoice=invoices.find((item)=>item.id===selectedPayment.invoiceId);const branch=branchMap.get(receipt?.branchId ?? selectedPayment.branchId ?? invoice?.branchId ?? '');const payload=getPatientReceiptPayload(selectedPayment);const hasOfficialReceipt=Boolean(payload&&canPrintOfficialReceipt(payload));const items=invoice?.items ?? [];return <div className="pv3-modal-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&setSelectedPayment(null)}><section className={`pv3-detail-modal pv3-payment-modal-v6 ${hasOfficialReceipt?'is-official-receipt':''}`}><header><div><span>{hasOfficialReceipt?'OFFICIAL RECEIPT':'PAYMENT DETAILS'}</span><h2>{receipt?.receiptNumber ?? selectedPayment.paymentNumber}</h2><p>Plamenco Dental Co. - {branch?.name ?? 'Clinic branch'}</p></div><button type="button" aria-label="Close payment details" onClick={()=>setSelectedPayment(null)}><X size={19}/></button></header><div className="pv3-detail-status"><PatientStatusBadge status={selectedPayment.status} /><span>{selectedPayment.referenceNumber || selectedPayment.gatewayTransactionId || 'No external reference'}</span></div><div className="pv3-payment-receipt-hero-v6"><span><ReceiptText size={24}/></span><div><small>{hasOfficialReceipt?'Amount received':'Payment amount'}</small><h3>{money(receipt?.amountCents ?? selectedPayment.amountCents)}</h3><p>{hasOfficialReceipt?'This official receipt is generated from persisted clinic payment records.':'A receipt is available only after the payment is completed and posted.'}</p></div></div><div className="pv3-detail-grid"><div><span>Clinic</span><strong>Plamenco Dental Co.</strong></div><div><span>Branch</span><strong>{branch?.name ?? 'Clinic branch'}</strong></div><div><span>Receipt number</span><strong>{receipt?.receiptNumber ?? 'Not issued'}</strong></div><div><span>Payment number</span><strong>{selectedPayment.paymentNumber}</strong></div><div><span>Patient</span><strong>{fullName}</strong></div><div><span>Patient ID</span><strong>{patient.patientId}</strong></div><div><span>Payment date / time</span><strong>{clinicDateTime(receipt?.issuedAt ?? selectedPayment.verifiedAt ?? selectedPayment.date)}</strong></div><div><span>Payment method</span><strong>{getPaymentMethodLabel(selectedPayment.paymentMethod)}</strong></div><div><span>Related invoice</span><strong>{invoice?.invoiceNumber ?? selectedPayment.invoiceId}</strong></div><div><span>Processor / staff</span><strong>{receipt?.issuedBy || selectedPayment.verifiedBy || selectedPayment.recordedBy || 'Clinic staff'}</strong></div><div><span>Payment status</span><strong>{statusLabel(selectedPayment.status)}</strong></div><div><span>Remaining balance</span><strong>{money(receipt?.remainingBalanceCents ?? invoice?.balanceCents ?? 0)}</strong></div></div>{items.length ? <section className="pv3-receipt-items-v7"><span>Services / Items</span><table><thead><tr><th>Description</th><th>Qty</th><th>Amount</th></tr></thead><tbody>{items.map((item)=><tr key={item.id}><td>{item.description}</td><td>{item.quantity}</td><td>{money(item.amountCents ?? Math.max(item.quantity * item.unitPriceCents - (item.discountCents ?? 0), 0))}</td></tr>)}</tbody><tfoot><tr><td colSpan={2}>Invoice total</td><td>{money(invoice?.totalCents ?? selectedPayment.amountCents)}</td></tr><tr><td colSpan={2}>Amount paid</td><td>{money(receipt?.amountCents ?? selectedPayment.amountCents)}</td></tr></tfoot></table></section> : <section className="pv3-detail-note"><span>Services / Description</span><p>Dental services</p></section>}<div className="pv3-record-privacy"><ShieldCheck size={16}/><span>{hasOfficialReceipt?'This receipt is available only from your authenticated patient account.':'Processing and failed payments do not have official receipts.'}</span></div><footer><Button variant="secondary" onClick={()=>setSelectedPayment(null)}>Close</Button>{hasOfficialReceipt&&<Button variant="secondary" icon={<Download size={15}/>} onClick={()=>downloadPatientReceipt(selectedPayment)}>Download Receipt</Button>}{hasOfficialReceipt&&<Button icon={<Printer size={15}/>} onClick={()=>printPatientReceipt(selectedPayment)}>Print Receipt</Button>}</footer></section></div>})()}
    {payMode!=='none'&&selectedPayInvoice&&<div className="pv3-modal-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&!payBusy&&setPayMode('none')}><section className="pv3-pay-modal"><header><div><span>{payMode==='cash'?'PAY AT CLINIC':'QR PH PAYMENT'}</span><h2>{payMode==='cash'?'Pay in person':'Secure online payment'}</h2><p>{selectedPayInvoice.invoiceNumber}</p></div><button type="button" aria-label="Close payment dialog" onClick={()=>setPayMode('none')} disabled={payBusy}><X size={19}/></button></header>{payMode==='cash'?<div className="pv3-cash"><span><Banknote size={28}/></span><h3>{money(selectedPayInvoice.balanceCents)}</h3><p>Pay this amount at the clinic cashier. No payment record is created until clinic staff actually receives and records your payment.</p></div>:<div className="pv3-online">{payError&&<div className="pv3-alert is-error">{payError}</div>}<div className="pv3-pay-amount"><span>AMOUNT TO PAY</span><strong>{money(selectedPayInvoice.balanceCents)}</strong><small>Exact outstanding invoice balance</small></div>{!paySession?<><div className="pv3-qr-empty"><QrCode size={42}/></div><h3>Generate your QR Ph code</h3><p>The code is generated securely by PayMongo and can be scanned using a QR Ph-supported bank or wallet.</p><Button disabled={payBusy} onClick={()=>void startQrPayment()}>{payBusy?'Generating…':'Generate QR Ph code'}</Button></>:<><div className="pv3-qr-frame"><img src={paySession.qrImage} alt={`QR Ph payment for ${selectedPayInvoice.invoiceNumber}`}/></div><h3>{money(paySession.amountCents)}</h3><p>Scan the QR, complete payment, and keep this window open. The portal checks status automatically every 5 seconds.</p>{payStatus&&<div className="pv3-alert is-success">{payStatus}</div>}<Button disabled={payBusy} onClick={()=>void checkQrStatus()}>{payBusy?'Checking…':'Check payment now'}</Button><small>Payment reference: {paySession.paymentNumber ?? paySession.paymentId}</small></>}</div>}<footer><Button variant="secondary" onClick={()=>setPayMode('none')} disabled={payBusy}>Close</Button></footer></section></div>}
    {selectedRecall && <div className="pv3-modal-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&setSelectedRecall(null)}><section className="pv3-detail-modal pv3-recall-modal-v5"><header><div><span>RECALL / FOLLOW-UP DETAILS</span><h2>{selectedRecall.reason || (selectedRecall.kind === 'follow_up' ? 'Follow-up recommended' : 'Recall reminder')}</h2><p>{selectedRecall.dueDate ? `Recommended for ${clinicDate(selectedRecall.dueDate)}` : 'Recommended return visit'}</p></div><button type="button" aria-label="Close recall details" onClick={()=>setSelectedRecall(null)}><X size={19}/></button></header><div className="pv3-recall-detail-status-v5"><PatientStatusBadge status={selectedRecall.status} />{getRecallDueBucket(selectedRecall)==='overdue'&&<PatientStatusBadge status="overdue" />}<span><Stethoscope size={14}/>{selectedRecall.providerName || 'Care team'}</span></div><div className="pv3-recall-detail-hero-v5"><span><HeartPulse size={22}/></span><div><small>{selectedRecall.kind.replaceAll('_',' ')}</small><h3>{selectedRecall.patientMessage || 'Your clinic recommends a future visit.'}</h3><p>{selectedRecall.reason || 'A follow-up visit was recommended by your clinic.'}</p></div></div><div className="pv3-recall-detail-grid-v5"><div><span>Recommended date</span><strong>{selectedRecall.dueDate ? clinicDate(selectedRecall.dueDate) : 'No date set'}</strong></div><div><span>Dentist</span><strong>{selectedRecall.providerName || 'Care team'}</strong></div><div><span>Related treatment / source</span><strong>{selectedRecall.sourceId ? `${selectedRecall.sourceType.replaceAll('_',' ')} ${selectedRecall.sourceId}` : selectedRecall.sourceType.replaceAll('_',' ')}</strong></div><div><span>Created</span><strong>{selectedRecall.createdAt ? clinicDate(selectedRecall.createdAt) : 'Not recorded'}</strong></div><div><span>Branch</span><strong>{selectedRecall.branchId ? branchMap.get(selectedRecall.branchId)?.name ?? 'Clinic branch' : 'Clinic branch'}</strong></div><div><span>Associated appointment</span><strong>{selectedRecall.linkedAppointmentId ? (recallAppointments.get(selectedRecall.linkedAppointmentId)?.appointmentNumber ?? selectedRecall.linkedAppointmentId) : 'Not booked yet'}</strong></div></div><div className="pv3-record-privacy"><ShieldCheck size={16}/><span>Follow-up recommendations use the clinic record shared with your authenticated patient account.</span></div><footer><Button variant="secondary" onClick={()=>setSelectedRecall(null)}>Close</Button>{selectedRecall.linkedAppointmentId && recallAppointments.get(selectedRecall.linkedAppointmentId) ? <Button onClick={()=>{const linkedAppointment=recallAppointments.get(selectedRecall.linkedAppointmentId!);if(linkedAppointment)setSelectedAppointment(linkedAppointment);setSelectedRecall(null)}}>View appointment</Button> : selectedRecall.linkedAppointmentId ? <Button onClick={()=>{setSelectedRecall(null);openTab('appointments')}}>View appointments</Button> : canBookRecall(selectedRecall) ? <Button onClick={()=>bookRecallFollowUp(selectedRecall)}>Book follow-up</Button> : null}</footer></section></div>}
    {selectedPrescription && <div className="pv3-modal-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&setSelectedPrescription(null)}><section className="pv3-detail-modal pv3-rx-modal-v4"><header><div><span>PRESCRIPTION DETAILS</span><h2>{selectedPrescription.medication || selectedPrescription.items?.map((item)=>item.medication).filter(Boolean).join(', ') || 'Prescription'}</h2><p>Issued {clinicDate(selectedPrescription.prescriptionDate)}</p></div><button type="button" aria-label="Close prescription details" onClick={()=>setSelectedPrescription(null)}><X size={19}/></button></header><div className="pv3-detail-status"><PatientStatusBadge status={selectedPrescription.status} /><span>{selectedPrescription.providerNameSnapshot || 'Prescribing dentist'}</span></div><div className="pv3-rx-detail-list">{(selectedPrescription.items?.length ? selectedPrescription.items : [{ id:'primary', medication:selectedPrescription.medication, strength:'', dosage:selectedPrescription.dosage, frequency:selectedPrescription.frequency, duration:selectedPrescription.duration, instructions:selectedPrescription.instructions }]).map((item)=><section key={item.id}><h3>{item.medication || 'Medication'}</h3>{item.strength&&<p>{item.strength}</p>}<dl><div><dt>Dosage</dt><dd>{item.dosage||'As directed'}</dd></div><div><dt>Frequency</dt><dd>{item.frequency||'As directed'}</dd></div><div><dt>Duration</dt><dd>{item.duration||'As directed'}</dd></div></dl>{item.instructions&&<div><span>Instructions</span><p>{item.instructions}</p></div>}</section>)}</div>{selectedPrescription.notes&&<section className="pv3-detail-note"><span>Additional note</span><p>{selectedPrescription.notes}</p></section>}<div className="pv3-record-privacy"><ShieldCheck size={16}/><span>This prescription view is read-only. Contact the clinic if medication instructions are unclear.</span></div><footer><Button variant="secondary" onClick={()=>setSelectedPrescription(null)}>Close prescription</Button></footer></section></div>}
  </div>
}
