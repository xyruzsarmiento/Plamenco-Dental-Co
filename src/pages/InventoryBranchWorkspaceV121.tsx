import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react'
import {
  Archive,
  ArrowRightLeft,
  Boxes,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Package,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  PencilLine,
  Search,
  SlidersHorizontal,
  Truck,
  X,
} from 'lucide-react'
import { StatusBadge } from '../components/ui/Badge'
import { InventoryActionToolbar } from '../components/inventory/InventoryActionToolbar'
import { Button } from '../components/ui/Button'
import { Pagination } from '../components/ui/DesignSystem'
import { usePermissions } from '../features/auth/permissions'
import type { Branch } from '../features/branches/branchTypes'
import { InventoryActionModal, type InventoryDialog } from '../features/inventory/InventoryActionModal'
import { ensureItemRegisteredToBranchV128 } from '../features/inventory/branchInventoryRegistrationV128'
import {
  getBranchInventory,
  getExpiryStatus,
  getInventoryBatches,
  getInventoryCategories,
  getInventoryItems,
  getInventoryUnits,
  getPurchaseOrders,
  getStockCounts,
  getStockMovements,
  getStockStatus,
  getStockTransfers,
  getSuppliers,
  type BranchInventory,
  type InventoryBatch,
  type InventoryItem,
  type StockMovement,
  type StockStatus,
} from '../features/inventory/inventoryStore'

const PAGE_SIZE = 10
const RECENT_MOVEMENT_LIMIT = 8

type Tab = 'stock' | 'purchasing' | 'movements' | 'management'
type StockFilter = 'all' | StockStatus | 'expiring_soon'
type Props = { activeBranch: Branch; availableBranches: Branch[]; cacheKey: string }
type StockRow = { item: InventoryItem; stock: BranchInventory; itemBatches: InventoryBatch[] }

function quantity(value: number, unitId?: string) {
  const unit = getInventoryUnits().find((entry) => entry.id === unitId)
  return `${Number(value || 0).toLocaleString('en-PH')} ${unit?.abbreviation ?? unitId ?? ''}`.trim()
}

function dateTime(value?: string) {
  if (!value) return 'Not recorded'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function labelize(value?: string) {
  return String(value ?? '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function movementDelta(movement: StockMovement) {
  const before = Number(movement.quantityBefore ?? 0)
  const after = Number(movement.quantityAfter ?? 0)
  const delta = after - before
  return `${delta > 0 ? '+' : ''}${delta.toLocaleString('en-PH')}`
}

function movementTone(movement: StockMovement) {
  const delta = Number(movement.quantityAfter ?? 0) - Number(movement.quantityBefore ?? 0)
  if (delta > 0) return 'is-positive'
  if (delta < 0) return 'is-negative'
  return 'is-neutral'
}

function stop(event: MouseEvent) {
  event.stopPropagation()
}

export function InventoryBranchWorkspaceV121({ activeBranch, availableBranches, cacheKey }: Props) {
  const permissions = usePermissions()
  const [refreshKey, setRefreshKey] = useState(0)
  const [tab, setTab] = useState<Tab>('stock')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StockFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null)
  const [movementChooserOpen, setMovementChooserOpen] = useState(false)
  const [dialog, setDialog] = useState<InventoryDialog | null>(null)
  const [branchRegistrationError, setBranchRegistrationError] = useState<string | null>(null)
  const itemIdsBeforeCreate = useRef<Set<string>>(new Set())

  const items = useMemo(() => { void refreshKey; void cacheKey; return getInventoryItems().filter((item) => item.status === 'active') }, [refreshKey, cacheKey])
  const categories = useMemo(() => { void refreshKey; void cacheKey; return getInventoryCategories().filter((category) => category.status === 'active') }, [refreshKey, cacheKey])
  const suppliers = useMemo(() => { void refreshKey; void cacheKey; return getSuppliers() }, [refreshKey, cacheKey])
  const stocks = useMemo(() => { void refreshKey; void cacheKey; return getBranchInventory().filter((row) => row.branchId === activeBranch.id) }, [activeBranch.id, refreshKey, cacheKey])
  const movements = useMemo(() => { void refreshKey; void cacheKey; return getStockMovements().filter((row) => row.branchId === activeBranch.id) }, [activeBranch.id, refreshKey, cacheKey])
  const batches = useMemo(() => { void refreshKey; void cacheKey; return getInventoryBatches().filter((row) => row.branchId === activeBranch.id) }, [activeBranch.id, refreshKey, cacheKey])
  const purchaseOrders = useMemo(() => { void refreshKey; void cacheKey; return getPurchaseOrders().filter((row) => row.branchId === activeBranch.id) }, [activeBranch.id, refreshKey, cacheKey])
  const stockCounts = useMemo(() => { void refreshKey; void cacheKey; return getStockCounts().filter((row) => row.branchId === activeBranch.id) }, [activeBranch.id, refreshKey, cacheKey])
  const transfers = useMemo(() => { void refreshKey; void cacheKey; return getStockTransfers().filter((row) => row.fromBranchId === activeBranch.id || row.toBranchId === activeBranch.id) }, [activeBranch.id, refreshKey, cacheKey])

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories])
  const supplierMap = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers])
  const branchMap = useMemo(() => new Map(availableBranches.map((branch) => [branch.id, branch])), [availableBranches])
  const query = search.trim().toLowerCase()

  const stockRows = useMemo(() => stocks.map((stock) => {
    const item = itemMap.get(stock.itemId)
    if (!item) return null
    const itemBatches = batches.filter((row) => row.itemId === item.id)
    return { item, stock, itemBatches }
  }).filter((row): row is StockRow => Boolean(row))
    .filter(({ item, stock, itemBatches }) => {
      const status = getStockStatus(stock)
      const hasExpiringSoon = itemBatches.some((batch) => getExpiryStatus(batch, item) === 'expiring_soon')
      const matchesSearch = !query || [item.name, item.itemCode, item.sku, item.brand, item.description, categoryMap.get(item.categoryId)?.name].some((value) => String(value ?? '').toLowerCase().includes(query))
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'expiring_soon' ? hasExpiringSoon : status === statusFilter)
      const matchesCategory = categoryFilter === 'all' || item.categoryId === categoryFilter
      const matchesSupplier = supplierFilter === 'all' || item.defaultSupplierId === supplierFilter
      return matchesSearch && matchesStatus && matchesCategory && matchesSupplier
    }), [batches, categoryFilter, categoryMap, itemMap, query, statusFilter, stocks, supplierFilter])

  const scopedRows = tab === 'stock' ? stockRows
    : tab === 'purchasing' ? purchaseOrders.filter((row) => !query || [row.poNumber, supplierMap.get(row.supplierId)?.name, row.status].some((value) => String(value ?? '').toLowerCase().includes(query)))
      : tab === 'movements' ? movements.filter((row) => !query || [itemMap.get(row.itemId)?.name, row.movementType, row.reason, row.performedBy].some((value) => String(value ?? '').toLowerCase().includes(query)))
        : stockCounts.filter((row) => !query || [row.countNumber, row.status].some((value) => String(value ?? '').toLowerCase().includes(query)))

  const pageCount = Math.max(1, Math.ceil(scopedRows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const visibleRows = scopedRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE) as any[]
  const selectedRow = selectedStockId ? stockRows.find((row) => row.stock.id === selectedStockId) ?? null : null
  const lowStock = stockRows.filter(({ stock }) => getStockStatus(stock) === 'low_stock').length
  const outOfStock = stockRows.filter(({ stock }) => getStockStatus(stock) === 'out_of_stock').length
  const expiringSoon = stockRows.filter(({ item, itemBatches }) => itemBatches.some((batch) => getExpiryStatus(batch, item) === 'expiring_soon')).length
  const totalOnHand = stocks.reduce((sum, row) => sum + Number(row.quantityOnHand || 0), 0)
  const inventoryValue = stocks.reduce((sum, row) => sum + Number(row.quantityOnHand || 0) * Number(row.averageUnitCostCents || 0), 0)
  const pendingPurchaseOrders = purchaseOrders.filter((row) => !['received', 'cancelled'].includes(row.status)).length
  const pendingTransfers = transfers.filter((row) => !['received', 'cancelled'].includes(row.status)).length
  const openStockCounts = stockCounts.filter((row) => !['reconciled', 'cancelled'].includes(row.status)).length

  useEffect(() => { setPage(1); setSearch(''); setStatusFilter('all'); setCategoryFilter('all'); setSupplierFilter('all'); setDialog(null); setSelectedStockId(null); setMovementChooserOpen(false); setBranchRegistrationError(null) }, [activeBranch.id, cacheKey])
  useEffect(() => setPage(1), [tab, search, statusFilter, categoryFilter, supplierFilter])
  useEffect(() => {
    if (!selectedRow) return undefined
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedStockId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedRow])

  function refresh() { setRefreshKey((value) => value + 1) }

  function openAddItem() {
    itemIdsBeforeCreate.current = new Set(getInventoryItems().map((item) => item.id))
    setBranchRegistrationError(null)
    setDialog({ type: 'add_item' })
  }

  function handleDialogSuccess() {
    const completedDialog = dialog
    void (async () => {
      try {
        if (completedDialog?.type === 'add_item') {
          const createdItem = getInventoryItems().find((item) => !itemIdsBeforeCreate.current.has(item.id))
          if (createdItem) await ensureItemRegisteredToBranchV128(activeBranch.id, createdItem)
        }
      } catch (cause) {
        setBranchRegistrationError(cause instanceof Error ? cause.message : 'The item was created but could not be registered to this branch.')
      } finally {
        setDialog(null)
        refresh()
      }
    })()
  }

  function openDialog(nextDialog: InventoryDialog) {
    setSelectedStockId(null)
    setDialog(nextDialog)
  }

  function handleRowKeyDown(event: ReactKeyboardEvent, row: StockRow) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setSelectedStockId(row.stock.id)
    }
  }

  function renderStockRow(row: StockRow) {
    const { item, stock, itemBatches } = row
    const onHand = Number(stock.quantityOnHand ?? 0)
    const status = getStockStatus(stock)
    const category = categoryMap.get(item.categoryId)?.name ?? labelize(item.categoryId)
    const supplier = item.defaultSupplierId ? supplierMap.get(item.defaultSupplierId)?.name : ''
    const expiring = itemBatches.some((batch) => getExpiryStatus(batch, item) === 'expiring_soon')
    return <article key={stock.id} role="button" tabIndex={0} className="inv121-stock-card is-clickable" onClick={() => setSelectedStockId(stock.id)} onKeyDown={(event) => handleRowKeyDown(event, row)} aria-label={`Open inventory details for ${item.name}`}>
      <div className="inv121-stock-main"><span className="inv121-item-icon"><Package size={18}/></span><div><span>{item.itemCode}</span><h3>{item.name}</h3><p>{category} / {getInventoryUnits().find((unit) => unit.id === item.unitId)?.abbreviation ?? item.unitId}{supplier ? ` - ${supplier}` : ''}</p></div></div>
      <div className="inv121-stock-quantity"><span>{activeBranch.name}</span><strong>{quantity(onHand, item.unitId)}</strong><small>{itemBatches.length ? `${itemBatches.length} active batch${itemBatches.length === 1 ? '' : 'es'}` : 'No batch records'}</small></div>
      <div className="inv121-stock-status"><StatusBadge status={status} label={labelize(status)} variant="compact" />{expiring && <StatusBadge status="pending" label="Expiring Soon" variant="compact" />}</div>
      <div className="inv121-row-actions" onClick={stop}>
        {permissions.can('inventory.stock_in') && <Button size="sm" variant="secondary" icon={<PackagePlus size={14}/>} onClick={() => openDialog({ type: 'stock_in', item })}>Stock In</Button>}
        {permissions.can('inventory.stock_out') && <Button size="sm" variant="secondary" icon={<PackageMinus size={14}/>} onClick={() => openDialog({ type: 'stock_out', item })}>Stock Out</Button>}
        {permissions.can('inventory.adjust') && <Button size="sm" variant="secondary" onClick={() => openDialog({ type: 'adjust', item })}>Adjust</Button>}
        <ChevronRight size={16} aria-hidden="true" />
      </div>
    </article>
  }

  const activeFilterCount = [statusFilter !== 'all', categoryFilter !== 'all', supplierFilter !== 'all'].filter(Boolean).length

  return <section className="inv121-page" data-inventory-scope={activeBranch.id} data-inventory-cache-key={cacheKey}>
    <header className="inv121-hero">
      <div><span>Branch inventory</span><h2>Inventory</h2><p>Track stock, purchasing and inventory movement for <strong>{activeBranch.name}</strong>.</p></div>
      <InventoryActionToolbar
        canCreateItem={permissions.can('inventory.create_item')}
        canRecordMovement={permissions.canAny(['inventory.stock_in', 'inventory.stock_out', 'inventory.adjust'])}
        canAdjustStock={permissions.can('inventory.adjust')}
        canManageSuppliers={permissions.can('suppliers.manage')}
        canCreatePurchaseOrder={permissions.canAny(['purchase_orders.create', 'purchases.create'])}
        onAddItem={openAddItem}
        onStockMovement={() => setMovementChooserOpen(true)}
        onStockCount={() => setDialog({ type: 'stock_count' })}
        onPurchaseOrder={() => setDialog({ type: 'purchase_order' })}
        onAddSupplier={() => setDialog({ type: 'add_supplier' })}
      />
    </header>

    {branchRegistrationError && <div className="inline-alert error" role="alert">{branchRegistrationError}</div>}

    <section className="inv121-metrics" aria-label={`${activeBranch.name} inventory health`}>
      <article><Boxes size={17}/><span>Total items</span><strong>{stockRows.length}</strong><small>active positions</small></article>
      <article className="tone-warning"><PackageCheck size={17}/><span>Low stock</span><strong>{lowStock}</strong><small>needs review</small></article>
      <article className="tone-danger"><PackageMinus size={17}/><span>Out of stock</span><strong>{outOfStock}</strong><small>replenish soon</small></article>
      <article className="tone-caution"><CalendarClock size={17}/><span>Expiring soon</span><strong>{expiringSoon}</strong><small>batch warning</small></article>
    </section>

    <section className="inv121-ops-snapshot" aria-label={`${activeBranch.name} operations snapshot`}>
      <div><span>Total on hand</span><strong>{totalOnHand.toLocaleString('en-PH')}</strong></div>
      {permissions.can('inventory.view_cost') && <div><span>Inventory value</span><strong>{`PHP ${(inventoryValue / 100).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`}</strong></div>}
      <div><span>Pending orders</span><strong>{pendingPurchaseOrders}</strong></div>
      <div><span>Pending transfers</span><strong>{pendingTransfers}</strong></div>
      <div><span>Open counts</span><strong>{openStockCounts}</strong></div>
    </section>

    <section className="inv121-command">
      <div className="inv121-tabs" role="tablist" aria-label="Inventory workspace sections">{([['stock', 'Stock'], ['purchasing', 'Purchasing'], ['movements', 'Movements'], ['management', 'Management']] as Array<[Tab, string]>).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div>
      <div className="inv121-toolbar">
        <label className="inv121-search"><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${activeBranch.name} inventory`} /></label>
        {tab === 'stock' && <div className="inv121-filters" aria-label="Stock filters">
          <span><SlidersHorizontal size={14}/> Filters {activeFilterCount ? `(${activeFilterCount})` : ''}</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StockFilter)} aria-label="Stock status filter"><option value="all">All statuses</option><option value="in_stock">In Stock</option><option value="low_stock">Low Stock</option><option value="out_of_stock">Out of Stock</option><option value="expiring_soon">Expiring Soon</option></select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Category filter"><option value="all">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          <select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)} aria-label="Supplier filter"><option value="all">All suppliers</option>{suppliers.filter((supplier) => supplier.status === 'active').map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>
        </div>}
      </div>
    </section>

    <div className="inv121-list">
      {tab === 'stock' && visibleRows.map(renderStockRow)}
      {tab === 'movements' && visibleRows.map((row) => <article key={row.id} className="inv121-simple-row"><span className={`inv121-feed-icon ${movementTone(row)}`}><Package size={16}/></span><div><strong>{labelize(row.movementType)}</strong><span>{itemMap.get(row.itemId)?.name ?? row.itemId} - {row.reason || 'No note recorded'}</span><small>{dateTime(row.createdAt)}{row.performedBy ? ` - by ${row.performedBy}` : ''}</small></div><div><strong className={movementTone(row)}>{movementDelta(row)}</strong><span>{Number(row.quantityBefore ?? 0).toLocaleString('en-PH')} to {Number(row.quantityAfter ?? 0).toLocaleString('en-PH')}</span></div></article>)}
      {tab === 'purchasing' && <><div className="inv121-section-heading"><div><span>Purchasing</span><h3>Orders and suppliers</h3></div>{permissions.canAny(['purchase_orders.create', 'purchases.create']) && <Button size="sm" icon={<ClipboardList size={14}/>} onClick={() => setDialog({ type: 'purchase_order' })}>New Purchase Order</Button>}</div>{visibleRows.map((row) => <article key={row.id} className="inv121-simple-row"><span className="inv121-feed-icon"><ClipboardList size={16}/></span><div><strong>{row.poNumber ?? row.id}</strong><span>{supplierMap.get(row.supplierId)?.name ?? 'Supplier'} - {labelize(row.status)}</span><small>{dateTime(row.createdAt)}</small></div><div><strong>{activeBranch.name}</strong><span>Destination branch</span></div>{permissions.can('purchase_orders.receive') && ['ordered', 'partial', 'partially_received'].includes(row.status) && <Button size="sm" variant="secondary" onClick={() => setDialog({ type: 'receive_po', poId: row.id })}>Receive</Button>}</article>)}<div className="inv121-secondary-list"><div className="inv121-section-heading is-compact"><div><span>Suppliers</span><h3>Supply directory</h3></div>{permissions.can('suppliers.manage') && <Button size="sm" variant="secondary" icon={<Truck size={14}/>} onClick={() => setDialog({ type: 'add_supplier' })}>Add Supplier</Button>}</div>{suppliers.slice(0, 6).map((row) => <article key={row.id} className="inv121-simple-row"><span className="inv121-feed-icon"><Truck size={16}/></span><div><strong>{row.name}</strong><span>{row.contactPerson || 'No contact person'} - {row.phone || row.email || 'No contact details'}</span><small>{row.address || 'No address recorded'}</small></div><div><StatusBadge status={row.status} label={labelize(row.status)} variant="compact" /><span>Clinic-wide supplier</span></div></article>)}</div></>}
      {tab === 'movements' && <div className="inv121-secondary-list"><div className="inv121-section-heading is-compact"><div><span>Transfers</span><h3>Branch movement queue</h3></div></div>{transfers.slice(0, 6).map((row) => <article key={row.id} className="inv121-simple-row"><span className="inv121-feed-icon"><ArrowRightLeft size={16}/></span><div><strong>{row.transferNumber ?? row.id}</strong><span>{labelize(row.status)}</span><small>{row.items?.map((entry: any) => `${itemMap.get(entry.itemId)?.name ?? entry.itemId} (${entry.quantity})`).join(', ') || 'No item lines recorded'}</small></div><div><strong>{branchMap.get(row.fromBranchId)?.name ?? row.fromBranchId} to {branchMap.get(row.toBranchId)?.name ?? row.toBranchId}</strong><span>Cross-branch transfer</span></div></article>)}{!visibleRows.length && !transfers.length && <div className="inv121-empty"><ArrowRightLeft size={24}/><strong>No movement activity yet</strong><span>Stock in, stock out, adjustments and transfers will appear here once recorded.</span></div>}</div>}
      {tab === 'management' && <><div className="inv121-section-heading"><div><span>Stock counts</span><h3>Count, review, finalize</h3></div>{permissions.can('inventory.adjust') && <Button size="sm" icon={<ClipboardCheck size={14}/>} onClick={() => setDialog({ type: 'stock_count' })}>Start Stock Count</Button>}</div>{visibleRows.map((row) => <article key={row.id} className="inv121-simple-row"><span className="inv121-feed-icon"><ClipboardCheck size={16}/></span><div><strong>{row.countNumber ?? row.id}</strong><span>{labelize(row.status)} - {dateTime(row.createdAt)}</span><small>{row.items?.length ?? 0} count lines</small></div><div><strong>{activeBranch.name}</strong><span>Count branch</span></div></article>)}</>}
      {!visibleRows.length && tab !== 'movements' && <div className="inv121-empty"><Package size={24}/><strong>{tab === 'stock' && !query && activeFilterCount === 0 ? 'No inventory items yet' : 'No matching inventory records'}</strong><span>{tab === 'stock' && !query && activeFilterCount === 0 ? `Add the first item for ${activeBranch.name} to start tracking stock.` : 'Adjust search or filters to widen this workspace.'}</span>{tab === 'stock' && !query && activeFilterCount === 0 && permissions.can('inventory.create_item') && <Button size="sm" icon={<PackagePlus size={14}/>} onClick={openAddItem}>Add first item</Button>}</div>}
    </div>

    <Pagination page={safePage} pageCount={pageCount} totalItems={scopedRows.length} pageSize={PAGE_SIZE} onPageChange={setPage} label={`${activeBranch.name} inventory pages`} />

    {selectedRow && <InventoryItemDetails
      row={selectedRow}
      activeBranch={activeBranch}
      movements={movements.filter((movement) => movement.itemId === selectedRow.item.id).slice(0, RECENT_MOVEMENT_LIMIT)}
      categoryName={categoryMap.get(selectedRow.item.categoryId)?.name ?? labelize(selectedRow.item.categoryId)}
      supplierName={selectedRow.item.defaultSupplierId ? supplierMap.get(selectedRow.item.defaultSupplierId)?.name ?? 'Supplier not found' : 'No preferred supplier'}
      onClose={() => setSelectedStockId(null)}
      onAction={openDialog}
      canEdit={permissions.can('inventory.edit_item')}
      canArchive={permissions.can('inventory.edit_item')}
      canStockIn={permissions.can('inventory.stock_in')}
      canStockOut={permissions.can('inventory.stock_out')}
      canAdjust={permissions.can('inventory.adjust')}
      canTransfer={permissions.can('inventory.transfer') && availableBranches.length > 1}
    />}
    {movementChooserOpen && <StockMovementChooser
      branchName={activeBranch.name}
      rows={stockRows}
      canStockIn={permissions.can('inventory.stock_in')}
      canStockOut={permissions.can('inventory.stock_out')}
      canAdjust={permissions.can('inventory.adjust')}
      onClose={() => setMovementChooserOpen(false)}
      onAction={(nextDialog) => {
        setMovementChooserOpen(false)
        openDialog(nextDialog)
      }}
    />}
    {dialog && <InventoryActionModal dialog={dialog} branches={dialog.type === 'create_transfer' || dialog.type === 'quick_transfer' ? availableBranches : [activeBranch]} preferredBranchId={activeBranch.id} onClose={() => setDialog(null)} onSuccess={handleDialogSuccess} />}
  </section>
}

function StockMovementChooser({
  branchName,
  canAdjust,
  canStockIn,
  canStockOut,
  onAction,
  onClose,
  rows,
}: {
  branchName: string
  canAdjust: boolean
  canStockIn: boolean
  canStockOut: boolean
  onAction: (dialog: InventoryDialog) => void
  onClose: () => void
  rows: StockRow[]
}) {
  const [itemId, setItemId] = useState(rows[0]?.item.id ?? '')
  const selected = rows.find((row) => row.item.id === itemId)?.item

  return <div className="modal-backdrop inv121-movement-backdrop" role="presentation" onClick={onClose}>
    <section className="inv121-movement-chooser" role="dialog" aria-modal="true" aria-labelledby="inv121-movement-title" onClick={(event) => event.stopPropagation()}>
      <header>
        <div><span>Stock movement</span><h2 id="inv121-movement-title">What would you like to do?</h2><p>Choose an item in {branchName}, then record the stock activity.</p></div>
        <button type="button" className="icon-button inv56-close" aria-label="Close stock movement chooser" onClick={onClose}><X size={18}/></button>
      </header>
      <label className="inv121-movement-picker">
        <span>Inventory item</span>
        <select value={itemId} onChange={(event) => setItemId(event.target.value)}>
          {rows.map((row) => <option key={row.stock.id} value={row.item.id}>{row.item.name} - {quantity(row.stock.quantityOnHand, row.item.unitId)}</option>)}
        </select>
      </label>
      <div className="inv121-movement-options">
        {canStockIn && <button type="button" disabled={!selected} onClick={() => selected && onAction({ type: 'stock_in', item: selected })}><PackagePlus size={18}/><span><strong>Stock In</strong><small>Receive inventory</small></span></button>}
        {canStockOut && <button type="button" disabled={!selected} onClick={() => selected && onAction({ type: 'stock_out', item: selected })}><PackageMinus size={18}/><span><strong>Stock Out</strong><small>Record consumed or removed stock</small></span></button>}
        {canAdjust && <button type="button" disabled={!selected} onClick={() => selected && onAction({ type: 'adjust', item: selected })}><ClipboardCheck size={18}/><span><strong>Adjustment</strong><small>Correct inventory count</small></span></button>}
      </div>
      {!rows.length && <p className="inv121-movement-empty">No branch stock items are available yet. Add an item before recording stock movement.</p>}
    </section>
  </div>
}

function InventoryItemDetails({
  activeBranch,
  canAdjust,
  canArchive,
  canEdit,
  canStockIn,
  canStockOut,
  canTransfer,
  categoryName,
  movements,
  onAction,
  onClose,
  row,
  supplierName,
}: {
  activeBranch: Branch
  canAdjust: boolean
  canArchive: boolean
  canEdit: boolean
  canStockIn: boolean
  canStockOut: boolean
  canTransfer: boolean
  categoryName: string
  movements: StockMovement[]
  onAction: (dialog: InventoryDialog) => void
  onClose: () => void
  row: StockRow
  supplierName: string
}) {
  const { item, stock, itemBatches } = row
  const status = getStockStatus(stock)
  const lastIn = movements.find((movement) => Number(movement.quantityAfter ?? 0) > Number(movement.quantityBefore ?? 0))
  const lastOut = movements.find((movement) => Number(movement.quantityAfter ?? 0) < Number(movement.quantityBefore ?? 0))
  return <div className="modal-backdrop inv121-detail-backdrop" role="presentation" onClick={onClose}>
    <aside className="inv121-detail-panel" role="dialog" aria-modal="true" aria-labelledby="inv121-detail-title" onClick={(event) => event.stopPropagation()}>
      <header>
        <div className="inv121-detail-title"><span><Package size={20}/></span><div><small>Inventory item details</small><h2 id="inv121-detail-title">{item.name}</h2><p>{item.itemCode} - {activeBranch.name}</p></div></div>
        <button type="button" className="icon-button inv56-close" aria-label="Close inventory details" onClick={onClose}><X size={18}/></button>
      </header>
      <div className="inv121-detail-body">
        <section className="inv121-detail-kpis">
          <article><span>On hand</span><strong>{quantity(stock.quantityOnHand, item.unitId)}</strong><small>{activeBranch.name}</small></article>
          <article><span>Reorder level</span><strong>{quantity(stock.reorderLevel || item.defaultReorderLevel, item.unitId)}</strong><small>restock threshold</small></article>
          <article><span>Status</span><StatusBadge status={status} label={labelize(status)} /><small>live stock position</small></article>
          <article><span>Batches</span><strong>{itemBatches.length}</strong><small>{item.trackExpiry ? 'expiry tracking on' : 'expiry tracking off'}</small></article>
        </section>

        <section className="inv121-detail-section"><header><span>Item information</span></header><div className="inv121-detail-grid">
          <div><span>Item code</span><strong>{item.itemCode}</strong></div>
          <div><span>SKU</span><strong>{item.sku || 'Not recorded'}</strong></div>
          <div><span>Category</span><strong>{categoryName}</strong></div>
          <div><span>Unit</span><strong>{getInventoryUnits().find((unit) => unit.id === item.unitId)?.label ?? item.unitId}</strong></div>
          <div><span>Supplier</span><strong>{supplierName}</strong></div>
          <div><span>Location</span><strong>{stock.location || 'No shelf location'}</strong></div>
          <div className="is-wide"><span>Description</span><strong>{item.description || 'No description recorded'}</strong></div>
        </div></section>

        <section className="inv121-detail-section"><header><span>Stock information</span></header><div className="inv121-detail-grid">
          <div><span>Last stock in</span><strong>{lastIn ? dateTime(lastIn.createdAt) : 'No stock in yet'}</strong></div>
          <div><span>Last stock out</span><strong>{lastOut ? dateTime(lastOut.createdAt) : 'No stock out yet'}</strong></div>
          <div><span>Average cost</span><strong>{stock.averageUnitCostCents ? `PHP ${(stock.averageUnitCostCents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : 'Not recorded'}</strong></div>
          <div><span>Updated</span><strong>{dateTime(stock.updatedAt)}</strong></div>
        </div></section>

        <section className="inv121-detail-section"><header><span>Recent movements</span><strong>{movements.length}</strong></header>
          <div className="inv121-detail-feed">{movements.length ? movements.map((movement) => <div key={movement.id}><span className={`inv121-feed-icon ${movementTone(movement)}`}><Clock3 size={15}/></span><div><strong>{labelize(movement.movementType)}</strong><small>{dateTime(movement.createdAt)}{movement.performedBy ? ` - by ${movement.performedBy}` : ''}</small><p>{movement.reason || movement.referenceType || 'No reference note recorded'}</p></div><b className={movementTone(movement)}>{movementDelta(movement)}</b></div>) : <p>No movement history recorded for this branch item.</p>}</div>
        </section>

        <section className="inv121-detail-section"><header><span>Batch / expiry information</span><strong>{itemBatches.length}</strong></header>
          <div className="inv121-detail-feed">{itemBatches.length ? itemBatches.slice(0, 6).map((batch) => <div key={batch.id}><span className="inv121-feed-icon"><CalendarClock size={15}/></span><div><strong>{batch.batchNumber || 'Unnamed batch'}</strong><small>{batch.expiryDate || 'No expiry date'} - received {batch.receivedDate || 'not recorded'}</small><p>{quantity(batch.quantityOnHand, item.unitId)} on hand</p></div><StatusBadge status={getExpiryStatus(batch, item)} label={labelize(getExpiryStatus(batch, item))} variant="compact" /></div>) : <p>No tracked batch or expiry records for this item.</p>}</div>
        </section>
      </div>
      <footer>
        {canEdit && <Button variant="secondary" icon={<PencilLine size={14}/>} onClick={() => onAction({ type: 'edit_item', item })}>Edit item</Button>}
        {canStockIn && <Button variant="secondary" icon={<PackagePlus size={14}/>} onClick={() => onAction({ type: 'stock_in', item })}>Stock In</Button>}
        {canStockOut && <Button variant="secondary" icon={<PackageMinus size={14}/>} onClick={() => onAction({ type: 'stock_out', item })}>Stock Out</Button>}
        {canAdjust && <Button variant="secondary" onClick={() => onAction({ type: 'adjust', item })}>Adjust</Button>}
        {canTransfer && <Button variant="secondary" icon={<ArrowRightLeft size={14}/>} onClick={() => onAction({ type: 'create_transfer', item })}>Transfer</Button>}
        {canArchive && <Button variant="danger" icon={<Archive size={14}/>} onClick={() => onAction({ type: 'remove_item', item })}>Archive</Button>}
      </footer>
    </aside>
  </div>
}
