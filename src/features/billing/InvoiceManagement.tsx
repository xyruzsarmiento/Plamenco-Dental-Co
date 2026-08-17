import { useState, useMemo } from 'react'
import { Plus, FileText, ChevronDown } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { Badge } from '../../components/ui/Badge'
import {
  getStoredInvoices,
  createInvoice,
  type Invoice,
  type InvoiceItem,
} from '../../features/billing/billingStore'
import { getStoredPatients } from '../../features/patients/patientStore'
import { getPatientName } from '../dentalRecords/dentalRecordStore'

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const emptyItem = (): InvoiceItem => ({
  id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  description: '',
  quantity: 1,
  unitPriceCents: 0,
})

type InvoiceFormProps = {
  onClose: () => void
  onSuccess: () => void
}

function InvoiceForm({ onClose, onSuccess }: InvoiceFormProps) {
  const patients = useMemo(() => getStoredPatients(), [])
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.patientId ?? '')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [items, setItems] = useState<InvoiceItem[]>([emptyItem()])
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const totalCents = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)

  function updateItem(id: string, field: keyof InvoiceItem, value: any) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    )
  }

  function handleRemoveItem(id: string) {
    if (items.length > 1) {
      setItems((current) => current.filter((item) => item.id !== id))
    }
  }

  async function handleSubmit() {
    setError(null)
    setLoading(true)

    try {
      if (!items.some((item) => item.description.trim())) {
        throw new Error('At least one item description is required.')
      }

      createInvoice({
        patientId: selectedPatientId,
        invoiceDate,
        items,
        notes,
      })

      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invoice.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="invoice-form-container">
      <div className="form-header">
        <h3>Create invoice</h3>
        <p className="form-subtext">Add line items and generate a new invoice</p>
      </div>

      <div className="form-section">
        <div className="form-grid form-grid-cols-2">
          <Select
            label="Patient"
            value={selectedPatientId}
            onChange={(e) => setSelectedPatientId(e.target.value)}
            options={patients.map((p) => ({
              value: p.patientId,
              label: `${p.firstName} ${p.lastName}`,
            }))}
          />
          <Input
            label="Invoice date"
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
        </div>
      </div>

      <div className="form-section">
        <h4>Line items</h4>
        <div className="invoice-items-list">
          {items.map((item, idx) => (
            <div key={item.id} className="invoice-item-form">
              <div className="item-grid">
                <Input
                  label={idx === 0 ? 'Description' : ''}
                  placeholder="Service or treatment description"
                  value={item.description}
                  onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                />
                <Input
                  label={idx === 0 ? 'Qty' : ''}
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(item.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))
                  }
                  style={{ maxWidth: '80px' }}
                />
                <Input
                  label={idx === 0 ? 'Unit price' : ''}
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unitPriceCents / 100}
                  onChange={(e) =>
                    updateItem(item.id, 'unitPriceCents', Math.round(parseFloat(e.target.value) * 100) || 0)
                  }
                  style={{ maxWidth: '120px' }}
                />
                {items.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveItem(item.id)}
                    style={{ alignSelf: 'flex-end' }}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <div className="item-subtotal">
                Subtotal: {formatCurrency(item.quantity * item.unitPriceCents)}
              </div>
            </div>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setItems((current) => [...current, emptyItem()])}
        >
          <Plus size={14} />
          Add item
        </Button>
      </div>

      <div className="form-section">
        <Textarea
          label="Notes (optional)"
          placeholder="Payment terms, notes, or additional information..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      <div className="invoice-total">
        <span>Total amount</span>
        <strong>{formatCurrency(totalCents)}</strong>
      </div>

      {error && (
        <div className="inline-alert danger">
          {error}
        </div>
      )}

      <div className="form-actions">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? 'Creating...' : 'Create invoice'}
        </Button>
      </div>
    </div>
  )
}

export function InvoiceManagement() {
  const [showForm, setShowForm] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>(() => getStoredInvoices())
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleSuccess = () => {
    setInvoices(getStoredInvoices())
  }

  if (invoices.length === 0 && !showForm) {
    return (
      <div className="invoice-management-card">
        <div className="card-empty-state">
          <FileText size={32} />
          <h3>No invoices yet</h3>
          <p>Create your first invoice to get started</p>
          <Button onClick={() => setShowForm(true)}>
            <Plus size={16} />
            Create invoice
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="invoice-management-card">
      {showForm ? (
        <InvoiceForm
          onClose={() => setShowForm(false)}
          onSuccess={handleSuccess}
        />
      ) : (
        <>
          <div className="card-header with-action">
            <div>
              <h3>Invoices</h3>
              <p className="card-description">{invoices.length} invoices created</p>
            </div>
            <Button
              onClick={() => setShowForm(true)}
              icon={<Plus size={16} />}
            >
              New invoice
            </Button>
          </div>

          <div className="invoices-list">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="invoice-item-card">
                <button
                  type="button"
                  className="invoice-item-header"
                  onClick={() =>
                    setExpandedId(expandedId === invoice.id ? null : invoice.id)
                  }
                >
                  <div className="invoice-item-left">
                    <FileText size={18} />
                    <div className="invoice-item-info">
                      <p className="invoice-number">{invoice.invoiceNumber}</p>
                      <span className="invoice-patient">
                        {getPatientName(invoice.patientId)}
                      </span>
                    </div>
                  </div>
                  <div className="invoice-item-right">
                    <div className="invoice-amounts">
                      <span className="invoice-total">
                        {formatCurrency(invoice.totalCents)}
                      </span>
                      <Badge
                        tone={
                          invoice.status === 'paid'
                            ? 'success'
                            : invoice.status === 'partially_paid'
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        {invoice.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <ChevronDown
                      size={16}
                      className={`expand-icon ${
                        expandedId === invoice.id ? 'is-expanded' : ''
                      }`}
                    />
                  </div>
                </button>

                {expandedId === invoice.id && (
                  <div className="invoice-item-details">
                    <div className="details-grid">
                      <div>
                        <dt>Date</dt>
                        <dd>{formatDate(invoice.invoiceDate)}</dd>
                      </div>
                      <div>
                        <dt>Total</dt>
                        <dd>{formatCurrency(invoice.totalCents)}</dd>
                      </div>
                      <div>
                        <dt>Paid</dt>
                        <dd>{formatCurrency(invoice.amountPaidCents)}</dd>
                      </div>
                      <div>
                        <dt>Balance</dt>
                        <dd>{formatCurrency(invoice.balanceCents)}</dd>
                      </div>
                    </div>

                    {invoice.items.length > 0 && (
                      <div className="items-section">
                        <h5>Items</h5>
                        <div className="items-table">
                          {invoice.items.map((item) => (
                            <div
                              key={item.id}
                              className="items-row"
                            >
                              <span>{item.description}</span>
                              <span className="items-qty">Qty: {item.quantity}</span>
                              <span className="items-price">
                                {formatCurrency(item.quantity * item.unitPriceCents)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {invoice.notes && (
                      <div className="notes-section">
                        <h5>Notes</h5>
                        <p>{invoice.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
