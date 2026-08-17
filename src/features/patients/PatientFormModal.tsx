import type { FormEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { getStoredBranches } from '../branches/branchStore'
import type { PotentialPatientDuplicate } from './patientStore'
import type { PatientFormMode, PatientFormValues } from './patientTypes'

const duplicateSignalLabels: Record<string, string> = {
  patient_number: 'patient number',
  email: 'email',
  phone: 'phone',
  name_dob: 'name and birth date',
  name_phone: 'name and phone',
  full_name_dob: 'full name and birth date',
}

type PatientFormModalProps = {
  error: string | null
  mode: PatientFormMode
  values: PatientFormValues
  onChange: (values: PatientFormValues) => void
  onClose: () => void
  onSubmit: () => void
  duplicateMatches?: PotentialPatientDuplicate[]
  onOpenDuplicate?: (patientId: string) => void
  onContinueDuplicate?: () => void
}

export function PatientFormModal({
  error,
  mode,
  onChange,
  onClose,
  onSubmit,
  duplicateMatches = [],
  onOpenDuplicate,
  onContinueDuplicate,
  values,
}: PatientFormModalProps) {
  const branches = getStoredBranches()

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
              />
              <Input
                label="Relationship"
                value={values.emergencyContactRelationship ?? ''}
                onChange={(event) => onChange({ ...values, emergencyContactRelationship: event.target.value })}
              />
              <Input
                label="Emergency contact phone"
                value={values.emergencyContactPhone}
                onChange={(event) => onChange({ ...values, emergencyContactPhone: event.target.value })}
              />
              <Input
                label="City / Municipality"
                value={values.city ?? ''}
                onChange={(event) => onChange({ ...values, city: event.target.value })}
              />
              <Input
                label="Province"
                value={values.province ?? ''}
                onChange={(event) => onChange({ ...values, province: event.target.value })}
              />
            </div>
            <Textarea
              label="Address"
              value={values.address}
              onChange={(event) => onChange({ ...values, address: event.target.value })}
            />
          </div>

          <div className="form-section">
            <h3>Clinic</h3>
            <div className="form-grid">
              <Select
                label="Preferred branch"
                value={values.preferredBranchId ?? ''}
                onChange={(event) => onChange({ ...values, preferredBranchId: event.target.value })}
                options={[
                  { label: 'No preferred branch', value: '' },
                  ...branches.map((branch) => ({ label: branch.name, value: branch.id })),
                ]}
              />
              <Select
                label="Origin"
                value={values.origin ?? 'staff_created'}
                onChange={(event) =>
                  onChange({ ...values, origin: event.target.value as PatientFormValues['origin'] })
                }
                options={[
                  { label: 'Staff Created', value: 'staff_created' },
                  { label: 'Walk-in', value: 'walk_in' },
                  { label: 'Online Registration', value: 'online_registration' },
                  { label: 'Historical Import', value: 'historical_import' },
                ]}
              />
            </div>
            <Textarea
              label="Administrative notes"
              value={values.administrativeNotes ?? ''}
              onChange={(event) => onChange({ ...values, administrativeNotes: event.target.value })}
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

          {duplicateMatches.length > 0 && (
            <div className="duplicate-warning-panel">
              <h3>Possible existing patient</h3>
              <p>Review these matches before creating another patient record.</p>
              <div className="duplicate-match-list">
                {duplicateMatches.map((match) => (
                  <div key={match.patient.id} className="duplicate-match-row">
                    <div>
                      <strong>{match.patient.firstName} {match.patient.lastName}</strong>
                      <span>{match.patient.patientId} - {match.signals.map((signal) => duplicateSignalLabels[signal] ?? signal).join(', ')}</span>
                    </div>
                    <button type="button" className="text-button" onClick={() => onOpenDuplicate?.(match.patient.id)}>
                      Open existing
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onContinueDuplicate}>
                Continue creating new patient
              </button>
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
