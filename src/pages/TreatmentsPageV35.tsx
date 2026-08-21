import { useMemo } from 'react'
import { PremiumBarChartV35 } from '../components/ui/PremiumInteractiveChartV35'
import { buildEnterpriseReportSnapshot, formatReportCurrency } from '../features/reports/reportStore'
import { TreatmentsPageV12 } from './TreatmentsPageV12'

export function TreatmentsPageV35() {
  const snapshot = useMemo(() => buildEnterpriseReportSnapshot({ filters: { preset: 'this_month' } }), [])
  const treatmentRows = useMemo(() => [...snapshot.treatments].sort((a, b) => b.performedCount - a.performedCount).slice(0, 8), [snapshot])

  return <section className="treatments35-shell">
    <div className="analytics35-grid treatments35-analytics">
      <section className="analytics35-card"><header><span>Clinical activity</span><h3>Most performed treatments</h3><p>Current-month performed treatment records. Hover a bar to inspect volume and billed value.</p></header><PremiumBarChartV35 rows={treatmentRows.map((row) => ({ label: row.serviceName, value: row.performedCount, meta: `${formatReportCurrency(row.billedRevenueCents)} billed` }))} valueLabel="Performed" ariaLabel="Most performed treatments" /></section>
      <section className="analytics35-card"><header><span>Care pipeline</span><h3>Planned vs performed</h3><p>Current-month treatment demand compared with completed clinical activity.</p></header><PremiumBarChartV35 rows={treatmentRows.map((row) => ({ label: row.serviceName, value: row.plannedCount, meta: `${row.performedCount} performed` }))} valueLabel="Planned" ariaLabel="Planned treatments by service" /></section>
    </div>
    <TreatmentsPageV12 />
  </section>
}
