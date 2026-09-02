import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Banknote, CalendarClock, CircleDollarSign, FileText, Info, Plus, ReceiptText, Search, Store, TrendingUp, WalletCards } from 'lucide-react'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Pagination, Skeleton, SkeletonCard, SkeletonChart, SkeletonList, SkeletonText } from '../components/ui/DesignSystem'
import { useAuth } from '../features/auth/AuthContext'
import { usePermissions } from '../features/auth/permissions'
import { useBranchContext } from '../features/branches/BranchContext'
import { BranchScopedExpenseActionModal, type BranchScopedExpenseDialog } from '../features/expenses/BranchScopedExpenseActionModal'
import { ExpenseRecordModal } from '../features/expenses/ExpenseRecordModal'
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
import { getPurchaseReceipts } from '../features/inventory/inventoryStore'
import { ExpensesPageV57 } from './ExpensesPageV57'

type Tab = 'ledger' | 'due' | 'scheduled' | 'small_cash' | 'supplier_bills' | 'vendors'
const tabs: Array<{key:Tab;label:string;helper:string}> = [
  {key:'ledger',label:'Ledger',helper:'Branch operating costs'},
  {key:'due',label:'Payables',helper:'Bills needing attention'},
  {key:'scheduled',label:'Recurring',helper:'Branch recurring costs'},
  {key:'small_cash',label:'Cash',helper:'Branch petty cash'},
  {key:'supplier_bills',label:'Supplier Bills',helper:'Branch procurement costs'},
  {key:'vendors',label:'Vendors',helper:'Clinic-wide payee directory'},
]
const PAGE_SIZE = 8
type HistoricalExpenseWorkspaceProps = {
  historicalData?: ExpenseHistoryData | null
  historicalRange?: { start: string; end: string; label: string }
  historicalLoading?: boolean
}

function pageItems<T>(items:T[],page:number){return items.slice((Math.max(1,page)-1)*PAGE_SIZE,Math.max(1,page)*PAGE_SIZE)}
function formatDate(value?:string){if(!value)return'Not set';const d=new Date(value);return Number.isNaN(d.getTime())?value:d.toLocaleDateString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric'})}
function todayManila(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function trendLabel(value:string,rowCount:number){const d=new Date(value.includes('T')?value:`${value}T00:00:00+08:00`);return Number.isNaN(d.getTime())?value:d.toLocaleDateString('en-PH',{timeZone:'Asia/Manila',month:'short',day:rowCount>31?undefined:'numeric'})}
function categoryName(id:string){return getExpenseCategories().find((c)=>c.id===id)?.name??id}
function ExpenseWorkspaceSkeleton({label='Loading expense workspace'}:{label?:string}){
  return <section className="ex57-page ex122-page ex122-skeleton" aria-busy="true" aria-label={label}>
    <SkeletonCard className="ex122-skeleton-hero"><Skeleton width={180} height={12}/><Skeleton width="42%" height={34} radius={12}/><SkeletonText lines={2} widths={['58%','44%']}/></SkeletonCard>
    <SkeletonCard compact><Skeleton width="24%" height={12}/><Skeleton width="46%" height={18}/><Skeleton width="36%" height={12}/></SkeletonCard>
    <div className="ex122-skeleton-kpis">{Array.from({length:4},(_,index)=><SkeletonCard key={index} compact />)}</div>
    <SkeletonCard className="ex122-skeleton-chart"><Skeleton width="24%" height={12}/><Skeleton width="36%" height={24}/><SkeletonChart/></SkeletonCard>
    <SkeletonCard className="ex122-skeleton-command" compact><Skeleton width="100%" height={42} radius={14}/><Skeleton width="100%" height={42} radius={14}/></SkeletonCard>
    <SkeletonCard><Skeleton width="26%" height={14}/><SkeletonList items={5} withAvatar={false}/></SkeletonCard>
  </section>
}

function CostTrend({labels,values}:{labels:string[];values:number[]}){
  const width=880,height=240,left=44,right=20,top=22,bottom=34
  const usableW=width-left-right,usableH=height-top-bottom,max=Math.max(1,...values)
  const points=labels.map((_,i)=>({x:labels.length<=1?left+usableW/2:left+usableW*i/Math.max(1,labels.length-1),y:top+usableH-((values[i]??0)/max)*usableH}))
  const line=points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ')
  const area=points.length?`${line} L ${points.at(-1)!.x} ${top+usableH} L ${points[0].x} ${top+usableH} Z`:''
  return <div className="ex57-trend"><div className="ex57-trend-scroll"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Branch operating cost trend"><defs><linearGradient id="ex122-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563EB" stopOpacity=".20"/><stop offset="100%" stopColor="#2563EB" stopOpacity=".02"/></linearGradient></defs>{[0,.25,.5,.75,1].map((r)=><line key={r} x1={left} x2={width-right} y1={top+usableH*r} y2={top+usableH*r} className="ex57-gridline"/>)}{area&&<path d={area} fill="url(#ex122-area)"/>}{line&&<path d={line} className="ex57-line"/>}{points.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="5" className="ex57-dot"/><text x={p.x} y={height-10} textAnchor="middle" className="ex57-axis">{labels[i]}</text><title>{`${labels[i]}: ${formatExpenseCurrency(values[i]??0)}`}</title></g>)}</svg></div></div>
}

function ScopedBranchExpenses({ historicalData, historicalLoading = false, historicalRange }: HistoricalExpenseWorkspaceProps){
  const {activeBranch,activeBranchId,authorizedBranchIds}=useBranchContext()
  const permissions=usePermissions()
  const [refreshKey,setRefreshKey]=useState(0)
  const [tab,setTab]=useState<Tab>('ledger')
  const [search,setSearch]=useState('')
  const [category,setCategory]=useState('all')
  const [status,setStatus]=useState<'all'|ExpenseStatus>('all')
  const [source,setSource]=useState<'all'|ExpenseSourceType>('all')
  const [page,setPage]=useState(1)
  const [dialog,setDialog]=useState<BranchScopedExpenseDialog|null>(null)
  const [selectedExpense,setSelectedExpense]=useState<Expense|null>(null)
  const [isPageLoading,setIsPageLoading]=useState(true)
  const [message,setMessage]=useState<string|null>(null)
  const [error,setError]=useState<string|null>(null)

  const allExpenses=useMemo(()=>{void refreshKey;return historicalData?.expenses ?? getExpenses()},[historicalData,refreshKey])
  const expenses=useMemo(()=>allExpenses.filter((e)=>e.scope==='branch'&&e.branchId===activeBranchId),[activeBranchId,allExpenses])
  const expenseIds=useMemo(()=>new Set(expenses.map((e)=>e.id)),[expenses])
  const payments=useMemo(()=>{void refreshKey;return (historicalData?.payments ?? getExpensePayments()).filter((p)=>expenseIds.has(p.expenseId))},[expenseIds,historicalData,refreshKey])
  const recurring=useMemo(()=>{void refreshKey;return getRecurringExpenseTemplates().filter((r)=>r.scope==='branch'&&r.branchId===activeBranchId)},[activeBranchId,refreshKey])
  const receipts=useMemo(()=>{void refreshKey;return getPurchaseReceipts().filter((r)=>r.branchId===activeBranchId)},[activeBranchId,refreshKey])
  const vendors=useMemo(()=>{void refreshKey;return getExpenseVendors()},[refreshKey])
  const overview=useMemo(()=>{void refreshKey;if(!historicalData)return activeBranchId?getExpenseOverview(activeBranchId):getExpenseOverview(undefined);return{thisMonthCents:expenses.filter((expense)=>expense.status!=='void'&&expense.status!=='cancelled').reduce((sum,expense)=>sum+expense.totalCents,0),unpaidCents:expenses.filter((expense)=>expense.status!=='void'&&expense.status!=='cancelled').reduce((sum,expense)=>sum+expense.balanceCents,0),dueSoon:expenses.filter((expense)=>getExpenseDueStatus(expense)==='due_soon').length,overdue:expenses.filter((expense)=>getExpenseDueStatus(expense)==='overdue').length}},[activeBranchId,expenses,historicalData,refreshKey])
  const paidThisMonth=payments.reduce((sum,p)=>sum+p.amountCents,0)
  const due=expenses.filter((e)=>['due_soon','overdue'].includes(getExpenseDueStatus(e)))
  const petty=expenses.filter((e)=>e.categoryId==='petty_cash')
  const filtered=expenses.filter((e)=>{const q=search.trim().toLowerCase();return(!q||`${e.expenseNumber} ${e.description} ${e.payeeName} ${e.referenceNumber??''}`.toLowerCase().includes(q))&&(category==='all'||e.categoryId===category)&&(status==='all'||e.status===status)&&(source==='all'||e.sourceType===source)})
  const sourceRows:unknown[]=tab==='ledger'?filtered:tab==='due'?due:tab==='scheduled'?recurring:tab==='small_cash'?petty:tab==='supplier_bills'?receipts:vendors
  const pageCount=Math.max(1,Math.ceil(sourceRows.length/PAGE_SIZE))
  const expenseTrendRows=useMemo(()=>{
    if(historicalData?.trend?.length)return historicalData.trend
    const today=todayManila()
    const start=historicalRange?.start??`${today.slice(0,4)}-01-01`
    const end=historicalRange?.end??today
    return buildExpenseTrend(expenses,start,end)
  },[expenses,historicalData,historicalRange])
  useEffect(()=>setPage(1),[activeBranchId,category,search,source,status,tab])
  useEffect(()=>setPage((p)=>Math.min(p,pageCount)),[pageCount])
  useEffect(()=>{setIsPageLoading(true);const id=window.setTimeout(()=>setIsPageLoading(false),180);return()=>window.clearTimeout(id)},[activeBranchId,authorizedBranchIds])

  if(!activeBranch||!activeBranchId)return <section className="ex57-page"><div className="ex57-empty"><CircleDollarSign size={28}/><h3>No branch workspace selected</h3><p>Select an authorized branch before using expense operations.</p></div></section>
  if(isPageLoading)return <ExpenseWorkspaceSkeleton />
  const branch=activeBranch

  function refresh(note?:string){setRefreshKey((k)=>k+1);setError(null);setSelectedExpense(null);if(note)setMessage(note)}
  function createSupplierExpense(receiptId:string){try{const created=createExpenseFromPurchaseReceipt(receiptId);refresh(`${created.expenseNumber} created from this ${branch.name} purchase receipt.`)}catch(cause){setError(cause instanceof Error?cause.message:'Unable to create supplier expense.')}}
  function openExpense(expense:Expense){setSelectedExpense(expense)}
  function onExpenseKey(event:ReactKeyboardEvent<HTMLElement>,expense:Expense){if(event.key==='Enter'||event.key===' '){event.preventDefault();openExpense(expense)}}

  return <section className="ex57-page ex122-page expenses-ia-page" data-expense-scope-key={`expenses:${activeBranchId}:${authorizedBranchIds.join(',')}`}>
    <section className="ex57-hero"><div><span>FINANCE OPERATIONS · {branch.name.toUpperCase()}</span><h1>Expense Control Center</h1><p>Branch operating costs, payables, recurring expenses, small cash and supplier bills for {branch.name}.</p></div><div className="ex57-actions">{permissions.can('expenses.create')&&<Button onClick={()=>setDialog('add_expense')}><Plus size={16}/>Add expense</Button>}{permissions.can('expenses.record_payment')&&<Button variant="secondary" onClick={()=>setDialog('petty_cash')}><Banknote size={16}/>Small cash purchase</Button>}{permissions.can('expenses.create')&&<Button variant="secondary" onClick={()=>setDialog('add_vendor')}><Store size={16}/>Add vendor</Button>}</div></section>
    <section className="ex122-branch-context"><div><span>ACTIVE COST CENTER</span><strong>{branch.name}</strong><small>Branch-owned entries created here are locked to this workspace.</small></div><Badge tone="info">Branch expense scope</Badge></section>
    <section className="ex57-context"><Info size={17}/><div><strong>Clinic-wide costs are kept separate.</strong><span>This workspace excludes company-wide subscriptions, central marketing and other shared administrative costs so branch profitability is not distorted.</span></div></section>
    <section className={`ex57-kpis ${historicalLoading?'is-loading':''}`}><article><i><ReceiptText size={17}/></i><span>Recorded expenses</span><strong>{formatExpenseCurrency(overview.thisMonthCents)}</strong><small>{historicalRange?.label ?? branch.name}</small></article><article><i><CircleDollarSign size={17}/></i><span>Current outstanding</span><strong>{formatExpenseCurrency(overview.unpaidCents)}</strong><small>For expenses created in selected period</small></article><article><i><CalendarClock size={17}/></i><span>Needs attention</span><strong>{overview.dueSoon+overview.overdue}</strong><small>{overview.overdue} overdue · {overview.dueSoon} due soon</small></article><article><i><WalletCards size={17}/></i><span>Expense payments</span><strong>{formatExpenseCurrency(paidThisMonth)}</strong><small>Payment date inside selected period</small></article></section>
    <section className="ex57-trend-card"><header><div><span>COST TREND · {branch.name.toUpperCase()}</span><h2>Operating cost trend</h2><p>{historicalRange?`${formatDate(historicalRange.start)} to ${formatDate(historicalRange.end)}. Only expenses owned by this branch are counted.`:'Only expenses owned by this branch are counted. Clinic-wide costs are intentionally excluded.'}</p></div><div className="ex57-trend-total"><TrendingUp size={17}/><span>{historicalRange?.label ?? 'Year view'}</span><strong>{formatExpenseCurrency(expenseTrendRows.reduce((sum,row)=>sum+row.expensesCents,0))}</strong></div></header>{historicalLoading?<div className="ex129-chart-state ex129-chart-loading"><SkeletonChart/></div>:<CostTrend labels={expenseTrendRows.map((row)=>trendLabel(row.date,expenseTrendRows.length))} values={expenseTrendRows.map((row)=>row.expensesCents)}/>}</section>
    <section className="ex57-command"><div className="ex57-tabs" role="tablist">{tabs.map((item)=><button key={item.key} className={tab===item.key?'is-active':''} onClick={()=>setTab(item.key)}><strong>{item.label}</strong><span>{item.helper}</span></button>)}</div><div className="ex57-filters"><label className="ex57-search"><Search size={16}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search expense, payee or reference"/></label><span className="ex122-filter-branch">{branch.name}</span><select value={category} onChange={(e)=>setCategory(e.target.value)}><option value="all">All categories</option>{getExpenseCategories().map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={status} onChange={(e)=>setStatus(e.target.value as typeof status)}>{['all','draft','unpaid','partially_paid','paid','void','cancelled'].map((s)=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select><select value={source} onChange={(e)=>setSource(e.target.value as typeof source)}>{['all','manual','purchase_receipt','purchase_order','recurring','other'].map((s)=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></div></section>
    {error&&<div className="ex57-alert is-error">{error}</div>}{message&&<div className="ex57-alert is-success">{message}</div>}
    {tab==='ledger'&&<section className="ex57-section"><header><div><span>EXPENSE LEDGER · {branch.name.toUpperCase()}</span><h3>{filtered.length} records</h3><p>{historicalRange?`${formatDate(historicalRange.start)} to ${formatDate(historicalRange.end)}. Company-wide expenses are not included in this branch ledger.`:'Company-wide expenses are not included in this branch ledger.'}</p></div></header><div className="ex57-card-grid">{historicalLoading?<div className="ex129-list-loading is-wide"><SkeletonChart/></div>:pageItems(filtered,page).map((e)=><article className="ex57-mini ex122-expense-card" key={e.id} role="button" tabIndex={0} aria-label={`Open expense ${e.expenseNumber}`} onClick={()=>openExpense(e)} onKeyDown={(event)=>onExpenseKey(event,e)}><div><StatusBadge status={e.status} variant="compact"/><span>{e.expenseNumber}</span></div><h4>{e.description}</h4><p>{e.payeeName} · {categoryName(e.categoryId)}</p><footer><span>{formatDate(e.expenseDate)}</span><strong>{formatExpenseCurrency(e.balanceCents)}</strong></footer></article>)}{!historicalLoading&&!filtered.length&&<div className="ex57-empty is-wide"><ReceiptText size={28}/><h3>No expenses recorded for this period.</h3><p>Try another month, date range, or filter.</p></div>}</div></section>}
    {tab==='due'&&<section className="ex57-section"><header><div><span>PAYABLES WATCHLIST</span><h3>{branch.name} due & payables</h3><p>Only branch-owned outstanding expenses appear here.</p></div><b>{due.length}</b></header><div className="ex57-card-grid">{pageItems(due,page).map((e)=><article className="ex57-mini ex122-expense-card" key={e.id} role="button" tabIndex={0} aria-label={`Open expense ${e.expenseNumber}`} onClick={()=>openExpense(e)} onKeyDown={(event)=>onExpenseKey(event,e)}><div><StatusBadge status={getExpenseDueStatus(e)} variant="compact"/><span>{e.expenseNumber}</span></div><h4>{e.description}</h4><p>{e.payeeName}</p><footer><span>Due {formatDate(e.dueDate)}</span><strong>{formatExpenseCurrency(e.balanceCents)}</strong></footer></article>)}{!due.length&&<div className="ex57-empty is-wide"><CalendarClock size={28}/><h3>No urgent branch payables</h3></div>}</div></section>}
    {tab==='scheduled'&&<section className="ex57-section"><header><div><span>SCHEDULED EXPENSES</span><h3>{branch.name} recurring costs</h3><p>Rent, utilities and other predictable branch obligations remain tied to this branch.</p></div>{permissions.can('expenses.manage_recurring')&&<Button size="sm" onClick={()=>setDialog('recurring')}><Plus size={14}/>New schedule</Button>}</header><div className="ex57-card-grid">{pageItems(recurring,page).map((r)=><article className="ex57-mini" key={r.id}><div><StatusBadge status={r.status} variant="compact"/><span>{r.frequency}</span></div><h4>{r.name}</h4><p>{r.payeeName} · {branch.name}</p><footer><span>Next due {formatDate(r.nextDueDate)}</span><strong>{r.defaultAmountCents?formatExpenseCurrency(r.defaultAmountCents):'Variable amount'}</strong></footer></article>)}{!recurring.length&&<div className="ex57-empty is-wide"><CalendarClock size={28}/><h3>No branch schedules</h3></div>}</div></section>}
    {tab==='small_cash'&&<section className="ex57-section"><header><div><span>SMALL CASH PURCHASES</span><h3>{branch.name} petty cash</h3><p>Immediate minor purchases are recorded only against this branch.</p></div>{permissions.can('expenses.record_payment')&&<Button size="sm" onClick={()=>setDialog('petty_cash')}><Banknote size={14}/>Record small cash purchase</Button>}</header><div className="ex57-card-grid">{pageItems(petty,page).map((e)=><article className="ex57-mini ex122-expense-card" key={e.id} role="button" tabIndex={0} aria-label={`Open expense ${e.expenseNumber}`} onClick={()=>openExpense(e)} onKeyDown={(event)=>onExpenseKey(event,e)}><div><StatusBadge status={e.status} variant="compact"/><span>{e.expenseNumber}</span></div><h4>{e.description}</h4><p>{e.payeeName}</p><footer><span>{formatDate(e.expenseDate)}</span><strong>{formatExpenseCurrency(e.totalCents)}</strong></footer></article>)}{!petty.length&&<div className="ex57-empty is-wide"><Banknote size={28}/><h3>No branch small cash purchases</h3></div>}</div></section>}
    {tab==='supplier_bills'&&<section className="ex57-section"><header><div><span>PROCUREMENT HANDOFF</span><h3>{branch.name} supplier bills</h3><p>Only purchase receipts delivered to this branch are shown.</p></div><b>{receipts.length}</b></header><div className="ex57-card-grid">{pageItems(receipts,page).map((r)=>{const linked=expenses.find((e)=>e.sourceType==='purchase_receipt'&&e.sourceId===r.id);return <article className="ex57-mini" key={r.id}><div>{linked?<StatusBadge status={linked.status} label={linked.expenseNumber} variant="compact"/>:<Badge tone="info">Not linked</Badge>}<span>{r.receiptNumber}</span></div><h4>{branch.name}</h4><p>Received {formatDate(r.receivedDate)}</p><footer><strong>{formatExpenseCurrency(r.totalCostCents)}</strong>{!linked&&permissions.can('expenses.create')&&<Button size="sm" onClick={()=>createSupplierExpense(r.id)}>Create expense</Button>}</footer></article>})}{!receipts.length&&<div className="ex57-empty is-wide"><FileText size={28}/><h3>No branch supplier receipts</h3></div>}</div></section>}
    {tab==='vendors'&&<section className="ex57-section"><header><div><span>PAYEE DIRECTORY</span><h3>Vendors & suppliers</h3><p>The vendor directory remains clinic-wide; branch ownership starts when an expense or purchase is recorded.</p></div>{permissions.can('expenses.create')&&<Button size="sm" onClick={()=>setDialog('add_vendor')}><Store size={14}/>Add vendor</Button>}</header><div className="ex57-vendor-grid">{pageItems(vendors,page).map((v)=><article key={v.id}><span className="ex57-avatar">{v.name.split(' ').filter(Boolean).slice(0,2).map((x)=>x[0]).join('').toUpperCase()}</span><div><div><h4>{v.name}</h4><StatusBadge status={v.status} variant="compact"/></div><p>{v.contactPerson||'No contact person'} · {v.phone||'No phone'}</p><small>{v.email||v.address||'No additional contact details'}</small></div></article>)}</div></section>}
    <Pagination page={page} pageCount={pageCount} totalItems={sourceRows.length} pageSize={PAGE_SIZE} onPageChange={setPage} label="Branch expense pages"/>
    {dialog&&<BranchScopedExpenseActionModal type={dialog} branch={branch} onClose={()=>setDialog(null)} onSuccess={()=>{setDialog(null);refresh('Expense workspace updated.')}}/>}
    {selectedExpense&&<ExpenseRecordModal expense={selectedExpense} branchLabel={branch.name} payments={payments.filter((payment)=>payment.expenseId===selectedExpense.id)} canEdit={permissions.can('expenses.edit')} canVoid={permissions.can('expenses.void')} canRecordPayment={permissions.can('expenses.record_payment')} onClose={()=>setSelectedExpense(null)} onSaved={refresh}/>}
  </section>
}

export function ExpensesBranchWorkspaceV122(props: HistoricalExpenseWorkspaceProps = {}){
  const {user}=useAuth()
  const {isAllBranchesMode}=useBranchContext()
  if(isAllBranchesMode&&user?.role==='super_admin')return <div className="ex122-all-branches"><section className="ex122-company-scope"><div><span>ALL BRANCHES · FINANCE</span><strong>Executive and clinic-wide cost view</strong><small>Branch expenses remain distinct from company-wide costs; clinic-wide records are counted once.</small></div><Badge tone="info">Comparison mode</Badge></section><ExpensesPageV57 {...props}/></div>
  return <ScopedBranchExpenses {...props}/>
}

