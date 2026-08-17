import { useState, useCallback } from 'react'
import { PageScaffold } from '../components/ui/PageScaffold'
import { FinancialMetrics } from '../features/billing/FinancialMetrics'
import { RevenueChart, PaymentStatusChart } from '../features/billing/AnalyticsCharts'
import { PaymentActivity } from '../features/billing/PaymentActivity'
import { InvoiceManagement } from '../features/billing/InvoiceManagement'
import { PaymentRecorderButton } from '../features/billing/PaymentRecorder'

export function BillingPage() {
  const [refreshKey, setRefreshKey] = useState(0)

  const handlePaymentSuccess = useCallback(() => {
    setRefreshKey((prev) => prev + 1)
  }, [])

  return (
    <PageScaffold
      title="Billing & Payments"
      description="Manage invoices, track payments, and monitor clinic financial activity."
    >
      <div className="billing-page-premium" key={refreshKey}>
        {/* Header with quick action */}
        <div className="billing-header-section">
          <div className="header-content">
            <p className="section-eyebrow">Financial activity</p>
            <p className="section-description">Track all clinic payments and invoice status in real time.</p>
          </div>
          <div className="header-action">
            <PaymentRecorderButton onSuccess={handlePaymentSuccess} />
          </div>
        </div>

        {/* Financial metrics row */}
        <FinancialMetrics />

        {/* Analytics section */}
        <div className="analytics-section">
          <div className="analytics-column">
            <RevenueChart />
          </div>
          <div className="analytics-column">
            <PaymentStatusChart />
          </div>
        </div>

        {/* Payment activity */}
        <PaymentActivity />

        {/* Invoice management */}
        <InvoiceManagement />
      </div>
    </PageScaffold>
  )
}

