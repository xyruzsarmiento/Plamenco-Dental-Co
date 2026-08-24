import {
  ArrowRight,
  Banknote,
  CalendarCheck2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  FileText,
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
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
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
  { key: 'profile', label: 'Profile', icon: UserRound },
] as const

type TabKey = (typeof navItems)[number]['key']

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
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', hour12: false }).format(new Date()))
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    pending: 'Awaiting confirmation', confirmed: 'Confirmed', rejected: 'Not approved', cancelled: 'Cancelled',
    rescheduled: 'Rescheduled', no_show: 'Missed', checked_in: 'Checked in', waiting: 'Waiting', in_progress: 'In progress',
    completed: 'Completed', draft: 'Preparing', finalized: 'Available', amended: 'Updated', unpaid: 'Payment due',
    partially_paid: 'Partially paid', paid: 'Paid', void: 'Cancelled', voided: 'Cancelled', processing: 'Processing', failed: 'Failed',
    active: 'Active', planned: 'Planned', presented: 'Presented', accepted: 'Accepted', declined: 'Declined',
  }
  return labels[value] ?? value.replaceAll('_', ' ')
}

function statusTone(value: string): 'success' | 'warning' | 'danger' | 'info' {
  if (['confirmed', 'completed', 'finalized', 'amended', 'paid', 'active', 'accepted'].includes(value)) return 'success'
  if (['pending', 'checked_in', 'waiting', 'in_progress', 'partially_paid', 'processing', 'planned', 'presented', 'draft'].includes(value)) return 'warning'
  if (['rejected', 'cancelled', 'no_show', 'void', 'voided', 'failed', 'declined'].includes(value)) return 'danger'
  return 'info'
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

function EmptyState({ icon: Icon, title, copy, action }: { icon: typeof FileText; title: string; copy: string; action?: React.ReactNode }) {
  return <div className="pp2-empty"><span><Icon size={24} /></span><h3>{title}</h3><p>{copy}</p>{action}</div>
}

function SectionHeading({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy?: string; action?: React.ReactNode }) {
  return <div className="pp2-section-heading"><div><span>{eyebrow}</span><h2>{title}</h2>{copy && <p>{copy}</p>}</div>{action}</div>
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
      const visitCount = appointments.filter((item) => {
        const d = new Date(`${item.date}T00:00:00`)
        return d.getFullYear() === year && d.getMonth() === month && item.status !== 'cancelled'
      }).length
      const treatmentCount = treatments.filter((item) => {
        if (!item.treatmentDate) return false
        const d = new Date(`${item.treatmentDate}T00:00:00`)
        return d.getFullYear() === year && d.getMonth() === month
      }).length
      const paymentCount = payments.filter((item) => {
        const d = new Date(`${item.date}T00:00:00`)
        return d.getFullYear() === year && d.getMonth() === month && item.status === 'completed'
      }).length
      return {
        label: date.toLocaleDateString('en-PH', { month: 'short' }),
        value: visitCount * 3 + treatmentCount * 2 + paymentCount,
        visits: visitCount,
        treatments: treatmentCount,
      }
    })
  }, [appointments, payments, range, treatments])
  const max = Math.max(...data.map((item) => item.value), 1)
  const points = data.map((item, index) => ({ x: 28 + (index * 344) / Math.max(data.length - 1, 1), y: 118 - (item.value / max) * 82 }))
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')

  return <section className="pp2-panel pp2-chart-panel">
    <div className="pp2-panel-head"><div><span>CARE ACTIVITY</span><h3>Your care trend</h3><p>Interactive view of visits and treatment activity.</p></div><div className="pp2-segmented"><button className={range === 6 ? 'is-active' : ''} onClick={() => setRange(6)}>6M</button><button className={range === 12 ? 'is-active' : ''} onClick={() => setRange(12)}>12M</button></div></div>
    <div className="pp2-chart-wrap">
      <svg viewBox="0 0 400 145" role="img" aria-label="Care activity trend">
        <defs><linearGradient id="pp2Area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity=".22"/><stop offset="100%" stopColor="#2563eb" stopOpacity="0"/></linearGradient></defs>
        {[36, 77, 118].map((y) => <line key={y} x1="28" x2="372" y1={y} y2={y} stroke="#e8eef8" strokeWidth="1" />)}
        <path d={`${path} L ${points.at(-1)?.x ?? 372} 128 L ${points[0]?.x ?? 28} 128 Z`} fill="url(#pp2Area)" />
        <path d={path} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => <g key={data[index].label} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'pointer' }}>
          <circle cx={point.x} cy={point.y} r={hovered === index ? 6 : 4} fill="#fff" stroke="#2563eb" strokeWidth="3" />
          <circle cx={point.x} cy={point.y} r="14" fill="transparent" />
          <text x={point.x} y="141" textAnchor="middle" fontSize="9" fill="#7c8799">{data[index].label}</text>
          {hovered === index && <g><rect x={Math.min(point.x - 45, 285)} y={Math.max(point.y - 38, 4)} width="90" height="28" rx="7" fill="#172033"/><text x={Math.min(point.x, 330)} y={Math.max(point.y - 22, 20)} textAnchor="middle" fontSize="8.5" fill="#fff">{data[index].visits} visits · {data[index].treatments} treatments</text></g>}
        </g>)}
      </svg>
    </div>
  </section>
}

export function PatientPortalPage() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [lookupState, setLookupState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('dashboard')
  const [mobileNav, setMobileNav] = useState(false)
  const [revision, setRevision] = useState(0)
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
  const [profile, setProfile] = useState({ firstName: '', middleName: '', lastName: '', dateOfBirth: '', email: '', phone: '', address: '', emergencyContact: '', emergencyContactPhone: '', emergencyContactRelationship: '' })

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
        setPatient(row); setLookupState('ready')
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
    setProfile({ firstName: patient.firstName, middleName: patient.middleName, lastName: patient.lastName, dateOfBirth: patient.dateOfBirth, email: patient.email, phone: patient.phone, address: patient.address, emergencyContact: patient.emergencyContact, emergencyContactPhone: patient.emergencyContactPhone, emergencyContactRelationship: patient.emergencyContactRelationship ?? '' })
  }, [patient])

  const appointments = useMemo(() => { void revision; return patient ? getAppointmentsByPatient(patient.patientId) : [] }, [patient, revision])
  const records = useMemo(() => { void revision; return patient ? getDentalRecordsByPatientId(patient.patientId) : [] }, [patient, revision])
  const treatments = useMemo(() => { void revision; return patient ? getTreatmentsByPatient(patient.patientId) : [] }, [patient, revision])
  const plans = useMemo(() => { void revision; return patient ? getStoredTreatmentPlans().filter((item) => item.patientId === patient.patientId) : [] }, [patient, revision])
  const prescriptions = useMemo(() => { void revision; return patient ? getPrescriptionsByPatient(patient.patientId) : [] }, [patient, revision])
  const invoices = useMemo(() => { void revision; return patient ? getInvoicesByPatient(patient.patientId) : [] }, [patient, revision])
  const payments = useMemo(() => { void revision; return patient ? getPaymentsByPatient(patient.patientId) : [] }, [patient, revision])
  const receipts = useMemo(() => { void revision; return patient ? getReceiptsByPatient(patient.patientId) : [] }, [patient, revision])
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
  const nextAppointment = useMemo(() => [...appointments].filter((item) => !['cancelled', 'no_show', 'completed'].includes(item.status)).sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))[0], [appointments])
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
          // Manual status check remains available; silent polling must not interrupt the payment modal.
        }
      })()
    }, 5000)
    return () => { cancelled = true; window.clearInterval(interval) }
  }, [payMode, paySession])

  if (!resolvedPatientId) return <Navigate to="/login" replace />
  if (lookupState === 'loading') return <div className="pp2-loading"><span /><strong>Preparing your patient portal</strong><small>Loading your latest clinic records.</small></div>
  if (lookupState === 'error') return <div className="pp2-loading"><strong>We could not load your portal</strong><small>{lookupError}</small></div>
  if (!patient) return <div className="pp2-loading"><strong>No patient record found</strong><small>Please contact the clinic so your account can be linked.</small></div>

  function openTab(next: TabKey) { setTab(next); setMobileNav(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function updateBooking(key: keyof typeof booking, value: string) {
    setBooking((current) => {
      if (key === 'serviceId') return { ...current, serviceId: value, startTime: '' }
      if (key === 'branchId') return { ...current, branchId: value, providerId: '', date: '', startTime: '' }
      if (key === 'providerId' || key === 'date') return { ...current, [key]: value, startTime: '' }
      return { ...current, [key]: value }
    }); setBookingError(null)
  }
  async function bookingNext() {
    if (bookingBusy) return
    if (bookingStep === 0 && !booking.serviceId) return setBookingError('Choose a service to continue.')
    if (bookingStep === 1 && !booking.branchId) return setBookingError('Choose a clinic branch to continue.')
    if (bookingStep === 3 && (!booking.date || !booking.startTime)) return setBookingError('Choose an available date and time.')
    if (bookingStep < 4) { setBookingStep((value) => value + 1); return }
    const slot = availability.slots.find((item) => item.startTime === booking.startTime && (!booking.providerId || item.providerId === booking.providerId))
    if (!slot || !selectedService) return setBookingError('That time is no longer available. Please select another slot.')
    setBookingBusy(true); setBookingError(null)
    try {
      const appointment = await createPatientPortalAppointmentPersisted({ branchId: booking.branchId, serviceId: booking.serviceId, providerId: slot.providerId, date: booking.date, startTime: booking.startTime, notes: booking.notes.trim() })
      setBookingSuccess(appointment.appointmentNumber ?? appointment.id); setRevision((value) => value + 1)
    } catch (error) { setBookingError(error instanceof Error ? error.message : 'Unable to submit this appointment request.') }
    finally { setBookingBusy(false) }
  }
  function resetBooking() { setBooking({ serviceId: '', branchId: '', providerId: '', date: '', startTime: '', notes: '' }); setBookingStep(0); setBookingSuccess(null); setBookingError(null) }
  async function saveProfile() {
    if (profileBusy) return
    setProfileBusy(true); setProfileMessage(null)
    try { const updated = await updateMyPatientProfilePersisted({ ...profile, profileImage }); setPatient(updated); setProfileEditing(false); setProfileMessage('Profile updated successfully.') }
    catch (error) { setProfileMessage(error instanceof Error ? error.message : 'Unable to save your profile.') }
    finally { setProfileBusy(false) }
  }
  function choosePayment(invoiceId: string, mode: 'cash' | 'online') { setPayInvoiceId(invoiceId); setPayMode(mode); setPaySession(null); setPayError(null); setPayStatus(null) }
  async function startQrPayment() {
    if (!payInvoiceId || payBusy) return
    setPayBusy(true); setPayError(null); setPayStatus(null)
    try { const session = await createPatientQrPayment(payInvoiceId); setPaySession(session); setPayStatus('QR ready. Scan it with a QR Ph-supported bank or wallet app. Payment status will refresh automatically.') }
    catch (error) { setPayError(error instanceof Error ? error.message : 'Unable to start online payment.') }
    finally { setPayBusy(false) }
  }
  async function checkQrStatus() {
    if (!paySession || payBusy) return
    setPayBusy(true); setPayError(null)
    try {
      const result = await checkPatientQrPayment(paySession.paymentId)
      if (result.completed) { setPayStatus('Payment confirmed. Your invoice and receipt have been updated.'); await hydratePatientPortalFromDatabase(); setRevision((value) => value + 1) }
      else setPayStatus('Payment is not confirmed yet. We will keep checking automatically.')
    } catch (error) { setPayError(error instanceof Error ? error.message : 'Unable to confirm payment status.') }
    finally { setPayBusy(false) }
  }

  const pageCopy: Record<TabKey, [string, string]> = {
    dashboard: ['Overview', 'Your appointments, treatment progress and account activity.'],
    booking: ['Book a Visit', 'Choose a service and a real available schedule.'],
    appointments: ['Appointments', 'Upcoming and previous clinic visits in one place.'],
    'dental-records': ['Dental Records', 'Detailed patient-visible summaries from your dentist.'],
    treatments: ['Treatments', 'Track the details and progress of your treatment plan.'],
    prescriptions: ['Prescriptions', 'Medication and instructions issued by your dentist.'],
    payments: ['Payments', 'Review invoices, pay in clinic, or use QR Ph securely.'],
    profile: ['Profile', 'Manage your personal details and communication preferences.'],
  }

  return <div className="pp2-shell">
    <button className={`pp2-backdrop ${mobileNav ? 'is-open' : ''}`} aria-label="Close navigation" onClick={() => setMobileNav(false)} />
    <aside className={`pp2-sidebar ${mobileNav ? 'is-open' : ''}`}>
      <div className="pp2-brand"><span>P</span><div><strong>Plamenco</strong><small>Dental Co.</small></div><button onClick={() => setMobileNav(false)} aria-label="Close"><X size={18}/></button></div>
      <div className="pp2-account"><span className="pp2-avatar" style={profileImage ? { backgroundImage: `url(${profileImage})` } : undefined}>{!profileImage && initials(fullName)}</span><div><strong>{fullName}</strong><small>{patient.patientId}</small></div></div>
      <nav className="pp2-nav"><p>MY CARE</p>{navItems.slice(0, 6).map(({ key, label, icon: Icon }) => <button key={key} className={tab === key ? 'is-active' : ''} onClick={() => openTab(key)}><Icon size={18}/><span>{label}</span></button>)}<p>ACCOUNT</p>{navItems.slice(6).map(({ key, label, icon: Icon }) => <button key={key} className={tab === key ? 'is-active' : ''} onClick={() => openTab(key)}><Icon size={18}/><span>{label}</span></button>)}</nav>
      <div className="pp2-sidebar-footer"><div><LockKeyhole size={15}/><span><strong>Secure portal</strong><small>Private clinic information</small></span></div><button onClick={() => { void signOut(); navigate('/login', { replace: true }) }}><LogOut size={16}/><span>Sign out</span></button></div>
    </aside>

    <main className="pp2-main">
      <header className="pp2-topbar"><button className="pp2-menu" onClick={() => setMobileNav(true)}><Menu size={20}/></button><div><span>{greeting()}, {patient.firstName}</span><h1>{pageCopy[tab][0]}</h1><p>{pageCopy[tab][1]}</p></div><Button size="sm" onClick={() => openTab('booking')}><CalendarDays size={16}/> Book appointment</Button></header>
      <div className="pp2-content">
        {tab === 'dashboard' && <>
          <section className="pp2-dashboard-head"><div><span className="pp2-eyebrow">PATIENT DASHBOARD</span><h2>{greeting()}, {patient.firstName}.</h2><p>Here is what is happening with your care today.</p></div><div className="pp2-dashboard-actions"><button onClick={() => openTab('booking')}><CalendarDays size={17}/><span><strong>Book a visit</strong><small>Find an available schedule</small></span><ArrowRight size={16}/></button><button onClick={() => openTab('payments')}><WalletCards size={17}/><span><strong>View billing</strong><small>{balance > 0 ? money(balance) + ' due' : 'No balance due'}</small></span><ArrowRight size={16}/></button></div></section>
          <section className="pp2-kpis"><article><span><CalendarCheck2 size={17}/></span><div><small>NEXT VISIT</small><strong>{nextAppointment ? clinicDate(nextAppointment.date) : 'No visit'}</strong><p>{nextAppointment ? `${timeLabel(nextAppointment.startTime)} · ${serviceMap.get(nextAppointment.serviceId)?.name ?? 'Appointment'}` : 'Book when you are ready'}</p></div></article><article><span><HeartPulse size={17}/></span><div><small>CARE PROGRESS</small><strong>{treatmentProgress}%</strong><p>{completedTreatments} of {treatments.length} treatments complete</p></div></article><article><span><CircleDollarSign size={17}/></span><div><small>BALANCE</small><strong>{money(balance)}</strong><p>{openInvoices.length ? `${openInvoices.length} open invoice${openInvoices.length === 1 ? '' : 's'}` : 'Account settled'}</p></div></article><article><span><FileText size={17}/></span><div><small>DENTAL RECORDS</small><strong>{records.length}</strong><p>Patient-visible summaries</p></div></article></section>
          <div className="pp2-dashboard-grid"><CareTrendChart appointments={appointments} treatments={treatments} payments={payments}/><section className="pp2-panel"><div className="pp2-panel-head"><div><span>NEXT STEP</span><h3>Upcoming care</h3><p>Your nearest scheduled activity.</p></div></div>{nextAppointment ? <article className="pp2-next-card"><span className="pp2-next-date"><strong>{new Date(`${nextAppointment.date}T00:00:00`).getDate()}</strong><small>{new Date(`${nextAppointment.date}T00:00:00`).toLocaleDateString('en-PH',{month:'short'})}</small></span><div><Badge tone={statusTone(nextAppointment.status)}>{statusLabel(nextAppointment.status)}</Badge><h4>{serviceMap.get(nextAppointment.serviceId)?.name ?? 'Dental appointment'}</h4><p>{timeLabel(nextAppointment.startTime)} · {branchMap.get(nextAppointment.branchId ?? '')?.name ?? 'Plamenco Dental Co.'}</p></div></article> : <EmptyState icon={CalendarDays} title="Nothing scheduled" copy="Book your next visit whenever it is convenient." action={<Button size="sm" onClick={() => openTab('booking')}>Book now</Button>}/>}<div className="pp2-plan-progress"><div><span>Current treatment plan</span><strong>{plans[0]?.name ?? 'No active plan'}</strong></div><div className="pp2-progress"><i style={{ width: `${treatmentProgress}%` }}/></div><small>{treatmentProgress}% complete</small></div></section></div>
        </>}

        {tab === 'booking' && <section className="pp2-page"><SectionHeading eyebrow="APPOINTMENT REQUEST" title="Book your next visit" copy="Prices come from the clinic service catalog. Only currently available appointment slots are shown."/>{bookingSuccess ? <div className="pp2-success"><CheckCircle2 size={34}/><h2>Appointment request sent</h2><p>Reference: <strong>{bookingSuccess}</strong></p><div><Button onClick={() => openTab('appointments')}>View appointments</Button><Button variant="secondary" onClick={resetBooking}>Book another</Button></div></div> : <div className="pp2-booking-layout"><section className="pp2-panel pp2-booking-card"><div className="pp2-steps">{['Service','Branch','Dentist','Schedule','Review'].map((label,index)=><div className={index <= bookingStep ? 'is-active' : ''} key={label}><span>{index < bookingStep ? <Check size={14}/> : index + 1}</span><small>{label}</small></div>)}</div>{bookingError&&<div className="pp2-alert is-error">{bookingError}</div>}<div className="pp2-booking-body">{bookingStep===0&&<><h3>Choose a service</h3><p>Live clinic pricing is shown below.</p><div className="pp2-service-list">{services.map((service)=><button key={service.id} className={booking.serviceId===service.id?'is-selected':''} onClick={()=>updateBooking('serviceId',service.id)}><span><Stethoscope size={18}/></span><div><strong>{service.name}</strong><small>{service.description || `${service.duration} minute appointment`}</small></div><aside><strong>{serviceMoney(service.price)}</strong><small>{service.duration} min</small></aside></button>)}</div></>}{bookingStep===1&&<><h3>Choose a branch</h3><div className="pp2-choice-grid">{branches.map((branch)=><button key={branch.id} className={booking.branchId===branch.id?'is-selected':''} onClick={()=>updateBooking('branchId',branch.id)}><MapPin size={20}/><strong>{branch.name}</strong><small>{[branch.city,branch.province].filter(Boolean).join(', ')}</small></button>)}</div></>}{bookingStep===2&&<><h3>Choose a dentist</h3><div className="pp2-choice-grid"><button className={!booking.providerId?'is-selected':''} onClick={()=>updateBooking('providerId','')}><Sparkles size={20}/><strong>Any available dentist</strong><small>Fastest available option</small></button>{providers.map((provider)=><button key={provider.id} className={booking.providerId===provider.id?'is-selected':''} onClick={()=>updateBooking('providerId',provider.id)}><Stethoscope size={20}/><strong>{provider.displayName}</strong><small>{provider.role.replaceAll('_',' ')}</small></button>)}</div></>}{bookingStep===3&&<><h3>Select date & time</h3><label className="pp2-field"><span>Preferred date</span><input type="date" min={manilaToday()} value={booking.date} onChange={(e)=>updateBooking('date',e.target.value)}/></label><div className="pp2-slot-grid">{availability.slots.map((slot)=><button key={`${slot.providerId}-${slot.startTime}-${slot.operatoryId ?? ''}`} className={booking.startTime===slot.startTime&&booking.providerId===slot.providerId?'is-selected':''} onClick={()=>{setBooking((current)=>({...current,startTime:slot.startTime,providerId:slot.providerId}));setBookingError(null)}}><strong>{timeLabel(slot.startTime)}</strong><small>{slot.providerName}</small></button>)}</div>{booking.date&&!availability.slots.length&&<div className="pp2-inline-empty">No available slots for this selection. Times already booked by another patient are automatically removed.</div>}</>}{bookingStep===4&&<><h3>Review appointment</h3><div className="pp2-review-grid"><div><span>Service</span><strong>{selectedService?.name??'—'}</strong></div><div><span>Price</span><strong>{selectedService?serviceMoney(selectedService.price):'—'}</strong></div><div><span>Branch</span><strong>{selectedBranch?.name??'—'}</strong></div><div><span>Dentist</span><strong>{selectedProvider?.displayName??'Any available dentist'}</strong></div><div><span>Date</span><strong>{clinicDate(booking.date)}</strong></div><div><span>Time</span><strong>{timeLabel(booking.startTime)}</strong></div></div><label className="pp2-field"><span>Notes</span><textarea rows={4} value={booking.notes} onChange={(e)=>updateBooking('notes',e.target.value)} placeholder="Tell the clinic anything helpful about your visit."/></label><div className="pp2-payment-note"><Banknote size={18}/><div><strong>Payment follows billing</strong><p>Pay at the clinic or use QR Ph from Payments after an invoice is issued.</p></div></div></>}</div><footer className="pp2-booking-actions"><Button variant="secondary" disabled={bookingStep===0||bookingBusy} onClick={()=>setBookingStep((value)=>Math.max(0,value-1))}><ChevronLeft size={15}/> Back</Button><Button disabled={bookingBusy} onClick={()=>void bookingNext()}>{bookingBusy?'Submitting…':bookingStep===4?'Confirm appointment':'Continue'} {bookingStep<4&&<ArrowRight size={15}/>}</Button></footer></section><aside className="pp2-panel pp2-booking-summary"><span className="pp2-eyebrow">VISIT SUMMARY</span><h3>{selectedService?.name??'Your next dental visit'}</h3><strong className="pp2-summary-price">{selectedService?serviceMoney(selectedService.price):'—'}</strong><ul><li><MapPin size={15}/>{selectedBranch?.name??'Choose a branch'}</li><li><Stethoscope size={15}/>{selectedProvider?.displayName??'Any available dentist'}</li><li><CalendarDays size={15}/>{booking.date?`${clinicDate(booking.date)} · ${timeLabel(booking.startTime)}`:'Choose a schedule'}</li></ul><small>Final billing may differ if your dentist recommends additional treatment.</small></aside></div>}</section>}

        {tab === 'appointments' && <section className="pp2-page"><SectionHeading eyebrow="VISIT HISTORY" title="Appointments" copy="A responsive timeline of upcoming and previous visits." action={<Button size="sm" onClick={()=>openTab('booking')}>Book new visit</Button>}/><div className="pp2-appointment-list">{appointments.map((item)=><article key={item.id} className="pp2-appointment-card"><div className="pp2-appointment-date"><strong>{new Date(`${item.date}T00:00:00`).getDate()}</strong><span>{new Date(`${item.date}T00:00:00`).toLocaleDateString('en-PH',{month:'short'})}</span><small>{new Date(`${item.date}T00:00:00`).getFullYear()}</small></div><div className="pp2-appointment-copy"><div><Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge><small>{item.appointmentNumber??item.id}</small></div><h3>{serviceMap.get(item.serviceId)?.name??'Dental appointment'}</h3><p><strong>{timeLabel(item.startTime)}</strong> · {branchMap.get(item.branchId??'')?.name??'Clinic branch'}</p><div className="pp2-detail-row"><span><Stethoscope size={14}/> {providerMap.get(item.providerId??'')?.displayName??'Assigned by clinic'}</span>{item.reasonForVisit&&<span><FileText size={14}/> {item.reasonForVisit}</span>}</div></div><div className="pp2-appointment-side"><span>Payment</span><strong>{statusLabel(item.paymentStatus??'not_billed')}</strong><ChevronRight size={18}/></div></article>)}{!appointments.length&&<EmptyState icon={CalendarDays} title="No appointments yet" copy="When you book a visit, it will appear here." action={<Button onClick={()=>openTab('booking')}>Book appointment</Button>}/>}</div></section>}

        {tab === 'dental-records' && <section className="pp2-page"><SectionHeading eyebrow="CLINICAL HISTORY" title="Dental Records" copy="Open any summary to review the patient-visible details shared by your dentist."/><div className="pp2-records-grid">{records.map((record)=><button key={record.id} className="pp2-record-card" onClick={()=>setSelectedRecord(record)}><header><span><FileText size={18}/></span><Badge tone={statusTone(record.status)}>{statusLabel(record.status)}</Badge></header><small>{clinicDate(record.recordDate)}</small><h3>{record.chiefComplaint||'Dental visit summary'}</h3><p>{record.visitType.replaceAll('_',' ')}</p><footer><span>{record.followUpDate?`Follow-up ${clinicDate(record.followUpDate)}`:'No follow-up scheduled'}</span><strong>View details <ChevronRight size={15}/></strong></footer></button>)}{!records.length&&<EmptyState icon={FileText} title="No shared dental records" copy="Finalized patient-visible summaries will appear here."/>}</div></section>}

        {tab === 'treatments' && <section className="pp2-page"><SectionHeading eyebrow="CARE PLAN" title="Treatments" copy="See plan status, progress, treatment history and quoted care details."/><div className="pp2-treatment-hero"><div><span>Overall progress</span><strong>{treatmentProgress}%</strong><p>{completedTreatments} of {treatments.length} treatment items completed</p></div><div className="pp2-progress pp2-progress-lg"><i style={{width:`${treatmentProgress}%`}}/></div><aside><span>Current plan</span><strong>{plans[0]?.name??'No active plan'}</strong><Badge tone={statusTone(plans[0]?.status??'draft')}>{statusLabel(plans[0]?.status??'draft')}</Badge>{Number(plans[0]?.quotedTotalCents??0)>0&&<b>{money(Number(plans[0]?.quotedTotalCents))}</b>}</aside></div><div className="pp2-treatment-layout"><section className="pp2-panel"><div className="pp2-panel-head"><div><span>TREATMENT TIMELINE</span><h3>Your care items</h3></div></div><div className="pp2-treatment-list">{treatments.map((item,index)=><article key={item.id}><span className={item.status==='completed'?'is-done':''}>{item.status==='completed'?<Check size={15}/>:index+1}</span><div><header><strong>{item.serviceNameSnapshot||item.description||'Dental treatment'}</strong><Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge></header><p>{item.description||'Treatment item'}</p><small>{item.treatmentDate?clinicDate(item.treatmentDate):'Date not scheduled'}{item.toothNumber?` · Tooth ${item.toothNumber}`:''}{item.priceSnapshotCents?` · ${money(item.priceSnapshotCents)}`:''}</small></div></article>)}{!treatments.length&&<EmptyState icon={HeartPulse} title="No treatments yet" copy="Your treatment plan will appear after your dentist creates one."/>}</div></section><aside className="pp2-panel"><span className="pp2-eyebrow">PLAN SUMMARY</span><h3>{plans[0]?.name??'No active plan'}</h3><p>{plans[0]?.description||'Your dentist has not shared a detailed treatment plan yet.'}</p><dl className="pp2-definition-list"><div><dt>Status</dt><dd>{statusLabel(plans[0]?.status??'draft')}</dd></div><div><dt>Total items</dt><dd>{treatments.length}</dd></div><div><dt>Completed</dt><dd>{completedTreatments}</dd></div><div><dt>Remaining</dt><dd>{Math.max(treatments.length-completedTreatments,0)}</dd></div>{Number(plans[0]?.quotedTotalCents??0)>0&&<div><dt>Quoted total</dt><dd>{money(Number(plans[0]?.quotedTotalCents))}</dd></div>}</dl></aside></div></section>}

        {tab === 'prescriptions' && <section className="pp2-page"><SectionHeading eyebrow="MEDICATION" title="Prescriptions" copy="Prescriptions created by your dentist and shared with your patient account."/><div className="pp2-rx-grid">{prescriptions.map((rx)=><article key={rx.id} className="pp2-rx-card"><header><span><Pill size={19}/></span><div><small>{clinicDate(rx.prescriptionDate)}</small><Badge tone={statusTone(rx.status)}>{statusLabel(rx.status)}</Badge></div></header><h3>{rx.medication||rx.items?.map((item)=>item.medication).filter(Boolean).join(', ')||'Prescription'}</h3><div>{rx.items?.map((item)=><section key={item.id}><strong>{item.medication}{item.strength?` · ${item.strength}`:''}</strong><p>{[item.dosage,item.frequency,item.duration].filter(Boolean).join(' · ')}</p>{item.instructions&&<small>{item.instructions}</small>}</section>)}</div>{rx.instructions&&<footer>{rx.instructions}</footer>}</article>)}{!prescriptions.length&&<EmptyState icon={Pill} title="No prescriptions" copy="Prescriptions from your dentist will appear here."/>}</div></section>}

        {tab === 'payments' && <section className="pp2-page"><SectionHeading eyebrow="BILLING" title="Payments & Invoices" copy="Pay at the clinic or generate a QR Ph code for the exact outstanding invoice balance."/><section className="pp2-billing-summary"><div><small>OUTSTANDING BALANCE</small><strong>{money(balance)}</strong><p>{openInvoices.length?`${openInvoices.length} open invoice${openInvoices.length===1?'':'s'}`:'Your account is fully settled.'}</p></div><div><ShieldCheck size={22}/><span><strong>Secure payment flow</strong><small>Online payments post only after PayMongo confirms success.</small></span></div></section><div className="pp2-billing-layout"><section><h3>Open invoices</h3><div className="pp2-invoice-list">{openInvoices.map((invoice)=><article key={invoice.id}><div><span><ReceiptText size={18}/></span><div><strong>{invoice.invoiceNumber}</strong><p>Issued {clinicDate(invoice.invoiceDate)}{invoice.dueDate?` · Due ${clinicDate(invoice.dueDate)}`:''}</p></div></div><section><span>Invoice total</span><strong>{money(invoice.totalCents)}</strong><small>Paid {money(invoice.amountPaidCents)}</small></section><section><span>Balance</span><strong>{money(invoice.balanceCents)}</strong></section><footer><button onClick={()=>choosePayment(invoice.id,'cash')}><Banknote size={16}/> Pay in clinic</button><button className="is-primary" onClick={()=>choosePayment(invoice.id,'online')}><QrCode size={16}/> Pay with QR Ph</button></footer></article>)}{!openInvoices.length&&<EmptyState icon={CheckCircle2} title="You're all settled" copy="There are no outstanding invoices."/>}</div></section><aside className="pp2-panel"><div className="pp2-panel-head"><div><span>PAYMENT HISTORY</span><h3>Recent payments</h3></div></div><div className="pp2-payment-history">{payments.slice(0,8).map((payment)=><div key={payment.id}><span><strong>{money(payment.amountCents)}</strong><small>{clinicDate(payment.date)} · {payment.paymentMethod.replaceAll('_',' ')}</small></span><Badge tone={statusTone(payment.status)}>{statusLabel(payment.status)}</Badge></div>)}{!payments.length&&<p>No payments recorded yet.</p>}</div>{receipts.length>0&&<div className="pp2-receipts"><ReceiptText size={16}/>{receipts.length} receipt{receipts.length===1?'':'s'} on file</div>}</aside></div></section>}

        {tab === 'profile' && <section className="pp2-page"><SectionHeading eyebrow="ACCOUNT" title="Profile" copy="Manage your contact information and clinic communication preferences." action={<Button variant="secondary" size="sm" onClick={()=>setProfileEditing((value)=>!value)}>{profileEditing?'Cancel':'Edit profile'}</Button>}/><div className="pp2-profile-layout"><section className="pp2-panel"><div className="pp2-profile-head"><label className="pp2-avatar pp2-avatar-lg" style={profileImage?{backgroundImage:`url(${profileImage})`}:undefined}>{!profileImage&&initials(fullName)}{profileEditing&&<input type="file" accept="image/*" onChange={(event)=>{const file=event.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>setProfileImage(typeof reader.result==='string'?reader.result:'');reader.readAsDataURL(file)}}/>}</label><div><h3>{fullName}</h3><p>{patient.patientId}</p><span><ShieldCheck size={14}/> Verified patient account</span></div></div>{profileMessage&&<div className="pp2-alert">{profileMessage}</div>}<div className="pp2-profile-fields">{[['firstName','First name','text'],['middleName','Middle name','text'],['lastName','Last name','text'],['dateOfBirth','Date of birth','date'],['email','Contact email','email'],['phone','Phone','tel'],['address','Address','text'],['emergencyContact','Emergency contact','text'],['emergencyContactPhone','Emergency phone','tel'],['emergencyContactRelationship','Relationship','text']].map(([key,label,type])=><label key={key}><span>{label}</span><input type={type} disabled={!profileEditing} value={profile[key as keyof typeof profile]} onChange={(event)=>setProfile((current)=>({...current,[key]:event.target.value}))}/></label>)}</div>{profileEditing&&<footer><Button disabled={profileBusy} onClick={()=>void saveProfile()}>{profileBusy?'Saving…':'Save changes'}</Button></footer>}</section><aside className="pp2-panel pp2-comms"><CommunicationPreferencesPanel patient={patient} actor={user?.id??'patient_portal'} canEdit /></aside></div></section>}
      </div>
    </main>

    {selectedRecord&&<div className="pp2-modal-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&setSelectedRecord(null)}><section className="pp2-modal pp2-record-modal"><header><div><span>DENTAL RECORD</span><h2>{selectedRecord.chiefComplaint||'Dental visit summary'}</h2><p>{clinicDate(selectedRecord.recordDate)} · {selectedRecord.visitType.replaceAll('_',' ')}</p></div><button type="button" aria-label="Close dental record details" onClick={()=>setSelectedRecord(null)}><X size={18}/></button></header><div className="pp2-record-detail-grid"><div><span>Status</span><strong>{statusLabel(selectedRecord.status)}</strong></div><div><span>Follow-up</span><strong>{selectedRecord.followUpDate?clinicDate(selectedRecord.followUpDate):'None scheduled'}</strong></div><div><span>Visit type</span><strong>{selectedRecord.visitType.replaceAll('_',' ')}</strong></div><div><span>Appointment</span><strong>{selectedRecord.relatedAppointmentId?'Linked':'Not linked'}</strong></div></div><div className="pp2-record-summary"><h3>Patient-visible summary</h3><p>{selectedRecord.chiefComplaint||'Your dentist has shared a finalized visit summary. Internal clinical notes remain private to the clinic.'}</p></div><footer><Button variant="secondary" onClick={()=>setSelectedRecord(null)}>Close</Button></footer></section></div>}

    {payMode!=='none'&&selectedPayInvoice&&<div className="pp2-modal-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&!payBusy&&setPayMode('none')}><section className="pp2-modal pp2-pay-modal"><header><div><span>{payMode==='cash'?'PAY AT CLINIC':'QR PH PAYMENT'}</span><h2>{payMode==='cash'?'Pay in person':'Pay with QR Ph'}</h2><p>{selectedPayInvoice.invoiceNumber}</p></div><button type="button" aria-label="Close payment dialog" onClick={()=>setPayMode('none')} disabled={payBusy}><X size={18}/></button></header>{payMode==='cash'?<div className="pp2-cash-box"><Banknote size={34}/><h3>Pay {money(selectedPayInvoice.balanceCents)} at the clinic</h3><p>No payment record is created until clinic staff actually receives and records your payment.</p></div>:<div className="pp2-online-box">{payError&&<div className="pp2-alert is-error">{payError}</div>}<div className="pp2-pay-amount"><span>Amount to pay</span><strong>{money(selectedPayInvoice.balanceCents)}</strong></div>{!paySession?<><div className="pp2-qr-placeholder"><QrCode size={52}/></div><h3>Generate your secure QR</h3><p>The amount is locked to this invoice balance.</p><Button disabled={payBusy} onClick={()=>void startQrPayment()}>{payBusy?'Generating…':'Generate QR Ph code'}</Button></>:<><div className="pp2-qr-frame"><img src={paySession.qrImage} alt={`QR Ph payment for ${selectedPayInvoice.invoiceNumber}`}/><span>{money(paySession.amountCents)}</span></div><h3>Scan and pay</h3><p>We check PayMongo automatically every few seconds. You can also check manually.</p>{payStatus&&<div className="pp2-alert is-success">{payStatus}</div>}<Button disabled={payBusy} onClick={()=>void checkQrStatus()}>{payBusy?'Checking…':'Check payment now'}</Button><small>Reference: {paySession.paymentNumber??paySession.paymentId}</small></>}</div>}<footer><Button variant="secondary" disabled={payBusy} onClick={()=>setPayMode('none')}>Close</Button></footer></section></div>}
  </div>
}
