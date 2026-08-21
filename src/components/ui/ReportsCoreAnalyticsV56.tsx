import { useMemo, useState } from 'react'
import type { EnterpriseReportSnapshot } from '../../features/reports/reportStore'
import { formatReportCurrency } from '../../features/reports/reportStore'

type Tip = { x: number; y: number; title: string; lines: string[] } | null

function clamp(value: number, min: number, max: number) { return Math.min(Math.max(value, min), max) }
function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null
  return <div className="rv56-tooltip" style={{ left: clamp(tip.x + 14, 12, window.innerWidth - 282), top: Math.max(12, tip.y - 96) }}><strong>{tip.title}</strong>{tip.lines.map((line) => <span key={line}>{line}</span>)}</div>
}

export function ExecutiveTrendV56({ snapshot }: { snapshot: EnterpriseReportSnapshot }) {
  const [tip, setTip] = useState<Tip>(null)
  const rows = snapshot.trend
  const width = 980, height = 340, left = 58, right = 24, top = 26, bottom = 50
  const max = Math.max(1, ...rows.flatMap((row) => [row.billedRevenueCents, row.collectionsCents, row.expensesCents]))
  const x = (index: number) => rows.length <= 1 ? left + (width-left-right)/2 : left + index * (width-left-right) / Math.max(1, rows.length-1)
  const y = (value: number) => top + (height-top-bottom) - value / max * (height-top-bottom)
  const path = (key: 'billedRevenueCents'|'collectionsCents'|'expensesCents') => rows.map((row,index)=>`${index?'L':'M'} ${x(index)} ${y(row[key])}`).join(' ')
  const show = (index: number, cx: number, cy: number) => { const row=rows[index]; if(!row)return; setTip({x:cx,y:cy,title:row.label,lines:[`Billed: ${formatReportCurrency(row.billedRevenueCents)}`,`Collections: ${formatReportCurrency(row.collectionsCents)}`,`Expenses: ${formatReportCurrency(row.expensesCents)}`]}) }
  return <div className="rv56-chart-shell" onMouseLeave={()=>setTip(null)}><div className="rv56-chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} className="rv56-line-chart" role="img" aria-label="Executive billed amount, collections and expenses trend">{[0,.25,.5,.75,1].map(r=>{const gy=top+(height-top-bottom)*r; const val=Math.round(max*(1-r)); return <g key={r}><line x1={left} x2={width-right} y1={gy} y2={gy}/><text x={left-10} y={gy+4} textAnchor="end">{formatReportCurrency(val).replace('.00','')}</text></g>})}{(['billedRevenueCents','collectionsCents','expensesCents'] as const).map((key,series)=><g key={key} className={`rv56-series s${series}`}><path d={path(key)}/>{rows.map((row,index)=><circle key={`${key}-${row.date}`} cx={x(index)} cy={y(row[key])} r="5" tabIndex={0} onMouseEnter={e=>show(index,e.clientX,e.clientY)} onMouseMove={e=>show(index,e.clientX,e.clientY)} onFocus={e=>{const r=e.currentTarget.getBoundingClientRect();show(index,r.left+r.width/2,r.top)}} onBlur={()=>setTip(null)}/>)}</g>)}{rows.map((row,index)=>{const step=Math.max(1,Math.ceil(rows.length/8)); if(index!==rows.length-1&&index%step!==0)return null; return <text key={row.date} x={x(index)} y={height-14} textAnchor="middle" className="rv56-axis-label">{row.label}</text>})}</svg></div><Tooltip tip={tip}/></div>
}

export function AppointmentFlowV56({ snapshot }: { snapshot: EnterpriseReportSnapshot }) {
  const [tip,setTip]=useState<Tip>(null)
  const total=Math.max(1,snapshot.appointments.total)
  const rows=[...snapshot.appointments.byStatus].sort((a,b)=>b.count-a.count)
  return <div className="rv56-flow" onMouseLeave={()=>setTip(null)}>{rows.length?rows.map((row,index)=>{const share=Math.round(row.count/total*100);return <button key={row.status} type="button" onMouseEnter={e=>setTip({x:e.clientX,y:e.clientY,title:row.status.replaceAll('_',' '),lines:[`Appointments: ${row.count}`,`Share: ${share}%`]})} onMouseMove={e=>setTip({x:e.clientX,y:e.clientY,title:row.status.replaceAll('_',' '),lines:[`Appointments: ${row.count}`,`Share: ${share}%`]})} onFocus={e=>{const r=e.currentTarget.getBoundingClientRect();setTip({x:r.left+r.width/2,y:r.top,title:row.status.replaceAll('_',' '),lines:[`Appointments: ${row.count}`,`Share: ${share}%`]})}} onBlur={()=>setTip(null)}><span className="rv56-flow-rank">{String(index+1).padStart(2,'0')}</span><span className="rv56-flow-main"><span><strong>{row.status.replaceAll('_',' ')}</strong><b>{row.count}</b></span><i><em style={{width:`${share}%`}}/></i><small>{share}% of appointments</small></span></button>}):<div className="rv56-empty">No appointment activity in this filter context.</div>}<Tooltip tip={tip}/></div>
}

export function BranchCashV56({ snapshot }: { snapshot: EnterpriseReportSnapshot }) {
  const [tip,setTip]=useState<Tip>(null)
  const max=Math.max(1,...snapshot.branches.flatMap(b=>[b.collectionsCents,b.expensesCents]))
  return <div className="rv56-branch-chart" onMouseLeave={()=>setTip(null)}>{snapshot.branches.length?snapshot.branches.map(branch=><button key={branch.branchId} type="button" onMouseEnter={e=>setTip({x:e.clientX,y:e.clientY,title:branch.branchName,lines:[`Collections: ${formatReportCurrency(branch.collectionsCents)}`,`Expenses: ${formatReportCurrency(branch.expensesCents)}`,`Net cash movement: ${formatReportCurrency(branch.netOperatingResultCents)}`]})} onMouseMove={e=>setTip({x:e.clientX,y:e.clientY,title:branch.branchName,lines:[`Collections: ${formatReportCurrency(branch.collectionsCents)}`,`Expenses: ${formatReportCurrency(branch.expensesCents)}`,`Net cash movement: ${formatReportCurrency(branch.netOperatingResultCents)}`]})} onFocus={e=>{const r=e.currentTarget.getBoundingClientRect();setTip({x:r.left+r.width/2,y:r.top,title:branch.branchName,lines:[`Collections: ${formatReportCurrency(branch.collectionsCents)}`,`Expenses: ${formatReportCurrency(branch.expensesCents)}`]})}} onBlur={()=>setTip(null)}><span className="rv56-branch-copy"><strong>{branch.branchName}</strong><small>{branch.appointments} appointments · {branch.completedVisits} completed</small></span><span className="rv56-paired-bars"><i><em style={{width:`${branch.collectionsCents/max*100}%`}}/></i><i className="expense"><em style={{width:`${branch.expensesCents/max*100}%`}}/></i></span><span className="rv56-branch-value"><b>{formatReportCurrency(branch.collectionsCents)}</b><small>{formatReportCurrency(branch.expensesCents)} expenses</small></span></button>):<div className="rv56-empty">No branch financial activity in this filter context.</div>}<Tooltip tip={tip}/></div>
}

export function PatientGrowthV56({ snapshot }: { snapshot: EnterpriseReportSnapshot }) {
  const [tip,setTip]=useState<Tip>(null)
  const rows=snapshot.patients.growthTrend
  const width=900,height=280,left=46,right=20,top=20,bottom=44
  const max=Math.max(1,...rows.flatMap(r=>[r.newPatients,r.returningPatients]))
  const x=(i:number)=>rows.length<=1?left+(width-left-right)/2:left+i*(width-left-right)/Math.max(1,rows.length-1)
  const y=(v:number)=>top+(height-top-bottom)-v/max*(height-top-bottom)
  const path=(key:'newPatients'|'returningPatients')=>rows.map((r,i)=>`${i?'L':'M'} ${x(i)} ${y(r[key])}`).join(' ')
  const show=(i:number,cx:number,cy:number)=>{const r=rows[i];if(r)setTip({x:cx,y:cy,title:r.label,lines:[`New patients: ${r.newPatients}`,`Returning patients: ${r.returningPatients}`]})}
  return <div className="rv56-chart-shell" onMouseLeave={()=>setTip(null)}><div className="rv56-chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} className="rv56-growth-chart" role="img" aria-label="Patient growth"><g className="grid">{[0,.25,.5,.75,1].map(v=><line key={v} x1={left} x2={width-right} y1={top+(height-top-bottom)*v} y2={top+(height-top-bottom)*v}/>)}</g>{(['newPatients','returningPatients'] as const).map((key,s)=><g key={key} className={`series s${s}`}><path d={path(key)}/>{rows.map((r,i)=><circle key={`${key}-${r.date}`} cx={x(i)} cy={y(r[key])} r="5" tabIndex={0} onMouseEnter={e=>show(i,e.clientX,e.clientY)} onMouseMove={e=>show(i,e.clientX,e.clientY)} onFocus={e=>{const z=e.currentTarget.getBoundingClientRect();show(i,z.left+z.width/2,z.top)}} onBlur={()=>setTip(null)}/>)}</g>)}{rows.map((r,i)=>{const step=Math.max(1,Math.ceil(rows.length/7));if(i!==rows.length-1&&i%step!==0)return null;return <text key={r.date} x={x(i)} y={height-12} textAnchor="middle">{r.label}</text>})}</svg></div><Tooltip tip={tip}/></div>
}
