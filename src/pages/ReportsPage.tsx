import { BarChart3, Download, FileSpreadsheet, FileText, Printer, RefreshCw, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useAuth } from '../features/auth/AuthContext'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { getExpenseCategories, getExpenseVendors } from '../features/expenses/expenseStore'
import { getInventoryCategories, getSuppliers } from '../features/inventory/inventoryStore'
import { buildExecutiveWorkbook } from '../features/reports/executiveWorkbook'
import {
  buildEnterpriseReportSnapshot,
  exportEnterpriseReportCsv,
  formatReportCurrency,
  getReportingDatePresetRange,
  type DateRangePreset,
} from '../features/reports/reportStore'
import { getStoredServices } from '../features/services/serviceStore'

const presets: Array<{ value: DateRangePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This week' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
]

const appointmentStatuses = ['all', 'pending', 'confirmed', 'rejected', 'cancelled', 'rescheduled', 'no_show', 'checked_in', 'waiting', 'in_progress', 'completed']
const invoiceStatuses = ['all', 'draft', 'unpaid', 'partially_paid', 'paid', 'partially_refunded', 'refunded']
const paymentMethods = ['all', 'cash', 'gcash', 'maya', 'bank_transfer', 'card', 'online_gateway', 'other']

function downloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function downloadBytes(filename: string, content: Uint8Array, mimeType: string) {
  const body = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer
  const blob = new Blob([body], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function formatChange(value: number | null) {
  if (value === null) return 'No previous period'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}% vs previous`
}

function labelize(value: string) {
  return value.replaceAll('_', ' ')
}

function maxOf(values: number[]) {
  return Math.max(...values, 1)
}

function printSnapshot(snapshot: ReturnType<typeof buildEnterpriseReportSnapshot>) {
  const printWindow = window.open('', '_blank', 'width=960,height=720')
  if (!printWindow) return
  printWindow.document.write(`
    <html>
      <head><title>Plamenco Reports</title></head>
      <body>
        <h1>Plamenco Dental Co. Reports & Analytics</h1>
        <p>${snapshot.filters.startDate} to ${snapshot.filters.endDate}</p>
        <h2>Financial Summary</h2>
        <ul>
          <li>Revenue: ${formatReportCurrency(snapshot.executive.billedRevenueCents)}</li>
          <li>Collections: ${formatReportCurrency(snapshot.executive.collectedCashCents)}</li>
          <li>Outstanding receivables: ${formatReportCurrency(snapshot.executive.outstandingReceivablesCents)}</li>
          <li>Recorded expenses: ${formatReportCurrency(snapshot.executive.operatingExpensesCents)}</li>
          <li>Net operating result: ${formatReportCurrency(snapshot.executive.netOperatingResultCents)}</li>
          <li>Completed appointments: ${snapshot.executive.completedVisits}</li>
          <li>No-show rate: ${(snapshot.executive.noShowRate * 100).toFixed(1)}%</li>
        </ul>
        <h2>Branch Performance</h2>
        <table border="1" cellspacing="0" cellpadding="6">
          <tr><th>Branch</th><th>Appointments</th><th>Collections</th><th>Expenses</th><th>Receivables</th></tr>
          ${snapshot.branches.map((branch) => `<tr><td>${branch.branchName}</td><td>${branch.appointments}</td><td>${formatReportCurrency(branch.collectionsCents)}</td><td>${formatReportCurrency(branch.expensesCents)}</td><td>${formatReportCurrency(branch.outstandingReceivablesCents)}</td></tr>`).join('')}
        </table>
        <h2>Provider Activity</h2>
        <table border="1" cellspacing="0" cellpadding="6">
          <tr><th>Provider</th><th>Patients</th><th>Completed</th><th>Treatments</th><th>Revenue</th><th>No Shows</th></tr>
          ${snapshot.providers.map((provider) => `<tr><td>${provider.providerName}</td><td>${provider.patientsSeen}</td><td>${provider.completedVisits}</td><td>${provider.treatments}</td><td>${formatReportCurrency(provider.billedRevenueCents)}</td><td>${provider.noShows}</td></tr>`).join('')}
        </table>
        <footer><p>Generated ${new Date().toLocaleString()} from the selected report snapshot.</p></footer>
      </body>
    </html>
  `)
  printWindow.document.close()
  printWindow.print()
}

export function ReportsPage() {
  const { user } = useAuth()
  const canExport = user?.role === 'super_admin' || user?.permissions?.some((permission) => permission.startsWith('reports.export'))
  const defaultRange = getReportingDatePresetRange('this_month')
  const [refreshKey, setRefreshKey] = useState(0)
  const [preset, setPreset] = useState<DateRangePreset>('this_month')
  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)
  const [branchId, setBranchId] = useState('all')
  const [providerId, setProviderId] = useState('all')
  const [serviceId, setServiceId] = useState('all')
  const [appointmentStatus, setAppointmentStatus] = useState('all')
  const [invoiceStatus, setInvoiceStatus] = useState('all')
  const [paymentMethod, setPaymentMethod] = useState('all')
  const [expenseCategoryId, setExpenseCategoryId] = useState('all')
  const [vendorId, setVendorId] = useState('all')
  const [inventoryCategoryId, setInventoryCategoryId] = useState('all')
  const [supplierId, setSupplierId] = useState('all')

  const branches = useMemo(() => {
    void refreshKey
    return getStoredBranches()
  }, [refreshKey])
  const providers = useMemo(() => {
    void refreshKey
    return getStoredProviders()
  }, [refreshKey])
  const services = useMemo(() => {
    void refreshKey
    return getStoredServices()
  }, [refreshKey])
  const expenseCategories = useMemo(() => {
    void refreshKey
    return getExpenseCategories()
  }, [refreshKey])
  const vendors = useMemo(() => {
    void refreshKey
    return getExpenseVendors()
  }, [refreshKey])
  const inventoryCategories = useMemo(() => {
    void refreshKey
    return getInventoryCategories()
  }, [refreshKey])
  const suppliers = useMemo(() => {
    void refreshKey
    return getSuppliers()
  }, [refreshKey])
  const snapshot = useMemo(() => {
    void refreshKey
    return buildEnterpriseReportSnapshot({
      filters: {
        preset,
        startDate,
        endDate,
        branchId,
        providerId,
        serviceId,
        appointmentStatus: appointmentStatus as never,
        invoiceStatus: invoiceStatus as never,
        paymentMethod: paymentMethod as never,
        expenseCategoryId,
        vendorId,
        inventoryCategoryId,
        supplierId,
      },
    })
  }, [appointmentStatus, branchId, endDate, expenseCategoryId, inventoryCategoryId, invoiceStatus, paymentMethod, preset, providerId, refreshKey, serviceId, startDate, supplierId, vendorId])

  const trendMax = maxOf(snapshot.trend.flatMap((entry) => [entry.collectionsCents, entry.expensesCents, entry.billedRevenueCents]))
  const statusMax = maxOf(snapshot.appointments.byStatus.map((entry) => entry.count))
  const branchMax = maxOf(snapshot.branches.flatMap((entry) => [entry.collectionsCents, entry.expensesCents]))
  const hasData = snapshot.executive.appointments || snapshot.executive.billedRevenueCents || snapshot.executive.collectedCashCents || snapshot.executive.operatingExpensesCents || snapshot.inventory.stockRows.length

  const handlePresetChange = (value: DateRangePreset) => {
    setPreset(value)
    if (value !== 'custom') {
      const range = getReportingDatePresetRange(value)
      setStartDate(range.startDate)
      setEndDate(range.endDate)
    }
  }

  return (
    <section className="page-stack reports-analytics-page">
      <div className="section-header reports-header">
        <div>
          <span className="eyebrow">Enterprise reporting</span>
          <h2>Reports &amp; Analytics</h2>
          <p>Executive, financial, branch, clinical, inventory, and purchasing reporting from real clinic records.</p>
        </div>
        <div className="report-export-actions">
          <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => setRefreshKey((value) => value + 1)}>Refresh</Button>
          {canExport && (
            <>
              <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={() => downloadText('plamenco-enterprise-report.csv', exportEnterpriseReportCsv(snapshot), 'text/csv;charset=utf-8;')}>CSV</Button>
              <Button variant="secondary" size="sm" icon={<FileSpreadsheet size={14} />} onClick={() => downloadBytes('plamenco-executive-report.xlsx', buildExecutiveWorkbook(snapshot), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}>Excel</Button>
              <Button variant="secondary" size="sm" icon={<Printer size={14} />} onClick={() => printSnapshot(snapshot)}>PDF</Button>
            </>
          )}
        </div>
      </div>

      <div className="reports-filter-panel panel">
        <div className="reports-filter-grid">
          <label className="report-control"><span>Range</span><select value={preset} onChange={(event) => handlePresetChange(event.target.value as DateRangePreset)}>{presets.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="report-control"><span>Start date</span><input type="date" value={startDate} onChange={(event) => { setPreset('custom'); setStartDate(event.target.value) }} /></label>
          <label className="report-control"><span>End date</span><input type="date" value={endDate} onChange={(event) => { setPreset('custom'); setEndDate(event.target.value) }} /></label>
          <label className="report-control"><span>Branch</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="all">All authorized branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <label className="report-control"><span>Dentist / Provider</span><select value={providerId} onChange={(event) => setProviderId(event.target.value)}><option value="all">All providers</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select></label>
          <label className="report-control"><span>Service</span><select value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="all">All services</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
          <label className="report-control"><span>Appointment status</span><select value={appointmentStatus} onChange={(event) => setAppointmentStatus(event.target.value)}>{appointmentStatuses.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}</select></label>
          <label className="report-control"><span>Invoice status</span><select value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value)}>{invoiceStatuses.map((status) => <option key={status} value={status}>{labelize(status)}</option>)}</select></label>
          <label className="report-control"><span>Payment method</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{paymentMethods.map((method) => <option key={method} value={method}>{labelize(method)}</option>)}</select></label>
          <label className="report-control"><span>Expense category</span><select value={expenseCategoryId} onChange={(event) => setExpenseCategoryId(event.target.value)}><option value="all">All categories</option>{expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="report-control"><span>Vendor</span><select value={vendorId} onChange={(event) => setVendorId(event.target.value)}><option value="all">All vendors</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label>
          <label className="report-control"><span>Inventory category</span><select value={inventoryCategoryId} onChange={(event) => setInventoryCategoryId(event.target.value)}><option value="all">All inventory</option>{inventoryCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="report-control"><span>Supplier</span><select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="all">All suppliers</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
        </div>
      </div>

      {!hasData && (
        <div className="panel chart-panel chart-empty-panel">
          <div className="chart-empty-state">
            <BarChart3 size={28} />
            <h3>No reportable records found for this filter context.</h3>
            <p>Reports will populate from appointments, invoices, payments, expenses, inventory, and purchase records.</p>
          </div>
        </div>
      )}

      <div className="report-summary-grid">
        <article className="summary-kpi"><span>Billed revenue</span><strong>{formatReportCurrency(snapshot.executive.billedRevenueCents)}</strong><small>invoice totals, not collections</small></article>
        <article className="summary-kpi"><span>Collected cash</span><strong>{formatReportCurrency(snapshot.executive.collectedCashCents)}</strong><small>{formatChange(snapshot.executive.collectionsComparison.changePercent)}</small></article>
        <article className="summary-kpi"><span>Receivables</span><strong>{formatReportCurrency(snapshot.executive.outstandingReceivablesCents)}</strong><small>open invoice balances</small></article>
        <article className="summary-kpi"><span>Expenses</span><strong>{formatReportCurrency(snapshot.executive.operatingExpensesCents)}</strong><small>{formatChange(snapshot.executive.expensesComparison.changePercent)}</small></article>
        <article className="summary-kpi"><span>Net operating result</span><strong>{formatReportCurrency(snapshot.executive.netOperatingResultCents)}</strong><small>collections - expenses</small></article>
        <article className="summary-kpi"><span>No-show rate</span><strong>{formatPercent(snapshot.executive.noShowRate)}</strong><small>{snapshot.executive.appointments} appointments</small></article>
        <article className="summary-kpi"><span>Discounts</span><strong>{formatReportCurrency(snapshot.revenue.discountCents)}</strong><small>invoice discount totals</small></article>
        <article className="summary-kpi"><span>Refunds</span><strong>{formatReportCurrency(snapshot.revenue.refundsCents)}</strong><small>{snapshot.revenue.refundCount} completed refunds</small></article>
      </div>

      <div className="analytics-grid">
        <article className="panel chart-panel chart-panel-wide">
          <div className="chart-header"><div><span className="chart-kicker">Executive trend</span><h3>Collections, expenses, and billed revenue</h3></div></div>
          <div className="bar-chart">
            {snapshot.trend.map((entry) => (
              <div className="bar-col" key={entry.date} title={`${entry.date}: collections ${formatReportCurrency(entry.collectionsCents)}, expenses ${formatReportCurrency(entry.expensesCents)}`}>
                <span className="bar-value">{formatReportCurrency(Math.max(entry.collectionsCents, entry.expensesCents, entry.billedRevenueCents))}</span>
                <div className="bar-track"><span style={{ height: `${Math.max((entry.collectionsCents / trendMax) * 100, entry.collectionsCents ? 8 : 0)}%`, background: '#2d6a52' }} /></div>
                <div className="bar-track"><span style={{ height: `${Math.max((entry.expensesCents / trendMax) * 100, entry.expensesCents ? 8 : 0)}%`, background: '#b7594d' }} /></div>
                <small>{entry.label}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel chart-panel">
          <div className="chart-header"><div><span className="chart-kicker">Appointments</span><h3>Status distribution</h3></div></div>
          <div className="service-bars">
            {snapshot.appointments.byStatus.map((entry) => (
              <div className="service-bar-row" key={entry.status}>
                <div className="service-label-group"><strong>{labelize(entry.status)}</strong><span>{entry.count} records</span></div>
                <div className="service-bar-track"><span style={{ width: `${(entry.count / statusMax) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel chart-panel">
          <div className="chart-header"><div><span className="chart-kicker">Patient growth</span><h3>New and returning patients</h3></div></div>
          <div className="service-bars">
            {snapshot.patients.growthTrend.slice(0, 10).map((entry) => (
              <div className="service-bar-row compact" key={entry.date}>
                <div className="service-label-group"><strong>{entry.label}</strong><span>{entry.newPatients} new, {entry.returningPatients} returning</span></div>
                <div className="service-bar-track"><span style={{ width: `${((entry.newPatients + entry.returningPatients) / maxOf(snapshot.patients.growthTrend.map((row) => row.newPatients + row.returningPatients))) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel chart-panel chart-panel-wide">
          <div className="chart-header"><div><span className="chart-kicker">Branch performance</span><h3>Pulilan vs Plaridel</h3></div></div>
          <div className="service-bars">
            {snapshot.branches.map((branch) => (
              <div className="service-bar-row" key={branch.branchId}>
                <div className="service-label-group"><strong>{branch.branchName}</strong><span>{branch.completedVisits} completed visits, {branch.noShows} no-shows</span></div>
                <div className="service-bar-track"><span style={{ width: `${(branch.collectionsCents / branchMax) * 100}%`, background: '#2d6a52' }} /></div>
                <em>{formatReportCurrency(branch.collectionsCents)} collected</em>
              </div>
            ))}
          </div>
        </article>

        <article className="panel chart-panel chart-panel-wide">
          <div className="chart-header"><div><span className="chart-kicker">Treatments & services</span><h3>Performed services and revenue basis</h3></div></div>
          <div className="service-bars">
            {snapshot.treatments.slice(0, 8).map((service) => (
              <div className="service-bar-row" key={service.serviceId}>
                <div className="service-label-group"><strong>{service.serviceName}</strong><span>{service.performedCount} completed, {service.plannedCount} planned</span></div>
                <div className="service-bar-track"><span style={{ width: `${(service.billedRevenueCents / maxOf(snapshot.treatments.map((entry) => entry.billedRevenueCents))) * 100}%` }} /></div>
                <em>{formatReportCurrency(service.billedRevenueCents)}</em>
              </div>
            ))}
          </div>
        </article>

        <article className="panel chart-panel">
          <div className="chart-header"><div><span className="chart-kicker">Busiest days</span><h3>Appointment volume by weekday</h3></div></div>
          <div className="service-bars">
            {snapshot.appointments.busiestDays.map((day) => (
              <div className="service-bar-row compact" key={day.day}>
                <div className="service-label-group"><strong>{day.day}</strong><span>{day.count} appointments</span></div>
                <div className="service-bar-track"><span style={{ width: `${(day.count / maxOf(snapshot.appointments.busiestDays.map((row) => row.count))) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel chart-panel">
          <div className="chart-header"><div><span className="chart-kicker">Busiest hours</span><h3>Appointment volume by start time</h3></div></div>
          <div className="service-bars">
            {snapshot.appointments.busiestHours.slice(0, 8).map((hour) => (
              <div className="service-bar-row compact" key={hour.hour}>
                <div className="service-label-group"><strong>{hour.hour}</strong><span>{hour.count} appointments</span></div>
                <div className="service-bar-track"><span style={{ width: `${(hour.count / maxOf(snapshot.appointments.busiestHours.map((row) => row.count))) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="analytics-grid">
        <section className="panel table-panel">
          <div className="chart-header"><div><span className="chart-kicker">Accounts receivable</span><h3>Open invoices</h3></div><FileText size={18} /></div>
          <div className="table-scroll"><table className="table"><thead><tr><th>Invoice</th><th>Patient</th><th>Branch</th><th>Status</th><th>Balance</th></tr></thead><tbody>
            {snapshot.revenue.accountsReceivable.slice(0, 8).map((invoice) => <tr key={invoice.invoiceNumber}><td><strong>{invoice.invoiceNumber}</strong><span>{invoice.invoiceDate}</span></td><td>{invoice.patientName}</td><td>{invoice.branchName}</td><td>{labelize(invoice.status)}</td><td>{formatReportCurrency(invoice.balanceCents)}</td></tr>)}
          </tbody></table></div>
        </section>

        <section className="panel table-panel">
          <div className="chart-header"><div><span className="chart-kicker">Receivable aging</span><h3>Open balance buckets</h3></div><FileText size={18} /></div>
          <div className="table-scroll"><table className="table"><thead><tr><th>Bucket</th><th>Invoices</th><th>Balance</th></tr></thead><tbody>
            {snapshot.revenue.receivableAging.map((bucket) => <tr key={bucket.bucket}><td><strong>{bucket.bucket}</strong></td><td>{bucket.count}</td><td>{formatReportCurrency(bucket.balanceCents)}</td></tr>)}
          </tbody></table></div>
        </section>

        <section className="panel table-panel">
          <div className="chart-header"><div><span className="chart-kicker">Expenses</span><h3>Category and vendor detail</h3></div><TrendingUp size={18} /></div>
          <div className="table-scroll"><table className="table"><thead><tr><th>Expense</th><th>Payee</th><th>Category</th><th>Status</th><th>Total</th></tr></thead><tbody>
            {snapshot.expenses.details.slice(0, 8).map((expense) => <tr key={expense.expenseNumber}><td><strong>{expense.expenseNumber}</strong><span>{expense.expenseDate}</span></td><td>{expense.payeeName}</td><td>{expense.categoryName}</td><td>{labelize(expense.status)}</td><td>{formatReportCurrency(expense.totalCents)}</td></tr>)}
          </tbody></table></div>
        </section>

        <section className="panel table-panel">
          <div className="chart-header"><div><span className="chart-kicker">Provider performance</span><h3>Dentist workload</h3></div><BarChart3 size={18} /></div>
          <div className="table-scroll"><table className="table"><thead><tr><th>Provider</th><th>Branch</th><th>Patients</th><th>Completed</th><th>Treatments</th><th>Revenue</th><th>Avg Value</th><th>No Shows</th></tr></thead><tbody>
            {snapshot.providers.slice(0, 8).map((provider) => <tr key={provider.providerId}><td><strong>{provider.providerName}</strong></td><td>{provider.branchNames}</td><td>{provider.patientsSeen}</td><td>{provider.completedVisits}</td><td>{provider.treatments}</td><td>{formatReportCurrency(provider.billedRevenueCents)}</td><td>{formatReportCurrency(provider.averageTreatmentValueCents)}</td><td>{provider.noShows}</td></tr>)}
          </tbody></table></div>
        </section>

        <section className="panel table-panel">
          <div className="chart-header"><div><span className="chart-kicker">Inventory & purchasing</span><h3>Stock and supplier analytics</h3></div><FileSpreadsheet size={18} /></div>
          <div className="table-scroll"><table className="table"><thead><tr><th>Item</th><th>Branch</th><th>Category</th><th>Status</th><th>Value</th></tr></thead><tbody>
            {snapshot.inventory.stockRows.slice(0, 8).map((stock) => <tr key={`${stock.itemId}-${stock.branchName}`}><td><strong>{stock.itemName}</strong><span>{stock.quantityOnHand} on hand / reorder {stock.reorderLevel}</span></td><td>{stock.branchName}</td><td>{stock.categoryName}</td><td>{labelize(stock.status)}</td><td>{formatReportCurrency(stock.valuationCents)}</td></tr>)}
          </tbody></table></div>
        </section>

        {snapshot.dataQuality.length > 0 && (
          <section className="panel table-panel">
            <div className="chart-header"><div><span className="chart-kicker">Data quality</span><h3>Records requiring review</h3></div><BarChart3 size={18} /></div>
            <div className="table-scroll"><table className="table"><thead><tr><th>Area</th><th>Records</th><th>Review note</th></tr></thead><tbody>
              {snapshot.dataQuality.map((issue) => <tr key={issue.area}><td><strong>{issue.area}</strong></td><td>{issue.count}</td><td>{issue.message}</td></tr>)}
            </tbody></table></div>
          </section>
        )}
      </div>
    </section>
  )
}
