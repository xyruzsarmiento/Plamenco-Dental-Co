import { useMemo } from 'react'
import { PremiumBarChartV35 } from '../components/ui/PremiumInteractiveChartV35'
import { buildEnterpriseReportSnapshot, formatReportCurrency } from '../features/reports/reportStore'
import { ServicesPageV15 } from './ServicesPageV15'

export function ServicesPageV35() {
  const snapshot = useMemo(() => buildEnterpriseReportSnapshot({ filters: { preset: 'this_month' } }), [])
  const serviceRows = useMemo(() => [...snapshot.treatments].sort((a, b) => b.performedCount - a.performedCount).slice(0, 8), [snapshot])

  return <section className="services35-shell">
    <div className="analytics35-grid services35-analytics">
      <section className="analytics35-card"><header><span>Service demand</span><h3>Most availed services</h3><p>Actual performed treatment volume this month. Hover a bar for exact activity.</p></header><PremiumBarChartV35 rows={serviceRows.map((row) => ({ label: row.serviceName, value: row.performedCount, meta: `${row.plannedCount} planned` }))} valueLabel="Performed" ariaLabel="Most availed services" /></section>
      <section className="analytics35-card"><header><span>Service value</span><h3>Billed value by service</h3><p>Recorded billed value associated with performed treatment activity.</p></header><PremiumBarChartV35 rows={serviceRows.map((row) => ({ label: row.serviceName, value: row.billedRevenueCents, meta: `${row.performedCount} performed` }))} valueLabel="Billed value" formatter={formatReportCurrency} ariaLabel="Billed value by service" /></section>
    </div>
    <ServicesPageV15 />
  </section>
}
