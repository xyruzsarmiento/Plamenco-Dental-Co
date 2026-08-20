import { useMemo, useState } from 'react'
import { CheckCircle2, Plus, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
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
      if (data.status !== 'completed') {
        throw new Error(`Payment was saved with status ${String(data.status).replaceAll('_', ' ')} instead of completed.`)
      }
      if (Number(data.amount_cents) !== payment.amountCents || data.invoice_id !== payment.invoiceId) {
        throw new Error('The saved payment does not match the submitted invoice or amount.')
      }
      return
    }

    lastError = error?.message ?? 'The payment record was not returned by the database.'
    if (attempt < 3) {
      await new Promise((resolve) => window.setTimeout(resolve, 180 * (attempt + 1)))
    }
  }

  throw new Error(`Database confirmation failed: ${lastError}`)
}

export function PaymentRecorder({ onClose, onSuccess }: PaymentRecorderProps) {
  const patients = useMemo(() => getStoredPatients(), [])
  const invoices = useMemo(() => getStoredInvoices(), [])

  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
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
  const paymentMethods = useMemo(() => getActivePaymentMethods(), [])
  const selectedMethod = paymentMethods.find((entry) => entry.id === method)
  const amountNumber = Number(amount)
  const amountCents = Number.isFinite(amountNumber) ? Math.round(amountNumber * 100) : 0
  const exceedsBalance = Boolean(selectedInvoice && amountCents > selectedInvoice.balanceCents)
  const requiresReference = Boolean(selectedMethod?.requiresReference)
  const isValid = Boolean(
    selectedPatientId &&
    selectedInvoiceId &&
    date &&
    amountCents > 0 &&
    selectedInvoice &&
    amountCents <= selectedInvoice.balanceCents &&
    (!requiresReference || reference.trim()),
  )

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
    if (!selectedInvoice) {
      setError('Select an outstanding invoice before recording a payment.')
      return
    }
    if (amountCents <= 0) {
      setError('Payment amount must be greater than zero.')
      return
    }
    if (amountCents > selectedInvoice.balanceCents) {
      setError(`Payment cannot exceed the outstanding balance of ${formatCurrency(selectedInvoice.balanceCents)}.`)
      return
    }
    if (requiresReference && !reference.trim()) {
      setError(`${selectedMethod?.label ?? 'This payment method'} requires a reference number.`)
      return
    }
    if (!date) {
      setError('Payment date is required.')
      return
    }

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
    <section
      className="payment-recorder-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-recorder-title"
      aria-describedby="payment-recorder-description"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="recorder-header">
        <div>
          <h2 id="payment-recorder-title">Record payment</h2>
          <p id="payment-recorder-description">Apply a verified in-clinic payment to one outstanding invoice.</p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={successMessage ? finishSuccess : onClose}
          aria-label="Close record payment dialog"
          disabled={loading}
        >
          <X size={20} />
        </button>
      </div>

      <div className="recorder-content">
        {successMessage ? (
          <div className="payment-recorder-success" role="status">
            <CheckCircle2 size={22} />
            <div>
              <strong>Payment recorded</strong>
              <p>{successMessage}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="form-section">
              <h4>Patient & invoice</h4>
              <div className="form-grid form-grid-cols-2">
                <Select
                  label="Patient"
                  value={selectedPatientId}
                  onChange={(event) => handlePatientChange(event.target.value)}
                  options={[
                    { value: '', label: 'Select patient' },
                    ...patients.map((patient) => ({
                      value: patient.patientId,
                      label: `${patient.firstName} ${patient.lastName}`,
                    })),
                  ]}
                  disabled={loading}
                />
                <Select
                  label="Invoice"
                  value={selectedInvoiceId}
                  onChange={(event) => handleInvoiceChange(event.target.value)}
                  options={[
                    { value: '', label: selectedPatientId ? 'Select invoice' : 'Select patient first' },
                    ...availableInvoices.map((invoice) => ({
                      value: invoice.id,
                      label: `${invoice.invoiceNumber} · ${formatCurrency(invoice.balanceCents)} due`,
                    })),
                  ]}
                  disabled={loading || !selectedPatientId || availableInvoices.length === 0}
                />
              </div>
              {selectedPatientId && availableInvoices.length === 0 && (
                <div className="payment-recorder-note">This patient has no outstanding invoices.</div>
              )}
            </div>

            {selectedInvoice && (
              <div className="form-section invoice-summary" aria-live="polite">
                <div className="summary-item">
                  <span>Invoice total</span>
                  <strong>{formatCurrency(selectedInvoice.totalCents)}</strong>
                </div>
                <div className="summary-item">
                  <span>Already paid</span>
                  <strong>{formatCurrency(selectedInvoice.amountPaidCents)}</strong>
                </div>
                <div className="summary-item highlight">
                  <span>Outstanding balance</span>
                  <strong>{formatCurrency(selectedInvoice.balanceCents)}</strong>
                </div>
              </div>
            )}

            <div className="form-section">
              <h4>Payment details</h4>
              <div className="form-grid form-grid-cols-2">
                <Input
                  label="Amount (PHP)"
                  type="number"
                  min="0.01"
                  max={selectedInvoice ? (selectedInvoice.balanceCents / 100).toFixed(2) : undefined}
                  step="0.01"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value)
                    setError(null)
                  }}
                  placeholder="0.00"
                  disabled={!selectedInvoice || loading}
                  autoFocus={Boolean(selectedInvoice)}
                />
                <Input
                  label="Date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  disabled={loading}
                />
              </div>
              {selectedInvoice && (
                <div className={`payment-amount-hint ${exceedsBalance ? 'is-error' : ''}`}>
                  Maximum payment: {formatCurrency(selectedInvoice.balanceCents)}. Partial payments are allowed.
                </div>
              )}
            </div>

            <div className="form-section">
              <h4>Payment method</h4>
              <Select
                label="Method"
                value={method}
                onChange={(event) => {
                  setMethod(event.target.value as PaymentMethod)
                  setReference('')
                  setError(null)
                }}
                options={paymentMethods.map((entry) => ({ value: entry.id, label: entry.label }))}
                disabled={loading}
              />
            </div>

            <div className="form-section">
              <h4>Additional information</h4>
              <div className="form-grid">
                <Input
                  label={requiresReference ? 'Reference number' : 'Reference number (optional)'}
                  placeholder="Check number, transaction ID, etc."
                  value={reference}
                  onChange={(event) => {
                    setReference(event.target.value)
                    setError(null)
                  }}
                  required={requiresReference}
                  disabled={loading}
                />
                <Input
                  label="Recorded by"
                  value={recordedBy}
                  onChange={(event) => setRecordedBy(event.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          </>
        )}

        {error && <div className="inline-alert danger" role="alert">{error}</div>}

        <div className="recorder-actions">
          {successMessage ? (
            <Button onClick={finishSuccess}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
              <Button onClick={() => void handleSubmit()} disabled={!isValid || loading}>
                {loading ? 'Recording payment…' : 'Record payment'}
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

type PaymentRecorderButtonProps = {
  onSuccess?: () => void
}

export function PaymentRecorderButton({ onSuccess }: PaymentRecorderButtonProps) {
  const [showRecorder, setShowRecorder] = useState(false)

  return (
    <>
      <Button onClick={() => setShowRecorder(true)} icon={<Plus size={16} />}>
        Record payment
      </Button>

      {showRecorder && (
        <div className="modal-backdrop payment-recorder-backdrop" role="presentation">
          <PaymentRecorder
            onClose={() => setShowRecorder(false)}
            onSuccess={() => onSuccess?.()}
          />
        </div>
      )}
    </>
  )
}
