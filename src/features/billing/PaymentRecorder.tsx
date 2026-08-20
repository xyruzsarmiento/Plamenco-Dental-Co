import { useState, useMemo } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import {
  getStoredInvoices,
  applyPayment,
  getActivePaymentMethods,
  type PaymentMethod,
} from './billingStore'
import { getStoredPatients } from '../patients/patientStore'

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

type PaymentRecorderProps = {
  onClose: () => void
  onSuccess: () => void
}

export function PaymentRecorder({ onClose, onSuccess }: PaymentRecorderProps) {
  const patients = useMemo(() => getStoredPatients(), [])
  const invoices = useMemo(() => getStoredInvoices(), [])

  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.patientId ?? '')
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState('')
  const [recordedBy, setRecordedBy] = useState('Front desk')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const availableInvoices = useMemo(
    () =>
      invoices.filter((inv) => inv.patientId === selectedPatientId && inv.balanceCents > 0),
    [invoices, selectedPatientId]
  )

  const selectedInvoice = invoices.find((inv) => inv.id === selectedInvoiceId)
  const paymentMethods = useMemo(() => getActivePaymentMethods(), [])
  const selectedMethod = paymentMethods.find((entry) => entry.id === method)
  const amountCents = Math.round(parseFloat(amount || '0') * 100)
  const isValid =
    selectedPatientId &&
    selectedInvoiceId &&
    amountCents > 0 &&
    amountCents <= (selectedInvoice?.balanceCents || 0) &&
    (!selectedMethod?.requiresReference || reference.trim().length > 0)

  async function handleSubmit() {
    if (!isValid) {
      setError('Please fill in all fields with valid values.')
      return
    }

    setError(null)
    setLoading(true)

    try {
      applyPayment({
        patientId: selectedPatientId,
        invoiceId: selectedInvoiceId,
        amountCents,
        paymentMethod: method,
        date,
        referenceNumber: reference.trim() || undefined,
        recordedBy: recordedBy.trim() || 'Front desk',
      })

      setSuccess(true)
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="payment-recorder-modal">
        <div className="recorder-header">
          <h2>Payment recorded</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        <div className="success-state">
          <div className="success-icon">✓</div>
          <p className="success-message">Payment of {formatCurrency(amountCents)} has been successfully recorded.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="payment-recorder-modal">
      <div className="recorder-header">
        <h2>Record payment</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>

      <div className="recorder-content">
        <div className="form-section">
          <h4>Patient & Invoice</h4>
          <div className="form-grid form-grid-cols-2">
            <Select
              label="Patient"
              value={selectedPatientId}
              onChange={(e) => {
                setSelectedPatientId(e.target.value)
                setSelectedInvoiceId('')
              }}
              options={patients.map((p: any) => ({
                value: p.patientId,
                label: `${p.firstName} ${p.lastName}`,
              }))}
            />
            <Select
              label="Invoice"
              value={selectedInvoiceId}
              onChange={(e) => setSelectedInvoiceId(e.target.value)}
              options={[
                { value: '', label: 'Select invoice' },
                ...availableInvoices.map((inv) => ({
                  value: inv.id,
                  label: `${inv.invoiceNumber} (Balance: ${formatCurrency(inv.balanceCents)})`,
                })),
              ]}
              disabled={!selectedPatientId || availableInvoices.length === 0}
            />
          </div>
        </div>

        {selectedInvoice && (
          <div className="form-section invoice-summary">
            <div className="summary-item">
              <span>Invoice total</span>
              <strong>{formatCurrency(selectedInvoice.totalCents)}</strong>
            </div>
            <div className="summary-item">
              <span>Already paid</span>
              <strong>{formatCurrency(selectedInvoice.amountPaidCents)}</strong>
            </div>
            <div className="summary-item highlight">
              <span>Balance due</span>
              <strong>{formatCurrency(selectedInvoice.balanceCents)}</strong>
            </div>
          </div>
        )}

        <div className="form-section">
          <h4>Payment details</h4>
          <div className="form-grid form-grid-cols-2">
            <Input
              label="Amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
            <Input
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="form-section">
          <h4>Payment method</h4>
          <Select
            label="Method"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            options={paymentMethods.map((entry) => ({ value: entry.id, label: entry.label }))}
          />
        </div>

        <div className="form-section">
          <h4>Additional information</h4>
          <div className="form-grid">
            <Input
              label={selectedMethod?.requiresReference ? 'Reference number' : 'Reference number (optional)'}
              placeholder="Check number, transaction ID, etc."
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <Input
              label="Recorded by"
              value={recordedBy}
              onChange={(e) => setRecordedBy(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="inline-alert danger">{error}</div>}

        <div className="recorder-actions">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || loading}>
            {loading ? 'Recording...' : 'Record payment'}
          </Button>
        </div>
      </div>
    </div>
  )
}

type PaymentRecorderButtonProps = {
  onSuccess?: () => void
}

export function PaymentRecorderButton({ onSuccess }: PaymentRecorderButtonProps) {
  const [showRecorder, setShowRecorder] = useState(false)

  return (
    <>
      <Button
        onClick={() => setShowRecorder(true)}
        icon={<Plus size={16} />}
      >
        Record payment
      </Button>

      {showRecorder && (
        <div className="modal-backdrop">
          <PaymentRecorder
            onClose={() => setShowRecorder(false)}
            onSuccess={() => {
              onSuccess?.()
            }}
          />
        </div>
      )}
    </>
  )
}
