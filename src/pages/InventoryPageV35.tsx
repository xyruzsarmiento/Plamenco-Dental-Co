import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Boxes, LoaderCircle, PackageCheck, PackageX } from 'lucide-react'
import { PremiumBarChartV35 } from '../components/ui/PremiumInteractiveChartV35'
import { InventoryValueAnalyticsV56 } from '../components/ui/InventoryValueAnalyticsV56'
import { syncInventoryFromSupabase } from '../features/inventory/inventoryRemoteSync'
import { buildEnterpriseReportSnapshot, formatReportCurrency } from '../features/reports/reportStore'
import { InventoryPageV22 } from './InventoryPageV22'

export function InventoryPageV35() {
  const [syncVersion, setSyncVersion] = useState(0)
  const [syncReady, setSyncReady] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void syncInventoryFromSupabase()
      .then((result) => {
        if (!mounted) return
        setSyncError(null)
        if (result.synced) setSyncVersion((version) => version + 1)
        setSyncReady(true)
      })
      .catch((cause) => {
        if (!mounted) return
        setSyncError(cause instanceof Error ? cause.message : 'Inventory could not be synchronized from the clinic database.')
        setSyncReady(true)
      })
    return () => { mounted = false }
  }, [])

  const snapshot = useMemo(() => {
    void syncVersion
    return buildEnterpriseReportSnapshot({ filters: { preset: 'this_month' } })
  }, [syncVersion])
  const valuationRows = useMemo(() => [...snapshot.inventory.stockRows].sort((a, b) => b.valuationCents - a.valuationCents).slice(0, 8), [snapshot])
  const consumptionRows = snapshot.inventory.consumption.slice(0, 8)
  const stockHealth = [
    { label: 'Active items', value: snapshot.inventory.activeItems, detail: 'Tracked catalogue items', icon: Boxes, tone: 'normal' },
    { label: 'Low stock', value: snapshot.inventory.lowStockItems, detail: 'At or below reorder level', icon: AlertTriangle, tone: 'warning' },
    { label: 'Out of stock', value: snapshot.inventory.outOfStockItems, detail: 'Require replenishment', icon: PackageX, tone: 'danger' },
    { label: 'Expiring soon', value: snapshot.inventory.expiringSoon, detail: 'Inside the expiry warning window', icon: PackageCheck, tone: 'info' },
  ]

  if (!syncReady) {
    return <section className="inventory35-shell"><div className="analytics35-card" role="status"><header><span>Inventory database</span><h3>Loading current inventory</h3><p>Synchronizing items, suppliers, purchase orders and stock counts before inventory actions are enabled.</p></header><div className="inventory-v22-empty"><LoaderCircle size={28} className="spin" /><p>Please wait while the current clinic inventory is loaded.</p></div></div></section>
  }

  return <section className="inventory35-shell">
    {syncError && <div className="inventory-v22-alert" role="alert">{syncError}</div>}
    <InventoryPageV22 key={syncVersion} />

    <section className="analytics35-section-head inventory35-insights-head">
      <div><span>Inventory intelligence</span><h2>Inventory insights</h2><p>Supporting analytics are kept below the operational workspace so stock actions and day-to-day controls remain the primary focus.</p></div>
    </section>

    <div className="analytics35-grid inventory35-analytics">
      <section className="analytics35-card inventory35-stock-health">
        <header><span>Stock health</span><h3>Risk overview</h3><p>Current recorded stock condition across the inventory dataset.</p></header>
        <div className="inventory35-health-grid">
          {stockHealth.map((item) => {
            const Icon = item.icon
            return <article key={item.label} className={`inventory35-health-card tone-${item.tone}`} tabIndex={0} title={`${item.label}: ${item.value}`}>
              <i><Icon size={17} /></i><div><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></div>
            </article>
          })}
        </div>
      </section>
      <section className="analytics35-card inventory56-value-card"><header><span>Inventory valuation</span><h3>Highest-value stock positions</h3><p>{formatReportCurrency(snapshot.inventory.inventoryValuationCents)} total recorded valuation. Hover or focus a position for exact details.</p></header><InventoryValueAnalyticsV56 rows={valuationRows.map((row) => ({ label: row.itemName, valuationCents: row.valuationCents, quantityOnHand: row.quantityOnHand, branchName: row.branchName, valueLabel: formatReportCurrency(row.valuationCents) }))} /></section>
      <section className="analytics35-card"><header><span>Usage intelligence</span><h3>Most consumed items</h3><p>Actual stock-out consumption from recorded inventory movements.</p></header><PremiumBarChartV35 rows={consumptionRows.map((row) => ({ label: row.itemName, value: row.quantity, meta: row.branchName }))} valueLabel="Quantity consumed" ariaLabel="Most consumed inventory items" /></section>
      <section className="analytics35-card"><header><span>Purchasing</span><h3>Supplier purchasing</h3><p>{formatReportCurrency(snapshot.inventory.purchaseTotalCents)} recorded purchases this month.</p></header><PremiumBarChartV35 rows={snapshot.inventory.supplierTotals.slice(0, 8).map((row) => ({ label: row.supplierName, value: row.totalCents, meta: `${row.receipts} receipt${row.receipts === 1 ? '' : 's'}` }))} valueLabel="Purchases" formatter={formatReportCurrency} ariaLabel="Purchases by supplier" /></section>
    </div>
  </section>
}
