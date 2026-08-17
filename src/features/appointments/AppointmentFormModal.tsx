import type { FormEvent } from 'react'
import { useMemo, useState } from 'react'
import { CalendarDays, Search, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import type { Patient } from '../patients/patientTypes'
import type { Branch } from '../branches/branchTypes'
import type { Provider } from '../dentists/dentistTypes'
import type { Service } from '../services/serviceTypes'
import type { AppointmentFormValues } from './appointmentTypes'
import { addMinutesToTime } from './appointmentStore'
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

  const selectedService = services.find((service) => service.id === values.serviceId)
  const selectedBranch = branches.find((branch) => branch.id === values.branchId)
  const selectedProvider = providers.find((provider) => provider.id === values.providerId)
  const activeServices = services.filter((service) => service.status === 'active')
  const filteredPatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase()
    if (!query) return patients.slice(0, 20)
    return patients.filter((patient) => [
      patient.firstName,
      patient.middleName,
      patient.lastName,
      patient.patientId,
      patient.phone,
      patient.email,
    ].some((value) => (value ?? '').toLowerCase().includes(query))).slice(0, 20)
  }, [patientSearch, patients])

  const availableSlots = useMemo(() => {
    if (!values.branchId || !values.serviceId || !values.date) return []
    return getAvailableAppointmentSlots({
      branchId: values.branchId,
      serviceId: values.serviceId,
      date: values.date,
      providerId: values.providerId || undefined,
    })
  }, [values.branchId, values.date, values.providerId, values.serviceId])

  const steps = ['Patient', 'Branch', 'Service', 'Dentist', 'Date & Time', 'Review']

  function handleServiceChange(serviceId: string) {
    const service = services.find((entry) => entry.id === serviceId)

    if (!service) {
      onChange({ ...values, serviceId })
      return
    }

    const startTime = values.startTime || '09:00'
    const [hour, minute] = startTime.split(':').map(Number)
    const endDate = new Date()
    endDate.setHours(hour, minute + service.duration, 0, 0)

    const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`

    onChange({
      ...values,
      serviceId,
      durationMinutes: service.duration,
      estimatedAmountCents: service.price,
      endTime,
    })
  }

  function chooseSlot(startTime: string, providerId: string) {
    if (!selectedService) return
    onChange({
      ...values,
      providerId,
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

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal appointment-modal"
        aria-labelledby="appointment-modal-title"
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Clinic scheduling</p>
            <h2 id="appointment-modal-title">Create appointment</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close appointment form" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form className="form-stack appointment-flow" onSubmit={handleSubmit}>
          <div className="appointment-flow-steps">
            {steps.map((label, index) => (
              <button key={label} type="button" className={index === step ? 'is-active' : ''} onClick={() => setStep(index)}>
                <span>{index + 1}</span>
                {label}
              </button>
            ))}
          </div>

          {step === 0 && (
            <div className="form-section">
              <h3>Patient</h3>
              <label className="toolbar-search" htmlFor="appointment-patient-search">
                <Search size={16} className="search-icon" />
                <input
                  id="appointment-patient-search"
                  type="text"
                  value={patientSearch}
                  onChange={(event) => setPatientSearch(event.target.value)}
                  placeholder="Search name, patient number, phone or email"
                />
              </label>
              <div className="appointment-choice-list">
                {filteredPatients.map((patient) => (
                  <button
                    key={patient.id}
                    type="button"
                    className={values.patientId === patient.id ? 'is-selected' : ''}
                    onClick={() => onChange({ ...values, patientId: patient.id })}
                  >
                    <strong>{patient.firstName} {patient.lastName}</strong>
                    <span>{patient.patientId} - {patient.phone || 'No phone'}</span>
                  </button>
                ))}
                {filteredPatients.length === 0 && <div className="empty-inline">No matching patient. Add the patient from Patient Management first.</div>}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="form-section">
              <h3>Branch</h3>
              <div className="appointment-choice-list appointment-choice-grid">
                {branches.map((branch) => (
                  <button
                    key={branch.id}
                    type="button"
                    className={values.branchId === branch.id ? 'is-selected' : ''}
                    onClick={() => onChange({ ...values, branchId: branch.id, providerId: '', startTime: '' })}
                  >
                    <strong>{branch.name}</strong>
                    <span>{branch.city}, {branch.province} - {formatAppointmentTime(branch.openingTime)} to {formatAppointmentTime(branch.closingTime)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="form-section">
              <h3>Service</h3>
              <div className="appointment-choice-list">
                {activeServices.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    className={values.serviceId === service.id ? 'is-selected' : ''}
                    onClick={() => handleServiceChange(service.id)}
                  >
                    <strong>{service.name}</strong>
                    <span>{service.duration} min - {service.price > 0 ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(service.price / 100) : 'Price to be confirmed'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="form-section">
              <h3>Dentist</h3>
              <div className="appointment-choice-list appointment-choice-grid">
                <button type="button" className={!values.providerId ? 'is-selected' : ''} onClick={() => onChange({ ...values, providerId: '', startTime: '' })}>
                  <strong>Any available dentist</strong>
                  <span>The slot list will show eligible dentists for the selected branch.</span>
                </button>
                {providers.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    className={values.providerId === provider.id ? 'is-selected' : ''}
                    onClick={() => onChange({ ...values, providerId: provider.id, startTime: '' })}
                  >
                    <strong>{provider.displayName}</strong>
                    <span>{provider.role.replace('_', ' ')}</span>
                  </button>
                ))}
                {values.branchId && providers.length === 0 && <div className="empty-inline">No active dentists assigned to this branch.</div>}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="form-section">
              <h3>Date & available time</h3>
              <Input
                label="Date"
                type="date"
                value={values.date}
                onChange={(event) => onChange({ ...values, date: event.target.value, startTime: '' })}
                required
              />
              {values.branchId && values.serviceId && values.date ? (
                <div className="appointment-slot-grid">
                  {availableSlots.map((slot) => (
                    <button
                      key={`${slot.providerId}-${slot.startTime}`}
                      type="button"
                      className={values.startTime === slot.startTime && values.providerId === slot.providerId ? 'is-selected' : ''}
                      onClick={() => chooseSlot(slot.startTime, slot.providerId)}
                    >
                      <CalendarDays size={15} />
                      <strong>{formatAppointmentTime(slot.startTime)}</strong>
                      <span>{slot.providerName}</span>
                    </button>
                  ))}
                  {availableSlots.length === 0 && <div className="empty-inline">No available slots for this date and selection.</div>}
                </div>
              ) : (
                <div className="empty-inline">Choose branch, service and date to calculate availability.</div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="form-section">
              <h3>Review</h3>
              <div className="appointment-review-grid">
                <div><span>Branch</span><strong>{selectedBranch?.name ?? 'No branch selected'}</strong></div>
                <div><span>Service</span><strong>{selectedService?.name ?? 'No service selected'}</strong></div>
                <div><span>Dentist</span><strong>{selectedProvider?.displayName ?? 'No dentist selected'}</strong></div>
                <div><span>Time</span><strong>{values.startTime ? `${formatAppointmentTime(values.startTime)} - ${formatAppointmentTime(values.endTime)}` : 'No time selected'}</strong></div>
                <div><span>Duration</span><strong>{selectedService?.duration ?? 0} minutes</strong></div>
                <div><span>Estimated price</span><strong>{selectedService?.price ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(selectedService.price / 100) : 'Price to be confirmed'}</strong></div>
              </div>
              <Textarea
                label="Reason for visit"
                value={values.reasonForVisit ?? ''}
                onChange={(event) => onChange({ ...values, reasonForVisit: event.target.value, notes: event.target.value })}
              />
              <Textarea
                label="Internal notes"
                value={values.internalNotes ?? ''}
                onChange={(event) => onChange({ ...values, internalNotes: event.target.value })}
              />
            </div>
          )}

          {error && (
            <div className="inline-alert" role="alert">
              <span>{error}</span>
            </div>
          )}

          {conflictError && (
            <div className="inline-alert" role="alert">
              <span>{conflictError}</span>
            </div>
          )}

          <div className="modal-actions">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            {step > 0 && (
              <Button variant="secondary" type="button" onClick={() => setStep((current) => Math.max(current - 1, 0))}>
                Back
              </Button>
            )}
            {step < steps.length - 1 ? (
              <Button type="button" disabled={!canContinue()} onClick={() => setStep((current) => Math.min(current + 1, steps.length - 1))}>
                Continue
              </Button>
            ) : (
            <Button type="submit" disabled={Boolean(conflictError)}>
              Confirm booking
            </Button>
            )}
          </div>
        </form>
      </section>
    </div>
  )
}
