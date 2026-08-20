import { useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowRightLeft,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Package,
  PackageCheck,
  PackagePlus,
  Plus,
  Search,
  Truck,
  Warehouse,
} from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { usePermissions } from '../features/auth/permissions'
import { getStoredBranches } from '../features/branches/branchStore'
import { InventoryActionModal, type InventoryDialog } from '../features/inventory/InventoryActionModal'
import {
  dispatchStockTransfer,
  getBranchInventory,
  getBranchStock,
  getExpiryStatus,
  getInventoryBatches,
  getInventoryCategories,
  getInventoryItems,
  getInventoryOverview,
  getInventoryUnits,
  getItemMovements,
  getPurchaseOrders,
  getStockCounts,
  getStockMovements,
  getStockStatus,
  getStockTransfers,
  getSuppliers,
  postStockCountReconciliation,
  receiveStockTransfer,
  reviewStockCount,
  type StockStatus,
} from '../features/inventory/inventoryStore'
import { getCurrentSessionUserName } from '../features/security/security'

type InventoryTab = 'items' | 'movements' | 'suppliers' | 'purchase_orders' | 'transfers' | 'stock_counts'

const tabs: Array<{ key: InventoryTab; label: string }> = [
  { key: 'items', label: 'Items' },
  { key: 'movements', label: 'Movements' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'purchase_orders', label: 'Purchase Orders' },
  { key: 'transfers', label: 'Transfers' },
  { key: 'stock_counts', label: 'Stock Counts' },
]

function currency(cents: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100)
}

function quantity(value: number, unitId: string) {
  const unit = getInventoryUnits().find((entry) => entry.id === unitId)
  return `${value.toLocaleString('en-PH')} ${unit?.abbreviation ?? unitId}`
}

function dateLabel(value?: string) {
  if (!value) return 'Not recorded'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
}

function tone(status: StockStatus | string): 'success' | 'warning' | 'danger' | 'info' {
  if (['in_stock', 'received', 'active', 'posted'].includes(status)) return 'success'
  if (['low_stock', 'partially_received', 'ordered', 'reviewed'].includes(status)) return 'warning'
  if (['out_of_stock', 'expired', 'cancelled'].includes(status)) return 'danger'
  return 'info'
}

function labelize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function InventoryPageV22() {
  const permissions = usePermissions()
  const actor = getCurrentSessionUserName() || 'Clinic user'
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState<InventoryTab>('items')
  const [selectedBranchId, setSelectedBranchId] = useState('all')
  const [categoryId, setCategoryId] = useState('all')
  const [stockStatus, setStockStatus] = useState<'all' | StockStatus>('all')
  const [search, setSearch] = useState('')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<InventoryDialog | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const branches = useMemo(() => { void refreshKey; return getStoredBranches() }, [refreshKey])
  const items = useMemo(() => { void refreshKey; return getInventoryItems() }, [refreshKey])
  const stocks = useMemo(() => { void refreshKey; return getBranchInventory() }, [refreshKey])
  const movements = useMemo(() => { void refreshKey; return getStockMovements() }, [refreshKey])
  const suppliers = useMemo(() => { void refreshKey; return getSuppliers() }, [refreshKey])
  const purchaseOrders = useMemo(() => { void refreshKey; return getPurchaseOrders() }, [refreshKey])
  const transfers = useMemo(() => { void refreshKey; return getStockTransfers() }, [refreshKey])
  const stockCounts = useMemo(() => { void refreshKey; return getStockCounts() }, [refreshKey])
  const categories = useMemo(() => { void refreshKey; return getInventoryCategories() }, [refreshKey])
  const overview = useMemo(() => {
    void refreshKey
    return getInventoryOverview(selectedBranchId === 'all' ? undefined : selectedBranchId)
  }, [refreshKey, selectedBranchId])

  const selectedItem = selectedItemId
    ? items.find((item) => item.id === selectedItemId)
    : items.find((item) => item.status === 'active') ?? items[0]

  const branchName = (id: string) => branches.find((branch) => branch.id === id)?.name ?? id
  const itemName = (id: string) => items.find((item) => item.id === id)?.name ?? id
  const supplierName = (id: string) => suppliers.find((supplier) => supplier.id === id)?.name ?? id

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter((item) => {
      const relatedStocks = stocks.filter((stock) => stock.itemId === item.id && (selectedBranchId === 'all' || stock.branchId === selectedBranchId))
      const supplierLabel = suppliers.find((supplier) => supplier.id === item.defaultSupplierId)?.name ?? ''
      const matchesSearch = !query || [item.name, item.itemCode, item.sku, item.brand, supplierLabel].some((value) => value.toLowerCase().includes(query))
      const matchesCategory = categoryId === 'all' || item.categoryId === categoryId
      const matchesStock = stockStatus === 'all' || (relatedStocks.length ? relatedStocks : [undefined]).some((stock) => getStockStatus(stock) === stockStatus)
      return matchesSearch && matchesCategory && matchesStock
    })
  }, [categoryId, items, search, selectedBranchId, stockStatus, stocks, suppliers])

  function refresh() {
    setRefreshKey((key) => key + 1)
    setActionError(null)
  }

  function runDirectAction(action: () => void) {
    try {
      setActionError(null)
      action()
      refresh()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'The inventory action could not be completed.')
    }
  }

  return (
    <div className="inventory-v22">
      <section className="inventory-v22-hero">
        <div>
          <span className="inventory-v22-kicker">Inventory operations</span>
          <h2>Inventory Control Center</h2>
          <p>Monitor clinic supplies, branch stock, purchasing, transfers and count reconciliation from one operational workspace.</p>
        </div>
        <div className="inventory-v22-hero-actions">
          {permissions.can('inventory.create_item') && <Button icon={<Plus size={16} />} onClick={() => setDialog({ type: 'add_item' })}>Add Item</Button>}
          {permissions.can('suppliers.manage') && <Button variant="secondary" icon={<Truck size={16} />} onClick={() => setDialog({ type: 'add_supplier' })}>Add Supplier</Button>}
          {permissions.canAny(['purchase_orders.create', 'purchases.create']) && <Button variant="secondary" icon={<ClipboardList size={16} />} onClick={() => setDialog({ type: 'purchase_order' })}>Purchase Order</Button>}
          {permissions.can('inventory.adjust') && <Button variant="secondary" icon={<ClipboardCheck size={16} />} onClick={() => setDialog({ type: 'stock_count' })}>Stock Count</Button>}
        </div>
      </section>

      <section className="inventory-v22-metrics">
        <article><span><Package size={16} /> Active items</span><strong>{overview.totalActiveItems}</strong><small>Catalog items available for operations</small></article>
        <article><span><Boxes size={16} /> Low stock</span><strong>{overview.lowStockItems}</strong><small>At or below reorder level</small></article>
        <article><span><PackageCheck size={16} /> Out of stock</span><strong>{overview.outOfStockItems}</strong><small>Branch stock currently at zero</small></article>
        <article><span><Warehouse size={16} /> Expiring soon</span><strong>{overview.expiringSoon}</strong><small>Tracked batches in warning window</small></article>
        <article><span><ClipboardList size={16} /> Pending POs</span><strong>{overview.pendingPurchaseOrders}</strong><small>Ordered or partially received</small></article>
        <article><span><ArrowRightLeft size={16} /> Pending transfers</span><strong>{overview.pendingTransfers}</strong><small>Draft or in transit</small></article>
        <article><span><ClipboardCheck size={16} /> Open counts</span><strong>{overview.openStockCounts}</strong><small>Draft or reviewed sessions</small></article>
        {permissions.can('inventory.view_cost') && <article><span><ArrowDownToLine size={16} /> Inventory value</span><strong>{currency(overview.inventoryValueCents)}</strong><small>Weighted average cost basis</small></article>}
      </section>

      <section className="inventory-v22-command">
        <div className="inventory-v22-tabs" role="tablist" aria-label="Inventory workspace sections">
          {tabs.map((tab) => <button key={tab.key} type="button" className={activeTab === tab.key ? 'is-active' : ''} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>)}
        </div>
        <div className="inventory-v22-filters">
          <label className="inventory-v22-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item, SKU, code, brand or supplier" /></label>
          <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)} aria-label="Filter by branch"><option value="all">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} aria-label="Filter by category"><option value="all">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          <select value={stockStatus} onChange={(event) => setStockStatus(event.target.value as typeof stockStatus)} aria-label="Filter by stock status"><option value="all">All statuses</option><option value="in_stock">In stock</option><option value="low_stock">Low stock</option><option value="out_of_stock">Out of stock</option></select>
        </div>
      </section>

      {actionError && <div className="inventory-v22-alert" role="alert">{actionError}</div>}

      {activeTab === 'items' && (
        <div className="inventory-v22-workspace">
          <section className="inventory-v22-list-panel">
            <header><div><span>Branch inventory</span><h3>{filteredItems.length} items</h3></div><small>{selectedBranchId === 'all' ? 'All authorized branches' : branchName(selectedBranchId)}</small></header>
            {filteredItems.length === 0 ? <div className="inventory-v22-empty"><Package size={28} /><h3>No inventory items found</h3><p>Adjust the filters or create a catalog item to begin tracking stock.</p></div> : (
              <div className="inventory-v22-item-list">
                {filteredItems.map((item) => {
                  const itemStocks = stocks.filter((stock) => stock.itemId === item.id && (selectedBranchId === 'all' || stock.branchId === selectedBranchId))
                  const totalOnHand = itemStocks.reduce((sum, stock) => sum + stock.quantityOnHand, 0)
                  const itemStatus = itemStocks.length ? itemStocks.reduce<StockStatus>((worst, stock) => {
                    const current = getStockStatus(stock)
                    if (current === 'out_of_stock') return 'out_of_stock'
                    if (current === 'low_stock' && worst !== 'out_of_stock') return 'low_stock'
                    return worst
                  }, 'in_stock') : 'out_of_stock'
                  const supplier = suppliers.find((entry) => entry.id === item.defaultSupplierId)
                  return <button key={item.id} type="button" className={`inventory-v22-item-card ${selectedItem?.id === item.id ? 'is-selected' : ''}`} onClick={() => setSelectedItemId(item.id)}>
                    <span className="inventory-v22-item-icon"><Package size={18} /></span>
                    <span className="inventory-v22-item-copy"><span className="inventory-v22-item-title"><strong>{item.name}</strong><Badge tone={tone(itemStatus)}>{labelize(itemStatus)}</Badge></span><span>{item.itemCode} · {item.sku || 'No SKU'}</span><small>{categories.find((entry) => entry.id === item.categoryId)?.name ?? item.categoryId} · {supplier?.name || 'No preferred supplier'}</small></span>
                    <span className="inventory-v22-item-qty"><strong>{quantity(totalOnHand, item.unitId)}</strong><small>{itemStocks.length} branch stock record{itemStocks.length === 1 ? '' : 's'}</small></span>
                  </button>
                })}
              </div>
            )}
          </section>

          <aside className="inventory-v22-detail-panel">
            {!selectedItem ? <div className="inventory-v22-empty"><Boxes size={30} /><h3>Select an inventory item</h3><p>Choose an item to inspect stock, batches and movement history.</p></div> : <>
              <header className="inventory-v22-detail-head"><div><span>Selected inventory item</span><h3>{selectedItem.name}</h3><p>{selectedItem.itemCode} · {selectedItem.sku || 'No SKU'} · {selectedItem.brand || 'No brand'}</p></div><Badge tone={tone(selectedItem.status)}>{labelize(selectedItem.status)}</Badge></header>
              <section className="inventory-v22-detail-grid">
                <article><span>Category</span><strong>{categories.find((entry) => entry.id === selectedItem.categoryId)?.name ?? selectedItem.categoryId}</strong></article>
                <article><span>Unit</span><strong>{getInventoryUnits().find((entry) => entry.id === selectedItem.unitId)?.label ?? selectedItem.unitId}</strong></article>
                <article><span>Batch tracking</span><strong>{selectedItem.trackBatches ? 'Enabled' : 'Off'}</strong></article>
                <article><span>Expiry tracking</span><strong>{selectedItem.trackExpiry ? `${selectedItem.expiryWarningDays} days` : 'Off'}</strong></article>
              </section>
              <section className="inventory-v22-stock-card"><header><div><span>Branch availability</span><h4>Stock position</h4></div></header>{branches.map((branch) => { const stock = getBranchStock(branch.id, selectedItem.id); const status = getStockStatus(stock); return <div className="inventory-v22-stock-row" key={branch.id}><div><strong>{branch.name}</strong><span>Reorder level {stock?.reorderLevel ?? selectedItem.defaultReorderLevel}</span></div><div><Badge tone={tone(status)}>{labelize(status)}</Badge><strong>{quantity(stock?.quantityOnHand ?? 0, selectedItem.unitId)}</strong></div></div> })}</section>
              <section className="inventory-v22-detail-actions">
                {permissions.can('inventory.stock_in') && <Button size="sm" icon={<PackagePlus size={14} />} onClick={() => setDialog({ type: 'stock_in', item: selectedItem })}>Stock In</Button>}
                {permissions.can('inventory.stock_out') && <Button size="sm" variant="secondary" onClick={() => setDialog({ type: 'stock_out', item: selectedItem })}>Stock Out</Button>}
                {permissions.can('inventory.adjust') && <Button size="sm" variant="secondary" onClick={() => setDialog({ type: 'adjust', item: selectedItem })}>Adjust</Button>}
                {permissions.can('inventory.transfer') && <Button size="sm" variant="secondary" icon={<ArrowRightLeft size={14} />} onClick={() => setDialog({ type: 'create_transfer', item: selectedItem })}>Create Transfer</Button>}
              </section>
              <section className="inventory-v22-subgrid">
                <article><header><span>Tracked batches</span><strong>{getInventoryBatches().filter((batch) => batch.itemId === selectedItem.id).length}</strong></header>{getInventoryBatches().filter((batch) => batch.itemId === selectedItem.id).slice(0, 5).map((batch) => <div key={batch.id}><span><strong>{batch.batchNumber}</strong><small>{branchName(batch.branchId)} · {batch.expiryDate || 'No expiry'}</small></span><Badge tone={tone(getExpiryStatus(batch, selectedItem))}>{labelize(getExpiryStatus(batch, selectedItem))}</Badge></div>)}{getInventoryBatches().filter((batch) => batch.itemId === selectedItem.id).length === 0 && <p>No tracked batches for this item.</p>}</article>
                <article><header><span>Recent movement</span><strong>{getItemMovements(selectedItem.id).length}</strong></header>{getItemMovements(selectedItem.id).slice(0, 5).map((movement) => <div key={movement.id}><span><strong>{labelize(movement.movementType)}</strong><small>{branchName(movement.branchId)} · {movement.reason}</small></span><b>{movement.quantityBefore} → {movement.quantityAfter}</b></div>)}{getItemMovements(selectedItem.id).length === 0 && <p>No movement history for this item.</p>}</article>
              </section>
            </>}
          </aside>
        </div>
      )}

      {activeTab === 'movements' && <section className="inventory-v22-data-panel"><header><div><span>Inventory ledger</span><h3>Stock Movements</h3></div><strong>{movements.length}</strong></header>{movements.length === 0 ? <div className="inventory-v22-empty"><ArrowRightLeft size={28} /><h3>No stock movements</h3><p>Posted stock activity will appear here.</p></div> : <div className="inventory-v22-record-list">{movements.map((movement) => <article key={movement.id}><div><strong>{labelize(movement.movementType)}</strong><span>{itemName(movement.itemId)} · {branchName(movement.branchId)}</span><small>{movement.reason} · {movement.performedBy}</small></div><div><span>{movement.quantityBefore} → {movement.quantityAfter}</span><strong>{movement.quantity}</strong></div></article>)}</div>}</section>}

      {activeTab === 'suppliers' && <section className="inventory-v22-data-panel"><header><div><span>Supply network</span><h3>Suppliers</h3></div><strong>{suppliers.length}</strong></header>{suppliers.length === 0 ? <div className="inventory-v22-empty"><Truck size={28} /><h3>No suppliers configured</h3><p>Add a supplier to support purchasing workflows.</p></div> : <div className="inventory-v22-card-grid">{suppliers.map((supplier) => <article key={supplier.id} className="inventory-v22-supplier-card"><div><span className="inventory-v22-item-icon"><Truck size={18} /></span><Badge tone={tone(supplier.status)}>{labelize(supplier.status)}</Badge></div><h4>{supplier.name}</h4><p>{supplier.contactPerson || 'No contact person'}</p><small>{supplier.phone || 'No phone'} · {supplier.email || 'No email'}</small><span>{supplier.address || 'No address recorded'}</span></article>)}</div>}</section>}

      {activeTab === 'purchase_orders' && <section className="inventory-v22-data-panel"><header><div><span>Procurement</span><h3>Purchase Orders</h3></div><strong>{purchaseOrders.length}</strong></header>{purchaseOrders.length === 0 ? <div className="inventory-v22-empty"><ClipboardList size={28} /><h3>No purchase orders</h3><p>Creating an order does not change stock until receiving is posted.</p></div> : <div className="inventory-v22-record-list">{purchaseOrders.map((order) => <article key={order.id}><div><strong>{order.poNumber}</strong><span>{supplierName(order.supplierId)} · {branchName(order.branchId)}</span><small>{order.items.length} lines · {dateLabel(order.orderDate)}</small></div><div><Badge tone={tone(order.status)}>{labelize(order.status)}</Badge><strong>{currency(order.totalCents)}</strong>{permissions.canAny(['purchase_orders.receive', 'purchases.receive']) && !['received', 'cancelled'].includes(order.status) && <Button size="sm" onClick={() => setDialog({ type: 'receive_po', poId: order.id })}>Receive</Button>}</div></article>)}</div>}</section>}

      {activeTab === 'transfers' && <section className="inventory-v22-data-panel"><header><div><span>Branch logistics</span><h3>Stock Transfers</h3></div><strong>{transfers.length}</strong></header>{transfers.length === 0 ? <div className="inventory-v22-empty"><ArrowRightLeft size={28} /><h3>No transfers</h3><p>Create a transfer from an inventory item detail panel.</p></div> : <div className="inventory-v22-record-list">{transfers.map((transfer) => <article key={transfer.id}><div><strong>{transfer.transferNumber}</strong><span>{branchName(transfer.fromBranchId)} → {branchName(transfer.toBranchId)}</span><small>{transfer.items.map((entry) => `${itemName(entry.itemId)} (${entry.quantity})`).join(', ')}</small></div><div><Badge tone={tone(transfer.status)}>{labelize(transfer.status)}</Badge>{permissions.can('inventory.transfer') && transfer.status === 'draft' && <Button size="sm" onClick={() => runDirectAction(() => dispatchStockTransfer(transfer.id, actor))}>Dispatch</Button>}{permissions.can('inventory.receive_transfer') && transfer.status === 'in_transit' && <Button size="sm" onClick={() => runDirectAction(() => receiveStockTransfer(transfer.id, actor))}>Receive</Button>}</div></article>)}</div>}</section>}

      {activeTab === 'stock_counts' && <section className="inventory-v22-data-panel"><header><div><span>Reconciliation</span><h3>Physical Stock Counts</h3></div><strong>{stockCounts.length}</strong></header>{stockCounts.length === 0 ? <div className="inventory-v22-empty"><ClipboardCheck size={28} /><h3>No stock counts</h3><p>Create a count session to compare shelf quantities with the system ledger.</p></div> : <div className="inventory-v22-record-list">{stockCounts.map((count) => { const differences = count.items.filter((entry) => entry.difference !== 0); return <article key={count.id}><div><strong>{count.countNumber}</strong><span>{branchName(count.branchId)} · {dateLabel(count.countDate)}</span><small>{count.items.length} lines · {differences.length} variances</small></div><div><Badge tone={tone(count.status)}>{labelize(count.status)}</Badge>{permissions.can('inventory.adjust') && count.status === 'draft' && count.items[0] && <Button size="sm" variant="secondary" onClick={() => setDialog({ type: 'count_item', countId: count.id, itemId: count.items[0].itemId, currentQuantity: count.items[0].physicalQuantity })}>Count First Item</Button>}{permissions.can('inventory.adjust') && count.status === 'draft' && <Button size="sm" onClick={() => runDirectAction(() => reviewStockCount(count.id, actor))}>Review</Button>}{permissions.can('inventory.adjust') && count.status === 'reviewed' && <Button size="sm" onClick={() => runDirectAction(() => postStockCountReconciliation(count.id, actor))}>Reconcile</Button>}</div></article> })}</div>}</section>}

      {dialog && <InventoryActionModal dialog={dialog} branches={branches} preferredBranchId={selectedBranchId} onClose={() => setDialog(null)} onSuccess={refresh} />}
    </div>
  )
}
