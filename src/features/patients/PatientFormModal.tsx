import type { FormEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import type { PatientFormMode, PatientFormValues } from './patientTypes'

type PatientFormModalProps = {
  error: string | null
  mode: PatientFormMode
  values: PatientFormValues
  onChange: (values: PatientFormValues) => void
  onClose: () => void
  onSubmit: () => void
}

export function PatientFormModal({
  error,
  mode,
  onChange,
  onClose,
  onSubmit,
  values,
}: PatientFormModalProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal patient-modal"
        aria-labelledby="patient-modal-title"
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">{mode === 'add' ? 'New patient' : 'Edit patient'}</p>
            <h2 id="patient-modal-title">{mode === 'add' ? 'Add patient' : 'Edit patient'}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close patient form" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          <div className="form-section">
            <h3>Personal information</h3>
            <div className="form-grid">
              <Input
                label="First name"
                value={values.firstName}
                onChange={(event) => onChange({ ...values, firstName: event.target.value })}
                required
              />
              <Input
                label="Middle name"
                value={values.middleName}
                onChange={(event) => onChange({ ...values, middleName: event.target.value })}
              />
              <Input
                label="Last name"
                value={values.lastName}
                onChange={(event) => onChange({ ...values, lastName: event.target.value })}
                required
              />
              <Input
                label="Date of birth"
                type="date"
                value={values.dateOfBirth}
                onChange={(event) => onChange({ ...values, dateOfBirth: event.target.value })}
                required
              />
              <Select
                label="Sex"
                value={values.sex}
                onChange={(event) =>
                  onChange({ ...values, sex: event.target.value as PatientFormValues['sex'] })
                }
                options={[
                  { label: 'Female', value: 'female' },
                  { label: 'Male', value: 'male' },
                  { label: 'Other', value: 'other' },
                  { label: 'Prefer not to say', value: 'prefer_not_to_say' },
                ]}
              />
              <Select
                label="Status"
                value={values.status}
                onChange={(event) =>
                  onChange({ ...values, status: event.target.value as PatientFormValues['status'] })
                }
                options={[
                  { label: 'Active', value: 'active' },
                  { label: 'Inactive', value: 'inactive' },
                ]}
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Contact information</h3>
            <div className="form-grid">
              <Input
                label="Phone"
                value={values.phone}
                onChange={(event) => onChange({ ...values, phone: event.target.value })}
                required
              />
              <Input
                label="Email"
                type="email"
                value={values.email}
                onChange={(event) => onChange({ ...values, email: event.target.value })}
              />
              <Input
                label="Emergency contact"
                value={values.emergencyContact}
                onChange={(event) => onChange({ ...values, emergencyContact: event.target.value })}
                required
              />
              <Input
                label="Emergency contact phone"
                value={values.emergencyContactPhone}
                onChange={(event) => onChange({ ...values, emergencyContactPhone: event.target.value })}
                required
              />
            </div>
            <Textarea
              label="Address"
              value={values.address}
              onChange={(event) => onChange({ ...values, address: event.target.value })}
              required
            />
          </div>

          <div className="form-section">
            <h3>Medical information</h3>
            <div className="form-grid">
              <Textarea
                label="Allergies"
                value={values.allergies}
                onChange={(event) => onChange({ ...values, allergies: event.target.value })}
              />
              <Textarea
                label="Medical conditions"
                value={values.medicalConditions}
                onChange={(event) => onChange({ ...values, medicalConditions: event.target.value })}
              />
              <Textarea
                label="Current medications"
                value={values.currentMedications}
                onChange={(event) => onChange({ ...values, currentMedications: event.target.value })}
              />
              <Textarea
                label="Previous surgeries"
                value={values.previousSurgeries}
                onChange={(event) => onChange({ ...values, previousSurgeries: event.target.value })}
              />
            </div>
            <Textarea
              label="Medical notes"
              value={values.medicalNotes}
              onChange={(event) => onChange({ ...values, medicalNotes: event.target.value })}
            />
          </div>

          {error && (
            <div className="inline-alert" role="alert">
              <span>{error}</span>
            </div>
          )}

          <div className="modal-actions">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{mode === 'add' ? 'Create patient' : 'Save changes'}</Button>
          </div>
        </form>
      </section>
    </div>
  )
}
