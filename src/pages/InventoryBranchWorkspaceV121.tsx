import { useEffect, useMemo, useState } from 'react'
import { ArrowRightLeft, Boxes, ClipboardCheck, ClipboardList, Package, PackageCheck, PackageMinus, PackagePlus, Search, Truck } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Pagination } from '../components/ui/DesignSystem'
import { usePermissions } from '../features/auth/permissions'
import type { Branch } from '../features/branches/branchTypes'
import { InventoryActionModal, type InventoryDialog } from '../features/inventory/InventoryActionModal'
import {
  getBranchInventory,
  getExpiryStatus,
  getInventoryBatches,
  getInventoryItems,
  getInventoryUnits,
  getPurchaseOrders,
  getStockCounts,
  getStockMovements,
  getStockStatus,
  getStockTransfers,
  getSuppliers,
} from '../features/inventory/inventoryStore'

const PAGE_SIZE = 10

type Tab = 'stock' | 'movements' | 'purchase_orders' | 'transfers' | 'stock_counts' | 'suppliers'

type Props = { activeBranch: Branch; availableBranches: Branch[]; cacheKey: string }

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

export function InventoryBranchWorkspaceV121({ activeBranch, availableBranches, cacheKey }: Props) {
  const permissions = usePermissions()
  const [refreshKey, setRefreshKey] = useState(0)
  const [tab, setTab] = useState<Tab>('stock')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState<InventoryDialog | null>(null)

  const items = useMemo(() => { void refreshKey; return getInventoryItems().filter((item) => item.status === 'active') }, [refreshKey, cacheKey])
  const suppliers = useMemo(() => { void refreshKey; return getSuppliers() }, [refreshKey, cacheKey])
  const stocks = useMemo(() => { void refreshKey; return getBranchInventory().filter((row) => row.branchId === activeBranch.id) }, [activeBranch.id, refreshKey, cacheKey])
  const movements = useMemo(() => { void refreshKey; return getStockMovements().filter((row) => row.branchId === activeBranch.id) }, [activeBranch.id, refreshKey, cacheKey])
  const batches = useMemo(() => { void refreshKey; return getInventoryBatches().filter((row) => row.branchId === activeBranch.id) }, [activeBranch.id, refreshKey, cacheKey])
  const purchaseOrders = useMemo(() => { void refreshKey; return getPurchaseOrders().filter((row) => row.branchId === activeBranch.id) }, [activeBranch.id, refreshKey, cacheKey])
  const stockCounts = useMemo(() => { void refreshKey; return getStockCounts().filter((row) => row.branchId === activeBranch.id) }, [activeBranch.id, refreshKey, cacheKey])
  const transfers = useMemo(() => { void refreshKey; return getStockTransfers().filter((row) => row.fromBranchId === activeBranch.id || row.toBranchId === activeBranch.id) }, [activeBranch.id, refreshKey, cacheKey])

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const supplierMap = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers])
  const branchMap = useMemo(() => new Map(availableBranches.map((branch) => [branch.id, branch])), [availableBranches])
  const query = search.trim().toLowerCase()

  // A branch workspace is a stock-position view, not the global catalog. An item appears
  // here only when this branch has its own branch_inventory row. The same catalog item can
  // therefore exist in Pulilan and Plaridel with completely independent balances.
  const stockRows = useMemo(() => stocks.map((stock) => {
    const item = itemMap.get(stock.itemId)
    if (!item) return null
    const itemBatches = batches.filter((row) => row.itemId === item.id)
    return { item, stock, itemBatches }
  }).filter((row): row is NonNullable<typeof row> => Boolean(row))
    .filter(({ item }) => !query || [item.name, item.itemCode, item.sku, item.brand].some((value) => String(value ?? '').toLowerCase().includes(query))), [batches, itemMap, query, stocks])

  const scopedRows = tab === 'stock' ? stockRows
    : tab === 'movements' ? movements.filter((row) => !query || [itemMap.get(row.itemId)?.name, row.movementType, row.reason].some((value) => String(value ?? '').toLowerCase().includes(query)))
      : tab === 'purchase_orders' ? purchaseOrders.filter((row) => !query || [row.poNumber, supplierMap.get(row.supplierId)?.name, row.status].some((value) => String(value ?? '').toLowerCase().includes(query)))
        : tab === 'transfers' ? transfers.filter((row) => !query || [row.transferNumber, row.status, branchMap.get(row.fromBranchId)?.name, branchMap.get(row.toBranchId)?.name].some((value) => String(value ?? '').toLowerCase().includes(query)))
          : tab === 'stock_counts' ? stockCounts.filter((row) => !query || [row.countNumber, row.status].some((value) => String(value ?? '').toLowerCase().includes(query)))
            : suppliers.filter((row) => !query || [row.name, row.contactPerson, row.email, row.phone].some((value) => String(value ?? '').toLowerCase().includes(query)))

  const pageCount = Math.max(1, Math.ceil(scopedRows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const visibleRows = scopedRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE) as any[]
  const lowStock = stockRows.filter(({ stock }) => getStockStatus(stock) === 'low_stock').length
  const outOfStock = stockRows.filter(({ stock }) => getStockStatus(stock) === 'out_of_stock').length
  const expiringSoon = batches.filter((batch) => getExpiryStatus(batch) === 'expiring_soon').length
  const totalOnHand = stocks.reduce((sum, row) => sum + Number(row.quantityOnHand || 0), 0)

  useEffect(() => { setPage(1); setSearch(''); setDialog(null) }, [activeBranch.id, cacheKey])
  useEffect(() => setPage(1), [tab, search])
  function refresh() { setRefreshKey((value) => value + 1) }

  function renderStockRow(row: any) {
    const { item, stock, itemBatches } = row
    const onHand = Number(stock.quantityOnHand ?? 0)
    const status = getStockStatus(stock)
    return <article key={stock.id} className="inv121-stock-card">
      <div className="inv121-stock-main"><span className="inv121-item-icon"><Package size={18}/></span><div><span>{item.itemCode}</span><h3>{item.name}</h3><p>{item.brand || 'No brand'} · {labelize(status)}</p></div></div>
      <div className="inv121-stock-quantity"><span>{activeBranch.name}</span><strong>{quantity(onHand, item.unitId)}</strong><small>{itemBatches.length ? `${itemBatches.length} active batch${itemBatches.length === 1 ? '' : 'es'}` : 'No batch records'}</small></div>
      <div className="inv121-row-actions">
        {permissions.can('inventory.stock_in') && <Button size="sm" variant="secondary" icon={<PackagePlus size={14}/>} onClick={() => setDialog({ type: 'stock_in', item })}>Stock In</Button>}
        {permissions.can('inventory.stock_out') && <Button size="sm" variant="secondary" icon={<PackageMinus size={14}/>} onClick={() => setDialog({ type: 'stock_out', item })}>Stock Out</Button>}
        {permissions.can('inventory.adjust') && <Button size="sm" variant="secondary" onClick={() => setDialog({ type: 'adjust', item })}>Adjust</Button>}
        {permissions.can('inventory.transfer') && availableBranches.length > 1 && <Button size="sm" variant="secondary" icon={<ArrowRightLeft size={14}/>} onClick={() => setDialog({ type: 'create_transfer', item })}>Transfer</Button>}
      </div>
    </article>
  }

  return <section className="inv121-page" data-inventory-scope={activeBranch.id} data-inventory-cache-key={cacheKey}>
    <header className="inv121-hero"><div><span>Branch inventory workspace</span><h2>Inventory Control Center</h2><p>Stock, procurement, movements and counts for <strong>{activeBranch.name}</strong> only. Global catalog items from another branch are not shown as local stock.</p></div><div className="inv121-hero-actions">{permissions.can('inventory.create_item') && <Button icon={<PackagePlus size={16}/>} onClick={() => setDialog({ type: 'add_item' })}>Add Item</Button>}{permissions.can('suppliers.manage') && <Button variant="secondary" icon={<Truck size={16}/>} onClick={() => setDialog({ type: 'add_supplier' })}>Add Supplier</Button>}{permissions.canAny(['purchase_orders.create', 'purchases.create']) && <Button variant="secondary" icon={<ClipboardList size={16}/>} onClick={() => setDialog({ type: 'purchase_order' })}>Purchase Order</Button>}{permissions.can('inventory.adjust') && <Button variant="secondary" icon={<ClipboardCheck size={16}/>} onClick={() => setDialog({ type: 'stock_count' })}>Stock Count</Button>}</div></header>

    <section className="inv121-metrics" aria-label={`${activeBranch.name} inventory overview`}><article><Boxes size={17}/><span>Branch items</span><strong>{stockRows.length}</strong></article><article><PackageCheck size={17}/><span>Total on hand</span><strong>{totalOnHand.toLocaleString('en-PH')}</strong></article><article><Boxes size={17}/><span>Low stock</span><strong>{lowStock}</strong></article><article><PackageMinus size={17}/><span>Out of stock</span><strong>{outOfStock}</strong></article><article><ClipboardCheck size={17}/><span>Expiring soon</span><strong>{expiringSoon}</strong></article></section>

    <section className="inv121-command"><div className="inv121-tabs" role="tablist" aria-label="Branch inventory sections">{([['stock', 'Stock'], ['movements', 'Movements'], ['purchase_orders', 'Purchase Orders'], ['transfers', 'Transfers'], ['stock_counts', 'Stock Counts'], ['suppliers', 'Suppliers']] as Array<[Tab, string]>).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div><label className="inv121-search"><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${activeBranch.name} inventory`} /></label></section>

    <div className="inv121-list">
      {tab === 'stock' && visibleRows.map(renderStockRow)}
      {tab === 'movements' && visibleRows.map((row) => <article key={row.id} className="inv121-simple-row"><div><strong>{itemMap.get(row.itemId)?.name ?? row.itemId}</strong><span>{labelize(row.movementType)} · {dateTime(row.createdAt)}</span></div><div><strong>{Number(row.quantityAfter ?? 0).toLocaleString('en-PH')}</strong><span>on hand after movement</span></div></article>)}
      {tab === 'purchase_orders' && visibleRows.map((row) => <article key={row.id} className="inv121-simple-row"><div><strong>{row.poNumber ?? row.id}</strong><span>{supplierMap.get(row.supplierId)?.name ?? 'Supplier'} · {labelize(row.status)}</span></div><div><strong>{activeBranch.name}</strong><span>Destination branch</span></div>{permissions.can('purchase_orders.receive') && ['ordered', 'partial'].includes(row.status) && <Button size="sm" variant="secondary" onClick={() => setDialog({ type: 'receive_po', poId: row.id })}>Receive</Button>}</article>)}
      {tab === 'transfers' && visibleRows.map((row) => <article key={row.id} className="inv121-simple-row"><div><strong>{row.transferNumber ?? row.id}</strong><span>{labelize(row.status)}</span></div><div><strong>{branchMap.get(row.fromBranchId)?.name ?? row.fromBranchId} → {branchMap.get(row.toBranchId)?.name ?? row.toBranchId}</strong><span>Cross-branch transfer</span></div></article>)}
      {tab === 'stock_counts' && visibleRows.map((row) => <article key={row.id} className="inv121-simple-row"><div><strong>{row.countNumber ?? row.id}</strong><span>{labelize(row.status)} · {dateTime(row.createdAt)}</span></div><div><strong>{activeBranch.name}</strong><span>Count branch</span></div></article>)}
      {tab === 'suppliers' && visibleRows.map((row) => <article key={row.id} className="inv121-simple-row"><div><strong>{row.name}</strong><span>{row.contactPerson || 'No contact person'} · {row.phone || row.email || 'No contact details'}</span></div><div><strong>{labelize(row.status)}</strong><span>Clinic-wide supplier</span></div></article>)}
      {!visibleRows.length && <div className="inv121-empty"><Package size={24}/><strong>No records in this branch view</strong><span>There are no matching {tab.replaceAll('_', ' ')} records for {activeBranch.name}.</span></div>}
    </div>

    <Pagination page={safePage} pageCount={pageCount} totalItems={scopedRows.length} pageSize={PAGE_SIZE} onPageChange={setPage} label={`${activeBranch.name} inventory pages`} />
    {dialog && <InventoryActionModal dialog={dialog} branches={dialog.type === 'create_transfer' || dialog.type === 'quick_transfer' ? availableBranches : [activeBranch]} preferredBranchId={activeBranch.id} onClose={() => setDialog(null)} onSuccess={() => { setDialog(null); refresh() }} />}
  </section>
}
