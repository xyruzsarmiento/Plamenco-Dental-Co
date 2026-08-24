import { useMemo, useState } from 'react'
import { Ban, CheckCircle2, CreditCard, Printer, RotateCcw, Search, XCircle } from 'lucide-react'
import { PageScaffold } from '../components/ui/PageScaffold'
import { StatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Select'
import { PaymentRecorderButton } from '../features/billing/PaymentRecorder'
import {
  approvePayment,
  createRefund,
  formatCurrency,
  getActivePaymentMethods,
  getLedgerByPatient,
  getOutstandingBalanceTotal,
  getPartiallyPaidInvoiceCount,
  getPendingPaymentsCount,
  getPaymentMethodLabel,
  getPaymentsByInvoice,
  getStoredInvoices,
  getStoredPayments,
  getStoredReceipts,
  getStoredRefunds,
  getTodayRevenue,
  rejectPayment,
  voidInvoice,
  type Invoice,
  type InvoiceStatus,
  type Payment,
  type PaymentMethod,
} from '../features/billing/billingStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredPatients } from '../features/patients/patientStore'
import { usePermissions } from '../features/auth/permissions'

type BillingTab = 'invoices' | 'payments' | 'outstanding' | 'verification' | 'refunds'

const invoiceStatuses: Array<'all' | InvoiceStatus> = ['all', 'draft', 'unpaid', 'partially_paid', 'paid', 'void', 'partially_refunded', 'refunded']

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function patientName(patientId: string) {
  const patient = getStoredPatients().find((entry) => entry.patientId === patientId || entry.id === patientId)
  return patient ? `${patient.firstName} ${patient.lastName}`.trim() : patientId
}

function branchName(branchId?: string) {
  if (!branchId) return 'Unassigned branch'
  return getStoredBranches().find((entry) => entry.id === branchId)?.name ?? branchId
}

function printReceipt(payment: Payment) {
  const receipt = getStoredReceipts().find((entry) => entry.paymentId === payment.id)
  if (!receipt) return
  const invoice = getStoredInvoices().find((entry) => entry.id === payment.invoiceId)
  const receiptWindow = window.open('', '_blank', 'width=720,height=900')
  if (!receiptWindow) return
  receiptWindow.document.write(`
    <html>
      <head><title>${receipt.receiptNumber}</title></head>
      <body style="font-family: Arial, sans-serif; padding: 32px; color: #172033;">
        <h1 style="margin-bottom: 4px;">Plamenco Dental Co.</h1>
        <p style="margin-top: 0;">Payment Receipt</p>
        <hr />
        <p><strong>Receipt:</strong> ${receipt.receiptNumber}</p>
        <p><strong>Payment:</strong> ${payment.paymentNumber}</p>
        <p><strong>Date:</strong> ${new Date(receipt.issuedAt).toLocaleString('en-PH')}</p>
        <p><strong>Patient:</strong> ${patientName(receipt.patientId)}</p>
        <p><strong>Branch:</strong> ${branchName(receipt.branchId)}</p>
        <p><strong>Invoice:</strong> ${invoice?.invoiceNumber ?? payment.invoiceId}</p>
        <p><strong>Method:</strong> ${getPaymentMethodLabel(payment.paymentMethod)}</p>
        ${payment.referenceNumber ? `<p><strong>Reference:</strong> ${payment.referenceNumber}</p>` : ''}
        <h2>${formatCurrency(receipt.amountCents)}</h2>
        <p><strong>Remaining balance:</strong> ${formatCurrency(receipt.remainingBalanceCents)}</p>
        <p style="margin-top: 40px; color: #667085;">This is a payment acknowledgement, not a BIR Official Receipt.</p>
      </body>
    </html>
  `)
  receiptWindow.document.close()
  receiptWindow.print()
}

export function BillingPage() {
  const permissions = usePermissions()
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState<BillingTab>('invoices')
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | InvoiceStatus>('all')
  const [branchId, setBranchId] = useState('all')
  const [method, setMethod] = useState<'all' | PaymentMethod>('all')

  const data = useMemo(() => {
    void refreshKey
    const invoices = getStoredInvoices()
    const payments = getStoredPayments()
    const receipts = getStoredReceipts()
    const refunds = getStoredRefunds()
    const query = search.trim().toLowerCase()
    const filteredInvoices = invoices.filter((invoice) => {
      const matchesSearch = !query || invoice.invoiceNumber.toLowerCase().includes(query) || patientName(invoice.patientId).toLowerCase().includes(query)
      const matchesStatus = status === 'all' || invoice.status === status
      const matchesBranch = branchId === 'all' || invoice.branchId === branchId
      return matchesSearch && matchesStatus && matchesBranch
    })
    const filteredPayments = payments.filter((payment) => {
      const matchesSearch = !query || payment.paymentNumber.toLowerCase().includes(query) || patientName(payment.patientId).toLowerCase().includes(query)
      const matchesMethod = method === 'all' || payment.paymentMethod === method
      const matchesBranch = branchId === 'all' || payment.branchId === branchId
      return matchesSearch && matchesMethod && matchesBranch
    })
    return { invoices, payments, receipts, refunds, filteredInvoices, filteredPayments }
  }, [branchId, method, refreshKey, search, status])

  const selectedInvoice = selectedInvoiceId ? data.invoices.find((invoice) => invoice.id === selectedInvoiceId) : data.filteredInvoices[0]
  const pendingVerification = data.payments.filter((payment) => payment.status === 'pending_verification')
  const outstanding = data.invoices.filter((invoice) => invoice.balanceCents > 0 && invoice.status !== 'void')

  function refresh() {
    setRefreshKey((key) => key + 1)
  }

  function handleVoid(invoice: Invoice) {
    const reason = window.prompt(`Reason for voiding ${invoice.invoiceNumber}`)
    if (!reason) return
    voidInvoice(invoice.id, reason, 'clinic-user')
    refresh()
  }

  function handleRefund(payment: Payment) {
    const amount = window.prompt(`Refund amount for ${payment.paymentNumber}`, String(payment.refundableCents / 100))
    if (!amount) return
    const reason = window.prompt('Refund reason')
    if (!reason) return
    createRefund({ paymentId: payment.id, amountCents: Math.round(Number(amount) * 100), reason, processedBy: 'clinic-user' })
    refresh()
  }

  return (
    <PageScaffold title="Billing & Payments" description="Manage invoices, patient balances and clinic collections.">
      <div className="page-stack" key={refreshKey}>
        <div className="toolbar-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="toolbar-row" style={{ flexWrap: 'wrap' }}>
            {(['invoices', 'payments', 'outstanding', 'verification', 'refunds'] as BillingTab[]).map((tab) => (
              <button key={tab} type="button" className={`tab-button ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                {tab.replace('_', ' ')}
              </button>
            ))}
          </div>
          {permissions.can('payments.record_manual') && <PaymentRecorderButton onSuccess={refresh} />}
        </div>

        <div className="metrics-grid">
          <div className="metric-card"><span>Today&apos;s Collections</span><strong>{formatCurrency(getTodayRevenue())}</strong><small>Completed payments dated today</small></div>
          <div className="metric-card"><span>Outstanding Receivables</span><strong>{formatCurrency(getOutstandingBalanceTotal())}</strong><small>Open invoice balances</small></div>
          <div className="metric-card"><span>Pending Online / Proof</span><strong>{getPendingPaymentsCount()}</strong><small>Awaiting gateway or staff verification</small></div>
          <div className="metric-card"><span>Partially Paid</span><strong>{getPartiallyPaidInvoiceCount()}</strong><small>Invoices with remaining balances</small></div>
          <div className="metric-card"><span>Refunds</span><strong>{formatCurrency(data.refunds.reduce((sum, refund) => sum + refund.amountCents, 0))}</strong><small>{data.refunds.length} refund records</small></div>
        </div>

        <div className="filter-panel" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) repeat(3, minmax(160px, 220px))', gap: 12 }}>
          <label className="field">
            <span>Search patient or number</span>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-muted)' }} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} style={{ paddingLeft: 36 }} />
            </div>
          </label>
          <Select label="Invoice status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} options={invoiceStatuses.map((entry) => ({ value: entry, label: entry === 'all' ? 'All statuses' : entry.replaceAll('_', ' ') }))} />
          <Select label="Branch" value={branchId} onChange={(event) => setBranchId(event.target.value)} options={[{ value: 'all', label: 'All branches' }, ...getStoredBranches().map((branch) => ({ value: branch.id, label: branch.name }))]} />
          <Select label="Payment method" value={method} onChange={(event) => setMethod(event.target.value as typeof method)} options={[{ value: 'all', label: 'All methods' }, ...getActivePaymentMethods().map((entry) => ({ value: entry.id, label: entry.label }))]} />
        </div>

        {activeTab === 'invoices' && (
          <div className="workspace-grid">
            <section className="workspace-panel">
              <div className="section-header"><div><h3>Invoices</h3><p>{data.filteredInvoices.length} records</p></div></div>
              <div className="workspace-list">
                {data.filteredInvoices.map((invoice) => (
                  <button key={invoice.id} type="button" className="workspace-row" onClick={() => setSelectedInvoiceId(invoice.id)}>
                    <div>
                      <strong>{invoice.invoiceNumber} - {patientName(invoice.patientId)}</strong>
                      <span>{formatDate(invoice.invoiceDate)} - {branchName(invoice.branchId)}</span>
                      <small>Paid {formatCurrency(invoice.amountPaidCents)} of {formatCurrency(invoice.totalCents)}</small>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <StatusBadge status={invoice.status} variant="compact" />
                      <strong>{formatCurrency(invoice.balanceCents)}</strong>
                    </div>
                  </button>
                ))}
                {data.filteredInvoices.length === 0 && <div className="empty-state-panel">No invoices match the current filters.</div>}
              </div>
            </section>

            <aside className="workspace-panel">
              {selectedInvoice ? (
                <>
                  <div className="section-header">
                    <div><h3>{selectedInvoice.invoiceNumber}</h3><p>{patientName(selectedInvoice.patientId)}</p></div>
                    <StatusBadge status={selectedInvoice.status} />
                  </div>
                  <div className="detail-grid detail-grid-mini">
                    <div className="detail-item"><span>Branch</span><strong>{branchName(selectedInvoice.branchId)}</strong></div>
                    <div className="detail-item"><span>Subtotal</span><strong>{formatCurrency(selectedInvoice.subtotalCents)}</strong></div>
                    <div className="detail-item"><span>Discounts</span><strong>{formatCurrency(selectedInvoice.discountCents)}</strong></div>
                    <div className="detail-item"><span>Total</span><strong>{formatCurrency(selectedInvoice.totalCents)}</strong></div>
                    <div className="detail-item"><span>Paid</span><strong>{formatCurrency(selectedInvoice.amountPaidCents)}</strong></div>
                    <div className="detail-item"><span>Balance</span><strong>{formatCurrency(selectedInvoice.balanceCents)}</strong></div>
                  </div>
                  <div className="workspace-list">
                    {selectedInvoice.items.map((item) => (
                      <div key={item.id} className="workspace-row">
                        <div><strong>{item.description}</strong><span>{item.providerNameSnapshot || 'Provider attribution pending'} - Qty {item.quantity}</span></div>
                        <strong>{formatCurrency(item.amountCents ?? item.quantity * item.unitPriceCents)}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="workspace-list">
                    {getPaymentsByInvoice(selectedInvoice.id).map((payment) => (
                      <div key={payment.id} className="workspace-row">
                        <div><strong>{payment.paymentNumber}</strong><span>{getPaymentMethodLabel(payment.paymentMethod)} - {formatDate(payment.date)}</span></div>
                        <strong>{formatCurrency(payment.amountCents)}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="toolbar-row">
                    {permissions.can('billing.void_invoice') && selectedInvoice.amountPaidCents === 0 && selectedInvoice.status !== 'void' && (
                      <Button variant="danger" size="sm" icon={<Ban size={14} />} onClick={() => handleVoid(selectedInvoice)}>Void</Button>
                    )}
                  </div>
                </>
              ) : <div className="empty-state-panel">Select an invoice to view details.</div>}
            </aside>
          </div>
        )}

        {activeTab === 'payments' && (
          <section className="workspace-panel">
            <div className="section-header"><div><h3>Payments</h3><p>{data.filteredPayments.length} records</p></div></div>
            <div className="workspace-list">
              {data.filteredPayments.map((payment) => (
                <div key={payment.id} className="workspace-row">
                  <div>
                    <strong>{payment.paymentNumber} - {patientName(payment.patientId)}</strong>
                    <span>{getPaymentMethodLabel(payment.paymentMethod)} - {branchName(payment.branchId)} - {formatDate(payment.date)}</span>
                    <small>{payment.referenceNumber || 'No reference'} - {payment.recordedBy}</small>
                  </div>
                  <div className="toolbar-row">
                    <StatusBadge status={payment.status} variant="compact" />
                    <strong>{formatCurrency(payment.amountCents)}</strong>
                    {data.receipts.some((receipt) => receipt.paymentId === payment.id) && <Button variant="ghost" size="sm" icon={<Printer size={14} />} onClick={() => printReceipt(payment)}>Receipt</Button>}
                    {permissions.can('payments.refund') && payment.refundableCents > 0 && <Button variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={() => handleRefund(payment)}>Refund</Button>}
                  </div>
                </div>
              ))}
              {data.filteredPayments.length === 0 && <div className="empty-state-panel">No payments match the current filters.</div>}
            </div>
          </section>
        )}

        {activeTab === 'outstanding' && (
          <section className="workspace-panel">
            <div className="section-header"><div><h3>Outstanding Balances</h3><p>{outstanding.length} invoices need collection</p></div></div>
            <div className="workspace-list">
              {outstanding.map((invoice) => (
                <div key={invoice.id} className="workspace-row">
                  <div><strong>{patientName(invoice.patientId)}</strong><span>{invoice.invoiceNumber} - {branchName(invoice.branchId)}</span><small>{getLedgerByPatient(invoice.patientId).slice(0, 3).map((entry) => entry.label).join(' | ')}</small></div>
                  <strong>{formatCurrency(invoice.balanceCents)}</strong>
                </div>
              ))}
              {outstanding.length === 0 && <div className="empty-state-panel">No outstanding balances.</div>}
            </div>
          </section>
        )}

        {activeTab === 'verification' && (
          <section className="workspace-panel">
            <div className="section-header"><div><h3>Pending Verification</h3><p>{pendingVerification.length} proof submissions</p></div></div>
            <div className="workspace-list">
              {pendingVerification.map((payment) => (
                <div key={payment.id} className="workspace-row">
                  <div><strong>{payment.paymentNumber} - {patientName(payment.patientId)}</strong><span>{getPaymentMethodLabel(payment.paymentMethod)} - {payment.referenceNumber || 'No reference'}</span><small>{payment.proofFilePath || 'No proof file path recorded'}</small></div>
                  <div className="toolbar-row">
                    <strong>{formatCurrency(payment.amountCents)}</strong>
                    {permissions.canAny(['payments.verify', 'payments.confirm']) && <Button size="sm" icon={<CheckCircle2 size={14} />} onClick={() => { approvePayment(payment.id, 'clinic-user'); refresh() }}>Approve</Button>}
                    {permissions.can('payments.reject') && <Button variant="danger" size="sm" icon={<XCircle size={14} />} onClick={() => { rejectPayment(payment.id, 'clinic-user', 'Rejected by reviewer', 'Payment proof could not be verified.'); refresh() }}>Reject</Button>}
                  </div>
                </div>
              ))}
              {pendingVerification.length === 0 && <div className="empty-state-panel">No payment proofs are awaiting review.</div>}
            </div>
          </section>
        )}

        {activeTab === 'refunds' && (
          <section className="workspace-panel">
            <div className="section-header"><div><h3>Refunds</h3><p>{data.refunds.length} refund records</p></div></div>
            <div className="workspace-list">
              {data.refunds.map((refund) => (
                <div key={refund.id} className="workspace-row">
                  <div><strong>{refund.refundNumber} - {patientName(refund.patientId)}</strong><span>{branchName(refund.branchId)} - {formatDate(refund.processedAt)}</span><small>{refund.reason}</small></div>
                  <div><StatusBadge status={refund.status} variant="compact" /><strong>{formatCurrency(refund.amountCents)}</strong></div>
                </div>
              ))}
              {data.refunds.length === 0 && <div className="empty-state-panel">No refunds recorded.</div>}
            </div>
          </section>
        )}

        <div className="inline-alert info">
          <CreditCard size={16} />
          Online payment gateway support is prepared behind a provider abstraction. Gateway secret keys and webhook signing secrets must be configured server-side before activating online collections.
        </div>
      </div>
    </PageScaffold>
  )
}
