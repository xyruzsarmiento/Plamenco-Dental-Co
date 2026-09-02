import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Banknote, Building2, CalendarRange, CircleDollarSign, FileSpreadsheet, FileText, PackageSearch, ReceiptText, Stethoscope, UsersRound, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { PremiumLineChartV35 } from '../components/ui/PremiumInteractiveChartV35'
import { useAuth } from '../features/auth/AuthContext'
import { useBranchContext } from '../features/branches/BranchContext'
import { buildLiveReportPdfHtmlV129, buildLiveReportWorkbookV129, reportExportFilename } from '../features/reports/liveReportExportsV129'
import { getReportTaxProfileLabel, loadReportTaxConfiguration, TAX_PLANNING_DISCLAIMER, type ReportTaxConfiguration } from '../features/reports/reportTaxStore'
import { supabase } from '../lib/supabase'
import '../styles/reports-live-v129.css'

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

function php(cents = 0) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(cents || 0) / 100)
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10)
}

function todayManila() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00+08:00`)
  date.setDate(date.getDate() + days)
  return iso(date)
}

function presetRange(preset: ReportPreset, base = todayManila()) {
  const date = new Date(`${base}T00:00:00+08:00`)
  const year = date.getFullYear()
  const month = date.getMonth()
  const day = date.getDay()
  const monday = day === 0 ? -6 : 1 - day
  if (preset === 'today') return { start: base, end: base }
  if (preset === 'yesterday') {
    const value = addDays(base, -1)
    return { start: value, end: value }
  }
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

function monthRange(month: string) {
  const [year, monthIndex] = month.split('-').map(Number)
  return { start: `${month}-01`, end: iso(new Date(year, monthIndex, 0)) }
}

function estimateTax(report: ReportPayload | null, config: ReportTaxConfiguration | null) {
  if (!report || !config) return { amount: null as number | null, basis: 0, rate: null as number | null, status: 'Loading tax configuration' }
  const revenue = report.financial.billed_revenue_cents
  const taxable = Math.max(0, revenue - report.financial.operating_expenses_cents)
  if (!config.enabled) return { amount: 0, basis: revenue, rate: null, status: 'Tax estimate disabled in Tax Settings' }
  if (config.taxProfile === 'non_vat_percentage') return { amount: Math.round(revenue * config.percentageTaxRate / 100), basis: revenue, rate: config.percentageTaxRate, status: 'Estimated from gross billed revenue' }
  if (config.taxProfile === 'corporate_income_tax' && config.entityType === 'corporation') return { amount: Math.round(taxable * config.corporateIncomeTaxRate / 100), basis: taxable, rate: config.corporateIncomeTaxRate, status: 'Estimated from revenue less recorded expenses' }
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
  URL.revokeObjectURL(url)
}

function SettlementModal({ branches, initialBranchId, pending, onClose, onSaved }: { branches: Array<{ id: string; name: string }>; initialBranchId: string; pending: number; onClose: () => void; onSaved: () => void }) {
  const [branchId, setBranchId] = useState(initialBranchId || branches[0]?.id || '')
  const [amount, setAmount] = useState('')
  const [destination, setDestination] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || busy) return
    const cents = Math.round(Number(amount) * 100)
    if (!branchId || !Number.isFinite(cents) || cents <= 0) {
      setError('Choose a branch and enter a valid settlement amount.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('record_qrph_settlement', { p_branch_id: branchId, p_settlement_date: todayManila(), p_amount_cents: cents, p_destination_reference: destination.trim(), p_settlement_reference: reference.trim(), p_notes: notes.trim() })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    onSaved()
  }

  return (
    <div className="rep129-modal-backdrop">
      <section className="rep129-modal" role="dialog" aria-modal="true">
        <div className="rep129-card-head">
          <div>
            <span className="rep129-eyebrow">QRPH settlement</span>
            <h3>Record bank settlement</h3>
            <p>This records money already settled outside the app. It is not a wallet withdrawal.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close settlement dialog"><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <label>Branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <label>Amount (PHP)<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={`Available in current view: ${php(pending)}`} required /></label>
          <label>Destination bank/account reference<input value={destination} onChange={(event) => setDestination(event.target.value)} required /></label>
          <label>Settlement/reference number<input value={reference} onChange={(event) => setReference(event.target.value)} required /></label>
          <label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} /></label>
          {error && <div className="rep129-status is-error">{error}</div>}
          <div className="rep129-modal-actions">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Recording...' : 'Record settlement'}</Button>
          </div>
        </form>
      </section>
    </div>
  )
}

export function ReportsDatabaseWorkspaceV129() {
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
  const branchScope = isSuperAdmin && isAllBranchesMode ? 'all' : activeBranchId ?? ''
  const scopeName = isSuperAdmin && isAllBranchesMode ? 'All Branches' : activeBranch?.name ?? 'Selected branch'

  async function refresh() {
    if (!supabase) {
      setError('Clinic database is not configured.')
      setLoading(false)
      return
    }
    if (!isSuperAdmin && !activeBranchId) {
      setError('Your account needs an active branch assignment before reports can be opened.')
      setReport(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    const reportRequest = isSuperAdmin
      ? supabase.rpc('get_management_report_v129', { p_start_date: startDate, p_end_date: endDate, p_branch_id: branchScope })
      : supabase.rpc('get_staff_branch_report_v131', { p_start_date: startDate, p_end_date: endDate, p_branch_id: branchScope })
    const [reportResult, qrphResult, config] = await Promise.all([
      reportRequest,
      isSuperAdmin ? supabase.rpc('get_qrph_settlement_summary', { p_branch_id: branchScope }) : Promise.resolve({ data: null, error: null }),
      isSuperAdmin ? loadReportTaxConfiguration() : Promise.resolve(null),
    ])

    if (reportResult.error) {
      setError(reportResult.error.message)
      setReport(null)
    } else {
      setReport(reportResult.data as ReportPayload)
    }
    if (isSuperAdmin && !qrphResult.error && qrphResult.data) setQrph(qrphResult.data as QrphSummary)
    setTaxConfig(config)
    setLoading(false)
  }

  useEffect(() => { void refresh() }, [startDate, endDate, branchScope, isSuperAdmin, activeBranchId]) // eslint-disable-line react-hooks/exhaustive-deps

  function applyPreset(next: ReportPreset) {
    setPreset(next)
    if (next === 'custom') return
    const range = presetRange(next)
    setStartDate(range.start)
    setEndDate(range.end)
  }

  function applyMonth(value: string) {
    setMonth(value)
    if (!value) return
    const range = monthRange(value)
    setPreset('custom')
    setStartDate(range.start)
    setEndDate(range.end)
  }

  function exportExcel() {
    if (!report) return
    const input = { report, scopeName, generatedBy: user?.name }
    downloadBytes(reportExportFilename(input, 'xlsx'), buildLiveReportWorkbookV129(input), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  }

  function exportPdf() {
    if (!report) return
    const input = { report, scopeName, generatedBy: user?.name }
    const opened = window.open('', '_blank', 'noopener,noreferrer,width=1120,height=820')
    const html = buildLiveReportPdfHtmlV129(input)
    if (!opened) {
      downloadBytes(reportExportFilename(input, 'html'), new TextEncoder().encode(html), 'text/html;charset=utf-8')
      return
    }
    opened.document.open()
    opened.document.write(html)
    opened.document.close()
  }

  const tax = estimateTax(report, taxConfig)
  const noShowPct = ((report?.operations.no_show_rate ?? 0) * 100).toFixed(1)
  const chartRows = useMemo(() => report?.trend ?? [], [report])
  const providerRows = report?.provider_performance ?? []
  const heroCopy = isSuperAdmin
    ? 'Historical metrics are generated from persisted Supabase transactions. Changing the month does not erase earlier reports.'
    : `Branch-scoped analytics for ${activeBranch?.name ?? 'your assigned branch'} using the same live report shell with limited Staff access.`

  if (!isSuperAdmin && !activeBranchId) {
    return <section className="rep129"><div className="rep129-status is-error">Your account needs an active branch assignment before reports can be opened.</div></section>
  }

  return (
    <section className="rep129">
      <header className="rep129-hero">
        <div className="rep129-head">
          <div>
            <span className="rep129-eyebrow">{isSuperAdmin ? 'Authoritative management reporting' : 'Authoritative branch reporting'}</span>
            <h2>Reports & Analytics</h2>
            <p>{heroCopy}</p>
          </div>
          <div className="rep129-hero-actions">
            <span className="rep129-scope"><Building2 size={13} /> {scopeName}</span>
            <Button variant="secondary" size="sm" icon={<FileSpreadsheet size={15} />} onClick={exportExcel} disabled={!report || loading}>Excel</Button>
            <Button variant="secondary" size="sm" icon={<FileText size={15} />} onClick={exportPdf} disabled={!report || loading}>PDF</Button>
          </div>
        </div>
        <div className="rep129-filters">
          <label>Period<select value={preset} onChange={(event) => applyPreset(event.target.value as ReportPreset)}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="this_week">This Week</option><option value="last_7_days">Last 7 Days</option><option value="this_month">This Month</option><option value="last_month">Last Month</option><option value="last_3_months">Last 3 Months</option><option value="this_quarter">This Quarter</option><option value="this_year">This Year</option><option value="last_year">Last Year</option><option value="custom">Custom</option></select></label>
          <label>Month archive<input type="month" value={month} onChange={(event) => applyMonth(event.target.value)} /></label>
          <label>From<input type="date" value={startDate} onChange={(event) => { setPreset('custom'); setStartDate(event.target.value) }} /></label>
          <label>To<input type="date" value={endDate} onChange={(event) => { setPreset('custom'); setEndDate(event.target.value) }} /></label>
        </div>
      </header>

      {loading && <div className="rep129-status">Loading persisted clinic transactions...</div>}
      {error && <div className="rep129-status is-error">{error}</div>}

      {report && (
        <>
          <section className="rep129-kpis">
            <article className="rep129-kpi"><span>Billed revenue</span><strong>{php(report.financial.billed_revenue_cents)}</strong><small>Non-void invoices</small></article>
            <article className="rep129-kpi"><span>Collections</span><strong>{php(report.financial.collections_cents)}</strong><small>Completed payments only</small></article>
            <article className="rep129-kpi"><span>Receivables</span><strong>{php(report.financial.receivables_cents)}</strong><small>Outstanding invoice balances</small></article>
            <article className="rep129-kpi"><span>Operating expenses</span><strong>{php(report.financial.operating_expenses_cents)}</strong><small>{isSuperAdmin && isAllBranchesMode ? 'Branch + clinic-wide once' : 'Selected branch only'}</small></article>
            <article className="rep129-kpi"><span>Appointments</span><strong>{report.operations.appointments}</strong><small>{report.operations.completed_visits} completed</small></article>
            <article className="rep129-kpi"><span>No-show rate</span><strong>{noShowPct}%</strong><small>{report.operations.no_shows} no-show{report.operations.no_shows === 1 ? '' : 's'}</small></article>
            <article className="rep129-kpi"><span>Patients seen</span><strong>{report.operations.patients_seen}</strong><small>{report.operations.new_patients} new in range</small></article>
            <article className="rep129-kpi"><span>Net operating result</span><strong>{php(report.financial.net_operating_result_cents)}</strong><small>Billed revenue less recorded operating expenses</small></article>
          </section>

          <section className="rep129-card rep129-financial-history-card">
            <div className="rep129-card-head">
              <div><span className="rep129-eyebrow">Financial history</span><h3>Collections and expenses</h3><p>{startDate} through {endDate}. Source records remain queryable after the period ends.</p></div>
              <CalendarRange size={20} />
            </div>
            <PremiumLineChartV35 labels={chartRows.map((row) => row.date.slice(5))} series={[{ key: 'collections', label: 'Collections', values: chartRows.map((row) => row.collections_cents), formatter: php }, { key: 'expenses', label: 'Expenses', values: chartRows.map((row) => row.expenses_cents), formatter: php }]} ariaLabel={`${scopeName} historical collections and expenses`} variant="blueFinance" />
          </section>

          <div className="rep129-grid">
            {isSuperAdmin && (
              <section className="rep129-card">
                <div className="rep129-card-head">
                  <div><span className="rep129-eyebrow">Dentist performance</span><h3>Provider operations</h3><p>Operational activity, not a clinical-quality score.</p></div>
                  <Stethoscope size={20} />
                </div>
                <div className="rep129-ranks">
                  {providerRows.map((row) => <div className="rep129-rank" key={row.provider_id}><div><strong>{row.provider_name}</strong><small>{row.completed_visits} completed - {row.patients_seen} patients - {row.treatments} treatments - {(row.no_show_rate * 100).toFixed(1)}% no-show</small></div><em>{php(row.billed_treatments_cents)}</em></div>)}
                  {!providerRows.length && <div className="rep129-empty">No provider activity in this period.</div>}
                </div>
              </section>
            )}
            <section className="rep129-card">
              <div className="rep129-card-head">
                <div><span className="rep129-eyebrow">Service demand</span><h3>Requested services</h3><p>Appointment demand and completed visits.</p></div>
                <UsersRound size={20} />
              </div>
              <div className="rep129-ranks">
                {report.service_demand.slice(0, 8).map((row) => <div className="rep129-rank" key={row.service_id}><div><strong>{row.service_name}</strong><small>{row.completed} completed</small></div><em>{row.demand} requests</em></div>)}
                {!report.service_demand.length && <div className="rep129-empty">No service demand in this period.</div>}
              </div>
            </section>
          </div>

          <div className="rep129-grid">
            <section className="rep129-card">
              <div className="rep129-card-head">
                <div><span className="rep129-eyebrow">Top treatments</span><h3>Completed treatment activity</h3><p>Planned treatments are not mixed into performed counts.</p></div>
                <ReceiptText size={20} />
              </div>
              <div className="rep129-ranks">
                {report.top_treatments.slice(0, 8).map((row) => <div className="rep129-rank" key={row.name}><div><strong>{row.name}</strong><small>{php(row.billed_cents)} recorded value</small></div><em>{row.performed} performed</em></div>)}
                {!report.top_treatments.length && <div className="rep129-empty">No completed treatments in this period.</div>}
              </div>
            </section>
            <section className="rep129-card">
              <div className="rep129-card-head">
                <div><span className="rep129-eyebrow">Inventory position</span><h3>Branch stock health</h3><p>Current stock position uses branch_inventory, not the clinic-wide item catalog.</p></div>
                <PackageSearch size={20} />
              </div>
              <div className="rep129-tax">
                <div><span>Active items</span><strong>{report.inventory.active_items}</strong></div>
                <div><span>Low stock</span><strong>{report.inventory.low_stock}</strong></div>
                <div><span>Out of stock</span><strong>{report.inventory.out_of_stock}</strong></div>
                <div><span>Expiring soon</span><strong>{report.inventory.expiring_soon}</strong></div>
                <div><span>Inventory valuation</span><strong>{php(report.inventory.valuation_cents)}</strong></div>
                <div><span>Consumed quantity</span><strong>{Number(report.inventory.consumed_quantity || 0).toLocaleString('en-PH')}</strong></div>
              </div>
            </section>
          </div>

          {isSuperAdmin && (
            <div className="rep129-grid">
              <section className="rep129-card">
                <div className="rep129-card-head">
                  <div><span className="rep129-eyebrow">Estimated tax</span><h3>{tax.amount === null ? 'Configuration required' : php(tax.amount)}</h3><p>{tax.status}</p></div>
                  <CircleDollarSign size={20} />
                </div>
                <div className="rep129-tax">
                  <div><span>Taxable basis</span><strong>{php(tax.basis)}</strong></div>
                  <div><span>Configured profile</span><strong>{taxConfig ? getReportTaxProfileLabel(taxConfig.taxProfile) : 'Loading'}</strong></div>
                  <div><span>Configured estimate</span><strong>{tax.rate === null ? '-' : `${tax.rate}%`}</strong></div>
                </div>
                <p className="rep129-disclaimer">{TAX_PLANNING_DISCLAIMER}</p>
                <Link className="text-button" to="/app/settings">Manage Tax Settings</Link>
              </section>
              <section className="rep129-card">
                <div className="rep129-card-head">
                  <div><span className="rep129-eyebrow">QRPH settlement</span><h3>Recorded QRPH collections</h3><p>Only completed QRPH payments are eligible. Cash is never included.</p></div>
                  <Banknote size={20} />
                </div>
                <div className="rep129-qrph">
                  <article><span>Received</span><strong>{php(qrph.received_cents)}</strong></article>
                  <article><span>Settled</span><strong>{php(qrph.settled_cents)}</strong></article>
                  <article><span>Pending settlement</span><strong>{php(qrph.pending_cents)}</strong></article>
                </div>
                <div style={{ marginTop: 12 }}><Button onClick={() => setSettlementOpen(true)} disabled={!qrph.pending_cents}>Record Settlement</Button></div>
                <p className="rep129-disclaimer">This system records settlement history; it does not hold or withdraw funds unless a future payment provider explicitly supplies a payout API.</p>
              </section>
            </div>
          )}
        </>
      )}

      {isSuperAdmin && settlementOpen && <SettlementModal branches={availableBranches} initialBranchId={isAllBranchesMode ? '' : activeBranchId ?? ''} pending={qrph.pending_cents} onClose={() => setSettlementOpen(false)} onSaved={() => { setSettlementOpen(false); void refresh() }} />}
    </section>
  )
}
