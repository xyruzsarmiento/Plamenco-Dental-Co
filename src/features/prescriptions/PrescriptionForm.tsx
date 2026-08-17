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
  }
  onChange: (values: PrescriptionFormProps['values']) => void
  onSubmit: () => void
  onPrint: () => void
}

export function PrescriptionForm({ values, onChange, onSubmit, onPrint }: PrescriptionFormProps) {
  return (
    <div className="prescription-form">
      <div className="form-grid">
        <Input
          label="Medication"
          value={values.medication}
          onChange={(event) => onChange({ ...values, medication: event.target.value })}
        />
        <Input
          label="Dosage"
          value={values.dosage}
          onChange={(event) => onChange({ ...values, dosage: event.target.value })}
        />
        <Input
          label="Frequency"
          value={values.frequency}
          onChange={(event) => onChange({ ...values, frequency: event.target.value })}
        />
        <Input
          label="Duration"
          value={values.duration}
          onChange={(event) => onChange({ ...values, duration: event.target.value })}
        />
      </div>

      <Textarea
        label="Instructions"
        value={values.instructions}
        onChange={(event) => onChange({ ...values, instructions: event.target.value })}
      />

      <Input
        label="Prescribed by"
        value={values.prescribedBy}
        onChange={(event) => onChange({ ...values, prescribedBy: event.target.value })}
      />

      <div className="modal-actions">
        <Button variant="secondary" onClick={onPrint} icon={<Printer size={16} />}>
          Print
        </Button>
        <Button onClick={onSubmit}>Save prescription</Button>
      </div>
    </div>
  )
}
