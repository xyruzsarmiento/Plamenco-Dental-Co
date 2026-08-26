import { Building2, CalendarRange, PackageSearch, ReceiptText, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { PremiumLineChartV35 } from '../components/ui/PremiumInteractiveChartV35'
import { useAuth } from '../features/auth/AuthContext'
import { useBranchContext } from '../features/branches/BranchContext'
import { supabase } from '../lib/supabase'
import '../styles/reports-live-v129.css'
import { ReportsDatabaseWorkspaceV129 } from './ReportsDatabaseWorkspaceV129'

type Preset = 'today' | 'this_week' | 'last_7_days' | 'this_month' | 'last_month' | 'last_3_months' | 'this_quarter' | 'this_year' | 'custom'
type ReportPayload = {
  start_date: string
  end_date: string
  branch_id: string
  financial: { billed_revenue_cents:number; collections_cents:number; receivables_cents:number; operating_expenses_cents:number; expense_payments_cents:number; refunds_cents:number; net_operating_result_cents:number; net_cash_movement_cents:number }
  operations: { appointments:number; completed_visits:number; cancellations:number; no_shows:number; no_show_rate:number; patients_seen:number; new_patients:number }
  inventory: { active_items:number; low_stock:number; out_of_stock:number; expiring_soon:number; valuation_cents:number; consumed_quantity:number }
  service_demand: Array<{ service_id:string; service_name:string; demand:number; completed:number }>
  top_treatments: Array<{ name:string; performed:number; billed_cents:number }>
  trend: Array<{ date:string; collections_cents:number; expenses_cents:number }>
}

function php(cents=0){return new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(cents||0)/100)}
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function iso(d:Date){return d.toISOString().slice(0,10)}
function addDays(base:string,days:number){const d=new Date(`${base}T00:00:00+08:00`);d.setDate(d.getDate()+days);return iso(d)}
function range(preset:Preset){const base=today();const d=new Date(`${base}T00:00:00+08:00`);const y=d.getFullYear(),m=d.getMonth(),day=d.getDay(),monday=day===0?-6:1-day;if(preset==='today')return{start:base,end:base};if(preset==='this_week')return{start:addDays(base,monday),end:base};if(preset==='last_7_days')return{start:addDays(base,-6),end:base};if(preset==='this_month')return{start:`${base.slice(0,7)}-01`,end:base};if(preset==='last_month')return{start:iso(new Date(y,m-1,1)),end:iso(new Date(y,m,0))};if(preset==='last_3_months')return{start:iso(new Date(y,m-2,1)),end:base};if(preset==='this_quarter')return{start:iso(new Date(y,Math.floor(m/3)*3,1)),end:base};if(preset==='this_year')return{start:`${y}-01-01`,end:base};return{start:`${base.slice(0,7)}-01`,end:base}}

function StaffLiveReport() {
  const { activeBranch, activeBranchId } = useBranchContext()
  const initial=range('this_month')
  const [preset,setPreset]=useState<Preset>('this_month')
  const [start,setStart]=useState(initial.start)
  const [end,setEnd]=useState(initial.end)
  const [data,setData]=useState<ReportPayload|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState<string|null>(null)

  useEffect(()=>{let alive=true;if(!supabase||!activeBranchId){setLoading(false);return}setLoading(true);setError(null);void supabase.rpc('get_staff_branch_report_v131',{p_start_date:start,p_end_date:end,p_branch_id:activeBranchId}).then(({data:payload,error:rpcError})=>{if(!alive)return;if(rpcError){setError(rpcError.message);setData(null)}else setData(payload as ReportPayload);setLoading(false)});return()=>{alive=false}},[activeBranchId,end,start])
  const chart=useMemo(()=>data?.trend??[],[data])
  function choose(value:Preset){setPreset(value);if(value==='custom')return;const next=range(value);setStart(next.start);setEnd(next.end)}
  if(!activeBranchId||!activeBranch)return <section className="rep129"><div className="rep129-status is-error">Your staff account needs an active branch assignment before reports can be opened.</div></section>

  return <section className="rep129">
    <header className="rep129-hero"><div className="rep129-head"><div><span className="rep129-eyebrow">Authoritative branch reporting</span><h2>Reports & Analytics</h2><p>The same live reporting workspace is used for staff, restricted to your assigned clinic branch.</p></div><span className="rep129-scope"><Building2 size={13}/> {activeBranch.name}</span></div><div className="rep129-filters"><label>Period<select value={preset} onChange={(e)=>choose(e.target.value as Preset)}><option value="today">Today</option><option value="this_week">This Week</option><option value="last_7_days">Last 7 Days</option><option value="this_month">This Month</option><option value="last_month">Last Month</option><option value="last_3_months">Last 3 Months</option><option value="this_quarter">This Quarter</option><option value="this_year">This Year</option><option value="custom">Custom</option></select></label><label>From<input type="date" value={start} onChange={(e)=>{setPreset('custom');setStart(e.target.value)}}/></label><label>To<input type="date" value={end} onChange={(e)=>{setPreset('custom');setEnd(e.target.value)}}/></label></div></header>
    {loading&&<div className="rep129-status">Loading persisted branch transactions…</div>}{error&&<div className="rep129-status is-error">{error}</div>}
    {data&&<>
      <section className="rep129-kpis"><article className="rep129-kpi"><span>Billed revenue</span><strong>{php(data.financial.billed_revenue_cents)}</strong><small>Non-void invoices</small></article><article className="rep129-kpi"><span>Collections</span><strong>{php(data.financial.collections_cents)}</strong><small>Completed payments</small></article><article className="rep129-kpi"><span>Receivables</span><strong>{php(data.financial.receivables_cents)}</strong><small>Outstanding balances</small></article><article className="rep129-kpi"><span>Operating expenses</span><strong>{php(data.financial.operating_expenses_cents)}</strong><small>Assigned branch only</small></article><article className="rep129-kpi"><span>Appointments</span><strong>{data.operations.appointments}</strong><small>{data.operations.completed_visits} completed</small></article><article className="rep129-kpi"><span>No-show rate</span><strong>{(Number(data.operations.no_show_rate||0)*100).toFixed(1)}%</strong><small>{data.operations.no_shows} no-show{data.operations.no_shows===1?'':'s'}</small></article><article className="rep129-kpi"><span>Patients seen</span><strong>{data.operations.patients_seen}</strong><small>{data.operations.new_patients} new in range</small></article><article className="rep129-kpi"><span>Net operating result</span><strong>{php(data.financial.net_operating_result_cents)}</strong><small>Revenue less branch operating costs</small></article></section>
      <section className="rep129-card"><div className="rep129-card-head"><div><span className="rep129-eyebrow">Financial history</span><h3>Collections and expenses</h3><p>{start} through {end}. Data comes from persisted Supabase transactions.</p></div><CalendarRange size={20}/></div><PremiumLineChartV35 labels={chart.map((row)=>row.date.slice(5))} series={[{key:'collections',label:'Collections',values:chart.map((row)=>row.collections_cents),formatter:php},{key:'expenses',label:'Expenses',values:chart.map((row)=>row.expenses_cents),formatter:php}]} ariaLabel={`${activeBranch.name} historical collections and expenses`}/></section>
      <div className="rep129-grid"><section className="rep129-card"><div className="rep129-card-head"><div><span className="rep129-eyebrow">Service demand</span><h3>Requested services</h3><p>Appointment demand and completed visits for this branch.</p></div><UsersRound size={20}/></div><div className="rep129-ranks">{data.service_demand.slice(0,8).map((row)=><div className="rep129-rank" key={row.service_id}><div><strong>{row.service_name}</strong><small>{row.completed} completed</small></div><em>{row.demand} requests</em></div>)}{!data.service_demand.length&&<div className="rep129-empty">No service demand in this period.</div>}</div></section><section className="rep129-card"><div className="rep129-card-head"><div><span className="rep129-eyebrow">Top treatments</span><h3>Completed treatment activity</h3><p>Performed care recorded in this branch.</p></div><ReceiptText size={20}/></div><div className="rep129-ranks">{data.top_treatments.slice(0,8).map((row)=><div className="rep129-rank" key={row.name}><div><strong>{row.name}</strong><small>{php(row.billed_cents)} recorded value</small></div><em>{row.performed} performed</em></div>)}{!data.top_treatments.length&&<div className="rep129-empty">No completed treatments in this period.</div>}</div></section></div>
      <section className="rep129-card"><div className="rep129-card-head"><div><span className="rep129-eyebrow">Inventory position</span><h3>Branch stock health</h3><p>Operational inventory indicators for the assigned branch.</p></div><PackageSearch size={20}/></div><div className="rep129-tax"><div><span>Active items</span><strong>{data.inventory.active_items}</strong></div><div><span>Low stock</span><strong>{data.inventory.low_stock}</strong></div><div><span>Out of stock</span><strong>{data.inventory.out_of_stock}</strong></div><div><span>Expiring soon</span><strong>{data.inventory.expiring_soon}</strong></div><div><span>Inventory valuation</span><strong>{php(data.inventory.valuation_cents)}</strong></div><div><span>Consumed quantity</span><strong>{Number(data.inventory.consumed_quantity||0).toLocaleString('en-PH')}</strong></div></div></section>
      <div className="rep129-status">Staff reports are branch-scoped. All-branch comparisons, tax configuration, QRPH settlements and dentist performance remain Super Admin controls.</div>
    </>}
  </section>
}

export function ReportsUnifiedWorkspaceV131(){const{user}=useAuth();return user?.role==='super_admin'?<ReportsDatabaseWorkspaceV129/>:<StaffLiveReport/>}
