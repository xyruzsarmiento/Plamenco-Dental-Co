import { useMemo, type ReactNode } from 'react'
import { PremiumBarChartV35, PremiumLineChartV35 } from '../components/ui/PremiumInteractiveChartV35'
import { buildEnterpriseReportSnapshot, formatReportCurrency } from '../features/reports/reportStore'
import { ReportsPageV19 } from './ReportsPageV19'

function AnalyticsCard({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <section className="analytics35-card"><header><span>{eyebrow}</span><h3>{title}</h3><p>{description}</p></header>{children}</section>
}

export function ReportsPageV35() {
  const snapshot = useMemo(() => buildEnterpriseReportSnapshot({ filters: { preset: 'this_month' } }), [])
  const topServices = useMemo(() => [...snapshot.treatments].sort((a, b) => b.performedCount - a.performedCount).slice(0, 8), [snapshot])
  const topExpenses = snapshot.expenses.byCategory.slice(0, 8)
  const paymentMix = snapshot.revenue.byPaymentMethod.filter((item) => item.totalCents > 0).sort((a, b) => b.totalCents - a.totalCents)

  return <section className="reports35-shell">
    <ReportsPageV19 />
    <section className="analytics35-section-head"><div><span>Expanded performance intelligence</span><h2>Clinic-wide analytics</h2><p>Additional recorded performance views for services, patients, appointment demand, collections and operating costs. Hover or keyboard-focus any chart point or bar to inspect its exact value.</p></div></section>
    <div className="analytics35-grid">
      <AnalyticsCard eyebrow="Patient performance" title="Patient growth" description="New and returning patient activity for the current month.">
        <PremiumLineChartV35 labels={snapshot.patients.growthTrend.map((row) => row.label)} series={[{ key: 'new', label: 'New patients', values: snapshot.patients.growthTrend.map((row) => row.newPatients) }, { key: 'returning', label: 'Returning patients', values: snapshot.patients.growthTrend.map((row) => row.returningPatients) }]} ariaLabel="Patient growth chart" />
      </AnalyticsCard>
      <AnalyticsCard eyebrow="Clinical demand" title="Most service availed" description="Actual performed treatment records ranked by volume.">
        <PremiumBarChartV35 rows={topServices.map((row) => ({ label: row.serviceName, value: row.performedCount, meta: `${formatReportCurrency(row.billedRevenueCents)} billed` }))} valueLabel="Performed treatments" ariaLabel="Most availed services" />
      </AnalyticsCard>
      <AnalyticsCard eyebrow="Appointment demand" title="Busiest days" description="Appointment volume by weekday from recorded scheduling activity.">
        <PremiumBarChartV35 rows={snapshot.appointments.busiestDays.map((row) => ({ label: row.day, value: row.count }))} valueLabel="Appointments" ariaLabel="Busiest appointment days" />
      </AnalyticsCard>
      <AnalyticsCard eyebrow="Appointment demand" title="Busiest hours" description="Recorded appointment concentration by start hour.">
        <PremiumBarChartV35 rows={snapshot.appointments.busiestHours.slice(0, 8).map((row) => ({ label: row.hour, value: row.count }))} valueLabel="Appointments" ariaLabel="Busiest appointment hours" />
      </AnalyticsCard>
      <AnalyticsCard eyebrow="Collections mix" title="Payment methods" description="Completed collections grouped by recorded payment method.">
        <PremiumBarChartV35 rows={paymentMix.map((row) => ({ label: row.method.replaceAll('_', ' '), value: row.totalCents }))} valueLabel="Collections" formatter={formatReportCurrency} ariaLabel="Collections by payment method" />
      </AnalyticsCard>
      <AnalyticsCard eyebrow="Operating costs" title="Expenses by category" description="Recorded operating costs by expense category.">
        <PremiumBarChartV35 rows={topExpenses.map((row) => ({ label: row.categoryName, value: row.totalCents, meta: `${row.count} record${row.count === 1 ? '' : 's'}` }))} valueLabel="Expenses" formatter={formatReportCurrency} ariaLabel="Expenses by category" />
      </AnalyticsCard>
    </div>
  </section>
}
