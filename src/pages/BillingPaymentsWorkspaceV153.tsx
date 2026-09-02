import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Banknote, Ban, ChevronDown, CreditCard, FilePlus2, FileText, MoreHorizontal, Pencil, Printer, ReceiptText, Search, ShieldCheck, X } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { StatusBadge } from '../components/ui/Badge'
import { usePermissions } from '../features/auth/permissions'
import { useAuth } from '../features/auth/AuthContext'
import { useBranchContext } from '../features/branches/BranchContext'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredPatients } from '../features/patients/patientStore'
import { getStoredServices, loadServicesFromSupabase, servicePriceToCents } from '../features/services/serviceStore'
import { acquireModalScrollLock } from '../lib/modalScrollLock'
import {
  formatCurrency,
  getActivePaymentMethods,
  getPaymentMethodLabel,
  getStoredCharges,
  getStoredInvoices,
  getStoredPayments,
  getStoredReceipts,
  type Invoice,
  type InvoiceItem,
  type Payment,
  type PaymentMethod,
  type Receipt,
} from '../features/billing/billingStore'
import {
  createInvoicePersisted,
  recordManualPaymentPersisted,
  updateDraftInvoicePersisted,
  voidInvoicePersisted,
} from '../features/billing/billingPersistence'
import { canPrintOfficialReceipt, openOfficialReceiptWindow } from '../features/billing/receiptDocument'
import { createUuid } from '../lib/id'

type BillingTab = 'invoices' | 'payments' | 'receivables' | 'receipts'
type DetailTarget = { kind: 'invoice'; invoice: Invoice } | { kind: 'payment'; payment: Payment } | { kind: 'receipt'; receipt: Receipt }
type InvoiceMode = 'create' | 'edit'
type DraftLine = { key: string; serviceId: string; description: string; quantity: string; unitPrice: string; discount: string }

const pageSize = 12

function todayManila() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

function dateLabel(value?: string) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
}

function emptyLine(): DraftLine {
  return { key: createUuid(), serviceId: '', description: '', quantity: '1', unitPrice: '', discount: '0' }
}

function lineFromItem(item: InvoiceItem): DraftLine {
  return {
    key: item.id || createUuid(),
    serviceId: item.serviceId ?? '',
    description: item.description,
    quantity: String(item.quantity),
    unitPrice: String((item.unitPriceCents / 100).toFixed(2)),
    discount: String(((item.discountCents ?? 0) / 100).toFixed(2)),
  }
}

function cents(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0
}

function rowKeyboard(event: KeyboardEvent<HTMLElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    action()
  }
}

function useDialogLock(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return
    const release = acquireModalScrollLock()
    const onKey = (event: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey as EventListener)
    return () => {
      window.removeEventListener('keydown', onKey as EventListener)
      release()
    }
  }, [active, onClose])
}

function patientName(patientId: string) {
  const patient = getStoredPatients().find((entry) => entry.id === patientId || entry.patientId === patientId)
  return patient ? `${patient.firstName} ${patient.lastName}`.trim() : patientId
}

function branchName(branchId?: string) {
  if (!branchId) return 'Unassigned'
  return getStoredBranches().find((entry) => entry.id === branchId)?.name ?? branchId
}

function hasFinalActivity(invoice: Invoice, payments: Payment[], receipts: Receipt[]) {
  const linkedPayments = payments.filter((payment) => payment.invoiceId === invoice.id)
  return invoice.amountPaidCents > 0 ||
    linkedPayments.some((payment) => ['completed', 'partially_refunded', 'refunded'].includes(payment.status)) ||
    receipts.some((receipt) => receipt.invoiceIds.includes(invoice.id) || linkedPayments.some((payment) => payment.id === receipt.paymentId))
}

function canMutateInvoice(invoice: Invoice, payments: Payment[], receipts: Receipt[], canEdit: boolean) {
  return canEdit && ['draft', 'unpaid'].includes(invoice.status) && !hasFinalActivity(invoice, payments, receipts)
}

function Drawer({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  useDialogLock(true, onClose)
  return createPortal(
    <div className="bp153-drawer-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="bp153-drawer" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        {children}
      </aside>
    </div>,
    document.body,
  )
}

function ActionDialog({ children, dialogClassName = '', onClose, title }: { children: ReactNode; dialogClassName?: string; onClose: () => void; title: string }) {
  useDialogLock(true, onClose)
  return createPortal(
    <div className="bp153-dialog-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className={`bp153-dialog ${dialogClassName}`.trim()} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        {children}
      </section>
    </div>,
    document.body,
  )
}

function InvoiceEditor({ mode, invoice, scopeBranchId, allowedBranchIds, onClose, onSuccess }: {
  mode: InvoiceMode
  invoice?: Invoice
  scopeBranchId?: string
  allowedBranchIds: string[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [patientId, setPatientId] = useState(invoice?.patientId ?? '')
  const [branchId, setBranchId] = useState(invoice?.branchId ?? scopeBranchId ?? allowedBranchIds[0] ?? '')
  const [invoiceDate, setInvoiceDate] = useState(invoice?.invoiceDate ?? todayManila())
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? '')
  const [notes, setNotes] = useState(invoice?.notes ?? '')
  const [lines, setLines] = useState<DraftLine[]>(invoice?.items.length ? invoice.items.map(lineFromItem) : [emptyLine()])
  const [selectedCharges, setSelectedCharges] = useState<string[]>([])
  const [services, setServices] = useState(() => getStoredServices())
  const [serviceLoadError, setServiceLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patients = useMemo(() => getStoredPatients(), [])
  const branches = useMemo(() => getStoredBranches().filter((branch) => allowedBranchIds.includes(branch.id)), [allowedBranchIds])
  const selectedPatient = patients.find((patient) => patient.id === patientId || patient.patientId === patientId)
  const selectedBranch = branches.find((branch) => branch.id === branchId)
  const activeServices = useMemo(() => services.filter((service) => {
    if (service.status !== 'active') return false
    if (branchId && service.branchIds?.length) return service.branchIds.includes(branchId)
    return true
  }), [branchId, services])
  const charges = useMemo(() => getStoredCharges().filter((charge) => {
    if (mode === 'edit') return false
    if (charge.status !== 'unbilled') return false
    if (branchId && charge.branchId && charge.branchId !== branchId) return false
    if (!selectedPatient) return true
    return charge.patientId === selectedPatient.id || charge.patientId === selectedPatient.patientId
  }), [branchId, mode, selectedPatient])

  useEffect(() => {
    let cancelled = false
    loadServicesFromSupabase({ strict: true })
      .then((freshServices) => {
        if (cancelled) return
        setServices(freshServices)
        setServiceLoadError(null)
      })
      .catch((cause) => {
        if (cancelled) return
        setServices([])
        setServiceLoadError(cause instanceof Error ? cause.message : 'Unable to load services from Supabase.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const items = useMemo<InvoiceItem[]>(() => {
    const chargeItems = selectedCharges.flatMap((id) => {
      const charge = charges.find((entry) => entry.id === id)
      if (!charge) return []
      return [{
        id: createUuid(),
        chargeId: charge.id,
        serviceId: charge.serviceId,
        branchId: charge.branchId ?? branchId,
        description: charge.description,
        quantity: charge.quantity,
        unitPriceCents: charge.unitPriceCents,
        discountCents: charge.discountCents,
        amountCents: charge.finalAmountCents,
      }]
    })
    const manualItems = lines.flatMap((line) => {
      const quantity = Number(line.quantity)
      const service = services.find((entry) => entry.id === line.serviceId)
      const description = line.description.trim() || service?.name || ''
      if (!description || !Number.isInteger(quantity) || quantity < 1) return []
      const unitPriceCents = cents(line.unitPrice)
      const discountCents = cents(line.discount)
      return [{
        id: line.key,
        serviceId: line.serviceId || undefined,
        branchId: branchId || undefined,
        description,
        quantity,
        unitPriceCents,
        discountCents,
        amountCents: Math.max(quantity * unitPriceCents - discountCents, 0),
      }]
    })
    return [...chargeItems, ...manualItems]
  }, [branchId, charges, lines, selectedCharges, services])
  const total = items.reduce((sum, item) => sum + (item.amountCents ?? item.quantity * item.unitPriceCents - (item.discountCents ?? 0)), 0)
  const selectedServiceCount = lines.filter((line) => line.serviceId).length
  const canSubmit = Boolean((selectedPatient || mode === 'edit') && branchId && invoiceDate && items.length && !busy)

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line))
  }

  function chooseService(key: string, serviceId: string) {
    const service = services.find((entry) => entry.id === serviceId)
    updateLine(key, {
      serviceId,
      description: service?.name ?? '',
      unitPrice: service ? (servicePriceToCents(service.price) / 100).toFixed(2) : '',
    })
  }

  async function submit() {
    if (busy) return
    setError(null)
    if (!selectedPatient && mode === 'create') return setError('Select a patient before creating an invoice.')
    if (!branchId || !allowedBranchIds.includes(branchId)) return setError('Select an authorized branch.')
    if (!invoiceDate) return setError('Invoice date is required.')
    if (!items.length) return setError('Add at least one invoice line.')
    try {
      setBusy(true)
      if (mode === 'edit' && invoice) {
        await updateDraftInvoicePersisted({ invoiceId: invoice.id, invoiceDate, dueDate: dueDate || undefined, items, notes: notes.trim() })
      } else if (selectedPatient) {
        await createInvoicePersisted({ patientDbId: selectedPatient.id, branchId, invoiceDate, dueDate: dueDate || undefined, items, notes: notes.trim() })
      }
      onSuccess()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save invoice.')
    } finally {
      setBusy(false)
    }
  }

  return <ActionDialog title={mode === 'edit' ? 'Edit invoice' : 'New invoice'} dialogClassName="bp153-invoice-dialog" onClose={onClose}>
    <header className="bp153-dialog-head bp153-invoice-head">
      <div className="bp153-dialog-titleline"><span className="bp153-dialog-icon"><FilePlus2 size={20}/></span><div><span>{mode === 'edit' ? 'Safe draft edit' : 'New invoice'}</span><h2>{mode === 'edit' ? invoice?.invoiceNumber : 'Create invoice'}</h2><p>{mode === 'edit' ? 'Only unpaid invoices without accounting activity can be changed.' : 'Choose a patient, pick services, and issue a clean branch invoice.'}</p></div></div>
      <button type="button" onClick={onClose} aria-label="Close"><X size={18}/></button>
    </header>
    <div className="bp153-dialog-body bp153-invoice-body">
      <div className="bp153-invoice-layout">
        <main className="bp153-invoice-main">
          <section className="bp153-invoice-panel">
            <div className="bp153-panel-title"><span>Invoice setup</span><strong>Patient and branch</strong></div>
            <div className="bp153-invoice-grid">
              <label><span>Patient</span><select value={patientId} onChange={(event) => { setPatientId(event.target.value); setSelectedCharges([]) }} disabled={mode === 'edit' || busy}><option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.firstName} {patient.lastName} - {patient.patientId}</option>)}</select></label>
              <label><span>Branch</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)} disabled={Boolean(scopeBranchId) || mode === 'edit' || busy}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
              <label><span>Issue date</span><input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} disabled={busy}/></label>
              <label><span>Due date</span><input type="date" min={invoiceDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={busy}/></label>
            </div>
          </section>
          {serviceLoadError && <div className="bp153-lock-note"><ShieldCheck size={16}/><span>Service catalogue could not be loaded from Supabase. Custom invoice lines are still available. Supabase reported: {serviceLoadError}</span></div>}
          <section className="bp153-line-editor bp153-invoice-panel">
            <div className="bp153-line-head"><div><span>Invoice lines</span><strong>Services and charges</strong><small>{activeServices.length ? `${activeServices.length} active services available for this branch.` : 'No active service catalogue items found for this branch.'}</small></div><Button size="sm" variant="secondary" onClick={() => setLines((current) => [...current, emptyLine()])} disabled={busy}>Add line</Button></div>
            <div className="bp153-line-labels" aria-hidden="true"><span></span><span>Service</span><span>Description</span><span>Qty</span><span>Price</span><span>Discount</span><span></span></div>
            {lines.map((line, index) => <div className="bp153-line-row bp153-service-line-row" key={line.key}><span>{index + 1}</span><select value={line.serviceId} onChange={(event) => chooseService(line.key, event.target.value)} aria-label={`Service for invoice line ${index + 1}`} disabled={busy}><option value="">Custom service</option>{activeServices.map((service) => <option key={service.id} value={service.id}>{service.name} - {formatCurrency(servicePriceToCents(service.price))}</option>)}</select><input value={line.description} onChange={(event) => updateLine(line.key, { description: event.target.value })} placeholder="Description" disabled={busy}/><input type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} aria-label="Quantity" disabled={busy}/><input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })} placeholder="Price" disabled={busy}/><input type="number" min="0" step="0.01" value={line.discount} onChange={(event) => updateLine(line.key, { discount: event.target.value })} placeholder="Discount" disabled={busy}/><button type="button" onClick={() => setLines((current) => current.length === 1 ? [emptyLine()] : current.filter((entry) => entry.key !== line.key))} aria-label="Remove line" disabled={busy}><X size={15}/></button></div>)}
          </section>
          <label className="bp153-notes bp153-invoice-notes"><span>Internal note</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add optional billing context" disabled={busy}/></label>
        </main>
        <aside className="bp153-invoice-summary" aria-label="Invoice summary">
          <div className="bp153-summary-total"><span>Total</span><strong>{formatCurrency(total)}</strong><small>{items.length} invoice {items.length === 1 ? 'line' : 'lines'}</small></div>
          <div className="bp153-summary-facts">
            <div><span>Patient</span><strong>{selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}`.trim() : 'Not selected'}</strong></div>
            <div><span>Branch</span><strong>{selectedBranch?.name ?? 'Not selected'}</strong></div>
            <div><span>Services</span><strong>{selectedServiceCount}</strong></div>
            <div><span>Due</span><strong>{dateLabel(dueDate)}</strong></div>
          </div>
          {mode === 'create' && <section className="bp153-summary-charges"><div><span>Unbilled charges</span><strong>{selectedCharges.length} selected</strong></div>{charges.slice(0, 4).map((charge) => <label key={charge.id} className="bp153-charge-choice"><input type="checkbox" checked={selectedCharges.includes(charge.id)} onChange={() => setSelectedCharges((current) => current.includes(charge.id) ? current.filter((id) => id !== charge.id) : [...current, charge.id])} disabled={busy}/><span>{charge.description}</span><b>{formatCurrency(charge.finalAmountCents)}</b></label>)}{!charges.length && <p>{selectedPatient ? 'No unbilled charges available.' : 'Select a patient to review charges.'}</p>}</section>}
        </aside>
      </div>
      {error && <div className="inline-alert" role="alert">{error}</div>}
    </div>
    <footer className="bp153-dialog-footer bp153-invoice-footer"><div><span>Total</span><strong>{formatCurrency(total)}</strong></div><div><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => void submit()} disabled={!canSubmit}>{busy ? 'Saving...' : mode === 'edit' ? 'Save invoice' : 'Create invoice'}</Button></div></footer>
  </ActionDialog>
}

function PaymentDialog({ allowedInvoiceIds, onClose, onSuccess }: { allowedInvoiceIds: Set<string>; onClose: () => void; onSuccess: () => void }) {
  const [invoiceId, setInvoiceId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [date, setDate] = useState(todayManila())
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const invoices = useMemo(() => getStoredInvoices().filter((invoice) => allowedInvoiceIds.has(invoice.id) && invoice.balanceCents > 0 && invoice.status !== 'void'), [allowedInvoiceIds])
  const selected = invoices.find((invoice) => invoice.id === invoiceId)
  const methods = useMemo(() => getActivePaymentMethods().filter((entry) => !entry.isOnline), [])
  const selectedMethod = methods.find((entry) => entry.id === method)
  const amountCents = cents(amount)

  async function submit() {
    if (!selected) return setError('Select an open invoice.')
    if (amountCents <= 0 || amountCents > selected.balanceCents) return setError(`Payment must be between PHP 0.01 and ${formatCurrency(selected.balanceCents)}.`)
    if (selectedMethod?.requiresReference && !reference.trim()) return setError(`${selectedMethod.label} requires a reference number.`)
    try {
      setBusy(true)
      await recordManualPaymentPersisted({ invoiceId: selected.id, amountCents, paymentMethod: method, date, referenceNumber: reference.trim() || undefined, notes: notes.trim() })
      onSuccess()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to record payment.')
    } finally {
      setBusy(false)
    }
  }

  return <ActionDialog title="Record payment" onClose={onClose}>
    <header className="bp153-dialog-head"><div><span>Record payment</span><h2>Apply collection</h2><p>Payment, allocation, balance, and receipt are committed together.</p></div><button type="button" onClick={onClose} aria-label="Close"><X size={18}/></button></header>
    <div className="bp153-dialog-body">
      <div className="bp153-form-grid">
        <label className="bp153-span-2"><span>Invoice</span><select value={invoiceId} onChange={(event) => { setInvoiceId(event.target.value); setAmount('') }}><option value="">Select open invoice</option>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} - {patientName(invoice.patientId)} - {formatCurrency(invoice.balanceCents)} due</option>)}</select></label>
        <label><span>Amount</span><input type="number" min="0.01" step="0.01" max={selected ? selected.balanceCents / 100 : undefined} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00"/></label>
        <label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)}/></label>
        <label><span>Method</span><select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{methods.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
        <label><span>{selectedMethod?.requiresReference ? 'Reference' : 'Reference optional'}</span><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Transaction ID"/></label>
      </div>
      <label className="bp153-notes"><span>Notes</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Collection note"/></label>
      {selected && <div className="bp153-lock-note"><ShieldCheck size={16}/><span>Outstanding balance after payment: <strong>{formatCurrency(Math.max(0, selected.balanceCents - amountCents))}</strong></span></div>}
      {error && <div className="inline-alert" role="alert">{error}</div>}
    </div>
    <footer className="bp153-dialog-footer"><div><span>Recording</span><strong>{formatCurrency(amountCents)}</strong></div><div><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => void submit()} disabled={busy}>{busy ? 'Recording...' : 'Record payment'}</Button></div></footer>
  </ActionDialog>
}

function VoidDialog({ invoice, onClose, onSuccess }: { invoice: Invoice; onClose: () => void; onSuccess: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit() {
    if (!reason.trim()) return setError('A void reason is required.')
    try {
      setBusy(true)
      await voidInvoicePersisted(invoice.id, reason.trim())
      onSuccess()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to void invoice.')
    } finally {
      setBusy(false)
    }
  }
  return <ActionDialog title="Void invoice" onClose={onClose}>
    <header className="bp153-dialog-head"><div><span>Audited control</span><h2>Void {invoice.invoiceNumber}</h2><p>The invoice remains in history. No hard delete is performed.</p></div><button type="button" onClick={onClose} aria-label="Close"><X size={18}/></button></header>
    <div className="bp153-dialog-body"><label className="bp153-notes"><span>Reason</span><textarea rows={5} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this invoice is being voided"/></label>{error && <div className="inline-alert" role="alert">{error}</div>}</div>
    <footer className="bp153-dialog-footer"><div><span>Record</span><strong>{invoice.invoiceNumber}</strong></div><div><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="danger" onClick={() => void submit()} disabled={busy || !reason.trim()} icon={<Ban size={15}/>}>Void invoice</Button></div></footer>
  </ActionDialog>
}

export function BillingPaymentsWorkspaceV153() {
  const permissions = usePermissions()
  const { user } = useAuth()
  const { activeBranchId, availableBranches, authorizedBranchIds, isAllBranchesMode } = useBranchContext()
  const [refreshKey, setRefreshKey] = useState(0)
  const [tab, setTab] = useState<BillingTab>('invoices')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<DetailTarget | null>(null)
  const [invoiceEditor, setInvoiceEditor] = useState<{ mode: InvoiceMode; invoice?: Invoice } | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState<Invoice | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const isSuperAdmin = user?.role === 'super_admin'
  const allowedBranchIds = useMemo(() => {
    if (isSuperAdmin && isAllBranchesMode) return availableBranches.map((branch) => branch.id)
    return activeBranchId ? [activeBranchId] : authorizedBranchIds
  }, [activeBranchId, authorizedBranchIds, availableBranches, isAllBranchesMode, isSuperAdmin])
  const branchScopeLabel = isSuperAdmin && isAllBranchesMode ? 'All branches' : branchName(allowedBranchIds[0])

  const data = useMemo(() => {
    void refreshKey
    const query = search.trim().toLowerCase()
    const inBranch = (branchId?: string) => !allowedBranchIds.length || (branchId ? allowedBranchIds.includes(branchId) : isSuperAdmin)
    const invoices = getStoredInvoices().filter((invoice) => inBranch(invoice.branchId))
    const invoiceIds = new Set(invoices.map((invoice) => invoice.id))
    const payments = getStoredPayments().filter((payment) => invoiceIds.has(payment.invoiceId) && inBranch(payment.branchId))
    const paymentIds = new Set(payments.map((payment) => payment.id))
    const receipts = getStoredReceipts().filter((receipt) => paymentIds.has(receipt.paymentId) || receipt.invoiceIds.some((id) => invoiceIds.has(id)))
    const matches = (text: string) => !query || text.toLowerCase().includes(query)
    const filteredInvoices = invoices.filter((invoice) => matches(`${invoice.invoiceNumber} ${patientName(invoice.patientId)} ${branchName(invoice.branchId)} ${invoice.status}`))
    const filteredPayments = payments.filter((payment) => matches(`${payment.paymentNumber} ${patientName(payment.patientId)} ${getPaymentMethodLabel(payment.paymentMethod)} ${payment.status}`))
    const receivables = filteredInvoices.filter((invoice) => invoice.status !== 'void' && invoice.balanceCents > 0)
    const filteredReceipts = receipts.filter((receipt) => matches(`${receipt.receiptNumber} ${patientName(receipt.patientId)} ${branchName(receipt.branchId)}`))
    return { invoices, payments, receipts, filteredInvoices, filteredPayments, receivables, filteredReceipts }
  }, [allowedBranchIds, isSuperAdmin, refreshKey, search])

  useEffect(() => setPage(1), [tab, search])

  const billed = data.invoices.filter((invoice) => invoice.status !== 'void').reduce((sum, invoice) => sum + invoice.totalCents, 0)
  const collected = data.payments.filter((payment) => ['completed', 'partially_refunded', 'refunded'].includes(payment.status)).reduce((sum, payment) => sum + payment.allocatedCents, 0)
  const receivablesTotal = data.invoices.filter((invoice) => invoice.status !== 'void').reduce((sum, invoice) => sum + invoice.balanceCents, 0)
  const openInvoices = data.invoices.filter((invoice) => invoice.status !== 'void' && invoice.balanceCents > 0).length
  const visibleRows = tab === 'invoices' ? data.filteredInvoices : tab === 'payments' ? data.filteredPayments : tab === 'receivables' ? data.receivables : data.filteredReceipts
  const pagedRows = visibleRows.slice((page - 1) * pageSize, page * pageSize)
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize))
  const allowedInvoiceIds = useMemo(() => new Set(data.invoices.map((invoice) => invoice.id)), [data.invoices])

  function refresh() {
    setRefreshKey((key) => key + 1)
    window.dispatchEvent(new CustomEvent('plamenco:billing-mutated', { detail: { branchId: activeBranchId ?? undefined } }))
  }

  function printReceipt(payment: Payment) {
    const receipt = data.receipts.find((entry) => entry.paymentId === payment.id)
    const invoice = data.invoices.find((entry) => entry.id === payment.invoiceId)
    const branch = getStoredBranches().find((entry) => entry.id === (receipt?.branchId ?? payment.branchId ?? invoice?.branchId))
    const payload = { receipt, payment, invoice, patient: { name: patientName(payment.patientId), patientId: payment.patientId }, branch }
    if (canPrintOfficialReceipt(payload)) openOfficialReceiptWindow(payload)
  }

  return <section className="bp153-page">
    <header className="bp153-header">
      <div className="bp153-title">
        <span><Banknote size={17}/> {branchScopeLabel}</span>
        <h1>Billing & Payments</h1>
        <p>Manage invoices, collections and outstanding balances.</p>
      </div>
      <div className="bp153-actions">
        {permissions.can('billing.create') && <Button icon={<FilePlus2 size={16}/>} onClick={() => setInvoiceEditor({ mode: 'create' })}>New Invoice</Button>}
        {permissions.can('payments.record_manual') && <Button variant="secondary" icon={<CreditCard size={16}/>} onClick={() => setPaymentOpen(true)}>Record Payment</Button>}
        <div className="bp153-more">
          <Button variant="secondary" icon={<MoreHorizontal size={16}/>} onClick={() => setMoreOpen((open) => !open)}>More <ChevronDown size={14}/></Button>
          {moreOpen && <div className="bp153-more-menu"><button type="button" onClick={() => { setTab('receipts'); setMoreOpen(false) }}>Receipt archive</button><button type="button" onClick={() => { setTab('receivables'); setMoreOpen(false) }}>Receivable review</button><span>Refund operations are retired from active workflows. Historical refund records stay in reporting.</span></div>}
        </div>
      </div>
    </header>

    <section className="bp153-kpis" aria-label="Financial summary">
      <article><span>Billed</span><strong>{formatCurrency(billed)}</strong><small>Non-void invoices</small></article>
      <article><span>Collected</span><strong>{formatCurrency(collected)}</strong><small>Completed collections</small></article>
      <article><span>Receivables</span><strong>{formatCurrency(receivablesTotal)}</strong><small>Outstanding balance</small></article>
      <article><span>Open invoices</span><strong>{openInvoices}</strong><small>Need collection</small></article>
    </section>

    <section className="bp153-workspace">
      <div className="bp153-toolbar">
        <nav aria-label="Billing workspace sections">{(['invoices', 'payments', 'receivables', 'receipts'] as BillingTab[]).map((item) => <button key={item} type="button" className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</nav>
        <label className="bp153-search"><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice, patient, branch, payment..."/></label>
      </div>

      {tab === 'invoices' || tab === 'receivables' ? <div className="bp153-table-wrap">
        <table className="bp153-table">
          <thead><tr><th>Invoice #</th><th>Patient</th><th>Branch</th><th>Issue date</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody>{(pagedRows as Invoice[]).map((invoice) => <tr key={invoice.id} tabIndex={0} onClick={() => setDetail({ kind: 'invoice', invoice })} onKeyDown={(event) => rowKeyboard(event, () => setDetail({ kind: 'invoice', invoice }))}><td data-label="Invoice #">{invoice.invoiceNumber}</td><td data-label="Patient">{patientName(invoice.patientId)}</td><td data-label="Branch">{branchName(invoice.branchId)}</td><td data-label="Issue date">{dateLabel(invoice.invoiceDate)}</td><td data-label="Amount">{formatCurrency(invoice.totalCents)}</td><td data-label="Paid">{formatCurrency(invoice.amountPaidCents)}</td><td data-label="Balance">{formatCurrency(invoice.balanceCents)}</td><td data-label="Status"><StatusBadge status={invoice.status} variant="compact"/></td></tr>)}</tbody>
        </table>
      </div> : tab === 'payments' ? <div className="bp153-table-wrap">
        <table className="bp153-table">
          <thead><tr><th>Payment #</th><th>Patient</th><th>Method</th><th>Amount</th><th>Date</th><th>Status</th><th>Receipt</th></tr></thead>
          <tbody>{(pagedRows as Payment[]).map((payment) => { const receipt = data.receipts.find((entry) => entry.paymentId === payment.id); return <tr key={payment.id} tabIndex={0} onClick={() => setDetail({ kind: 'payment', payment })} onKeyDown={(event) => rowKeyboard(event, () => setDetail({ kind: 'payment', payment }))}><td data-label="Payment #">{payment.paymentNumber}</td><td data-label="Patient">{patientName(payment.patientId)}</td><td data-label="Method">{getPaymentMethodLabel(payment.paymentMethod)}</td><td data-label="Amount">{formatCurrency(payment.amountCents)}</td><td data-label="Date">{dateLabel(payment.date)}</td><td data-label="Status"><StatusBadge status={payment.status} variant="compact"/></td><td data-label="Receipt">{receipt?.receiptNumber ?? 'Pending'}</td></tr> })}</tbody>
        </table>
      </div> : <div className="bp153-receipts">
        {(pagedRows as Receipt[]).map((receipt) => <button key={receipt.id} type="button" onClick={() => setDetail({ kind: 'receipt', receipt })}><ReceiptText size={17}/><span><strong>{receipt.receiptNumber}</strong><small>{patientName(receipt.patientId)} - {dateLabel(receipt.issuedAt)}</small></span><b>{formatCurrency(receipt.amountCents)}</b></button>)}
      </div>}

      {!visibleRows.length && <div className="bp153-empty"><FileText size={22}/><h3>No records in this view</h3><p>Try another search or create a new invoice.</p></div>}
      <footer className="bp153-pager"><span>{visibleRows.length} record{visibleRows.length === 1 ? '' : 's'}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><strong>{page} / {pageCount}</strong><button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button></div></footer>
    </section>

    <section className="bp153-secondary">
      <article><span>Accounting policy</span><strong>Paid invoices are locked</strong><p>Completed payments and receipts freeze financial totals. Use audited controls for reversals.</p></article>
      <article><span>Branch scope</span><strong>{branchScopeLabel}</strong><p>{isSuperAdmin && isAllBranchesMode ? 'Super Admin oversight across active branches.' : 'Staff records stay limited to the assigned branch.'}</p></article>
    </section>

    {detail && <Drawer title="Billing detail" onClose={() => setDetail(null)}>
      <header className="bp153-drawer-head"><div><span>{detail.kind}</span><h2>{detail.kind === 'invoice' ? detail.invoice.invoiceNumber : detail.kind === 'payment' ? detail.payment.paymentNumber : detail.receipt.receiptNumber}</h2><p>{patientName(detail.kind === 'invoice' ? detail.invoice.patientId : detail.kind === 'payment' ? detail.payment.patientId : detail.receipt.patientId)}</p></div><button type="button" onClick={() => setDetail(null)} aria-label="Close detail"><X size={18}/></button></header>
      {detail.kind === 'invoice' && (() => { const invoice = detail.invoice; const locked = hasFinalActivity(invoice, data.payments, data.receipts); const editable = canMutateInvoice(invoice, data.payments, data.receipts, permissions.can('billing.edit') || permissions.can('billing.create')); return <div className="bp153-drawer-body"><div className="bp153-detail-kpis"><article><span>Total</span><strong>{formatCurrency(invoice.totalCents)}</strong></article><article><span>Paid</span><strong>{formatCurrency(invoice.amountPaidCents)}</strong></article><article><span>Balance</span><strong>{formatCurrency(invoice.balanceCents)}</strong></article></div><div className="bp153-detail-grid"><div><span>Branch</span><strong>{branchName(invoice.branchId)}</strong></div><div><span>Issue date</span><strong>{dateLabel(invoice.invoiceDate)}</strong></div><div><span>Due date</span><strong>{dateLabel(invoice.dueDate)}</strong></div><div><span>Status</span><StatusBadge status={invoice.status}/></div></div><section className="bp153-lines"><h3>Invoice lines</h3>{invoice.items.map((item) => <div key={item.id}><span><strong>{item.description}</strong><small>Qty {item.quantity}</small></span><b>{formatCurrency(item.amountCents ?? item.quantity * item.unitPriceCents)}</b></div>)}</section><div className="bp153-lock-note"><ShieldCheck size={16}/><span>{locked ? 'Financial totals are locked because this invoice has payment or receipt activity.' : 'This invoice is still eligible for safe draft/unpaid edits.'}</span></div><footer className="bp153-drawer-actions">{editable && <Button variant="secondary" icon={<Pencil size={15}/>} onClick={() => setInvoiceEditor({ mode: 'edit', invoice })}>Edit invoice</Button>}{permissions.can('billing.void_invoice') && invoice.status !== 'void' && invoice.amountPaidCents === 0 && <Button variant="danger" icon={<Ban size={15}/>} onClick={() => setVoidTarget(invoice)}>Void invoice</Button>}</footer></div> })()}
      {detail.kind === 'payment' && (() => { const payment = detail.payment; const receipt = data.receipts.find((entry) => entry.paymentId === payment.id); const invoice = data.invoices.find((entry) => entry.id === payment.invoiceId); return <div className="bp153-drawer-body"><div className="bp153-detail-kpis"><article><span>Amount</span><strong>{formatCurrency(payment.amountCents)}</strong></article><article><span>Allocated</span><strong>{formatCurrency(payment.allocatedCents)}</strong></article><article><span>Receipt</span><strong>{receipt?.receiptNumber ?? 'Pending'}</strong></article></div><div className="bp153-detail-grid"><div><span>Method</span><strong>{getPaymentMethodLabel(payment.paymentMethod)}</strong></div><div><span>Date</span><strong>{dateLabel(payment.date)}</strong></div><div><span>Invoice</span><strong>{invoice?.invoiceNumber ?? payment.invoiceId}</strong></div><div><span>Status</span><StatusBadge status={payment.status}/></div><div><span>Reference</span><strong>{payment.referenceNumber || 'Not recorded'}</strong></div><div><span>Recorded by</span><strong>{payment.recordedBy || 'Clinic user'}</strong></div></div>{receipt && <footer className="bp153-drawer-actions"><Button variant="secondary" icon={<Printer size={15}/>} onClick={() => printReceipt(payment)}>Print receipt</Button></footer>}</div> })()}
      {detail.kind === 'receipt' && (() => { const receipt = detail.receipt; const payment = data.payments.find((entry) => entry.id === receipt.paymentId); return <div className="bp153-drawer-body"><div className="bp153-detail-kpis"><article><span>Amount</span><strong>{formatCurrency(receipt.amountCents)}</strong></article><article><span>Remaining</span><strong>{formatCurrency(receipt.remainingBalanceCents)}</strong></article><article><span>Invoices</span><strong>{receipt.invoiceIds.length}</strong></article></div><div className="bp153-detail-grid"><div><span>Branch</span><strong>{branchName(receipt.branchId)}</strong></div><div><span>Issued</span><strong>{dateLabel(receipt.issuedAt)}</strong></div><div><span>Issued by</span><strong>{receipt.issuedBy}</strong></div><div><span>Payment</span><strong>{payment?.paymentNumber ?? receipt.paymentId}</strong></div></div>{payment && <footer className="bp153-drawer-actions"><Button variant="secondary" icon={<Printer size={15}/>} onClick={() => printReceipt(payment)}>Print receipt</Button></footer>}</div> })()}
    </Drawer>}
    {invoiceEditor && <InvoiceEditor mode={invoiceEditor.mode} invoice={invoiceEditor.invoice} scopeBranchId={isSuperAdmin && isAllBranchesMode ? undefined : activeBranchId ?? undefined} allowedBranchIds={allowedBranchIds} onClose={() => setInvoiceEditor(null)} onSuccess={refresh}/>}
    {paymentOpen && <PaymentDialog allowedInvoiceIds={allowedInvoiceIds} onClose={() => setPaymentOpen(false)} onSuccess={refresh}/>}
    {voidTarget && <VoidDialog invoice={voidTarget} onClose={() => setVoidTarget(null)} onSuccess={refresh}/>}
  </section>
}
