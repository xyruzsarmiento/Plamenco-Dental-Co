import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleDollarSign, FilePlus2, FileText, Landmark, Plus, Printer, ReceiptText, RotateCcw, Search, X } from 'lucide-react'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Pagination } from '../components/ui/DesignSystem'
import { usePermissions } from '../features/auth/permissions'
import { useBranchContext } from '../features/branches/BranchContext'
import {
  formatCurrency,
  getActivePaymentMethods,
  getStoredCharges,
  getStoredInvoices,
  getStoredPayments,
  getStoredReceipts,
  getStoredRefunds,
  type InvoiceItem,
  type Payment,
  type PaymentMethod,
} from '../features/billing/billingStore'
import { createInvoicePersisted, recordManualPaymentPersisted, refundPaymentPersisted } from '../features/billing/billingPersistence'
import { canPrintOfficialReceipt, openOfficialReceiptWindow } from '../features/billing/receiptDocument'
import { getStoredPatients } from '../features/patients/patientStore'
import { BillingPageV46 } from './BillingPageV46'

type Tab = 'invoices' | 'payments' | 'receivables' | 'receipts' | 'refunds'
const PAGE_SIZE = 10

function pageItems<T>(rows: T[], page: number) {
  return rows.slice((Math.max(1, page) - 1) * PAGE_SIZE, Math.max(1, page) * PAGE_SIZE)
}

function patientName(patientId: string) {
  const patient = getStoredPatients().find((row) => row.id === patientId || row.patientId === patientId)
  return patient ? `${patient.firstName} ${patient.lastName}`.trim() : patientId
}

function dateLabel(value: string) {
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00+08:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
}

function todayManila() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function BranchPaymentModal({ branchId, branchName, onClose, onSuccess }: { branchId: string; branchName: string; onClose: () => void; onSuccess: () => void }) {
  const invoices = useMemo(() => getStoredInvoices().filter((invoice) => invoice.branchId === branchId && invoice.balanceCents > 0 && invoice.status !== 'void'), [branchId])
  const patients = useMemo(() => getStoredPatients(), [])
  const methods = useMemo(() => getActivePaymentMethods().filter((method) => !method.isOnline), [])
  const [patientId, setPatientId] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [date, setDate] = useState(todayManila())
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patient = patients.find((row) => row.id === patientId || row.patientId === patientId)
  const patientInvoices = invoices.filter((invoice) => !patient || invoice.patientId === patient.id || invoice.patientId === patient.patientId)
  const invoice = invoices.find((row) => row.id === invoiceId)
  const selectedMethod = methods.find((row) => row.id === method)
  const amountCents = Math.round(Number(amount || 0) * 100)

  async function submit() {
    if (busy) return
    if (!invoice || invoice.branchId !== branchId) return setError('Choose an outstanding invoice from this branch.')
    if (amountCents <= 0 || amountCents > invoice.balanceCents) return setError(`Payment must be between ₱0.01 and ${formatCurrency(invoice.balanceCents)}.`)
    if (selectedMethod?.requiresReference && !reference.trim()) return setError(`${selectedMethod.label} requires a reference number.`)
    setBusy(true); setError(null)
    try {
      await recordManualPaymentPersisted({ invoiceId: invoice.id, amountCents, paymentMethod: method, date, referenceNumber: reference.trim() || undefined, notes: notes.trim() })
      onSuccess(); onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Payment could not be recorded.')
    } finally { setBusy(false) }
  }

  return <div className="modal-backdrop pay14-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
    <section className="bill123-modal" role="dialog" aria-modal="true" aria-labelledby="bill123-payment-title">
      <header><div><span>BRANCH COLLECTION</span><h2 id="bill123-payment-title">Record payment</h2><p>{branchName}</p></div><button type="button" aria-label="Close" onClick={onClose} disabled={busy}><X size={19}/></button></header>
      <div className="bill123-modal-body">
        <div className="bill123-branch-lock"><Landmark size={17}/><div><strong>{branchName}</strong><span>The payment branch is inherited from the selected invoice and cannot be changed here.</span></div></div>
        {error && <div className="inline-alert" role="alert">{error}</div>}
        <div className="bill123-form-grid">
          <label><span>Patient</span><select value={patientId} onChange={(event) => { setPatientId(event.target.value); setInvoiceId('') }} disabled={busy}><option value="">Select patient</option>{patients.filter((row) => invoices.some((invoice) => invoice.patientId === row.id || invoice.patientId === row.patientId)).map((row) => <option key={row.id} value={row.id}>{row.firstName} {row.lastName} · {row.patientId}</option>)}</select></label>
          <label><span>Invoice</span><select value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)} disabled={busy || !patientId}><option value="">Select outstanding invoice</option>{patientInvoices.map((row) => <option key={row.id} value={row.id}>{row.invoiceNumber} · {formatCurrency(row.balanceCents)} due</option>)}</select></label>
          <label><span>Amount (PHP)</span><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={!invoice || busy}/></label>
          <label><span>Payment date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={busy}/></label>
          <label><span>Payment method</span><select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)} disabled={busy}>{methods.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
          <label><span>Reference</span><input value={reference} onChange={(event) => setReference(event.target.value)} disabled={busy}/></label>
          <label className="is-wide"><span>Internal note</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} disabled={busy}/></label>
        </div>
      </div>
      <footer><div>{invoice && <><span>Outstanding</span><strong>{formatCurrency(invoice.balanceCents)}</strong></>}</div><div><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => void submit()} disabled={busy || !invoice}>{busy ? 'Recording…' : 'Record payment'}</Button></div></footer>
    </section>
  </div>
}

function BranchInvoiceModal({ branchId, branchName, onClose, onSuccess }: { branchId: string; branchName: string; onClose: () => void; onSuccess: () => void }) {
  const patients = useMemo(() => getStoredPatients(), [])
  const charges = useMemo(() => getStoredCharges().filter((charge) => charge.status === 'unbilled' && charge.branchId === branchId), [branchId])
  const [patientId, setPatientId] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(todayManila())
  const [dueDate, setDueDate] = useState('')
  const [selectedCharges, setSelectedCharges] = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const patient = patients.find((row) => row.id === patientId || row.patientId === patientId)
  const eligible = charges.filter((charge) => !patient || charge.patientId === patient.id || charge.patientId === patient.patientId)
  const items = useMemo<InvoiceItem[]>(() => {
    const fromCharges: InvoiceItem[] = selectedCharges.flatMap((id) => {
      const charge = charges.find((row) => row.id === id)
      return charge ? [{ id: `line-${charge.id}`, chargeId: charge.id, treatmentId: charge.treatmentId, serviceId: charge.serviceId, providerId: charge.providerId, providerNameSnapshot: charge.providerNameSnapshot, branchId, description: charge.description, quantity: charge.quantity, unitPriceCents: charge.unitPriceCents, discountCents: charge.discountCents }] : []
    })
    const q = Number(quantity), price = Number(unitPrice)
    if (description.trim() && Number.isInteger(q) && q > 0 && Number.isFinite(price) && price >= 0) fromCharges.push({ id: `manual-${Date.now()}`, branchId, description: description.trim(), quantity: q, unitPriceCents: Math.round(price * 100), discountCents: 0 })
    return fromCharges
  }, [branchId, charges, description, quantity, selectedCharges, unitPrice])
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents - (item.discountCents ?? 0), 0)

  async function submit() {
    if (!patient || !items.length || busy) return setError('Select a patient and add at least one valid invoice item.')
    if (items.some((item) => item.branchId !== branchId)) return setError('All invoice lines must belong to the active branch.')
    setBusy(true); setError(null)
    try {
      await createInvoicePersisted({ patientDbId: patient.id, branchId, invoiceDate, dueDate: dueDate || undefined, items, notes: notes.trim() })
      onSuccess(); onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invoice could not be created.') }
    finally { setBusy(false) }
  }

  return <div className="modal-backdrop inv32-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
    <section className="bill123-modal" role="dialog" aria-modal="true" aria-labelledby="bill123-invoice-title">
      <header><div><span>BRANCH BILLING</span><h2 id="bill123-invoice-title">Create patient invoice</h2><p>{branchName}</p></div><button type="button" aria-label="Close" onClick={onClose} disabled={busy}><X size={19}/></button></header>
      <div className="bill123-modal-body">
        <div className="bill123-branch-lock"><Landmark size={17}/><div><strong>{branchName}</strong><span>This invoice and every manual line are issued by the active branch.</span></div></div>
        {error && <div className="inline-alert" role="alert">{error}</div>}
        <div className="bill123-form-grid">
          <label><span>Patient</span><select value={patientId} onChange={(event) => { setPatientId(event.target.value); setSelectedCharges([]) }} disabled={busy}><option value="">Select patient</option>{patients.map((row) => <option key={row.id} value={row.id}>{row.firstName} {row.lastName} · {row.patientId}</option>)}</select></label>
          <label><span>Issuing branch</span><input value={branchName} readOnly/></label>
          <label><span>Invoice date</span><input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} disabled={busy}/></label>
          <label><span>Due date</span><input type="date" min={invoiceDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={busy}/></label>
        </div>
        <section className="bill123-charge-section"><span>UNBILLED CLINICAL CHARGES · {branchName.toUpperCase()}</span>{!patientId ? <p>Select a patient to view branch charges.</p> : eligible.length ? eligible.map((charge) => <label key={charge.id}><input type="checkbox" checked={selectedCharges.includes(charge.id)} onChange={() => setSelectedCharges((current) => current.includes(charge.id) ? current.filter((id) => id !== charge.id) : [...current, charge.id])}/><span><strong>{charge.description}</strong><small>{formatCurrency(charge.finalAmountCents)}</small></span></label>) : <p>No unbilled charges for this patient in this branch.</p>}</section>
        <div className="bill123-form-grid"><label className="is-wide"><span>Manual line description</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional manual charge"/></label><label><span>Quantity</span><input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)}/></label><label><span>Price (PHP)</span><input type="number" min="0" step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)}/></label><label className="is-wide"><span>Internal note</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)}/></label></div>
      </div>
      <footer><div><span>Total due</span><strong>{formatCurrency(total)}</strong></div><div><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => void submit()} disabled={busy || !patient || !items.length}>{busy ? 'Creating…' : 'Create invoice'}</Button></div></footer>
    </section>
  </div>
}

function ScopedBilling() {
  const { activeBranch, activeBranchId, authorizedBranchIds } = useBranchContext()
  const permissions = usePermissions()
  const [revision, setRevision] = useState(0)
  const [tab, setTab] = useState<Tab>('invoices')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const invoices = useMemo(() => { void revision; return getStoredInvoices().filter((row) => row.branchId === activeBranchId) }, [activeBranchId, revision])
  const invoiceIds = useMemo(() => new Set(invoices.map((row) => row.id)), [invoices])
  const payments = useMemo(() => { void revision; return getStoredPayments().filter((row) => row.branchId === activeBranchId && invoiceIds.has(row.invoiceId)) }, [activeBranchId, invoiceIds, revision])
  const paymentIds = useMemo(() => new Set(payments.map((row) => row.id)), [payments])
  const receipts = useMemo(() => { void revision; return getStoredReceipts().filter((row) => row.branchId === activeBranchId && paymentIds.has(row.paymentId)) }, [activeBranchId, paymentIds, revision])
  const refunds = useMemo(() => { void revision; return getStoredRefunds().filter((row) => row.branchId === activeBranchId && paymentIds.has(row.paymentId)) }, [activeBranchId, paymentIds, revision])
  const outstanding = invoices.filter((invoice) => invoice.balanceCents > 0 && invoice.status !== 'void')
  const billed = invoices.filter((invoice) => invoice.status !== 'void').reduce((sum, invoice) => sum + invoice.totalCents, 0)
  const collectedGross = payments.filter((payment) => ['completed', 'partially_refunded', 'refunded'].includes(payment.status)).reduce((sum, payment) => sum + payment.allocatedCents, 0)
  const refunded = refunds.reduce((sum, refund) => sum + refund.amountCents, 0)
  const collections = Math.max(0, collectedGross - refunded)
  const receivables = outstanding.reduce((sum, invoice) => sum + invoice.balanceCents, 0)
  const q = search.trim().toLowerCase()
  const filteredInvoices = invoices.filter((row) => !q || `${row.invoiceNumber} ${patientName(row.patientId)}`.toLowerCase().includes(q))
  const filteredPayments = payments.filter((row) => !q || `${row.paymentNumber} ${patientName(row.patientId)}`.toLowerCase().includes(q))
  const filteredReceipts = receipts.filter((row) => !q || `${row.receiptNumber} ${patientName(row.patientId)}`.toLowerCase().includes(q))
  const filteredRefunds = refunds.filter((row) => !q || `${row.refundNumber} ${patientName(row.patientId)}`.toLowerCase().includes(q))
  const sourceRows: unknown[] = tab === 'invoices' ? filteredInvoices : tab === 'payments' ? filteredPayments : tab === 'receivables' ? outstanding : tab === 'receipts' ? filteredReceipts : filteredRefunds
  const pageCount = Math.max(1, Math.ceil(sourceRows.length / PAGE_SIZE))
  useEffect(() => setPage(1), [activeBranchId, search, tab])
  useEffect(() => setPage((current) => Math.min(current, pageCount)), [pageCount])

  if (!activeBranch || !activeBranchId) return <section className="bill123-page"><div className="bill123-empty"><Landmark size={28}/><h3>No branch workspace selected</h3><p>Select an authorized branch before using billing operations.</p></div></section>

  function refresh() { setRevision((value) => value + 1); setError(null) }
  function printReceipt(payment: Payment) {
    const receipt = receipts.find((row) => row.paymentId === payment.id)
    const invoice = invoices.find((row) => row.id === payment.invoiceId)
    const patient = getStoredPatients().find((row) => row.id === payment.patientId || row.patientId === payment.patientId)
    const payload = { receipt, payment, invoice, patient: { name: patient ? `${patient.firstName} ${patient.lastName}`.trim() : patientName(payment.patientId), patientId: patient?.patientId ?? payment.patientId }, branch: activeBranch ?? undefined }
    if (canPrintOfficialReceipt(payload)) openOfficialReceiptWindow(payload)
  }
  async function confirmRefund() {
    if (!refundTarget) return
    const cents = Math.round(Number(refundAmount) * 100)
    if (!Number.isFinite(cents) || cents <= 0 || cents > refundTarget.refundableCents || !refundReason.trim()) return setError('Enter a valid refund amount and reason.')
    if (refundTarget.branchId !== activeBranchId) return setError('This payment does not belong to the active branch.')
    try { await refundPaymentPersisted({ paymentId: refundTarget.id, amountCents: cents, reason: refundReason.trim() }); setRefundTarget(null); setRefundAmount(''); setRefundReason(''); refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Refund could not be recorded.') }
  }

  return <section className="bill123-page" data-billing-scope-key={`billing:${activeBranchId}:${authorizedBranchIds.join(',')}`}>
    <header className="bill14-command-header bill123-hero"><div><span className="bill14-kicker">FINANCIAL OPERATIONS · {activeBranch.name.toUpperCase()}</span><h2>Revenue & patient accounts</h2><p>Invoices, payments, receipts, refunds and receivables issued by {activeBranch.name}.</p></div><div className="bill123-actions">{permissions.can('billing.create') && <Button icon={<FilePlus2 size={16}/>} onClick={() => setInvoiceOpen(true)}>New invoice</Button>}{permissions.can('payments.record_manual') && <Button variant="secondary" icon={<Plus size={16}/>} onClick={() => setPaymentOpen(true)}>Record payment</Button>}</div></header>
    <section className="bill123-branch-context"><div><span>ISSUING BRANCH</span><strong>{activeBranch.name}</strong><small>Financial records in this workspace remain tied to this branch.</small></div><Badge tone="info">Branch finance scope</Badge></section>
    <section className="bill14-metrics"><article><span><FileText size={16}/> Billed amount</span><strong>{formatCurrency(billed)}</strong><small>{activeBranch.name} non-void invoices</small></article><article><span><CircleDollarSign size={16}/> Collections</span><strong>{formatCurrency(collections)}</strong><small>Net of branch refunds</small></article><article><span><Landmark size={16}/> Receivables</span><strong>{formatCurrency(receivables)}</strong><small>{outstanding.length} open invoice{outstanding.length === 1 ? '' : 's'}</small></article><article><span><RotateCcw size={16}/> Refunds</span><strong>{formatCurrency(refunded)}</strong><small>{refunds.length} branch refund record{refunds.length === 1 ? '' : 's'}</small></article></section>
    <nav className="bill14-tabs" aria-label="Billing sections">{(['invoices','payments','receivables','receipts','refunds'] as Tab[]).map((item) => <button key={item} type="button" className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)}>{item}</button>)}</nav>
    <section className="bill14-filter-card"><label className="bill14-search"><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patient, invoice, payment or receipt..."/></label><span className="bill123-filter-branch">{activeBranch.name}</span></section>
    {error && <div className="inline-alert" role="alert">{error}</div>}

    <section className="bill123-table-card">
      {tab === 'invoices' && <div className="bill123-list">{pageItems(filteredInvoices,page).map((invoice) => <article key={invoice.id}><div><ReceiptText size={17}/><span><strong>{invoice.invoiceNumber}</strong><small>{patientName(invoice.patientId)} · {activeBranch.name} · {dateLabel(invoice.invoiceDate)}</small></span></div><div><StatusBadge status={invoice.status} variant="compact"/><strong>{formatCurrency(invoice.totalCents)}</strong><small>{formatCurrency(invoice.balanceCents)} due</small></div></article>)}{!filteredInvoices.length && <div className="bill123-empty"><FileText size={24}/><h3>No invoices for this branch</h3></div>}</div>}
      {tab === 'payments' && <div className="bill123-list">{pageItems(filteredPayments,page).map((payment) => <article key={payment.id}><div><CircleDollarSign size={17}/><span><strong>{payment.paymentNumber}</strong><small>{patientName(payment.patientId)} · {activeBranch.name} · {dateLabel(payment.date)}</small></span></div><div><StatusBadge status={payment.status} variant="compact"/><strong>{formatCurrency(payment.amountCents)}</strong>{permissions.can('payments.refund') && payment.refundableCents > 0 && <Button size="sm" variant="secondary" onClick={() => setRefundTarget(payment)}>Refund</Button>}{canPrintOfficialReceipt({ receipt: receipts.find((row) => row.paymentId === payment.id), payment, invoice: invoices.find((row) => row.id === payment.invoiceId), patient: { name: patientName(payment.patientId), patientId: payment.patientId }, branch: activeBranch ?? undefined }) && <Button size="sm" variant="ghost" icon={<Printer size={13}/>} onClick={() => printReceipt(payment)}>Receipt</Button>}</div></article>)}</div>}
      {tab === 'receivables' && <div className="bill123-list">{pageItems(outstanding,page).map((invoice) => <article key={invoice.id}><div><Landmark size={17}/><span><strong>{invoice.invoiceNumber}</strong><small>{patientName(invoice.patientId)} · {activeBranch.name}</small></span></div><div><StatusBadge status={invoice.status} variant="compact"/><strong>{formatCurrency(invoice.balanceCents)}</strong><small>Outstanding</small></div></article>)}{!outstanding.length && <div className="bill123-empty"><Landmark size={24}/><h3>No open receivables</h3></div>}</div>}
      {tab === 'receipts' && <div className="bill123-list">{pageItems(filteredReceipts,page).map((receipt) => { const payment = payments.find((row) => row.id === receipt.paymentId); return <article key={receipt.id}><div><ReceiptText size={17}/><span><strong>{receipt.receiptNumber}</strong><small>{patientName(receipt.patientId)} · {activeBranch.name} · {dateLabel(receipt.issuedAt)}</small></span></div><div><strong>{formatCurrency(receipt.amountCents)}</strong>{payment && <Button size="sm" variant="ghost" icon={<Printer size={13}/>} onClick={() => printReceipt(payment)}>Print</Button>}</div></article> })}</div>}
      {tab === 'refunds' && <div className="bill123-list">{pageItems(filteredRefunds,page).map((refund) => <article key={refund.id}><div><RotateCcw size={17}/><span><strong>{refund.refundNumber}</strong><small>{patientName(refund.patientId)} · {activeBranch.name} · {dateLabel(refund.processedAt)}</small></span></div><div><StatusBadge status={refund.status} variant="compact"/><strong>{formatCurrency(refund.amountCents)}</strong></div></article>)}</div>}
      <Pagination page={page} pageCount={pageCount} totalItems={sourceRows.length} pageSize={PAGE_SIZE} onPageChange={setPage} label="Branch billing pages"/>
    </section>

    {paymentOpen && typeof document !== 'undefined' && createPortal(<BranchPaymentModal branchId={activeBranchId} branchName={activeBranch.name} onClose={() => setPaymentOpen(false)} onSuccess={refresh}/>, document.body)}
    {invoiceOpen && typeof document !== 'undefined' && createPortal(<BranchInvoiceModal branchId={activeBranchId} branchName={activeBranch.name} onClose={() => setInvoiceOpen(false)} onSuccess={refresh}/>, document.body)}
    {refundTarget && typeof document !== 'undefined' && createPortal(<div className="modal-backdrop pay14-backdrop" role="presentation"><section className="bill123-refund-modal" role="dialog" aria-modal="true"><header><div><span>BRANCH REFUND</span><h2>Refund {refundTarget.paymentNumber}</h2><p>{activeBranch.name}</p></div><button type="button" aria-label="Close" onClick={() => setRefundTarget(null)}><X size={18}/></button></header><div><p>The refund remains tied to the original payment and invoice branch.</p><label><span>Amount (PHP)</span><input type="number" min="0.01" step="0.01" max={refundTarget.refundableCents/100} value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)}/></label><label><span>Reason</span><textarea rows={4} value={refundReason} onChange={(event) => setRefundReason(event.target.value)}/></label></div><footer><Button variant="secondary" onClick={() => setRefundTarget(null)}>Cancel</Button><Button onClick={() => void confirmRefund()}>Record refund</Button></footer></section></div>, document.body)}
  </section>
}

export function BillingBranchWorkspaceV123() {
  const { isAllBranchesMode } = useBranchContext()
  if (isAllBranchesMode) return <BillingPageV46 />
  return <ScopedBilling />
}
