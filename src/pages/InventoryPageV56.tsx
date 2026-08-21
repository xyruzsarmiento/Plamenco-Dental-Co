import { AlertTriangle, Boxes, CircleDollarSign, Package, PackageCheck, PackageX, PencilLine, Trash2, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { ReportRankedBarsV54 } from '../components/ui/ReportsAnalyticsV54'
import { getStoredBranches } from '../features/branches/branchStore'
import { InventoryActionModal, type InventoryDialog } from '../features/inventory/InventoryActionModal'
import { getBranchInventory, getInventoryItems, getInventoryUnits, getSuppliers } from '../features/inventory/inventoryStore'
import { buildEnterpriseReportSnapshot, formatReportCurrency } from '../features/reports/reportStore'
import { InventoryPageV22 } from './InventoryPageV22'

function unitLabel(unitId: string) {
  const unit = getInventoryUnits().find((entry) => entry.id === unitId)
  return unit?.abbreviation ?? unitId
}

export function InventoryPageV56() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [dialog, setDialog] = useState<InventoryDialog | null>(null)
  const snapshot = useMemo(() => { void refreshKey; return buildEnterpriseReportSnapshot({ filters: { preset: 'this_month' } }) }, [refreshKey])
  const items = useMemo(() => { void refreshKey; return getInventoryItems().filter((item) => item.status === 'active') }, [refreshKey])
  const stocks = useMemo(() => { void refreshKey; return getBranchInventory() }, [refreshKey])
  const suppliers = useMemo(() => { void refreshKey; return getSuppliers() }, [refreshKey])
  const branches = useMemo(() => { void refreshKey; return getStoredBranches() }, [refreshKey])

  const risk = [
    { label: 'Active items', value: snapshot.inventory.activeItems, helper: 'Tracked catalog items', icon: Boxes, tone: 'normal' },
    { label: 'Low stock', value: snapshot.inventory.lowStockItems, helper: 'At or below reorder level', icon: AlertTriangle, tone: 'warning' },
    { label: 'Out of stock', value: snapshot.inventory.outOfStockItems, helper: 'Need replenishment', icon: PackageX, tone: 'danger' },
    { label: 'Expiring soon', value: snapshot.inventory.expiringSoon, helper: 'Inside warning window', icon: PackageCheck, tone: 'info' },
  ]

  const consumptionRows = snapshot.inventory.consumption.slice(0, 8).map((row) => ({
    label: row.itemName,
    value: row.quantity,
    displayValue: row.quantity.toLocaleString('en-PH'),
    meta: row.branchName,
  }))
  const supplierRows = snapshot.inventory.supplierTotals.slice(0, 8).map((row) => ({
    label: row.supplierName,
    value: row.totalCents,
    displayValue: formatReportCurrency(row.totalCents),
    meta: `${row.receipts} receipt${row.receipts === 1 ? '' : 's'}`,
  }))
  const valuationRows = [...snapshot.inventory.stockRows].sort((a, b) => b.valuationCents - a.valuationCents).slice(0, 8).map((row) => ({
    label: row.itemName,
    value: row.valuationCents,
    displayValue: formatReportCurrency(row.valuationCents),
    meta: `${row.quantityOnHand} on hand · ${row.branchName}`,
  }))

  function refresh() {
    setRefreshKey((current) => current + 1)
  }

  return <section className="inventory56-page">
    <InventoryPageV22 key={refreshKey} />

    <section className="inventory56-maintenance" aria-label="Inventory catalog maintenance">
      <header className="inventory56-section-head">
        <div><span>Catalog controls</span><h2>Edit or remove inventory items</h2><p>Correct catalog mistakes without changing quantities directly. Quantity changes should continue through Stock In, Stock Out, Adjust, receiving, transfers, or stock counts so the ledger stays auditable.</p></div>
        <div className="inventory56-head-count"><Package size={18}/><strong>{items.length}</strong><span>active items</span></div>
      </header>
      {items.length ? <div className="inventory56-maintenance-grid">{items.map((item) => {
        const onHand = stocks.filter((stock) => stock.itemId === item.id).reduce((sum, stock) => sum + stock.quantityOnHand, 0)
        const supplier = suppliers.find((entry) => entry.id === item.defaultSupplierId)
        return <article key={item.id} className="inventory56-maintenance-card">
          <div className="inventory56-maintenance-icon"><Package size={19}/></div>
          <div className="inventory56-maintenance-copy"><span>{item.itemCode}</span><h3>{item.name}</h3><p>{item.sku ? `Stock code ${item.sku}` : 'No optional stock code'} · {item.brand || 'No brand'}</p><div><span><strong>{onHand.toLocaleString('en-PH')}</strong> {unitLabel(item.unitId)} on hand</span><span>{supplier?.name || 'No default supplier'}</span></div></div>
          <div className="inventory56-maintenance-actions"><Button size="sm" variant="secondary" icon={<PencilLine size={14}/>} onClick={() => setDialog({ type: 'edit_item', item })}>Edit</Button><Button size="sm" variant="ghost" icon={<Trash2 size={14}/>} onClick={() => setDialog({ type: 'archive_item', item })}>Remove</Button></div>
        </article>
      })}</div> : <div className="inventory56-empty"><Package size={24}/><strong>No active inventory items</strong><span>Add an item from the Inventory Control Center to start tracking supplies.</span></div>}
    </section>

    <section className="inventory56-intelligence" aria-label="Inventory intelligence">
      <header className="inventory56-section-head"><div><span>Inventory intelligence</span><h2>Stock health and purchasing performance</h2><p>Recorded inventory activity shown as supporting analytics below the day-to-day inventory workspace.</p></div><div className="inventory56-value"><CircleDollarSign size={18}/><span>Recorded valuation</span><strong>{formatReportCurrency(snapshot.inventory.inventoryValuationCents)}</strong></div></header>

      <div className="inventory56-risk-card">
        <div className="inventory56-card-heading"><div><span>Stock health</span><h3>Risk overview</h3><p>Current recorded stock condition across the clinic inventory.</p></div></div>
        <div className="inventory56-risk-grid">{risk.map((item) => { const Icon = item.icon; return <article key={item.label} className={`inventory56-risk-item tone-${item.tone}`}><i><Icon size={18}/></i><div><span>{item.label}</span><strong>{item.value}</strong><small>{item.helper}</small></div></article> })}</div>
      </div>

      <div className="inventory56-chart-grid">
        <article className="inventory56-chart-card"><header><span>Usage intelligence</span><h3>Most consumed items</h3><p>Actual stock-out consumption from recorded inventory movements.</p></header><ReportRankedBarsV54 rows={consumptionRows} valueLabel="Consumed" totalLabel="Total consumed" totalDisplay={consumptionRows.reduce((sum, row) => sum + row.value, 0).toLocaleString('en-PH')} emptyLabel="No recorded inventory consumption this month." ariaLabel="Most consumed inventory items" /></article>
        <article className="inventory56-chart-card"><header><span>Purchasing</span><h3>Supplier purchasing</h3><p>Recorded purchase value grouped by supplier this month.</p></header><ReportRankedBarsV54 rows={supplierRows} valueLabel="Purchases" totalLabel="Purchase total" totalDisplay={formatReportCurrency(snapshot.inventory.purchaseTotalCents)} emptyLabel="No recorded supplier purchases this month." ariaLabel="Purchases by supplier" /></article>
        <article className="inventory56-chart-card is-wide"><header><span>Inventory valuation</span><h3>Highest-value stock positions</h3><p>Recorded on-hand value by item and branch.</p></header><ReportRankedBarsV54 rows={valuationRows} valueLabel="Value" totalLabel="Inventory value" totalDisplay={formatReportCurrency(snapshot.inventory.inventoryValuationCents)} emptyLabel="No inventory valuation is available yet." ariaLabel="Highest value inventory positions" /></article>
      </div>
    </section>

    {dialog && <InventoryActionModal dialog={dialog} branches={branches} onClose={() => setDialog(null)} onSuccess={refresh} />}
  </section>
}
