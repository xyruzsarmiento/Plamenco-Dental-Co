import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Banknote,
  BarChart3,
  Building2,
  CalendarRange,
  ChevronDown,
  CircleDollarSign,
  FileSpreadsheet,
  FileText,
  PackageSearch,
  ReceiptText,
  RefreshCw,
  Stethoscope,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { PremiumLineChartV35 } from '../components/ui/PremiumInteractiveChartV35'
import { useAuth } from '../features/auth/AuthContext'
import { useBranchContext } from '../features/branches/BranchContext'
import { buildLiveReportWorkbookV129, reportExportFilename } from '../features/reports/liveReportExportsV129'
import { buildLiveReportPdfV163, reportPdfFilenameV163 } from '../features/reports/liveReportPdfV163'
import {
  getReportTaxProfileLabel,
  loadReportTaxConfiguration,
  TAX_PLANNING_DISCLAIMER,
  type ReportTaxConfiguration,
} from '../features/reports/reportTaxStore'
import { supabase } from '../lib/supabase'
import '../styles/reports-premium-workspace-v162.css'
import '../styles/reports-export-chart-fix-v163.css'

type ReportPreset = 'today' | 'yesterday' | 'this_week' | 'last_7_days' | 'this_month' | 'last_month' | 'last_3_months' | 'this_quarter' | 'this_year' | 'last_year' | 'custom'
type ReportPayload = {
  start_date: string
  end_date: string
  branch_id: string
  financial: { billed_revenue_cents: number; collections_cents: number; receivables_cents: number; operating_expenses_cents: number; expense_payments_cents: number; refunds_cents: number; net_operating_result_cents: number; net_cash_movement_cents: number }
  operations: { appointments: number; completed_visits: number; cancellations: number; no_shows: number; no_show_rate: number; patients_seen: number; new_patients: number }
  inventory: { active_items: number; low_stock: number; out_of_stock: number; expiring_soon: number; valuation_cents: number; consumed_quantity: number }
  provider_performance?: Array<{ provider_id: string; provider_name: string; appointments: number; completed_visits: number; patients_seen: number; treatments: number; no_shows: number; no_show_rate: number; billed_treatments_cents: number }>
  service_demand: Array<{ service_id: string; service_name: string; demand: number; completed: number }>
  top_treatments: Array<{ name: string; performed: number; billed_cents: number }>
  trend: Array<{ date: string; collections_cents: number; expenses_cents: number }>
}
type QrphSummary = { received_cents: number; settled_cents: number; pending_cents: number }

const presetLabels: Record<ReportPreset, string> = {
  today: 'Today', yesterday: 'Yesterday', this_week: 'This Week', last_7_days: 'Last 7 Days', this_month: 'This Month', last_month: 'Last Month', last_3_months: 'Last 3 Months', this_quarter: 'This Quarter', this_year: 'This Year', last_year: 'Last Year', custom: 'Custom',
}

function php(cents = 0) { return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(cents || 0) / 100) }
function iso(date: Date) { return date.toISOString().slice(0, 10) }
function todayManila() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
function addDays(value: string, days: number) { const date = new Date(`${value}T00:00:00+08:00`); date.setDate(date.getDate() + days); return iso(date) }
function monthRange(month: string) { const [year, monthIndex] = month.split('-').map(Number); return { start: `${month}-01`, end: iso(new Date(year, monthIndex, 0)) } }

function presetRange(preset: ReportPreset, base = todayManila()) {
  const date = new Date(`${base}T00:00:00+08:00`)
  const year = date.getFullYear(); const month = date.getMonth(); const day = date.getDay(); const monday = day === 0 ? -6 : 1 - day
  if (preset === 'today') return { start: base, end: base }
  if (preset === 'yesterday') { const value = addDays(base, -1); return { start: value, end: value } }
  if (preset === 'this_week') return { start: addDays(base, monday), end: base }
  if (preset === 'last_7_days') return { start: addDays(base, -6), end: base }
  if (preset === 'this_month') return { start: `${base.slice(0, 7)}-01`, end: base }
  if (preset === 'last_month') return { start: iso(new Date(year, month - 1, 1)), end: iso(new Date(year, month, 0)) }
  if (preset === 'last_3_months') return { start: iso(new Date(year, month - 2, 1)), end: base }
  if (preset === 'this_quarter') return { start: iso(new Date(year, Math.floor(month / 3) * 3, 1)), end: base }
  if (preset === 'this_year') return { start: `${year}-01-01`, end: base }
  if (preset === 'last_year') return { start: `${year - 1}-01-01`, end: `${year - 1}-12-31` }
  return { start: `${base.slice(0, 7)}-01`, end: base }
}

function estimateTax(report: ReportPayload | null, config: ReportTaxConfiguration | null) {
  if (!report || !config) return { amount: null as number | null, basis: 0, rate: null as number | null, status: 'Loading tax configuration' }
  const revenue = report.financial.billed_revenue_cents
  const taxable = Math.max(0, revenue - report.financial.operating_expenses_cents)
  if (!config.enabled) return { amount: 0, basis: revenue, rate: null, status: 'Tax estimate disabled in Tax Settings' }
  if (config.taxProfile === 'non_vat_percentage') return { amount: Math.round(revenue * config.percentageTaxRate / 100), basis: revenue, rate: config.percentageTaxRate, status: 'Estimated from configured gross billed revenue basis' }
  if (config.taxProfile === 'corporate_income_tax' && config.entityType === 'corporation') return { amount: Math.round(taxable * config.corporateIncomeTaxRate / 100), basis: taxable, rate: config.corporateIncomeTaxRate, status: 'Estimated from configured revenue-less-expenses basis' }
  return { amount: null, basis: taxable, rate: config.taxProfile === 'vat_registered' ? config.vatRate : null, status: config.taxProfile === 'vat_registered' ? 'VAT input/output data required' : 'Tax profile requires additional configuration' }
}

function downloadBytes(filename: string, bytes: Uint8Array, type: string) {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  const url = URL.createObjectURL(new Blob([copy], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function KpiCard({ label, value, note, tone = 'neutral' }: { label: string; value: string; note: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  return <article className={`rep162-kpi rep162-kpi-${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>
}

function ProgressRow({ label, value, total, meta }: { label: string; value: number; total: number; meta: string }) {
  const pct = total > 0 ? Math.max(4, Math.min(100, (value / total) * 100)) : 0
  return <div className="rep162-progress-row"><div><strong>{label}</strong><span>{meta}</span></div><div className="rep162-progress-track"><i style={{ width: `${pct}%` }} /></div></div>
}

function SettlementModal({ branches, initialBranchId, pending, onClose, onSaved }: { branches: Array<{ id: string; name: string }>; initialBranchId: string; pending: number; onClose: () => void; onSaved: () => void }) {
  const [branchId, setBranchId] = useState(initialBranchId || branches[0]?.id || '')
  const [amount, setAmount] = useState(''); const [destination, setDestination] = useState(''); const [reference, setReference] = useState(''); const [notes, setNotes] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!supabase || busy) return
    const cents = Math.round(Number(amount) * 100)
    if (!branchId || !Number.isFinite(cents) || cents <= 0) { setError('Choose a branch and enter a valid settlement amount.'); return }
    setBusy(true); setError(null)
    const { error: rpcError } = await supabase.rpc('record_qrph_settlement', { p_branch_id: branchId, p_settlement_date: todayManila(), p_amount_cents: cents, p_destination_reference: destination.trim(), p_settlement_reference: reference.trim(), p_notes: notes.trim() })
    setBusy(false); if (rpcError) { setError(rpcError.message); return } onSaved()
  }
  return <div className="rep162-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="rep162-dialog" role="dialog" aria-modal="true" aria-label="Record QRPH settlement"><header className="rep162-export-head"><div><span className="rep162-eyebrow">QRPH settlement</span><h3>Record bank settlement</h3><p>Records money already settled externally; this is not a wallet withdrawal.</p></div><button className="rep162-icon-button" type="button" onClick={onClose} aria-label="Close settlement dialog"><X size={18} /></button></header><form className="rep162-form" onSubmit={submit}><label>Branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Amount (PHP)<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={`Pending in current view: ${php(pending)}`} required /></label><label>Destination/reference<input value={destination} onChange={(event) => setDestination(event.target.value)} required /></label><label>Settlement number<input value={reference} onChange={(event) => setReference(event.target.value)} required /></label><label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} /></label>{error && <div className="rep162-status is-error">{error}</div>}<div className="rep162-dialog-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Recording...' : 'Record settlement'}</Button></div></form></section></div>
}

export function ReportsPremiumWorkspaceV163() {
  const { user } = useAuth()
  const { activeBranch, activeBranchId, availableBranches, isAllBranchesMode } = useBranchContext()
  const isSuperAdmin = user?.role === 'super_admin'
  const initial = presetRange('this_month')
  const [preset, setPreset] = useState<ReportPreset>('this_month')
  const [startDate, setStartDate] = useState(initial.start)
  const [endDate, setEndDate] = useState(initial.end)
  const [month, setMonth] = useState(todayManila().slice(0, 7))
  const [report, setReport] = useState<ReportPayload | null>(null)
  const [taxConfig, setTaxConfig] = useState<ReportTaxConfiguration | null>(null)
  const [qrph, setQrph] = useState<QrphSummary>({ received_cents: 0, settled_cents: 0, pending_cents: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [settlementOpen, setSettlementOpen] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportRootRef = useRef<HTMLDivElement>(null)
  const branchScope = isSuperAdmin && isAllBranchesMode ? 'all' : activeBranchId ?? ''
  const scopeName = isSuperAdmin && isAllBranchesMode ? 'All Branches' : activeBranch?.name ?? 'Selected branch'

  async function refresh() {
    if (!supabase) { setError('Clinic database is not configured.'); setLoading(false); return }
    if (!isSuperAdmin && !activeBranchId) { setError('Your account needs an active branch assignment before reports can be opened.'); setReport(null); setLoading(false); return }
    setLoading(true); setError(null)
    const reportRequest = isSuperAdmin
      ? supabase.rpc('get_management_report_v129', { p_start_date: startDate, p_end_date: endDate, p_branch_id: branchScope })
      : supabase.rpc('get_staff_branch_report_v131', { p_start_date: startDate, p_end_date: endDate, p_branch_id: branchScope })
    const [reportResult, qrphResult, config] = await Promise.all([
      reportRequest,
      isSuperAdmin ? supabase.rpc('get_qrph_settlement_summary', { p_branch_id: branchScope }) : Promise.resolve({ data: null, error: null }),
      isSuperAdmin ? loadReportTaxConfiguration() : Promise.resolve(null),
    ])
    if (reportResult.error) { setError(reportResult.error.message); setReport(null) } else setReport(reportResult.data as ReportPayload)
    if (isSuperAdmin && !qrphResult.error && qrphResult.data) setQrph(qrphResult.data as QrphSummary)
    setTaxConfig(config)
    setLoading(false)
  }

  useEffect(() => { void refresh() }, [startDate, endDate, branchScope, isSuperAdmin, activeBranchId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!exportMenuOpen) return
    const close = (event: PointerEvent) => { if (!exportRootRef.current?.contains(event.target as Node)) setExportMenuOpen(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setExportMenuOpen(false) }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key) }
  }, [exportMenuOpen])

  function applyPreset(next: ReportPreset) { setPreset(next); if (next === 'custom') return; const range = presetRange(next); setStartDate(range.start); setEndDate(range.end) }
  function applyMonth(value: string) { setMonth(value); if (!value) return; const range = monthRange(value); setPreset('custom'); setStartDate(range.start); setEndDate(range.end) }
  function downloadExcel() {
    if (!report) return
    const input = { report, scopeName, generatedBy: user?.name }
    downloadBytes(reportExportFilename(input, 'xlsx'), buildLiveReportWorkbookV129(input), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setExportMenuOpen(false)
  }
  function downloadPdf() {
    if (!report) return
    const input = { report, scopeName, generatedBy: user?.name }
    downloadBytes(reportPdfFilenameV163(input), buildLiveReportPdfV163(input), 'application/pdf')
    setExportMenuOpen(false)
  }

  const tax = estimateTax(report, taxConfig)
  const noShowPct = ((report?.operations.no_show_rate ?? 0) * 100).toFixed(1)
  const chartRows = useMemo(() => report?.trend ?? [], [report])
  const providerRows = report?.provider_performance ?? []

  if (!isSuperAdmin && !activeBranchId) return <section className="rep162 rep163"><div className="rep162-status is-error">Your account needs an active branch assignment before reports can be opened.</div></section>

  return <section className="rep162 rep163">
    <header className="rep162-toolbar">
      <div className="rep162-title-block"><span className="rep162-eyebrow">{isSuperAdmin ? 'Executive clinic analytics' : 'Branch analytics'}</span><h2>Reports & Analytics</h2><p>Live financial and operational reporting from persisted Supabase records for {scopeName}.</p></div>
      <div className="rep162-toolbar-actions">
        <span className="rep162-scope"><Building2 size={14} /> {scopeName}</span>
        <div className="rep162-export rep163-export" ref={exportRootRef}>
          <Button variant="secondary" icon={<FileText size={15} />} onClick={() => setExportMenuOpen((current) => !current)} disabled={!report || loading}>Export <ChevronDown size={14} /></Button>
          {exportMenuOpen && <div className="rep162-export-menu" role="menu" aria-label="Download report">
            <button type="button" role="menuitem" onClick={downloadPdf}><FileText size={18} /><span><strong>Download PDF</strong><small>Directly save the management report</small></span></button>
            <button type="button" role="menuitem" onClick={downloadExcel}><FileSpreadsheet size={18} /><span><strong>Download Excel</strong><small>Directly save the workbook</small></span></button>
          </div>}
        </div>
      </div>
    </header>

    <section className="rep162-filterbar">
      <label><span>Period</span><select value={preset} onChange={(event) => applyPreset(event.target.value as ReportPreset)}>{Object.entries(presetLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span>Month archive</span><input type="month" value={month} onChange={(event) => applyMonth(event.target.value)} /></label>
      <div className="rep163-date-range">
        <label><span>From</span><input type="date" value={startDate} onChange={(event) => { setPreset('custom'); setStartDate(event.target.value) }} /></label>
        <label><span>To</span><input type="date" value={endDate} onChange={(event) => { setPreset('custom'); setEndDate(event.target.value) }} /></label>
      </div>
      <button className="rep162-refresh" type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh report"><RefreshCw size={16} className={loading ? 'is-spinning' : ''} /></button>
    </section>

    {loading && <div className="rep162-status">Loading persisted clinic transactions...</div>}
    {error && <div className="rep162-status is-error">{error}<Button size="sm" variant="secondary" onClick={() => void refresh()}>Retry</Button></div>}

    {report && <>
      <section className="rep162-executive">
        <div className="rep162-executive-head"><div><span className="rep162-eyebrow">Executive summary</span><h3>Clinic performance at a glance</h3></div><span className="rep162-period-chip">{presetLabels[preset]}</span></div>
        <div className="rep162-primary-kpis">
          <KpiCard label="Billed revenue" value={php(report.financial.billed_revenue_cents)} note="Non-void invoices in selected period" />
          <KpiCard label="Collections" value={php(report.financial.collections_cents)} note={`${report.financial.billed_revenue_cents ? ((report.financial.collections_cents / report.financial.billed_revenue_cents) * 100).toFixed(1) : '0.0'}% of billed revenue collected`} tone="good" />
          <KpiCard label="Receivables" value={php(report.financial.receivables_cents)} note="Outstanding invoice balances" tone="warn" />
          <KpiCard label="Operating expenses" value={php(report.financial.operating_expenses_cents)} note={isSuperAdmin && isAllBranchesMode ? 'Branch + clinic-wide once' : 'Selected branch only'} />
          <KpiCard label="Net operating result" value={php(report.financial.net_operating_result_cents)} note="Billed revenue less recorded operating expenses" tone={report.financial.net_operating_result_cents >= 0 ? 'good' : 'bad'} />
        </div>
        <div className="rep162-secondary-kpis">
          <div><Activity size={17} /><span>Appointments<strong>{report.operations.appointments}</strong></span></div>
          <div><Stethoscope size={17} /><span>Completed visits<strong>{report.operations.completed_visits}</strong></span></div>
          <div><UsersRound size={17} /><span>Patients seen<strong>{report.operations.patients_seen}</strong></span></div>
          <div><UsersRound size={17} /><span>New patients<strong>{report.operations.new_patients}</strong></span></div>
          <div><BarChart3 size={17} /><span>No-show rate<strong>{noShowPct}%</strong></span></div>
        </div>
      </section>

      <section className="rep162-card rep162-trend-card rep163-trend-card">
        <div className="rep162-card-head"><div><span className="rep162-eyebrow">Financial performance</span><h3>Collections vs operating expenses</h3><p>Daily history for the selected range. Hover or focus points for exact values.</p></div><BarChart3 size={20} /></div>
        <PremiumLineChartV35 labels={chartRows.map((row) => row.date.slice(5))} series={[{ key: 'collections', label: 'Collections', values: chartRows.map((row) => row.collections_cents), formatter: php }, { key: 'expenses', label: 'Expenses', values: chartRows.map((row) => row.expenses_cents), formatter: php }]} ariaLabel={`${scopeName} collections and expenses`} variant="blueFinance" />
        <div className="rep163-chart-legend"><span><i className="is-collections" /> Collections</span><span><i className="is-expenses" /> Operating expenses</span></div>
      </section>

      <div className="rep162-grid">
        <section className="rep162-card"><div className="rep162-card-head"><div><span className="rep162-eyebrow">Appointment performance</span><h3>Visit outcomes</h3><p>Operational appointment activity within the selected period.</p></div><CalendarRange size={20} /></div><div className="rep162-progress-list"><ProgressRow label="Completed" value={report.operations.completed_visits} total={Math.max(1, report.operations.appointments)} meta={`${report.operations.completed_visits} visits`} /><ProgressRow label="Cancelled" value={report.operations.cancellations} total={Math.max(1, report.operations.appointments)} meta={`${report.operations.cancellations} cancelled`} /><ProgressRow label="No-show" value={report.operations.no_shows} total={Math.max(1, report.operations.appointments)} meta={`${report.operations.no_shows} no-shows`} /></div></section>
        <section className="rep162-card"><div className="rep162-card-head"><div><span className="rep162-eyebrow">Patient activity</span><h3>Patients in this period</h3><p>Unique patients seen and newly recorded patients.</p></div><UsersRound size={20} /></div><div className="rep162-patient-summary"><div><span>Patients seen</span><strong>{report.operations.patients_seen}</strong></div><div><span>New patients</span><strong>{report.operations.new_patients}</strong></div><div><span>Completed visits</span><strong>{report.operations.completed_visits}</strong></div></div></section>
      </div>

      <div className="rep162-grid">
        <section className="rep162-card"><div className="rep162-card-head"><div><span className="rep162-eyebrow">Service demand</span><h3>Requested services</h3><p>Demand and completed appointment activity.</p></div><ReceiptText size={20} /></div><div className="rep162-ranks">{report.service_demand.slice(0, 8).map((row) => <div className="rep162-rank" key={row.service_id}><div><strong>{row.service_name}</strong><small>{row.completed} completed</small></div><em>{row.demand} requests</em></div>)}{!report.service_demand.length && <div className="rep162-empty">No service demand in this period.</div>}</div></section>
        <section className="rep162-card"><div className="rep162-card-head"><div><span className="rep162-eyebrow">Treatment activity</span><h3>Completed treatment value</h3><p>Performed treatments only; planned care is excluded.</p></div><WalletCards size={20} /></div><div className="rep162-ranks">{report.top_treatments.slice(0, 8).map((row) => <div className="rep162-rank" key={row.name}><div><strong>{row.name}</strong><small>{row.performed} performed</small></div><em>{php(row.billed_cents)}</em></div>)}{!report.top_treatments.length && <div className="rep162-empty">No completed treatments in this period.</div>}</div></section>
      </div>

      <div className="rep162-grid">
        <section className="rep162-card"><div className="rep162-card-head"><div><span className="rep162-eyebrow">Inventory position</span><h3>Stock health</h3><p>Current branch inventory position from persisted stock records.</p></div><PackageSearch size={20} /></div><div className="rep162-metric-grid"><div><span>Active items</span><strong>{report.inventory.active_items}</strong></div><div><span>Low stock</span><strong>{report.inventory.low_stock}</strong></div><div><span>Out of stock</span><strong>{report.inventory.out_of_stock}</strong></div><div><span>Expiring soon</span><strong>{report.inventory.expiring_soon}</strong></div><div><span>Valuation</span><strong>{php(report.inventory.valuation_cents)}</strong></div><div><span>Consumed</span><strong>{Number(report.inventory.consumed_quantity || 0).toLocaleString('en-PH')}</strong></div></div></section>
        {isSuperAdmin ? <section className="rep162-card"><div className="rep162-card-head"><div><span className="rep162-eyebrow">Dentist operations</span><h3>Provider activity</h3><p>Operational activity only; this is not a clinical-quality score.</p></div><Stethoscope size={20} /></div><div className="rep162-ranks">{providerRows.slice(0, 8).map((row) => <div className="rep162-rank" key={row.provider_id}><div><strong>{row.provider_name}</strong><small>{row.completed_visits} completed · {row.patients_seen} patients · {row.no_shows} no-shows</small></div><em>{php(row.billed_treatments_cents)}</em></div>)}{!providerRows.length && <div className="rep162-empty">No provider activity in this period.</div>}</div></section> : null}
      </div>

      {isSuperAdmin && <div className="rep162-grid">
        {taxConfig?.enabled && <section className="rep162-card rep162-tax-card"><div className="rep162-card-head"><div><span className="rep162-eyebrow">Tax planning</span><h3>Configured estimate</h3><p>{tax.status}</p></div><CircleDollarSign size={20} /></div><div className="rep162-tax-layout"><div className="rep162-tax-value"><span>Estimated tax</span><strong>{tax.amount === null ? 'Configuration required' : php(tax.amount)}</strong></div><div className="rep162-tax-facts"><div><span>Basis</span><strong>{php(tax.basis)}</strong></div><div><span>Profile</span><strong>{getReportTaxProfileLabel(taxConfig.taxProfile)}</strong></div><div><span>Rate</span><strong>{tax.rate === null ? '-' : `${tax.rate}%`}</strong></div></div></div><p className="rep162-disclaimer">{TAX_PLANNING_DISCLAIMER}</p><Link className="text-button" to="/app/settings">Manage Tax Settings</Link></section>}
        <section className="rep162-card"><div className="rep162-card-head"><div><span className="rep162-eyebrow">QRPH settlement</span><h3>Recorded QRPH collections</h3><p>Only completed QRPH payments are included; this is settlement tracking, not withdrawal.</p></div><Banknote size={20} /></div><div className="rep162-qrph"><div><span>Received</span><strong>{php(qrph.received_cents)}</strong></div><div><span>Settled</span><strong>{php(qrph.settled_cents)}</strong></div><div><span>Pending</span><strong>{php(qrph.pending_cents)}</strong></div></div><Button onClick={() => setSettlementOpen(true)} disabled={!qrph.pending_cents}>Record Settlement</Button></section>
      </div>}
    </>}

    {isSuperAdmin && settlementOpen && <SettlementModal branches={availableBranches} initialBranchId={isAllBranchesMode ? '' : activeBranchId ?? ''} pending={qrph.pending_cents} onClose={() => setSettlementOpen(false)} onSaved={() => { setSettlementOpen(false); void refresh() }} />}
  </section>
}
