import {
  Activity,
  ArrowRight,
  Banknote,
  CalendarCheck2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
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
import { getDocumentsByPatient } from '../features/documents/documentStore'
import { getCurrentPatientForAuthenticatedUser } from '../features/patients/patientStore'
import { updateMyPatientProfilePersisted } from '../features/patients/patientPersistence'
import type { Patient } from '../features/patients/patientTypes'
import { createPatientQrPayment, checkPatientQrPayment, type PatientQrPaymentSession } from '../features/patientPortal/patientPaymentPersistence'
import { hydratePatientPortalFromDatabase } from '../features/patientPortal/patientPortalHydration'
import { getPrescriptionsByPatient } from '../features/prescriptions/prescriptionStore'
import { getStoredServices } from '../features/services/serviceStore'
import { getStoredTreatmentPlans, getTreatmentsByPatient } from '../features/treatments/treatmentStore'

const navItems = [
  { key: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { key: 'booking', label: 'Book a visit', icon: CalendarDays },
  { key: 'appointments', label: 'Appointments', icon: CalendarCheck2 },
  { key: 'dental-records', label: 'Dental records', icon: FileText },
  { key: 'treatments', label: 'Treatments', icon: HeartPulse },
  { key: 'prescriptions', label: 'Prescriptions', icon: Pill },
  { key: 'payments', label: 'Payments', icon: WalletCards },
  { key: 'documents', label: 'Documents', icon: FileUser },
  { key: 'profile', label: 'My profile', icon: UserRound },
] as const

type TabKey = (typeof navItems)[number]['key']

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
  const suffix = hours >= 12 ? 'PM' : 'AM'
  return `${hours % 12 || 12}:${String(minutes || 0).padStart(2, '0')} ${suffix}`
}

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
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

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', hour12: false }).format(new Date()))
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

function EmptyState({ icon: Icon, title, copy, action }: { icon: typeof FileText; title: string; copy: string; action?: React.ReactNode }) {
  return <div className="ppx-empty"><span><Icon size={24} /></span><h3>{title}</h3><p>{copy}</p>{action}</div>
}

function SectionHeading({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy?: string; action?: React.ReactNode }) {
  return <div className="ppx-section-heading"><div><span>{eyebrow}</span><h2>{title}</h2>{copy && <p>{copy}</p>}</div>{action}</div>
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
      if (!user || user.role !== 'patient') {
        if (alive) setLookupState('missing')
        return
      }
      setLookupState('loading')
      setLookupError(null)
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
  }, [user, patientId])

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

  const services = useMemo(() => getStoredServices().filter((item) => item.status === 'active'), [])
  const branches = useMemo(() => getStoredBranches().filter((item) => item.status === 'active'), [])
  const providers = useMemo(() => booking.branchId ? getEligibleProviders(booking.branchId) : [], [booking.branchId])
  const serviceMap = useMemo(() => new Map(getStoredServices().map((item) => [item.id, item])), [])
  const branchMap = useMemo(() => new Map(getStoredBranches().map((item) => [item.id, item])), [])
  const providerMap = useMemo(() => new Map(getStoredProviders().map((item) => [item.id, item])), [])

  const selectedService = services.find((item) => item.id === booking.serviceId)
  const selectedBranch = branches.find((item) => item.id === booking.branchId)
  const selectedProvider = providerMap.get(booking.providerId)
  const openInvoices = invoices.filter((invoice) => invoice.balanceCents > 0 && invoice.status !== 'void')
  const selectedPayInvoice = invoices.find((invoice) => invoice.id === payInvoiceId) ?? null

  const availability = useMemo(() => {
    if (!booking.date || !booking.serviceId || !booking.branchId) return { status: 'missing_context' as const, slots: [], eligibleProviderCount: 0, scheduledProviderCount: 0 }
    return getAppointmentAvailability({ branchId: booking.branchId, serviceId: booking.serviceId, providerId: booking.providerId || undefined, date: booking.date })
  }, [booking.branchId, booking.date, booking.providerId, booking.serviceId])

  const nextAppointment = useMemo(() => [...appointments]
    .filter((item) => !['cancelled', 'no_show', 'completed'].includes(item.status))
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))[0], [appointments])

  const completedTreatments = treatments.filter((item) => item.status === 'completed').length
  const treatmentProgress = treatments.length ? Math.round((completedTreatments / treatments.length) * 100) : 0
  const fullName = patient ? `${patient.firstName} ${patient.middleName ? `${patient.middleName} ` : ''}${patient.lastName}`.trim() : ''

  if (!resolvedPatientId) return <Navigate to="/login" replace />
  if (lookupState === 'loading') return <div className="ppx-loading"><span /><strong>Preparing your care portal</strong><small>Loading your latest clinic records.</small></div>
  if (lookupState === 'error') return <div className="ppx-loading"><strong>We could not load your portal</strong><small>{lookupError}</small></div>
  if (!patient) return <div className="ppx-loading"><strong>No patient record found</strong><small>Please contact the clinic so your account can be linked.</small></div>

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
    if (!selectedService) return setBookingError('The selected service is no longer available.')
    const slot = availability.slots.find((item) => item.startTime === booking.startTime && (!booking.providerId || item.providerId === booking.providerId))
    if (!slot) return setBookingError('That time is no longer available. Please select another slot.')

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
    } finally { setBookingBusy(false) }
  }

  function resetBooking() {
    setBooking({ serviceId: '', branchId: '', providerId: '', date: '', startTime: '', notes: '' })
    setBookingStep(0)
    setBookingSuccess(null)
    setBookingError(null)
  }

  async function saveProfile() {
    if (profileBusy) return
    if (!profile.firstName.trim() || !profile.lastName.trim() || !profile.email.trim() || !profile.phone.trim()) {
      setProfileMessage('Complete your required name, email and phone details.')
      return
    }
    setProfileBusy(true)
    setProfileMessage(null)
    try {
      const updated = await updateMyPatientProfilePersisted({ ...profile, profileImage })
      setPatient(updated)
      setProfileEditing(false)
      setProfileMessage('Profile updated successfully.')
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Unable to save your profile.')
    } finally { setProfileBusy(false) }
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
      setPayStatus('QR ready — scan using any QR Ph-supported banking or wallet app.')
    } catch (error) {
      setPayError(error instanceof Error ? error.message : 'Unable to start online payment.')
    } finally { setPayBusy(false) }
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
        setPayStatus(result.status === 'awaiting_next_action' ? 'Still waiting for the QR payment.' : `Current status: ${statusLabel(result.status)}`)
      }
    } catch (error) {
      setPayError(error instanceof Error ? error.message : 'Unable to confirm payment status.')
    } finally { setPayBusy(false) }
  }

  const headerCopy: Record<TabKey, [string, string]> = {
    dashboard: ['Your care, in one place', 'A clear view of appointments, treatment progress, balances and recent clinic activity.'],
    booking: ['Book a visit', 'Choose your service, branch, dentist and an available time.'],
    appointments: ['Appointments', 'Track every scheduled visit and its current clinic status.'],
    'dental-records': ['Dental records', 'Patient-visible visit summaries shared by your clinical team.'],
    treatments: ['Treatments', 'Follow active treatment plans and completed dental care.'],
    prescriptions: ['Prescriptions', 'Review medicines and instructions issued by your dentist.'],
    payments: ['Payments & billing', 'Review balances, invoices and receipts, or pay securely with QR Ph.'],
    documents: ['Documents', 'Open patient-visible files shared securely by the clinic.'],
    profile: ['My profile', 'Keep your contact and emergency information up to date.'],
  }

  return <div className="ppx-shell">
    <div className={`ppx-backdrop ${mobileNav ? 'is-open' : ''}`} onClick={() => setMobileNav(false)} />
    <aside className={`ppx-sidebar ${mobileNav ? 'is-open' : ''}`}>
      <div className="ppx-brand"><span>P</span><div><strong>Plamenco</strong><small>Dental Co. · Patient</small></div><button onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button></div>
      <div className="ppx-profile-mini">
        <span className="ppx-avatar" style={profileImage ? { backgroundImage: `url(${profileImage})` } : undefined}>{!profileImage && initials(fullName)}</span>
        <div><strong>{fullName}</strong><small>{patient.patientId}</small></div>
        <span className="ppx-verified"><ShieldCheck size={13} /> Verified</span>
      </div>
      <nav className="ppx-nav" aria-label="Patient portal">
        <small>MY CARE</small>
        {navItems.slice(0, 6).map(({ key, label, icon: Icon }) => <button key={key} className={tab === key ? 'is-active' : ''} onClick={() => openTab(key)}><Icon size={18} /><span>{label}</span>{tab === key && <i />}</button>)}
        <small>ACCOUNT</small>
        {navItems.slice(6).map(({ key, label, icon: Icon }) => <button key={key} className={tab === key ? 'is-active' : ''} onClick={() => openTab(key)}><Icon size={18} /><span>{label}</span>{tab === key && <i />}</button>)}
      </nav>
      <div className="ppx-sidebar-footer">
        <div><LockKeyhole size={15} /><span><strong>Private & secure</strong><small>Your clinic data is account-protected.</small></span></div>
        <button onClick={() => { void signOut(); navigate('/login', { replace: true }) }}><LogOut size={17} /> Sign out</button>
      </div>
    </aside>

    <main className="ppx-main">
      <header className="ppx-topbar">
        <button className="ppx-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button>
        <div><span>{greeting()}, {patient.firstName}</span><strong>{headerCopy[tab][0]}</strong><small>{headerCopy[tab][1]}</small></div>
        <button className="ppx-book-primary" onClick={() => openTab('booking')}><CalendarDays size={17} /><span>Book appointment</span></button>
      </header>

      <div className="ppx-content">
        {tab === 'dashboard' && <>
          <section className="ppx-hero">
            <div className="ppx-hero-copy"><span className="ppx-kicker"><Sparkles size={14} /> PERSONAL CARE PORTAL</span><h1>Everything about your smile,<br/><em>beautifully organized.</em></h1><p>See your next visit, active care plan, payments and shared records without calling the clinic.</p><div><Button onClick={() => openTab('booking')}>Book your next visit <ArrowRight size={15}/></Button><Button variant="secondary" onClick={() => openTab('payments')}>View billing</Button></div></div>
            <div className="ppx-hero-card"><span className="ppx-hero-card-label">Next appointment</span>{nextAppointment ? <><div className="ppx-date-block"><strong>{clinicDate(nextAppointment.date).split(' ')[1]?.replace(',', '')}</strong><span>{clinicDate(nextAppointment.date).split(' ')[0]}</span></div><h3>{serviceMap.get(nextAppointment.serviceId)?.name ?? 'Dental appointment'}</h3><p>{timeLabel(nextAppointment.startTime)} · {branchMap.get(nextAppointment.branchId ?? '')?.name ?? 'Plamenco Dental Co.'}</p><Badge tone={statusTone(nextAppointment.status)}>{statusLabel(nextAppointment.status)}</Badge></> : <><CalendarCheck2 size={30}/><h3>No visit scheduled</h3><p>Pick a convenient service and time when you are ready.</p><button onClick={() => openTab('booking')}>Find a schedule <ArrowRight size={15}/></button></>}</div>
          </section>

          <section className="ppx-metrics">
            <article><span><CalendarCheck2 size={17}/></span><div><small>Upcoming visit</small><strong>{nextAppointment ? clinicDate(nextAppointment.date) : 'Not scheduled'}</strong><p>{nextAppointment ? timeLabel(nextAppointment.startTime) : 'Book anytime'}</p></div></article>
            <article><span><HeartPulse size={17}/></span><div><small>Care progress</small><strong>{treatmentProgress}%</strong><p>{completedTreatments} of {treatments.length} treatments complete</p></div></article>
            <article className={balance > 0 ? 'has-balance' : ''}><span><WalletCards size={17}/></span><div><small>Outstanding balance</small><strong>{money(balance)}</strong><p>{openInvoices.length ? `${openInvoices.length} open invoice${openInvoices.length === 1 ? '' : 's'}` : 'All settled'}</p></div></article>
            <article><span><FileText size={17}/></span><div><small>Shared records</small><strong>{records.length + documents.length}</strong><p>Clinical summaries & documents</p></div></article>
          </section>

          <div className="ppx-dashboard-grid">
            <section className="ppx-card ppx-care-card"><SectionHeading eyebrow="CARE JOURNEY" title="Treatment progress" copy="Your latest treatment activity at a glance."/><div className="ppx-progress-orbit"><div style={{ '--progress': `${treatmentProgress * 3.6}deg` } as React.CSSProperties}><strong>{treatmentProgress}%</strong><span>complete</span></div><section><h3>{plans[0]?.name ?? 'No active treatment plan'}</h3><p>{plans[0]?.description || 'Your dentist will share your treatment plan here when one is ready.'}</p><div className="ppx-progress-bar"><i style={{ width: `${treatmentProgress}%` }}/></div><small>{completedTreatments} completed · {Math.max(treatments.length - completedTreatments, 0)} remaining</small></section></div></section>
            <section className="ppx-card"><SectionHeading eyebrow="RECENT ACTIVITY" title="What changed"/><div className="ppx-timeline">{[
              ...appointments.slice(-2).map((a) => ({ id: `a-${a.id}`, date: a.date, title: 'Appointment update', copy: `${serviceMap.get(a.serviceId)?.name ?? 'Visit'} · ${statusLabel(a.status)}`, icon: CalendarDays })),
              ...payments.slice(-2).map((p) => ({ id: `p-${p.id}`, date: p.date, title: 'Payment recorded', copy: `${money(p.amountCents)} · ${statusLabel(p.status)}`, icon: CreditCard })),
              ...records.slice(-2).map((r) => ({ id: `r-${r.id}`, date: r.recordDate, title: 'Dental summary', copy: r.chiefComplaint || 'Visit summary updated', icon: FileText })),
            ].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5).map((item) => <div key={item.id}><span><item.icon size={15}/></span><div><strong>{item.title}</strong><p>{item.copy}</p></div><small>{clinicDate(item.date)}</small></div>)}{!appointments.length && !payments.length && !records.length && <EmptyState icon={Activity} title="No recent activity" copy="Your clinic updates will appear here."/>}</div></section>
          </div>
        </>}

        {tab === 'booking' && <section className="ppx-page">
          <SectionHeading eyebrow="APPOINTMENT REQUEST" title="Book your next visit" copy="A guided booking flow using the clinic's live availability."/>
          {bookingSuccess ? <div className="ppx-success-card"><span><CheckCircle2 size={30}/></span><h2>Request sent successfully</h2><p>Your appointment reference is <strong>{bookingSuccess}</strong>. The clinic will confirm it in your portal.</p><div><Button onClick={() => openTab('appointments')}>View appointments</Button><Button variant="secondary" onClick={resetBooking}>Book another</Button></div></div> : <div className="ppx-booking-layout">
            <section className="ppx-card ppx-booking-card">
              <div className="ppx-booking-steps">{['Service','Branch','Dentist','Schedule','Review'].map((label,index)=><div className={index <= bookingStep ? 'is-active' : ''} key={label}><span>{index < bookingStep ? <Check size={14}/> : index+1}</span><small>{label}</small></div>)}</div>
              {bookingError && <div className="ppx-alert is-error">{bookingError}</div>}
              <div className="ppx-booking-body">
                {bookingStep === 0 && <><h3>What can we help you with?</h3><p>Choose the service that best matches your visit.</p><div className="ppx-option-list">{services.map((service)=><button key={service.id} className={booking.serviceId === service.id ? 'is-selected' : ''} onClick={()=>updateBooking('serviceId',service.id)}><span><Stethoscope size={18}/></span><div><strong>{service.name}</strong><small>{service.description || `${service.duration} minute appointment`}</small></div><aside><strong>{serviceMoney(service.price)}</strong><small>{service.duration} min</small></aside></button>)}</div></>}
                {bookingStep === 1 && <><h3>Choose your clinic</h3><p>Select the branch that is most convenient for you.</p><div className="ppx-choice-grid">{branches.map((branch)=><button key={branch.id} className={booking.branchId === branch.id ? 'is-selected' : ''} onClick={()=>updateBooking('branchId',branch.id)}><MapPin size={20}/><strong>{branch.name}</strong><small>{[branch.city,branch.province].filter(Boolean).join(', ')}</small></button>)}</div></>}
                {bookingStep === 2 && <><h3>Select a dentist</h3><p>You may choose a specific provider or let the clinic assign any available dentist.</p><div className="ppx-choice-grid"><button className={!booking.providerId ? 'is-selected' : ''} onClick={()=>updateBooking('providerId','')}><Sparkles size={20}/><strong>Any available dentist</strong><small>Fastest available option</small></button>{providers.map((provider)=><button key={provider.id} className={booking.providerId === provider.id ? 'is-selected' : ''} onClick={()=>updateBooking('providerId',provider.id)}><Stethoscope size={20}/><strong>{provider.displayName}</strong><small>{provider.role.replaceAll('_',' ')}</small></button>)}</div></>}
                {bookingStep === 3 && <><h3>Pick a date & time</h3><p>Only currently available clinic slots are shown.</p><label className="ppx-field"><span>Preferred date</span><input type="date" min={manilaToday()} value={booking.date} onChange={(e)=>updateBooking('date',e.target.value)}/></label><div className="ppx-slot-grid">{availability.slots.map((slot)=><button key={`${slot.providerId}-${slot.startTime}`} className={booking.startTime===slot.startTime&&booking.providerId===slot.providerId?'is-selected':''} onClick={()=>{setBooking((c)=>({...c,startTime:slot.startTime,providerId:slot.providerId}));setBookingError(null)}}><strong>{timeLabel(slot.startTime)}</strong><small>{slot.providerName}</small></button>)}</div>{booking.date && !availability.slots.length && <div className="ppx-inline-empty">No available time slots for this selection. Try another date or dentist.</div>}</>}
                {bookingStep === 4 && <><h3>Review your appointment</h3><p>Confirm the details before submitting your request.</p><div className="ppx-review-grid"><div><span>Service</span><strong>{selectedService?.name ?? '—'}</strong></div><div><span>Branch</span><strong>{selectedBranch?.name ?? '—'}</strong></div><div><span>Dentist</span><strong>{selectedProvider?.displayName ?? 'Any available dentist'}</strong></div><div><span>Date</span><strong>{clinicDate(booking.date)}</strong></div><div><span>Time</span><strong>{timeLabel(booking.startTime)}</strong></div><div><span>Estimated fee</span><strong>{selectedService ? serviceMoney(selectedService.price) : '—'}</strong></div></div><label className="ppx-field"><span>Notes for the clinic</span><textarea rows={4} value={booking.notes} onChange={(e)=>updateBooking('notes',e.target.value)} placeholder="Symptoms, concerns or anything the clinic should know."/></label><div className="ppx-payment-note"><Banknote size={18}/><div><strong>Payment happens after billing</strong><p>You can pay in person at the clinic or use QR Ph from the Payments page once an invoice is issued.</p></div></div></>}
              </div>
              <footer className="ppx-booking-actions"><Button variant="secondary" disabled={bookingStep===0||bookingBusy} onClick={()=>setBookingStep((s)=>Math.max(0,s-1))}><ChevronLeft size={15}/> Back</Button><Button disabled={bookingBusy} onClick={()=>void bookingNext()}>{bookingBusy?'Submitting…':bookingStep===4?'Confirm appointment':'Continue'} {bookingStep<4&&<ArrowRight size={15}/>}</Button></footer>
            </section>
            <aside className="ppx-card ppx-booking-summary"><span className="ppx-kicker"><Sparkles size={13}/> VISIT SUMMARY</span><h3>{selectedService?.name ?? 'Your next dental visit'}</h3><p>{selectedService?.description || 'Select a service to begin building your appointment.'}</p><div><span>Estimated fee</span><strong>{selectedService?serviceMoney(selectedService.price):'—'}</strong></div><ul><li><MapPin size={15}/><span>{selectedBranch?.name ?? 'Choose a branch'}</span></li><li><Stethoscope size={15}/><span>{selectedProvider?.displayName ?? 'Any available dentist'}</span></li><li><CalendarDays size={15}/><span>{booking.date?`${clinicDate(booking.date)} · ${timeLabel(booking.startTime)}`:'Choose a schedule'}</span></li></ul><small>Appointment fees are estimates until the clinic issues an invoice.</small></aside>
          </div>}
        </section>}

        {tab === 'appointments' && <section className="ppx-page"><SectionHeading eyebrow="YOUR VISITS" title="Appointments" copy="Upcoming and past appointments from your clinic record." action={<Button size="sm" onClick={()=>openTab('booking')}>Book new visit</Button>}/><div className="ppx-record-grid">{appointments.map((item)=><article className="ppx-record-card" key={item.id}><header><span><CalendarDays size={18}/></span><Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge></header><h3>{serviceMap.get(item.serviceId)?.name ?? 'Dental appointment'}</h3><p>{clinicDate(item.date)} · {timeLabel(item.startTime)}</p><dl><div><dt>Branch</dt><dd>{branchMap.get(item.branchId ?? '')?.name ?? 'Clinic branch'}</dd></div><div><dt>Dentist</dt><dd>{providerMap.get(item.providerId ?? '')?.displayName ?? 'Assigned by clinic'}</dd></div>{item.reasonForVisit&&<div><dt>Reason</dt><dd>{item.reasonForVisit}</dd></div>}</dl><footer><small>{item.appointmentNumber ?? item.id}</small><span>{statusLabel(item.paymentStatus ?? 'not_billed')}</span></footer></article>)}{!appointments.length&&<EmptyState icon={CalendarDays} title="No appointments yet" copy="When you book a visit, it will appear here." action={<Button onClick={()=>openTab('booking')}>Book appointment</Button>}/>}</div></section>}

        {tab === 'dental-records' && <section className="ppx-page"><SectionHeading eyebrow="CLINICAL SUMMARIES" title="Dental records" copy="Only patient-visible finalized or amended summaries are shown here."/><div className="ppx-stack">{records.map((record)=><article className="ppx-list-card" key={record.id}><span className="ppx-list-icon"><FileText size={18}/></span><div><header><strong>{record.chiefComplaint || 'Dental visit summary'}</strong><Badge tone={statusTone(record.status)}>{statusLabel(record.status)}</Badge></header><p>{record.visitType.replaceAll('_',' ')} · {clinicDate(record.recordDate)}</p>{record.followUpDate&&<small>Follow-up: {clinicDate(record.followUpDate)}</small>}</div></article>)}{!records.length&&<EmptyState icon={FileText} title="No shared dental records" copy="Finalized summaries shared by your dentist will appear here."/>}</div></section>}

        {tab === 'treatments' && <section className="ppx-page"><SectionHeading eyebrow="CARE PLAN" title="Treatments" copy="Follow planned, active and completed dental care."/><div className="ppx-treatment-layout"><section className="ppx-card"><div className="ppx-progress-header"><div><span>Overall progress</span><strong>{treatmentProgress}%</strong></div><div className="ppx-progress-bar"><i style={{width:`${treatmentProgress}%`}}/></div><small>{completedTreatments} completed of {treatments.length}</small></div><div className="ppx-stack">{treatments.map((item)=><article className="ppx-treatment-row" key={item.id}><span><CheckCircle2 size={17}/></span><div><strong>{item.serviceNameSnapshot || item.description || 'Dental treatment'}</strong><p>{item.treatmentDate?clinicDate(item.treatmentDate):'Date to be scheduled'}{item.toothNumber?` · Tooth ${item.toothNumber}`:''}</p></div><Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge></article>)}{!treatments.length&&<EmptyState icon={HeartPulse} title="No treatments yet" copy="Your care plan will appear after your dentist creates one."/>}</div></section><aside className="ppx-card"><span className="ppx-kicker">CURRENT PLAN</span><h3>{plans[0]?.name ?? 'No active plan'}</h3><p>{plans[0]?.description || 'Your dentist has not shared a treatment plan yet.'}</p>{plans[0]&&<><div className="ppx-plan-total"><span>Plan status</span><Badge tone={statusTone(plans[0].status)}>{statusLabel(plans[0].status)}</Badge></div>{Number(plans[0].quotedTotalCents??0)>0&&<div className="ppx-plan-total"><span>Quoted total</span><strong>{money(Number(plans[0].quotedTotalCents))}</strong></div>}</>}</aside></div></section>}

        {tab === 'prescriptions' && <section className="ppx-page"><SectionHeading eyebrow="MEDICATION" title="Prescriptions" copy="Medication instructions issued by your clinical provider."/><div className="ppx-record-grid">{prescriptions.map((rx)=><article className="ppx-record-card ppx-rx-card" key={rx.id}><header><span><Pill size={18}/></span><Badge tone={statusTone(rx.status)}>{statusLabel(rx.status)}</Badge></header><h3>{rx.medication || rx.items?.map((item)=>item.medication).filter(Boolean).join(', ') || 'Prescription'}</h3><p>Issued {clinicDate(rx.prescriptionDate)}</p><dl>{rx.items?.slice(0,3).map((item)=><div key={item.id}><dt>{item.medication}</dt><dd>{[item.strength,item.dosage,item.frequency,item.duration].filter(Boolean).join(' · ')}</dd></div>)}{!rx.items?.length&&<><div><dt>Dosage</dt><dd>{rx.dosage||'See clinic instructions'}</dd></div><div><dt>Frequency</dt><dd>{rx.frequency||'See clinic instructions'}</dd></div></>}</dl>{rx.instructions&&<footer><small>{rx.instructions}</small></footer>}</article>)}{!prescriptions.length&&<EmptyState icon={Pill} title="No prescriptions" copy="Prescriptions from your dentist will appear here."/>}</div></section>}

        {tab === 'payments' && <section className="ppx-page"><SectionHeading eyebrow="BILLING" title="Payments & invoices" copy="Choose to pay at the clinic or generate a secure QR Ph code for an open invoice."/><section className="ppx-billing-hero"><div><span>Outstanding balance</span><strong>{money(balance)}</strong><p>{openInvoices.length ? `${openInvoices.length} invoice${openInvoices.length===1?'':'s'} waiting for payment` : 'Your account is currently settled.'}</p></div><span><ShieldCheck size={20}/><small>Online payments are posted only after gateway confirmation.</small></span></section>
          <div className="ppx-billing-layout"><section><h3>Open invoices</h3><div className="ppx-stack">{openInvoices.map((invoice)=><article className="ppx-invoice" key={invoice.id}><div><span><ReceiptText size={18}/></span><div><strong>{invoice.invoiceNumber}</strong><p>Issued {clinicDate(invoice.invoiceDate)}{invoice.dueDate?` · Due ${clinicDate(invoice.dueDate)}`:''}</p></div></div><section><span>Balance</span><strong>{money(invoice.balanceCents)}</strong></section><footer><button onClick={()=>choosePayment(invoice.id,'cash')}><Banknote size={16}/> Pay in clinic</button><button className="is-online" onClick={()=>choosePayment(invoice.id,'online')}><QrCode size={16}/> Pay with QR Ph</button></footer></article>)}{!openInvoices.length&&<EmptyState icon={CheckCircle2} title="You're all settled" copy="There are no outstanding invoices on your account."/>}</div></section><aside className="ppx-card"><span className="ppx-kicker">PAYMENT HISTORY</span><h3>Recent payments</h3><div className="ppx-mini-ledger">{payments.slice(0,6).map((payment)=><div key={payment.id}><span><strong>{money(payment.amountCents)}</strong><small>{clinicDate(payment.date)} · {payment.paymentMethod.replaceAll('_',' ')}</small></span><Badge tone={statusTone(payment.status)}>{statusLabel(payment.status)}</Badge></div>)}{!payments.length&&<p>No payments recorded yet.</p>}</div>{receipts.length>0&&<div className="ppx-receipt-count"><ReceiptText size={16}/><span>{receipts.length} receipt{receipts.length===1?'':'s'} available in your account</span></div>}</aside></div>
        </section>}

        {tab === 'documents' && <section className="ppx-page"><SectionHeading eyebrow="SECURE FILES" title="Documents" copy="Patient-visible documents are opened using short-lived secure links."/><div className="ppx-document-grid">{documents.map((document)=><article key={document.id}><span><FileUser size={22}/></span><div><strong>{document.fileName}</strong><p>{document.category.replaceAll('_',' ')} · {clinicDate(document.uploadDate)}</p><small>{document.description || 'Shared by your clinic'}</small></div><a href={document.content || '#'} data-patient-document-id={document.id}>Open file</a></article>)}{!documents.length&&<EmptyState icon={FileUser} title="No shared documents" copy="X-rays, consent files, referrals and other patient-visible documents will appear here."/>}</div></section>}

        {tab === 'profile' && <section className="ppx-page"><SectionHeading eyebrow="ACCOUNT" title="My profile" copy="Keep your personal and emergency contact information accurate." action={<Button variant="secondary" size="sm" onClick={()=>setProfileEditing((v)=>!v)}>{profileEditing?'Cancel edit':'Edit profile'}</Button>}/><div className="ppx-profile-layout"><section className="ppx-card"><div className="ppx-profile-identity"><label className="ppx-avatar ppx-avatar-lg" style={profileImage?{backgroundImage:`url(${profileImage})`}:undefined}>{!profileImage&&initials(fullName)}{profileEditing&&<input type="file" accept="image/*" onChange={(event)=>{const file=event.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>setProfileImage(typeof reader.result==='string'?reader.result:'');reader.readAsDataURL(file)}}/>}</label><div><h3>{fullName}</h3><p>{patient.patientId}</p><span><ShieldCheck size={14}/> Verified patient account</span></div></div>{profileMessage&&<div className="ppx-alert">{profileMessage}</div>}<div className="ppx-profile-fields">{[
              ['firstName','First name','text'],['middleName','Middle name','text'],['lastName','Last name','text'],['dateOfBirth','Date of birth','date'],['email','Email','email'],['phone','Phone','tel'],['address','Address','text'],['emergencyContact','Emergency contact','text'],['emergencyContactPhone','Emergency phone','tel'],['emergencyContactRelationship','Relationship','text'],
            ].map(([key,label,type])=><label key={key}><span>{label}</span><input type={type} disabled={!profileEditing} value={profile[key as keyof typeof profile]} onChange={(e)=>setProfile((current)=>({...current,[key]:e.target.value}))}/></label>)}</div>{profileEditing&&<footer><Button onClick={()=>void saveProfile()} disabled={profileBusy}>{profileBusy?'Saving…':'Save changes'}</Button></footer>}</section><aside className="ppx-card"><span className="ppx-kicker">COMMUNICATIONS</span><h3>Notification preferences</h3><p>Choose how the clinic may contact you about appointments and care.</p><CommunicationPreferencesPanel patient={patient} actor={fullName || patient.email}/></aside></div></section>}
      </div>
    </main>

    {payMode !== 'none' && selectedPayInvoice && <div className="ppx-modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&!payBusy&&setPayMode('none')}><section className="ppx-pay-modal" role="dialog" aria-modal="true" aria-labelledby="ppx-pay-title"><header><div><span>{payMode==='cash'?'PAY AT CLINIC':'ONLINE PAYMENT'}</span><h2 id="ppx-pay-title">{payMode==='cash'?'Pay in person':'Pay securely with QR Ph'}</h2><p>{selectedPayInvoice.invoiceNumber} · {money(selectedPayInvoice.balanceCents)}</p></div><button type="button" aria-label="Close payment dialog" onClick={()=>setPayMode('none')} disabled={payBusy}><X size={19}/></button></header>
      {payMode==='cash'?<div className="ppx-pay-cash"><span><Banknote size={30}/></span><h3>No online action needed</h3><p>Pay this invoice at the clinic cashier using cash or another payment method accepted by the branch. Your receipt and updated balance will appear here after staff records the payment.</p><div><strong>Amount due</strong><b>{money(selectedPayInvoice.balanceCents)}</b></div></div>:<div className="ppx-pay-online">{payError&&<div className="ppx-alert is-error">{payError}</div>}{!paySession?<><span className="ppx-qr-placeholder"><QrCode size={46}/></span><h3>Generate a one-time QR code</h3><p>The QR will contain the exact invoice balance. Scan it with any QR Ph-supported banking or wallet app.</p><div className="ppx-pay-amount"><span>Amount to pay</span><strong>{money(selectedPayInvoice.balanceCents)}</strong></div><Button onClick={()=>void startQrPayment()} disabled={payBusy}>{payBusy?'Generating QR…':'Generate QR Ph code'}</Button></>:<><div className="ppx-qr-frame"><img src={paySession.qrImage} alt={`QR Ph payment for ${selectedPayInvoice.invoiceNumber}`}/></div><h3>Scan to pay {money(paySession.amountCents)}</h3><p>Keep this window open after paying, then confirm the status below.</p>{payStatus&&<div className="ppx-alert is-success">{payStatus}</div>}<Button onClick={()=>void checkQrStatus()} disabled={payBusy}>{payBusy?'Checking…':'I paid — check status'}</Button><small>Payment reference: {paySession.paymentNumber ?? paySession.paymentId}</small></>}</div>}
      <footer><Button variant="secondary" onClick={()=>setPayMode('none')} disabled={payBusy}>{payMode==='cash'?'Done':'Close'}</Button></footer></section></div>}
  </div>
}
