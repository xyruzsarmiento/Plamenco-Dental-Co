import type { FormEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import type { Patient } from '../patients/patientTypes'
import type { Service } from '../services/serviceTypes'
import type { AppointmentFormValues } from './appointmentTypes'

type AppointmentFormModalProps = {
  patients: Patient[]
  services: Service[]
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
  services,
  values,
}: AppointmentFormModalProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  const selectedService = services.find((service) => service.id === values.serviceId)

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
      endTime,
    })
  }

  function handleTimeChange(time: string) {
    if (!selectedService) {
      onChange({ ...values, startTime: time })
      return
    }

    const [hour, minute] = time.split(':').map(Number)
    const endDate = new Date()
    endDate.setHours(hour, minute + selectedService.duration, 0, 0)
    const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`

    onChange({
      ...values,
      startTime: time,
      endTime,
    })
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
            <p className="eyebrow">Quick scheduling</p>
            <h2 id="appointment-modal-title">Create appointment</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close appointment form" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          <div className="form-section">
            <h3>Patient & service</h3>
            <div className="form-grid">
              <Select
                label="Patient"
                value={values.patientId}
                onChange={(event) => onChange({ ...values, patientId: event.target.value })}
                options={patients.map((patient) => ({
                  label: `${patient.firstName} ${patient.lastName} (${patient.patientId})`,
                  value: patient.id,
                }))}
              />
              <Select
                label="Service"
                value={values.serviceId}
                onChange={(event) => handleServiceChange(event.target.value)}
                options={services.map((service) => ({
                  label: `${service.name} (${service.duration} min)`,
                  value: service.id,
                }))}
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Date & time</h3>
            <div className="form-grid">
              <Input
                label="Date"
                type="date"
                value={values.date}
                onChange={(event) => onChange({ ...values, date: event.target.value })}
                required
              />
              <Input
                label="Time"
                type="time"
                value={values.startTime}
                onChange={(event) => handleTimeChange(event.target.value)}
                required
              />
            </div>
            {selectedService && (
              <div className="info-item appointment-summary-row">
                <span className="label">Visit length</span>
                <span className="value">{selectedService.duration} minutes</span>
              </div>
            )}
          </div>

          <div className="form-section">
            <Textarea
              label="Notes"
              value={values.notes}
              onChange={(event) => onChange({ ...values, notes: event.target.value })}
            />
          </div>

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
            <Button type="submit" disabled={Boolean(conflictError)}>
              Confirm booking
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
