import { useEffect, useState, type FormEvent } from 'react'
import { CalendarDays, CircleDollarSign, Stethoscope, UserRound, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import type { Branch } from '../branches/branchTypes'
import type { Provider } from '../dentists/dentistTypes'
import type { Patient } from '../patients/patientTypes'
import { servicePriceToCents } from '../services/serviceStore'
import type { Service } from '../services/serviceTypes'
import type { TreatmentFormValues, TreatmentStatus } from './treatmentTypes'

type Props = {
  mode: 'add' | 'edit'
  patient: Patient
  services: Service[]
  branches: Branch[]
  providers: Provider[]
  initialValues: TreatmentFormValues
  onClose: () => void
  onSubmit: (values: TreatmentFormValues) => Promise<void> | void
}

const statuses: TreatmentStatus[] = ['planned', 'scheduled', 'in_progress', 'completed', 'cancelled', 'voided']

export function TreatmentFormDrawerV12({ mode, patient, services, branches, providers, initialValues, onClose, onSubmit }: Props) {
  const [values, setValues] = useState(initialValues)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setValues(initialValues)
    setError(null)
  }, [initialValues])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    if (!values.serviceId) return setError('Please select a service.')
    if (!values.description.trim()) return setError('Treatment description is required.')
    if (!values.treatmentDate) return setError('Treatment date is required.')
    setError(null)
    setIsSubmitting(true)
    try {
      await onSubmit(values)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Treatment could not be saved.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function chooseService(serviceId: string) {
    const service = services.find((item) => item.id === serviceId)
    const priceCents = service ? servicePriceToCents(service.price) : values.priceSnapshotCents
    setValues((current) => ({
      ...current,
      serviceId,
      serviceNameSnapshot: service?.name ?? current.serviceNameSnapshot,
      priceSnapshotCents: priceCents,
      cost: service?.price ?? current.cost,
    }))
  }

  function chooseProvider(providerId: string) {
    const provider = providers.find((item) => item.id === providerId)
    setValues((current) => ({ ...current, providerId, providerNameSnapshot: provider?.displayName ?? '', performedBy: provider?.displayName ?? current.performedBy }))
  }

  return (
    <div className="tx12-modal-backdrop" onMouseDown={(event) => !isSubmitting && event.target === event.currentTarget && onClose()}>
      <section className="tx12-modal" role="dialog" aria-modal="true" aria-labelledby="tx12-modal-title">
        <header className="tx12-modal-head">
          <div className="tx12-modal-identity">
            <span>{patient.firstName.charAt(0)}{patient.lastName.charAt(0)}</span>
            <div><small>{mode === 'add' ? 'New treatment' : 'Edit treatment'}</small><h2 id="tx12-modal-title">{patient.firstName} {patient.lastName}</h2><p>{patient.patientId}</p></div>
          </div>
          <button type="button" aria-label="Close treatment editor" onClick={onClose} disabled={isSubmitting}><X size={20}/></button>
        </header>

        <form onSubmit={(event) => void submit(event)} className="tx12-modal-form">
          {error && <div className="tx12-form-error" role="alert">{error}</div>}

          <section className="tx12-form-section">
            <div className="tx12-form-title"><Stethoscope size={18}/><div><span>Procedure</span><h3>Treatment details</h3></div></div>
            <div className="tx12-form-grid">
              <label className="wide"><span>Service</span><select disabled={isSubmitting} value={values.serviceId} onChange={(e)=>chooseService(e.target.value)}><option value="">Select service</option>{services.map((service)=><option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
              <label className="wide"><span>Description</span><input disabled={isSubmitting} value={values.description} onChange={(e)=>setValues({...values,description:e.target.value})} placeholder="Describe the procedure or treatment"/></label>
              <label><span>Treatment date</span><input disabled={isSubmitting} type="date" value={values.treatmentDate} onChange={(e)=>setValues({...values,treatmentDate:e.target.value})}/></label>
              <label><span>Status</span><select disabled={isSubmitting} value={values.status} onChange={(e)=>setValues({...values,status:e.target.value as TreatmentStatus})}>{statuses.map((status)=><option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</select></label>
            </div>
          </section>

          <section className="tx12-form-section">
            <div className="tx12-form-title"><UserRound size={18}/><div><span>Clinical context</span><h3>Provider and location</h3></div></div>
            <div className="tx12-form-grid">
              <label><span>Branch</span><select disabled={isSubmitting} value={values.branchId ?? ''} onChange={(e)=>setValues({...values,branchId:e.target.value})}><option value="">No branch selected</option>{branches.map((branch)=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
              <label><span>Dentist / provider</span><select disabled={isSubmitting} value={values.providerId ?? ''} onChange={(e)=>chooseProvider(e.target.value)}><option value="">No provider selected</option>{providers.filter((provider)=>provider.status==='active').map((provider)=><option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select></label>
              <label><span>Tooth number</span><input disabled={isSubmitting} type="number" min="1" max="32" value={values.toothNumber ?? ''} onChange={(e)=>setValues({...values,toothNumber:e.target.value?Number(e.target.value):undefined})} placeholder="Optional"/></label>
              <label><span>Appointment number</span><input disabled={isSubmitting} value={values.appointmentNumber ?? ''} onChange={(e)=>setValues({...values,appointmentNumber:e.target.value})} placeholder="Optional link"/></label>
            </div>
          </section>

          <section className="tx12-form-section">
            <div className="tx12-form-title"><CircleDollarSign size={18}/><div><span>Value</span><h3>Treatment value</h3></div></div>
            <div className="tx12-form-grid">
              <label><span>Configured price (PHP)</span><input disabled={isSubmitting} type="number" min="0" step="0.01" value={values.priceSnapshotCents/100} onChange={(e)=>{const pesos=Number(e.target.value)||0;setValues({...values,priceSnapshotCents:Math.round(pesos*100),cost:pesos})}}/></label>
              <label><span>Quantity</span><input disabled={isSubmitting} type="number" min="1" value={values.quantity} onChange={(e)=>setValues({...values,quantity:Math.max(1,Number(e.target.value)||1)})}/></label>
              <div className="tx12-price-preview"><span>Estimated treatment value</span><strong>{new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format((values.priceSnapshotCents*Math.max(1,values.quantity))/100)}</strong><small>This is treatment value, not an invoice or payment.</small></div>
            </div>
          </section>

          <section className="tx12-form-section">
            <div className="tx12-form-title"><CalendarDays size={18}/><div><span>Documentation</span><h3>Clinical notes</h3></div></div>
            <label className="tx12-notes"><span>Notes</span><textarea disabled={isSubmitting} rows={5} value={values.notes} onChange={(e)=>setValues({...values,notes:e.target.value})} placeholder="Clinical notes, observations, follow-up context..."/></label>
          </section>

          <footer className="tx12-modal-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : mode === 'add' ? 'Create treatment' : 'Save changes'}</Button></footer>
        </form>
      </section>
    </div>
  )
}
