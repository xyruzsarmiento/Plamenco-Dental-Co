import { useMemo, useState } from 'react'
import { ArrowRightLeft, ClipboardList, PackagePlus, Plus, Search, Truck } from 'lucide-react'
import { PageScaffold } from '../components/ui/PageScaffold'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Select'
import { usePermissions } from '../features/auth/permissions'
import { getStoredBranches } from '../features/branches/branchStore'
import {
  adjustStock,
  createStockCount,
  createStockTransfer,
  createInventoryItem,
  createPurchaseOrder,
  createSupplier,
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
  getStockStatus,
  getSuppliers,
  getStockMovements,
  getStockTransfers,
  receivePurchaseOrder,
  receiveStockTransfer,
  reviewStockCount,
  postStockCountReconciliation,
  stockIn,
  stockOut,
  transferStock,
  updateStockCountItem,
  type InventoryItem,
  type StockStatus,
} from '../features/inventory/inventoryStore'

type InventoryTab = 'items' | 'movements' | 'suppliers' | 'purchase_orders' | 'transfers' | 'stock_counts'

function formatQuantity(value: number, unitId: string) {
  const unit = getInventoryUnits().find((entry) => entry.id === unitId)
  return `${value.toLocaleString('en-PH')} ${unit?.abbreviation ?? unitId}`
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100)
}

function formatDisplayDate(value?: string) {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function branchName(branchId: string) {
  return getStoredBranches().find((branch) => branch.id === branchId)?.name ?? branchId
}

function itemName(itemId: string) {
  return getInventoryItems().find((item) => item.id === itemId)?.name ?? itemId
}

function supplierName(supplierId: string) {
  return getSuppliers().find((supplier) => supplier.id === supplierId)?.name ?? supplierId
}

function statusTone(status: StockStatus | string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'in_stock' || status === 'received' || status === 'active') return 'success'
  if (status === 'low_stock' || status === 'partially_received' || status === 'ordered') return 'warning'
  if (status === 'out_of_stock' || status === 'expired' || status === 'cancelled') return 'danger'
  return 'info'
}

function readNumber(message: string, defaultValue = '1') {
  const value = window.prompt(message, defaultValue)
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function readNonNegativeNumber(message: string, defaultValue = '0') {
  const value = window.prompt(message, defaultValue)
  if (value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function InventoryPage() {
  const permissions = usePermissions()
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState<InventoryTab>('items')
  const [selectedBranchId, setSelectedBranchId] = useState('all')
  const [categoryId, setCategoryId] = useState('all')
  const [stockStatus, setStockStatus] = useState<'all' | StockStatus>('all')
  const [search, setSearch] = useState('')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

  const branches = useMemo(() => {
    void refreshKey
    return getStoredBranches()
  }, [refreshKey])
  const items = useMemo(() => {
    void refreshKey
    return getInventoryItems()
  }, [refreshKey])
  const stocks = useMemo(() => {
    void refreshKey
    return getBranchInventory()
  }, [refreshKey])
  const movements = useMemo(() => {
    void refreshKey
    return getStockMovements()
  }, [refreshKey])
  const suppliers = useMemo(() => {
    void refreshKey
    return getSuppliers()
  }, [refreshKey])
  const purchaseOrders = useMemo(() => {
    void refreshKey
    return getPurchaseOrders()
  }, [refreshKey])
  const transfers = useMemo(() => {
    void refreshKey
    return getStockTransfers()
  }, [refreshKey])
  const stockCounts = useMemo(() => {
    void refreshKey
    return getStockCounts()
  }, [refreshKey])
  const overview = useMemo(() => {
    void refreshKey
    return getInventoryOverview(selectedBranchId === 'all' ? undefined : selectedBranchId)
  }, [refreshKey, selectedBranchId])
  const selectedItem = selectedItemId ? items.find((item) => item.id === selectedItemId) : items[0]

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter((item) => {
      const relatedStocks = stocks.filter((stock) => stock.itemId === item.id && (selectedBranchId === 'all' || stock.branchId === selectedBranchId))
      const visibleStocks = relatedStocks.length ? relatedStocks : selectedBranchId === 'all' ? [] : [undefined]
      const matchesSearch = !query || [item.name, item.itemCode, item.sku, item.brand, supplierName(item.defaultSupplierId ?? '')].some((value) => value.toLowerCase().includes(query))
      const matchesCategory = categoryId === 'all' || item.categoryId === categoryId
      const matchesStock = stockStatus === 'all' || visibleStocks.some((stock) => getStockStatus(stock) === stockStatus)
      return matchesSearch && matchesCategory && matchesStock
    })
  }, [categoryId, items, search, selectedBranchId, stockStatus, stocks])

  function refresh() {
    setRefreshKey((key) => key + 1)
  }

  function handleAddItem() {
    const name = window.prompt('Item name')
    if (!name) return
    const sku = window.prompt('SKU or item code', '') ?? ''
    createInventoryItem({
      sku,
      name,
      description: window.prompt('Description', '') ?? '',
      categoryId: getInventoryCategories()[0]?.id ?? 'other',
      unitId: getInventoryUnits()[0]?.id ?? 'piece',
      brand: window.prompt('Brand', '') ?? '',
      defaultReorderLevel: Number(window.prompt('Default reorder level', '0') ?? 0),
      trackBatches: window.confirm('Track batches or lots for this item?'),
      trackExpiry: window.confirm('Track expiry dates for this item?'),
      expiryWarningDays: 60,
      status: 'active',
    })
    refresh()
  }

  function chooseBranch(message: string) {
    if (selectedBranchId !== 'all') return selectedBranchId
    const code = window.prompt(`${message}\n${branches.map((branch) => `${branch.id}: ${branch.name}`).join('\n')}`)
    return code && branches.some((branch) => branch.id === code) ? code : null
  }

  function handleStockIn(item: InventoryItem) {
    const branchId = chooseBranch('Branch ID for stock in')
    const quantity = readNumber('Quantity received')
    if (!branchId || !quantity) return
    stockIn({
      branchId,
      itemId: item.id,
      quantity,
      unitCostCents: Math.round(Number(window.prompt('Unit cost in PHP', '0') ?? 0) * 100),
      reference: window.prompt('Reference number', '') ?? undefined,
      reason: window.prompt('Reason', 'Manual stock in') || 'Manual stock in',
      receivedDate: new Date().toISOString().slice(0, 10),
      batchNumber: window.prompt('Batch/Lot number if applicable', '') ?? undefined,
      expiryDate: item.trackExpiry ? window.prompt('Expiry date YYYY-MM-DD', '') ?? undefined : undefined,
      performedBy: 'clinic-user',
    })
    refresh()
  }

  function handleStockOut(item: InventoryItem) {
    const branchId = chooseBranch('Branch ID for stock out')
    const quantity = readNumber('Quantity to remove')
    if (!branchId || !quantity) return
    stockOut({
      branchId,
      itemId: item.id,
      quantity,
      reason: window.prompt('Reason', 'Manual stock out') || 'Manual stock out',
      performedBy: 'clinic-user',
    })
    refresh()
  }

  function handleAdjust(item: InventoryItem) {
    const branchId = chooseBranch('Branch ID for adjustment')
    const value = window.prompt('Adjustment quantity. Use negative for decrease, positive for increase.', '0')
    if (!branchId || !value) return
    adjustStock({
      branchId,
      itemId: item.id,
      adjustmentQuantity: Number(value),
      reason: window.prompt('Adjustment reason', 'Physical count correction') || 'Physical count correction',
      performedBy: 'clinic-user',
    })
    refresh()
  }

  function handleTransfer(item: InventoryItem) {
    const fromBranchId = window.prompt('From branch ID', branches[0]?.id ?? '')
    const toBranchId = window.prompt('To branch ID', branches[1]?.id ?? '')
    const quantity = readNumber('Quantity to transfer')
    if (!fromBranchId || !toBranchId || !quantity) return
    transferStock({
      fromBranchId,
      toBranchId,
      items: [{ id: `transfer-item-${Date.now()}`, itemId: item.id, quantity }],
      requestedBy: 'clinic-user',
      receivedBy: 'clinic-user',
      notes: window.prompt('Transfer notes', '') ?? '',
    })
    refresh()
  }

  function handleCreateTransfer(item: InventoryItem) {
    const fromBranchId = window.prompt('From branch ID', branches[0]?.id ?? '')
    const toBranchId = window.prompt('To branch ID', branches[1]?.id ?? '')
    const quantity = readNumber('Quantity to transfer')
    if (!fromBranchId || !toBranchId || !quantity) return
    createStockTransfer({
      fromBranchId,
      toBranchId,
      items: [{ id: `transfer-item-${Date.now()}`, itemId: item.id, quantity }],
      requestedBy: 'clinic-user',
      notes: window.prompt('Transfer notes', '') ?? '',
    })
    refresh()
  }

  function handleAddSupplier() {
    const name = window.prompt('Supplier name')
    if (!name) return
    createSupplier({
      name,
      contactPerson: window.prompt('Contact person', '') ?? '',
      phone: window.prompt('Phone', '') ?? '',
      email: window.prompt('Email', '') ?? '',
      address: window.prompt('Address', '') ?? '',
      notes: window.prompt('Notes', '') ?? '',
      status: 'active',
    })
    refresh()
  }

  function handleCreatePo() {
    if (!items.length || !suppliers.length) {
      window.alert('Create at least one inventory item and supplier first.')
      return
    }
    const branchId = chooseBranch('Destination branch ID')
    const quantity = readNumber(`Quantity for ${items[0].name}`)
    if (!branchId || !quantity) return
    createPurchaseOrder({
      supplierId: suppliers[0].id,
      branchId,
      orderDate: new Date().toISOString().slice(0, 10),
      items: [{ id: `po-item-${Date.now()}`, itemId: items[0].id, quantityOrdered: quantity, quantityReceived: 0, unitCostCents: Math.round(Number(window.prompt('Unit cost in PHP', '0') ?? 0) * 100) }],
      notes: window.prompt('PO notes', '') ?? '',
      createdBy: 'clinic-user',
    })
    refresh()
  }

  function handleReceivePo(poId: string) {
    const order = purchaseOrders.find((entry) => entry.id === poId)
    const item = order?.items.find((entry) => entry.quantityReceived < entry.quantityOrdered)
    if (!order || !item) return
    const quantity = readNumber(`Quantity received for ${itemName(item.itemId)}. Remaining: ${item.quantityOrdered - item.quantityReceived}`)
    if (!quantity) return
    receivePurchaseOrder({
      poId,
      receivedBy: 'clinic-user',
      receivedDate: new Date().toISOString().slice(0, 10),
      items: [{ poItemId: item.id, quantityReceived: quantity }],
    })
    refresh()
  }

  function handleCreateStockCount() {
    const branchId = chooseBranch('Branch ID for stock count')
    if (!branchId) return
    createStockCount({
      branchId,
      countedBy: 'clinic-user',
      countDate: new Date().toISOString().slice(0, 10),
      notes: window.prompt('Count notes', '') ?? '',
    })
    refresh()
  }

  function handleUpdateCountItem(countId: string, itemId: string, currentQuantity: number) {
    const physicalQuantity = readNonNegativeNumber('Physical quantity counted', String(currentQuantity))
    if (physicalQuantity === null) return
    const reason = window.prompt('Reason for difference, if any', '') ?? ''
    updateStockCountItem(countId, itemId, physicalQuantity, reason)
    refresh()
  }

  return (
    <PageScaffold title="Inventory" description="Track clinic supplies, materials and branch stock levels.">
      <div className="page-stack">
        <div className="toolbar-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="toolbar-row" style={{ flexWrap: 'wrap' }}>
            {(['items', 'movements', 'suppliers', 'purchase_orders', 'transfers', 'stock_counts'] as InventoryTab[]).map((tab) => (
              <button key={tab} type="button" className={`tab-button ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                {tab.replaceAll('_', ' ')}
              </button>
            ))}
          </div>
          <div className="toolbar-row">
            {permissions.can('inventory.create_item') && <Button icon={<Plus size={16} />} onClick={handleAddItem}>Add Item</Button>}
            {permissions.can('suppliers.manage') && <Button variant="secondary" icon={<Truck size={16} />} onClick={handleAddSupplier}>Add Supplier</Button>}
            {permissions.canAny(['purchase_orders.create', 'purchases.create']) && <Button variant="secondary" icon={<ClipboardList size={16} />} onClick={handleCreatePo}>Purchase Order</Button>}
            {permissions.can('inventory.adjust') && <Button variant="secondary" icon={<ClipboardList size={16} />} onClick={handleCreateStockCount}>Stock Count</Button>}
          </div>
        </div>

        <div className="metrics-grid">
          <div className="metric-card"><span>Total Active Items</span><strong>{overview.totalActiveItems}</strong><small>Catalog items available for operations</small></div>
          <div className="metric-card"><span>Low Stock Items</span><strong>{overview.lowStockItems}</strong><small>Branch stock at or below reorder level</small></div>
          <div className="metric-card"><span>Out of Stock</span><strong>{overview.outOfStockItems}</strong><small>Branch stock at zero</small></div>
          <div className="metric-card"><span>Expiring Soon</span><strong>{overview.expiringSoon}</strong><small>Tracked batches inside warning window</small></div>
          <div className="metric-card"><span>Pending POs</span><strong>{overview.pendingPurchaseOrders}</strong><small>Ordered or partially received</small></div>
          <div className="metric-card"><span>Pending Transfers</span><strong>{overview.pendingTransfers}</strong><small>Draft or in transit between branches</small></div>
          <div className="metric-card"><span>Stock Counts</span><strong>{overview.openStockCounts}</strong><small>Draft or reviewed reconciliation sessions</small></div>
          {permissions.can('inventory.view_cost') && <div className="metric-card"><span>Inventory Value</span><strong>{formatCurrency(overview.inventoryValueCents)}</strong><small>Branch stock at weighted average cost</small></div>}
        </div>

        <div className="filter-panel" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) repeat(3, minmax(150px, 220px))', gap: 12 }}>
          <label className="field">
            <span>Search inventory</span>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-muted)' }} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} style={{ paddingLeft: 36 }} />
            </div>
          </label>
          <Select label="Branch" value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)} options={[{ value: 'all', label: 'All branches' }, ...branches.map((branch) => ({ value: branch.id, label: branch.name }))]} />
          <Select label="Category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} options={[{ value: 'all', label: 'All categories' }, ...getInventoryCategories().map((category) => ({ value: category.id, label: category.name }))]} />
          <Select label="Stock status" value={stockStatus} onChange={(event) => setStockStatus(event.target.value as typeof stockStatus)} options={[{ value: 'all', label: 'All statuses' }, { value: 'in_stock', label: 'In stock' }, { value: 'low_stock', label: 'Low stock' }, { value: 'out_of_stock', label: 'Out of stock' }]} />
        </div>

        {activeTab === 'items' && (
          <div className="workspace-grid">
            <section className="workspace-panel">
              <div className="section-header"><div><h3>Branch Inventory</h3><p>{filteredItems.length} items</p></div></div>
              <div className="workspace-list">
                {filteredItems.map((item) => {
                  const branchStocks = branches
                    .filter((branch) => selectedBranchId === 'all' || branch.id === selectedBranchId)
                    .map((branch) => ({ branch, stock: getBranchStock(branch.id, item.id) }))
                  return (
                    <button key={item.id} type="button" className="workspace-row" onClick={() => setSelectedItemId(item.id)}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.itemCode} - {item.sku || 'No SKU'} - {getInventoryCategories().find((category) => category.id === item.categoryId)?.name ?? item.categoryId}</span>
                        <small>{item.brand || 'No brand'} - {getInventoryUnits().find((unit) => unit.id === item.unitId)?.label ?? item.unitId}</small>
                      </div>
                      <div style={{ display: 'grid', gap: 6, minWidth: 210 }}>
                        {branchStocks.map(({ branch, stock }) => (
                          <div key={branch.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                            <span>{branch.city || branch.name}</span>
                            <Badge tone={statusTone(getStockStatus(stock))}>{stock ? formatQuantity(stock.quantityOnHand, item.unitId) : '0'}</Badge>
                          </div>
                        ))}
                      </div>
                    </button>
                  )
                })}
                {filteredItems.length === 0 && <div className="empty-state-panel">No inventory items match the current filters.</div>}
              </div>
            </section>

            <aside className="workspace-panel">
              {selectedItem ? (
                <>
                  <div className="section-header"><div><h3>{selectedItem.name}</h3><p>{selectedItem.itemCode} - {selectedItem.sku || 'No SKU'}</p></div><Badge tone={statusTone(selectedItem.status)}>{selectedItem.status}</Badge></div>
                  <div className="detail-grid detail-grid-mini">
                    <div className="detail-item"><span>Category</span><strong>{getInventoryCategories().find((category) => category.id === selectedItem.categoryId)?.name ?? selectedItem.categoryId}</strong></div>
                    <div className="detail-item"><span>Unit</span><strong>{getInventoryUnits().find((unit) => unit.id === selectedItem.unitId)?.label ?? selectedItem.unitId}</strong></div>
                    <div className="detail-item"><span>Batch tracking</span><strong>{selectedItem.trackBatches ? 'Enabled' : 'Off'}</strong></div>
                    <div className="detail-item"><span>Expiry tracking</span><strong>{selectedItem.trackExpiry ? `${selectedItem.expiryWarningDays} days` : 'Off'}</strong></div>
                  </div>
                  <div className="workspace-list">
                    {branches.map((branch) => {
                      const stock = getBranchStock(branch.id, selectedItem.id)
                      return (
                        <div key={branch.id} className="workspace-row">
                          <div><strong>{branch.name}</strong><span>Reorder level {stock?.reorderLevel ?? selectedItem.defaultReorderLevel}</span></div>
                          <div><Badge tone={statusTone(getStockStatus(stock))}>{getStockStatus(stock).replaceAll('_', ' ')}</Badge><strong>{formatQuantity(stock?.quantityOnHand ?? 0, selectedItem.unitId)}</strong></div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="toolbar-row">
                    {permissions.can('inventory.stock_in') && <Button size="sm" icon={<PackagePlus size={14} />} onClick={() => handleStockIn(selectedItem)}>Stock In</Button>}
                    {permissions.can('inventory.stock_out') && <Button size="sm" variant="secondary" onClick={() => handleStockOut(selectedItem)}>Stock Out</Button>}
                    {permissions.can('inventory.adjust') && <Button size="sm" variant="secondary" onClick={() => handleAdjust(selectedItem)}>Adjust</Button>}
                    {permissions.can('inventory.transfer') && <Button size="sm" variant="secondary" icon={<ArrowRightLeft size={14} />} onClick={() => handleCreateTransfer(selectedItem)}>Create Transfer</Button>}
                    {permissions.can('inventory.transfer') && <Button size="sm" variant="secondary" onClick={() => handleTransfer(selectedItem)}>Quick Transfer</Button>}
                  </div>
                  <div className="workspace-list">
                    {getInventoryBatches().filter((batch) => batch.itemId === selectedItem.id).slice(0, 5).map((batch) => (
                      <div key={batch.id} className="workspace-row"><div><strong>{batch.batchNumber}</strong><span>{batch.expiryDate || 'No expiry'} - {branchName(batch.branchId)}</span></div><Badge tone={statusTone(getExpiryStatus(batch, selectedItem))}>{getExpiryStatus(batch, selectedItem).replaceAll('_', ' ')}</Badge></div>
                    ))}
                  </div>
                  <div className="workspace-list">
                    {getItemMovements(selectedItem.id).slice(0, 8).map((movement) => (
                      <div key={movement.id} className="workspace-row"><div><strong>{movement.movementType.replaceAll('_', ' ')}</strong><span>{branchName(movement.branchId)} - {movement.reason}</span><small>{movement.performedBy}</small></div><strong>{movement.quantityBefore} {'->'} {movement.quantityAfter}</strong></div>
                    ))}
                  </div>
                </>
              ) : <div className="empty-state-panel">Select or create an inventory item.</div>}
            </aside>
          </div>
        )}

        {activeTab === 'movements' && (
          <section className="workspace-panel">
            <div className="section-header"><div><h3>Stock Movement Ledger</h3><p>{movements.length} ledger entries</p></div></div>
            <div className="workspace-list">
              {movements.map((movement) => (
                <div key={movement.id} className="workspace-row">
                  <div><strong>{movement.movementType.replaceAll('_', ' ')}</strong><span>{itemName(movement.itemId)} - {branchName(movement.branchId)}</span><small>{movement.reason} - {movement.performedBy}</small></div>
                  <div><span>{movement.quantityBefore} {'->'} {movement.quantityAfter}</span><strong>{movement.quantity}</strong></div>
                </div>
              ))}
              {movements.length === 0 && <div className="empty-state-panel">No stock movements have been posted.</div>}
            </div>
          </section>
        )}

        {activeTab === 'suppliers' && (
          <section className="workspace-panel">
            <div className="section-header"><div><h3>Suppliers</h3><p>{suppliers.length} supplier records</p></div></div>
            <div className="workspace-list">
              {suppliers.map((supplier) => (
                <div key={supplier.id} className="workspace-row">
                  <div><strong>{supplier.name}</strong><span>{supplier.contactPerson || 'No contact'} - {supplier.phone || 'No phone'}</span><small>{supplier.email || supplier.address || 'No additional details'}</small></div>
                  <Badge tone={statusTone(supplier.status)}>{supplier.status}</Badge>
                </div>
              ))}
              {suppliers.length === 0 && <div className="empty-state-panel">No suppliers yet.</div>}
            </div>
          </section>
        )}

        {activeTab === 'purchase_orders' && (
          <section className="workspace-panel">
            <div className="section-header"><div><h3>Purchase Orders</h3><p>{purchaseOrders.length} orders</p></div></div>
            <div className="workspace-list">
              {purchaseOrders.map((order) => (
                <div key={order.id} className="workspace-row">
                  <div><strong>{order.poNumber} - {supplierName(order.supplierId)}</strong><span>{branchName(order.branchId)} - {order.status.replaceAll('_', ' ')}</span><small>{order.items.length} item lines - {formatCurrency(order.totalCents)}</small></div>
                  <div className="toolbar-row">
                    <Badge tone={statusTone(order.status)}>{order.status.replaceAll('_', ' ')}</Badge>
                    {permissions.canAny(['purchase_orders.receive', 'purchases.receive']) && order.status !== 'received' && order.status !== 'cancelled' && (
                      <Button size="sm" onClick={() => handleReceivePo(order.id)}>Receive</Button>
                    )}
                  </div>
                </div>
              ))}
              {purchaseOrders.length === 0 && <div className="empty-state-panel">No purchase orders yet. Ordering does not increase stock until receiving is posted.</div>}
            </div>
          </section>
        )}

        {activeTab === 'transfers' && (
          <section className="workspace-panel">
            <div className="section-header"><div><h3>Stock Transfers</h3><p>{transfers.length} branch transfer records</p></div></div>
            <div className="workspace-list">
              {transfers.map((transfer) => (
                <div key={transfer.id} className="workspace-row">
                  <div>
                    <strong>{transfer.transferNumber}</strong>
                    <span>{branchName(transfer.fromBranchId)} to {branchName(transfer.toBranchId)} - {transfer.status.replaceAll('_', ' ')}</span>
                    <small>{transfer.items.map((item) => `${itemName(item.itemId)} (${item.quantity})`).join(', ')} - requested by {transfer.requestedBy}</small>
                  </div>
                  <div className="toolbar-row">
                    <Badge tone={statusTone(transfer.status)}>{transfer.status.replaceAll('_', ' ')}</Badge>
                    {permissions.can('inventory.transfer') && transfer.status === 'draft' && (
                      <Button size="sm" onClick={() => { dispatchStockTransfer(transfer.id, 'clinic-user'); refresh() }}>Dispatch</Button>
                    )}
                    {permissions.can('inventory.receive_transfer') && transfer.status === 'in_transit' && (
                      <Button size="sm" onClick={() => { receiveStockTransfer(transfer.id, 'clinic-user'); refresh() }}>Receive</Button>
                    )}
                  </div>
                </div>
              ))}
              {transfers.length === 0 && <div className="empty-state-panel">No transfers yet. Create a transfer from an item detail panel.</div>}
            </div>
          </section>
        )}

        {activeTab === 'stock_counts' && (
          <section className="workspace-panel">
            <div className="section-header"><div><h3>Physical Stock Counts</h3><p>{stockCounts.length} count sessions</p></div></div>
            <div className="workspace-list">
              {stockCounts.map((count) => {
                const differences = count.items.filter((item) => item.difference !== 0)
                return (
                  <div key={count.id} className="workspace-row">
                    <div>
                      <strong>{count.countNumber} - {branchName(count.branchId)}</strong>
                      <span>{formatDisplayDate(count.countDate)} - {count.status.replaceAll('_', ' ')}</span>
                      <small>{count.items.length} item lines - {differences.length} difference{differences.length === 1 ? '' : 's'}</small>
                      {differences.slice(0, 3).map((item) => (
                        <small key={item.id}>{itemName(item.itemId)}: system {item.systemQuantity}, physical {item.physicalQuantity}, difference {item.difference}</small>
                      ))}
                    </div>
                    <div className="toolbar-row">
                      <Badge tone={statusTone(count.status)}>{count.status}</Badge>
                      {permissions.can('inventory.adjust') && count.status === 'draft' && count.items[0] && (
                        <Button size="sm" variant="secondary" onClick={() => handleUpdateCountItem(count.id, count.items[0].itemId, count.items[0].physicalQuantity)}>Count First Item</Button>
                      )}
                      {permissions.can('inventory.adjust') && count.status === 'draft' && (
                        <Button size="sm" onClick={() => { reviewStockCount(count.id, 'clinic-user'); refresh() }}>Review</Button>
                      )}
                      {permissions.can('inventory.adjust') && count.status === 'reviewed' && (
                        <Button size="sm" onClick={() => { postStockCountReconciliation(count.id, 'clinic-user'); refresh() }}>Reconcile</Button>
                      )}
                    </div>
                  </div>
                )
              })}
              {stockCounts.length === 0 && <div className="empty-state-panel">No physical counts yet. Create a stock count to compare system and shelf quantities before posting adjustments.</div>}
            </div>
          </section>
        )}
      </div>
    </PageScaffold>
  )
}
