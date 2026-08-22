import { useMemo, useState } from 'react'
import { FilePlus2, Plus, ReceiptText, Trash2, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import {
  createInvoice,
  formatCurrency,
  getStoredCharges,
  type InvoiceItem,
} from './billingStore'
import { getStoredBranches } from '../branches/branchStore'
import { getStoredPatients } from '../patients/patientStore'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

function manilaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

type DraftLine = {
  key: string
  description: string
  quantity: string
  unitPrice: string
  chargeId?: string
  serviceId?: string
  providerId?: string
  providerNameSnapshot?: string
  branchId?: string
}

function emptyLine(): DraftLine {
  return {
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: '',
    quantity: '1',
    unitPrice: '',
  }
}

async function confirmRemoteInvoice(invoiceNumber: string, patientDbId: string, totalCents: number) {
  if (!isSupabaseConfigured || !supabase) return
  let lastError = ''
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from('invoices')
      .select('id,invoice_number,patient_id,total_cents')
      .eq('invoice_number', invoiceNumber)
      .maybeSingle()
    if (!error && data) {
      if (String(data.patient_id) !== patientDbId) throw new Error('The saved invoice is linked to the wrong patient record.')
      if (Number(data.total_cents) !== totalCents) throw new Error('The saved invoice total does not match the submitted invoice.')
      return
    }
    lastError = error?.message ?? 'The invoice was not returned by Supabase.'
    if (attempt < 4) await new Promise((resolve) => window.setTimeout(resolve, 180 * (attempt + 1)))
  }
  throw new Error(`Invoice database confirmation failed: ${lastError}`)
}

export function InvoiceCreatorButtonV32({ onSuccess }: { onSuccess?: (invoiceId: string) => void }) {
  const [open, setOpen] = useState(false)
  const [patientId, setPatientId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(manilaDate())
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()])
  const [selectedCharges, setSelectedCharges] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const patients = getStoredPatients()
  const branches = getStoredBranches().filter((branch) => branch.status === 'active')
  const selectedPatient = patients.find((patient) => patient.id === patientId || patient.patientId === patientId)
  const eligibleCharges = useMemo(
    () => getStoredCharges().filter((charge) => {
      if (charge.status !== 'unbilled') return false
      if (!patientId) return true
      return charge.patientId === selectedPatient?.id || charge.patientId === selectedPatient?.patientId
    }),
    [patientId, open, selectedPatient?.id, selectedPatient?.patientId],
  )

  const previewItems = useMemo<InvoiceItem[]>(() => {
    const chargeItems: InvoiceItem[] = selectedCharges.flatMap((chargeId) => {
      const charge = eligibleCharges.find((entry) => entry.id === chargeId)
      if (!charge) return []
      return [{
        id: `preview-${charge.id}`,
        chargeId: charge.id,
        treatmentId: charge.treatmentId,
        serviceId: charge.serviceId,
        providerId: charge.providerId,
        providerNameSnapshot: charge.providerNameSnapshot,
        branchId: charge.branchId,
        description: charge.description,
        quantity: charge.quantity,
        unitPriceCents: charge.unitPriceCents,
        discountCents: charge.discountCents,
      }]
    })

    const manualItems: InvoiceItem[] = lines.flatMap((line) => {
      const quantity = Number(line.quantity)
      const pesos = Number(line.unitPrice)
      if (!line.description.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(pesos) || pesos < 0) return []
      return [{
        id: line.key,
        description: line.description.trim(),
        quantity: Math.max(1, Math.floor(quantity)),
        unitPriceCents: Math.round(pesos * 100),
        discountCents: 0,
        branchId: branchId || undefined,
      }]
    })

    return [...chargeItems, ...manualItems]
  }, [branchId, eligibleCharges, lines, selectedCharges])

  const totalCents = previewItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents - (item.discountCents ?? 0), 0)

  function reset() {
    setPatientId('')
    setBranchId('')
    setInvoiceDate(manilaDate())
    setDueDate('')
    setNotes('')
    setLines([emptyLine()])
    setSelectedCharges([])
    setError(null)
    setSubmitting(false)
  }

  function close() {
    if (submitting) return
    setOpen(false)
    reset()
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line))
  }

  function toggleCharge(chargeId: string) {
    setSelectedCharges((current) => current.includes(chargeId) ? current.filter((id) => id !== chargeId) : [...current, chargeId])
  }

  async function submit() {
    setError(null)
    if (!patientId || !selectedPatient) return setError('Select a patient before creating the invoice.')
    if (!invoiceDate) return setError('Invoice date is required.')
    if (!previewItems.length) return setError('Add at least one valid invoice line or unbilled charge.')

    const invalidManualLine = lines.some((line) => {
      const hasAnyValue = Boolean(line.description.trim() || line.unitPrice.trim())
      if (!hasAnyValue) return false
      const quantity = Number(line.quantity)
      const price = Number(line.unitPrice)
      return !line.description.trim() || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0
    })
    if (invalidManualLine) return setError('Complete each manual line with a description, positive whole-number quantity, and valid price.')

    try {
      setSubmitting(true)
      const invoice = createInvoice({
        patientId: selectedPatient.id,
        branchId: branchId || undefined,
        invoiceDate,
        dueDate: dueDate || undefined,
        items: previewItems.map((item, index) => ({ ...item, id: `item-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}` })),
        notes: notes.trim(),
      })
      await confirmRemoteInvoice(invoice.invoiceNumber, selectedPatient.id, invoice.totalCents)
      onSuccess?.(invoice.id)
      setOpen(false)
      reset()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create the invoice.')
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button icon={<FilePlus2 size={16} />} onClick={() => setOpen(true)}>New invoice</Button>
      {open && (
        <div className="modal-backdrop inv32-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
          <section className="inv32-modal" role="dialog" aria-modal="true" aria-labelledby="inv32-title">
            <header className="inv32-header">
              <div className="inv32-title-block">
                <span className="inv32-icon"><ReceiptText size={20} /></span>
                <div><span className="inv32-kicker">Invoice creation</span><h2 id="inv32-title">Create patient invoice</h2><p>Build an invoice from unbilled clinical charges or manual line items.</p></div>
              </div>
              <button type="button" className="inv32-close" onClick={close} aria-label="Close invoice creator"><X size={18} /></button>
            </header>

            <div className="inv32-body">
              <main className="inv32-form-column">
                <section className="inv32-section">
                  <div className="inv32-section-head"><span>1</span><div><h3>Patient & billing context</h3><p>Select who the invoice belongs to and where it was issued.</p></div></div>
                  <div className="inv32-grid inv32-grid-2">
                    <label><span>Patient</span><select value={patientId} onChange={(event) => { setPatientId(event.target.value); setSelectedCharges([]) }}><option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.firstName} {patient.lastName} · {patient.patientId}</option>)}</select></label>
                    <label><span>Branch</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Unassigned branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
                    <label><span>Invoice date</span><input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} /></label>
                    <label><span>Due date</span><input type="date" min={invoiceDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
                  </div>
                </section>

                <section className="inv32-section">
                  <div className="inv32-section-head"><span>2</span><div><h3>Unbilled clinical charges</h3><p>Optional. Select existing unbilled charges for this patient; selected charges are marked invoiced by the existing billing engine.</p></div></div>
                  {!patientId ? <div className="inv32-soft-empty">Select a patient to see eligible unbilled charges.</div> : eligibleCharges.length ? (
                    <div className="inv32-charge-list">{eligibleCharges.map((charge) => <label key={charge.id} className={selectedCharges.includes(charge.id) ? 'is-selected' : ''}><input type="checkbox" checked={selectedCharges.includes(charge.id)} onChange={() => toggleCharge(charge.id)} /><div><strong>{charge.description}</strong><span>{charge.providerNameSnapshot || 'Provider not recorded'} · Qty {charge.quantity}</span></div><b>{formatCurrency(charge.finalAmountCents)}</b></label>)}</div>
                  ) : <div className="inv32-soft-empty">No unbilled charges are available for this patient.</div>}
                </section>

                <section className="inv32-section">
                  <div className="inv32-section-head inv32-section-head-action"><div className="inv32-section-head-copy"><span>3</span><div><h3>Manual invoice lines</h3><p>Add services or adjustments that are not represented by an existing charge.</p></div></div><Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setLines((current) => [...current, emptyLine()])}>Add line</Button></div>
                  <div className="inv32-lines">{lines.map((line, index) => <div className="inv32-line" key={line.key}><div className="inv32-line-index">{index + 1}</div><label className="inv32-line-description"><span>Description</span><input value={line.description} onChange={(event) => updateLine(line.key, { description: event.target.value })} placeholder="e.g. Professional cleaning" /></label><label><span>Qty</span><input type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} /></label><label><span>Price (PHP)</span><input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })} placeholder="0.00" /></label><button type="button" className="inv32-remove" onClick={() => setLines((current) => current.length === 1 ? [emptyLine()] : current.filter((entry) => entry.key !== line.key))} aria-label={`Remove line ${index + 1}`}><Trash2 size={16} /></button></div>)}</div>
                </section>

                <section className="inv32-section">
                  <div className="inv32-section-head"><span>4</span><div><h3>Internal note</h3><p>Optional note stored with the invoice record.</p></div></div>
                  <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add billing notes or context..." />
                </section>

                {error && <div className="inv32-error" role="alert">{error}</div>}
              </main>

              <aside className="inv32-summary-column">
                <div className="inv32-summary-card"><span className="inv32-kicker">Invoice preview</span><h3>{selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : 'No patient selected'}</h3><div className="inv32-summary-metrics"><div><span>Charge lines</span><strong>{selectedCharges.length}</strong></div><div><span>Manual lines</span><strong>{previewItems.length - selectedCharges.length}</strong></div><div className="is-total"><span>Invoice total</span><strong>{formatCurrency(totalCents)}</strong></div></div></div>
                <div className="inv32-trust-card"><FilePlus2 size={18} /><div><strong>Billing source of truth</strong><p>The invoice is confirmed in Supabase before this dialog reports success.</p></div></div>
              </aside>
            </div>

            <footer className="inv32-footer"><div><span>Total due</span><strong>{formatCurrency(totalCents)}</strong></div><div className="inv32-footer-actions"><Button variant="secondary" onClick={close} disabled={submitting}>Cancel</Button><Button onClick={() => void submit()} disabled={submitting || !patientId || previewItems.length === 0}>{submitting ? 'Saving to database…' : 'Create invoice'}</Button></div></footer>
          </section>
        </div>
      )}
    </>
  )
}
