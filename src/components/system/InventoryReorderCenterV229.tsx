import { AlertTriangle, ClipboardPlus, PackageSearch, ShoppingCart, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePermissions } from '../../features/auth/permissions'
import { useBranchContext } from '../../features/branches/BranchContext'
import { getStoredBranches } from '../../features/branches/branchStore'
import { createPurchaseOrderPersisted } from '../../features/inventory/inventorySetupPersistence'
import {
  getBranchInventory,
  getInventoryItems,
  getPurchaseOrders,
  getSuppliers,
  type InventoryItem,
} from '../../features/inventory/inventoryStore'
import { acquireModalScrollLock } from '../../lib/modalScrollLock'
import '../../styles/inventory-reorder-center-v229.css'

type ReorderRow = {
  item: InventoryItem
  branchId: string
  onHand: number
  reorderLevel: number
  outstanding: number
  suggested: number
  averageUnitCostCents: number
  severity: 'out' | 'low'
}

function php(cents = 0) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(cents || 0) / 100)
}

function todayManila() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export function InventoryReorderCenterV229() {
  const permissions = usePermissions()
  const canCreatePo = permissions.can('purchase_orders.create') || permissions.can('purchases.create')
  const { activeBranchId, authorizedBranchIds, isAllBranchesMode } = useBranchContext()
  const [revision, setRevision] = useState(0)
  const [mount, setMount] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<ReorderRow | null>(null)
  const [search, setSearch] = useState('')

  const items = useMemo(() => { void revision; return getInventoryItems().filter((item) => item.status === 'active') }, [revision])
  const stocks = useMemo(() => { void revision; return getBranchInventory() }, [revision])
  const orders = useMemo(() => { void revision; return getPurchaseOrders() }, [revision])
  const suppliers = useMemo(() => { void revision; return getSuppliers().filter((supplier) => supplier.status === 'active') }, [revision])
  const branches = useMemo(() => { void revision; return getStoredBranches().filter((branch) => branch.status === 'active') }, [revision])
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches])
  const supplierMap = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])), [suppliers])

  const rows = useMemo<ReorderRow[]>(() => {
    const result: ReorderRow[] = []
    const scope = isAllBranchesMode ? authorizedBranchIds : activeBranchId ? [activeBranchId] : []
    for (const branchId of scope) {
      for (const item of items) {
        const stock = stocks.find((entry) => entry.branchId === branchId && entry.itemId === item.id)
        const onHand = Number(stock?.quantityOnHand ?? 0)
        const reorderLevel = Number(stock?.reorderLevel ?? item.defaultReorderLevel ?? 0)
        if (onHand > reorderLevel || (reorderLevel <= 0 && onHand > 0)) continue

        const outstanding = orders
          .filter((order) => order.branchId === branchId && ['ordered', 'partially_received'].includes(order.status))
          .flatMap((order) => order.items)
          .filter((line) => line.itemId === item.id)
          .reduce((sum, line) => sum + Math.max(0, Number(line.quantityOrdered || 0) - Number(line.quantityReceived || 0)), 0)

        const target = Math.max(1, reorderLevel * 2, reorderLevel + 1)
        const suggested = Math.max(0, target - onHand - outstanding)
        result.push({
          item,
          branchId,
          onHand,
          reorderLevel,
          outstanding,
          suggested,
          averageUnitCostCents: Number(stock?.averageUnitCostCents ?? 0),
          severity: onHand <= 0 ? 'out' : 'low',
        })
      }
    }
    return result.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'out' ? -1 : 1
      return a.onHand - b.onHand || a.item.name.localeCompare(b.item.name)
    })
  }, [activeBranchId, authorizedBranchIds, isAllBranchesMode, items, orders, stocks])

  const actionable = rows.filter((row) => row.suggested > 0)
  const alreadyCovered = rows.filter((row) => row.suggested === 0 && row.outstanding > 0)
  const withoutSupplier = actionable.filter((row) => !row.item.defaultSupplierId).length
  const visible = rows.filter((row) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [row.item.name, row.item.itemCode, row.item.sku, branchMap.get(row.branchId), row.item.defaultSupplierId ? supplierMap.get(row.item.defaultSupplierId) : '']
      .some((value) => String(value ?? '').toLowerCase().includes(q))
  })

  useEffect(() => {
    const page = document.querySelector('.page-inventory .inv182-page')
    if (!page) return
    let host = page.querySelector<HTMLElement>('[data-inv229-reorder-mount]')
    if (!host) {
      host = document.createElement('div')
      host.dataset.inv229ReorderMount = 'true'
      const workspace = page.querySelector('.inv182-workspace')
      if (workspace) workspace.insertAdjacentElement('beforebegin', host)
      else page.appendChild(host)
    }
    setMount(host)
    return () => { if (host?.isConnected) host.remove() }
  }, [])

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1)
    window.addEventListener('plamenco-inventory-updated', refresh)
    return () => window.removeEventListener('plamenco-inventory-updated', refresh)
  }, [])

  useEffect(() => {
    if (!open && !selected) return undefined
    return acquireModalScrollLock()
  }, [open, selected])

  const panel = mount ? createPortal(<section className="inv229-panel" aria-label="Low stock and reorder management">
    <div className="inv229-copy"><i><ShoppingCart size={19}/></i><div><span>Replenishment</span><h3>Low-stock & reorder management</h3><p>Turn branch stock shortages into purchase orders without ordering items that are already on the way.</p></div></div>
    <div className="inv229-stats">
      <div><span>Needs reorder</span><strong>{actionable.length}</strong></div>
      <div><span>Out of stock</span><strong>{rows.filter((row) => row.severity === 'out').length}</strong></div>
      <div><span>Covered by open PO</span><strong>{alreadyCovered.length}</strong></div>
      <div><span>No default supplier</span><strong>{withoutSupplier}</strong></div>
    </div>
    <button className="btn btn-secondary" type="button" onClick={() => setOpen(true)}>Review reorder queue</button>
  </section>, mount) : null

  return <>{panel}{open && createPortal(<div className="inv229-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
    <section className="inv229-modal" role="dialog" aria-modal="true" aria-labelledby="inv229-title">
      <header><div><span>Replenishment queue</span><h2 id="inv229-title">Low-stock items</h2><p>Suggested quantities target roughly twice the reorder threshold and subtract quantities already remaining on open purchase orders.</p></div><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={18}/></button></header>
      <div className="inv229-body">
        <div className="inv229-summary"><div><span>Queue</span><strong>{rows.length}</strong></div><div><span>Actionable</span><strong>{actionable.length}</strong></div><div><span>Already ordered</span><strong>{alreadyCovered.length}</strong></div><div><span>Estimated reorder value</span><strong>{php(actionable.reduce((sum, row) => sum + row.suggested * row.averageUnitCostCents, 0))}</strong></div></div>
        <label className="inv229-search"><PackageSearch size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item, branch, supplier…" /></label>
        <div className="inv229-head"><span>Item</span><span>Branch</span><span>Stock</span><span>Open PO</span><span>Suggested</span><span>Supplier</span><span></span></div>
        <div className="inv229-list">
          {visible.map((row) => <article className="inv229-row" key={`${row.branchId}:${row.item.id}`}>
            <div><strong>{row.item.name}</strong><span>{row.item.itemCode}{row.item.sku ? ` · ${row.item.sku}` : ''}</span></div>
            <div><strong>{branchMap.get(row.branchId) ?? 'Branch'}</strong><span>{row.severity === 'out' ? 'Out of stock' : 'Low stock'}</span></div>
            <div><strong>{row.onHand.toLocaleString('en-PH')}</strong><span>reorder at {row.reorderLevel.toLocaleString('en-PH')}</span></div>
            <div><strong>{row.outstanding.toLocaleString('en-PH')}</strong><span>remaining</span></div>
            <div><strong>{row.suggested.toLocaleString('en-PH')}</strong><span>{row.suggested > 0 ? 'recommended' : 'covered'}</span></div>
            <div><strong>{row.item.defaultSupplierId ? supplierMap.get(row.item.defaultSupplierId) ?? 'Supplier unavailable' : 'Not assigned'}</strong><span>{row.item.defaultSupplierId ? 'default supplier' : 'choose when ordering'}</span></div>
            <div>{row.suggested > 0 && canCreatePo ? <button className="btn btn-primary" type="button" onClick={() => { setSelected(row); setOpen(false) }}><ClipboardPlus size={14}/> Create PO</button> : row.suggested === 0 ? <span className="inv229-covered">Open PO covers need</span> : null}</div>
          </article>)}
          {!visible.length && <div className="inv229-empty"><ShoppingCart size={24}/><strong>No reorder items match</strong><span>{rows.length ? 'Try a different search.' : 'Current branch stock is above its reorder thresholds.'}</span></div>}
        </div>
      </div>
    </section>
  </div>, document.body)}{selected && <CreateReorderPoModal row={selected} suppliers={suppliers} branchName={branchMap.get(selected.branchId) ?? 'Branch'} onClose={() => { setSelected(null); setOpen(true) }} onSaved={() => { setSelected(null); setRevision((value) => value + 1); window.dispatchEvent(new Event('plamenco-inventory-updated')) }} />}</>
}

function CreateReorderPoModal({ row, suppliers, branchName, onClose, onSaved }: {
  row: ReorderRow
  suppliers: Array<{ id: string; name: string }>
  branchName: string
  onClose: () => void
  onSaved: () => void
}) {
  const [supplierId, setSupplierId] = useState(row.item.defaultSupplierId && suppliers.some((supplier) => supplier.id === row.item.defaultSupplierId) ? row.item.defaultSupplierId : suppliers[0]?.id ?? '')
  const [quantity, setQuantity] = useState(String(Math.max(1, row.suggested)))
  const [unitCost, setUnitCost] = useState((row.averageUnitCostCents / 100).toFixed(2))
  const [expectedDate, setExpectedDate] = useState('')
  const [notes, setNotes] = useState(`Reorder for ${row.item.name}. Current stock ${row.onHand}; reorder level ${row.reorderLevel}.`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => acquireModalScrollLock(), [])

  async function submit() {
    if (busy) return
    const qty = Number(quantity)
    const costCents = Math.round(Number(unitCost) * 100)
    if (!supplierId) { setError('Choose a supplier before creating the purchase order.'); return }
    if (!Number.isFinite(qty) || qty <= 0) { setError('Order quantity must be greater than zero.'); return }
    if (!Number.isFinite(costCents) || costCents < 0) { setError('Unit cost must be zero or greater.'); return }
    setBusy(true); setError(null)
    try {
      await createPurchaseOrderPersisted({
        supplierId,
        branchId: row.branchId,
        orderDate: todayManila(),
        expectedDeliveryDate: expectedDate || undefined,
        items: [{ id: `po-line-${Date.now()}`, itemId: row.item.id, quantityOrdered: qty, quantityReceived: 0, unitCostCents: costCents }],
        notes: notes.trim(),
      })
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Purchase order could not be created.')
    } finally { setBusy(false) }
  }

  return createPortal(<div className="inv229-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="inv229-modal inv229-create" role="dialog" aria-modal="true" aria-labelledby="inv229-create-title">
      <header><div><span>Replenishment order</span><h2 id="inv229-create-title">Create purchase order</h2><p>{row.item.name} · {branchName}</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="Close"><X size={18}/></button></header>
      <div className="inv229-body">
        <div className="inv229-order-context"><div><span>On hand</span><strong>{row.onHand.toLocaleString('en-PH')}</strong></div><div><span>Reorder level</span><strong>{row.reorderLevel.toLocaleString('en-PH')}</strong></div><div><span>Already on PO</span><strong>{row.outstanding.toLocaleString('en-PH')}</strong></div><div><span>Suggested</span><strong>{row.suggested.toLocaleString('en-PH')}</strong></div></div>
        <div className="inv229-fields"><label><span>Supplier</span><select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label><span>Order quantity</span><input type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label><span>Unit cost (PHP)</span><input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></label><label><span>Expected delivery</span><input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></label><label className="is-wide"><span>Notes</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div>
        <div className="inv229-note"><AlertTriangle size={16}/><span>Creating the PO does not change stock. Inventory changes only when the purchase order is received.</span></div>
        {error && <div className="inv229-error" role="alert">{error}</div>}
      </div>
      <footer><button className="btn btn-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="btn btn-primary" type="button" onClick={() => void submit()} disabled={busy}>{busy ? 'Creating…' : 'Create purchase order'}</button></footer>
    </section>
  </div>, document.body)
}
