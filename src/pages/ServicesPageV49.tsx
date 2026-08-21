import { useMemo } from 'react'
import { BarChart3, CircleDollarSign } from 'lucide-react'
import { BilledValueByServiceV52, MostAvailedServicesV52 } from '../components/ui/ServiceAnalyticsV52'
import { buildEnterpriseReportSnapshot, formatReportCurrency } from '../features/reports/reportStore'
import { ServicesPageV15 } from './ServicesPageV15'

export function ServicesPageV49() {
  const snapshot = useMemo(() => buildEnterpriseReportSnapshot({ filters: { preset: 'this_month' } }), [])
  const serviceRows = useMemo(
    () => [...snapshot.treatments].sort((a, b) => b.performedCount - a.performedCount).slice(0, 8),
    [snapshot],
  )
  const analyticsRows = useMemo(() => serviceRows.map((row) => ({
    label: row.serviceName,
    performed: row.performedCount,
    planned: row.plannedCount,
    billedCents: row.billedRevenueCents,
    billedLabel: formatReportCurrency(row.billedRevenueCents),
  })), [serviceRows])

  return (
    <section className="services49-shell services52-shell">
      <ServicesPageV15 />

      <section className="services49-intelligence services52-intelligence" aria-label="Service performance analytics">
        <header className="services49-intelligence-head services52-intelligence-head">
          <div>
            <span>Service intelligence</span>
            <h2>Catalogue performance</h2>
            <p>Supporting analytics from actual performed treatment activity. Hover or focus a row to inspect exact values.</p>
          </div>
        </header>

        <div className="services49-analytics-grid services52-analytics-grid">
          <article className="services49-analytics-card services52-analytics-card is-demand">
            <div className="services49-card-head services52-card-head">
              <div className="services49-card-icon"><BarChart3 size={19} /></div>
              <div>
                <span>Clinical demand</span>
                <h3>Most availed services</h3>
                <p>Completed treatment volume ranked by actual clinical activity this month.</p>
              </div>
            </div>
            <div className="services49-chart-frame services52-chart-frame">
              <MostAvailedServicesV52 rows={analyticsRows} />
            </div>
          </article>

          <article className="services49-analytics-card services52-analytics-card is-value">
            <div className="services49-card-head services52-card-head">
              <div className="services49-card-icon"><CircleDollarSign size={19} /></div>
              <div>
                <span>Service value</span>
                <h3>Billed value by service</h3>
                <p>Recorded billed value associated with performed clinical activity.</p>
              </div>
            </div>
            <div className="services49-chart-frame services52-chart-frame">
              <BilledValueByServiceV52 rows={analyticsRows} />
            </div>
          </article>
        </div>
      </section>
    </section>
  )
}
