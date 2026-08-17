import type { FormEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import type { DentalRecordFormValues } from './dentalRecordTypes'

type DentalRecordFormModalProps = {
  error: string | null
  patientName: string
  values: DentalRecordFormValues
  isSubmitting?: boolean
  successMessage?: string | null
  onChange: (values: DentalRecordFormValues) => void
  onClose: () => void
  onSubmit: () => void
}

export function DentalRecordFormModal({
  error,
  isSubmitting = false,
  successMessage,
  onChange,
  onClose,
  onSubmit,
  patientName,
  values,
}: DentalRecordFormModalProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal patient-modal" aria-labelledby="dental-record-modal-title" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Clinical visit</p>
            <h2 id="dental-record-modal-title">Dental record</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close dental record form" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          <div className="form-section">
            <h3>Patient</h3>
            <div className="form-grid">
              <Input label="Patient" value={patientName} disabled />
              <Input
                label="Record date"
                type="date"
                value={values.recordDate}
                onChange={(event) => onChange({ ...values, recordDate: event.target.value })}
                required
              />
              <Select
                label="Visit type"
                value={values.visitType}
                onChange={(event) =>
                  onChange({ ...values, visitType: event.target.value as DentalRecordFormValues['visitType'] })
                }
                options={[
                  { label: 'Consultation', value: 'consultation' },
                  { label: 'Cleaning', value: 'cleaning' },
                  { label: 'Filling', value: 'filling' },
                  { label: 'Extraction', value: 'extraction' },
                  { label: 'Root canal', value: 'root_canal' },
                  { label: 'Crown', value: 'crown' },
                  { label: 'Follow-up', value: 'follow_up' },
                  { label: 'Other', value: 'other' },
                ]}
              />
              <Select
                label="Status"
                value={values.status}
                onChange={(event) =>
                  onChange({ ...values, status: event.target.value as DentalRecordFormValues['status'] })
                }
                options={[
                  { label: 'Draft', value: 'draft' },
                  { label: 'Finalized', value: 'finalized' },
                  { label: 'Amended', value: 'amended' },
                  { label: 'Voided', value: 'voided' },
                ]}
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Clinical summary</h3>
            <div className="form-grid">
              <Input
                label="Chief complaint"
                value={values.chiefComplaint}
                onChange={(event) => onChange({ ...values, chiefComplaint: event.target.value })}
                required
              />
              <Input
                label="Follow-up date"
                type="date"
                value={values.followUpDate}
                onChange={(event) => onChange({ ...values, followUpDate: event.target.value })}
              />
            </div>
            <Textarea
              label="Assessment"
              value={values.assessment}
              onChange={(event) => onChange({ ...values, assessment: event.target.value, diagnosis: event.target.value })}
              required
            />
            <Textarea
              label="Clinical findings"
              value={values.clinicalFindings}
              onChange={(event) => onChange({ ...values, clinicalFindings: event.target.value, findings: event.target.value })}
            />
            <Textarea
              label="Recommendations"
              value={values.recommendations}
              onChange={(event) => onChange({ ...values, recommendations: event.target.value, treatmentPlan: event.target.value })}
            />
            <Textarea
              label="Treatment performed"
              value={values.treatmentPerformed}
              onChange={(event) => onChange({ ...values, treatmentPerformed: event.target.value, treatmentNotes: event.target.value })}
            />
            <Textarea
              label="Clinical notes"
              value={values.clinicalNotes}
              onChange={(event) => onChange({ ...values, clinicalNotes: event.target.value })}
            />
          </div>

          {error && (
            <div className="inline-alert" role="alert">
              <span>{error}</span>
            </div>
          )}

          {successMessage && !error && (
            <div className="success-alert" role="status">
              <span>{successMessage}</span>
            </div>
          )}

          <div className="modal-actions">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save record'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
