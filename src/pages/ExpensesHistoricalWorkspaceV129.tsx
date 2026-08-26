import { useEffect, useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { PremiumLineChartV35 } from '../components/ui/PremiumInteractiveChartV35'
import { useAuth } from '../features/auth/AuthContext'
import { useBranchContext } from '../features/branches/BranchContext'
import { supabase } from '../lib/supabase'
import { ExpensesBranchWorkspaceV122 } from './ExpensesBranchWorkspaceV122'

type RangeKey = 'this_month' | 'last_month' | 'last_3_months' | 'this_quarter' | 'this_year' | 'last_year' | 'custom'
type History = { financial: { operating_expenses_cents: number; expense_payments_cents: number }; trend: Array<{ date: string; expenses_cents: number }> }
function php(cents=0){return new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(cents/100)}
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function iso(d:Date){return d.toISOString().slice(0,10)}
function range(key:RangeKey){const base=today();const d=new Date(`${base}T00:00:00+08:00`);const y=d.getFullYear(),m=d.getMonth();if(key==='this_month')return{start:`${base.slice(0,7)}-01`,end:base};if(key==='last_month')return{start:iso(new Date(y,m-1,1)),end:iso(new Date(y,m,0))};if(key==='last_3_months')return{start:iso(new Date(y,m-2,1)),end:base};if(key==='this_quarter')return{start:iso(new Date(y,Math.floor(m/3)*3,1)),end:base};if(key==='this_year')return{start:`${y}-01-01`,end:base};if(key==='last_year')return{start:`${y-1}-01-01`,end:`${y-1}-12-31`};return{start:`${base.slice(0,7)}-01`,end:base}}

export function ExpensesHistoricalWorkspaceV129(){
  const {user}=useAuth();const {activeBranchId,isAllBranchesMode}=useBranchContext();const initial=range('this_month')
  const [period,setPeriod]=useState<RangeKey>('this_month');const [start,setStart]=useState(initial.start);const [end,setEnd]=useState(initial.end);const [data,setData]=useState<History|null>(null);const [error,setError]=useState<string|null>(null)
  const scope=isAllBranchesMode?'all':activeBranchId??'all'
  const canShowHistory=user?.role==='super_admin'||(user?.role==='staff'&&!isAllBranchesMode&&Boolean(activeBranchId))
  useEffect(()=>{if(!canShowHistory||!supabase)return;let active=true;const rpc=user?.role==='super_admin'?'get_management_report_v129':'get_staff_branch_report_v131';void supabase.rpc(rpc,{p_start_date:start,p_end_date:end,p_branch_id:scope}).then(({data:payload,error:rpcError})=>{if(!active)return;if(rpcError){setError(rpcError.message);setData(null)}else{setError(null);setData(payload as History)}});return()=>{active=false}},[canShowHistory,end,scope,start,user?.role])
  function choose(value:RangeKey){setPeriod(value);if(value==='custom')return;const next=range(value);setStart(next.start);setEnd(next.end)}
  return <div className="page-stack"><ExpensesBranchWorkspaceV122/>{canShowHistory&&<section className="panel"><div className="panel-header compact-header"><div><p className="eyebrow">Historical expense analytics</p><h3>Operating cost history</h3><p>{user?.role==='staff'?'Live history for your assigned branch.':'Previous months and years remain queryable from persisted Supabase expense records.'}</p></div><CalendarRange size={20}/></div><div className="filters-row"><label>Period<select value={period} onChange={(e)=>choose(e.target.value as RangeKey)}><option value="this_month">This Month</option><option value="last_month">Last Month</option><option value="last_3_months">Last 3 Months</option><option value="this_quarter">This Quarter</option><option value="this_year">This Year</option><option value="last_year">Last Year</option><option value="custom">Custom</option></select></label><label>From<input type="date" value={start} onChange={(e)=>{setPeriod('custom');setStart(e.target.value)}}/></label><label>To<input type="date" value={end} onChange={(e)=>{setPeriod('custom');setEnd(e.target.value)}}/></label></div>{error&&<div className="inline-alert warning">{error}</div>}{data&&<><div className="stats-grid"><article className="stat-card"><span>Recorded expenses</span><strong>{php(data.financial.operating_expenses_cents)}</strong><small>{start} – {end}</small></article><article className="stat-card"><span>Expense payments</span><strong>{php(data.financial.expense_payments_cents)}</strong><small>Payments inside selected period</small></article></div><PremiumLineChartV35 labels={data.trend.map((row)=>row.date.slice(5))} series={[{key:'expenses',label:'Operating expenses',values:data.trend.map((row)=>row.expenses_cents),formatter:php}]} ariaLabel="Historical operating expense trend"/></>}</section>}</div>
}
