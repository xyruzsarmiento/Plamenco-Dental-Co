import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import type { Branch } from '../branches/branchTypes'
import { reviseExpense } from './expenseCorrectionStore'
import { getExpenseCategories, getExpenseVendors, type Expense } from './expenseStore'

type Props={expense:Expense;branch:Branch;onClose:()=>void;onSuccess:()=>void}

export function BranchScopedExpenseEditModal({expense,branch,onClose,onSuccess}:Props){
  const categories=useMemo(()=>getExpenseCategories().filter((c)=>c.status==='active'),[])
  const vendors=useMemo(()=>getExpenseVendors().filter((v)=>v.status==='active'),[])
  const [categoryId,setCategoryId]=useState(expense.categoryId)
  const [vendorId,setVendorId]=useState(expense.vendorId??'')
  const [payeeName,setPayeeName]=useState(expense.payeeName)
  const [description,setDescription]=useState(expense.description)
  const [expenseDate,setExpenseDate]=useState(expense.expenseDate)
  const [dueDate,setDueDate]=useState(expense.dueDate??'')
  const [subtotal,setSubtotal]=useState(String(expense.subtotalCents/100))
  const [tax,setTax]=useState(String(expense.taxCents/100))
  const [reference,setReference]=useState(expense.referenceNumber??'')
  const [notes,setNotes]=useState(expense.notes)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)
  async function save(){
    setBusy(true);setError(null)
    try{
      await reviseExpense(expense.id,{scope:'branch',branchId:branch.id,categoryId,vendorId:vendorId||undefined,payeeName,description,expenseDate,dueDate:dueDate||undefined,subtotalCents:Math.round(Number(subtotal)*100),taxCents:Math.round(Number(tax)*100),referenceNumber:reference||undefined,notes})
      onSuccess()
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to update expense.')}
    finally{setBusy(false)}
  }
  return <div className="ex57-modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&!busy&&onClose()}><section className="ex57-modal" role="dialog" aria-modal="true" aria-labelledby="ex122-edit-title"><header><div><span>BRANCH LEDGER CORRECTION</span><h2 id="ex122-edit-title">Edit {expense.expenseNumber}</h2><p>{branch.name} · branch ownership cannot be changed from this workspace.</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="Close"><X size={19}/></button></header><div className="ex57-modal-body">{error&&<div className="ex57-alert is-error">{error}</div>}<div className="ex57-form-grid"><div className="ex122-locked-branch"><span>Branch</span><strong>{branch.name}</strong><small>Locked to the active workspace.</small></div><Select label="Category" value={categoryId} onChange={(e)=>setCategoryId(e.target.value)} options={categories.map((c)=>({value:c.id,label:c.name}))}/><Select label="Vendor record" value={vendorId} onChange={(e)=>{setVendorId(e.target.value);const v=vendors.find((x)=>x.id===e.target.value);if(v)setPayeeName(v.name)}} options={[{value:'',label:'No linked vendor'},...vendors.map((v)=>({value:v.id,label:v.name}))]}/><Input label="Vendor or payee" value={payeeName} onChange={(e)=>setPayeeName(e.target.value)}/><Input label="Description" value={description} onChange={(e)=>setDescription(e.target.value)}/><Input label="Expense date" type="date" value={expenseDate} onChange={(e)=>setExpenseDate(e.target.value)}/><Input label="Due date" type="date" value={dueDate} onChange={(e)=>setDueDate(e.target.value)}/><Input label="Subtotal (PHP)" type="number" min="0" step="0.01" value={subtotal} onChange={(e)=>setSubtotal(e.target.value)}/><Input label="Tax (PHP)" type="number" min="0" step="0.01" value={tax} onChange={(e)=>setTax(e.target.value)}/><Input label="Reference" value={reference} onChange={(e)=>setReference(e.target.value)}/><div className="ex57-form-full"><Textarea label="Notes" rows={3} value={notes} onChange={(e)=>setNotes(e.target.value)}/></div></div></div><footer><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={()=>void save()} disabled={busy}>{busy?'Saving…':'Save correction'}</Button></footer></section></div>
}
