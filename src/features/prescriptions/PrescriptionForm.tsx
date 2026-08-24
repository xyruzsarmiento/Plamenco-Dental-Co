import { Printer } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'

type PrescriptionFormProps = {
  values: {
    medication: string
    dosage: string
    frequency: string
    duration: string
    instructions: string
    prescribedBy: string
    prescriptionDate: string
    notes: string
  }
  onChange: (values: PrescriptionFormProps['values']) => void
  onSubmit: () => void
  onPrint: () => void
  disabled?: boolean
}

export function PrescriptionForm({ values, onChange, onSubmit, onPrint, disabled }: PrescriptionFormProps) {
  return (
    <div className="prescription-form">
      <div className="form-grid">
        <Input
          label="Medication"
          value={values.medication}
          onChange={(event) => onChange({ ...values, medication: event.target.value })}
          disabled={disabled}
        />
        <Input
          label="Dosage"
          value={values.dosage}
          onChange={(event) => onChange({ ...values, dosage: event.target.value })}
          disabled={disabled}
        />
        <Input
          label="Frequency"
          value={values.frequency}
          onChange={(event) => onChange({ ...values, frequency: event.target.value })}
          disabled={disabled}
        />
        <Input
          label="Duration"
          value={values.duration}
          onChange={(event) => onChange({ ...values, duration: event.target.value })}
          disabled={disabled}
        />
        <Input
          label="Prescription date"
          type="date"
          value={values.prescriptionDate}
          onChange={(event) => onChange({ ...values, prescriptionDate: event.target.value })}
          disabled={disabled}
        />
      </div>

      <Textarea
        label="Instructions"
        value={values.instructions}
        onChange={(event) => onChange({ ...values, instructions: event.target.value })}
        disabled={disabled}
      />

      <Textarea
        label="Notes"
        value={values.notes}
        onChange={(event) => onChange({ ...values, notes: event.target.value })}
        disabled={disabled}
      />

      <Input
        label="Prescribed by"
        value={values.prescribedBy}
        onChange={() => undefined}
        disabled
      />

      <div className="modal-actions">
        <Button variant="secondary" onClick={onPrint} icon={<Printer size={16} />} disabled={disabled}>
          Print
        </Button>
        <Button onClick={onSubmit} disabled={disabled}>Save prescription</Button>
      </div>
    </div>
  )
}
