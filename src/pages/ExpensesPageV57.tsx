import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  Banknote,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Info,
  PencilLine,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Store,
  Ban,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-react'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Pagination, SkeletonChart } from '../components/ui/DesignSystem'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Textarea } from '../components/ui/Textarea'
import { ExpenseActionModal, type ExpenseDialogType } from '../features/expenses/ExpenseActionModal'
import { ExpenseRecordModal } from '../features/expenses/ExpenseRecordModal'
import { canCorrectExpenseAmount, canEditExpenseSafeFields, reviseExpense, voidExpenseWithConfirmation } from '../features/expenses/expenseCorrectionStore'
import { buildExpenseTrend, type ExpenseHistoryData } from '../features/expenses/expenseHistory'
import {
  createExpenseFromPurchaseReceipt,
  formatExpenseCurrency,
  getExpenseCategories,
  getExpenseDueStatus,
  getExpenseOverview,
  getExpensePayments,
  getExpenses,
  getExpenseVendors,
  getRecurringExpenseTemplates,
  type Expense,
  type ExpenseSourceType,
  type ExpenseStatus,
} from '../features/expenses/expenseStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { getPurchaseReceipts } from '../features/inventory/inventoryStore'
import { usePermissions } from '../features/auth/permissions'

type Tab = 'ledger' | 'due' | 'scheduled' | 'small_cash' | 'supplier_bills' | 'vendors'
type HistoricalExpenseViewProps = {
  historicalData?: ExpenseHistoryData | null
  historicalRange?: { start: string; end: string; label: string }
  historicalLoading?: boolean
}
const tabs: Array<{ key: Tab; label: string; helper: string }> = [
  { key: 'ledger', label: 'Ledger', helper: 'All recorded costs' },
  { key: 'due', label: 'Payables', helper: 'Bills that need attention' },
  { key: 'scheduled', label: 'Recurring', helper: 'Recurring templates' },
  { key: 'small_cash', label: 'Cash', helper: 'Petty cash records' },
  { key: 'supplier_bills', label: 'Supplier Bills', helper: 'Inventory-linked costs' },
  { key: 'vendors', label: 'Vendors', helper: 'Payee directory' },
]
const EXPENSE_PAGE_SIZE_OPTIONS = [10, 20, 50]
const EXPENSE_CARD_PAGE_SIZE = 6
const EXPENSE_LEDGER_PAGE_SIZE = 10

function pageItems<T>(items: T[], page: number, pageSize: number) {
  return items.slice((Math.max(1, page) - 1) * pageSize, Math.max(1, page) * pageSize)
}

function branchName(id?: string) {
  if (!id) return 'Clinic-wide'
  return getStoredBranches().find((branch) => branch.id === id)?.name ?? id
}
function categoryName(id: string) { return getExpenseCategories().find((item) => item.id === id)?.name ?? id }
function formatDate(value?: string) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
}
function todayManila() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function trendLabel(value: string, rowCount: number) {
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00+08:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: rowCount > 31 ? undefined : 'numeric' })
}
function initials(expense: Expense) { return (expense.payeeName || expense.description || 'EX').split(' ').filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') }

function CostTrend({ labels, values }: { labels: string[]; values: number[] }) {
  const [tip, setTip] = useState<{ x: number; y: number; index: number } | null>(null)
  const width = 920, height = 310, left = 44, right = 20, top = 25, bottom = 42
  const usableW = width - left - right, usableH = height - top - bottom
  const max = Math.max(1, ...values)
  const points = labels.map((_, index) => ({ x: labels.length <= 1 ? left + usableW / 2 : left + usableW * index / Math.max(1, labels.length - 1), y: top + usableH - ((values[index] ?? 0) / max) * usableH }))
  const line = points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
  const area = points.length ? `${line} L ${points[points.length - 1].x} ${top + usableH} L ${points[0].x} ${top + usableH} Z` : ''
  return <div className="ex57-trend" onMouseLeave={() => setTip(null)}>
    <div className="ex57-trend-scroll">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Operating cost trend">
        <defs><linearGradient id="ex57-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563EB" stopOpacity=".20"/><stop offset="100%" stopColor="#2563EB" stopOpacity=".02"/></linearGradient></defs>
        {[0,.25,.5,.75,1].map((ratio) => <line key={ratio} x1={left} x2={width-right} y1={top+usableH*ratio} y2={top+usableH*ratio} className="ex57-gridline" />)}
        {area && <path d={area} className="ex57-area" />}
        {line && <path d={line} className="ex57-line" />}
        {points.map((point,index) => <g key={`${labels[index]}-${index}`}>
          <circle cx={point.x} cy={point.y} r="12" className="ex57-hit" tabIndex={0}
            onMouseEnter={(event)=>setTip({x:event.clientX,y:event.clientY,index})}
            onMouseMove={(event)=>setTip({x:event.clientX,y:event.clientY,index})}
            onFocus={(event)=>{const r=event.currentTarget.getBoundingClientRect();setTip({x:r.left+r.width/2,y:r.top,index})}}
            onBlur={()=>setTip(null)} />
          <circle cx={point.x} cy={point.y} r="5" className="ex57-dot" />
        </g>)}
        {labels.map((label,index)=><text key={`${label}-axis`} x={points[index]?.x ?? left} y={height-12} textAnchor="middle" className="ex57-axis">{label}</text>)}
      </svg>
    </div>
    {tip && <div className="ex57-tooltip" style={{left:Math.min(tip.x+14, window.innerWidth-230),top:Math.max(12,tip.y-80)}}><strong>{labels[tip.index]}</strong><span>{formatExpenseCurrency(values[tip.index] ?? 0)}</span><small>Recorded operating costs</small></div>}
  </div>
}

function ExpenseEditModal({ expense, onClose, onSaved }: { expense: Expense; onClose: () => void; onSaved: (message: string) => void }) {
  const branches = getStoredBranches().filter((branch) => branch.status === 'active')
  const categories = getExpenseCategories().filter((category) => category.status === 'active')
  const vendors = getExpenseVendors().filter((vendor) => vendor.status === 'active')
  const [scope,setScope]=useState(expense.scope)
  const [branchId,setBranchId]=useState(expense.branchId ?? branches[0]?.id ?? '')
  const [categoryId,setCategoryId]=useState(expense.categoryId)
  const [vendorId,setVendorId]=useState(expense.vendorId ?? '')
  const [payeeName,setPayeeName]=useState(expense.payeeName)
  const [description,setDescription]=useState(expense.description)
  const [expenseDate,setExpenseDate]=useState(expense.expenseDate)
  const [dueDate,setDueDate]=useState(expense.dueDate ?? '')
  const [subtotal,setSubtotal]=useState(String(expense.subtotalCents/100))
  const [tax,setTax]=useState(String(expense.taxCents/100))
  const [reference,setReference]=useState(expense.referenceNumber ?? '')
  const [notes,setNotes]=useState(expense.notes)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const paymentCount = getExpensePayments().filter((payment) => payment.expenseId === expense.id).length
  const safeCorrection = canEditExpenseSafeFields(expense)
  const amountCorrection = canCorrectExpenseAmount(expense, paymentCount)
  const amountEditable = safeCorrection.allowed && amountCorrection.allowed
  async function save(){
    setBusy(true);setError(null)
    try{
      await reviseExpense(expense.id,{scope:expense.scope,branchId:expense.branchId,categoryId,vendorId:vendorId||undefined,payeeName,description,expenseDate,dueDate:dueDate||undefined,subtotalCents:amountEditable?Math.round(Number(subtotal)*100):expense.subtotalCents,taxCents:amountEditable?Math.round(Number(tax)*100):expense.taxCents,referenceNumber:amountEditable?reference||undefined:expense.referenceNumber,notes})
      onSaved(`${expense.expenseNumber} was updated and the change was recorded in the audit trail.`)
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to update expense.')}
    finally{setBusy(false)}
  }
  return <div className="ex57-modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&!busy&&onClose()}><section className="ex57-modal" role="dialog" aria-modal="true" aria-labelledby="ex57-edit-title">
    <header><div><span>Ledger correction</span><h2 id="ex57-edit-title">Edit {expense.expenseNumber}</h2><p>Safe details can be updated without changing payment history. Amounts lock after a payment is recorded.</p></div><button onClick={onClose} disabled={busy} aria-label="Close"><X size={19}/></button></header>
    <div className="ex57-modal-body">{error&&<div className="ex57-alert is-error">{error}</div>}{!safeCorrection.allowed&&<div className="ex57-alert is-error">{safeCorrection.reason}</div>}{safeCorrection.allowed&&!amountEditable&&<div className="ex57-alert">Amount and reference are locked because this expense already has payment history. Use void with a reason for financial corrections.</div>}<div className="ex57-form-grid">
      <Select label="Scope" value={scope} onChange={(e)=>setScope(e.target.value as 'branch'|'clinic_wide')} options={[{value:'branch',label:'Branch'},{value:'clinic_wide',label:'Clinic-wide'}]} disabled/>
      {scope==='branch'&&<Select label="Branch" value={branchId} onChange={(e)=>setBranchId(e.target.value)} options={branches.map((b)=>({value:b.id,label:b.name}))} disabled/>} 
      <Select label="Category" value={categoryId} onChange={(e)=>setCategoryId(e.target.value)} options={categories.map((c)=>({value:c.id,label:c.name}))}/>
      <Select label="Vendor record" value={vendorId} onChange={(e)=>{setVendorId(e.target.value);const v=vendors.find(x=>x.id===e.target.value);if(v)setPayeeName(v.name)}} options={[{value:'',label:'No linked vendor'},...vendors.map((v)=>({value:v.id,label:v.name}))]}/>
      <Input label="Vendor or payee" value={payeeName} onChange={(e)=>setPayeeName(e.target.value)}/><Input label="Description" value={description} onChange={(e)=>setDescription(e.target.value)}/>
      <Input label="Expense date" type="date" value={expenseDate} onChange={(e)=>setExpenseDate(e.target.value)}/><Input label="Due date" type="date" value={dueDate} onChange={(e)=>setDueDate(e.target.value)}/>
      <Input label="Subtotal (PHP)" type="number" min="0" step="0.01" value={subtotal} onChange={(e)=>setSubtotal(e.target.value)} disabled={!amountEditable}/><Input label="Tax (PHP)" type="number" min="0" step="0.01" value={tax} onChange={(e)=>setTax(e.target.value)} disabled={!amountEditable}/>
      <Input label="Reference" value={reference} onChange={(e)=>setReference(e.target.value)} disabled={!amountEditable}/><div className="ex57-form-full"><Textarea label="Notes" rows={3} value={notes} onChange={(e)=>setNotes(e.target.value)}/></div>
    </div></div>
    <footer><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={()=>void save()} disabled={busy||!safeCorrection.allowed}>{busy?'Saving...':'Save changes'}</Button></footer>
  </section></div>
}

function VoidExpenseModal({ expense, onClose, onSaved }: { expense: Expense; onClose:()=>void; onSaved:(message:string)=>void }) {
  const [reason,setReason]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)
  async function submit(){setBusy(true);setError(null);try{await voidExpenseWithConfirmation(expense.id,reason);onSaved(`${expense.expenseNumber} was voided. The original record remains in the audit trail.`)}catch(cause){setError(cause instanceof Error?cause.message:'Unable to void expense.')}finally{setBusy(false)}}
  return <div className="ex57-modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&!busy&&onClose()}><section className="ex57-modal ex57-void-modal" role="dialog" aria-modal="true"><header><div><span>Financial correction</span><h2>Void {expense.expenseNumber}</h2><p>Financial records are not permanently deleted. Voiding preserves the history and removes the record from active totals.</p></div><button type="button" aria-label="Close void expense dialog" onClick={onClose} disabled={busy}><X size={19}/></button></header><div className="ex57-modal-body">{error&&<div className="ex57-alert is-error">{error}</div>}<Textarea label="Reason for correction" rows={4} value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Explain what was entered incorrectly and why this record should be voided."/></div><footer><Button variant="secondary" onClick={onClose} disabled={busy}>Keep record</Button><Button onClick={()=>void submit()} disabled={busy||!reason.trim()}>Void expense</Button></footer></section></div>
}

export function ExpensesPageV57({ historicalData, historicalLoading = false, historicalRange }: HistoricalExpenseViewProps = {}) {
  const permissions=usePermissions()
  const [refreshKey,setRefreshKey]=useState(0)
  const [tab,setTab]=useState<Tab>('ledger')
  const [branch,setBranch]=useState('all')
  const [category,setCategory]=useState('all')
  const [status,setStatus]=useState<'all'|ExpenseStatus>('all')
  const [source,setSource]=useState<'all'|ExpenseSourceType>('all')
  const [search,setSearch]=useState('')
  const [selectedId,setSelectedId]=useState<string|null>(null)
  const [detailExpense,setDetailExpense]=useState<Expense|null>(null)
  const [dialog,setDialog]=useState<ExpenseDialogType|null>(null)
  const [editExpense,setEditExpense]=useState<Expense|null>(null)
  const [voidTarget,setVoidTarget]=useState<Expense|null>(null)
  const [message,setMessage]=useState<string|null>(null)
  const [error,setError]=useState<string|null>(null)
  const [ledgerPage,setLedgerPage]=useState(1)
  const [duePage,setDuePage]=useState(1)
  const [scheduledPage,setScheduledPage]=useState(1)
  const [cashPage,setCashPage]=useState(1)
  const [receiptPage,setReceiptPage]=useState(1)
  const [vendorPage,setVendorPage]=useState(1)
  const branches=useMemo(()=>{void refreshKey;return getStoredBranches()},[refreshKey])
  const expenses=useMemo(()=>{void refreshKey;return historicalData?.expenses ?? getExpenses()},[historicalData,refreshKey])
  const payments=useMemo(()=>{void refreshKey;return historicalData?.payments ?? getExpensePayments()},[historicalData,refreshKey])
  const vendors=useMemo(()=>{void refreshKey;return getExpenseVendors()},[refreshKey])
  const recurring=useMemo(()=>{void refreshKey;return getRecurringExpenseTemplates()},[refreshKey])
  const receipts=useMemo(()=>{void refreshKey;return getPurchaseReceipts()},[refreshKey])
  const overview=useMemo(()=>{void refreshKey;if(!historicalData)return getExpenseOverview(branch==='all'?undefined:branch);const scoped=historicalData.expenses.filter((expense)=>branch==='all'||expense.branchId===branch||(branch==='clinic_wide'&&expense.scope==='clinic_wide'));return{thisMonthCents:scoped.filter((expense)=>expense.status!=='void'&&expense.status!=='cancelled').reduce((sum,expense)=>sum+expense.totalCents,0),unpaidCents:scoped.filter((expense)=>expense.status!=='void'&&expense.status!=='cancelled').reduce((sum,expense)=>sum+expense.balanceCents,0),dueSoon:scoped.filter((expense)=>getExpenseDueStatus(expense)==='due_soon').length,overdue:scoped.filter((expense)=>getExpenseDueStatus(expense)==='overdue').length}},[historicalData,refreshKey,branch])
  const selected=selectedId?expenses.find((item)=>item.id===selectedId)??null:expenses.find((item)=>item.status!=='void')??expenses[0]??null
  const paidThisMonth=payments.reduce((sum,p)=>sum+p.amountCents,0)
  const due=expenses.filter((expense)=>['due_soon','overdue'].includes(getExpenseDueStatus(expense)))
  const petty=expenses.filter((expense)=>expense.categoryId==='petty_cash')
  const filtered=expenses.filter((expense)=>{const q=search.trim().toLowerCase();return(!q||`${expense.expenseNumber} ${expense.description} ${expense.payeeName} ${expense.referenceNumber??''}`.toLowerCase().includes(q))&&(branch==='all'||expense.branchId===branch||(branch==='clinic_wide'&&expense.scope==='clinic_wide'))&&(category==='all'||expense.categoryId===category)&&(status==='all'||expense.status===status)&&(source==='all'||expense.sourceType===source)})
  const ledgerPageCount=Math.max(1,Math.ceil(filtered.length/EXPENSE_LEDGER_PAGE_SIZE))
  const duePageCount=Math.max(1,Math.ceil(due.length/EXPENSE_CARD_PAGE_SIZE))
  const scheduledPageCount=Math.max(1,Math.ceil(recurring.length/EXPENSE_CARD_PAGE_SIZE))
  const cashPageCount=Math.max(1,Math.ceil(petty.length/EXPENSE_CARD_PAGE_SIZE))
  const receiptPageCount=Math.max(1,Math.ceil(receipts.length/EXPENSE_CARD_PAGE_SIZE))
  const vendorPageCount=Math.max(1,Math.ceil(vendors.length/EXPENSE_CARD_PAGE_SIZE))
  const visibleLedger=pageItems(filtered,Math.min(ledgerPage,ledgerPageCount),EXPENSE_LEDGER_PAGE_SIZE)
  const visibleDue=pageItems(due,Math.min(duePage,duePageCount),EXPENSE_CARD_PAGE_SIZE)
  const visibleRecurring=pageItems(recurring,Math.min(scheduledPage,scheduledPageCount),EXPENSE_CARD_PAGE_SIZE)
  const visiblePetty=pageItems(petty,Math.min(cashPage,cashPageCount),EXPENSE_CARD_PAGE_SIZE)
  const visibleReceipts=pageItems(receipts,Math.min(receiptPage,receiptPageCount),EXPENSE_CARD_PAGE_SIZE)
  const visibleVendors=pageItems(vendors,Math.min(vendorPage,vendorPageCount),EXPENSE_CARD_PAGE_SIZE)
  const expenseTrendRows=useMemo(()=>{
    if(historicalData?.trend?.length)return historicalData.trend
    const today=todayManila()
    const start=historicalRange?.start??`${today.slice(0,4)}-01-01`
    const end=historicalRange?.end??today
    const scopedExpenses=expenses.filter((expense)=>(branch==='all'||expense.branchId===branch||(branch==='clinic_wide'&&expense.scope==='clinic_wide')))
    return buildExpenseTrend(scopedExpenses,start,end)
  },[branch,expenses,historicalData,historicalRange])

  useEffect(()=>{setLedgerPage(1);setDuePage(1);setScheduledPage(1);setCashPage(1);setReceiptPage(1);setVendorPage(1)},[branch,category,search,source,status,tab])
  useEffect(()=>{
    setLedgerPage((page)=>Math.min(page,ledgerPageCount))
    setDuePage((page)=>Math.min(page,duePageCount))
    setScheduledPage((page)=>Math.min(page,scheduledPageCount))
    setCashPage((page)=>Math.min(page,cashPageCount))
    setReceiptPage((page)=>Math.min(page,receiptPageCount))
    setVendorPage((page)=>Math.min(page,vendorPageCount))
  },[cashPageCount,duePageCount,ledgerPageCount,receiptPageCount,scheduledPageCount,vendorPageCount])
  function refresh(note?:string){setRefreshKey((k)=>k+1);setError(null);if(note)setMessage(note)}
  function open(type:ExpenseDialogType){setMessage(null);setError(null);setDialog(type)}
  function createSupplierExpense(id:string){try{const created=createExpenseFromPurchaseReceipt(id);refresh(`${created.expenseNumber} created from the purchase receipt.`)}catch(cause){setError(cause instanceof Error?cause.message:'Unable to create supplier expense.')}}
  function openExpense(expense:Expense){setSelectedId(expense.id);setDetailExpense(expense)}
  function onExpenseKey(event:ReactKeyboardEvent<HTMLElement>,expense:Expense){if(event.key==='Enter'||event.key===' '){event.preventDefault();openExpense(expense)}}
  const correction=selected?canEditExpenseSafeFields(selected):null
  const amountCorrection=selected?canCorrectExpenseAmount(selected,payments.filter((payment)=>payment.expenseId===selected.id).length):null

  return <section className="ex57-page expenses-ia-page">
    <section className="ex57-hero"><div><span>EXPENSES</span><h1>Expenses</h1><p>Manage operating costs, payables and expense payments across the selected clinic scope.</p></div><div className="ex57-actions">{permissions.can('expenses.create')&&<Button onClick={()=>open('add_expense')}><Plus size={16}/>Add expense</Button>}{permissions.can('expenses.record_payment')&&<Button variant="secondary" onClick={()=>open('petty_cash')}><Banknote size={16}/>Record payment</Button>}{permissions.can('expenses.create')&&<Button variant="secondary" onClick={()=>open('add_vendor')}><Store size={16}/>More</Button>}</div></section>

    <section className="ex57-context"><Info size={17}/><div><strong>{historicalRange ? `Viewing ${historicalRange.label}` : 'Expenses do not reset every month.'}</strong><span>{historicalRange ? `${formatDate(historicalRange.start)} to ${formatDate(historicalRange.end)}. Recorded expenses use expense date; expense payments use payment date.` : 'The ledger keeps historical records. Refund workflows are retired from active operations; historical refund records remain available in reporting.'}</span></div></section>

    <section className={`ex57-kpis ${historicalLoading?'is-loading':''}`}><article><i><ReceiptText size={17}/></i><span>Recorded expenses</span><strong>{formatExpenseCurrency(overview.thisMonthCents)}</strong><small>{historicalRange?.label ?? 'Selected period'}</small></article><article><i><CircleDollarSign size={17}/></i><span>Current outstanding</span><strong>{formatExpenseCurrency(overview.unpaidCents)}</strong><small>For expenses created in selected period</small></article><article><i><CalendarClock size={17}/></i><span>Needs attention</span><strong>{overview.dueSoon+overview.overdue}</strong><small>{overview.overdue} overdue · {overview.dueSoon} due soon</small></article><article><i><WalletCards size={17}/></i><span>Expense payments</span><strong>{formatExpenseCurrency(paidThisMonth)}</strong><small>Payment date inside selected period</small></article></section>

    <section className="ex57-trend-card"><header><div><span>COST TREND</span><h2>Operating cost trend</h2><p>{historicalRange ? 'Trend follows the selected historical period and aggregates long ranges by month.' : 'Monthly recorded operating expenses for the current year.'}</p></div><div className="ex57-trend-total"><TrendingUp size={17}/><span>{historicalRange?.label ?? 'Year view'}</span><strong>{formatExpenseCurrency(expenseTrendRows.reduce((sum,row)=>sum+row.expensesCents,0))}</strong></div></header>{historicalLoading?<div className="ex129-chart-state ex129-chart-loading"><SkeletonChart/></div>:<CostTrend labels={expenseTrendRows.map((row)=>trendLabel(row.date,expenseTrendRows.length))} values={expenseTrendRows.map((row)=>row.expensesCents)}/>}</section>

    <section className="ex57-command"><div className="ex57-tabs" role="tablist">{tabs.map((item)=><button key={item.key} className={tab===item.key?'is-active':''} onClick={()=>setTab(item.key)}><strong>{item.label}</strong><span>{item.helper}</span></button>)}</div><div className="ex57-filters"><label className="ex57-search"><Search size={16}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search expense, payee or reference"/></label><select value={branch} onChange={(e)=>setBranch(e.target.value)}><option value="all">All branches</option><option value="clinic_wide">Clinic-wide</option>{branches.map((b)=><option key={b.id} value={b.id}>{b.name}</option>)}</select><select value={category} onChange={(e)=>setCategory(e.target.value)}><option value="all">All categories</option>{getExpenseCategories().map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={status} onChange={(e)=>setStatus(e.target.value as typeof status)}>{['all','draft','unpaid','partially_paid','paid','void','cancelled'].map((s)=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select><select value={source} onChange={(e)=>setSource(e.target.value as typeof source)}>{['all','manual','purchase_receipt','purchase_order','recurring','other'].map((s)=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></div></section>

    {error&&<div className="ex57-alert is-error">{error}</div>}{message&&<div className="ex57-alert is-success">{message}</div>}

    {tab==='ledger'&&<div className="ex57-workspace"><section className="ex57-list-panel"><header><div><span>EXPENSE LEDGER</span><h3>{filtered.length} records</h3></div><small>{historicalRange?`${formatDate(historicalRange.start)} to ${formatDate(historicalRange.end)}`:'Historical records stay here.'}</small></header>{historicalLoading?<div className="ex129-list-loading"><SkeletonChart/></div>:filtered.length?<div className="ex57-list">{visibleLedger.map((expense)=><button key={expense.id} className={`ex57-row ${selected?.id===expense.id?'is-selected':''}`} onClick={()=>openExpense(expense)}><span className="ex57-avatar">{initials(expense)}</span><span className="ex57-row-main"><strong>{expense.description}</strong><span>{expense.expenseNumber} · {expense.payeeName}</span><small>{formatDate(expense.expenseDate)} · {branchName(expense.branchId)} · {categoryName(expense.categoryId)}</small></span><span className="ex57-row-end"><StatusBadge status={expense.status} variant="compact" /><strong>{formatExpenseCurrency(expense.balanceCents)}</strong><ChevronRight size={16}/></span></button>)}</div>:<div className="ex57-empty"><ReceiptText size={28}/><h3>No expenses recorded for this period.</h3><p>Try another month, date range, or filter.</p></div>}<Pagination page={ledgerPage} pageCount={ledgerPageCount} totalItems={filtered.length} pageSize={EXPENSE_LEDGER_PAGE_SIZE} pageSizeOptions={EXPENSE_PAGE_SIZE_OPTIONS} onPageChange={setLedgerPage} label="Expense ledger pages" /></section><aside className="ex57-detail">{selected?<><header><div><span>PAYABLE RECORD</span><h3>{selected.expenseNumber}</h3><p>{selected.description}</p></div><StatusBadge status={selected.status} /></header><div className="ex57-detail-kpis"><article><span>Total</span><strong>{formatExpenseCurrency(selected.totalCents)}</strong></article><article><span>Paid</span><strong>{formatExpenseCurrency(selected.amountPaidCents)}</strong></article><article><span>Balance</span><strong>{formatExpenseCurrency(selected.balanceCents)}</strong></article></div><div className="ex57-info-grid"><article><span>Payee</span><strong>{selected.payeeName}</strong></article><article><span>Branch</span><strong>{branchName(selected.branchId)}</strong></article><article><span>Category</span><strong>{categoryName(selected.categoryId)}</strong></article><article><span>Expense date</span><strong>{formatDate(selected.expenseDate)}</strong></article><article><span>Due date</span><strong>{formatDate(selected.dueDate)}</strong></article><article><span>Source</span><strong>{selected.sourceType.replaceAll('_',' ')}</strong></article></div><section className="ex57-history ex57-scroll-section"><header><div><span>PAYMENT HISTORY</span><h4>Recorded payments</h4></div><b>{payments.filter((p)=>p.expenseId===selected.id).length}</b></header>{payments.filter((p)=>p.expenseId===selected.id).map((p)=><div key={p.id}><span><strong>{p.paymentMethod.replaceAll('_',' ')}</strong><small>{formatDate(p.paymentDate)} · {p.paidBy}</small></span><b>{formatExpenseCurrency(p.amountCents)}</b></div>)}{!payments.some((p)=>p.expenseId===selected.id)&&<p>No payment has been recorded for this expense in this selected payment-date period.</p>}</section><section className="ex57-correction"><div><span>RECORD CORRECTION</span><h4>Entered something incorrectly?</h4><p>{correction?.allowed?(amountCorrection?.allowed?'Safe fields and amount can be corrected because no payment exists.':'Safe fields can be updated. Amount is locked once payment history exists; use void with a reason for financial corrections.'):correction?.reason}</p></div><div>{permissions.can('expenses.edit')&&<Button variant="secondary" icon={<PencilLine size={14}/>} disabled={!correction?.allowed} onClick={()=>setEditExpense(selected)}>Edit record</Button>}{permissions.can('expenses.void')&&selected.status!=='void'&&<Button variant="secondary" icon={<Ban size={14}/>} onClick={()=>setVoidTarget(selected)}>Void record</Button>}</div></section></>:<div className="ex57-empty"><CircleDollarSign size={28}/><h3>Select an expense</h3><p>Choose a ledger entry to inspect its details.</p></div>}</aside></div>}

    {tab==='due'&&<section className="ex57-section"><header><div><span>PAYABLES WATCHLIST</span><h3>Due soon & overdue</h3><p>Only unpaid records with a due date inside the attention window appear here.</p></div><b>{due.length}</b></header><div className="ex57-card-grid">{visibleDue.map((expense)=><article className="ex57-mini expense-record-v153-clickable" key={expense.id} role="button" tabIndex={0} aria-label={`Open expense ${expense.expenseNumber}`} onClick={()=>openExpense(expense)} onKeyDown={(event)=>onExpenseKey(event,expense)}><div><StatusBadge status={getExpenseDueStatus(expense)} variant="compact" /><span>{expense.expenseNumber}</span></div><h4>{expense.description}</h4><p>{expense.payeeName} · {branchName(expense.branchId)}</p><footer><span>Due {formatDate(expense.dueDate)}</span><strong>{formatExpenseCurrency(expense.balanceCents)}</strong></footer></article>)}{!due.length&&<div className="ex57-empty is-wide"><CalendarClock size={28}/><h3>No urgent payables</h3></div>}</div><Pagination page={duePage} pageCount={duePageCount} totalItems={due.length} pageSize={EXPENSE_CARD_PAGE_SIZE} onPageChange={setDuePage} label="Payables watchlist pages" /></section>}

    {tab==='scheduled'&&<section className="ex57-section"><header><div><span>SCHEDULED EXPENSES</span><h3>Recurring expense templates</h3><p>Use these for predictable obligations such as rent, internet, subscriptions, or retainers. A template is a schedule, not a monthly reset of the ledger.</p></div>{permissions.can('expenses.manage_recurring')&&<Button size="sm" onClick={()=>open('recurring')}><Plus size={14}/>New schedule</Button>}</header><div className="ex57-explainer"><RefreshCw size={17}/><div><strong>What does “recurring” mean?</strong><span>It stores the payee, frequency, next due date and optional default amount so repeated bills can be created consistently. Existing expense records remain historical.</span></div></div><div className="ex57-card-grid">{visibleRecurring.map((item)=><article className="ex57-mini" key={item.id}><div><StatusBadge status={item.status} variant="compact" /><span>{item.frequency}</span></div><h4>{item.name}</h4><p>{item.payeeName} · {branchName(item.branchId)}</p><footer><span>Next due {formatDate(item.nextDueDate)}</span><strong>{item.defaultAmountCents?formatExpenseCurrency(item.defaultAmountCents):'Variable amount'}</strong></footer></article>)}{!recurring.length&&<div className="ex57-empty is-wide"><RefreshCw size={28}/><h3>No scheduled expense templates</h3><p>Add one only for costs that repeat on a predictable schedule.</p></div>}</div><Pagination page={scheduledPage} pageCount={scheduledPageCount} totalItems={recurring.length} pageSize={EXPENSE_CARD_PAGE_SIZE} onPageChange={setScheduledPage} label="Scheduled expense pages" /></section>}

    {tab==='small_cash'&&<section className="ex57-section"><header><div><span>SMALL CASH PURCHASES</span><h3>Petty cash</h3><p>Use this only for small day-to-day purchases paid immediately from clinic cash, such as transport, emergency supplies, or minor office purchases.</p></div>{permissions.can('expenses.record_payment')&&<Button size="sm" onClick={()=>open('petty_cash')}><Banknote size={14}/>Record small cash purchase</Button>}</header><div className="ex57-explainer"><Banknote size={17}/><div><strong>What is petty cash?</strong><span>Petty cash is a small amount of physical clinic cash reserved for minor immediate expenses. Recording one here creates the expense and records it as paid in cash on the same date.</span></div></div><div className="ex57-card-grid">{visiblePetty.map((expense)=><article className="ex57-mini expense-record-v153-clickable" key={expense.id} role="button" tabIndex={0} aria-label={`Open expense ${expense.expenseNumber}`} onClick={()=>openExpense(expense)} onKeyDown={(event)=>onExpenseKey(event,expense)}><div><StatusBadge status={expense.status} variant="compact" /><span>{expense.expenseNumber}</span></div><h4>{expense.description}</h4><p>{expense.payeeName} · {branchName(expense.branchId)}</p><footer><span>{formatDate(expense.expenseDate)}</span><strong>{formatExpenseCurrency(expense.totalCents)}</strong></footer></article>)}{!petty.length&&<div className="ex57-empty is-wide"><Banknote size={28}/><h3>No small cash purchases recorded</h3></div>}</div><Pagination page={cashPage} pageCount={cashPageCount} totalItems={petty.length} pageSize={EXPENSE_CARD_PAGE_SIZE} onPageChange={setCashPage} label="Small cash purchase pages" /></section>}

    {tab==='supplier_bills'&&<section className="ex57-section"><header><div><span>PROCUREMENT HANDOFF</span><h3>Supplier bills</h3><p>Purchase receipts can be linked into the expense ledger without retyping the same cost.</p></div><b>{receipts.length}</b></header><div className="ex57-card-grid">{visibleReceipts.map((receipt)=>{const linked=expenses.find((expense)=>expense.sourceType==='purchase_receipt'&&expense.sourceId===receipt.id);return <article className="ex57-mini" key={receipt.id}><div>{linked?<StatusBadge status={linked.status} label={linked.expenseNumber} variant="compact" />:<Badge tone="info">Not linked</Badge>}<span>{receipt.receiptNumber}</span></div><h4>{branchName(receipt.branchId)}</h4><p>Received {formatDate(receipt.receivedDate)}</p><footer><strong>{formatExpenseCurrency(receipt.totalCostCents)}</strong>{!linked&&permissions.can('expenses.create')&&<Button size="sm" onClick={()=>createSupplierExpense(receipt.id)}>Create expense</Button>}</footer></article>})}{!receipts.length&&<div className="ex57-empty is-wide"><FileText size={28}/><h3>No supplier receipts available</h3></div>}</div><Pagination page={receiptPage} pageCount={receiptPageCount} totalItems={receipts.length} pageSize={EXPENSE_CARD_PAGE_SIZE} onPageChange={setReceiptPage} label="Procurement handoff pages" /></section>}

    {tab==='vendors'&&<section className="ex57-section"><header><div><span>PAYEE DIRECTORY</span><h3>Vendors & suppliers</h3><p>Reusable vendor records reduce repeated typing and improve reporting consistency.</p></div>{permissions.can('expenses.create')&&<Button size="sm" onClick={()=>open('add_vendor')}><Store size={14}/>Add vendor</Button>}</header><div className="ex57-vendor-grid">{visibleVendors.map((vendor)=><article key={vendor.id}><span className="ex57-avatar">{vendor.name.split(' ').filter(Boolean).slice(0,2).map((x)=>x[0]).join('').toUpperCase()}</span><div><div><h4>{vendor.name}</h4><StatusBadge status={vendor.status} variant="compact" /></div><p>{vendor.contactPerson||'No contact person'} · {vendor.phone||'No phone'}</p><small>{vendor.email||vendor.address||'No additional contact details'}</small></div></article>)}</div><Pagination page={vendorPage} pageCount={vendorPageCount} totalItems={vendors.length} pageSize={EXPENSE_CARD_PAGE_SIZE} onPageChange={setVendorPage} label="Payee directory pages" /></section>}

    {dialog&&<ExpenseActionModal type={dialog} preferredBranchId={branch} onClose={()=>setDialog(null)} onSuccess={()=>{setDialog(null);refresh()}}/>}
    {editExpense&&<ExpenseEditModal expense={editExpense} onClose={()=>setEditExpense(null)} onSaved={(note)=>{setEditExpense(null);refresh(note)}}/>}
    {voidTarget&&<VoidExpenseModal expense={voidTarget} onClose={()=>setVoidTarget(null)} onSaved={(note)=>{setVoidTarget(null);refresh(note)}}/>}
    {detailExpense&&<ExpenseRecordModal expense={detailExpense} branchLabel={branchName(detailExpense.branchId)} payments={payments.filter((payment)=>payment.expenseId===detailExpense.id)} canEdit={permissions.can('expenses.edit')} canVoid={permissions.can('expenses.void')} canRecordPayment={permissions.can('expenses.record_payment')} onClose={()=>setDetailExpense(null)} onSaved={(note)=>{setDetailExpense(null);refresh(note)}}/>}
  </section>
}
