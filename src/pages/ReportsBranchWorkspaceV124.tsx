import { useMemo, useState } from 'react'
import { Activity, BarChart3, CalendarDays, CircleDollarSign, Landmark, PackageSearch, ReceiptText, Stethoscope, TrendingUp, Users } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { useAuth } from '../features/auth/AuthContext'
import { useBranchContext } from '../features/branches/BranchContext'
import { getStoredAppointments } from '../features/appointments/appointmentStore'
import { getExpenses } from '../features/expenses/expenseStore'
import { buildEnterpriseReportSnapshot, formatReportCurrency, getReportingDatePresetRange, type DateRangePreset } from '../features/reports/reportStore'
import { calculateReportTax, getStoredReportTaxConfiguration, TAX_PLANNING_DISCLAIMER } from '../features/reports/reportTaxStore'
import { getStoredServices } from '../features/services/serviceStore'

const presets: Array<{ value: DateRangePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'This year' },
]

function inRange(value: string | undefined, startDate: string, endDate: string) {
  if (!value) return false
  const date = value.slice(0, 10)
  return date >= startDate && date <= endDate
}

function percentage(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function shortBranchName(name: string) {
  return name.replace(/^Plamenco Dental Co\.\s*-\s*/i, '')
}

export function ReportsBranchWorkspaceV124() {
  const { user } = useAuth()
  const { activeBranch, activeBranchId, availableBranches, authorizedBranchIds, isAllBranchesMode } = useBranchContext()
  const initial = getReportingDatePresetRange('this_month')
  const [preset, setPreset] = useState<DateRangePreset>('this_month')
  const [startDate, setStartDate] = useState(initial.startDate)
  const [endDate, setEndDate] = useState(initial.endDate)
  const [revision, setRevision] = useState(0)

  const filters = useMemo(() => ({
    preset,
    startDate,
    endDate,
    branchId: isAllBranchesMode ? 'all' : activeBranchId ?? undefined,
    authorizedBranchIds,
  }), [activeBranchId, authorizedBranchIds, endDate, isAllBranchesMode, preset, startDate])

  const snapshot = useMemo(() => {
    void revision
    return buildEnterpriseReportSnapshot({ filters })
  }, [filters, revision])

  const allAppointments = useMemo(() => {
    void revision
    return getStoredAppointments().filter((appointment) => inRange(appointment.date, startDate, endDate))
  }, [endDate, revision, startDate])
  const services = useMemo(() => { void revision; return getStoredServices() }, [revision])
  const clinicWideExpenses = useMemo(() => {
    void revision
    return getExpenses().filter((expense) => expense.scope === 'clinic_wide' && expense.status !== 'void' && expense.status !== 'cancelled' && inRange(expense.expenseDate, startDate, endDate))
  }, [endDate, revision, startDate])
  const clinicWideCostCents = clinicWideExpenses.reduce((sum, expense) => sum + expense.totalCents, 0)

  const branchComparisons = useMemo(() => {
    if (!isAllBranchesMode) return []
    return availableBranches.map((branch) => {
      const base = snapshot.branches.find((row) => row.branchId === branch.id)
      const appointments = allAppointments.filter((appointment) => appointment.branchId === branch.id)
      const patientsSeen = new Set(appointments.filter((appointment) => appointment.status === 'completed').map((appointment) => appointment.patientId)).size
      const serviceCounts = appointments.reduce<Record<string, number>>((acc, appointment) => {
        const serviceId = appointment.serviceId
        if (serviceId) acc[serviceId] = (acc[serviceId] ?? 0) + 1
        return acc
      }, {})
      const topServiceEntry = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0]
      const topService = topServiceEntry
        ? `${services.find((service) => service.id === topServiceEntry[0])?.name ?? 'Service'} · ${topServiceEntry[1]}`
        : 'No activity'
      return {
        branch,
        revenue: base?.billedRevenueCents ?? 0,
        collections: base?.collectionsCents ?? 0,
        expenses: base?.expensesCents ?? 0,
        net: base?.netOperatingResultCents ?? 0,
        appointments: base?.appointments ?? appointments.length,
        patientsSeen,
        noShowRate: base?.noShowRate ?? 0,
        topService,
      }
    })
  }, [allAppointments, availableBranches, isAllBranchesMode, services, snapshot.branches])

  const maxBranchRevenue = Math.max(1, ...branchComparisons.map((row) => row.revenue))
  const tax = useMemo(() => calculateReportTax(snapshot, getStoredReportTaxConfiguration()), [snapshot])
  const rangeInvalid = startDate > endDate

  function changePreset(next: DateRangePreset) {
    setPreset(next)
    const range = getReportingDatePresetRange(next)
    setStartDate(range.startDate)
    setEndDate(range.endDate)
  }

  if (!isAllBranchesMode && !activeBranchId) {
    return <section className="rv124-page"><div className="rv124-empty"><BarChart3 size={28}/><h2>No report branch selected</h2><p>Select an authorized branch workspace to view operational analytics.</p></div></section>
  }

  const scopeName = isAllBranchesMode ? 'All Branches' : activeBranch?.name ?? 'Branch'
  const topServices = [...snapshot.treatments].sort((a, b) => b.performedCount - a.performedCount).slice(0, 8)
  const providers = [...snapshot.providers].sort((a, b) => b.completedVisits - a.completedVisits).slice(0, 8)

  return <section className="rv124-page" data-report-scope-key={`reports:${isAllBranchesMode ? 'all' : activeBranchId}:${authorizedBranchIds.join(',')}`}>
    <header className="rv56-hero rv124-hero">
      <div><span>MANAGEMENT ANALYTICS · {scopeName.toUpperCase()}</span><h1>Reports & Analytics</h1><p>{isAllBranchesMode ? 'Executive comparison across authorized clinic branches. Company-wide costs remain separate and are never fabricated into branch totals.' : `Operational performance for ${activeBranch?.name}. Only this branch's activity is included.`}</p></div>
      <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>Refresh</Button>
    </header>

    <section className="rv124-scope-card">
      <div><span>REPORT SCOPE</span><strong>{scopeName}</strong><small>{isAllBranchesMode ? 'Executive comparison mode' : 'Single branch operating view'}</small></div>
      <Badge tone="info">{isAllBranchesMode ? 'Comparison' : 'Branch scoped'}</Badge>
    </section>

    <section className="rv124-filters" aria-label="Report date range">
      <label><span>Period</span><select value={preset} onChange={(event) => changePreset(event.target.value as DateRangePreset)}>{presets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label><span>From</span><input type="date" value={startDate} onChange={(event) => { setPreset('custom'); setStartDate(event.target.value) }}/></label>
      <label><span>To</span><input type="date" value={endDate} onChange={(event) => { setPreset('custom'); setEndDate(event.target.value) }}/></label>
      {rangeInvalid && <strong className="rv124-range-error">Start date must be before end date.</strong>}
    </section>

    <section className="rv124-kpis">
      <article><i><CircleDollarSign size={17}/></i><span>Billed revenue</span><strong>{formatReportCurrency(snapshot.executive.billedRevenueCents)}</strong><small>{scopeName}</small></article>
      <article><i><WalletIcon /></i><span>Collections</span><strong>{formatReportCurrency(snapshot.executive.collectedCashCents)}</strong><small>Recorded collections</small></article>
      <article><i><Landmark size={17}/></i><span>Receivables</span><strong>{formatReportCurrency(snapshot.executive.outstandingReceivablesCents)}</strong><small>Outstanding balances</small></article>
      <article><i><ReceiptText size={17}/></i><span>Operating expenses</span><strong>{formatReportCurrency(snapshot.executive.operatingExpensesCents)}</strong><small>{isAllBranchesMode ? 'Includes clinic-wide costs once' : 'Branch-owned costs only'}</small></article>
      <article><i><CalendarDays size={17}/></i><span>Appointments</span><strong>{snapshot.executive.appointments}</strong><small>{snapshot.executive.completedVisits} completed visits</small></article>
      <article><i><Activity size={17}/></i><span>No-show rate</span><strong>{percentage(snapshot.executive.noShowRate)}</strong><small>Operational activity metric</small></article>
      <article><i><Users size={17}/></i><span>Patients seen</span><strong>{snapshot.executive.uniquePatientsSeen}</strong><small>Unique patients in period</small></article>
      <article><i><TrendingUp size={17}/></i><span>Net operating result</span><strong>{formatReportCurrency(snapshot.executive.netOperatingResultCents)}</strong><small>Revenue less recorded operating costs</small></article>
    </section>

    {isAllBranchesMode && <>
      <section className="rv124-section">
        <header><div><span>BRANCH COMPARISON</span><h2>Performance by branch</h2><p>Branch-owned figures remain separate. Company-wide expenses are not allocated to Pulilan or Plaridel.</p></div></header>
        <div className="rv124-comparison-grid">{branchComparisons.map((row) => <article key={row.branch.id}>
          <header><div><span>BRANCH</span><h3>{shortBranchName(row.branch.name)}</h3></div><strong>{formatReportCurrency(row.revenue)}</strong></header>
          <div className="rv124-meter"><span style={{ width: `${Math.max(3, row.revenue / maxBranchRevenue * 100)}%` }}/></div>
          <dl><div><dt>Collections</dt><dd>{formatReportCurrency(row.collections)}</dd></div><div><dt>Appointments</dt><dd>{row.appointments}</dd></div><div><dt>Patients seen</dt><dd>{row.patientsSeen}</dd></div><div><dt>Expenses</dt><dd>{formatReportCurrency(row.expenses)}</dd></div><div><dt>Net result</dt><dd>{formatReportCurrency(row.net)}</dd></div><div><dt>No-show rate</dt><dd>{percentage(row.noShowRate)}</dd></div><div className="is-wide"><dt>Top service demand</dt><dd>{row.topService}</dd></div></dl>
        </article>)}</div>
      </section>

      <section className="rv124-company-cost">
        <ReceiptText size={20}/><div><span>COMPANY-WIDE COSTS</span><strong>{formatReportCurrency(clinicWideCostCents)}</strong><p>{clinicWideExpenses.length} clinic-wide expense record{clinicWideExpenses.length === 1 ? '' : 's'} in this period. These costs are included once in clinic totals but are not allocated to any branch because no allocation model exists.</p></div>
      </section>
    </>}

    <div className="rv124-two-column">
      <section className="rv124-section">
        <header><div><span>SERVICE DEMAND</span><h2>Top treatments & services</h2><p>{isAllBranchesMode ? 'Clinic-wide demand for the selected period.' : `Demand recorded in ${activeBranch?.name}.`}</p></div><Stethoscope size={19}/></header>
        <div className="rv124-ranked-list">{topServices.map((row, index) => <article key={row.serviceId}><span>{index + 1}</span><div><strong>{row.serviceName}</strong><small>{row.performedCount} performed · {row.plannedCount} planned</small></div><b>{formatReportCurrency(row.billedRevenueCents)}</b></article>)}{!topServices.length && <p className="rv124-muted">No service activity in this period.</p>}</div>
      </section>

      <section className="rv124-section">
        <header><div><span>PROVIDER ACTIVITY</span><h2>Dentist performance</h2><p>Operational activity only; these metrics do not measure clinical quality.</p></div><Users size={19}/></header>
        <div className="rv124-ranked-list">{providers.map((row, index) => <article key={row.providerId}><span>{index + 1}</span><div><strong>{row.providerName}</strong><small>{row.completedVisits} completed visits · {row.patientsSeen} patients</small></div><b>{formatReportCurrency(row.collectionsCents)}</b></article>)}{!providers.length && <p className="rv124-muted">No provider activity in this period.</p>}</div>
      </section>
    </div>

    <section className="rv124-inventory-row">
      <article><PackageSearch size={19}/><div><span>Active inventory items</span><strong>{snapshot.inventory.activeItems}</strong></div></article>
      <article><PackageSearch size={19}/><div><span>Low stock</span><strong>{snapshot.inventory.lowStockItems}</strong></div></article>
      <article><PackageSearch size={19}/><div><span>Out of stock</span><strong>{snapshot.inventory.outOfStockItems}</strong></div></article>
      <article><PackageSearch size={19}/><div><span>Inventory valuation</span><strong>{formatReportCurrency(snapshot.inventory.inventoryValuationCents)}</strong></div></article>
    </section>

    {user?.role === 'super_admin' && <section className="rv124-tax-card">
      <div><span>TAX ESTIMATE · PLANNING AID</span><h2>{isAllBranchesMode ? tax.statusLabel : 'Clinic-level estimate only'}</h2><p>{isAllBranchesMode ? tax.explanation : 'Tax should not be allocated to an individual branch without an approved accounting allocation model. Switch to All Branches for the clinic-level planning estimate.'}</p></div>
      <strong>{isAllBranchesMode && tax.estimatedTaxCents !== null ? formatReportCurrency(tax.estimatedTaxCents) : '—'}</strong>
      <small>{TAX_PLANNING_DISCLAIMER}</small>
    </section>}
  </section>
}

function WalletIcon() {
  return <CircleDollarSign size={17}/>
}
