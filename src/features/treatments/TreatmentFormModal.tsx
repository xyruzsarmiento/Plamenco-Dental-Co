import type { FormEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import type { TreatmentFormValues } from './treatmentTypes'

type TreatmentFormModalProps = {
  error: string | null
  patientName: string
  services: Array<{ value: string; label: string }>
  values: TreatmentFormValues
  onChange: (values: TreatmentFormValues) => void
  onClose: () => void
  onSubmit: () => void
}

export function TreatmentFormModal({
  error,
  onChange,
  onClose,
  onSubmit,
  patientName,
  services,
  values,
}: TreatmentFormModalProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal patient-modal" aria-labelledby="treatment-modal-title" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Treatment</p>
            <h2 id="treatment-modal-title">New treatment</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close treatment form" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          <div className="form-section">
            <h3>Patient</h3>
            <div className="form-grid">
              <Input label="Patient" value={patientName} disabled />
              <Input
                label="Treatment date"
                type="date"
                value={values.treatmentDate}
                onChange={(event) => onChange({ ...values, treatmentDate: event.target.value })}
                required
              />
              <Select
                label="Service"
                value={values.serviceId}
                onChange={(event) => onChange({ ...values, serviceId: event.target.value })}
                options={services}
              />
              <Input
                label="Tooth number"
                type="number"
                min={1}
                max={48}
                value={values.toothNumber ?? ''}
                onChange={(event) =>
                  onChange({
                    ...values,
                    toothNumber: event.target.value === '' ? undefined : Number(event.target.value),
                  })
                }
              />
              <Select
                label="Status"
                value={values.status}
                onChange={(event) =>
                  onChange({ ...values, status: event.target.value as TreatmentFormValues['status'] })
                }
                options={[
                  { label: 'Planned', value: 'planned' },
                  { label: 'Scheduled', value: 'scheduled' },
                  { label: 'In Progress', value: 'in_progress' },
                  { label: 'Completed', value: 'completed' },
                  { label: 'Cancelled', value: 'cancelled' },
                ]}
              />
              <Input
                label="Cost"
                type="number"
                min={0}
                step="0.01"
                value={values.cost}
                onChange={(event) => onChange({ ...values, cost: Number(event.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Treatment details</h3>
            <Textarea
              label="Description"
              value={values.description}
              onChange={(event) => onChange({ ...values, description: event.target.value })}
              required
            />
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

          <div className="modal-actions">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save treatment</Button>
          </div>
        </form>
      </section>
    </div>
  )
}
