import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  MapPin,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { PortalSkeleton } from '../components/ui/DesignSystem'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { useAuth } from '../features/auth/AuthContext'
import { getStoredBranches, loadBranchesFromSupabase } from '../features/branches/branchStore'
import { createPublicBooking, getAvailableBookingTimes } from '../features/patientPortal/patientPortalStore'
import { getStoredServices, loadServicesFromSupabase } from '../features/services/serviceStore'

type ServiceLoadState = 'loading' | 'loaded' | 'no-services' | 'error'

const steps = ['Service', 'Branch', 'Date', 'Time', 'Details', 'Confirm']

type BookingForm = {
  branchId: string
  serviceId: string
  providerId: string
  date: string
  startTime: string
  firstName: string
  lastName: string
  email: string
  phone: string
  notes: string
}

const emptyForm: BookingForm = {
  branchId: '',
  serviceId: '',
  providerId: '',
  date: '',
  startTime: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  notes: '',
}

function formatPrice(value: number) {
  if (value <= 0) return 'Price available upon consultation'
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)
}

function formatTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour = hours % 12 || 12
  return `${hour}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function formatDate(value: string) {
  if (!value) return 'Date'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function PublicBookingPage() {
  const { user, isLoading: authLoading } = useAuth()
  const [services, setServices] = useState<ReturnType<typeof getStoredServices>>([])
  const [branches, setBranches] = useState<ReturnType<typeof getStoredBranches>>([])
  const [serviceLoadState, setServiceLoadState] = useState<ServiceLoadState>('loading')
  const [serviceLoadError, setServiceLoadError] = useState<string | null>(null)
  const [form, setForm] = useState<BookingForm>(emptyForm)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [bookingId, setBookingId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let isMounted = true

    const loadPublicBookingData = async () => {
      try {
        setServiceLoadState('loading')
        setServiceLoadError(null)
        const [loadedServices, loadedBranches] = await Promise.all([
          loadServicesFromSupabase(),
          loadBranchesFromSupabase({ strict: true }),
        ])
        if (!isMounted) return
        const publicServices = loadedServices.filter((service) =>
          service.status === 'active' &&
          service.onlineBookable !== false &&
          !service.internalOnly &&
          service.showOnWebsite !== false,
        )
        setServices(publicServices)
        setBranches(loadedBranches.filter((branch) => branch.status === 'active'))
        setServiceLoadState(publicServices.length ? 'loaded' : 'no-services')
      } catch (loadError) {
        if (!isMounted) return
        setServiceLoadError(loadError instanceof Error ? loadError.message : 'Failed to load booking options')
        setServiceLoadState('error')
        setServices([])
        setBranches([])
      }
    }

    void loadPublicBookingData()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!user) return
    const [firstName, ...rest] = (user.name || '').split(' ')
    const lastName = rest.join(' ')
    setForm((current) => ({
      ...current,
      firstName: current.firstName || firstName || '',
      lastName: current.lastName || lastName || '',
      email: current.email || user.email || '',
    }))
  }, [user])

  const selectedBranch = useMemo(() => branches.find((branch) => branch.id === form.branchId), [branches, form.branchId])
  const selectedService = useMemo(() => services.find((service) => service.id === form.serviceId), [form.serviceId, services])
  const availableTimes = useMemo(() => {
    if (!form.date || !form.serviceId || !form.branchId) return []
    return getAvailableBookingTimes(form.serviceId, form.date, form.branchId)
  }, [form.branchId, form.date, form.serviceId])

  const nextDisabled = (() => {
    if (isSubmitting) return true
    if (step === 0) return !form.serviceId
    if (step === 1) return !form.branchId
    if (step === 2) return !form.date
    if (step === 3) return !form.startTime
    if (step === 4) return !form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.phone.trim()
    return false
  })()

  function updateForm<K extends keyof BookingForm>(key: K, value: BookingForm[K]) {
    if (isSubmitting) return
    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'branchId') {
        next.providerId = ''
        next.date = ''
        next.startTime = ''
      }
      if (key === 'serviceId' || key === 'providerId' || key === 'date') next.startTime = ''
      return next
    })
    setError('')
  }

  async function handleNext() {
    if (nextDisabled) {
      if (!isSubmitting) setError('Please complete this step before continuing.')
      return
    }

    if (step < steps.length - 1) {
      setStep((current) => current + 1)
      return
    }

    setIsSubmitting(true)
    setError('')
    try {
      const appointment = await createPublicBooking({
        branchId: form.branchId,
        serviceId: form.serviceId,
        providerId: undefined,
        date: form.date,
        startTime: form.startTime,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        notes: form.notes,
      })
      setBookingId(appointment.appointmentNumber || appointment.id)
      setStep(steps.length)
    } catch (bookingError) {
      setError(bookingError instanceof Error ? bookingError.message : 'Unable to create booking.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleBack() {
    if (!isSubmitting && step > 0) setStep((current) => current - 1)
  }

  const portalHref = user?.role === 'patient' && user.patientId ? `/portal/${user.patientId}` : '/login'

  if (authLoading) return <PortalSkeleton variant="booking" message="Loading your account" />

  if (serviceLoadState === 'error') {
    return (
      <div className="auth-page">
        <div className="error-state" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <AlertCircle size={48} style={{ marginBottom: '16px', color: 'var(--danger)' }} />
          <h2>Unable to load booking options</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>{serviceLoadError || 'There was a problem loading available services or branches. Please try again later.'}</p>
          <Link to={portalHref}><Button variant="secondary">Return to patient portal</Button></Link>
        </div>
      </div>
    )
  }

  if (serviceLoadState === 'no-services') {
    return (
      <div className="auth-page">
        <div className="empty-state" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <FileText size={48} style={{ marginBottom: '16px', color: 'var(--text-muted)' }} />
          <h2>No services available</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>The clinic has not configured services for online booking yet. Please contact the clinic directly or try again later.</p>
          <Link to={portalHref}><Button variant="secondary">Return to patient portal</Button></Link>
        </div>
      </div>
    )
  }

  if (serviceLoadState === 'loading') return <PortalSkeleton variant="booking" message="Preparing your booking" />

  return (
    <div className="public-booking-page">
      <div className="public-booking-shell">
        <div className="public-booking-header">
          <div>
            <p className="eyebrow">Online booking</p>
            <h1>Schedule your visit</h1>
          </div>
          <Link className="btn btn-ghost btn-sm" to={portalHref}>Return to portal</Link>
        </div>

        <div className="booking-progress" aria-label="Booking progress">
          {steps.map((label, index) => (
            <div key={label} className={`progress-step ${index <= step ? 'is-active' : ''}`}>
              <span>{index + 1}</span>
              <small>{label}</small>
            </div>
          ))}
        </div>

        <div className="public-booking-content">
          {step < steps.length ? (
            <>
              <div className="booking-panel">
                {error && <div className="alert danger">{error}</div>}

                {step === 0 && (
                  <div className="booking-section">
                    <div className="section-title-row"><FileText size={18} /><h2>Select service</h2></div>
                    <div className="service-option-list">
                      {services.map((service) => (
                        <button key={service.id} type="button" disabled={isSubmitting} className={`service-option ${form.serviceId === service.id ? 'is-selected' : ''}`} onClick={() => updateForm('serviceId', service.id)}>
                          <div className="service-option-copy"><strong>{service.name}</strong><small>{service.description || service.category}</small></div>
                          <div className="service-option-meta"><strong>{formatPrice(service.price)}</strong><small>{service.duration} min</small></div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <div className="booking-section">
                    <div className="section-title-row"><MapPin size={18} /><h2>Choose clinic branch</h2></div>
                    <div className="branch-choice-grid">
                      {branches.map((branch) => (
                        <button key={branch.id} type="button" disabled={isSubmitting} className={`branch-choice ${form.branchId === branch.id ? 'is-selected' : ''}`} onClick={() => updateForm('branchId', branch.id)}>
                          <strong>{branch.name}</strong>
                          <small>{[branch.city, branch.province].filter(Boolean).join(', ') || 'Clinic location'}</small>
                          {(branch.openingTime || branch.closingTime) && <span>{branch.openingTime} - {branch.closingTime}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="booking-section">
                    <div className="section-title-row"><CalendarDays size={18} /><h2>Select date</h2></div>
                    <Input label="Preferred date" type="date" value={form.date} disabled={isSubmitting} onChange={(event) => updateForm('date', event.target.value)} />
                  </div>
                )}

                {step === 3 && (
                  <div className="booking-section">
                    <div className="section-title-row"><Clock3 size={18} /><h2>Select available time</h2></div>
                    {availableTimes.length === 0 ? (
                      <div className="empty-inline">No time slots are available for this date. Please choose another day.</div>
                    ) : (
                      <div className="time-slot-grid">
                        {availableTimes.map((time) => (
                          <button key={time} type="button" disabled={isSubmitting} className={`time-slot ${form.startTime === time ? 'is-selected' : ''}`} onClick={() => updateForm('startTime', time)}>{formatTime(time)}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {step === 4 && (
                  <div className="booking-section">
                    <div className="section-title-row"><UserRound size={18} /><h2>Enter patient information</h2></div>
                    <div className="form-grid">
                      <Input label="First name" value={form.firstName} disabled={isSubmitting} onChange={(event) => updateForm('firstName', event.target.value)} />
                      <Input label="Last name" value={form.lastName} disabled={isSubmitting} onChange={(event) => updateForm('lastName', event.target.value)} />
                      <Input label="Email" type="email" value={form.email} disabled={isSubmitting} onChange={(event) => updateForm('email', event.target.value)} />
                      <Input label="Phone" value={form.phone} disabled={isSubmitting} onChange={(event) => updateForm('phone', event.target.value)} />
                    </div>
                    <Textarea label="Appointment notes" value={form.notes} disabled={isSubmitting} onChange={(event) => updateForm('notes', event.target.value)} />
                  </div>
                )}

                {step === 5 && (
                  <div className="booking-section">
                    <div className="section-title-row"><ShieldCheck size={18} /><h2>Confirm booking</h2></div>
                    <div className="confirmation-card">
                      <div className="confirm-row"><span>Branch</span><strong>{selectedBranch?.name ?? 'Clinic branch'}</strong></div>
                      <div className="confirm-row"><span>Service</span><strong>{selectedService?.name ?? 'Service'}</strong></div>
                      <div className="confirm-row"><span>Dentist</span><strong>Any available dentist</strong></div>
                      <div className="confirm-row"><span>Date</span><strong>{formatDate(form.date)}</strong></div>
                      <div className="confirm-row"><span>Time</span><strong>{form.startTime ? formatTime(form.startTime) : 'Time'}</strong></div>
                      <div className="confirm-row"><span>Patient</span><strong>{form.firstName} {form.lastName}</strong></div>
                      <div className="confirm-row"><span>Estimated fee</span><strong>{selectedService ? formatPrice(selectedService.price) : 'To be confirmed'}</strong></div>
                      <p className="muted-label">The clinic will assign an available dentist when your appointment is confirmed.</p>
                      <p className="muted-label">Final cost may vary depending on your treatment needs.</p>
                    </div>
                  </div>
                )}

                <div className="booking-actions">
                  <Button variant="secondary" onClick={handleBack} disabled={step === 0 || isSubmitting}>Back</Button>
                  <Button onClick={() => { void handleNext() }} disabled={nextDisabled}>
                    {isSubmitting ? 'Confirming appointment...' : step === steps.length - 1 ? 'Confirm appointment' : 'Continue'}
                  </Button>
                </div>
              </div>

              <aside className="booking-summary">
                <div className="booking-summary-hero">
                  <div className="summary-badge"><Sparkles size={14} /> Premium care</div>
                  <h3>Your visit snapshot</h3>
                </div>
                <div className="summary-card"><span className="summary-label">Selected treatment</span><strong>{selectedService?.name ?? 'Choose a service'}</strong><small>{selectedService ? `${selectedService.duration} minute appointment` : 'We will tailor the time to your needs.'}</small></div>
                <div className="summary-card"><span className="summary-label">Clinic branch</span><strong>{selectedBranch?.name ?? 'Choose a branch'}</strong><small>Any available dentist</small></div>
                <div className="summary-grid">
                  <div><span>Date</span><strong>{form.date ? new Date(`${form.date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '-'}</strong></div>
                  <div><span>Time</span><strong>{form.startTime ? formatTime(form.startTime) : '-'}</strong></div>
                </div>
                <div className="summary-price"><span>Estimated fee</span><strong>{selectedService ? formatPrice(selectedService.price) : '-'}</strong></div>
                <ul className="summary-list">
                  <li><CheckCircle2 size={16} /> Friendly appointment coordination</li>
                  <li><CheckCircle2 size={16} /> Digital reminders when configured</li>
                  <li><CheckCircle2 size={16} /> Same-day support for urgent care</li>
                </ul>
                <Link className="summary-cta" to={portalHref}>Return to portal <ArrowRight size={16} /></Link>
              </aside>
            </>
          ) : (
            <div className="booking-panel booking-success">
              <CheckCircle2 size={32} />
              <h2>Booking request submitted</h2>
              <p>Your appointment is saved in the clinic database and is pending confirmation. Reference number: {bookingId}</p>
              <div className="booking-actions">
                <Link className="btn btn-primary" to={portalHref}>View patient portal</Link>
                <Button variant="secondary" onClick={() => { setForm(emptyForm); setStep(0); setError(''); setBookingId('') }}>Book another visit</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
