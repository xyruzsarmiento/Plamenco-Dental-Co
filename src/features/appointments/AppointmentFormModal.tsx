import type { FormEvent } from 'react'
import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  MapPin,
  Search,
  Sparkles,
  Stethoscope,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import type { Patient } from '../patients/patientTypes'
import type { Branch } from '../branches/branchTypes'
import type { Provider } from '../dentists/dentistTypes'
import type { Service } from '../services/serviceTypes'
import type { AppointmentFormValues } from './appointmentTypes'
import { addMinutesToTime, getOperatories } from './appointmentStore'
import { formatAppointmentTime, getAvailableAppointmentSlots } from './availabilityEngine'

type AppointmentFormModalProps = {
  patients: Patient[]
  services: Service[]
  branches: Branch[]
  providers: Provider[]
  values: AppointmentFormValues
  onChange: (values: AppointmentFormValues) => void
  onClose: () => void
  onSubmit: () => void
  error: string | null
  conflictError: string | null
}

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

export function AppointmentFormModal({
  conflictError,
  error,
  onChange,
  onClose,
  onSubmit,
  patients,
  branches,
  providers,
  services,
  values,
}: AppointmentFormModalProps) {
  const [step, setStep] = useState(0)
  const [patientSearch, setPatientSearch] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  const selectedPatient = patients.find((patient) => patient.id === values.patientId || patient.patientId === values.patientId)
  const selectedService = services.find((service) => service.id === values.serviceId)
  const selectedBranch = branches.find((branch) => branch.id === values.branchId)
  const selectedProvider = providers.find((provider) => provider.id === values.providerId)
  const operatories = getOperatories().filter((operatory) => operatory.branchId === values.branchId && operatory.status === 'active')
  const selectedOperatory = operatories.find((operatory) => operatory.id === values.operatoryId)
  const activeServices = services.filter((service) => service.status === 'active')
  const filteredPatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase()
    if (!query) return patients.slice(0, 24)
    return patients.filter((patient) => [
      patient.firstName,
      patient.middleName,
      patient.lastName,
      patient.patientId,
      patient.phone,
      patient.email,
    ].some((value) => (value ?? '').toLowerCase().includes(query))).slice(0, 24)
  }, [patientSearch, patients])

  const availableSlots = useMemo(() => {
    if (!values.branchId || !values.serviceId || !values.date) return []
    return getAvailableAppointmentSlots({
      branchId: values.branchId,
      serviceId: values.serviceId,
      date: values.date,
      providerId: values.providerId || undefined,
      operatoryId: values.operatoryId || undefined,
    })
  }, [values.branchId, values.date, values.operatoryId, values.providerId, values.serviceId])

  const steps = [
    { label: 'Patient', icon: UserRound },
    { label: 'Branch', icon: Building2 },
    { label: 'Service', icon: Stethoscope },
    { label: 'Dentist', icon: UsersRound },
    { label: 'Date & Time', icon: CalendarDays },
    { label: 'Review', icon: CheckCircle2 },
  ]

  function handleServiceChange(serviceId: string) {
    const service = services.find((entry) => entry.id === serviceId)
    if (!service) {
      onChange({ ...values, serviceId })
      return
    }
    const startTime = values.startTime || '09:00'
    onChange({
      ...values,
      serviceId,
      durationMinutes: service.duration,
      estimatedAmountCents: service.price,
      endTime: addMinutesToTime(startTime, service.duration),
    })
  }

  function chooseSlot(startTime: string, providerId: string, operatoryId?: string) {
    if (!selectedService) return
    onChange({
      ...values,
      providerId,
      operatoryId: operatoryId || values.operatoryId || undefined,
      startTime,
      endTime: addMinutesToTime(startTime, selectedService.duration),
      durationMinutes: selectedService.duration,
      estimatedAmountCents: selectedService.price,
    })
  }

  function canContinue() {
    if (step === 0) return Boolean(values.patientId)
    if (step === 1) return Boolean(values.branchId)
    if (step === 2) return Boolean(values.serviceId)
    if (step === 3) return true
    if (step === 4) return Boolean(values.date && values.startTime && values.providerId)
    return true
  }

  function goToStep(index: number) {
    if (index <= step) setStep(index)
  }

  return (
    <div className="modal-backdrop appointment37-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose()
    }}>
      <section className="appointment37-modal" aria-labelledby="appointment-modal-title" role="dialog" aria-modal="true">
        <header className="appointment37-header">
          <div className="appointment37-title-wrap">
            <span className="appointment37-icon"><Sparkles size={17} /></span>
            <div>
              <p className="appointment37-eyebrow">Clinic scheduling</p>
              <h2 id="appointment-modal-title">New Appointment</h2>
              <span>Build a complete booking in a guided scheduling flow.</span>
            </div>
          </div>
          <button className="appointment37-close" type="button" aria-label="Close appointment form" onClick={onClose}><X size={19} /></button>
        </header>

        <form className="appointment37-form" onSubmit={handleSubmit}>
          <aside className="appointment37-sidebar" aria-label="Appointment steps">
            <div className="appointment37-progress-copy"><span>Booking progress</span><strong>{step + 1} of {steps.length}</strong></div>
            <div className="appointment37-progress-track"><i style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
            <nav className="appointment37-steps">
              {steps.map(({ label, icon: Icon }, index) => {
                const complete = index < step
                const active = index === step
                return (
                  <button key={label} type="button" className={`${active ? 'is-active' : ''} ${complete ? 'is-complete' : ''}`.trim()} onClick={() => goToStep(index)} disabled={index > step}>
                    <span className="appointment37-step-icon">{complete ? <Check size={15} /> : <Icon size={15} />}</span>
                    <span><strong>{label}</strong><small>{complete ? 'Completed' : active ? 'Current step' : 'Pending'}</small></span>
                  </button>
                )
              })}
            </nav>

            <div className="appointment37-summary-mini">
              <span>Booking summary</span>
              <dl>
                <div><dt>Patient</dt><dd>{selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : 'Not selected'}</dd></div>
                <div><dt>Branch</dt><dd>{selectedBranch?.name ?? 'Not selected'}</dd></div>
                <div><dt>Service</dt><dd>{selectedService?.name ?? 'Not selected'}</dd></div>
                <div><dt>Schedule</dt><dd>{values.startTime ? `${values.date} · ${formatAppointmentTime(values.startTime)}` : 'Not selected'}</dd></div>
              </dl>
            </div>
          </aside>

          <div className="appointment37-content">
            <div className="appointment37-mobile-steps" aria-label="Booking progress">
              {steps.map(({ label }, index) => <button key={label} type="button" className={index === step ? 'is-active' : index < step ? 'is-complete' : ''} disabled={index > step} onClick={() => goToStep(index)}><span>{index + 1}</span>{label}</button>)}
            </div>

            {step === 0 && (
              <section className="appointment37-section">
                <div className="appointment37-section-head"><div><span>Step 1</span><h3>Select patient</h3><p>Find the patient record linked to this appointment.</p></div><UserRound size={21} /></div>
                <label className="appointment37-search" htmlFor="appointment-patient-search"><Search size={17} /><input id="appointment-patient-search" type="text" value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="Search name, patient number, phone or email" autoFocus /></label>
                <div className="appointment37-choice-list appointment37-patient-list">
                  {filteredPatients.map((patient) => {
                    const selected = values.patientId === patient.id || values.patientId === patient.patientId
                    return <button key={patient.id} type="button" className={selected ? 'is-selected' : ''} onClick={() => onChange({ ...values, patientId: patient.id })}>
                      <span className="appointment37-avatar">{`${patient.firstName?.[0] ?? ''}${patient.lastName?.[0] ?? ''}`.toUpperCase()}</span>
                      <span className="appointment37-choice-copy"><strong>{patient.firstName} {patient.lastName}</strong><small>{patient.patientId} · {patient.phone || 'No phone'}{patient.email ? ` · ${patient.email}` : ''}</small></span>
                      <span className="appointment37-check"><Check size={15} /></span>
                    </button>
                  })}
                  {filteredPatients.length === 0 && <div className="appointment37-empty"><UsersRound size={22} /><strong>No matching patient</strong><span>Add or import the patient record first, then return to scheduling.</span></div>}
                </div>
              </section>
            )}

            {step === 1 && (
              <section className="appointment37-section">
                <div className="appointment37-section-head"><div><span>Step 2</span><h3>Choose clinic branch</h3><p>Select where this visit will take place.</p></div><Building2 size={21} /></div>
                <div className="appointment37-card-grid">
                  {branches.map((branch) => <button key={branch.id} type="button" className={`appointment37-option-card ${values.branchId === branch.id ? 'is-selected' : ''}`} onClick={() => onChange({ ...values, branchId: branch.id, providerId: '', startTime: '' })}>
                    <span className="appointment37-option-icon"><Building2 size={18} /></span>
                    <span><strong>{branch.name}</strong><small><MapPin size={12} />{branch.city}, {branch.province}</small><em><Clock3 size={12} />{formatAppointmentTime(branch.openingTime)}–{formatAppointmentTime(branch.closingTime)}</em></span>
                    <i><Check size={14} /></i>
                  </button>)}
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="appointment37-section">
                <div className="appointment37-section-head"><div><span>Step 3</span><h3>Select service</h3><p>Choose the procedure or consultation for this visit.</p></div><Stethoscope size={21} /></div>
                <div className="appointment37-card-grid">
                  {activeServices.map((service) => <button key={service.id} type="button" className={`appointment37-option-card ${values.serviceId === service.id ? 'is-selected' : ''}`} onClick={() => handleServiceChange(service.id)}>
                    <span className="appointment37-option-icon"><Stethoscope size={18} /></span>
                    <span><strong>{service.name}</strong><small>{service.category || 'Dental service'}</small><em>{service.duration} min · {service.price > 0 ? peso.format(service.price / 100) : 'Price to be confirmed'}</em></span>
                    <i><Check size={14} /></i>
                  </button>)}
                </div>
              </section>
            )}

            {step === 3 && (
              <section className="appointment37-section">
                <div className="appointment37-section-head"><div><span>Step 4</span><h3>Choose dentist</h3><p>Select a provider now or allow the scheduler to find any eligible dentist.</p></div><UsersRound size={21} /></div>
                <div className="appointment37-card-grid">
                  <button type="button" className={`appointment37-option-card ${!values.providerId ? 'is-selected' : ''}`} onClick={() => onChange({ ...values, providerId: '', startTime: '' })}>
                    <span className="appointment37-option-icon"><UsersRound size={18} /></span><span><strong>Any available dentist</strong><small>Recommended for flexible scheduling</small><em>Availability is calculated automatically.</em></span><i><Check size={14} /></i>
                  </button>
                  {providers.map((provider) => <button key={provider.id} type="button" className={`appointment37-option-card ${values.providerId === provider.id ? 'is-selected' : ''}`} onClick={() => onChange({ ...values, providerId: provider.id, startTime: '' })}>
                    <span className="appointment37-option-icon"><UserRound size={18} /></span><span><strong>{provider.displayName}</strong><small>{provider.role.replaceAll('_', ' ')}</small><em>{provider.specialization || 'Dental provider'}</em></span><i><Check size={14} /></i>
                  </button>)}
                  {values.branchId && providers.length === 0 && <div className="appointment37-empty"><UsersRound size={22} /><strong>No assigned dentists</strong><span>No active dentists are currently available for this branch.</span></div>}
                </div>
              </section>
            )}

            {step === 4 && (
              <section className="appointment37-section">
                <div className="appointment37-section-head"><div><span>Step 5</span><h3>Date & available time</h3><p>Select the visit date, optional chair, and a real available time slot.</p></div><CalendarDays size={21} /></div>
                <div className="appointment37-date-controls">
                  <Input label="Appointment date" type="date" value={values.date} onChange={(event) => onChange({ ...values, date: event.target.value, startTime: '' })} required />
                  {operatories.length > 0 && <label><span>Operatory / chair</span><select value={values.operatoryId ?? ''} onChange={(event) => onChange({ ...values, operatoryId: event.target.value || undefined, startTime: '' })}><option value="">Any available operatory</option>{operatories.map((operatory) => <option key={operatory.id} value={operatory.id}>{operatory.name}</option>)}</select></label>}
                </div>
                {values.branchId && values.serviceId && values.date ? (
                  <div className="appointment37-slot-grid">
                    {availableSlots.map((slot) => <button key={`${slot.providerId}-${slot.operatoryId ?? 'any'}-${slot.startTime}`} type="button" className={values.startTime === slot.startTime && values.providerId === slot.providerId ? 'is-selected' : ''} onClick={() => chooseSlot(slot.startTime, slot.providerId, slot.operatoryId)}>
                      <Clock3 size={16} /><span><strong>{formatAppointmentTime(slot.startTime)}</strong><small>{slot.providerName}{slot.operatoryName ? ` · ${slot.operatoryName}` : ''}</small></span><i><Check size={14} /></i>
                    </button>)}
                    {availableSlots.length === 0 && <div className="appointment37-empty appointment37-empty-wide"><CalendarDays size={22} /><strong>No available slots</strong><span>Try another date, dentist, or operatory.</span></div>}
                  </div>
                ) : <div className="appointment37-empty appointment37-empty-wide"><CalendarDays size={22} /><strong>Availability needs more information</strong><span>Choose a branch, service, and date to calculate real scheduling options.</span></div>}
              </section>
            )}

            {step === 5 && (
              <section className="appointment37-section">
                <div className="appointment37-section-head"><div><span>Final step</span><h3>Review appointment</h3><p>Confirm the visit details before creating the booking.</p></div><CheckCircle2 size={21} /></div>
                <div className="appointment37-review-hero"><span className="appointment37-review-icon"><CalendarDays size={22} /></span><div><span>{selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : 'Patient'}</span><strong>{selectedService?.name ?? 'Service not selected'}</strong><small>{values.date} · {values.startTime ? `${formatAppointmentTime(values.startTime)}–${formatAppointmentTime(values.endTime)}` : 'No time selected'}</small></div></div>
                <div className="appointment37-review-grid">
                  <div><span>Branch</span><strong>{selectedBranch?.name ?? 'No branch selected'}</strong></div>
                  <div><span>Dentist</span><strong>{selectedProvider?.displayName ?? 'Assigned from availability'}</strong></div>
                  <div><span>Operatory</span><strong>{selectedOperatory?.name ?? 'Any available'}</strong></div>
                  <div><span>Duration</span><strong>{values.durationMinutes ?? selectedService?.duration ?? 0} minutes</strong></div>
                  <div><span>Estimated price</span><strong>{selectedService?.price ? peso.format(selectedService.price / 100) : 'Price to be confirmed'}</strong></div>
                  <div><span>Deposit</span><strong>{values.depositStatus?.replaceAll('_', ' ') ?? 'Not required'}</strong></div>
                </div>
                <div className="appointment37-note-grid">
                  <Input label="Custom duration in minutes" type="number" min="5" step="5" value={values.durationMinutes ?? selectedService?.duration ?? ''} onChange={(event) => { const duration = Number(event.target.value); onChange({ ...values, durationMinutes: duration, endTime: values.startTime ? addMinutesToTime(values.startTime, duration) : values.endTime }) }} />
                  <Textarea label="Reason for visit" value={values.reasonForVisit ?? ''} onChange={(event) => onChange({ ...values, reasonForVisit: event.target.value, notes: event.target.value })} />
                  <Textarea label="Internal notes" value={values.internalNotes ?? ''} onChange={(event) => onChange({ ...values, internalNotes: event.target.value })} />
                </div>
              </section>
            )}

            {(error || conflictError) && <div className="appointment37-alert" role="alert"><X size={15} /><span>{conflictError || error}</span></div>}

            <footer className="appointment37-footer">
              <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
              <div>
                {step > 0 && <Button variant="secondary" type="button" onClick={() => setStep((current) => Math.max(current - 1, 0))}><ArrowLeft size={15} />Back</Button>}
                {step < steps.length - 1 ? <Button type="button" disabled={!canContinue()} onClick={() => setStep((current) => Math.min(current + 1, steps.length - 1))}>Continue<ArrowRight size={15} /></Button> : <Button type="submit" disabled={Boolean(conflictError)}>Confirm booking<CheckCircle2 size={15} /></Button>}
              </div>
            </footer>
          </div>
        </form>
      </section>
    </div>
  )
}
