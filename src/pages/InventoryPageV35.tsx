import { useMemo } from 'react'
import { PremiumBarChartV35 } from '../components/ui/PremiumInteractiveChartV35'
import { buildEnterpriseReportSnapshot, formatReportCurrency } from '../features/reports/reportStore'
import { InventoryPageV22 } from './InventoryPageV22'

export function InventoryPageV35() {
  const snapshot = useMemo(() => buildEnterpriseReportSnapshot({ filters: { preset: 'this_month' } }), [])
  const valuationRows = useMemo(() => [...snapshot.inventory.stockRows].sort((a, b) => b.valuationCents - a.valuationCents).slice(0, 8), [snapshot])
  const consumptionRows = snapshot.inventory.consumption.slice(0, 8)
  const stockHealth = [
    { label: 'Active items', value: snapshot.inventory.activeItems },
    { label: 'Low stock', value: snapshot.inventory.lowStockItems },
    { label: 'Out of stock', value: snapshot.inventory.outOfStockItems },
    { label: 'Expiring soon', value: snapshot.inventory.expiringSoon },
  ]

  return <section className="inventory35-shell">
    <div className="analytics35-grid inventory35-analytics">
      <section className="analytics35-card"><header><span>Inventory intelligence</span><h3>Stock health</h3><p>Current recorded inventory risk. Hover a bar to inspect the count.</p></header><PremiumBarChartV35 rows={stockHealth} valueLabel="Items" ariaLabel="Inventory stock health" /></section>
      <section className="analytics35-card"><header><span>Inventory valuation</span><h3>Highest-value stock positions</h3><p>{formatReportCurrency(snapshot.inventory.inventoryValuationCents)} total recorded valuation.</p></header><PremiumBarChartV35 rows={valuationRows.map((row) => ({ label: row.itemName, value: row.valuationCents, meta: `${row.quantityOnHand} on hand · ${row.branchName}` }))} valueLabel="Value" formatter={formatReportCurrency} ariaLabel="Highest value inventory positions" /></section>
      <section className="analytics35-card"><header><span>Usage intelligence</span><h3>Most consumed items</h3><p>Actual stock-out consumption from recorded inventory movements.</p></header><PremiumBarChartV35 rows={consumptionRows.map((row) => ({ label: row.itemName, value: row.quantity, meta: row.branchName }))} valueLabel="Quantity consumed" ariaLabel="Most consumed inventory items" /></section>
      <section className="analytics35-card"><header><span>Purchasing</span><h3>Supplier purchasing</h3><p>{formatReportCurrency(snapshot.inventory.purchaseTotalCents)} recorded purchases this month.</p></header><PremiumBarChartV35 rows={snapshot.inventory.supplierTotals.slice(0, 8).map((row) => ({ label: row.supplierName, value: row.totalCents, meta: `${row.receipts} receipt${row.receipts === 1 ? '' : 's'}` }))} valueLabel="Purchases" formatter={formatReportCurrency} ariaLabel="Purchases by supplier" /></section>
    </div>
    <InventoryPageV22 />
  </section>
}
