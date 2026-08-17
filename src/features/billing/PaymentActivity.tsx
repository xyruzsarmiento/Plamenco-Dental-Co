import { useState, useMemo } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { getStoredPayments, getStoredInvoices } from './billingStore'
import type { Payment, Invoice } from './billingStore'
import { getPatientName } from '../dentalRecords/dentalRecordStore'
import { Button } from '../../components/ui/Button'

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

function getPaymentMethodLabel(method: string): string {
  const methods: Record<string, string> = {
    cash: 'Cash',
    gcash: 'GCash',
    maya: 'Maya',
    card: 'Credit/Debit Card',
    bank_transfer: 'Bank Transfer',
  }
  return methods[method] || method
}

type PaymentDetailProps = {
  payment: Payment
  invoice: Invoice | undefined
  onClose: () => void
}

function PaymentDetail({ payment, invoice, onClose }: PaymentDetailProps) {
  return (
    <div className="payment-detail-drawer">
      <div className="detail-header">
        <h3>Payment details</h3>
        <button
          type="button"
          className="icon-button"
          aria-label="Close details"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>

      <div className="detail-content">
        <section className="detail-section">
          <h4>Payment information</h4>
          <dl className="detail-grid">
            <div>
              <dt>Patient</dt>
              <dd><strong>{getPatientName(payment.patientId)}</strong></dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd><strong>{formatCurrency(payment.amountCents)}</strong></dd>
            </div>
            <div>
              <dt>Method</dt>
              <dd>{getPaymentMethodLabel(payment.paymentMethod)}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{formatDate(payment.date)}</dd>
            </div>
            {payment.referenceNumber && (
              <div>
                <dt>Reference</dt>
                <dd className="code-text">{payment.referenceNumber}</dd>
              </div>
            )}
            <div>
              <dt>Recorded by</dt>
              <dd>{payment.recordedBy}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className="badge badge-success">Confirmed</span>
              </dd>
            </div>
          </dl>
        </section>

        {invoice && (
          <section className="detail-section">
            <h4>Invoice</h4>
            <dl className="detail-grid">
              <div>
                <dt>Invoice number</dt>
                <dd><strong>{invoice.invoiceNumber}</strong></dd>
              </div>
              <div>
                <dt>Original amount</dt>
                <dd>{formatCurrency(invoice.totalCents)}</dd>
              </div>
              <div>
                <dt>Current balance</dt>
                <dd>{formatCurrency(invoice.balanceCents)}</dd>
              </div>
              <div>
                <dt>Invoice date</dt>
                <dd>{formatDate(invoice.invoiceDate)}</dd>
              </div>
            </dl>
          </section>
        )}
      </div>

      <div className="detail-actions">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}

export function PaymentActivity() {
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null)

  const { payments, invoiceMap } = useMemo(() => {
    const allPayments = getStoredPayments().sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    const invoices = getStoredInvoices()
    const map = new Map(invoices.map((inv) => [inv.id, inv]))

    return { payments: allPayments, invoiceMap: map }
  }, [])

  const selectedPayment = payments.find((p) => p.id === selectedPaymentId)
  const selectedInvoice = selectedPayment ? invoiceMap.get(selectedPayment.invoiceId) : undefined

  if (payments.length === 0) {
    return (
      <div className="activity-card empty-activity">
        <div className="empty-state-content">
          <p className="empty-state-title">No payment activity</p>
          <p className="empty-state-text">Payments will appear here as they are recorded.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="activity-card payment-activity-card">
        <div className="card-header">
          <h3>Recent payments</h3>
          <p className="card-description">{payments.length} total payments recorded</p>
        </div>

        <div className="activity-list">
          {payments.map((payment) => (
            <button
              key={payment.id}
              type="button"
              className="activity-item payment-item"
              onClick={() => setSelectedPaymentId(payment.id)}
            >
              <div className="item-left">
                <div className="item-icon payment-icon">₱</div>
                <div className="item-info">
                  <p className="item-title">{getPatientName(payment.patientId)}</p>
                  <span className="item-meta">
                    {getPaymentMethodLabel(payment.paymentMethod)} · {formatDate(payment.date)}
                  </span>
                </div>
              </div>
              <div className="item-right">
                <p className="item-amount">{formatCurrency(payment.amountCents)}</p>
                <ChevronRight size={16} className="item-chevron" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedPayment && (
        <PaymentDetail
          payment={selectedPayment}
          invoice={selectedInvoice}
          onClose={() => setSelectedPaymentId(null)}
        />
      )}
    </>
  )
}
