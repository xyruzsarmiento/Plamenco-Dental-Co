import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { getStoredBranches } from '../branches/branchStore'
import { getCurrentSessionUserName } from '../security/security'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import {
  createExpenseVendor,
  createRecurringExpenseTemplate,
  getExpenseCategories,
  getExpenseVendors,
  type RecurringFrequency,
} from './expenseStore'
import { createExpensePersisted, recordPettyCashPersisted } from './expensePersistence'

export type ExpenseDialogType = 'add_expense' | 'petty_cash' | 'add_vendor' | 'recurring'

type Props = {
  type: ExpenseDialogType
  preferredBranchId?: string
  onClose: () => void
  onSuccess: () => void
}

function todayManila() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

async function confirmRemote(table: string, id: string) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Clinic database is not configured. This record cannot be saved safely.')
  const { data, error } = await supabase.from(table).select('id').eq('id', id).maybeSingle()
  if (error) throw new Error(`Database persistence failed: ${error.message}`)
  if (!data) throw new Error('Database persistence could not be confirmed. The form remains open so you can retry safely.')
}

export function ExpenseActionModal({ type, preferredBranchId, onClose, onSuccess }: Props) {
  const branches = useMemo(() => getStoredBranches().filter((branch) => branch.status === 'active'), [])
  const categories = useMemo(() => getExpenseCategories().filter((category) => category.status === 'active'), [])
  const vendors = useMemo(() => getExpenseVendors().filter((vendor) => vendor.status === 'active'), [])
  const actor = getCurrentSessionUserName() || 'Clinic user'
  const defaultBranch = preferredBranchId && preferredBranchId !== 'all' && preferredBranchId !== 'clinic_wide'
    ? preferredBranchId
    : branches[0]?.id ?? ''

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [scope, setScope] = useState<'branch' | 'clinic_wide'>('branch')
  const [branchId, setBranchId] = useState(defaultBranch)
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? 'miscellaneous')
  const [vendorId, setVendorId] = useState('')
  const [payeeName, setPayeeName] = useState('')
  const [description, setDescription] = useState('')
  const [expenseDate, setExpenseDate] = useState(todayManila())
  const [dueDate, setDueDate] = useState('')
  const [amount, setAmount] = useState('')
  const [tax, setTax] = useState('0')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')

  const [vendorName, setVendorName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')

  const [templateName, setTemplateName] = useState('')
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [nextDueDate, setNextDueDate] = useState(todayManila())
  const [autoCreate, setAutoCreate] = useState(false)

  const title = type === 'add_expense' ? 'Add Expense'
    : type === 'petty_cash' ? 'Record Petty Cash'
      : type === 'add_vendor' ? 'Add Vendor'
        : 'Recurring Expense'

  function vendorChanged(value: string) {
    setVendorId(value)
    const vendor = vendors.find((entry) => entry.id === value)
    if (vendor) setPayeeName(vendor.name)
  }

  function validateMoney(value: string, label: string, allowZero = false) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0 || (!allowZero && parsed <= 0)) {
      throw new Error(`${label} must be ${allowZero ? 'zero or greater' : 'greater than zero'}.`)
    }
    return Math.round(parsed * 100)
  }

  async function submit() {
    if (busy) return
    setError(null)
    setSuccess(null)
    setBusy(true)
    try {
      if (type === 'add_vendor') {
        if (!vendorName.trim()) throw new Error('Vendor name is required.')
        if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.')
        const vendor = createExpenseVendor({ name: vendorName, contactPerson, phone, email, address, notes, status: 'active' })
        await confirmRemote('expense_vendors', vendor.id)
        setSuccess(`Vendor ${vendor.name} saved.`)
      } else if (type === 'petty_cash') {
        if (!branchId) throw new Error('Branch is required for petty cash.')
        if (!payeeName.trim()) throw new Error('Payee is required.')
        if (!description.trim()) throw new Error('Purpose is required.')
        const amountCents = validateMoney(amount, 'Petty cash amount')
        const { expense } = await recordPettyCashPersisted({
          branchId,
          amountCents,
          paymentDate: expenseDate,
          payeeName: payeeName.trim(),
          description: description.trim(),
          notes,
        })
        setSuccess(`Petty cash ${expense.expenseNumber} recorded.`)
      } else if (type === 'recurring') {
        if (!templateName.trim()) throw new Error('Template name is required.')
        if (scope === 'branch' && !branchId) throw new Error('Branch is required.')
        if (!payeeName.trim()) throw new Error('Vendor or payee is required.')
        if (!categoryId) throw new Error('Expense category is required.')
        if (!nextDueDate) throw new Error('Next due date is required.')
        const defaultAmountCents = amount.trim() ? validateMoney(amount, 'Default amount') : undefined
        const template = createRecurringExpenseTemplate({
          name: templateName,
          scope,
          branchId: scope === 'branch' ? branchId : undefined,
          categoryId,
          vendorId: vendorId || undefined,
          payeeName,
          frequency,
          defaultAmountCents,
          nextDueDate,
          autoCreate,
          status: 'active',
          createdBy: actor,
        })
        await confirmRemote('expense_recurring_templates', template.id)
        setSuccess(`Recurring template ${template.name} saved.`)
      } else {
        if (scope === 'branch' && !branchId) throw new Error('Branch is required.')
        if (!payeeName.trim()) throw new Error('Vendor or payee is required.')
        if (!description.trim()) throw new Error('Description is required.')
        if (!categoryId) throw new Error('Expense category is required.')
        const subtotalCents = validateMoney(amount, 'Expense amount')
        const taxCents = validateMoney(tax, 'Tax amount', true)
        const expense = await createExpensePersisted({
          scope,
          branchId: scope === 'branch' ? branchId : undefined,
          categoryId,
          vendorId: vendorId || undefined,
          payeeName: payeeName.trim(),
          description: description.trim(),
          expenseDate,
          dueDate: dueDate || undefined,
          subtotalCents,
          taxCents,
          referenceNumber: referenceNumber || undefined,
          sourceType: 'manual',
          notes,
        })
        setSuccess(`Expense ${expense.expenseNumber} saved.`)
      }
      onSuccess()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save this record.')
    } finally {
      setBusy(false)
    }
  }

  const branchOptions = branches.map((branch) => ({ value: branch.id, label: branch.name }))
  const categoryOptions = categories.map((category) => ({ value: category.id, label: category.name }))
  const vendorOptions = [{ value: '', label: 'No linked vendor' }, ...vendors.map((vendor) => ({ value: vendor.id, label: vendor.name }))]

  return (
    <div className="expense-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section className="expense-modal" role="dialog" aria-modal="true" aria-labelledby="expense-dialog-title">
        <header className="expense-modal-header">
          <div><h2 id="expense-dialog-title">{title}</h2><p>Enter only actual clinic financial data.</p></div>
          <button type="button" className="expense-modal-close" aria-label="Close" onClick={onClose} disabled={busy}><X size={20} /></button>
        </header>

        <div className="expense-modal-body">
          {error && <div className="expense-modal-message error" role="alert">{error}</div>}
          {success && <div className="expense-modal-message success" role="status">{success}</div>}

          {type === 'add_vendor' ? (
            <div className="expense-form-grid">
              <Input label="Vendor name" value={vendorName} onChange={(event) => setVendorName(event.target.value)} required autoFocus />
              <Input label="Contact person" value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} />
              <Input label="Phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
              <Input label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              <div className="expense-form-full"><Textarea label="Address" value={address} onChange={(event) => setAddress(event.target.value)} rows={2} /></div>
              <div className="expense-form-full"><Textarea label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} /></div>
            </div>
          ) : (
            <div className="expense-form-grid">
              {type !== 'petty_cash' && (
                <Select label="Scope" value={scope} onChange={(event) => setScope(event.target.value as 'branch' | 'clinic_wide')} options={[{ value: 'branch', label: 'Branch' }, { value: 'clinic_wide', label: 'Clinic-wide' }]} />
              )}
              {(type === 'petty_cash' || scope === 'branch') && <Select label="Branch" value={branchId} onChange={(event) => setBranchId(event.target.value)} options={branchOptions} />}
              {type === 'recurring' && <Input label="Template name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} required />}
              {type !== 'petty_cash' && <Select label="Category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} options={categoryOptions} />}
              {type !== 'petty_cash' && <Select label="Vendor record" value={vendorId} onChange={(event) => vendorChanged(event.target.value)} options={vendorOptions} />}
              <Input label={type === 'petty_cash' ? 'Payee' : 'Vendor or payee'} value={payeeName} onChange={(event) => setPayeeName(event.target.value)} required />
              {type !== 'recurring' && <Input label={type === 'petty_cash' ? 'Purpose' : 'Description'} value={description} onChange={(event) => setDescription(event.target.value)} required />}
              {type === 'recurring' ? (
                <>
                  <Select label="Frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as RecurringFrequency)} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'yearly', label: 'Yearly' }, { value: 'custom', label: 'Custom' }]} />
                  <Input label="Next due date" type="date" value={nextDueDate} onChange={(event) => setNextDueDate(event.target.value)} required />
                  <Input label="Default amount (PHP)" type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} hint="Optional. Leave blank when the amount varies by billing period." />
                  <label className="expense-checkbox"><input type="checkbox" checked={autoCreate} onChange={(event) => setAutoCreate(event.target.checked)} /><span>Automatically create expense records when due</span></label>
                </>
              ) : (
                <>
                  <Input label={type === 'petty_cash' ? 'Amount (PHP)' : 'Subtotal (PHP)'} type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
                  {type === 'add_expense' && <Input label="Tax (PHP)" type="number" min="0" step="0.01" value={tax} onChange={(event) => setTax(event.target.value)} />}
                  <Input label={type === 'petty_cash' ? 'Payment date' : 'Expense date'} type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} required />
                  {type === 'add_expense' && <Input label="Due date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />}
                  {type === 'add_expense' && <Input label="Reference number" value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} />}
                </>
              )}
              <div className="expense-form-full"><Textarea label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} /></div>
            </div>
          )}
        </div>

        <footer className="expense-modal-footer">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </footer>
      </section>
    </div>
  )
}
