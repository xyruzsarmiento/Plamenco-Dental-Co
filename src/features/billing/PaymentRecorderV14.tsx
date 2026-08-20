import { useMemo, useState } from 'react'
import { CheckCircle2, CreditCard, Landmark, Plus, ReceiptText, ShieldCheck, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import {
  applyPayment,
  formatCurrency,
  getActivePaymentMethods,
  getStoredInvoices,
  type Payment,
  type PaymentMethod,
} from './billingStore'
import { getStoredPatients } from '../patients/patientStore'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

type PaymentRecorderProps = {
  onClose: () => void
  onSuccess: () => void
}

async function confirmRemotePayment(payment: Payment) {
  if (!isSupabaseConfigured || !supabase) return

  let lastError = ''
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase
      .from('payments')
      .select('id,status,amount_cents,invoice_id')
      .eq('id', payment.id)
      .maybeSingle()

    if (!error && data) {
      if (data.status !== 'completed') throw new Error(`Payment was saved with status ${String(data.status).replaceAll('_', ' ')} instead of completed.`)
      if (Number(data.amount_cents) !== payment.amountCents || data.invoice_id !== payment.invoiceId) throw new Error('The saved payment does not match the submitted invoice or amount.')
      return
    }

    lastError = error?.message ?? 'The payment record was not returned by the database.'
    if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, 180 * (attempt + 1)))
  }

  throw new Error(`Database confirmation failed: ${lastError}`)
}

function todayManila() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

export function PaymentRecorderV14({ onClose, onSuccess }: PaymentRecorderProps) {
  const patients = useMemo(() => getStoredPatients(), [])
  const invoices = useMemo(() => getStoredInvoices(), [])
  const paymentMethods = useMemo(() => getActivePaymentMethods(), [])

  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [date, setDate] = useState(todayManila())
  const [reference, setReference] = useState('')
  const [recordedBy, setRecordedBy] = useState('Front desk')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const availableInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.patientId === selectedPatientId && invoice.balanceCents > 0 && invoice.status !== 'void'),
    [invoices, selectedPatientId],
  )
  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId)
  const selectedPatient = patients.find((patient) => patient.patientId === selectedPatientId)
  const selectedMethod = paymentMethods.find((entry) => entry.id === method)
  const amountNumber = Number(amount)
  const amountCents = Number.isFinite(amountNumber) ? Math.round(amountNumber * 100) : 0
  const requiresReference = Boolean(selectedMethod?.requiresReference)
  const exceedsBalance = Boolean(selectedInvoice && amountCents > selectedInvoice.balanceCents)
  const remainingAfterPayment = selectedInvoice ? Math.max(0, selectedInvoice.balanceCents - amountCents) : 0
  const isValid = Boolean(selectedPatientId && selectedInvoiceId && date && amountCents > 0 && selectedInvoice && !exceedsBalance && (!requiresReference || reference.trim()))

  function handlePatientChange(patientId: string) {
    setSelectedPatientId(patientId)
    setSelectedInvoiceId('')
    setAmount('')
    setReference('')
    setError(null)
    setSuccessMessage(null)
  }

  function handleInvoiceChange(invoiceId: string) {
    setSelectedInvoiceId(invoiceId)
    setAmount('')
    setError(null)
    setSuccessMessage(null)
  }

  async function handleSubmit() {
    if (loading) return
    if (!selectedInvoice) return setError('Select an outstanding invoice before recording a payment.')
    if (amountCents <= 0) return setError('Payment amount must be greater than zero.')
    if (amountCents > selectedInvoice.balanceCents) return setError(`Payment cannot exceed the outstanding balance of ${formatCurrency(selectedInvoice.balanceCents)}.`)
    if (requiresReference && !reference.trim()) return setError(`${selectedMethod?.label ?? 'This payment method'} requires a reference number.`)
    if (!date) return setError('Payment date is required.')

    setError(null)
    setSuccessMessage(null)
    setLoading(true)
    try {
      const payment = applyPayment({
        patientId: selectedPatientId,
        invoiceId: selectedInvoiceId,
        amountCents,
        paymentMethod: method,
        date,
        referenceNumber: reference.trim() || undefined,
        recordedBy: recordedBy.trim() || 'Front desk',
      })
      await confirmRemotePayment(payment)
      setSuccessMessage(`${formatCurrency(amountCents)} was recorded against ${selectedInvoice.invoiceNumber}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to record this payment.')
    } finally {
      setLoading(false)
    }
  }

  function finishSuccess() {
    onSuccess()
    onClose()
  }

  return (
    <section className="pay14-modal" role="dialog" aria-modal="true" aria-labelledby="pay14-title" onClick={(event) => event.stopPropagation()}>
      <header className="pay14-header">
        <div className="pay14-title-block">
          <span className="pay14-icon"><CreditCard size={20} /></span>
          <div>
            <span className="pay14-kicker">Verified in-clinic collection</span>
            <h2 id="pay14-title">Record payment</h2>
            <p>Apply a confirmed payment to one outstanding invoice.</p>
          </div>
        </div>
        <button type="button" className="pay14-close" onClick={successMessage ? finishSuccess : onClose} aria-label="Close record payment dialog" disabled={loading}><X size={19} /></button>
      </header>

      {successMessage ? (
        <div className="pay14-success">
          <span><CheckCircle2 size={34} /></span>
          <h3>Payment recorded</h3>
          <p>{successMessage}</p>
          <Button onClick={finishSuccess}>Return to billing</Button>
        </div>
      ) : (
        <div className="pay14-body">
          <div className="pay14-form-column">
            <section className="pay14-section">
              <div className="pay14-section-head"><span>01</span><div><h3>Patient & invoice</h3><p>Choose the account and outstanding invoice.</p></div></div>
              <div className="pay14-grid pay14-grid-2">
                <label><span>Patient</span><select value={selectedPatientId} onChange={(event) => handlePatientChange(event.target.value)} disabled={loading}><option value="">Select patient</option>{patients.map((patient) => <option key={patient.patientId} value={patient.patientId}>{patient.firstName} {patient.lastName} · {patient.patientId}</option>)}</select></label>
                <label><span>Invoice</span><select value={selectedInvoiceId} onChange={(event) => handleInvoiceChange(event.target.value)} disabled={loading || !selectedPatientId || availableInvoices.length === 0}><option value="">{selectedPatientId ? 'Select outstanding invoice' : 'Select patient first'}</option>{availableInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} · {formatCurrency(invoice.balanceCents)} due</option>)}</select></label>
              </div>
              {selectedPatientId && availableInvoices.length === 0 && <div className="pay14-note">This patient has no outstanding invoices.</div>}
            </section>

            <section className="pay14-section">
              <div className="pay14-section-head"><span>02</span><div><h3>Payment details</h3><p>Enter the amount, date, and collection method.</p></div></div>
              <div className="pay14-grid pay14-grid-2">
                <label><span>Amount (PHP)</span><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); setError(null) }} placeholder="0.00" disabled={!selectedInvoice || loading} /></label>
                <label><span>Payment date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={loading} /></label>
                <label className="pay14-span-2"><span>Payment method</span><select value={method} onChange={(event) => { setMethod(event.target.value as PaymentMethod); setReference(''); setError(null) }} disabled={loading}>{paymentMethods.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
              </div>
              {selectedInvoice && <div className={`pay14-amount-hint ${exceedsBalance ? 'is-error' : ''}`}>Maximum payment: {formatCurrency(selectedInvoice.balanceCents)}. Partial payments are allowed.</div>}
            </section>

            <section className="pay14-section">
              <div className="pay14-section-head"><span>03</span><div><h3>Collection reference</h3><p>Keep the audit trail tied to the actual transaction.</p></div></div>
              <div className="pay14-grid pay14-grid-2">
                <label><span>{requiresReference ? 'Reference number' : 'Reference number (optional)'}</span><input value={reference} onChange={(event) => { setReference(event.target.value); setError(null) }} placeholder="Check no., transaction ID, etc." disabled={loading} /></label>
                <label><span>Recorded by</span><input value={recordedBy} onChange={(event) => setRecordedBy(event.target.value)} disabled={loading} /></label>
              </div>
            </section>

            {error && <div className="pay14-error" role="alert">{error}</div>}
          </div>

          <aside className="pay14-summary-column">
            <div className="pay14-summary-card">
              <span className="pay14-summary-icon"><ReceiptText size={18} /></span>
              <span className="pay14-kicker">Payment preview</span>
              <h3>{selectedInvoice?.invoiceNumber ?? 'No invoice selected'}</h3>
              <p>{selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : 'Choose a patient to begin.'}</p>
              <div className="pay14-summary-metrics">
                <div><span>Invoice total</span><strong>{selectedInvoice ? formatCurrency(selectedInvoice.totalCents) : '—'}</strong></div>
                <div><span>Already paid</span><strong>{selectedInvoice ? formatCurrency(selectedInvoice.amountPaidCents) : '—'}</strong></div>
                <div className="is-emphasis"><span>Outstanding</span><strong>{selectedInvoice ? formatCurrency(selectedInvoice.balanceCents) : '—'}</strong></div>
                <div><span>After this payment</span><strong>{selectedInvoice && amountCents > 0 && !exceedsBalance ? formatCurrency(remainingAfterPayment) : '—'}</strong></div>
              </div>
            </div>
            <div className="pay14-trust-card"><ShieldCheck size={18} /><div><strong>Source-of-truth confirmation</strong><p>When Supabase is configured, the saved payment is verified against the database before this dialog confirms success.</p></div></div>
            <div className="pay14-trust-card"><Landmark size={18} /><div><strong>Collection only</strong><p>Recording a payment does not create or modify treatment-plan estimates.</p></div></div>
          </aside>
        </div>
      )}

      {!successMessage && <footer className="pay14-footer"><div><span>Amount to record</span><strong>{amountCents > 0 ? formatCurrency(amountCents) : formatCurrency(0)}</strong></div><div className="pay14-footer-actions"><Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button><Button onClick={() => void handleSubmit()} disabled={!isValid || loading}>{loading ? 'Confirming…' : 'Record payment'}</Button></div></footer>}
    </section>
  )
}

type PaymentRecorderButtonProps = { onSuccess?: () => void }

export function PaymentRecorderButtonV14({ onSuccess }: PaymentRecorderButtonProps) {
  const [open, setOpen] = useState(false)
  return <><Button onClick={() => setOpen(true)} icon={<Plus size={16} />}>Record payment</Button>{open && <div className="modal-backdrop pay14-backdrop" role="presentation" onClick={() => setOpen(false)}><PaymentRecorderV14 onClose={() => setOpen(false)} onSuccess={() => onSuccess?.()} /></div>}</>
}
