import {
  AlertCircle,
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  Camera,
  CheckCircle2,
  CreditCard,
  FileText,
  FileUser,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  PencilLine,
  Phone,
  Pill,
  Save,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Trash2,
  UserCircle2,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useParams, useNavigate } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { useAuth } from '../features/auth/AuthContext'
import { createAppointment, getAppointmentsByPatient } from '../features/appointments/appointmentStore'
import { addMinutesToTime } from '../features/appointments/appointmentStore'
import { getAvailableAppointmentSlots, getEligibleProviders } from '../features/appointments/availabilityEngine'
import {
  getInvoicesByPatient,
  getOutstandingBalanceByPatient,
  getPaymentsByPatient,
  getReceiptsByPatient,
  initiateOnlinePayment,
} from '../features/billing/billingStore'
import { getDentalRecordsByPatientId } from '../features/dentalRecords/dentalRecordStore'
import { getDocumentsByPatient } from '../features/documents/documentStore'
import { getCurrentPatientForAuthenticatedUser, updatePatient } from '../features/patients/patientStore'
import type { Patient } from '../features/patients/patientTypes'
import { getPrescriptionsByPatient } from '../features/prescriptions/prescriptionStore'
import { getStoredServices } from '../features/services/serviceStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { CommunicationPreferencesPanel } from '../features/communications/CommunicationPreferencesPanel'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { getStoredTreatmentPlans, getTreatmentsByPatient } from '../features/treatments/treatmentStore'

const portalTabs = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'booking', label: 'Book', icon: CalendarDays },
  { key: 'appointments', label: 'Appointments', icon: CalendarDays },
  { key: 'dental-records', label: 'Dental Records', icon: FileText },
  { key: 'treatments', label: 'Treatments', icon: ShieldCheck },
  { key: 'prescriptions', label: 'Prescriptions', icon: Pill },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'documents', label: 'Documents', icon: FileUser },
  { key: 'profile', label: 'Profile', icon: UserRound },
] as const

type PortalTabKey = (typeof portalTabs)[number]['key']

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatTimeDisplay(time: string): string {
  if (!time) return 'Select a time'
  const [hours, minutes] = time.split(':').map(Number)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function formatPatientStatus(value: string) {
  const labels: Record<string, string> = {
    pending: 'Awaiting confirmation',
    confirmed: 'Confirmed',
    rejected: 'Request not approved',
    cancelled: 'Cancelled',
    rescheduled: 'Rescheduled',
    no_show: 'Missed appointment',
    checked_in: 'Checked in',
    waiting: 'Waiting at clinic',
    in_progress: 'Visit in progress',
    completed: 'Completed',
    draft: 'Preparing summary',
    finalized: 'Available',
    amended: 'Updated',
    unpaid: 'Payment due',
    partially_paid: 'Partially paid',
    paid: 'Paid',
    void: 'Cancelled',
    partially_refunded: 'Partially refunded',
    refunded: 'Refunded',
    pending_verification: 'Being confirmed',
    processing: 'Processing',
    failed: 'Unsuccessful',
    voided: 'Cancelled',
  }
  return labels[value] ?? value.replaceAll('_', ' ')
}

function patientStatusTone(value: string): 'success' | 'warning' | 'danger' | 'info' {
  if (['confirmed', 'completed', 'finalized', 'amended', 'paid'].includes(value)) return 'success'
  if (['pending', 'checked_in', 'waiting', 'in_progress', 'partially_paid', 'pending_verification', 'processing'].includes(value)) return 'warning'
  if (['rejected', 'cancelled', 'no_show', 'void', 'voided', 'failed'].includes(value)) return 'danger'
  return 'info'
}

export function PatientPortalPage() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<PortalTabKey>('dashboard')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [profileImage, setProfileImage] = useState('')
  const [profileSaved, setProfileSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [isProfileEditing, setIsProfileEditing] = useState(false)
  const [bookingStep, setBookingStep] = useState(0)
  const [bookingForm, setBookingForm] = useState({
    serviceId: '',
    branchId: '',
    providerId: '',
    date: '',
    startTime: '',
    notes: '',
  })
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [bookingSuccessId, setBookingSuccessId] = useState<string | null>(null)
  const [bookingSubmitting, setBookingSubmitting] = useState(false)
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    dateOfBirth: '',
    email: '',
    phone: '',
    address: '',
    emergencyContact: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
  })
  const [patient, setPatient] = useState<Patient | null>(null)
  const [patientLookupState, setPatientLookupState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [patientLookupError, setPatientLookupError] = useState<string | null>(null)

  const resolvedPatientId = user?.role === 'patient' ? user.patientId ?? patientId : patientId

  useEffect(() => {
    let isMounted = true

    const loadPatient = async () => {
      if (!user || user.role !== 'patient') {
        if (isMounted) {
          setPatient(null)
          setPatientLookupState('missing')
          setPatientLookupError(null)
        }
        return
      }

      if (import.meta.env.DEV) {
        console.debug('[patient portal resolve]', {
          authUserId: user.id,
          storedPatientId: user.patientId,
          routePatientId: patientId,
        })
      }

      if (isMounted) {
        setPatientLookupState('loading')
        setPatientLookupError(null)
      }

      try {
        const patientRecord = await getCurrentPatientForAuthenticatedUser(user.id)

        if (!isMounted) return

        if (!patientRecord) {
          setPatient(null)
          setPatientLookupState('missing')
          return
        }

        if (import.meta.env.DEV) {
          console.debug('[patient portal resolved]', {
            authUserId: user.id,
            patientId: patientRecord.patientId,
          })
        }

        setPatient(patientRecord)
        setPatientLookupState('ready')
      } catch (error) {
        if (!isMounted) return

        const message = error instanceof Error ? error.message : 'Unable to load patient record.'
        console.error('[patient portal resolve error]', error)
        setPatientLookupState('error')
        setPatientLookupError(message)
        setPatient(null)
      }
    }

    void loadPatient()

    return () => {
      isMounted = false
    }
  }, [patientId, user])

  useEffect(() => {
    if (!patient) return

    const storedProfile = patient.profileImage ?? ''
    setProfileForm({
      firstName: patient.firstName,
      middleName: patient.middleName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth,
      email: patient.email,
      phone: patient.phone,
      address: patient.address,
      emergencyContact: patient.emergencyContact,
      emergencyContactPhone: patient.emergencyContactPhone,
      emergencyContactRelationship: patient.emergencyContactRelationship ?? '',
    })
    setProfileImage(storedProfile)
    setProfileSaved('idle')
    setProfileError(null)
  }, [patient])

  const patientAppointments = useMemo(() => (patient ? getAppointmentsByPatient(patient.patientId) : []), [patient])
  const dentalRecords = useMemo(() => (patient ? getDentalRecordsByPatientId(patient.patientId) : []), [patient])
  const treatments = useMemo(() => (patient ? getTreatmentsByPatient(patient.patientId) : []), [patient])
  const treatmentPlans = useMemo(
    () => (patient ? getStoredTreatmentPlans().filter((plan) => plan.patientId === patient.patientId) : []),
    [patient],
  )
  const prescriptions = useMemo(() => (patient ? getPrescriptionsByPatient(patient.patientId) : []), [patient])
  const invoices = useMemo(() => (patient ? getInvoicesByPatient(patient.patientId) : []), [patient])
  const payments = useMemo(() => (patient ? getPaymentsByPatient(patient.patientId) : []), [patient])
  const receipts = useMemo(() => (patient ? getReceiptsByPatient(patient.patientId) : []), [patient])
  const documents = useMemo(() => (patient ? getDocumentsByPatient(patient.patientId) : []), [patient])
  const balance = useMemo(() => (patient ? getOutstandingBalanceByPatient(patient.patientId) : 0), [patient])
  const openInvoices = useMemo(() => invoices.filter((invoice) => invoice.balanceCents > 0 && invoice.status !== 'void'), [invoices])

  const nextAppointment = useMemo(() => {
    const upcoming = [...patientAppointments].sort(
      (a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`),
    )
    return upcoming.find((appointment) => appointment.status !== 'cancelled' && appointment.status !== 'no_show') ?? upcoming[0]
  }, [patientAppointments])

  const activeTreatment = useMemo(
    () => treatments.find((treatment) => treatment.status !== 'completed') ?? treatments[0],
    [treatments],
  )

  const activeTreatmentPlan = useMemo(
    () => treatmentPlans.find((plan) => plan.status !== 'completed') ?? treatmentPlans[0],
    [treatmentPlans],
  )

  const bookingServices = useMemo(
    () => getStoredServices().filter((service) => service.status === 'active'),
    [],
  )
  const portalServiceMap = useMemo(() => new Map(getStoredServices().map((service) => [service.id, service])), [])
  const bookingBranches = useMemo(
    () => getStoredBranches().filter((branch) => branch.status === 'active'),
    [],
  )
  const portalBranchMap = useMemo(() => new Map(getStoredBranches().map((branch) => [branch.id, branch])), [])
  const bookingProviders = useMemo(
    () => (bookingForm.branchId ? getEligibleProviders(bookingForm.branchId) : []),
    [bookingForm.branchId],
  )
  const providerMap = useMemo(() => new Map(getStoredProviders().map((provider) => [provider.id, provider])), [])
  const selectedBookingBranch = useMemo(
    () => bookingBranches.find((branch) => branch.id === bookingForm.branchId) ?? null,
    [bookingBranches, bookingForm.branchId],
  )
  const selectedBookingProvider = useMemo(
    () => providerMap.get(bookingForm.providerId) ?? null,
    [bookingForm.providerId, providerMap],
  )

  const selectedBookingService = useMemo(
    () => bookingServices.find((service) => service.id === bookingForm.serviceId) ?? null,
    [bookingForm.serviceId, bookingServices],
  )

  const availableBookingTimes = useMemo(() => {
    if (!bookingForm.date || !bookingForm.serviceId || !bookingForm.branchId) return []
    return getAvailableAppointmentSlots({
      branchId: bookingForm.branchId,
      serviceId: bookingForm.serviceId,
      providerId: bookingForm.providerId || undefined,
      date: bookingForm.date,
    })
  }, [bookingForm.branchId, bookingForm.date, bookingForm.providerId, bookingForm.serviceId])

  const bookingSteps = ['Service', 'Location', 'Dentist', 'Date & time', 'Confirmation'] as const

  const recentActivity = useMemo(() => {
    const items = [
      ...patientAppointments.map((appointment) => ({
        date: `${appointment.date}T${appointment.startTime}`,
        label: 'Appointment update',
        detail: `${portalServiceMap.get(appointment.serviceId)?.name ?? 'Appointment'} - ${formatPatientStatus(appointment.status)}`,
      })),
      ...dentalRecords.map((record) => ({
        date: record.recordDate,
        label: 'Dental record updated',
        detail: record.chiefComplaint,
      })),
      ...prescriptions.map((prescription) => ({
        date: prescription.prescriptionDate,
        label: 'Prescription added',
        detail: prescription.medication,
      })),
      ...payments.map((payment) => ({
        date: payment.date,
        label: 'Payment received',
        detail: `${payment.paymentMethod} • ${formatCurrency(payment.amountCents)}`,
      })),
    ]

    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5)
  }, [dentalRecords, patientAppointments, payments, portalServiceMap, prescriptions])

  if (!resolvedPatientId) {
    return <Navigate to="/login" replace />
  }

  if (patientLookupState === 'loading') {
    return <div className="portal-empty">Loading your patient profile...</div>
  }

  if (patientLookupState === 'error') {
    return <div className="portal-empty">{patientLookupError ?? 'Unable to load your patient record.'}</div>
  }

  if (!patient) {
    return <div className="portal-empty">No patient record found.</div>
  }

  const fullName = `${patient.firstName} ${patient.middleName ? `${patient.middleName} ` : ''}${patient.lastName}`.trim()

  function handleBookingFieldChange<K extends 'serviceId' | 'branchId' | 'providerId' | 'date' | 'startTime' | 'notes'>(key: K, value: string) {
    setBookingForm((current) => ({ ...current, [key]: value }))
    setBookingError(null)
  }

  function handleBookingNext() {
    if (!patient) {
      setBookingError('Your patient record is unavailable right now.')
      return
    }

    if (bookingStep === 0 && !bookingForm.serviceId) {
      setBookingError('Please choose a service before continuing.')
      return
    }

    if (bookingStep === 1 && !bookingForm.branchId) {
      setBookingError('Please choose a clinic branch.')
      return
    }

    if (bookingStep === 3 && (!bookingForm.date || !bookingForm.startTime)) {
      setBookingError('Please choose a date and time before continuing.')
      return
    }

    if (bookingStep < bookingSteps.length - 1) {
      setBookingStep((current) => current + 1)
      return
    }

    if (!selectedBookingService) {
      setBookingError('The selected service is no longer available.')
      return
    }

    const selectedSlot = availableBookingTimes.find((slot) => slot.startTime === bookingForm.startTime && (!bookingForm.providerId || slot.providerId === bookingForm.providerId))
    if (!selectedSlot) {
      setBookingError('That slot is no longer available. Please choose another time.')
      return
    }

    setBookingError(null)
    setBookingSubmitting(true)

    const appointment = createAppointment(
      {
        patientId: patient.patientId,
        branchId: bookingForm.branchId,
        providerId: selectedSlot.providerId,
        serviceId: selectedBookingService.id,
        date: bookingForm.date,
        startTime: bookingForm.startTime,
        endTime: addMinutesToTime(bookingForm.startTime, selectedBookingService.duration),
        durationMinutes: selectedBookingService.duration,
        estimatedAmountCents: selectedBookingService.price,
        paymentStatus: 'not_billed',
        bookingSource: 'patient_portal',
        patientNotes: bookingForm.notes.trim(),
        reasonForVisit: selectedBookingService.name,
        notes: bookingForm.notes.trim() || 'Requested through the patient portal.',
        status: 'pending',
      },
      'patient-portal',
    )

    setBookingSubmitting(false)

    if (!appointment) {
      setBookingError('That slot is no longer available. Please choose another time.')
      return
    }

    setBookingSuccessId(appointment.id)
    setBookingStep(bookingSteps.length)
  }

  function resetBookingFlow() {
    setBookingStep(0)
    setBookingForm({ serviceId: '', branchId: '', providerId: '', date: '', startTime: '', notes: '' })
    setBookingError(null)
    setBookingSuccessId(null)
    setBookingSubmitting(false)
  }

  function handleProfileFieldChange(field: keyof typeof profileForm, value: string) {
    setProfileForm((current) => ({ ...current, [field]: value }))
    setProfileSaved('idle')
    setProfileError(null)
  }

  function handleProfileImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      setProfileImage(result)
      setProfileSaved('idle')
      setProfileError(null)
    }
    reader.readAsDataURL(file)
  }

  function handleSaveProfile() {
    if (!patient) return

    const nextPhone = profileForm.phone.trim()
    const nextEmail = profileForm.email.trim().toLowerCase()

    if (!nextPhone || !nextEmail || !profileForm.firstName.trim() || !profileForm.lastName.trim()) {
      setProfileError('Please complete your required personal and contact details before saving.')
      setProfileSaved('error')
      return
    }

    setProfileSaved('saving')
    setProfileError(null)

    try {
      const updated = updatePatient(patient.id, {
        ...patient,
        firstName: profileForm.firstName.trim(),
        middleName: profileForm.middleName.trim(),
        lastName: profileForm.lastName.trim(),
        dateOfBirth: profileForm.dateOfBirth,
        email: nextEmail,
        phone: nextPhone,
        address: profileForm.address.trim(),
        emergencyContact: profileForm.emergencyContact.trim(),
        emergencyContactPhone: profileForm.emergencyContactPhone.trim(),
        emergencyContactRelationship: profileForm.emergencyContactRelationship.trim(),
        profileImage,
        allergies: patient.allergies,
        medicalConditions: patient.medicalConditions,
        currentMedications: patient.currentMedications,
        previousSurgeries: patient.previousSurgeries,
        medicalNotes: patient.medicalNotes,
        sex: patient.sex,
        status: patient.status,
        registrationDate: patient.registrationDate,
      })

      const currentUser = localStorage.getItem('plamenco.auth.user')
      if (currentUser) {
        const parsed = JSON.parse(currentUser) as { email?: string; name?: string }
        localStorage.setItem(
          'plamenco.auth.user',
          JSON.stringify({
            ...parsed,
            email: nextEmail,
            name: `${profileForm.firstName.trim()} ${profileForm.lastName.trim()}`.trim(),
          }),
        )
      }

      if (!updated) {
        throw new Error('Unable to update your patient record.')
      }

      setPatient(updated)
      setIsProfileEditing(false)
      setProfileSaved('saved')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong while saving your profile.'
      setProfileError(message)
      setProfileSaved('error')
    }
  }

  function handlePayNow(invoiceId?: string) {
    const invoice = invoiceId ? invoices.find((entry) => entry.id === invoiceId) : openInvoices[0]
    if (!patient || !invoice || invoice.balanceCents <= 0) return

    try {
      initiateOnlinePayment({
        patientId: patient.patientId,
        invoiceId: invoice.id,
        branchId: invoice.branchId,
        amountCents: invoice.balanceCents,
        paymentMethod: 'online_gateway',
        date: new Date().toISOString().slice(0, 10),
        recordedBy: patient.patientId,
        gatewayProvider: 'not_configured',
        notes: 'Patient portal payment initiated. Awaiting configured gateway verification.',
      })
      window.alert('Payment processing has been prepared. Online gateway secrets must be configured server-side before accepting live payments.')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to start payment processing.')
    }
  }

  const treatmentProgress = activeTreatmentPlan
    ? Math.min(
        Math.round(
          (treatments.filter((treatment) => treatment.status === 'completed').length / Math.max(treatments.length, 1)) * 100,
        ),
        100,
      )
    : 0

  return (
    <div className="patient-portal-shell">
      {/* Mobile overlay */}
      <div 
        className={`portal-sidebar-overlay ${isSidebarOpen ? 'is-visible' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* Mobile menu toggle */}
      <button
        type="button"
        className="portal-sidebar-toggle"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        aria-label="Toggle menu"
      >
        {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${isSidebarOpen ? 'is-open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand-lockup">
            <span className="brand-symbol" style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--secondary)' }}>P</span>
            <strong>Plamenco</strong>
            <small>Portal</small>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Patient portal navigation">
          {/* Main Navigation */}
          <div className="nav-section">
            {portalTabs.slice(0, 5).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                className={activeTab === key ? 'active' : ''}
                onClick={() => {
                  setActiveTab(key)
                  setIsSidebarOpen(false)
                }}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Account Section */}
          <div className="nav-section">
            {portalTabs.slice(5).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                className={activeTab === key ? 'active' : ''}
                onClick={() => {
                  setActiveTab(key)
                  setIsSidebarOpen(false)
                }}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Sidebar Footer - User Card */}
        <div className="sidebar-footer">
          <div className="user-card">
            <span
              className="avatar"
              style={{ backgroundImage: profileImage ? `url(${profileImage})` : undefined, backgroundSize: 'cover' }}
            >
              {!profileImage && patient?.firstName.charAt(0)}
            </span>
            <span>
              <strong>{fullName}</strong>
              <small>{patient?.patientId}</small>
            </span>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              signOut()
              navigate('/login', { replace: true })
            }}
          >
            <LogOut size={14} />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main Portal Area */}
      <main className="portal-main">
        <header className="portal-topbar">
          <div>
            <p className="eyebrow">{getGreeting()}, {patient?.firstName}</p>
            <h1>Patient overview</h1>
          </div>
          <button type="button" className="btn btn-primary patient-portal-book-btn" onClick={() => setActiveTab('booking')}>
            Book now
          </button>
        </header>

        <div className="portal-content">
          {activeTab === 'booking' && (
            <div className="portal-booking-shell">
              <div className="portal-booking-header">
                <div>
                  <p className="eyebrow">Appointment request</p>
                  <h2>Book your visit</h2>
                </div>
                
              </div>

              <div className="portal-booking-progress" aria-label="Booking progress">
                {bookingSteps.map((label, index) => (
                  <div key={label} className={`portal-booking-step ${index <= bookingStep ? 'is-active' : ''}`}>
                    <span>{index + 1}</span>
                    <small>{label}</small>
                  </div>
                ))}
              </div>

              {bookingSuccessId ? (
                <div className="portal-booking-success panel">
                  <CheckCircle2 size={34} />
                  <h3>Appointment request submitted</h3>
                  <p>Your appointment is awaiting clinic confirmation. Reference: {bookingSuccessId}</p>
                  <div className="booking-actions">
                    <button type="button" className="btn btn-primary" onClick={() => setActiveTab('appointments')}>
                      View appointments
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={resetBookingFlow}>
                      Book another visit
                    </button>
                  </div>
                </div>
              ) : (
                <div className="portal-booking-grid">
                  <section className="portal-booking-panel panel">
                    {bookingError && <div className="alert danger">{bookingError}</div>}

                    {bookingStep === 0 && (
                      <div className="portal-booking-section">
                        <div className="section-title-row">
                          <CalendarDays size={18} />
                          <h3>Select service</h3>
                        </div>
                        <div className="service-option-list">
                          {bookingServices.map((service) => (
                            <button
                              key={service.id}
                              type="button"
                              className={`service-option ${bookingForm.serviceId === service.id ? 'is-selected' : ''}`}
                              onClick={() => handleBookingFieldChange('serviceId', service.id)}
                            >
                              <div className="service-option-copy">
                                <strong>{service.name}</strong>
                                <small>{service.description}</small>
                              </div>
                              <div className="service-option-meta">
                                <strong>{service.price > 0 ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(service.price / 100) : 'Price to be confirmed'}</strong>
                                <small>{service.duration} min</small>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {bookingStep === 1 && (
                      <div className="portal-booking-section">
                        <div className="section-title-row">
                          <MapPin size={18} />
                          <h3>Where would you like to visit?</h3>
                        </div>
                        <div className="branch-choice-grid">
                          {bookingBranches.map((branch) => (
                            <button
                              key={branch.id}
                              type="button"
                              className={`branch-choice ${bookingForm.branchId === branch.id ? 'is-selected' : ''}`}
                              onClick={() => {
                                setBookingForm((current) => ({ ...current, branchId: branch.id, providerId: '', startTime: '' }))
                                setBookingError(null)
                              }}
                            >
                              <strong>{branch.name}</strong>
                              <small>{branch.city}, {branch.province}</small>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {bookingStep === 2 && (
                      <div className="portal-booking-section">
                        <div className="section-title-row">
                          <Stethoscope size={18} />
                          <h3>Choose dentist</h3>
                        </div>
                        <div className="branch-choice-grid">
                          <button
                            type="button"
                            className={`branch-choice ${!bookingForm.providerId ? 'is-selected' : ''}`}
                            onClick={() => handleBookingFieldChange('providerId', '')}
                          >
                            <strong>Any available dentist</strong>
                            <small>The clinic will use an eligible provider for your selected slot.</small>
                          </button>
                          {bookingProviders.map((provider) => (
                            <button
                              key={provider.id}
                              type="button"
                              className={`branch-choice ${bookingForm.providerId === provider.id ? 'is-selected' : ''}`}
                              onClick={() => handleBookingFieldChange('providerId', provider.id)}
                            >
                              <strong>{provider.displayName}</strong>
                              <small>{provider.role.replace('_', ' ')}</small>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {bookingStep === 3 && (
                      <div className="portal-booking-section">
                        <div className="section-title-row">
                          <CalendarDays size={18} />
                          <h3>Select date & time</h3>
                        </div>

                        <div className="booking-date-time-grid">
                          <label className="booking-field">
                            <span>Preferred date</span>
                            <input
                              type="date"
                              value={bookingForm.date}
                              min={new Date().toISOString().slice(0, 10)}
                              onChange={(event) => handleBookingFieldChange('date', event.target.value)}
                            />
                          </label>

                          <div className="booking-time-panel">
                            <span>Available time</span>
                            {bookingForm.date && bookingForm.serviceId ? (
                              availableBookingTimes.length ? (
                                <div className="time-slot-grid">
                                  {availableBookingTimes.map((slot) => (
                                    <button
                                      key={`${slot.providerId}-${slot.startTime}`}
                                      type="button"
                                      className={`time-slot ${bookingForm.startTime === slot.startTime && (!bookingForm.providerId || bookingForm.providerId === slot.providerId) ? 'is-selected' : ''}`}
                                      onClick={() => {
                                        setBookingForm((current) => ({ ...current, startTime: slot.startTime, providerId: slot.providerId }))
                                        setBookingError(null)
                                      }}
                                    >
                                      {formatTimeDisplay(slot.startTime)}
                                      <small>{slot.providerName}</small>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="empty-inline">No available slots for this date. Please choose another day.</div>
                              )
                            ) : (
                              <div className="empty-inline">Choose a service and date to view appointment times.</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {bookingStep === 4 && (
                      <div className="portal-booking-section">
                        <div className="section-title-row">
                          <ShieldCheck size={18} />
                          <h3>Confirm appointment</h3>
                        </div>

                        <div className="confirmation-card">
                          <div className="confirm-row"><span>Service</span><strong>{selectedBookingService?.name ?? '—'}</strong></div>
                          <div className="confirm-row"><span>Branch</span><strong>{selectedBookingBranch?.name ?? 'No branch selected'}</strong></div>
                          <div className="confirm-row"><span>Dentist</span><strong>{selectedBookingProvider?.displayName ?? 'Any available dentist'}</strong></div>
                          <div className="confirm-row"><span>Date</span><strong>{bookingForm.date ? new Date(bookingForm.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</strong></div>
                          <div className="confirm-row"><span>Time</span><strong>{bookingForm.startTime ? formatTimeDisplay(bookingForm.startTime) : '—'}</strong></div>
                          <div className="confirm-row"><span>Estimated price</span><strong>{selectedBookingService ? (selectedBookingService.price > 0 ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(selectedBookingService.price / 100) : 'Price to be confirmed') : '—'}</strong></div>
                        </div>

                        <label className="booking-field">
                          <span>Additional notes</span>
                          <textarea
                            value={bookingForm.notes}
                            rows={4}
                            onChange={(event) => handleBookingFieldChange('notes', event.target.value)}
                            placeholder="Share any details that may help the clinic team prepare for your visit."
                          />
                        </label>
                      </div>
                    )}

                    <div className="booking-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => setBookingStep((current) => Math.max(current - 1, 0))} disabled={bookingStep === 0 || bookingSubmitting}>
                        Back
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleBookingNext}
                        disabled={bookingSubmitting}
                      >
                        {bookingSubmitting ? 'Submitting...' : bookingStep === bookingSteps.length - 1 ? 'Confirm appointment' : 'Continue'}
                      </button>
                    </div>
                  </section>

                  <aside className="portal-booking-summary panel">
                    <div className="booking-summary-hero">
                      <span className="summary-badge"><Sparkles size={14} /> Premium care</span>
                      <h3>Visit overview</h3>
                    </div>

                    <div className="summary-card">
                      <span className="summary-label">Selected service</span>
                      <strong>{selectedBookingService?.name ?? 'Choose a service'}</strong>
                      <small>{selectedBookingService ? `${selectedBookingService.duration} minute appointment` : 'We will tailor the visit to your needs.'}</small>
                    </div>

                    <div className="summary-grid">
                      <div>
                        <span>Branch</span>
                        <strong>{selectedBookingBranch?.name ?? 'Choose a branch'}</strong>
                      </div>
                      <div>
                        <span>Time</span>
                        <strong>{bookingForm.startTime ? formatTimeDisplay(bookingForm.startTime) : '—'}</strong>
                      </div>
                    </div>

                    <div className="summary-price">
                      <span>Estimated total</span>
                      <strong>{selectedBookingService ? (selectedBookingService.price > 0 ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(selectedBookingService.price / 100) : 'Price to be confirmed') : '—'}</strong>
                    </div>

                    <div className="summary-tight-list">
                      <div><CheckCircle2 size={15} /> Care coordination</div>
                      <div><CheckCircle2 size={15} /> Clinic review before approval</div>
                      <div><CheckCircle2 size={15} /> Appointment status in your portal</div>
                    </div>
                  </aside>
                </div>
              )}
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="portal-dashboard-shell">
              <section className="portal-dashboard-hero">
                <div className="portal-dashboard-hero-copy">
                  <div className="portal-dashboard-pill-row">
                    <span className="portal-dashboard-chip">Premium care plan</span>
                    <span className="portal-dashboard-status">
                      <span className="status-dot" />
                      Care team available
                    </span>
                  </div>
                  <h2>Welcome back, {patient.firstName}</h2>
                  <p>
                    Here’s a live snapshot of your oral health progress, upcoming visits, and the care journey we’re building together.
                  </p>
                </div>

                <div className="portal-dashboard-hero-metric">
                  <span className="eyebrow">Current outlook</span>
                  <strong>{activeTreatment ? `${treatmentProgress}%` : '0%'}</strong>
                  <small>{activeTreatment ? activeTreatment.description : 'No active treatment plan'}</small>
                </div>
              </section>

              <div className="portal-dashboard-metrics">
                <article className="dashboard-metric dashboard-metric-primary">
                  <div className="dashboard-metric-header">
                    <span>Next visit</span>
                    <span className="dashboard-metric-icon"><CalendarCheck2 size={18} /></span>
                  </div>
                  {nextAppointment ? (
                    <>
                      <strong>{formatDate(nextAppointment.date)}</strong>
                      <small>{nextAppointment.startTime} • {nextAppointment.serviceId}</small>
                    </>
                  ) : (
                    <>
                      <strong>No visit scheduled</strong>
                      <small>Choose a convenient time</small>
                    </>
                  )}
                </article>

                <article className="dashboard-metric dashboard-metric-warning">
                  <div className="dashboard-metric-header">
                    <span>Balance</span>
                    <span className="dashboard-metric-icon"><CreditCard size={18} /></span>
                  </div>
                  <strong>{formatCurrency(balance)}</strong>
                  <small>{payments.length > 0 ? `${payments.length} payment record${payments.length !== 1 ? 's' : ''}` : 'No outstanding balance'}</small>
                </article>

                <article className="dashboard-metric dashboard-metric-success">
                  <div className="dashboard-metric-header">
                    <span>Care progress</span>
                    <span className="dashboard-metric-icon"><CheckCircle2 size={18} /></span>
                  </div>
                  <strong>{activeTreatment ? `${treatmentProgress}%` : '0%'}</strong>
                  <small>{activeTreatment ? activeTreatment.description : 'No active care plan'}</small>
                </article>

                <article className="dashboard-metric dashboard-metric-soft">
                  <div className="dashboard-metric-header">
                    <span>Visit history</span>
                    <span className="dashboard-metric-icon"><FileText size={18} /></span>
                  </div>
                  <strong>{patientAppointments.length}</strong>
                  <small>{patientAppointments.length === 1 ? 'Confirmed appointment' : 'Appointments in record'}</small>
                </article>
              </div>

              <div className="portal-dashboard-grid">
                <article className="portal-dashboard-panel portal-dashboard-panel-feature">
                  <div className="portal-panel-header">
                    <div>
                      <p className="eyebrow">Smile progress</p>
                      <h3>Care journey</h3>
                    </div>
                    <Badge tone="success">{treatmentProgress}%</Badge>
                  </div>

                  <div className="care-chart-wrap">
                    <svg viewBox="0 0 640 220" aria-label="Care health trend chart" role="img">
                      <defs>
                        <linearGradient id="careChartFill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="rgba(191, 143, 70, 0.28)" />
                          <stop offset="100%" stopColor="rgba(191, 143, 70, 0.02)" />
                        </linearGradient>
                      </defs>

                      {[0, 1, 2, 3].map((line) => (
                        <line
                          key={line}
                          x1="0"
                          y1={40 + line * 52}
                          x2="640"
                          y2={40 + line * 52}
                          stroke="rgba(23, 19, 17, 0.08)"
                          strokeDasharray="4 8"
                        />
                      ))}

                      <path
                        d={[
                          'M 0 180',
                          'C 110 165, 150 150, 200 120',
                          'S 290 80, 330 90',
                          'S 440 42, 480 62',
                          'S 590 32, 640 20',
                          'L 640 220 L 0 220 Z',
                        ].join(' ')}
                        fill="url(#careChartFill)"
                        opacity="0.85"
                      />

                      <path
                        d={[
                          'M 0 180',
                          'C 110 165, 150 150, 200 120',
                          'S 290 80, 330 90',
                          'S 440 42, 480 62',
                          'S 590 32, 640 20',
                        ].join(' ')}
                        fill="none"
                        stroke="#bf8f46"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />

                      {[0, 1, 2, 3, 4, 5].map((point) => {
                        const x = 20 + point * 120
                        const y = 180 - point * 26 + (point === 5 ? 26 : 0)
                        return (
                          <g key={point}>
                            <circle cx={x} cy={y} r="5" fill="#fff" stroke="#bf8f46" strokeWidth="3" />
                            <text x={x} y="210" textAnchor="middle" fill="rgba(23, 19, 17, 0.6)" fontSize="12" fontWeight="700">
                              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'][point]}
                            </text>
                          </g>
                        )
                      })}
                    </svg>
                  </div>

                  <div className="care-chart-meta">
                    <div>
                      <span>Care consistency</span>
                      <strong>{Math.max(72, treatmentProgress)}%</strong>
                    </div>
                    <div>
                      <span>Avg. check-up</span>
                      <strong>{Math.max(1, patientAppointments.length)}x</strong>
                    </div>
                  </div>
                </article>

                <article className="portal-dashboard-panel">
                  <div className="portal-panel-header">
                    <div>
                      <p className="eyebrow">Clinical plan</p>
                      <h3>Active treatment</h3>
                    </div>
                    <button type="button" className="text-link-button">
                      View details <ArrowRight size={14} />
                    </button>
                  </div>

                  <div className="plan-highlight-card">
                    <div className="plan-highlight-header">
                      <span className="plan-highlight-badge">In progress</span>
                      <strong>{activeTreatment ? activeTreatment.description : 'No active treatment'}</strong>
                    </div>

                    <div className="plan-progress-track" aria-label="Treatment progress">
                      <span style={{ width: `${treatmentProgress}%` }} />
                    </div>

                    <div className="plan-metrics-grid">
                      <div>
                        <span>Progress</span>
                        <strong>{treatmentProgress}%</strong>
                      </div>
                      <div>
                        <span>Next milestone</span>
                        <strong>{activeTreatment ? 'Review' : 'Plan'}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mini-plan-list">
                    {[
                      'Consultation review',
                      'Digital imaging',
                      'Treatment planning',
                    ].map((step, index) => (
                      <div key={step} className={`mini-plan-item ${index <= Math.min(1, treatmentProgress / 50) ? 'is-done' : ''}`}>
                        <span>{index + 1}</span>
                        <small>{step}</small>
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              <div className="portal-dashboard-grid portal-dashboard-grid-bottom">
                <article className="portal-dashboard-panel">
                  <div className="portal-panel-header">
                    <div>
                      <p className="eyebrow">Updates</p>
                      <h3>Recent activity</h3>
                    </div>
                  </div>

                  <div className="activity-list">
                    {recentActivity.length === 0 ? (
                      <p className="empty-inline">No recent activity yet.</p>
                    ) : (
                      recentActivity.map((item) => (
                        <div key={`${item.label}-${item.date}`} className="activity-item">
                          <div>
                            <strong>{item.label}</strong>
                            <small>{item.detail}</small>
                          </div>
                          <span>{formatDate(item.date)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </article>

                <article className="portal-dashboard-panel">
                  <div className="portal-panel-header">
                    <div>
                      <p className="eyebrow">Quick look</p>
                      <h3>Patient snapshot</h3>
                    </div>
                  </div>

                  <div className="dashboard-snapshot-list">
                    <div className="snapshot-item">
                      <span>Last visit</span>
                      <strong>{nextAppointment ? formatDate(nextAppointment.date) : 'No upcoming visit'}</strong>
                    </div>
                    <div className="snapshot-item">
                      <span>Preferred branch</span>
                      <strong>{patient.address?.includes('Pulilan') ? 'Pulilan' : 'Plaridel'}</strong>
                    </div>
                    <div className="snapshot-item">
                      <span>Medication status</span>
                      <strong>{prescriptions.length > 0 ? `${prescriptions.length} active` : 'None on file'}</strong>
                    </div>
                    <div className="snapshot-item">
                      <span>Last record update</span>
                      <strong>{dentalRecords.length > 0 ? formatDate(dentalRecords[0].recordDate) : 'No records yet'}</strong>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          )}

          {activeTab === 'appointments' && (
            <article className="portal-premium-page">
              <div className="portal-premium-header">
                <div>
                  <p className="eyebrow">Your schedule</p>
                  <h3>Appointments</h3>
                </div>
                <span className="portal-premium-chip">{patientAppointments.length} total</span>
              </div>

              <div className="portal-tabs-inline">
                <button type="button" className="portal-tab-button is-active">Upcoming</button>
                <button type="button" className="portal-tab-button">Past</button>
              </div>

              <div className="portal-premium-list">
                {patientAppointments.length === 0 ? (
                  <p className="empty-inline">No appointments on file.</p>
                ) : (
                  patientAppointments.map((appointment) => {
                    const service = portalServiceMap.get(appointment.serviceId)
                    const branch = appointment.branchId ? portalBranchMap.get(appointment.branchId) : undefined
                    const provider = appointment.providerId ? providerMap.get(appointment.providerId) : undefined
                    return (
                      <div key={appointment.id} className="portal-premium-card info-row">
                        <div>
                          <strong>{formatDate(appointment.date)}</strong>
                          <small>{formatTimeDisplay(appointment.startTime)} - {formatTimeDisplay(appointment.endTime)}</small>
                        </div>
                        <div className="info-row-meta">
                          <Badge tone={patientStatusTone(appointment.status)}>{formatPatientStatus(appointment.status)}</Badge>
                          <span>{service?.name ?? 'Service'} - {branch?.name ?? 'Branch pending'} - {provider?.displayName ?? 'Dentist pending'}</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </article>
          )}

          {activeTab === 'dental-records' && (
            <article className="portal-premium-page">
              <div className="portal-premium-header">
                <div>
                  <p className="eyebrow">Clinical timeline</p>
                  <h3>Dental records</h3>
                </div>
                <span className="portal-premium-chip">{dentalRecords.length} visits</span>
              </div>

              {dentalRecords.length === 0 ? (
                <p className="empty-inline">No dental records available yet.</p>
              ) : (
                <div className="portal-premium-list portal-premium-grid">
                  {dentalRecords.map((record) => (
                    <div key={record.id} className="portal-premium-card record-card">
                      <div className="record-header">
                        <div>
                          <p className="eyebrow">{formatPatientStatus(record.visitType)}</p>
                          <h4>{record.chiefComplaint}</h4>
                        </div>
                        <Badge tone={patientStatusTone(record.status)}>{formatPatientStatus(record.status)}</Badge>
                      </div>
                      <div className="record-grid">
                        <div>
                          <span className="label">Date</span>
                          <p>{formatDate(record.recordDate)}</p>
                        </div>
                        <div>
                          <span className="label">Summary</span>
                          <p>{record.patientVisibleSummary || record.assessment || 'No patient-facing summary recorded.'}</p>
                        </div>
                        <div>
                          <span className="label">Recommendations</span>
                          <p>{record.recommendations || 'No recommendations recorded.'}</p>
                        </div>
                        <div>
                          <span className="label">Follow-up</span>
                          <p>{record.followUpDate ? formatDate(record.followUpDate) : 'Not scheduled'}</p>
                        </div>
                        <div className="record-full">
                          <span className="label">Follow-up notes</span>
                          <p>{record.followUpNotes || 'No follow-up notes recorded.'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          )}

          {activeTab === 'treatments' && (
            <article className="portal-premium-page">
              <div className="portal-premium-header">
                <div>
                  <p className="eyebrow">Advanced care</p>
                  <h3>Treatments</h3>
                </div>
                <span className="portal-premium-chip">{treatments.length} entries</span>
              </div>

              <div className="portal-premium-list">
                {treatments.length === 0 ? (
                  <p className="empty-inline">No treatment history available.</p>
                ) : (
                  treatments.map((treatment) => (
                    <div key={treatment.id} className="portal-premium-card info-row info-row-block">
                      <div>
                        <strong>{treatment.description}</strong>
                        <small>
                          {formatDate(treatment.treatmentDate)} • Tooth #{treatment.toothNumber ?? 'N/A'}
                        </small>
                      </div>
                      <div className="info-row-meta">
                        <Badge tone={patientStatusTone(treatment.status)}>{formatPatientStatus(treatment.status)}</Badge>
                        <span>{formatCurrency(treatment.priceSnapshotCents)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>
          )}

          {activeTab === 'prescriptions' && (
            <article className="portal-premium-page">
              <div className="portal-premium-header">
                <div>
                  <p className="eyebrow">Medication plan</p>
                  <h3>Prescriptions</h3>
                </div>
                <span className="portal-premium-chip">{prescriptions.length} active</span>
              </div>

              {prescriptions.length === 0 ? (
                <p className="empty-inline">No prescriptions on file.</p>
              ) : (
                <div className="portal-premium-list portal-premium-grid">
                  {prescriptions.map((prescription) => (
                    <div key={prescription.id} className="portal-premium-card prescription-box">
                      <div className="prescription-head">
                        <strong>{prescription.medication}</strong>
                        <span>{prescription.dosage}</span>
                      </div>
                      <p>
                        {prescription.frequency} • {prescription.duration}
                      </p>
                      <small>{prescription.instructions}</small>
                      <div className="prescription-foot">
                        <span>Prescribed by {prescription.prescribedBy}</span>
                        <span>{formatDate(prescription.prescriptionDate)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          )}

          {activeTab === 'payments' && (
            <article className="portal-premium-page">
              <div className="portal-premium-header">
                <div>
                  <p className="eyebrow">Financial overview</p>
                  <h3>Billing & Payments</h3>
                </div>
                <span className="portal-premium-chip">{invoices.length} invoices</span>
              </div>

              <div className="payment-balance-hero">
                <div className="balance-card-accent"></div>
                <div className="balance-card-content">
                  <div>
                    <p className="balance-label">Outstanding balance</p>
                    <strong className="balance-amount">{formatCurrency(balance)}</strong>
                  </div>
                  <div className="balance-status">
                    {balance === 0 ? (
                      <>
                        <span className="status-badge status-paid"><CheckCircle2 size={14} />Fully paid</span>
                      </>
                    ) : (
                      <>
                        <span className="status-badge status-pending">Pending</span>
                        <Button size="sm" icon={<CreditCard size={14} />} onClick={() => handlePayNow()}>
                          Pay Now
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {openInvoices.length === 0 ? (
                <p className="empty-inline">You&apos;re all settled.</p>
              ) : (
                <div className="portal-premium-list">
                  {openInvoices.map((invoice) => (
                    <div key={invoice.id} className="portal-premium-card info-row info-row-block">
                      <div>
                        <strong>{invoice.invoiceNumber}</strong>
                        <small>{formatDate(invoice.invoiceDate)} - {formatPatientStatus(invoice.status)}</small>
                      </div>
                      <div className="payment-card-amount">
                        <span className="payment-amount">{formatCurrency(invoice.balanceCents)}</span>
                        <Button size="sm" variant="secondary" onClick={() => handlePayNow(invoice.id)}>
                          Pay
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="portal-premium-header" style={{ marginTop: 20 }}>
                <div>
                  <p className="eyebrow">History</p>
                  <h3>Payment History</h3>
                </div>
                <span className="portal-premium-chip">{payments.length} records</span>
              </div>

              {payments.length === 0 ? (
                <p className="empty-inline">No payment history yet.</p>
              ) : (
                <div className="portal-premium-list">
                  {payments.map((payment) => (
                    <div key={payment.id} className="payment-premium-card">
                      <div className="payment-card-icon"><CreditCard size={16} /></div>
                      <div className="payment-card-main">
                        <div>
                          <strong className="payment-method">{formatPatientStatus(payment.paymentMethod)}</strong>
                          <small className="payment-date">{formatDate(payment.date)} - {formatPatientStatus(payment.status)}</small>
                        </div>
                      </div>
                      <div className="payment-card-amount">
                        <span className="payment-amount">{formatCurrency(payment.amountCents)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="portal-premium-header" style={{ marginTop: 20 }}>
                <div>
                  <p className="eyebrow">Acknowledgements</p>
                  <h3>Receipts</h3>
                </div>
                <span className="portal-premium-chip">{receipts.length} receipts</span>
              </div>

              {receipts.length === 0 ? (
                <p className="empty-inline">No receipts are available yet.</p>
              ) : (
                <div className="portal-premium-list">
                  {receipts.map((receipt) => (
                    <div key={receipt.id} className="portal-premium-card info-row info-row-block">
                      <div>
                        <strong>{receipt.receiptNumber}</strong>
                        <small>{formatDate(receipt.issuedAt)} • Payment acknowledgement</small>
                      </div>
                      <span className="payment-amount">{formatCurrency(receipt.amountCents)}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          )}

          {activeTab === 'documents' && (
            <article className="portal-premium-page">
              <div className="portal-premium-header">
                <div>
                  <p className="eyebrow">Care records</p>
                  <h3>Documents</h3>
                </div>
                <span className="portal-premium-chip">{documents.length} files</span>
              </div>

              {documents.length === 0 ? (
                <p className="empty-inline">No documents shared with your record.</p>
              ) : (
                <div className="portal-premium-list">
                  {documents.map((document) => (
                    <div key={document.id} className="portal-premium-card info-row info-row-block">
                      <div>
                        <strong>{document.fileName}</strong>
                        <small>
                          {document.category} • {document.uploadedBy}
                        </small>
                      </div>
                      <a href={document.content} target="_blank" rel="noreferrer" className="portal-link">
                        Open
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </article>
          )}

          {activeTab === 'profile' && (
            <article className="portal-stack profile-page">
              {/* Profile Header - Premium Welcome */}
              <section className="profile-header">
                <div className="profile-header-content">
                  <div className="profile-avatar-section">
                    <div 
                      className="profile-avatar-large" 
                      style={{ 
                        backgroundImage: profileImage ? `url(${profileImage})` : undefined, 
                        backgroundSize: 'cover', 
                        backgroundPosition: 'center' 
                      }}
                    >
                      {!profileImage && fullName.charAt(0).toUpperCase()}
                    </div>
                  </div>

                  <div className="profile-header-text">
                    <p className="eyebrow">Your profile</p>
                    <h2>{fullName}</h2>
                    <div className="profile-header-meta">
                      <span className="patient-id">ID: {patient.patientId}</span>
                      <span className={`account-status ${patient.status === 'active' ? 'active' : 'inactive'}`}>
                        <span className="status-dot" />
                        {patient.status === 'active' ? 'Account active' : 'Account inactive'}
                      </span>
                    </div>
                  </div>
                </div>

                {!isProfileEditing && (
                  <Button 
                    type="button" 
                    variant="secondary" 
                    icon={<PencilLine size={16} />} 
                    onClick={() => setIsProfileEditing(true)}
                  >
                    Edit profile
                  </Button>
                )}
              </section>

              {/* Feedback Messages */}
              {profileSaved === 'saved' && (
                <div className="profile-feedback success">
                  <CheckCircle2 size={16} /> Profile saved successfully.
                </div>
              )}
              {profileSaved === 'error' && profileError && (
                <div className="profile-feedback error">
                  <AlertCircle size={16} /> {profileError}
                </div>
              )}

              {/* Edit Mode Header - Show when editing */}
              {isProfileEditing && (
                <div className="profile-edit-header">
                  <div>
                    <h3>Edit your profile</h3>
                    <p>Update your personal information and contact details.</p>
                  </div>
                  <div className="edit-header-actions">
                    <Button 
                      type="button" 
                      variant="secondary" 
                      icon={<X size={16} />} 
                      onClick={() => {
                        setIsProfileEditing(false)
                        setProfileSaved('idle')
                        setProfileError(null)
                        setProfileForm({
                          firstName: patient.firstName,
                          middleName: patient.middleName,
                          lastName: patient.lastName,
                          dateOfBirth: patient.dateOfBirth,
                          email: patient.email,
                          phone: patient.phone,
                          address: patient.address,
                          emergencyContact: patient.emergencyContact,
                          emergencyContactPhone: patient.emergencyContactPhone,
                          emergencyContactRelationship: patient.emergencyContactRelationship ?? '',
                        })
                        setProfileImage(patient.profileImage ?? '')
                      }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="button" 
                      icon={<Save size={16} />} 
                      onClick={handleSaveProfile} 
                      disabled={profileSaved === 'saving'}
                    >
                      {profileSaved === 'saving' ? 'Saving...' : 'Save changes'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Main Content - Two Column Layout */}
              <div className="profile-content-grid">
                {/* Left Column - Personal & Contact Info */}
                <div className="profile-column">
                  {/* Personal Information Section */}
                  <section className="profile-section">
                    <div className="section-header">
                      <div className="section-title-row">
                        <UserCircle2 size={18} />
                        <div>
                          <h3>Personal information</h3>
                          <p className="section-description">Your basic details</p>
                        </div>
                      </div>
                    </div>

                    {!isProfileEditing ? (
                      <div className="info-display-grid">
                        <div className="info-block">
                          <span className="info-label">Full name</span>
                          <strong className="info-value">{fullName || 'Not provided'}</strong>
                        </div>
                        <div className="info-block">
                          <span className="info-label">Date of birth</span>
                          <strong className="info-value">
                            {patient.dateOfBirth ? formatDate(patient.dateOfBirth) : 'Not provided'}
                          </strong>
                        </div>
                        <div className="info-block">
                          <span className="info-label">Patient ID</span>
                          <strong className="info-value">{patient.patientId}</strong>
                        </div>
                      </div>
                    ) : (
                      <div className="form-grid three-column">
                        <div className="form-field">
                          <label>First name</label>
                          <input 
                            value={profileForm.firstName} 
                            onChange={(e) => handleProfileFieldChange('firstName', e.target.value)} 
                          />
                        </div>
                        <div className="form-field">
                          <label>Middle name</label>
                          <input 
                            value={profileForm.middleName} 
                            onChange={(e) => handleProfileFieldChange('middleName', e.target.value)} 
                          />
                        </div>
                        <div className="form-field">
                          <label>Last name</label>
                          <input 
                            value={profileForm.lastName} 
                            onChange={(e) => handleProfileFieldChange('lastName', e.target.value)} 
                          />
                        </div>
                        <div className="form-field full-width">
                          <label>Date of birth</label>
                          <input 
                            type="date" 
                            value={profileForm.dateOfBirth} 
                            onChange={(e) => handleProfileFieldChange('dateOfBirth', e.target.value)} 
                          />
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Contact Information Section */}
                  <section className="profile-section">
                    <div className="section-header">
                      <div className="section-title-row">
                        <Phone size={18} />
                        <div>
                          <h3>Contact information</h3>
                          <p className="section-description">How we reach you</p>
                        </div>
                      </div>
                    </div>

                    {!isProfileEditing ? (
                      <div className="info-display-grid">
                        <div className="info-block">
                          <span className="info-label">Email</span>
                          <strong className="info-value">{patient.email || 'Not provided'}</strong>
                        </div>
                        <div className="info-block">
                          <span className="info-label">Phone</span>
                          <strong className="info-value">{patient.phone || 'Not provided'}</strong>
                        </div>
                        <div className="info-block full-width">
                          <span className="info-label">Address</span>
                          <strong className="info-value">{patient.address || 'Not provided'}</strong>
                        </div>
                      </div>
                    ) : (
                      <div className="form-grid">
                        <div className="form-field full-width">
                          <label>Email</label>
                          <input 
                            type="email" 
                            value={profileForm.email} 
                            onChange={(e) => handleProfileFieldChange('email', e.target.value)} 
                          />
                        </div>
                        <div className="form-field">
                          <label>Phone</label>
                          <input 
                            value={profileForm.phone} 
                            onChange={(e) => handleProfileFieldChange('phone', e.target.value)} 
                          />
                        </div>
                        <div className="form-field full-width">
                          <label>Address</label>
                          <textarea 
                            value={profileForm.address} 
                            onChange={(e) => handleProfileFieldChange('address', e.target.value)} 
                            rows={3}
                          />
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="profile-section">
                    <CommunicationPreferencesPanel
                      patient={patient}
                      actor={user?.email ?? patient.patientId}
                      canEdit
                    />
                  </section>
                </div>

                {/* Right Column - Emergency Contact & Account Security */}
                <div className="profile-column">
                  {/* Account & Security Section */}
                  <section className="profile-section">
                    <div className="section-header">
                      <div className="section-title-row">
                        <LockKeyhole size={18} />
                        <div>
                          <h3>Account & security</h3>
                          <p className="section-description">Your account protection</p>
                        </div>
                      </div>
                    </div>

                    <div className="security-display">
                      <div className="security-item">
                        <span className="security-label">Email verification</span>
                        <span className="security-status verified">
                          <CheckCircle2 size={14} />
                          Verified
                        </span>
                      </div>
                      <div className="security-item">
                        <span className="security-label">Password</span>
                        <span className="security-status">••••••••</span>
                      </div>
                      <div className="security-item">
                        <span className="security-label">Account status</span>
                        <span className={`security-status ${patient.status === 'active' ? 'verified' : 'warning'}`}>
                          {patient.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </section>

                  {/* Emergency Contact Section */}
                  <section className="profile-section">
                    <div className="section-header">
                      <div className="section-title-row">
                        <AlertCircle size={18} />
                        <div>
                          <h3>Emergency contact</h3>
                          <p className="section-description">In case we need to reach you</p>
                        </div>
                      </div>
                    </div>

                    {!isProfileEditing ? (
                      <div className="info-display-grid">
                        <div className="info-block">
                          <span className="info-label">Name</span>
                          <strong className="info-value">{patient.emergencyContact || 'Not provided'}</strong>
                        </div>
                        <div className="info-block">
                          <span className="info-label">Relationship</span>
                          <strong className="info-value">{patient.emergencyContactRelationship || 'Not provided'}</strong>
                        </div>
                        <div className="info-block full-width">
                          <span className="info-label">Phone</span>
                          <strong className="info-value">{patient.emergencyContactPhone || 'Not provided'}</strong>
                        </div>
                      </div>
                    ) : (
                      <div className="form-grid">
                        <div className="form-field">
                          <label>Name</label>
                          <input 
                            value={profileForm.emergencyContact} 
                            onChange={(e) => handleProfileFieldChange('emergencyContact', e.target.value)} 
                          />
                        </div>
                        <div className="form-field">
                          <label>Relationship</label>
                          <input 
                            value={profileForm.emergencyContactRelationship} 
                            onChange={(e) => handleProfileFieldChange('emergencyContactRelationship', e.target.value)} 
                            placeholder="e.g., spouse, parent, sibling"
                          />
                        </div>
                        <div className="form-field full-width">
                          <label>Phone</label>
                          <input 
                            value={profileForm.emergencyContactPhone} 
                            onChange={(e) => handleProfileFieldChange('emergencyContactPhone', e.target.value)} 
                          />
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              </div>

              {/* Profile Photo Section - Full Width */}
              <section className="profile-section profile-photo-section">
                <div className="section-header">
                  <div className="section-title-row">
                    <Camera size={18} />
                    <div>
                      <h3>Profile photo</h3>
                      <p className="section-description">Your profile picture</p>
                    </div>
                  </div>
                </div>

                <div className="photo-display-panel">
                  <div 
                    className="profile-photo-preview" 
                    style={{ 
                      backgroundImage: profileImage ? `url(${profileImage})` : undefined, 
                      backgroundSize: 'cover', 
                      backgroundPosition: 'center' 
                    }}
                  >
                    {!profileImage && (
                      <div className="photo-placeholder">
                        <Camera size={36} />
                        <span>No photo</span>
                      </div>
                    )}
                  </div>

                  {isProfileEditing && (
                    <div className="photo-actions">
                      <label className="upload-button">
                        <input type="file" accept="image/*" onChange={handleProfileImageChange} />
                        <Camera size={16} />
                        Upload photo
                      </label>
                      {profileImage && (
                        <button type="button" className="remove-photo-button" onClick={() => setProfileImage('')}>
                          <Trash2 size={14} /> Remove photo
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </article>
          )}
        </div>
      </main>
    </div>
  )
}
