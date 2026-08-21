import { useMemo } from 'react'
import { BarChart3, CircleDollarSign } from 'lucide-react'
import { PremiumBarChartV35 } from '../components/ui/PremiumInteractiveChartV35'
import { buildEnterpriseReportSnapshot, formatReportCurrency } from '../features/reports/reportStore'
import { ServicesPageV15 } from './ServicesPageV15'

export function ServicesPageV49() {
  const snapshot = useMemo(() => buildEnterpriseReportSnapshot({ filters: { preset: 'this_month' } }), [])
  const serviceRows = useMemo(
    () => [...snapshot.treatments].sort((a, b) => b.performedCount - a.performedCount).slice(0, 8),
    [snapshot],
  )
  const totalPerformed = useMemo(() => serviceRows.reduce((sum, row) => sum + row.performedCount, 0), [serviceRows])
  const totalBilled = useMemo(() => serviceRows.reduce((sum, row) => sum + row.billedRevenueCents, 0), [serviceRows])
  const topService = serviceRows[0]

  return (
    <section className="services49-shell">
      <ServicesPageV15 />

      <section className="services49-intelligence" aria-label="Service performance analytics">
        <header className="services49-intelligence-head">
          <div>
            <span>Service intelligence</span>
            <h2>Catalogue performance</h2>
            <p>Supporting analytics from actual performed treatment activity. Hover or focus a bar to inspect exact values.</p>
          </div>
          <div className="services49-intelligence-summary">
            <div><strong>{totalPerformed}</strong><span>performed this month</span></div>
            <div><strong>{formatReportCurrency(totalBilled)}</strong><span>billed value</span></div>
          </div>
        </header>

        <div className="services49-analytics-grid">
          <article className="services49-analytics-card is-demand">
            <div className="services49-card-head">
              <div className="services49-card-icon"><BarChart3 size={19} /></div>
              <div>
                <span>Clinical demand</span>
                <h3>Most availed services</h3>
                <p>Completed treatment volume ranked by service for the current month.</p>
              </div>
              <div className="services49-card-stat">
                <strong>{topService?.performedCount ?? 0}</strong>
                <span>top volume</span>
              </div>
            </div>
            <div className="services49-chart-frame">
              <PremiumBarChartV35
                rows={serviceRows.map((row) => ({
                  label: row.serviceName,
                  value: row.performedCount,
                  meta: `${row.plannedCount} planned`,
                }))}
                valueLabel="Performed"
                ariaLabel="Most availed services"
              />
            </div>
            {!serviceRows.length && <div className="services49-chart-empty">No performed treatment activity has been recorded this month.</div>}
          </article>

          <article className="services49-analytics-card is-value">
            <div className="services49-card-head">
              <div className="services49-card-icon"><CircleDollarSign size={19} /></div>
              <div>
                <span>Service value</span>
                <h3>Billed value by service</h3>
                <p>Recorded billed value associated with performed clinical activity.</p>
              </div>
              <div className="services49-card-stat">
                <strong>{formatReportCurrency(totalBilled)}</strong>
                <span>recorded value</span>
              </div>
            </div>
            <div className="services49-chart-frame">
              <PremiumBarChartV35
                rows={serviceRows.map((row) => ({
                  label: row.serviceName,
                  value: row.billedRevenueCents,
                  meta: `${row.performedCount} performed`,
                }))}
                valueLabel="Billed value"
                formatter={formatReportCurrency}
                ariaLabel="Billed value by service"
              />
            </div>
            {!serviceRows.length && <div className="services49-chart-empty">No billed service activity has been recorded this month.</div>}
          </article>
        </div>
      </section>
    </section>
  )
}
