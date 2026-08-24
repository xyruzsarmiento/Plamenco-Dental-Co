import { useEffect, useMemo, useState } from 'react'
import { Ban, CheckCircle2, CircleDollarSign, CreditCard, FileText, Landmark, Printer, ReceiptText, RotateCcw, Search, ShieldCheck, TrendingUp, XCircle } from 'lucide-react'
import { PageScaffold } from '../components/ui/PageScaffold'
import { StatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Pagination } from '../components/ui/DesignSystem'
import { PaymentRecorderButtonV14 } from '../features/billing/PaymentRecorderV14'
import {
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
  type Invoice,
  type InvoiceStatus,
  type Payment,
  type PaymentMethod,
} from '../features/billing/billingStore'
import {
  rejectSubmittedPaymentPersisted,
  refundPaymentPersisted,
  verifySubmittedPaymentPersisted,
  voidInvoicePersisted,
} from '../features/billing/billingPersistence'
import { canPrintOfficialReceipt, openOfficialReceiptWindow } from '../features/billing/receiptDocument'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredPatients } from '../features/patients/patientStore'
import { usePermissions } from '../features/auth/permissions'

type BillingTab = 'invoices' | 'payments' | 'outstanding' | 'verification' | 'refunds'
const invoiceStatuses: Array<'all' | InvoiceStatus> = ['all', 'draft', 'unpaid', 'partially_paid', 'paid', 'void', 'partially_refunded', 'refunded']
const BILLING_PAGE_SIZE_OPTIONS = [10, 20, 50]
const BILLING_DEFAULT_PAGE_SIZE = 10

function slicePage<T>(items: T[], page: number, pageSize: number) {
  return items.slice((Math.max(1, page) - 1) * pageSize, Math.max(1, page) * pageSize)
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
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
  const invoice = getStoredInvoices().find((entry) => entry.id === payment.invoiceId)
  const patient = getStoredPatients().find((entry) => entry.patientId === payment.patientId || entry.id === payment.patientId)
  const branch = getStoredBranches().find((entry) => entry.id === (receipt?.branchId ?? payment.branchId ?? invoice?.branchId))
  const payload = {
    receipt,
    payment,
    invoice,
    patient: {
      name: patient ? `${patient.firstName} ${patient.lastName}`.trim() : patientName(payment.patientId),
      patientId: patient?.patientId ?? payment.patientId,
    },
    branch,
  }
  if (!canPrintOfficialReceipt(payload)) return
  openOfficialReceiptWindow(payload)
}

function lastSevenDays() {
  const now = new Date()
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now)
    date.setDate(now.getDate() - (6 - index))
    const key = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    return { key, label: date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }) }
  })
}

export function BillingPageV14() {
  const permissions = usePermissions()
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState<BillingTab>('invoices')
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | InvoiceStatus>('all')
  const [branchId, setBranchId] = useState('all')
  const [method, setMethod] = useState<'all' | PaymentMethod>('all')
  const [voidTarget, setVoidTarget] = useState<Invoice | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pageSize, setPageSize] = useState(BILLING_DEFAULT_PAGE_SIZE)
  const [invoicePage, setInvoicePage] = useState(1)
  const [paymentPage, setPaymentPage] = useState(1)
  const [receivablePage, setReceivablePage] = useState(1)
  const [verificationPage, setVerificationPage] = useState(1)
  const [refundPage, setRefundPage] = useState(1)

  const data = useMemo(() => {
    void refreshKey
    const invoices = getStoredInvoices()
    const payments = getStoredPayments()
    const receipts = getStoredReceipts()
    const refunds = getStoredRefunds()
    const query = search.trim().toLowerCase()
    const filteredInvoices = invoices.filter((invoice) => {
      const matchesSearch = !query || invoice.invoiceNumber.toLowerCase().includes(query) || patientName(invoice.patientId).toLowerCase().includes(query)
      return matchesSearch && (status === 'all' || invoice.status === status) && (branchId === 'all' || invoice.branchId === branchId)
    })
    const filteredPayments = payments.filter((payment) => {
      const matchesSearch = !query || payment.paymentNumber.toLowerCase().includes(query) || patientName(payment.patientId).toLowerCase().includes(query)
      return matchesSearch && (method === 'all' || payment.paymentMethod === method) && (branchId === 'all' || payment.branchId === branchId)
    })
    return { invoices, payments, receipts, refunds, filteredInvoices, filteredPayments }
  }, [branchId, method, refreshKey, search, status])

  const selectedInvoice = selectedInvoiceId ? data.invoices.find((invoice) => invoice.id === selectedInvoiceId) : data.filteredInvoices[0]
  const pendingVerification = data.payments.filter((payment) => ['pending', 'pending_verification', 'processing'].includes(payment.status))
  const outstanding = data.invoices.filter((invoice) => invoice.balanceCents > 0 && invoice.status !== 'void')
  const billedAmount = data.invoices.filter((invoice) => invoice.status !== 'void').reduce((sum, invoice) => sum + invoice.totalCents, 0)
  const collections = data.payments.filter((payment) => ['completed', 'partially_refunded', 'refunded'].includes(payment.status)).reduce((sum, payment) => sum + payment.allocatedCents, 0)
  const refundsTotal = data.refunds.reduce((sum, refund) => sum + refund.amountCents, 0)
  const collectionRate = billedAmount > 0 ? Math.min(100, Math.round(((collections - refundsTotal) / billedAmount) * 100)) : 0
  const invoicePageCount = Math.max(1, Math.ceil(data.filteredInvoices.length / pageSize))
  const paymentPageCount = Math.max(1, Math.ceil(data.filteredPayments.length / pageSize))
  const receivablePageCount = Math.max(1, Math.ceil(outstanding.length / pageSize))
  const verificationPageCount = Math.max(1, Math.ceil(pendingVerification.length / pageSize))
  const refundPageCount = Math.max(1, Math.ceil(data.refunds.length / pageSize))
  const visibleInvoices = useMemo(() => slicePage(data.filteredInvoices, Math.min(invoicePage, invoicePageCount), pageSize), [data.filteredInvoices, invoicePage, invoicePageCount, pageSize])
  const visiblePayments = useMemo(() => slicePage(data.filteredPayments, Math.min(paymentPage, paymentPageCount), pageSize), [data.filteredPayments, paymentPage, paymentPageCount, pageSize])
  const visibleReceivables = useMemo(() => slicePage(outstanding, Math.min(receivablePage, receivablePageCount), pageSize), [outstanding, receivablePage, receivablePageCount, pageSize])
  const visibleVerification = useMemo(() => slicePage(pendingVerification, Math.min(verificationPage, verificationPageCount), pageSize), [pendingVerification, verificationPage, verificationPageCount, pageSize])
  const visibleRefunds = useMemo(() => slicePage(data.refunds, Math.min(refundPage, refundPageCount), pageSize), [data.refunds, refundPage, refundPageCount, pageSize])

  useEffect(() => {
    setInvoicePage(1)
    setPaymentPage(1)
    setReceivablePage(1)
    setVerificationPage(1)
    setRefundPage(1)
  }, [activeTab, branchId, method, pageSize, search, status])

  useEffect(() => {
    setInvoicePage((page) => Math.min(page, invoicePageCount))
    setPaymentPage((page) => Math.min(page, paymentPageCount))
    setReceivablePage((page) => Math.min(page, receivablePageCount))
    setVerificationPage((page) => Math.min(page, verificationPageCount))
    setRefundPage((page) => Math.min(page, refundPageCount))
  }, [invoicePageCount, paymentPageCount, receivablePageCount, refundPageCount, verificationPageCount])

  const trend = useMemo(() => lastSevenDays().map((day) => ({ ...day, amount: data.payments.filter((payment) => ['completed','partially_refunded','refunded'].includes(payment.status) && payment.date === day.key).reduce((sum, payment) => sum + payment.allocatedCents, 0) })), [data.payments])
  const trendMax = Math.max(1, ...trend.map((entry) => entry.amount))

  function refresh() { setRefreshKey((key) => key + 1) }

  async function confirmVoid() {
    if (!voidTarget || !voidReason.trim() || actionPending) return
    setActionError(null); setActionPending(`void:${voidTarget.id}`)
    try {
      await voidInvoicePersisted(voidTarget.id, voidReason.trim())
      setVoidTarget(null); setVoidReason(''); refresh()
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Unable to void this invoice.') }
    finally { setActionPending(null) }
  }

  async function confirmRefund() {
    if (!refundTarget || !refundReason.trim() || actionPending) return
    const cents = Math.round(Number(refundAmount) * 100)
    if (!Number.isFinite(cents) || cents <= 0 || cents > refundTarget.refundableCents) return
    setActionError(null); setActionPending(`refund:${refundTarget.id}`)
    try {
      await refundPaymentPersisted({ paymentId: refundTarget.id, amountCents: cents, reason: refundReason.trim() })
      setRefundTarget(null); setRefundAmount(''); setRefundReason(''); refresh()
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Unable to create this refund.') }
    finally { setActionPending(null) }
  }

  async function verifyPayment(payment: Payment) {
    if (actionPending) return
    setActionError(null); setActionPending(`verify:${payment.id}`)
    try { await verifySubmittedPaymentPersisted(payment.id); refresh() }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Unable to verify this payment.') }
    finally { setActionPending(null) }
  }

  async function rejectPayment(payment: Payment) {
    if (actionPending) return
    const internalReason = window.prompt('Internal reason for rejecting this payment proof:')?.trim()
    if (!internalReason) return
    const patientReason = window.prompt('Patient-visible reason (optional):', 'Payment proof could not be verified.')?.trim() ?? ''
    setActionError(null); setActionPending(`reject:${payment.id}`)
    try { await rejectSubmittedPaymentPersisted(payment.id, internalReason, patientReason); refresh() }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Unable to reject this payment.') }
    finally { setActionPending(null) }
  }

  return (
    <PageScaffold title="Billing & Payments" description="Invoices, collections, receivables, refunds and payment verification.">
      <section className="bill14-page" key={refreshKey}>
        {actionError && <div className="inline-alert" role="alert">{actionError}</div>}
        <header className="bill14-command-header">
          <div><span className="bill14-kicker">Financial operations</span><h2>Revenue & patient accounts</h2><p>Monitor billing activity, outstanding balances and verified collections from one finance workspace.</p></div>
          {permissions.can('payments.record_manual') && <PaymentRecorderButtonV14 onSuccess={refresh} />}
        </header>

        <section className="bill14-metrics">
          <article><span><FileText size={16}/> Billed amount</span><strong>{formatCurrency(billedAmount)}</strong><small>Non-void invoices</small></article>
          <article><span><CircleDollarSign size={16}/> Collections</span><strong>{formatCurrency(Math.max(0, collections - refundsTotal))}</strong><small>{collectionRate}% of billed amount</small></article>
          <article><span><Landmark size={16}/> Receivables</span><strong>{formatCurrency(getOutstandingBalanceTotal())}</strong><small>{outstanding.length} open invoice{outstanding.length === 1 ? '' : 's'}</small></article>
          <article><span><RotateCcw size={16}/> Refunds</span><strong>{formatCurrency(refundsTotal)}</strong><small>{data.refunds.length} refund record{data.refunds.length === 1 ? '' : 's'}</small></article>
        </section>

        <div className="bill14-insights-grid">
          <section className="bill14-chart-card"><div className="bill14-card-head"><div><span className="bill14-kicker">7-day activity</span><h3>Collections trend</h3></div><TrendingUp size={18}/></div><div className="bill14-bars" aria-label="Collections over the last seven days">{trend.map((entry) => <div className="bill14-bar-col" key={entry.key}><div className="bill14-bar-track"><span style={{ height: `${Math.max(4, (entry.amount / trendMax) * 100)}%` }} /></div><strong>{entry.amount > 0 ? formatCurrency(entry.amount) : '₱0'}</strong><small>{entry.label}</small></div>)}</div></section>
          <section className="bill14-flow-card"><div className="bill14-card-head"><div><span className="bill14-kicker">Account health</span><h3>Collection pipeline</h3></div><ShieldCheck size={18}/></div><div className="bill14-flow-list"><div><span>Today’s collections</span><strong>{formatCurrency(getTodayRevenue())}</strong></div><div><span>Partially paid invoices</span><strong>{getPartiallyPaidInvoiceCount()}</strong></div><div><span>Pending verification</span><strong>{getPendingPaymentsCount()}</strong></div><div><span>Collection rate</span><strong>{collectionRate}%</strong></div></div><div className="bill14-progress"><span style={{ width: `${collectionRate}%` }} /></div></section>
        </div>

        <nav className="bill14-tabs" aria-label="Billing sections">{(['invoices','payments','outstanding','verification','refunds'] as BillingTab[]).map((tab) => <button key={tab} type="button" className={activeTab === tab ? 'is-active' : ''} onClick={() => setActiveTab(tab)}>{tab === 'outstanding' ? 'Receivables' : tab.replace('_',' ')}</button>)}</nav>
        <section className="bill14-filter-card"><label className="bill14-search"><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patient, invoice or payment number..." /></label><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>{invoiceStatuses.map((entry) => <option key={entry} value={entry}>{entry === 'all' ? 'All invoice statuses' : entry.replaceAll('_',' ')}</option>)}</select><select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="all">All branches</option>{getStoredBranches().map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}><option value="all">All payment methods</option>{getActivePaymentMethods().map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></section>

        {activeTab === 'invoices' && <div className="bill14-invoice-layout"><section className="bill14-registry-card"><div className="bill14-card-head"><div><span className="bill14-kicker">Invoice registry</span><h3>{data.filteredInvoices.length} invoice{data.filteredInvoices.length === 1 ? '' : 's'}</h3></div><ReceiptText size={18}/></div><div className="bill14-invoice-list">{visibleInvoices.map((invoice) => <button key={invoice.id} type="button" className={selectedInvoice?.id === invoice.id ? 'is-active' : ''} onClick={() => setSelectedInvoiceId(invoice.id)}><div><strong>{invoice.invoiceNumber}</strong><span>{patientName(invoice.patientId)}</span><small>{formatDate(invoice.invoiceDate)} · {branchName(invoice.branchId)}</small></div><div><StatusBadge status={invoice.status} variant="compact" /><strong>{formatCurrency(invoice.balanceCents)}</strong><small>of {formatCurrency(invoice.totalCents)}</small></div></button>)}{!data.filteredInvoices.length && <div className="bill14-empty">No invoices match the current filters.</div>}</div><Pagination page={invoicePage} pageCount={invoicePageCount} totalItems={data.filteredInvoices.length} pageSize={pageSize} pageSizeOptions={BILLING_PAGE_SIZE_OPTIONS} onPageChange={setInvoicePage} onPageSizeChange={setPageSize} label="Invoice registry pages" /></section><aside className="bill14-detail-card">{selectedInvoice ? <><div className="bill14-detail-head"><div><span className="bill14-kicker">Invoice detail</span><h3>{selectedInvoice.invoiceNumber}</h3><p>{patientName(selectedInvoice.patientId)}</p></div><StatusBadge status={selectedInvoice.status} /></div><div className="bill14-detail-metrics"><div><span>Total</span><strong>{formatCurrency(selectedInvoice.totalCents)}</strong></div><div><span>Paid</span><strong>{formatCurrency(selectedInvoice.amountPaidCents)}</strong></div><div className="is-balance"><span>Balance</span><strong>{formatCurrency(selectedInvoice.balanceCents)}</strong></div></div><div className="bill14-detail-meta"><div><span>Branch</span><strong>{branchName(selectedInvoice.branchId)}</strong></div><div><span>Subtotal</span><strong>{formatCurrency(selectedInvoice.subtotalCents)}</strong></div><div><span>Discounts</span><strong>{formatCurrency(selectedInvoice.discountCents)}</strong></div></div><div className="bill14-subsection bill14-scroll-section"><div className="bill14-subhead"><span>Invoice items</span><strong>{selectedInvoice.items.length}</strong></div>{selectedInvoice.items.map((item) => <div key={item.id} className="bill14-line-item"><div><strong>{item.description}</strong><small>{item.providerNameSnapshot || 'Provider attribution pending'} · Qty {item.quantity}</small></div><strong>{formatCurrency(item.amountCents ?? item.quantity * item.unitPriceCents)}</strong></div>)}</div><div className="bill14-subsection bill14-scroll-section"><div className="bill14-subhead"><span>Payments</span><strong>{getPaymentsByInvoice(selectedInvoice.id).length}</strong></div>{getPaymentsByInvoice(selectedInvoice.id).map((payment) => <div key={payment.id} className="bill14-line-item"><div><strong>{payment.paymentNumber}</strong><small>{getPaymentMethodLabel(payment.paymentMethod)} · {formatDate(payment.date)}</small></div><strong>{formatCurrency(payment.amountCents)}</strong></div>)}</div>{permissions.can('billing.void_invoice') && selectedInvoice.amountPaidCents === 0 && selectedInvoice.status !== 'void' && <Button variant="danger" size="sm" icon={<Ban size={14}/>} onClick={() => { setActionError(null); setVoidTarget(selectedInvoice) }}>Void invoice</Button>}</> : <div className="bill14-empty">Select an invoice to view details.</div>}</aside></div>}

        {activeTab === 'payments' && <section className="bill14-registry-card"><div className="bill14-card-head"><div><span className="bill14-kicker">Payment ledger</span><h3>{data.filteredPayments.length} payments</h3></div><CreditCard size={18}/></div><div className="bill14-payment-list">{visiblePayments.map((payment) => <article key={payment.id}><div><strong>{payment.paymentNumber}</strong><span>{patientName(payment.patientId)}</span><small>{getPaymentMethodLabel(payment.paymentMethod)} · {branchName(payment.branchId)} · {formatDate(payment.date)}</small></div><div><StatusBadge status={payment.status} variant="compact" /><strong>{formatCurrency(payment.amountCents)}</strong><div className="bill14-row-actions">{data.receipts.some((receipt) => receipt.paymentId === payment.id) && <Button variant="ghost" size="sm" icon={<Printer size={14}/>} onClick={() => printReceipt(payment)}>Receipt</Button>}{permissions.can('payments.refund') && payment.refundableCents > 0 && <Button variant="secondary" size="sm" icon={<RotateCcw size={14}/>} onClick={() => { setActionError(null); setRefundTarget(payment); setRefundAmount(String(payment.refundableCents / 100)) }}>Refund</Button>}</div></div></article>)}{!data.filteredPayments.length && <div className="bill14-empty">No payments match the current filters.</div>}</div><Pagination page={paymentPage} pageCount={paymentPageCount} totalItems={data.filteredPayments.length} pageSize={pageSize} pageSizeOptions={BILLING_PAGE_SIZE_OPTIONS} onPageChange={setPaymentPage} onPageSizeChange={setPageSize} label="Payment ledger pages" /></section>}

        {activeTab === 'outstanding' && <section className="bill14-registry-card"><div className="bill14-card-head"><div><span className="bill14-kicker">Receivables</span><h3>Outstanding balances</h3></div><Landmark size={18}/></div><div className="bill14-receivable-grid">{visibleReceivables.map((invoice) => <article key={invoice.id}><span className="bill14-receivable-patient">{patientName(invoice.patientId)}</span><strong>{formatCurrency(invoice.balanceCents)}</strong><small>{invoice.invoiceNumber} · {branchName(invoice.branchId)}</small><p>{getLedgerByPatient(invoice.patientId).slice(0,2).map((entry) => entry.label).join(' · ') || 'No recent ledger entries'}</p></article>)}{!outstanding.length && <div className="bill14-empty">No outstanding balances.</div>}</div><Pagination page={receivablePage} pageCount={receivablePageCount} totalItems={outstanding.length} pageSize={pageSize} pageSizeOptions={BILLING_PAGE_SIZE_OPTIONS} onPageChange={setReceivablePage} onPageSizeChange={setPageSize} label="Receivables pages" /></section>}

        {activeTab === 'verification' && <section className="bill14-registry-card"><div className="bill14-card-head"><div><span className="bill14-kicker">Verification queue</span><h3>{pendingVerification.length} pending proofs</h3></div><ShieldCheck size={18}/></div><div className="bill14-payment-list">{visibleVerification.map((payment) => <article key={payment.id}><div><strong>{payment.paymentNumber}</strong><span>{patientName(payment.patientId)}</span><small>{payment.referenceNumber || 'No reference'} · {payment.proofFilePath || 'No proof file path recorded'}</small></div><div><strong>{formatCurrency(payment.amountCents)}</strong><div className="bill14-row-actions">{permissions.canAny(['payments.verify','payments.confirm']) && <Button size="sm" icon={<CheckCircle2 size={14}/>} disabled={Boolean(actionPending)} onClick={() => void verifyPayment(payment)}>{actionPending === `verify:${payment.id}` ? 'Verifying…' : 'Approve'}</Button>}{permissions.can('payments.reject') && <Button variant="danger" size="sm" icon={<XCircle size={14}/>} disabled={Boolean(actionPending)} onClick={() => void rejectPayment(payment)}>{actionPending === `reject:${payment.id}` ? 'Rejecting…' : 'Reject'}</Button>}</div></div></article>)}{!pendingVerification.length && <div className="bill14-empty">No payment proofs are awaiting review.</div>}</div><Pagination page={verificationPage} pageCount={verificationPageCount} totalItems={pendingVerification.length} pageSize={pageSize} pageSizeOptions={BILLING_PAGE_SIZE_OPTIONS} onPageChange={setVerificationPage} onPageSizeChange={setPageSize} label="Verification queue pages" /></section>}

        {activeTab === 'refunds' && <section className="bill14-registry-card"><div className="bill14-card-head"><div><span className="bill14-kicker">Refund history</span><h3>{data.refunds.length} refunds</h3></div><RotateCcw size={18}/></div><div className="bill14-payment-list">{visibleRefunds.map((refund) => <article key={refund.id}><div><strong>{refund.refundNumber}</strong><span>{patientName(refund.patientId)}</span><small>{branchName(refund.branchId)} · {formatDate(refund.processedAt)} · {refund.reason}</small></div><div><StatusBadge status={refund.status} variant="compact" /><strong>{formatCurrency(refund.amountCents)}</strong></div></article>)}{!data.refunds.length && <div className="bill14-empty">No refunds recorded.</div>}</div><Pagination page={refundPage} pageCount={refundPageCount} totalItems={data.refunds.length} pageSize={pageSize} pageSizeOptions={BILLING_PAGE_SIZE_OPTIONS} onPageChange={setRefundPage} onPageSizeChange={setPageSize} label="Refund history pages" /></section>}

        <div className="bill14-provider-note"><CreditCard size={17}/><div><strong>Online collections remain provider-backed.</strong><p>Gateway secret keys and webhook signing secrets must stay server-side. This workspace does not infer successful external delivery or settlement.</p></div></div>

        {voidTarget && <div className="modal-backdrop bill14-action-backdrop" role="presentation" onClick={() => { if (!actionPending) setVoidTarget(null) }}><section className="bill14-action-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><span className="bill14-kicker">Invoice control</span><h3>Void {voidTarget.invoiceNumber}?</h3><p>This invoice has no recorded payments. Enter a reason to preserve the audit trail.</p><textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Reason for voiding this invoice" rows={4} disabled={Boolean(actionPending)}/>{actionError && <div className="inline-alert" role="alert">{actionError}</div>}<div><Button variant="secondary" onClick={() => setVoidTarget(null)} disabled={Boolean(actionPending)}>Cancel</Button><Button variant="danger" disabled={!voidReason.trim() || Boolean(actionPending)} onClick={() => void confirmVoid()}>{actionPending?.startsWith('void:') ? 'Voiding…' : 'Void invoice'}</Button></div></section></div>}

        {refundTarget && <div className="modal-backdrop bill14-action-backdrop" role="presentation" onClick={() => { if (!actionPending) setRefundTarget(null) }}><section className="bill14-action-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><span className="bill14-kicker">Refund payment</span><h3>{refundTarget.paymentNumber}</h3><p>Refundable amount: {formatCurrency(refundTarget.refundableCents)}</p><label><span>Refund amount (PHP)</span><input type="number" step="0.01" min="0.01" max={refundTarget.refundableCents / 100} value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} disabled={Boolean(actionPending)}/></label><label><span>Reason</span><textarea value={refundReason} onChange={(event) => setRefundReason(event.target.value)} rows={4} placeholder="Reason for refund" disabled={Boolean(actionPending)}/></label>{actionError && <div className="inline-alert" role="alert">{actionError}</div>}<div><Button variant="secondary" onClick={() => setRefundTarget(null)} disabled={Boolean(actionPending)}>Cancel</Button><Button variant="danger" disabled={!refundReason.trim() || Number(refundAmount) <= 0 || Math.round(Number(refundAmount)*100) > refundTarget.refundableCents || Boolean(actionPending)} onClick={() => void confirmRefund()}>{actionPending?.startsWith('refund:') ? 'Refunding…' : 'Create refund'}</Button></div></section></div>}
      </section>
    </PageScaffold>
  )
}
