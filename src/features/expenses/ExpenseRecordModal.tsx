import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Banknote, CheckCircle2, Clock3, MoreHorizontal, PencilLine, ReceiptText, ShieldCheck, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/Badge'
import { getStoredBranches } from '../branches/branchStore'
import { getPaymentMethodLabel, type PaymentMethod } from '../billing/billingStore'
import { createUuid } from '../../lib/id'
import {
  formatExpenseCurrency,
  getExpenseCategories,
  getExpensePayments,
  getExpenseVendors,
  type Expense,
  type ExpensePayment,
} from './expenseStore'
import { recordExpensePaymentPersisted, reviseExpensePersisted, voidExpensePersisted } from './expensePersistence'
import { canCorrectExpenseAmount, canEditExpenseSafeFields } from './expenseCorrectionStore'
import { acquireModalScrollLock } from '../../lib/modalScrollLock'

type ExpenseRecordModalProps = {
  expense: Expense
  payments?: ExpensePayment[]
  branchLabel?: string
  canEdit: boolean
  canVoid: boolean
  canRecordPayment: boolean
  onClose: () => void
  onSaved: (message: string) => void
}

const paymentMethods: PaymentMethod[] = ['cash', 'gcash', 'maya', 'bank_transfer', 'card', 'online_gateway', 'other']

function formatDate(value?: string) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
}

function todayManila() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function moneyInput(cents: number) {
  return (cents / 100).toFixed(2)
}

function parseMoneyInput(value: string, label: string, allowZero = true) {
  const amount = Number(value.replace(/,/g, '').trim())
  if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount <= 0)) {
    throw new Error(`${label} must be ${allowZero ? 'zero or greater' : 'greater than zero'}.`)
  }
  return Math.round(amount * 100)
}

function fallbackBranchLabel(expense: Expense, preferred?: string) {
  if (preferred) return preferred
  if (expense.scope === 'clinic_wide') return 'Clinic-wide'
  return getStoredBranches().find((branch) => branch.id === expense.branchId)?.name ?? expense.branchId ?? 'Branch'
}

export function ExpenseRecordModal({
  expense,
  payments,
  branchLabel,
  canEdit,
  canVoid,
  canRecordPayment,
  onClose,
  onSaved,
}: ExpenseRecordModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null)
  const actionMenuRef = useRef<HTMLDivElement | null>(null)
  const categories = useMemo(() => getExpenseCategories().filter((category) => category.status === 'active'), [])
  const vendors = useMemo(() => getExpenseVendors().filter((vendor) => vendor.status === 'active'), [])
  const paymentRows = useMemo(
    () => payments ?? getExpensePayments().filter((payment) => payment.expenseId === expense.id),
    [expense.id, payments],
  )
  const safeCorrection = canEditExpenseSafeFields(expense)
  const amountCorrection = canCorrectExpenseAmount(expense, paymentRows.length)
  const scopeLabel = fallbackBranchLabel(expense, branchLabel)
  const inactive = expense.status === 'void' || expense.status === 'cancelled'
  const editable = canEdit && safeCorrection.allowed
  const amountEditable = editable && amountCorrection.allowed
  const payable = canRecordPayment && !inactive && expense.balanceCents > 0
  const voidable = canVoid && !inactive

  const [mode, setMode] = useState<'view' | 'edit' | 'payment' | 'void'>('view')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    categoryId: expense.categoryId,
    vendorId: expense.vendorId ?? '',
    payeeName: expense.payeeName,
    description: expense.description,
    expenseDate: expense.expenseDate,
    dueDate: expense.dueDate ?? '',
    subtotal: moneyInput(expense.subtotalCents),
    tax: moneyInput(expense.taxCents),
    referenceNumber: expense.referenceNumber ?? '',
    notes: expense.notes ?? '',
  })
  const [paymentForm, setPaymentForm] = useState({
    amount: moneyInput(expense.balanceCents),
    paymentDate: todayManila(),
    paymentMethod: 'cash' as PaymentMethod,
    referenceNumber: '',
    notes: '',
  })
  const [voidReason, setVoidReason] = useState('')

  useEffect(() => {
    const releaseScrollLock = acquireModalScrollLock()
    const first = dialogRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    first?.focus()
    return releaseScrollLock
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        if (menuOpen) setMenuOpen(false)
        else onClose()
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'))
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    function onPointer(event: MouseEvent) {
      if (!actionMenuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [busy, menuOpen, onClose])

  function resetView() {
    setMode('view')
    setMenuOpen(false)
    setError('')
  }

  function updateEdit<K extends keyof typeof editForm>(key: K, value: string) {
    setEditForm((current) => ({ ...current, [key]: value }))
  }

  async function saveEdit() {
    setBusy(true)
    setError('')
    try {
      if (!editForm.description.trim()) throw new Error('Description is required.')
      if (!editForm.payeeName.trim()) throw new Error('Payee or vendor is required.')
      const subtotalCents = amountEditable ? parseMoneyInput(editForm.subtotal, 'Subtotal') : expense.subtotalCents
      const taxCents = amountEditable ? parseMoneyInput(editForm.tax, 'Tax') : expense.taxCents
      await reviseExpensePersisted(expense.id, {
        scope: expense.scope,
        branchId: expense.branchId,
        categoryId: editForm.categoryId,
        vendorId: editForm.vendorId || undefined,
        payeeName: editForm.payeeName.trim(),
        description: editForm.description.trim(),
        expenseDate: editForm.expenseDate,
        dueDate: editForm.dueDate || undefined,
        subtotalCents,
        taxCents,
        referenceNumber: amountEditable ? editForm.referenceNumber.trim() || undefined : expense.referenceNumber,
        notes: editForm.notes.trim(),
      })
      onSaved(`${expense.expenseNumber} was updated and kept in the audit trail.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Expense could not be updated.')
    } finally {
      setBusy(false)
    }
  }

  async function recordPayment() {
    setBusy(true)
    setError('')
    try {
      const amountCents = parseMoneyInput(paymentForm.amount, 'Payment amount', false)
      if (amountCents > expense.balanceCents) throw new Error('Payment cannot be greater than the outstanding balance.')
      if (!paymentForm.paymentDate) throw new Error('Payment date is required.')
      await recordExpensePaymentPersisted({
        expenseId: expense.id,
        amountCents,
        paymentDate: paymentForm.paymentDate,
        paymentMethod: paymentForm.paymentMethod,
        referenceNumber: paymentForm.referenceNumber.trim() || undefined,
        notes: paymentForm.notes.trim() || undefined,
        clientRequestId: createUuid(),
      })
      onSaved(`Payment recorded for ${expense.expenseNumber}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Expense payment could not be recorded.')
    } finally {
      setBusy(false)
    }
  }

  async function voidRecord() {
    setBusy(true)
    setError('')
    try {
      if (!voidReason.trim()) throw new Error('A void reason is required.')
      await voidExpensePersisted(expense.id, voidReason.trim())
      onSaved(`${expense.expenseNumber} was voided and retained for financial history.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Expense could not be voided.')
    } finally {
      setBusy(false)
    }
  }

  const modal = (
    <div
      className="expense-record-v153-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section className="expense-record-v153" role="dialog" aria-modal="true" aria-labelledby="expense-record-title" ref={dialogRef}>
        <header className="expense-record-v153-header">
          <span className="expense-record-v153-icon"><ReceiptText size={21} /></span>
          <div className="expense-record-v153-title">
            <span>Expense record</span>
            <h2 id="expense-record-title">{expense.expenseNumber}</h2>
            <p>{expense.description}</p>
          </div>
          <StatusBadge status={expense.status} />
          <button type="button" className="expense-record-v153-close" aria-label="Close expense record" onClick={onClose} disabled={busy}>
            <X size={19} />
          </button>
        </header>

        <div className="expense-record-v153-body">
          {error && <div className="expense-record-v153-alert" role="alert">{error}</div>}

          <section className="expense-record-v153-summary" aria-label="Expense summary">
            <article><span>Total</span><strong>{formatExpenseCurrency(expense.totalCents)}</strong><small>Recorded cost</small></article>
            <article><span>Paid</span><strong>{formatExpenseCurrency(expense.amountPaidCents)}</strong><small>{paymentRows.length} payment{paymentRows.length === 1 ? '' : 's'}</small></article>
            <article className={expense.balanceCents > 0 ? 'is-attention' : ''}><span>Outstanding</span><strong>{formatExpenseCurrency(expense.balanceCents)}</strong><small>{expense.balanceCents > 0 ? 'Needs payment' : 'Settled'}</small></article>
            <article><span>Scope</span><strong>{scopeLabel}</strong><small>{expense.scope.replaceAll('_', ' ')}</small></article>
          </section>

          {mode === 'view' && (
            <div className="expense-record-v153-view-stack">
              <section className="expense-record-v153-grid">
                <article><span>Payee / vendor</span><strong>{expense.payeeName}</strong></article>
                <article><span>Category</span><strong>{categories.find((category) => category.id === expense.categoryId)?.name ?? expense.categoryId}</strong></article>
                <article><span>Expense date</span><strong>{formatDate(expense.expenseDate)}</strong></article>
                <article><span>Due date</span><strong>{formatDate(expense.dueDate)}</strong></article>
                <article><span>Reference</span><strong>{expense.referenceNumber || 'Not recorded'}</strong></article>
                <article><span>Source</span><strong>{expense.sourceType.replaceAll('_', ' ')}</strong></article>
                <article className="is-wide"><span>Notes</span><strong>{expense.notes || 'No notes recorded'}</strong></article>
              </section>

              <div className="expense-record-v153-history-grid">
                <section className="expense-record-v153-panel is-scrollable">
                <header><div><span>Payment history</span><h3>Recorded payments</h3></div><b>{paymentRows.length}</b></header>
                <div className="expense-record-v153-timeline">
                  {paymentRows.length ? paymentRows.map((payment) => (
                    <article key={payment.id}>
                      <i><CheckCircle2 size={15} /></i>
                      <div><strong>{getPaymentMethodLabel(payment.paymentMethod)}</strong><span>{formatDate(payment.paymentDate)} · {payment.referenceNumber || 'No reference'}</span></div>
                      <b>{formatExpenseCurrency(payment.amountCents)}</b>
                    </article>
                  )) : <p>No payments have been recorded for this expense.</p>}
                </div>
              </section>

                <section className="expense-record-v153-panel is-scrollable">
                <header><div><span>Audit trail</span><h3>Record history</h3></div><ShieldCheck size={18} /></header>
                <div className="expense-record-v153-audit">
                  <article><span>Created by</span><strong>{expense.createdBy || 'System'}</strong><small>{formatDate(expense.createdAt)}</small></article>
                  <article><span>Updated</span><strong>{formatDate(expense.updatedAt)}</strong><small>Financial history preserved</small></article>
                  {expense.voidedAt && <article><span>Voided</span><strong>{formatDate(expense.voidedAt)}</strong><small>{expense.voidReason || 'No reason recorded'}</small></article>}
                </div>
              </section>
              </div>
            </div>
          )}

          {mode === 'edit' && (
            <section className="expense-record-v153-form" aria-label="Edit expense fields">
              {!safeCorrection.allowed && <div className="expense-record-v153-note"><AlertTriangle size={16} />{safeCorrection.reason}</div>}
              {editable && !amountEditable && <div className="expense-record-v153-note"><AlertTriangle size={16} />{amountCorrection.reason} Descriptive fields remain editable.</div>}
              <label><span>Description</span><input value={editForm.description} onChange={(event) => updateEdit('description', event.target.value)} disabled={!editable} /></label>
              <label><span>Payee / vendor</span><input value={editForm.payeeName} onChange={(event) => updateEdit('payeeName', event.target.value)} disabled={!editable} /></label>
              <label><span>Category</span><select value={editForm.categoryId} onChange={(event) => updateEdit('categoryId', event.target.value)} disabled={!editable}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label><span>Saved vendor</span><select value={editForm.vendorId} onChange={(event) => updateEdit('vendorId', event.target.value)} disabled={!editable}><option value="">No linked vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label>
              <label><span>Expense date</span><input type="date" value={editForm.expenseDate} onChange={(event) => updateEdit('expenseDate', event.target.value)} disabled={!editable} /></label>
              <label><span>Due date</span><input type="date" value={editForm.dueDate} onChange={(event) => updateEdit('dueDate', event.target.value)} disabled={!editable} /></label>
              <label><span>Subtotal</span><input inputMode="decimal" value={editForm.subtotal} onChange={(event) => updateEdit('subtotal', event.target.value)} disabled={!amountEditable} /></label>
              <label><span>Tax</span><input inputMode="decimal" value={editForm.tax} onChange={(event) => updateEdit('tax', event.target.value)} disabled={!amountEditable} /></label>
              <label className="is-wide"><span>Reference</span><input value={editForm.referenceNumber} onChange={(event) => updateEdit('referenceNumber', event.target.value)} disabled={!amountEditable} /></label>
              <label className="is-wide"><span>Notes</span><textarea value={editForm.notes} onChange={(event) => updateEdit('notes', event.target.value)} rows={4} disabled={!editable} /></label>
            </section>
          )}

          {mode === 'payment' && (
            <section className="expense-record-v153-form expense-record-v153-payment" aria-label="Record expense payment">
              <div className="expense-record-v153-note"><Banknote size={16} />Recording a payment updates the expense balance and keeps the payment in history.</div>
              <label><span>Amount</span><input inputMode="decimal" value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} /></label>
              <label><span>Payment date</span><input type="date" value={paymentForm.paymentDate} onChange={(event) => setPaymentForm((current) => ({ ...current, paymentDate: event.target.value }))} /></label>
              <label><span>Method</span><select value={paymentForm.paymentMethod} onChange={(event) => setPaymentForm((current) => ({ ...current, paymentMethod: event.target.value as PaymentMethod }))}>{paymentMethods.map((method) => <option key={method} value={method}>{getPaymentMethodLabel(method)}</option>)}</select></label>
              <label><span>Reference</span><input value={paymentForm.referenceNumber} onChange={(event) => setPaymentForm((current) => ({ ...current, referenceNumber: event.target.value }))} /></label>
              <label className="is-wide"><span>Notes</span><textarea value={paymentForm.notes} onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))} rows={4} /></label>
            </section>
          )}

          {mode === 'void' && (
            <section className="expense-record-v153-void" role="alert">
              <AlertTriangle size={19} />
              <div><strong>Void this expense?</strong><p>This keeps the original financial record available for audit history and removes it from active reporting.</p></div>
              <label><span>Reason</span><textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} rows={4} placeholder="Explain why this record is being voided." /></label>
            </section>
          )}
        </div>

        <footer className="expense-record-v153-footer">
          {mode === 'view' ? (
            <>
              <Button variant="secondary" onClick={onClose} disabled={busy}>Close</Button>
              <div className="expense-record-v153-footer-actions">
                {editable && <Button variant="secondary" icon={<PencilLine size={15} />} onClick={() => { setMode('edit'); setMenuOpen(false) }} disabled={busy}>Edit</Button>}
                {payable && <Button icon={<Banknote size={15} />} onClick={() => { setMode('payment'); setMenuOpen(false) }} disabled={busy}>Record payment</Button>}
                {voidable && (
                  <div className="expense-record-v153-more" ref={actionMenuRef}>
                    <button type="button" aria-label="More expense actions" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)} disabled={busy}>
                      <MoreHorizontal size={18} />
                    </button>
                    {menuOpen && <div role="menu"><button type="button" role="menuitem" onClick={() => { setMode('void'); setMenuOpen(false) }}><Clock3 size={15} />Void record</button></div>}
                  </div>
                )}
              </div>
            </>
          ) : mode === 'edit' ? (
            <>
              <Button variant="secondary" onClick={resetView} disabled={busy}>Cancel</Button>
              <Button onClick={() => void saveEdit()} disabled={busy || !editable}>{busy ? 'Saving...' : 'Save changes'}</Button>
            </>
          ) : mode === 'payment' ? (
            <>
              <Button variant="secondary" onClick={resetView} disabled={busy}>Cancel</Button>
              <Button icon={<Banknote size={15} />} onClick={() => void recordPayment()} disabled={busy || !payable}>{busy ? 'Recording...' : 'Record payment'}</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={resetView} disabled={busy}>Keep record</Button>
              <Button variant="danger" onClick={() => void voidRecord()} disabled={busy || !voidReason.trim()}>{busy ? 'Voiding...' : 'Void record'}</Button>
            </>
          )}
        </footer>
      </section>
    </div>
  )

  return createPortal(modal, document.body)
}
