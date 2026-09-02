import { AlertTriangle, ArrowRightLeft, Boxes, Building2, ChevronRight, CircleDollarSign, ClipboardCheck, ClipboardList, Package, PackageCheck, PackageX, PencilLine, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Pagination, Skeleton, SkeletonCard, SkeletonList, SkeletonText } from '../components/ui/DesignSystem'
import { ReportRankedBarsV54 } from '../components/ui/ReportsAnalyticsV54'
import { useBranchContext } from '../features/branches/BranchContext'
import { getStoredBranches } from '../features/branches/branchStore'
import { InventoryActionModal, type InventoryDialog } from '../features/inventory/InventoryActionModal'
import { refreshInventoryOperationalCaches } from '../features/inventory/inventoryPersistence'
import { getBranchInventory, getInventoryItems, getInventoryUnits, getPurchaseOrders, getStockCounts, getStockStatus, getStockTransfers, getSuppliers } from '../features/inventory/inventoryStore'
import { buildEnterpriseReportSnapshot, formatReportCurrency } from '../features/reports/reportStore'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import '../styles/internal-inventory-branch-v121.css'
import { InventoryBranchWorkspaceV121 } from './InventoryBranchWorkspaceV121'

function unitLabel(unitId: string) {
  const unit = getInventoryUnits().find((entry) => entry.id === unitId)
  return unit?.abbreviation ?? unitId
}

const CATALOG_PAGE_SIZE = 6
const CHART_PAGE_SIZE = 8

function InventoryWorkspaceSkeleton() {
  return <section className="inventory56-page inv121-page inventory56-skeleton" aria-busy="true" aria-label="Loading inventory workspace">
    <SkeletonCard className="inventory56-skeleton-hero"><Skeleton width={190} height={12}/><Skeleton width="42%" height={32} radius={12}/><SkeletonText lines={2} widths={['64%','46%']}/></SkeletonCard>
    <div className="inventory56-skeleton-kpis">{Array.from({length:4},(_,index)=><SkeletonCard key={index} compact />)}</div>
    <SkeletonCard className="inventory56-skeleton-toolbar" compact><Skeleton width="100%" height={42} radius={14}/><Skeleton width="100%" height={42} radius={14}/></SkeletonCard>
    <SkeletonCard><Skeleton width="24%" height={14}/><SkeletonList items={6} withAvatar /></SkeletonCard>
  </section>
}

function labelize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

export function InventoryPageV56() {
  const {
    activeBranch,
    activeBranchId,
    availableBranches,
    authorizedBranchIds,
    hasBranchAccess,
    isAllBranchesMode,
    isLoading: branchScopeLoading,
    setActiveBranch,
  } = useBranchContext()
  const inventoryRequestRef = useRef(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [reloadRequest, setReloadRequest] = useState(0)
  const [inventoryLoading, setInventoryLoading] = useState(isSupabaseConfigured)
  const [inventoryError, setInventoryError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<InventoryDialog | null>(null)
  const [catalogPage, setCatalogPage] = useState(1)
  const [valuationPage, setValuationPage] = useState(1)
  const snapshot = useMemo(() => { void refreshKey; return buildEnterpriseReportSnapshot({ filters: { preset: 'this_month' } }) }, [refreshKey])
  const items = useMemo(() => { void refreshKey; return getInventoryItems().filter((item) => item.status === 'active') }, [refreshKey])
  const stocks = useMemo(() => { void refreshKey; return getBranchInventory() }, [refreshKey])
  const suppliers = useMemo(() => { void refreshKey; return getSuppliers() }, [refreshKey])
  const branches = useMemo(() => { void refreshKey; return getStoredBranches() }, [refreshKey])
  const purchaseOrders = useMemo(() => { void refreshKey; return getPurchaseOrders() }, [refreshKey])
  const transfers = useMemo(() => { void refreshKey; return getStockTransfers() }, [refreshKey])
  const stockCounts = useMemo(() => { void refreshKey; return getStockCounts() }, [refreshKey])
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches])
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const inventoryBranchIds = useMemo(() => {
    if (isAllBranchesMode) return authorizedBranchIds
    return activeBranchId ? [activeBranchId] : []
  }, [activeBranchId, authorizedBranchIds, isAllBranchesMode])
  const inventoryScopeSignature = `${isAllBranchesMode ? 'all' : activeBranchId ?? 'none'}:${inventoryBranchIds.slice().sort().join(',')}:${reloadRequest}`

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || branchScopeLoading || !inventoryBranchIds.length) {
      setInventoryLoading(false)
      return undefined
    }
    const requestId = inventoryRequestRef.current + 1
    inventoryRequestRef.current = requestId
    setInventoryLoading(true)
    setInventoryError(null)
    void refreshInventoryOperationalCaches({ branchIds: isAllBranchesMode ? undefined : inventoryBranchIds })
      .then(() => {
        if (inventoryRequestRef.current !== requestId) return
        setRefreshKey((current) => current + 1)
      })
      .catch((cause) => {
        if (inventoryRequestRef.current !== requestId) return
        const message = cause instanceof Error ? cause.message : 'Inventory could not be loaded from the database.'
        console.error('[inventory load]', cause)
        setInventoryError(message)
      })
      .finally(() => {
        if (inventoryRequestRef.current === requestId) setInventoryLoading(false)
      })
    return undefined
  }, [branchScopeLoading, inventoryBranchIds, inventoryScopeSignature, isAllBranchesMode])

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
  const valuationSource = [...snapshot.inventory.stockRows].sort((a, b) => b.valuationCents - a.valuationCents)
  const catalogPageCount = Math.max(1, Math.ceil(items.length / CATALOG_PAGE_SIZE))
  const valuationPageCount = Math.max(1, Math.ceil(valuationSource.length / CHART_PAGE_SIZE))
  const visibleCatalogItems = items.slice((Math.min(catalogPage, catalogPageCount) - 1) * CATALOG_PAGE_SIZE, Math.min(catalogPage, catalogPageCount) * CATALOG_PAGE_SIZE)
  const valuationRows = valuationSource.slice((Math.min(valuationPage, valuationPageCount) - 1) * CHART_PAGE_SIZE, Math.min(valuationPage, valuationPageCount) * CHART_PAGE_SIZE).map((row) => ({
    label: row.itemName,
    value: row.valuationCents,
    displayValue: formatReportCurrency(row.valuationCents),
    meta: `${row.quantityOnHand} on hand - ${row.branchName}`,
  }))
  const comparisonBranches = availableBranches.length ? availableBranches : branches
  const branchSummaries = comparisonBranches.map((branch) => {
    const branchStocks = stocks.filter((stock) => stock.branchId === branch.id)
    const stockRows = branchStocks.map((stock) => ({ stock, item: itemMap.get(stock.itemId) })).filter((row) => row.item)
    const lowStock = branchStocks.filter((stock) => getStockStatus(stock) === 'low_stock').length
    const outOfStock = branchStocks.filter((stock) => getStockStatus(stock) === 'out_of_stock').length
    const valueCents = branchStocks.reduce((sum, stock) => sum + Number(stock.quantityOnHand || 0) * Number(stock.averageUnitCostCents || 0), 0)
    const pendingOrders = purchaseOrders.filter((order) => order.branchId === branch.id && ['ordered', 'partially_received'].includes(order.status)).length
    const openCounts = stockCounts.filter((count) => count.branchId === branch.id && ['draft', 'reviewed'].includes(count.status)).length
    return {
      branch,
      itemCount: stockRows.length,
      lowStock,
      outOfStock,
      valueCents,
      pendingOrders,
      openCounts,
    }
  })
  const lowStockAlerts = stocks
    .filter((stock) => ['low_stock', 'out_of_stock'].includes(getStockStatus(stock)))
    .slice(0, 8)
  const allLowStock = stocks.filter((stock) => getStockStatus(stock) === 'low_stock').length
  const allOutOfStock = stocks.filter((stock) => getStockStatus(stock) === 'out_of_stock').length
  const allPendingTransfers = transfers.filter((transfer) => ['draft', 'in_transit'].includes(transfer.status))
  const allPendingOrders = purchaseOrders.filter((order) => ['ordered', 'partially_received'].includes(order.status))
  const allOpenCounts = stockCounts.filter((count) => ['draft', 'reviewed'].includes(count.status))
  const pendingTransfers = allPendingTransfers.slice(0, 6)
  const pendingOrders = allPendingOrders.slice(0, 6)

  useEffect(() => {
    setCatalogPage((page) => Math.min(page, catalogPageCount))
    setValuationPage((page) => Math.min(page, valuationPageCount))
  }, [catalogPageCount, valuationPageCount])

  function refresh() {
    if (isSupabaseConfigured && supabase) setReloadRequest((current) => current + 1)
    else setRefreshKey((current) => current + 1)
  }

  if (branchScopeLoading || inventoryLoading) {
    return <InventoryWorkspaceSkeleton />
  }

  if (inventoryError) {
    return <section className="inventory56-page"><div className="inventory56-no-branch" role="alert"><AlertTriangle size={28}/><h2>Inventory could not be loaded</h2><p>{inventoryError}</p><Button onClick={refresh}>Retry</Button></div></section>
  }

  if (!isAllBranchesMode && (!hasBranchAccess || !activeBranch || !activeBranchId)) {
    return <section className="inventory56-page"><div className="inventory56-no-branch" role="alert"><Building2 size={28}/><h2>No inventory branch assigned</h2><p>This account has no active clinic branch assignment. Inventory operations stay unavailable until an authorized branch is assigned.</p></div></section>
  }

  const inventoryCacheKey = `inventory:${isAllBranchesMode ? 'all' : activeBranchId}:${authorizedBranchIds.slice().sort().join(',')}`

  if (!isAllBranchesMode && activeBranch) {
    return <section className="inventory56-page">
      <InventoryBranchWorkspaceV121
        key={inventoryCacheKey}
        activeBranch={activeBranch}
        availableBranches={availableBranches}
        cacheKey={inventoryCacheKey}
      />
    </section>
  }

  return <section className="inventory56-page" data-inventory-cache-key={inventoryCacheKey}>
    <div className="inventory56-scope-banner" role="note">
      <Building2 size={18}/>
      <div><strong>All Branches · comparison workspace</strong><span>Clinic-wide totals are shown below. Branch-owned actions must explicitly choose a destination/source branch before saving. Switch to Pulilan or Plaridel for normal day-to-day stock operations.</span></div>
    </div>

    <header className="inventory56-all-hero">
      <div>
        <span>All branches inventory</span>
        <h1>Inventory overview</h1>
        <p>Compare branch stock health, purchasing pressure and pending movement. Open a branch workspace to make stock changes.</p>
      </div>
      <div className="inventory56-all-hero-meta">
        <span><Building2 size={15}/> {comparisonBranches.length} active locations</span>
        <strong>{formatReportCurrency(snapshot.inventory.inventoryValuationCents)}</strong>
        <small>recorded inventory value</small>
      </div>
    </header>

    <section className="inventory56-executive-strip" aria-label="All branches inventory summary">
      <article><span>Active branches</span><strong>{comparisonBranches.length}</strong><small>locations in scope</small></article>
      <article><span>Stock positions</span><strong>{stocks.length.toLocaleString('en-PH')}</strong><small>branch item records</small></article>
      <article className={allLowStock ? 'tone-warning' : ''}><span>Low stock</span><strong>{allLowStock}</strong><small>needs review</small></article>
      <article className={allOutOfStock ? 'tone-danger' : ''}><span>Out of stock</span><strong>{allOutOfStock}</strong><small>replenish soon</small></article>
      <article><span>Pending orders</span><strong>{allPendingOrders.length}</strong><small>awaiting receipt</small></article>
      <article><span>Movement queue</span><strong>{allPendingTransfers.length + allOpenCounts.length}</strong><small>transfers and counts</small></article>
    </section>

    <section className="inventory56-branch-grid" aria-label="Branch inventory comparison">
      {branchSummaries.map((summary) => <article key={summary.branch.id} className="inventory56-branch-card">
        <header>
          <span><Building2 size={16}/></span>
          <div><h2>{summary.branch.name}</h2><p>{summary.branch.city || summary.branch.code}</p></div>
        </header>
        <div className="inventory56-branch-stats">
          <div><span>Items</span><strong>{summary.itemCount}</strong></div>
          <div className={summary.lowStock ? 'is-warning' : ''}><span>Low</span><strong>{summary.lowStock}</strong></div>
          <div className={summary.outOfStock ? 'is-danger' : ''}><span>Out</span><strong>{summary.outOfStock}</strong></div>
          <div><span>Value</span><strong>{formatReportCurrency(summary.valueCents)}</strong></div>
        </div>
        <footer>
          <span>{summary.pendingOrders} pending orders · {summary.openCounts} open counts</span>
          <Button size="sm" variant="secondary" icon={<ChevronRight size={14}/>} onClick={() => setActiveBranch(summary.branch.id)}>Open workspace</Button>
        </footer>
      </article>)}
    </section>

    <section className="inventory56-overview-grid" aria-label="All branches inventory operations">
      <article className="inventory56-overview-card">
        <header><div><span>Stock risk</span><h2>Low and out-of-stock items</h2></div><AlertTriangle size={18}/></header>
        <div className="inventory56-overview-list">
          {lowStockAlerts.length ? lowStockAlerts.map((stock) => {
            const item = itemMap.get(stock.itemId)
            const status = getStockStatus(stock)
            return <div key={stock.id} className="inventory56-alert-row">
              <span className={status === 'out_of_stock' ? 'is-danger' : 'is-warning'}><PackageX size={15}/></span>
              <div><strong>{item?.name ?? stock.itemId}</strong><small>{branchMap.get(stock.branchId) ?? stock.branchId} · {labelize(status)}</small></div>
              <b>{Number(stock.quantityOnHand || 0).toLocaleString('en-PH')} {item ? unitLabel(item.unitId) : ''}</b>
            </div>
          }) : <p className="inventory56-calm-empty">No low-stock or out-of-stock records across active branches.</p>}
        </div>
      </article>

      <article className="inventory56-overview-card">
        <header><div><span>Purchasing</span><h2>Pending purchase orders</h2></div><ClipboardList size={18}/></header>
        <div className="inventory56-overview-list">
          {pendingOrders.length ? pendingOrders.map((order) => <div key={order.id} className="inventory56-alert-row">
            <span><ClipboardList size={15}/></span>
            <div><strong>{order.poNumber}</strong><small>{branchMap.get(order.branchId) ?? order.branchId} · {labelize(order.status)}</small></div>
            <b>{formatReportCurrency(order.totalCents)}</b>
          </div>) : <p className="inventory56-calm-empty">No pending purchase orders need attention.</p>}
        </div>
      </article>

      <article className="inventory56-overview-card">
        <header><div><span>Movements</span><h2>Transfer queue</h2></div><ArrowRightLeft size={18}/></header>
        <div className="inventory56-overview-list">
          {pendingTransfers.length ? pendingTransfers.map((transfer) => <div key={transfer.id} className="inventory56-alert-row">
            <span><ArrowRightLeft size={15}/></span>
            <div><strong>{transfer.transferNumber}</strong><small>{branchMap.get(transfer.fromBranchId) ?? transfer.fromBranchId} to {branchMap.get(transfer.toBranchId) ?? transfer.toBranchId}</small></div>
            <b>{labelize(transfer.status)}</b>
          </div>) : <p className="inventory56-calm-empty">No branch transfers are waiting.</p>}
        </div>
      </article>

      <article className="inventory56-overview-card">
        <header><div><span>Management</span><h2>Operations snapshot</h2></div><ClipboardCheck size={18}/></header>
        <div className="inventory56-snapshot-stack">
          <div><span>Active suppliers</span><strong>{suppliers.filter((supplier) => supplier.status === 'active').length}</strong></div>
          <div><span>Open stock counts</span><strong>{stockCounts.filter((count) => ['draft', 'reviewed'].includes(count.status)).length}</strong></div>
          <div><span>Pending transfers</span><strong>{transfers.filter((transfer) => ['draft', 'in_transit'].includes(transfer.status)).length}</strong></div>
          <div><span>Catalog items</span><strong>{items.length}</strong></div>
        </div>
      </article>
    </section>

    <section className="inventory56-maintenance" aria-label="Inventory catalog maintenance">
      <header className="inventory56-section-head">
        <div><span>Global catalog controls</span><h2>Edit or remove inventory items</h2><p>The item catalog is clinic-wide. Quantity changes remain branch-owned and must continue through Stock In, Stock Out, Adjust, receiving, transfers, or stock counts.</p></div>
        <div className="inventory56-head-count"><Package size={18}/><strong>{items.length}</strong><span>active items</span></div>
      </header>
      {items.length ? <><div className="inventory56-maintenance-grid">{visibleCatalogItems.map((item) => {
        const onHand = stocks.filter((stock) => stock.itemId === item.id).reduce((sum, stock) => sum + stock.quantityOnHand, 0)
        const supplier = suppliers.find((entry) => entry.id === item.defaultSupplierId)
        return <article key={item.id} className="inventory56-maintenance-card">
          <div className="inventory56-maintenance-icon"><Package size={19}/></div>
          <div className="inventory56-maintenance-copy"><span>{item.itemCode}</span><h3>{item.name}</h3><p>{item.sku ? `Stock code ${item.sku}` : 'No optional stock code'} · {item.brand || 'No brand'}</p><div><span><strong>{onHand.toLocaleString('en-PH')}</strong> {unitLabel(item.unitId)} clinic-wide</span><span>{supplier?.name || 'No default supplier'}</span></div></div>
          <div className="inventory56-maintenance-actions"><Button size="sm" variant="secondary" icon={<PencilLine size={14}/>} onClick={() => setDialog({ type: 'edit_item', item })}>Edit</Button><Button size="sm" variant="ghost" icon={<Trash2 size={14}/>} onClick={() => setDialog({ type: 'remove_item', item })}>Remove</Button></div>
        </article>
      })}</div><Pagination page={catalogPage} pageCount={catalogPageCount} totalItems={items.length} pageSize={CATALOG_PAGE_SIZE} onPageChange={setCatalogPage} label="Catalog control pages" /></> : <div className="inventory56-empty"><Package size={24}/><strong>No active inventory items</strong><span>Add an item from the Inventory Control Center to start tracking supplies.</span></div>}
    </section>

    <section className="inventory56-intelligence" aria-label="Inventory intelligence">
      <header className="inventory56-section-head"><div><span>All-branch inventory intelligence</span><h2>Stock health and purchasing performance</h2><p>Clinic-wide comparison analytics. Use a branch workspace for operational stock changes.</p></div><div className="inventory56-value"><CircleDollarSign size={18}/><span>Recorded valuation</span><strong>{formatReportCurrency(snapshot.inventory.inventoryValuationCents)}</strong></div></header>

      <div className="inventory56-risk-card">
        <div className="inventory56-card-heading"><div><span>Stock health</span><h3>Risk overview</h3><p>Current recorded stock condition across all clinic branches.</p></div></div>
        <div className="inventory56-risk-grid">{risk.map((item) => { const Icon = item.icon; return <article key={item.label} className={`inventory56-risk-item tone-${item.tone}`}><i><Icon size={18}/></i><div><span>{item.label}</span><strong>{item.value}</strong><small>{item.helper}</small></div></article> })}</div>
      </div>

      <div className="inventory56-chart-grid">
        <article className="inventory56-chart-card"><header><span>Usage intelligence</span><h3>Most consumed items</h3><p>Actual stock-out consumption from recorded inventory movements.</p></header><ReportRankedBarsV54 rows={consumptionRows} valueLabel="Consumed" totalLabel="Total consumed" totalDisplay={consumptionRows.reduce((sum, row) => sum + row.value, 0).toLocaleString('en-PH')} emptyLabel="No recorded inventory consumption this month." ariaLabel="Most consumed inventory items" /></article>
        <article className="inventory56-chart-card"><header><span>Purchasing</span><h3>Supplier purchasing</h3><p>Recorded purchase value grouped by supplier this month.</p></header><ReportRankedBarsV54 rows={supplierRows} valueLabel="Purchases" totalLabel="Purchase total" totalDisplay={formatReportCurrency(snapshot.inventory.purchaseTotalCents)} emptyLabel="No recorded supplier purchases this month." ariaLabel="Purchases by supplier" /></article>
        <article className="inventory56-chart-card is-wide"><header><span>Inventory valuation</span><h3>Highest-value stock positions</h3><p>Recorded on-hand value by item and branch.</p></header><ReportRankedBarsV54 rows={valuationRows} valueLabel="Value" totalLabel="Inventory value" totalDisplay={formatReportCurrency(snapshot.inventory.inventoryValuationCents)} emptyLabel="No inventory valuation is available yet." ariaLabel="Highest value inventory positions" /><Pagination page={valuationPage} pageCount={valuationPageCount} totalItems={valuationSource.length} pageSize={CHART_PAGE_SIZE} onPageChange={setValuationPage} label="Inventory valuation pages" /></article>
      </div>
    </section>

    {dialog && <InventoryActionModal dialog={dialog} branches={branches} onClose={() => setDialog(null)} onSuccess={refresh} />}
  </section>
}
