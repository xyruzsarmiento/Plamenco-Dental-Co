import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import type { Branch } from '../branches/branchTypes'
import {
  getExpenseCategories,
  getExpenseVendors,
  type RecurringFrequency,
} from './expenseStore'
import {
  createExpensePersisted,
  createExpenseVendorPersisted,
  createRecurringExpenseTemplatePersisted,
  recordPettyCashPersisted,
} from './expensePersistence'

export type BranchScopedExpenseDialog = 'add_expense' | 'petty_cash' | 'add_vendor' | 'recurring'

type Props = {
  type: BranchScopedExpenseDialog
  branch?: Branch | null
  allowClinicWide?: boolean
  availableBranches?: Branch[]
  onClose: () => void
  onSuccess: () => void
}

function todayManila() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export function BranchScopedExpenseActionModal({ type, branch, allowClinicWide = false, availableBranches = [], onClose, onSuccess }: Props) {
  const categories = useMemo(() => getExpenseCategories().filter((category) => category.status === 'active'), [])
  const vendors = useMemo(() => getExpenseVendors().filter((vendor) => vendor.status === 'active'), [])
  const branchOptions = useMemo(() => {
    if (branch && !availableBranches.some((entry) => entry.id === branch.id)) return [branch, ...availableBranches]
    return availableBranches.length ? availableBranches : branch ? [branch] : []
  }, [availableBranches, branch])
  const defaultScope = !branch && allowClinicWide && type === 'add_expense' ? 'clinic_wide' : 'branch'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<'branch' | 'clinic_wide'>(defaultScope)
  const [branchId, setBranchId] = useState(branch?.id ?? branchOptions[0]?.id ?? '')
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

  const selectedBranch = branchOptions.find((entry) => entry.id === branchId) ?? branch ?? null
  const costCenterLabel = type === 'add_vendor'
    ? 'Clinic-wide vendor directory'
    : scope === 'clinic_wide' && type === 'add_expense'
      ? 'Clinic-wide operating cost'
      : selectedBranch?.name ?? 'Select a branch'
  const canPickCostCenter = type !== 'add_vendor' && (allowClinicWide || !branch || branchOptions.length > 1)
  const title = type === 'add_expense' ? 'Add Expense'
    : type === 'petty_cash' ? 'Record Small Cash Purchase'
      : type === 'add_vendor' ? 'Add Vendor'
        : 'New Scheduled Expense'

  function money(value: string, label: string, allowZero = false) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0 || (!allowZero && parsed <= 0)) throw new Error(`${label} must be ${allowZero ? 'zero or greater' : 'greater than zero'}.`)
    return Math.round(parsed * 100)
  }

  async function submit() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (type === 'add_vendor') {
        if (!vendorName.trim()) throw new Error('Vendor name is required.')
        await createExpenseVendorPersisted({ name: vendorName.trim(), contactPerson, phone, email, address, notes })
      } else if (type === 'petty_cash') {
        if (!payeeName.trim() || !description.trim()) throw new Error('Payee and purpose are required.')
        if (!branchId) throw new Error('Choose a branch for petty cash.')
        await recordPettyCashPersisted({
          branchId,
          amountCents: money(amount, 'Small cash amount'),
          paymentDate: expenseDate,
          payeeName: payeeName.trim(),
          description: description.trim(),
          notes,
        })
      } else if (type === 'recurring') {
        if (!templateName.trim() || !payeeName.trim()) throw new Error('Template name and payee are required.')
        const recurringScope = allowClinicWide ? scope : 'branch'
        if (recurringScope === 'branch' && !branchId) throw new Error('Choose a branch for this recurring expense.')
        await createRecurringExpenseTemplatePersisted({
          name: templateName.trim(),
          scope: recurringScope,
          branchId: recurringScope === 'branch' ? branchId : undefined,
          categoryId,
          vendorId: vendorId || undefined,
          payeeName: payeeName.trim(),
          frequency,
          defaultAmountCents: amount.trim() ? money(amount, 'Default amount') : undefined,
          nextDueDate,
          autoCreate,
        })
      } else {
        if (!payeeName.trim() || !description.trim()) throw new Error('Payee and description are required.')
        const expenseScope = allowClinicWide ? scope : 'branch'
        if (expenseScope === 'branch' && !branchId) throw new Error('Choose a branch for this expense.')
        await createExpensePersisted({
          scope: expenseScope,
          branchId: expenseScope === 'branch' ? branchId : undefined,
          categoryId,
          vendorId: vendorId || undefined,
          payeeName: payeeName.trim(),
          description: description.trim(),
          expenseDate,
          dueDate: dueDate || undefined,
          subtotalCents: money(amount, 'Expense amount'),
          taxCents: money(tax, 'Tax amount', true),
          referenceNumber: referenceNumber || undefined,
          sourceType: 'manual',
          notes,
        })
      }
      onSuccess()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this record.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="expense-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="expense-modal" role="dialog" aria-modal="true" aria-labelledby="branch-expense-dialog-title">
      <header className="expense-modal-header">
        <div><h2 id="branch-expense-dialog-title">{title}</h2><p className="ex122-modal-branch"><strong>{costCenterLabel}</strong><span>Saved to the clinic database, not the browser.</span></p></div>
        <button type="button" className="expense-modal-close" aria-label="Close" onClick={onClose} disabled={busy}><X size={20}/></button>
      </header>
      <div className="expense-modal-body">
        {error && <div className="expense-modal-message error" role="alert">{error}</div>}
        {type === 'add_vendor' ? <div className="expense-form-grid">
          <Input label="Vendor name" value={vendorName} onChange={(e)=>setVendorName(e.target.value)} required autoFocus/>
          <Input label="Contact person" value={contactPerson} onChange={(e)=>setContactPerson(e.target.value)}/>
          <Input label="Phone" value={phone} onChange={(e)=>setPhone(e.target.value)}/>
          <Input label="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)}/>
          <div className="expense-form-full"><Textarea label="Address" value={address} onChange={(e)=>setAddress(e.target.value)} rows={2}/></div>
          <div className="expense-form-full"><Textarea label="Notes" value={notes} onChange={(e)=>setNotes(e.target.value)} rows={3}/></div>
        </div> : <div className="expense-form-grid">
          {canPickCostCenter ? (
            type === 'petty_cash' ? (
              <Select
                label="Branch"
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
                options={branchOptions.map((entry) => ({ value: entry.id, label: entry.name }))}
              />
            ) : (
              <Select
                label="Cost center"
                value={scope === 'clinic_wide' ? 'clinic_wide' : branchId}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === 'clinic_wide') {
                    setScope('clinic_wide')
                    return
                  }
                  setScope('branch')
                  setBranchId(value)
                }}
                options={[
                  ...(allowClinicWide ? [{ value: 'clinic_wide', label: 'Clinic-wide' }] : []),
                  ...branchOptions.map((entry) => ({ value: entry.id, label: entry.name })),
                ]}
              />
            )
          ) : (
            <div className="ex122-locked-branch"><span>Branch</span><strong>{selectedBranch?.name ?? 'Clinic-wide'}</strong><small>This workflow is locked to the active workspace.</small></div>
          )}
          {type === 'recurring' && <Input label="Template name" value={templateName} onChange={(e)=>setTemplateName(e.target.value)} required/>}
          {type !== 'petty_cash' && <Select label="Category" value={categoryId} onChange={(e)=>setCategoryId(e.target.value)} options={categories.map((c)=>({value:c.id,label:c.name}))}/>} 
          {type !== 'petty_cash' && <Select label="Vendor record" value={vendorId} onChange={(e)=>{setVendorId(e.target.value);const vendor=vendors.find((v)=>v.id===e.target.value);if(vendor)setPayeeName(vendor.name)}} options={[{value:'',label:'No linked vendor'},...vendors.map((v)=>({value:v.id,label:v.name}))]}/>} 
          <Input label={type==='petty_cash'?'Payee':'Vendor or payee'} value={payeeName} onChange={(e)=>setPayeeName(e.target.value)} required/>
          {type !== 'recurring' && <Input label={type==='petty_cash'?'Purpose':'Description'} value={description} onChange={(e)=>setDescription(e.target.value)} required/>}
          {type === 'recurring' ? <>
            <Select label="Frequency" value={frequency} onChange={(e)=>setFrequency(e.target.value as RecurringFrequency)} options={['monthly','quarterly','yearly','custom'].map((value)=>({value,label:value.replaceAll('_',' ')}))}/>
            <Input label="Next due date" type="date" value={nextDueDate} onChange={(e)=>setNextDueDate(e.target.value)} required/>
            <Input label="Default amount (PHP)" type="number" min="0" step="0.01" value={amount} onChange={(e)=>setAmount(e.target.value)}/>
            <label className="expense-checkbox"><input type="checkbox" checked={autoCreate} onChange={(e)=>setAutoCreate(e.target.checked)}/><span>Automatically create expense records when due</span></label>
          </> : <>
            <Input label={type==='petty_cash'?'Amount (PHP)':'Subtotal (PHP)'} type="number" min="0.01" step="0.01" value={amount} onChange={(e)=>setAmount(e.target.value)} required/>
            {type==='add_expense' && <Input label="Tax (PHP)" type="number" min="0" step="0.01" value={tax} onChange={(e)=>setTax(e.target.value)}/>} 
            <Input label={type==='petty_cash'?'Payment date':'Expense date'} type="date" value={expenseDate} onChange={(e)=>setExpenseDate(e.target.value)} required/>
            {type==='add_expense' && <Input label="Due date" type="date" value={dueDate} onChange={(e)=>setDueDate(e.target.value)}/>} 
            {type==='add_expense' && <Input label="Reference number" value={referenceNumber} onChange={(e)=>setReferenceNumber(e.target.value)}/>} 
          </>}
          <div className="expense-form-full"><Textarea label="Notes" value={notes} onChange={(e)=>setNotes(e.target.value)} rows={3}/></div>
        </div>}
      </div>
      <footer className="expense-modal-footer"><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={()=>void submit()} disabled={busy}>{busy?'Saving…':'Save'}</Button></footer>
    </section>
  </div>
}
