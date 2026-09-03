import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Package,
  PackageMinus,
  PackagePlus,
  PackageX,
  Search,
  ShieldCheck,
  Truck,
  X,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { StatusBadge } from '../components/ui/Badge'
import { Skeleton, SkeletonCard, SkeletonList, SkeletonText } from '../components/ui/DesignSystem'
import { useAuth } from '../features/auth/AuthContext'
import { usePermissions } from '../features/auth/permissions'
import { useBranchContext } from '../features/branches/BranchContext'
import { getStoredBranches } from '../features/branches/branchStore'
import type { Branch } from '../features/branches/branchTypes'
import { createExpensePersisted } from '../features/expenses/expensePersistence'
import { InventoryActionModal, type InventoryDialog } from '../features/inventory/InventoryActionModal'
import {
  refreshInventoryOperationalCaches,
  stockInPersisted,
} from '../features/inventory/inventoryPersistence'
import {
  createInventoryItem,
  getBranchInventory,
  getInventoryCategories,
  getInventoryItems,
  getInventoryUnits,
  getPurchaseOrders,
  getStockCounts,
  getStockMovements,
  getStockStatus,
  getStockTransfers,
  getSuppliers,
  type InventoryItem,
  type StockMovement,
} from '../features/inventory/inventoryStore'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import '../styles/inventory-premium-workspace-v182.css'

const SCROLL_LIMIT_CLASS = 'inv182-scroll-region'

function php(cents = 0) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(cents || 0) / 100)
}

function todayManila() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function labelize(value?: string) {
  return String(value ?? '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function dateTime(value?: string) {
  if (!value) return 'Not recorded'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function movementDelta(movement: StockMovement) {
  const delta = Number(movement.quantityAfter ?? 0) - Number(movement.quantityBefore ?? 0)
  return `${delta > 0 ? '+' : ''}${delta.toLocaleString('en-PH')}`
}

function InventorySkeleton() {
  return <section className="inv182-page" aria-busy="true" aria-label="Loading inventory">
    <SkeletonCard className="inv182-skeleton-hero"><Skeleton width={150} height={12}/><Skeleton width="38%" height={34} radius={12}/><SkeletonText lines={2} widths={['65%','45%']}/></SkeletonCard>
    <div className="inv182-skeleton-metrics">{Array.from({ length: 4 }, (_, index) => <SkeletonCard key={index} compact />)}</div>
    <SkeletonCard><Skeleton width="40%" height={38} radius={12}/><SkeletonList items={6}/></SkeletonCard>
  </section>
}

async function waitForInventoryItem(itemCode: string) {
  if (!supabase) return
  let delay = 120
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase.from('inventory_items').select('id').eq('item_code', itemCode).limit(1)
    if (error) throw new Error(`Inventory item could not be confirmed in Supabase: ${error.message}`)
    if (data?.length) return
    await new Promise((resolve) => window.setTimeout(resolve, delay))
    delay = Math.min(Math.round(delay * 1.6), 700)
  }
  throw new Error('The inventory item did not reach Supabase. Please try again.')
}

async function resolveInventoryExpenseCategory() {
  if (!supabase) throw new Error('Clinic database is not configured.')
  const { data, error } = await supabase.from('expense_categories').select('id, name, status').eq('status', 'active').order('name')
  if (error) throw new Error(`Unable to prepare the inventory expense category: ${error.message}`)
  const rows = data ?? []
  const preferred = rows.find((row) => /inventory|suppl|material|consumable|dental/i.test(String(row.name ?? ''))) ?? rows[0]
  if (!preferred?.id) throw new Error('No active expense category exists for the inventory purchase.')
  return String(preferred.id)
}

function AddInventoryItemModal({ branches, preferredBranchId, onClose, onSaved }: {
  branches: Branch[]
  preferredBranchId?: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const categories = getInventoryCategories().filter((row) => row.status === 'active')
  const units = getInventoryUnits().filter((row) => row.status === 'active')
  const suppliers = getSuppliers().filter((row) => row.status === 'active')
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [brand, setBrand] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? 'other')
  const [unitId, setUnitId] = useState(units[0]?.id ?? 'piece')
  const [supplierId, setSupplierId] = useState('')
  const [reorderLevel, setReorderLevel] = useState('0')
  const [branchId, setBranchId] = useState(preferredBranchId && preferredBranchId !== 'all' ? preferredBranchId : branches[0]?.id ?? '')
  const [openingQuantity, setOpeningQuantity] = useState('0')
  const [unitPrice, setUnitPrice] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const quantity = Number(openingQuantity || 0)
  const pricePhp = Number(unitPrice || 0)
  const totalCents = Number.isFinite(quantity) && Number.isFinite(pricePhp) ? Math.round(quantity * pricePhp * 100) : 0
  const selectedUnit = units.find((row) => row.id === unitId)
  const selectedSupplier = suppliers.find((row) => row.id === supplierId)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError(null)
    if (!name.trim()) { setError('Item name is required.'); return }
    if (!Number.isFinite(quantity) || quantity < 0) { setError('Opening quantity must be zero or greater.'); return }
    if (!Number.isFinite(pricePhp) || pricePhp < 0) { setError('Unit purchase price must be zero or greater.'); return }
    if (quantity > 0 && !branchId) { setError('Choose the branch that holds the opening stock.'); return }
    if (quantity > 0 && pricePhp <= 0) { setError('Enter the unit purchase price so the opening stock can be logged in Expenses.'); return }
    const reorder = Number(reorderLevel)
    if (!Number.isFinite(reorder) || reorder < 0) { setError('Reorder level must be zero or greater.'); return }
    if (!isSupabaseConfigured || !supabase) { setError('Supabase is required to add inventory safely.'); return }

    setBusy(true)
    try {
      const expenseCategoryId = quantity > 0 ? await resolveInventoryExpenseCategory() : ''
      const created = createInventoryItem({
        sku: sku.trim(),
        name: name.trim(),
        description: description.trim(),
        categoryId,
        unitId,
        brand: brand.trim(),
        defaultSupplierId: supplierId || undefined,
        defaultReorderLevel: reorder,
        trackBatches: false,
        trackExpiry: false,
        expiryWarningDays: 60,
        status: 'active',
      })
      await waitForInventoryItem(created.itemCode)

      if (quantity > 0) {
        await stockInPersisted({
          branchId,
          itemId: created.id,
          quantity,
          unitCostCents: Math.round(pricePhp * 100),
          reason: 'Opening stock recorded during inventory item setup',
          receivedDate: todayManila(),
          reference: `Opening stock · ${created.itemCode}`,
        })

        try {
          await createExpensePersisted({
            scope: 'branch',
            branchId,
            categoryId: expenseCategoryId,
            payeeName: selectedSupplier?.name || 'Inventory supplier',
            description: `Opening inventory purchase · ${created.name}`,
            expenseDate: todayManila(),
            subtotalCents: totalCents,
            referenceNumber: created.itemCode,
            sourceType: 'other',
            sourceId: created.id,
            notes: `Automatically recorded from Inventory: ${quantity.toLocaleString('en-PH')} ${selectedUnit?.abbreviation ?? unitId} × ${php(Math.round(pricePhp * 100))} unit price.`,
          })
        } catch (expenseError) {
          throw new Error(`Inventory stock was saved, but its expense log could not be created. ${expenseError instanceof Error ? expenseError.message : ''}`.trim())
        }
      }

      await refreshInventoryOperationalCaches({ branchIds: branchId ? [branchId] : undefined })
      onSaved()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add this inventory item.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="inv182-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <form className="inv182-add-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="inv182-add-title">
      <header><div className="inv182-modal-icon"><PackagePlus size={20}/></div><div><span>Inventory setup</span><h2 id="inv182-add-title">Add inventory item</h2><p>Create the item, record opening stock, and automatically log its purchase cost in Expenses.</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="Close"><X size={18}/></button></header>
      <div className="inv182-modal-body">
        <section><div className="inv182-step"><b>1</b><div><strong>Item details</strong><small>Information staff will use to identify this supply.</small></div></div><div className="inv182-form-grid">
          <label><span>Item name</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Saliva ejectors" /></label>
          <label><span>SKU / stock code</span><input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Optional" /></label>
          <label><span>Brand</span><input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Optional" /></label>
          <label><span>Category</span><select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{categories.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label><span>Counting unit</span><select value={unitId} onChange={(e) => setUnitId(e.target.value)}>{units.map((row) => <option key={row.id} value={row.id}>{row.label} ({row.abbreviation})</option>)}</select></label>
          <label><span>Default supplier</span><select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">No supplier</option>{suppliers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label><span>Reorder level</span><input type="number" min="0" step="0.001" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} /></label>
          <label className="is-wide"><span>Description</span><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        </div></section>

        <section><div className="inv182-step"><b>2</b><div><strong>Opening stock & cost</strong><small>If stock is already on hand, its purchase cost will be recorded in Expenses automatically.</small></div></div><div className="inv182-form-grid">
          <label><span>Branch</span><select value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">Select branch</option>{branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label><span>Opening quantity</span><input type="number" min="0" step="0.001" value={openingQuantity} onChange={(e) => setOpeningQuantity(e.target.value)} /></label>
          <label><span>Unit purchase price (PHP)</span><input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} /></label>
          <div className="inv182-cost-preview"><span>Expense to record</span><strong>{php(totalCents)}</strong><small>{quantity > 0 ? `${quantity.toLocaleString('en-PH')} × ${php(Math.round(Math.max(0, pricePhp) * 100))}` : 'No opening stock = no expense entry'}</small></div>
        </div><div className="inv182-accounting-note"><ShieldCheck size={17}/><div><strong>Database-backed accounting</strong><span>Opening stock is posted to Supabase first. When quantity is greater than zero, the purchase total is also created as a branch expense with a source link to this inventory item.</span></div></div></section>
        {error && <div className="inv182-error" role="alert"><AlertTriangle size={16}/><span>{error}</span></div>}
      </div>
      <footer><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving to database…' : 'Add inventory item'}</Button></footer>
    </form>
  </div>
}

type BranchTab = 'stock' | 'purchasing' | 'movements' | 'management'

export function InventoryPageV182() {
  const { user } = useAuth()
  const permissions = usePermissions()
  const {
    activeBranch,
    activeBranchId,
    availableBranches,
    authorizedBranchIds,
    hasBranchAccess,
    isAllBranchesMode,
    isLoading: branchLoading,
    setActiveBranch,
  } = useBranchContext()
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<InventoryDialog | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [tab, setTab] = useState<BranchTab>('stock')
  const [search, setSearch] = useState('')
  const requestRef = useRef(0)

  const branches = useMemo(() => { void revision; return getStoredBranches().filter((row) => row.status === 'active') }, [revision])
  const items = useMemo(() => { void revision; return getInventoryItems().filter((row) => row.status === 'active') }, [revision])
  const stocks = useMemo(() => { void revision; return getBranchInventory() }, [revision])
  const suppliers = useMemo(() => { void revision; return getSuppliers().filter((row) => row.status === 'active') }, [revision])
  const orders = useMemo(() => { void revision; return getPurchaseOrders() }, [revision])
  const movements = useMemo(() => { void revision; return getStockMovements() }, [revision])
  const transfers = useMemo(() => { void revision; return getStockTransfers() }, [revision])
  const counts = useMemo(() => { void revision; return getStockCounts() }, [revision])
  const itemMap = useMemo(() => new Map(items.map((row) => [row.id, row])), [items])
  const branchMap = useMemo(() => new Map(branches.map((row) => [row.id, row])), [branches])
  const supplierMap = useMemo(() => new Map(suppliers.map((row) => [row.id, row])), [suppliers])

  const scopedBranchIds = isAllBranchesMode ? authorizedBranchIds : activeBranchId ? [activeBranchId] : []
  const scopeKey = `${isAllBranchesMode ? 'all' : activeBranchId ?? 'none'}:${scopedBranchIds.join(',')}`

  async function refresh() {
    if (!isSupabaseConfigured || !supabase || !scopedBranchIds.length) { setLoading(false); return }
    const requestId = ++requestRef.current
    setLoading(true); setError(null)
    try {
      await refreshInventoryOperationalCaches({ branchIds: isAllBranchesMode ? undefined : scopedBranchIds })
      if (requestRef.current === requestId) setRevision((value) => value + 1)
    } catch (cause) {
      if (requestRef.current === requestId) setError(cause instanceof Error ? cause.message : 'Unable to load inventory from Supabase.')
    } finally {
      if (requestRef.current === requestId) setLoading(false)
    }
  }

  useEffect(() => { if (!branchLoading) void refresh() }, [branchLoading, scopeKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSearch(''); setTab('stock'); setDialog(null) }, [activeBranchId, isAllBranchesMode])

  if (branchLoading || loading) return <InventorySkeleton />
  if (error) return <section className="inv182-page"><div className="inv182-load-error"><AlertTriangle size={26}/><h2>Inventory could not be loaded</h2><p>{error}</p><Button onClick={() => void refresh()}>Retry</Button></div></section>
  if (!isAllBranchesMode && (!activeBranch || !activeBranchId || !hasBranchAccess)) return <section className="inv182-page"><div className="inv182-load-error"><Building2 size={26}/><h2>No inventory branch assigned</h2><p>This account needs an active branch assignment before inventory operations can be opened.</p></div></section>

  const activeBranches = availableBranches.length ? availableBranches : branches
  const visibleStocks = isAllBranchesMode ? stocks.filter((row) => scopedBranchIds.includes(row.branchId)) : stocks.filter((row) => row.branchId === activeBranchId)
  const lowStock = visibleStocks.filter((row) => getStockStatus(row) === 'low_stock')
  const outOfStock = visibleStocks.filter((row) => getStockStatus(row) === 'out_of_stock')
  const pendingOrders = orders.filter((row) => scopedBranchIds.includes(row.branchId) && ['ordered', 'partially_received'].includes(row.status))
  const pendingTransfers = transfers.filter((row) => (scopedBranchIds.includes(row.fromBranchId) || scopedBranchIds.includes(row.toBranchId)) && ['draft', 'in_transit'].includes(row.status))
  const openCounts = counts.filter((row) => scopedBranchIds.includes(row.branchId) && ['draft', 'reviewed'].includes(row.status))
  const inventoryValue = visibleStocks.reduce((sum, row) => sum + Number(row.quantityOnHand || 0) * Number(row.averageUnitCostCents || 0), 0)
  const totalOnHand = visibleStocks.reduce((sum, row) => sum + Number(row.quantityOnHand || 0), 0)

  const afterAction = () => { setDialog(null); void refresh() }

  if (isAllBranchesMode) {
    const summaries = activeBranches.map((branch) => {
      const branchStocks = stocks.filter((row) => row.branchId === branch.id)
      return {
        branch,
        items: branchStocks.length,
        low: branchStocks.filter((row) => getStockStatus(row) === 'low_stock').length,
        out: branchStocks.filter((row) => getStockStatus(row) === 'out_of_stock').length,
        value: branchStocks.reduce((sum, row) => sum + Number(row.quantityOnHand || 0) * Number(row.averageUnitCostCents || 0), 0),
        orders: orders.filter((row) => row.branchId === branch.id && ['ordered', 'partially_received'].includes(row.status)).length,
      }
    })
    return <section className="inv182-page is-all-branches">
      <header className="inv182-hero inv182-all-hero"><div><span>Clinic inventory</span><h2>All branches overview</h2><p>See what needs attention first, compare locations, then open a branch to perform stock operations.</p></div><div className="inv182-hero-value"><Building2 size={17}/><span>{activeBranches.length} active branches</span><strong>{php(inventoryValue)}</strong><small>recorded inventory value</small></div></header>

      <section className="inv182-priority-grid" aria-label="Inventory attention summary">
        <article className={lowStock.length ? 'is-warning' : ''}><PackageMinus size={18}/><div><span>Low stock</span><strong>{lowStock.length}</strong><small>review reorder levels</small></div></article>
        <article className={outOfStock.length ? 'is-danger' : ''}><PackageX size={18}/><div><span>Out of stock</span><strong>{outOfStock.length}</strong><small>replenishment needed</small></div></article>
        <article><ClipboardList size={18}/><div><span>Pending orders</span><strong>{pendingOrders.length}</strong><small>awaiting receipt</small></div></article>
        <article><ArrowRightLeft size={18}/><div><span>Movement queue</span><strong>{pendingTransfers.length + openCounts.length}</strong><small>transfers + stock counts</small></div></article>
      </section>

      <section className="inv182-section"><header className="inv182-section-head"><div><span>Branch comparison</span><h3>Choose a location</h3><p>Branch cards summarize stock health without mixing in day-to-day controls.</p></div></header><div className="inv182-branch-grid">{summaries.map((summary) => <article key={summary.branch.id} className="inv182-branch-card"><header><i><Building2 size={18}/></i><div><h3>{summary.branch.name}</h3><p>{summary.branch.city || summary.branch.code}</p></div></header><div className="inv182-branch-stats"><div><span>Items</span><strong>{summary.items}</strong></div><div className={summary.low ? 'is-warning' : ''}><span>Low</span><strong>{summary.low}</strong></div><div className={summary.out ? 'is-danger' : ''}><span>Out</span><strong>{summary.out}</strong></div><div><span>Value</span><strong>{php(summary.value)}</strong></div></div><footer><span>{summary.orders} pending order{summary.orders === 1 ? '' : 's'}</span><Button size="sm" variant="secondary" onClick={() => setActiveBranch(summary.branch.id)}>Open branch</Button></footer></article>)}</div></section>

      <section className="inv182-section"><header className="inv182-section-head"><div><span>Needs attention</span><h3>Operational queues</h3><p>Only unresolved stock, purchasing, and movement records appear here.</p></div></header><div className="inv182-attention-grid">
        <article className="inv182-queue-card"><header><i className="is-danger"><AlertTriangle size={17}/></i><div><span>Stock risk</span><h4>Low & out-of-stock</h4></div><b>{lowStock.length + outOfStock.length}</b></header><div className={SCROLL_LIMIT_CLASS}>{[...outOfStock, ...lowStock].map((stock) => { const item = itemMap.get(stock.itemId); return <div className="inv182-queue-row" key={stock.id}><i><Package size={15}/></i><div><strong>{item?.name ?? stock.itemId}</strong><small>{branchMap.get(stock.branchId)?.name ?? stock.branchId} · {labelize(getStockStatus(stock))}</small></div><b>{Number(stock.quantityOnHand || 0).toLocaleString('en-PH')}</b></div>})}{!lowStock.length && !outOfStock.length && <div className="inv182-empty-small"><CheckCircle2 size={20}/><span>No stock risks need attention.</span></div>}</div></article>
        <article className="inv182-queue-card"><header><i><ClipboardList size={17}/></i><div><span>Purchasing</span><h4>Pending orders</h4></div><b>{pendingOrders.length}</b></header><div className={SCROLL_LIMIT_CLASS}>{pendingOrders.map((order) => <div className="inv182-queue-row" key={order.id}><i><ClipboardList size={15}/></i><div><strong>{order.poNumber}</strong><small>{branchMap.get(order.branchId)?.name ?? order.branchId} · {supplierMap.get(order.supplierId)?.name ?? 'Supplier'}</small></div><b>{php(order.totalCents)}</b></div>)}{!pendingOrders.length && <div className="inv182-empty-small"><CheckCircle2 size={20}/><span>No pending purchase orders.</span></div>}</div></article>
        <article className="inv182-queue-card"><header><i><ArrowRightLeft size={17}/></i><div><span>Transfers</span><h4>Branch movement queue</h4></div><b>{pendingTransfers.length}</b></header><div className={SCROLL_LIMIT_CLASS}>{pendingTransfers.map((transfer) => <div className="inv182-queue-row" key={transfer.id}><i><ArrowRightLeft size={15}/></i><div><strong>{transfer.transferNumber}</strong><small>{branchMap.get(transfer.fromBranchId)?.name ?? transfer.fromBranchId} → {branchMap.get(transfer.toBranchId)?.name ?? transfer.toBranchId}</small></div><StatusBadge status={transfer.status} label={labelize(transfer.status)} variant="compact" /></div>)}{!pendingTransfers.length && <div className="inv182-empty-small"><CheckCircle2 size={20}/><span>No transfers are waiting.</span></div>}</div></article>
      </div></section>

      <section className="inv182-insight-strip"><div><span>Catalog items</span><strong>{items.length}</strong></div><div><span>Total on hand</span><strong>{totalOnHand.toLocaleString('en-PH')}</strong></div><div><span>Active suppliers</span><strong>{suppliers.length}</strong></div><div><span>Open stock counts</span><strong>{openCounts.length}</strong></div></section>
    </section>
  }

  const branch = activeBranch!
  const branchItems = visibleStocks.map((stock) => ({ stock, item: itemMap.get(stock.itemId) })).filter((row): row is { stock: typeof visibleStocks[number]; item: InventoryItem } => Boolean(row.item))
  const query = search.trim().toLowerCase()
  const filteredItems = branchItems.filter(({ item }) => !query || [item.name, item.itemCode, item.sku, item.brand].join(' ').toLowerCase().includes(query))
  const branchOrders = orders.filter((row) => row.branchId === branch.id && (!query || [row.poNumber, supplierMap.get(row.supplierId)?.name].join(' ').toLowerCase().includes(query)))
  const branchMovements = movements.filter((row) => row.branchId === branch.id && (!query || [itemMap.get(row.itemId)?.name, row.reason, row.movementType].join(' ').toLowerCase().includes(query)))
  const branchTransfers = transfers.filter((row) => (row.fromBranchId === branch.id || row.toBranchId === branch.id) && (!query || row.transferNumber.toLowerCase().includes(query)))
  const branchCounts = counts.filter((row) => row.branchId === branch.id && (!query || row.countNumber.toLowerCase().includes(query)))

  return <section className="inv182-page is-branch">
    <header className="inv182-hero"><div><span>Branch inventory</span><h2>Inventory</h2><p>Track stock and purchasing for <strong>{branch.name}</strong> without leaving the branch workspace.</p></div><div className="inv182-hero-actions">{permissions.can('inventory.create_item') && <Button onClick={() => setAddOpen(true)}><PackagePlus size={15}/> Add item</Button>}<Button variant="secondary" onClick={() => setTab('movements')}><ArrowRightLeft size={15}/> Movements</Button></div></header>

    <section className="inv182-branch-summary"><div><span>Total on hand</span><strong>{totalOnHand.toLocaleString('en-PH')}</strong></div>{permissions.can('inventory.view_cost') && <div><span>Inventory value</span><strong>{php(inventoryValue)}</strong></div>}<div><span>Pending orders</span><strong>{pendingOrders.length}</strong></div><div><span>Pending transfers</span><strong>{pendingTransfers.length}</strong></div><div><span>Open counts</span><strong>{openCounts.length}</strong></div></section>

    <section className="inv182-health-grid"><article><i><Boxes size={17}/></i><div><span>Total items</span><strong>{branchItems.length}</strong><small>active positions</small></div></article><article className={lowStock.length ? 'is-warning' : ''}><i><PackageMinus size={17}/></i><div><span>Low stock</span><strong>{lowStock.length}</strong><small>needs review</small></div></article><article className={outOfStock.length ? 'is-danger' : ''}><i><PackageX size={17}/></i><div><span>Out of stock</span><strong>{outOfStock.length}</strong><small>replenish soon</small></div></article><article><i><CalendarClock size={17}/></i><div><span>Open counts</span><strong>{openCounts.length}</strong><small>inventory checks</small></div></article></section>

    <section className="inv182-workspace">
      <nav className="inv182-tabs" aria-label="Inventory sections">{([['stock','Stock'],['purchasing','Purchasing'],['movements','Movements'],['management','Management']] as Array<[BranchTab,string]>).map(([key,label]) => <button key={key} type="button" className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>{label}</button>)}</nav>
      <label className="inv182-search"><Search size={16}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${branch.name} inventory`} /></label>
    </section>

    {tab === 'stock' && <section className="inv182-section"><header className="inv182-section-head"><div><span>Stock</span><h3>Inventory items</h3><p>Open stock actions directly from each item. The list scrolls instead of expanding the whole page.</p></div><b>{filteredItems.length} items</b></header><div className={`${SCROLL_LIMIT_CLASS} inv182-stock-list`}>{filteredItems.map(({ item, stock }) => <article key={stock.id} className="inv182-stock-row"><i><Package size={17}/></i><div className="inv182-stock-copy"><span>{item.itemCode}</span><strong>{item.name}</strong><small>{item.brand || 'No brand'} · {labelize(getStockStatus(stock))}</small></div><div className="inv182-stock-qty"><span>On hand</span><strong>{Number(stock.quantityOnHand || 0).toLocaleString('en-PH')}</strong>{permissions.can('inventory.view_cost') && <small>{php(Number(stock.averageUnitCostCents || 0))} avg/unit</small>}</div><StatusBadge status={getStockStatus(stock)} label={labelize(getStockStatus(stock))} variant="compact" /><div className="inv182-row-actions">{permissions.can('inventory.stock_in') && <Button size="sm" variant="secondary" onClick={() => setDialog({ type:'stock_in', item })}>Stock in</Button>}{permissions.can('inventory.stock_out') && <Button size="sm" variant="secondary" onClick={() => setDialog({ type:'stock_out', item })}>Stock out</Button>}{permissions.can('inventory.adjust') && <Button size="sm" variant="ghost" onClick={() => setDialog({ type:'adjust', item })}>Adjust</Button>}</div></article>)}{!filteredItems.length && <div className="inv182-empty"><Package size={24}/><strong>No inventory items found</strong><span>{query ? 'Try another search.' : 'Add the first item to start tracking stock.'}</span></div>}</div></section>}

    {tab === 'purchasing' && <section className="inv182-two-column"><article className="inv182-list-card"><header><div><span>Purchasing</span><h3>Orders</h3><p>Purchase orders for this branch.</p></div>{permissions.canAny(['purchase_orders.create','purchases.create']) && <Button size="sm" onClick={() => setDialog({ type:'purchase_order' })}><ClipboardList size={14}/> New PO</Button>}</header><div className={SCROLL_LIMIT_CLASS}>{branchOrders.map((order) => <div className="inv182-list-row" key={order.id}><i><ClipboardList size={16}/></i><div><strong>{order.poNumber}</strong><span>{supplierMap.get(order.supplierId)?.name ?? 'Supplier'}</span><small>{labelize(order.status)} · {dateTime(order.createdAt)}</small></div><b>{php(order.totalCents)}</b>{permissions.can('purchase_orders.receive') && ['ordered','partially_received'].includes(order.status) && <Button size="sm" variant="secondary" onClick={() => setDialog({ type:'receive_po', poId:order.id })}>Receive</Button>}</div>)}{!branchOrders.length && <div className="inv182-empty-small"><ClipboardList size={20}/><span>No purchase orders match this view.</span></div>}</div></article><article className="inv182-list-card"><header><div><span>Suppliers</span><h3>Supply directory</h3><p>Clinic suppliers available to purchasing.</p></div>{permissions.can('suppliers.manage') && <Button size="sm" variant="secondary" onClick={() => setDialog({ type:'add_supplier' })}><Truck size={14}/> Add supplier</Button>}</header><div className={SCROLL_LIMIT_CLASS}>{suppliers.filter((row) => !query || [row.name,row.contactPerson,row.phone,row.email].join(' ').toLowerCase().includes(query)).map((supplier) => <div className="inv182-list-row" key={supplier.id}><i><Truck size={16}/></i><div><strong>{supplier.name}</strong><span>{supplier.contactPerson || 'No contact person'}</span><small>{supplier.phone || supplier.email || 'No contact details'}</small></div><StatusBadge status={supplier.status} label={labelize(supplier.status)} variant="compact" /></div>)}{!suppliers.length && <div className="inv182-empty-small"><Truck size={20}/><span>No suppliers have been added yet.</span></div>}</div></article></section>}

    {tab === 'movements' && <section className="inv182-two-column"><article className="inv182-list-card"><header><div><span>Stock ledger</span><h3>Recent movements</h3><p>Stock in, stock out, and adjustments.</p></div><b>{branchMovements.length}</b></header><div className={SCROLL_LIMIT_CLASS}>{branchMovements.map((movement) => <div className="inv182-list-row" key={movement.id}><i className={Number(movement.quantityAfter) >= Number(movement.quantityBefore) ? 'is-positive' : 'is-negative'}><Package size={16}/></i><div><strong>{labelize(movement.movementType)}</strong><span>{itemMap.get(movement.itemId)?.name ?? movement.itemId}</span><small>{movement.reason || 'No note'} · {dateTime(movement.createdAt)}</small></div><b className={Number(movement.quantityAfter) >= Number(movement.quantityBefore) ? 'is-positive' : 'is-negative'}>{movementDelta(movement)}</b></div>)}{!branchMovements.length && <div className="inv182-empty-small"><Package size={20}/><span>No stock movements yet.</span></div>}</div></article><article className="inv182-list-card"><header><div><span>Transfers</span><h3>Branch movement queue</h3><p>Transfers entering or leaving this branch.</p></div><b>{branchTransfers.length}</b></header><div className={SCROLL_LIMIT_CLASS}>{branchTransfers.map((transfer) => <div className="inv182-list-row" key={transfer.id}><i><ArrowRightLeft size={16}/></i><div><strong>{transfer.transferNumber}</strong><span>{branchMap.get(transfer.fromBranchId)?.name ?? transfer.fromBranchId} → {branchMap.get(transfer.toBranchId)?.name ?? transfer.toBranchId}</span><small>{transfer.items.map((entry) => `${itemMap.get(entry.itemId)?.name ?? entry.itemId} (${entry.quantity})`).join(', ')}</small></div><StatusBadge status={transfer.status} label={labelize(transfer.status)} variant="compact" /></div>)}{!branchTransfers.length && <div className="inv182-empty-small"><ArrowRightLeft size={20}/><span>No branch transfers yet.</span></div>}</div></article></section>}

    {tab === 'management' && <section className="inv182-two-column"><article className="inv182-list-card"><header><div><span>Stock counts</span><h3>Count & reconcile</h3><p>Physical inventory sessions for this branch.</p></div>{permissions.can('inventory.adjust') && <Button size="sm" onClick={() => setDialog({ type:'stock_count' })}><ClipboardCheck size={14}/> Start count</Button>}</header><div className={SCROLL_LIMIT_CLASS}>{branchCounts.map((count) => <div className="inv182-list-row" key={count.id}><i><ClipboardCheck size={16}/></i><div><strong>{count.countNumber}</strong><span>{labelize(count.status)}</span><small>{count.items.length} count lines · {dateTime(count.createdAt)}</small></div><StatusBadge status={count.status} label={labelize(count.status)} variant="compact" /></div>)}{!branchCounts.length && <div className="inv182-empty-small"><ClipboardCheck size={20}/><span>No stock counts for this branch.</span></div>}</div></article><article className="inv182-list-card inv182-management-card"><header><div><span>Inventory controls</span><h3>Quick management</h3><p>Common setup and procurement actions.</p></div></header><div className="inv182-management-actions">{permissions.can('inventory.create_item') && <button type="button" onClick={() => setAddOpen(true)}><PackagePlus size={18}/><span><strong>Add item</strong><small>Create catalog item + opening cost</small></span></button>}{permissions.canAny(['purchase_orders.create','purchases.create']) && <button type="button" onClick={() => setDialog({ type:'purchase_order' })}><ClipboardList size={18}/><span><strong>New purchase order</strong><small>Order supplies for {branch.name}</small></span></button>}{permissions.can('suppliers.manage') && <button type="button" onClick={() => setDialog({ type:'add_supplier' })}><Truck size={18}/><span><strong>Add supplier</strong><small>Maintain the supply directory</small></span></button>}{permissions.can('inventory.adjust') && <button type="button" onClick={() => setDialog({ type:'stock_count' })}><ClipboardCheck size={18}/><span><strong>Start stock count</strong><small>Verify physical quantity</small></span></button>}</div></article></section>}

    {addOpen && <AddInventoryItemModal branches={[branch]} preferredBranchId={branch.id} onClose={() => setAddOpen(false)} onSaved={() => void refresh()} />}
    {dialog && <InventoryActionModal dialog={dialog} branches={dialog.type === 'create_transfer' || dialog.type === 'quick_transfer' ? activeBranches : [branch]} preferredBranchId={branch.id} onClose={() => setDialog(null)} onSuccess={afterAction} />}
  </section>
}
