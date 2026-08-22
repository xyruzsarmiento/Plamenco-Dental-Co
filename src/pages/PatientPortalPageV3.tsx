import {
  Activity,
  ArrowRight,
  Banknote,
  CalendarCheck2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileText,
  FileUser,
  HeartPulse,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  Pill,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingUp,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { useAuth } from '../features/auth/AuthContext'
import { getAppointmentsByPatient } from '../features/appointments/appointmentStore'
import { createPatientPortalAppointmentPersisted } from '../features/appointments/appointmentPersistence'
import { getAppointmentAvailability, getEligibleProviders } from '../features/appointments/availabilityEngine'
import {
  getInvoicesByPatient,
  getOutstandingBalanceByPatient,
  getPaymentsByPatient,
  getReceiptsByPatient,
} from '../features/billing/billingStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { CommunicationPreferencesPanel } from '../features/communications/CommunicationPreferencesPanel'
import { getDentalRecordsByPatientId } from '../features/dentalRecords/dentalRecordStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { getDocumentsByPatient } from '../features/documents/documentStore'
import { getCurrentPatientForAuthenticatedUser } from '../features/patients/patientStore'
import { updateMyPatientProfilePersisted } from '../features/patients/patientPersistence'
import type { Patient } from '../features/patients/patientTypes'
import { checkPatientQrPayment, createPatientQrPayment, type PatientQrPaymentSession } from '../features/patientPortal/patientPaymentPersistence'
import { hydratePatientPortalFromDatabase } from '../features/patientPortal/patientPortalHydration'
import { getPrescriptionsByPatient } from '../features/prescriptions/prescriptionStore'
import { getStoredServices } from '../features/services/serviceStore'
import { getStoredTreatmentPlans, getTreatmentsByPatient } from '../features/treatments/treatmentStore'

const navItems = [
  { key: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { key: 'booking', label: 'Book a Visit', icon: CalendarDays },
  { key: 'appointments', label: 'Appointments', icon: CalendarCheck2 },
  { key: 'dental-records', label: 'Dental Records', icon: FileText },
  { key: 'treatments', label: 'Treatments', icon: HeartPulse },
  { key: 'prescriptions', label: 'Prescriptions', icon: Pill },
  { key: 'payments', label: 'Payments', icon: WalletCards },
  { key: 'documents', label: 'Documents', icon: FileUser },
  { key: 'profile', label: 'Profile', icon: UserRound },
] as const

type TabKey = (typeof navItems)[number]['key']
type Appointment = ReturnType<typeof getAppointmentsByPatient>[number]
type DentalRecord = ReturnType<typeof getDentalRecordsByPatientId>[number]

function money(cents: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100)
}

function serviceMoney(pesos: number) {
  if (!Number.isFinite(pesos) || pesos <= 0) return 'Price to be confirmed'
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(pesos)
}

function clinicDate(value?: string) {
  if (!value) return 'Not set'
  const source = value.includes('T') ? value : `${value}T00:00:00+08:00`
  const date = new Date(source)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
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
  }
  return labels[value] ?? value.replaceAll('_', ' ')
}

function statusTone(value?: string): 'success' | 'warning' | 'danger' | 'info' {
  if (value && ['confirmed', 'completed', 'finalized', 'amended', 'paid', 'active', 'accepted'].includes(value)) return 'success'
  if (value && ['pending', 'checked_in', 'waiting', 'in_progress', 'partially_paid', 'processing', 'planned', 'presented', 'draft'].includes(value)) return 'warning'
  if (value && ['rejected', 'cancelled', 'no_show', 'void', 'voided', 'failed', 'declined'].includes(value)) return 'danger'
  return 'info'
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
  const [selectedRecord, setSelectedRecord] = useState<DentalRecord | null>(null)

  const [bookingStep, setBookingStep] = useState(0)
  const [bookingBusy, setBookingBusy] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null)
  const [booking, setBooking] = useState({ serviceId: '', branchId: '', providerId: '', date: '', startTime: '', notes: '' })

  const [profileEditing, setProfileEditing] = useState(false)
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
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

  const appointments = useMemo(() => { void revision; return patient ? getAppointmentsByPatient(patient.patientId) : [] }, [patient, revision])
  const records = useMemo(() => { void revision; return patient ? getDentalRecordsByPatientId(patient.patientId) : [] }, [patient, revision])
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
  const completedTreatments = treatments.filter((item) => item.status === 'completed').length
  const treatmentProgress = treatments.length ? Math.round((completedTreatments / treatments.length) * 100) : 0
  const fullName = patient ? `${patient.firstName} ${patient.middleName ? `${patient.middleName} ` : ''}${patient.lastName}`.trim() : ''

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
  if (lookupState === 'loading') return <div className="pv3-loading"><span /><strong>Preparing your portal</strong><small>Loading your latest clinic information.</small></div>
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

  function choosePayment(invoiceId: string, mode: 'cash' | 'online') {
    setPayInvoiceId(invoiceId)
    setPayMode(mode)
    setPaySession(null)
    setPayError(null)
    setPayStatus(null)
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
    treatments: ['Treatments', 'Follow your treatment plan, progress, schedule and quoted care.'],
    prescriptions: ['Prescriptions', 'Read medication and dosage instructions issued by your dentist.'],
    payments: ['Payments & Invoices', 'Review balances and pay an issued invoice in clinic or through QR Ph.'],
    documents: ['Documents', 'Secure files your clinic has intentionally shared with you.'],
    profile: ['Profile', 'Manage contact, emergency and communication information.'],
  }

  return <div className="pv3-shell">
    <button className={`pv3-backdrop ${mobileNav ? 'is-open' : ''}`} aria-label="Close navigation" onClick={() => setMobileNav(false)} />
    <aside className={`pv3-sidebar ${mobileNav ? 'is-open' : ''}`}>
      <div className="pv3-brand"><span>P</span><div><strong>Plamenco</strong><small>Dental Co.</small></div><button onClick={() => setMobileNav(false)} aria-label="Close"><X size={18}/></button></div>
      <div className="pv3-account"><span className="pv3-avatar" style={profileImage ? { backgroundImage: `url(${profileImage})` } : undefined}>{!profileImage && initials(fullName)}</span><div><strong>{fullName}</strong><small>{patient.patientId}</small></div></div>
      <nav className="pv3-nav" aria-label="Patient portal navigation">
        <p>MY CARE</p>
        {navItems.slice(0, 6).map(({ key, label, icon: Icon }) => <button key={key} className={tab === key ? 'is-active' : ''} onClick={() => openTab(key)}><Icon size={18}/><span>{label}</span></button>)}
        <p>ACCOUNT</p>
        {navItems.slice(6).map(({ key, label, icon: Icon }) => <button key={key} className={tab === key ? 'is-active' : ''} onClick={() => openTab(key)}><Icon size={18}/><span>{label}</span></button>)}
      </nav>
      <div className="pv3-sidebar-footer">
        <div className="pv3-secure"><LockKeyhole size={15}/><span><strong>Secure patient access</strong><small>Private clinic information</small></span></div>
        <button className="pv3-signout" onClick={() => { void signOut(); navigate('/login', { replace: true }) }}><LogOut size={16}/><span>Sign out</span></button>
      </div>
    </aside>

    <main className="pv3-main">
      <header className="pv3-topbar">
        <button className="pv3-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20}/></button>
        <div className="pv3-topbar-copy"><span>{greeting()}</span><h1>{pageCopy[tab][0]}</h1><p>{pageCopy[tab][1]}</p></div>
        <button className="pv3-top-book" onClick={() => openTab('booking')}><CalendarDays size={15}/><span>Book visit</span></button>
      </header>

      <div className="pv3-content">
        {tab === 'dashboard' && <>
          <section className="pv3-greeting">
            <div><span className="pv3-wave">👋</span><div><p>{greeting()}</p><h2>Welcome back, <em>{patient.firstName}</em></h2><span>Here is a quick look at your dental care today.</span></div></div>
            <div className="pv3-greeting-actions"><button onClick={() => openTab('booking')}><CalendarDays size={16}/>Book a visit</button><button onClick={() => openTab('payments')}><WalletCards size={16}/>View billing</button></div>
          </section>

          <section className="pv3-kpis">
            <article><span><CalendarCheck2 size={17}/></span><div><small>NEXT VISIT</small><strong>{nextAppointment ? clinicDate(nextAppointment.date) : 'No visit'}</strong><p>{nextAppointment ? `${timeLabel(nextAppointment.startTime)} · ${serviceMap.get(nextAppointment.serviceId)?.name ?? 'Appointment'}` : 'Book when you are ready'}</p></div></article>
            <article><span><HeartPulse size={17}/></span><div><small>CARE PROGRESS</small><strong>{treatmentProgress}%</strong><p>{completedTreatments} of {treatments.length} treatments completed</p></div></article>
            <article className={balance > 0 ? 'is-due' : ''}><span><CircleDollarSign size={17}/></span><div><small>OUTSTANDING</small><strong>{money(balance)}</strong><p>{openInvoices.length ? `${openInvoices.length} open invoice${openInvoices.length === 1 ? '' : 's'}` : 'Your account is settled'}</p></div></article>
            <article><span><FileText size={17}/></span><div><small>SHARED RECORDS</small><strong>{records.length + documents.length}</strong><p>{records.length} clinical · {documents.length} documents</p></div></article>
          </section>

          <div className="pv3-dashboard-grid">
            <CareTrendChart appointments={appointments} treatments={treatments} payments={payments}/>
            <section className="pv3-panel pv3-next-panel"><div className="pv3-panel-head"><div><span>NEXT APPOINTMENT</span><h3>Your upcoming visit</h3></div><button onClick={() => openTab('appointments')}>View all <ChevronRight size={14}/></button></div>{nextAppointment ? <div className="pv3-next-card"><div className="pv3-date-tile"><strong>{new Date(`${nextAppointment.date}T00:00:00`).getDate()}</strong><span>{new Date(`${nextAppointment.date}T00:00:00`).toLocaleDateString('en-PH',{month:'short'}).toUpperCase()}</span></div><div><Badge tone={statusTone(nextAppointment.status)}>{statusLabel(nextAppointment.status)}</Badge><h4>{serviceMap.get(nextAppointment.serviceId)?.name ?? 'Dental appointment'}</h4><p><Clock3 size={14}/>{timeLabel(nextAppointment.startTime)}</p><p><MapPin size={14}/>{branchMap.get(nextAppointment.branchId ?? '')?.name ?? 'Clinic branch'}</p></div></div> : <EmptyState icon={CalendarDays} title="No upcoming visit" copy="Choose an available schedule whenever you are ready." action={<Button size="sm" onClick={() => openTab('booking')}>Book a visit</Button>}/>}</section>
          </div>

          <div className="pv3-dashboard-grid lower">
            <section className="pv3-panel"><div className="pv3-panel-head"><div><span>TREATMENT PLAN</span><h3>Current care plan</h3></div><button onClick={() => openTab('treatments')}>Details <ChevronRight size={14}/></button></div>{plans[0] ? <div className="pv3-plan-summary"><div><strong>{plans[0].name}</strong><Badge tone={statusTone(plans[0].status)}>{statusLabel(plans[0].status)}</Badge></div><p>{plans[0].description || 'Your treatment plan is being coordinated by your dentist.'}</p><div className="pv3-progress"><i style={{width:`${treatmentProgress}%`}}/></div><footer><span>{treatmentProgress}% complete</span>{Number(plans[0].quotedTotalCents ?? 0) > 0 && <strong>{money(Number(plans[0].quotedTotalCents))}</strong>}</footer></div> : <EmptyState icon={HeartPulse} title="No active care plan" copy="Your dentist will publish a treatment plan here when appropriate."/>}</section>
            <section className="pv3-panel"><div className="pv3-panel-head"><div><span>RECENT ACTIVITY</span><h3>Latest updates</h3></div></div><div className="pv3-activity">{[
              ...appointments.slice(-2).map((item) => ({ key:`a-${item.id}`, title:'Appointment update', copy:`${serviceMap.get(item.serviceId)?.name ?? 'Visit'} · ${statusLabel(item.status)}`, date:item.date, Icon:CalendarDays })),
              ...payments.slice(-2).map((item) => ({ key:`p-${item.id}`, title:'Payment recorded', copy:`${money(item.amountCents)} · ${statusLabel(item.status)}`, date:item.date, Icon:CreditCard })),
              ...records.slice(-2).map((item) => ({ key:`r-${item.id}`, title:'Dental summary shared', copy:item.chiefComplaint || 'Clinical summary', date:item.recordDate, Icon:FileText })),
            ].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5).map((item)=><div key={item.key}><span><item.Icon size={15}/></span><section><strong>{item.title}</strong><p>{item.copy}</p></section><small>{clinicDate(item.date)}</small></div>)}{!appointments.length&&!payments.length&&!records.length&&<EmptyState icon={Activity} title="Nothing new yet" copy="Clinic activity will appear here."/>}</div></section>
          </div>
        </>}

        {tab === 'booking' && <section className="pv3-page">
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

        {tab === 'appointments' && <section className="pv3-page">
          <PageHead eyebrow="YOUR VISITS" title="Appointments" copy="Every upcoming and previous appointment, with clinic status and complete visit details." action={<Button size="sm" onClick={()=>openTab('booking')}>Book a visit</Button>}/>
          <div className="pv3-appointment-stats"><div><span>Upcoming</span><strong>{appointments.filter((item)=>!['completed','cancelled','no_show','rejected'].includes(item.status)).length}</strong></div><div><span>Completed</span><strong>{appointments.filter((item)=>item.status==='completed').length}</strong></div><div><span>Total visits</span><strong>{appointments.length}</strong></div></div>
          <div className="pv3-appointment-list">{[...appointments].sort((a,b)=>`${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`)).map((item)=><button key={item.id} className="pv3-appointment-card" onClick={()=>setSelectedAppointment(item)}><div className="pv3-date-tile"><strong>{new Date(`${item.date}T00:00:00`).getDate()}</strong><span>{new Date(`${item.date}T00:00:00`).toLocaleDateString('en-PH',{month:'short'}).toUpperCase()}</span></div><section><div><Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge><small>{item.appointmentNumber ?? item.id}</small></div><h3>{serviceMap.get(item.serviceId)?.name ?? 'Dental appointment'}</h3><p><Clock3 size={14}/>{timeLabel(item.startTime)}<span>•</span><MapPin size={14}/>{branchMap.get(item.branchId ?? '')?.name ?? 'Clinic branch'}</p></section><aside><span>{providerMap.get(item.providerId ?? '')?.displayName ?? 'Dentist assigned by clinic'}</span><small>{statusLabel(item.paymentStatus ?? 'not_billed')}</small><ChevronRight size={17}/></aside></button>)}{!appointments.length&&<EmptyState icon={CalendarDays} title="No appointments yet" copy="When you book your first visit, it will appear here." action={<Button onClick={()=>openTab('booking')}>Book appointment</Button>}/>}</div>
        </section>}

        {tab === 'dental-records' && <section className="pv3-page">
          <PageHead eyebrow="CLINICAL SUMMARIES" title="Dental Records" copy="Finalized patient-visible summaries from your clinical visits. Click a record to view details."/>
          <div className="pv3-record-overview"><div><FileText size={20}/><span><strong>{records.length}</strong><small>Shared records</small></span></div><div><CheckCircle2 size={20}/><span><strong>{records.filter((item)=>['finalized','amended'].includes(item.status)).length}</strong><small>Finalized summaries</small></span></div><div><CalendarCheck2 size={20}/><span><strong>{records[0]?clinicDate(records[0].recordDate):'—'}</strong><small>Most recent record</small></span></div></div>
          <div className="pv3-record-list">{records.map((record)=><button key={record.id} onClick={()=>setSelectedRecord(record)}><span className="pv3-record-icon"><FileText size={19}/></span><section><div><Badge tone={statusTone(record.status)}>{statusLabel(record.status)}</Badge><small>{clinicDate(record.recordDate)}</small></div><h3>{record.chiefComplaint || 'Dental visit summary'}</h3><p>{record.visitType.replaceAll('_',' ')}{record.followUpDate?` · Follow-up ${clinicDate(record.followUpDate)}`:''}</p></section><ChevronRight size={18}/></button>)}{!records.length&&<EmptyState icon={FileText} title="No shared dental records" copy="Your dentist can publish patient-visible visit summaries here after care is finalized."/>}</div>
        </section>}

        {tab === 'treatments' && <section className="pv3-page">
          <PageHead eyebrow="CARE PLAN" title="Treatments" copy="A detailed view of planned, active and completed care."/>
          <div className="pv3-treatment-hero"><section><span>OVERALL PROGRESS</span><strong>{treatmentProgress}%</strong><p>{completedTreatments} of {treatments.length} treatment items completed</p><div className="pv3-progress"><i style={{width:`${treatmentProgress}%`}}/></div></section><aside><span>Current plan</span><h3>{plans[0]?.name ?? 'No active plan'}</h3><Badge tone={statusTone(plans[0]?.status)}>{statusLabel(plans[0]?.status ?? 'planned')}</Badge>{Number(plans[0]?.quotedTotalCents ?? 0)>0&&<div><small>Quoted total</small><strong>{money(Number(plans[0]?.quotedTotalCents))}</strong></div>}</aside></div>
          <div className="pv3-treatment-layout"><section className="pv3-panel"><div className="pv3-panel-head"><div><span>TREATMENT TIMELINE</span><h3>Your care items</h3></div></div><div className="pv3-treatment-list">{treatments.map((item,index)=><article key={item.id}><div className={`pv3-treatment-marker ${item.status==='completed'?'is-done':''}`}>{item.status==='completed'?<Check size={14}/>:index+1}</div><section><div><Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>{item.toothNumber&&<small>Tooth {item.toothNumber}</small>}</div><h4>{item.serviceNameSnapshot || item.description || 'Dental treatment'}</h4><p>{item.description || 'Care item added by your dentist.'}</p><footer><span><CalendarDays size={13}/>{item.treatmentDate?clinicDate(item.treatmentDate):'To be scheduled'}</span>{Number(item.priceSnapshotCents??0)>0&&<strong>{money(Number(item.priceSnapshotCents))}</strong>}</footer></section></article>)}{!treatments.length&&<EmptyState icon={HeartPulse} title="No treatments yet" copy="Treatment items created by your dentist will appear here."/>}</div></section><aside className="pv3-panel pv3-plan-detail"><span>PLAN DETAILS</span><h3>{plans[0]?.name ?? 'Treatment plan'}</h3><p>{plans[0]?.description || 'No detailed treatment plan has been shared yet.'}</p><dl><div><dt>Status</dt><dd>{statusLabel(plans[0]?.status)}</dd></div><div><dt>Items</dt><dd>{treatments.length}</dd></div><div><dt>Completed</dt><dd>{completedTreatments}</dd></div><div><dt>Remaining</dt><dd>{Math.max(treatments.length-completedTreatments,0)}</dd></div></dl></aside></div>
        </section>}

        {tab === 'prescriptions' && <section className="pv3-page">
          <PageHead eyebrow="MEDICATION" title="Prescriptions" copy="Read-only medication and dosage instructions issued by your dentist. Prescription creation remains inside the clinical workspace."/>
          <div className="pv3-rx-grid">{prescriptions.map((rx)=><article key={rx.id}><header><span><Pill size={19}/></span><Badge tone={statusTone(rx.status)}>{statusLabel(rx.status)}</Badge></header><small>Issued {clinicDate(rx.prescriptionDate)}</small><h3>{rx.medication || rx.items?.map((item)=>item.medication).filter(Boolean).join(', ') || 'Prescription'}</h3><div>{rx.items?.map((item)=><section key={item.id}><strong>{item.medication}</strong>{item.strength&&<span>{item.strength}</span>}<dl><div><dt>Dosage</dt><dd>{item.dosage||'As directed'}</dd></div><div><dt>Frequency</dt><dd>{item.frequency||'As directed'}</dd></div><div><dt>Duration</dt><dd>{item.duration||'As directed'}</dd></div></dl>{item.instructions&&<p>{item.instructions}</p>}</section>)}</div>{rx.providerNameSnapshot&&<footer><Stethoscope size={14}/><span>Prescribed by {rx.providerNameSnapshot}</span></footer>}</article>)}{!prescriptions.length&&<EmptyState icon={Pill} title="No prescriptions" copy="Medication orders created by your dentist during a clinical visit will appear here."/>}</div>
        </section>}

        {tab === 'payments' && <section className="pv3-page">
          <PageHead eyebrow="BILLING" title="Payments & Invoices" copy="Review open balances, payment history and receipts. Online QR Ph payments are tied to an actual issued invoice."/>
          <section className="pv3-billing-summary"><div><span>OUTSTANDING BALANCE</span><strong>{money(balance)}</strong><p>{openInvoices.length?`${openInvoices.length} open invoice${openInvoices.length===1?'':'s'}`:'All invoices are settled'}</p></div><aside><ShieldCheck size={20}/><span><strong>Verified payment posting</strong><small>Balances update only after PayMongo confirms success.</small></span></aside></section>
          <div className="pv3-billing-layout"><section><div className="pv3-subhead"><h3>Open invoices</h3><span>{openInvoices.length}</span></div><div className="pv3-invoice-list">{openInvoices.map((invoice)=><article key={invoice.id}><header><div><span><ReceiptText size={18}/></span><section><strong>{invoice.invoiceNumber}</strong><p>Issued {clinicDate(invoice.invoiceDate)}{invoice.dueDate?` · Due ${clinicDate(invoice.dueDate)}`:''}</p></section></div><Badge tone={statusTone(invoice.status)}>{statusLabel(invoice.status)}</Badge></header><div className="pv3-invoice-money"><div><span>Total</span><strong>{money(invoice.totalCents)}</strong></div><div><span>Paid</span><strong>{money(invoice.amountPaidCents)}</strong></div><div className="is-due"><span>Balance</span><strong>{money(invoice.balanceCents)}</strong></div></div><footer><button onClick={()=>choosePayment(invoice.id,'cash')}><Banknote size={15}/>Pay in clinic</button><button className="is-online" onClick={()=>choosePayment(invoice.id,'online')}><QrCode size={15}/>Pay with QR Ph</button></footer></article>)}{!openInvoices.length&&<EmptyState icon={CheckCircle2} title="You're all settled" copy="No outstanding invoices are currently due."/>}</div></section><aside className="pv3-panel"><div className="pv3-panel-head"><div><span>PAYMENT HISTORY</span><h3>Recent payments</h3></div></div><div className="pv3-payment-history">{payments.slice(0,8).map((payment)=><div key={payment.id}><span className="pv3-pay-icon"><CreditCard size={15}/></span><section><strong>{money(payment.amountCents)}</strong><p>{clinicDate(payment.date)} · {payment.paymentMethod.replaceAll('_',' ')}</p></section><Badge tone={statusTone(payment.status)}>{statusLabel(payment.status)}</Badge></div>)}{!payments.length&&<EmptyState icon={CreditCard} title="No payments yet" copy="Completed clinic payments will appear here."/>}</div>{receipts.length>0&&<div className="pv3-receipts"><ReceiptText size={16}/><span>{receipts.length} receipt{receipts.length===1?'':'s'} recorded</span></div>}</aside></div>
        </section>}

        {tab === 'documents' && <section className="pv3-page">
          <PageHead eyebrow="SHARED FILES" title="Documents" copy="X-rays, referrals, consent copies and other files your clinic intentionally shares with you."/>
          <div className="pv3-document-grid">{documents.map((document)=><article key={document.id}><span><FileUser size={22}/></span><section><strong>{document.fileName}</strong><p>{document.category.replaceAll('_',' ')} · {clinicDate(document.uploadDate)}</p><small>{document.description || 'Shared securely by your clinic'}</small></section><a href={document.content || '#'} data-patient-document-id={document.id}>Open <ArrowRight size={14}/></a></article>)}{!documents.length&&<EmptyState icon={FileUser} title="No shared documents" copy="Files only appear here when your clinic intentionally marks them visible to you."/>}</div>
        </section>}

        {tab === 'profile' && <section className="pv3-page">
          <PageHead eyebrow="ACCOUNT" title="Profile" copy="Keep contact and emergency details accurate while your clinical data remains clinic-managed." action={<Button size="sm" variant="secondary" onClick={()=>setProfileEditing((value)=>!value)}>{profileEditing?'Cancel':'Edit profile'}</Button>}/>
          <div className="pv3-profile-layout"><section className="pv3-panel"><div className="pv3-profile-identity"><label className="pv3-avatar large" style={profileImage?{backgroundImage:`url(${profileImage})`}:undefined}>{!profileImage&&initials(fullName)}{profileEditing&&<input type="file" accept="image/*" onChange={(event)=>{const file=event.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>setProfileImage(typeof reader.result==='string'?reader.result:'');reader.readAsDataURL(file)}}/>}</label><div><span>VERIFIED PATIENT</span><h3>{fullName}</h3><p>{patient.patientId}</p></div></div>{profileMessage&&<div className="pv3-alert">{profileMessage}</div>}<div className="pv3-profile-fields">{[
            ['firstName','First name','text'],['middleName','Middle name','text'],['lastName','Last name','text'],['dateOfBirth','Date of birth','date'],['email','Contact email','email'],['phone','Phone','tel'],['address','Address','text'],['emergencyContact','Emergency contact','text'],['emergencyContactPhone','Emergency phone','tel'],['emergencyContactRelationship','Relationship','text'],
          ].map(([key,label,type])=><label key={key}><span>{label}</span><input type={type} disabled={!profileEditing} value={profile[key as keyof typeof profile]} onChange={(event)=>setProfile((current)=>({...current,[key]:event.target.value}))}/></label>)}</div>{profileEditing&&<footer><Button disabled={profileBusy} onClick={()=>void saveProfile()}>{profileBusy?'Saving…':'Save changes'}</Button></footer>}</section><aside className="pv3-panel pv3-communication"><span>COMMUNICATIONS</span><h3>Notification preferences</h3><p>Choose how the clinic may contact you about appointments and care.</p><CommunicationPreferencesPanel patient={patient} actor={user?.id ?? patient.patientId} /></aside></div>
        </section>}
      </div>
    </main>

    {selectedAppointment && <div className="pv3-modal-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&setSelectedAppointment(null)}><section className="pv3-detail-modal"><header><div><span>APPOINTMENT DETAILS</span><h2>{serviceMap.get(selectedAppointment.serviceId)?.name ?? 'Dental appointment'}</h2><p>{selectedAppointment.appointmentNumber ?? selectedAppointment.id}</p></div><button onClick={()=>setSelectedAppointment(null)}><X size={19}/></button></header><div className="pv3-detail-status"><Badge tone={statusTone(selectedAppointment.status)}>{statusLabel(selectedAppointment.status)}</Badge><span>{statusLabel(selectedAppointment.paymentStatus ?? 'not_billed')}</span></div><div className="pv3-detail-grid"><div><span>Date</span><strong>{clinicDate(selectedAppointment.date)}</strong></div><div><span>Time</span><strong>{timeLabel(selectedAppointment.startTime)}</strong></div><div><span>Branch</span><strong>{branchMap.get(selectedAppointment.branchId ?? '')?.name ?? 'Clinic branch'}</strong></div><div><span>Dentist</span><strong>{providerMap.get(selectedAppointment.providerId ?? '')?.displayName ?? 'Assigned by clinic'}</strong></div><div><span>Service</span><strong>{serviceMap.get(selectedAppointment.serviceId)?.name ?? 'Dental service'}</strong></div><div><span>Estimated fee</span><strong>{serviceMap.get(selectedAppointment.serviceId)?serviceMoney(serviceMap.get(selectedAppointment.serviceId)!.price):'—'}</strong></div></div>{selectedAppointment.reasonForVisit&&<section className="pv3-detail-note"><span>Reason for visit</span><p>{selectedAppointment.reasonForVisit}</p></section>}<footer><Button variant="secondary" onClick={()=>setSelectedAppointment(null)}>Close</Button></footer></section></div>}

    {selectedRecord && <div className="pv3-modal-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&setSelectedRecord(null)}><section className="pv3-detail-modal pv3-record-modal"><header><div><span>DENTAL RECORD</span><h2>{selectedRecord.chiefComplaint || 'Dental visit summary'}</h2><p>{clinicDate(selectedRecord.recordDate)}</p></div><button onClick={()=>setSelectedRecord(null)}><X size={19}/></button></header><div className="pv3-record-hero"><span><FileText size={21}/></span><div><Badge tone={statusTone(selectedRecord.status)}>{statusLabel(selectedRecord.status)}</Badge><h3>{selectedRecord.visitType.replaceAll('_',' ')}</h3><p>This is the patient-visible summary finalized by your clinical team.</p></div></div><div className="pv3-detail-grid"><div><span>Visit date</span><strong>{clinicDate(selectedRecord.recordDate)}</strong></div><div><span>Record status</span><strong>{statusLabel(selectedRecord.status)}</strong></div><div><span>Visit type</span><strong>{selectedRecord.visitType.replaceAll('_',' ')}</strong></div><div><span>Follow-up</span><strong>{selectedRecord.followUpDate?clinicDate(selectedRecord.followUpDate):'Not scheduled'}</strong></div></div><section className="pv3-detail-note"><span>Visit summary</span><p>{selectedRecord.chiefComplaint || 'Your dentist has shared a finalized dental visit summary.'}</p></section><div className="pv3-record-privacy"><ShieldCheck size={16}/><span>Internal clinical notes, assessments and private dentist-only fields are intentionally not exposed in the patient portal.</span></div><footer><Button variant="secondary" onClick={()=>setSelectedRecord(null)}>Close record</Button></footer></section></div>}

    {payMode!=='none'&&selectedPayInvoice&&<div className="pv3-modal-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&!payBusy&&setPayMode('none')}><section className="pv3-pay-modal"><header><div><span>{payMode==='cash'?'PAY AT CLINIC':'QR PH PAYMENT'}</span><h2>{payMode==='cash'?'Pay in person':'Secure online payment'}</h2><p>{selectedPayInvoice.invoiceNumber}</p></div><button onClick={()=>setPayMode('none')} disabled={payBusy}><X size={19}/></button></header>{payMode==='cash'?<div className="pv3-cash"><span><Banknote size={28}/></span><h3>{money(selectedPayInvoice.balanceCents)}</h3><p>Pay this amount at the clinic cashier. No payment record is created until clinic staff actually receives and records your payment.</p></div>:<div className="pv3-online">{payError&&<div className="pv3-alert is-error">{payError}</div>}<div className="pv3-pay-amount"><span>AMOUNT TO PAY</span><strong>{money(selectedPayInvoice.balanceCents)}</strong><small>Exact outstanding invoice balance</small></div>{!paySession?<><div className="pv3-qr-empty"><QrCode size={42}/></div><h3>Generate your QR Ph code</h3><p>The code is generated securely by PayMongo and can be scanned using a QR Ph-supported bank or wallet.</p><Button disabled={payBusy} onClick={()=>void startQrPayment()}>{payBusy?'Generating…':'Generate QR Ph code'}</Button></>:<><div className="pv3-qr-frame"><img src={paySession.qrImage} alt={`QR Ph payment for ${selectedPayInvoice.invoiceNumber}`}/></div><h3>{money(paySession.amountCents)}</h3><p>Scan the QR, complete payment, and keep this window open. The portal checks status automatically every 5 seconds.</p>{payStatus&&<div className="pv3-alert is-success">{payStatus}</div>}<Button disabled={payBusy} onClick={()=>void checkQrStatus()}>{payBusy?'Checking…':'Check payment now'}</Button><small>Payment reference: {paySession.paymentNumber ?? paySession.paymentId}</small></>}</div>}<footer><Button variant="secondary" onClick={()=>setPayMode('none')} disabled={payBusy}>Close</Button></footer></section></div>}
  </div>
}
