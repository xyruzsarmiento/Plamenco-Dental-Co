import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  AlertCircle,
  FileText,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { useAuth } from '../features/auth/AuthContext'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { getStoredServices, loadServicesFromSupabase } from '../features/services/serviceStore'
import { createPublicBooking, getAvailableBookingTimes } from '../features/patientPortal/patientPortalStore'

type ServiceLoadState = 'loading' | 'loaded' | 'no-services' | 'error'

const steps = ['Select service', 'Select date', 'Select time', 'Patient details', 'Confirm']

type BookingForm = {
  serviceId: string
  date: string
  startTime: string
  firstName: string
  lastName: string
  email: string
  phone: string
  notes: string
}

const emptyForm: BookingForm = {
  serviceId: '',
  date: '',
  startTime: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  notes: '',
}

export function PublicBookingPage() {
  const { user, isLoading: authLoading } = useAuth()
  const [services, setServices] = useState<ReturnType<typeof getStoredServices>>([])
  const [serviceLoadState, setServiceLoadState] = useState<ServiceLoadState>('loading')
  const [serviceLoadError, setServiceLoadError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const loadServices = async () => {
      try {
        setServiceLoadState('loading')
        setServiceLoadError(null)

        const loaded = await loadServicesFromSupabase()

        if (!isMounted) return

        if (!loaded || loaded.length === 0) {
          setServices([])
          setServiceLoadState('no-services')
          return
        }

        setServices(loaded)
        setServiceLoadState('loaded')
      } catch (error) {
        if (!isMounted) return

        const message = error instanceof Error ? error.message : 'Failed to load services'
        console.error('[services load error]', error)
        setServiceLoadError(message)
        setServiceLoadState('error')
        setServices([])
      }
    }

    void loadServices()

    return () => {
      isMounted = false
    }
  }, [])

  const [form, setForm] = useState<BookingForm>(emptyForm)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [bookingId, setBookingId] = useState('')

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

  const selectedService = useMemo(
    () => services.find((service) => service.id === form.serviceId),
    [form.serviceId, services]
  )

  const availableTimes = useMemo(() => {
    if (!form.date || !form.serviceId) return []
    return getAvailableBookingTimes(form.serviceId, form.date)
  }, [form.date, form.serviceId])

  // Show loading while auth is being resolved
  if (authLoading) {
    return (
      <div className="auth-page">
        <div className="loading-state">Loading your account...</div>
      </div>
    )
  }

  // The public booking flow is intentionally available without requiring a patient login.
  // If a user is already authenticated, we keep their details prefilled when possible.

  // Show error if services failed to load from database
  if (serviceLoadState === 'error') {
    return (
      <div className="auth-page">
        <div className="error-state" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <AlertCircle size={48} style={{ marginBottom: '16px', color: 'var(--danger)' }} />
          <h2>Unable to load services</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
            {serviceLoadError || 'There was a problem loading available services. Please try again later.'}
          </p>
          <Link to={user?.patientId ? `/portal/${user.patientId}` : '/login'}>
            <Button variant="secondary">Return to patient portal</Button>
          </Link>
        </div>
      </div>
    )
  }

  // Show no services state if database is empty
  if (serviceLoadState === 'no-services') {
    return (
      <div className="auth-page">
        <div className="empty-state" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <FileText size={48} style={{ marginBottom: '16px', color: 'var(--text-muted)' }} />
          <h2>No services available</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
            The clinic has not configured any services for booking yet. Please contact the clinic directly or try again later.
          </p>
          <Link to={user?.patientId ? `/portal/${user.patientId}` : '/login'}>
            <Button variant="secondary">Return to patient portal</Button>
          </Link>
        </div>
      </div>
    )
  }

  // Show loading while services are being fetched (only for the first load)
  if (serviceLoadState === 'loading') {
    return (
      <div className="auth-page">
        <div className="loading-state">Preparing your booking...</div>
      </div>
    )
  }

  const nextDisabled = (() => {
    if (step === 0) return !form.serviceId
    if (step === 1) return !form.date
    if (step === 2) return !form.startTime
    if (step === 3) return !form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.phone.trim()
    return false
  })()

  const formatPrice = (value: number) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(value / 100)

  function updateForm<K extends keyof BookingForm>(key: K, value: BookingForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function handleNext() {
    if (nextDisabled) {
      setError('Please complete the current step before continuing.')
      return
    }

    if (step < steps.length - 1) {
      setStep((current) => current + 1)
      return
    }

    try {
      const appointment = createPublicBooking({
        serviceId: form.serviceId,
        date: form.date,
        startTime: form.startTime,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        notes: form.notes,
      })
      setBookingId(appointment.id)
      setStep(steps.length)
    } catch (bookingError) {
      const message = bookingError instanceof Error ? bookingError.message : 'Unable to create booking.'
      setError(message)
    }
  }

  function handleBack() {
    if (step > 0) setStep((current) => current - 1)
  }

  const portalHref = user?.role === 'patient' && user.patientId ? `/portal/${user.patientId}` : '/login'

  return (
    <div className="public-booking-page">
      <div className="public-booking-shell">
        <div className="public-booking-header">
          <div>
            <p className="eyebrow">Online booking</p>
            <h1>Schedule your visit</h1>
          </div>
          <Link className="btn btn-ghost btn-sm" to={portalHref}>
            Return to portal
          </Link>
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
                    <div className="section-title-row">
                      <FileText size={18} />
                      <h2>Select service</h2>
                    </div>
                    {services.length === 0 ? (
                      <div className="empty-inline" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <p>No services available to display.</p>
                      </div>
                    ) : (
                      <div className="service-option-list">
                        {services.map((service) => (
                          <button
                            key={service.id}
                            type="button"
                            className={`service-option ${form.serviceId === service.id ? 'is-selected' : ''}`}
                            onClick={() => updateForm('serviceId', service.id)}
                          >
                            <div className="service-option-copy">
                              <strong>{service.name}</strong>
                              <small>{service.category}</small>
                            </div>
                            <div className="service-option-meta">
                              <strong>{formatPrice(service.price)}</strong>
                              <small>{service.duration} min</small>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {step === 1 && (
                  <div className="booking-section">
                    <div className="section-title-row">
                      <CalendarDays size={18} />
                      <h2>Select date</h2>
                    </div>
                    <Input
                      label="Preferred date"
                      type="date"
                      value={form.date}
                      onChange={(event) => updateForm('date', event.target.value)}
                    />
                  </div>
                )}

                {step === 2 && (
                  <div className="booking-section">
                    <div className="section-title-row">
                      <Clock3 size={18} />
                      <h2>Select available time</h2>
                    </div>
                    {availableTimes.length === 0 ? (
                      <div className="empty-inline">No time slots are available for this date. Please choose another day.</div>
                    ) : (
                      <div className="time-slot-grid">
                        {availableTimes.map((time) => (
                          <button
                            key={time}
                            type="button"
                            className={`time-slot ${form.startTime === time ? 'is-selected' : ''}`}
                            onClick={() => updateForm('startTime', time)}
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {step === 3 && (
                  <div className="booking-section">
                    <div className="section-title-row">
                      <UserRound size={18} />
                      <h2>Enter patient information</h2>
                    </div>
                    <div className="form-grid">
                      <Input label="First name" value={form.firstName} onChange={(event) => updateForm('firstName', event.target.value)} />
                      <Input label="Last name" value={form.lastName} onChange={(event) => updateForm('lastName', event.target.value)} />
                      <Input label="Email" type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} />
                      <Input label="Phone" value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} />
                    </div>
                    <Textarea label="Appointment notes" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} />
                  </div>
                )}

                {step === 4 && (
                  <div className="booking-section">
                    <div className="section-title-row">
                      <ShieldCheck size={18} />
                      <h2>Confirm booking</h2>
                    </div>
                    <div className="confirmation-card">
                      <div className="confirm-row">
                        <span>Service</span>
                        <strong>{selectedService?.name ?? 'Service'}</strong>
                      </div>
                      <div className="confirm-row">
                        <span>Date</span>
                        <strong>{form.date}</strong>
                      </div>
                      <div className="confirm-row">
                        <span>Time</span>
                        <strong>{form.startTime}</strong>
                      </div>
                      <div className="confirm-row">
                        <span>Patient</span>
                        <strong>
                          {form.firstName} {form.lastName}
                        </strong>
                      </div>
                      <div className="confirm-row">
                        <span>Est. total</span>
                        <strong>{selectedService ? formatPrice(selectedService.price) : '—'}</strong>
                      </div>
                    </div>
                  </div>
                )}

                <div className="booking-actions">
                  <Button variant="secondary" onClick={handleBack} disabled={step === 0}>
                    Back
                  </Button>
                  <Button onClick={handleNext} disabled={nextDisabled}>
                    {step === steps.length - 1 ? 'Review booking' : step === steps.length - 2 ? 'Confirm booking' : 'Continue'}
                  </Button>
                </div>
              </div>

              <aside className="booking-summary">
                <div className="booking-summary-hero">
                  <div className="summary-badge">
                    <Sparkles size={14} />
                    Premium care
                  </div>
                  <h3>Your visit snapshot</h3>
                </div>

                <div className="summary-card">
                  <span className="summary-label">Selected treatment</span>
                  <strong>{selectedService?.name ?? 'Choose a service'}</strong>
                  <small>{selectedService ? `${selectedService.duration} minute appointment` : 'We’ll tailor the time to your needs.'}</small>
                </div>

                <div className="summary-grid">
                  <div>
                    <span>Date</span>
                    <strong>{form.date || '—'}</strong>
                  </div>
                  <div>
                    <span>Time</span>
                    <strong>{form.startTime || '—'}</strong>
                  </div>
                </div>

                <div className="summary-price">
                  <span>Estimated total</span>
                  <strong>{selectedService ? formatPrice(selectedService.price) : '—'}</strong>
                </div>

                <ul className="summary-list">
                  <li>
                    <CheckCircle2 size={16} />
                    Friendly appointment coordination
                  </li>
                  <li>
                    <CheckCircle2 size={16} />
                    Digital intake and reminders
                  </li>
                  <li>
                    <CheckCircle2 size={16} />
                    Same-day support for urgent care
                  </li>
                </ul>

                <Link className="summary-cta" to={portalHref}>
                  Return to portal
                  <ArrowRight size={16} />
                </Link>
              </aside>
            </>
          ) : (
            <div className="booking-panel booking-success">
              <CheckCircle2 size={32} />
              <h2>Booking request submitted</h2>
              <p>Your appointment is pending confirmation by the clinic team. Reference number: {bookingId}</p>
              <div className="booking-actions">
                <Link className="btn btn-primary" to={portalHref}>
                  View patient portal
                </Link>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setForm(emptyForm)
                    setStep(0)
                    setError('')
                    setBookingId('')
                  }}
                >
                  Book another visit
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
