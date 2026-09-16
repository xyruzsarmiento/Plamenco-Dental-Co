import { AlertTriangle, CalendarClock, CheckCircle2, PackageSearch, ShieldCheck, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePermissions } from '../../features/auth/permissions'
import { useBranchContext } from '../../features/branches/BranchContext'
import { getStoredBranches } from '../../features/branches/branchStore'
import { disposeExpiredBatchPersisted } from '../../features/inventory/inventoryBatchPersistence'
import {
  getBranchInventory,
  getInventoryBatches,
  getInventoryItems,
  getSuppliers,
  type InventoryBatch,
} from '../../features/inventory/inventoryStore'
import { acquireModalScrollLock } from '../../lib/modalScrollLock'
import '../../styles/inventory-batch-expiry-v227.css'

type Filter = 'all' | 'expiring' | 'expired'
type Mode = 'list' | 'dispose' | null

function todayManila() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00+08:00`)
  date.setUTCDate(date.getUTCDate() + days)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function formatDate(value?: string) {
  if (!value) return 'Not tracked'
  const date = new Date(`${value}T00:00:00+08:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
}

function php(cents = 0) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(cents || 0) / 100)
}

function quantity(value: number) {
  return Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 3 })
}

export function InventoryBatchExpiryV227() {
  const permissions = usePermissions()
  const canAdjust = permissions.can('inventory.adjust')
  const { activeBranchId, authorizedBranchIds, isAllBranchesMode } = useBranchContext()
  const [revision, setRevision] = useState(0)
  const [mount, setMount] = useState<HTMLElement | null>(null)
  const [mode, setMode] = useState<Mode>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [disposeQuantity, setDisposeQuantity] = useState('0')
  const [reason, setReason] = useState('Expired stock removed from usable inventory')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const items = useMemo(() => { void revision; return getInventoryItems() }, [revision])
  const suppliers = useMemo(() => { void revision; return getSuppliers() }, [revision])
  const branches = useMemo(() => { void revision; return getStoredBranches() }, [revision])
  const stocks = useMemo(() => { void revision; return getBranchInventory() }, [revision])
  const batches = useMemo(() => {
    void revision
    const rows = getInventoryBatches().filter((batch) => Number(batch.quantityOnHand || 0) > 0 && authorizedBranchIds.includes(batch.branchId))
    if (isAllBranchesMode) return rows
    return activeBranchId ? rows.filter((batch) => batch.branchId === activeBranchId) : []
  }, [activeBranchId, authorizedBranchIds, isAllBranchesMode, revision])

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const supplierMap = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])), [suppliers])
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches])
  const today = todayManila()

  const classified = useMemo(() => batches.map((batch) => {
    const item = itemMap.get(batch.itemId)
    const expiry = batch.expiryDate || ''
    const warningDays = Math.max(1, Number(item?.expiryWarningDays || 60))
    const expired = Boolean(expiry && expiry <= today)
    const expiring = Boolean(expiry && !expired && expiry <= addDays(today, warningDays))
    return { batch, item, expired, expiring, warningDays }
  }).sort((a, b) => {
    if (!a.batch.expiryDate) return 1
    if (!b.batch.expiryDate) return -1
    return a.batch.expiryDate.localeCompare(b.batch.expiryDate)
  }), [batches, itemMap, today])

  const expiredRows = classified.filter((row) => row.expired)
  const expiringRows = classified.filter((row) => row.expiring)
  const expiredUnits = expiredRows.reduce((sum, row) => sum + Number(row.batch.quantityOnHand || 0), 0)
  const usableUnits = classified.filter((row) => !row.expired).reduce((sum, row) => sum + Number(row.batch.quantityOnHand || 0), 0)

  const reconciliationIssues = useMemo(() => {
    const rows: Array<{ itemId: string; branchId: string; batchQty: number; stockQty: number }> = []
    const trackedItems = items.filter((item) => item.status === 'active' && (item.trackBatches || item.trackExpiry))
    for (const item of trackedItems) {
      for (const branchId of authorizedBranchIds) {
        if (!isAllBranchesMode && activeBranchId !== branchId) continue
        const batchQty = batches.filter((batch) => batch.itemId === item.id && batch.branchId === branchId).reduce((sum, batch) => sum + Number(batch.quantityOnHand || 0), 0)
        const stockQty = Number(stocks.find((stock) => stock.itemId === item.id && stock.branchId === branchId)?.quantityOnHand || 0)
        if (Math.abs(batchQty - stockQty) > 0.0005) rows.push({ itemId: item.id, branchId, batchQty, stockQty })
      }
    }
    return rows
  }, [activeBranchId, authorizedBranchIds, batches, isAllBranchesMode, items, stocks])

  const visibleRows = classified.filter((row) => {
    if (filter === 'expired' && !row.expired) return false
    if (filter === 'expiring' && !row.expiring) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [row.item?.name, row.item?.itemCode, row.batch.batchNumber, branchMap.get(row.batch.branchId), row.batch.supplierId ? supplierMap.get(row.batch.supplierId) : '']
      .some((value) => String(value ?? '').toLowerCase().includes(q))
  })

  const selectedBatch = selectedBatchId ? batches.find((row) => row.id === selectedBatchId) ?? null : null
  const selectedItem = selectedBatch ? itemMap.get(selectedBatch.itemId) : undefined

  useEffect(() => {
    const page = document.querySelector('.page-inventory .inv182-page')
    if (!page) return
    let host = page.querySelector<HTMLElement>('[data-inv227-batch-mount]')
    if (!host) {
      host = document.createElement('div')
      host.dataset.inv227BatchMount = 'true'
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
    if (!mode) return undefined
    return acquireModalScrollLock()
  }, [mode])

  function closeModal() {
    if (busy) return
    setMode(null)
    setSelectedBatchId(null)
    setError(null)
  }

  function openDispose(batch: InventoryBatch) {
    setSelectedBatchId(batch.id)
    setDisposeQuantity(String(batch.quantityOnHand || 0))
    setReason('Expired stock removed from usable inventory')
    setError(null)
    setMode('dispose')
  }

  async function dispose() {
    if (!selectedBatch || busy) return
    const qty = Number(disposeQuantity)
    if (!Number.isFinite(qty) || qty <= 0) { setError('Enter a quantity greater than zero.'); return }
    if (qty > Number(selectedBatch.quantityOnHand || 0)) { setError('Quantity cannot exceed the remaining batch quantity.'); return }
    setBusy(true)
    setError(null)
    try {
      await disposeExpiredBatchPersisted({ batchId: selectedBatch.id, quantity: qty, reason: reason.trim() })
      setRevision((value) => value + 1)
      window.dispatchEvent(new Event('plamenco-inventory-updated'))
      setMode('list')
      setSelectedBatchId(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Expired stock could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  const panel = mount ? createPortal(<section className="inv227-panel" aria-label="Batch and expiry monitoring">
    <div className="inv227-panel-copy"><i><CalendarClock size={19}/></i><div><span>Expiry control</span><h3>Batch & expiry monitoring</h3><p>Separate usable stock from expiring and expired batches before materials are used clinically.</p></div></div>
    <div className="inv227-stats">
      <div><span>Usable batch units</span><strong>{quantity(usableUnits)}</strong></div>
      <div><span>Expiring soon</span><strong>{expiringRows.length}</strong></div>
      <div><span>Expired batches</span><strong>{expiredRows.length}</strong></div>
      <div><span>Expired units</span><strong>{quantity(expiredUnits)}</strong></div>
    </div>
    <button className="btn btn-secondary" type="button" onClick={() => { setError(null); setMode('list') }}>Review batches</button>
  </section>, mount) : null

  return <>{panel}{mode === 'list' && createPortal(<div className="inv227-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) closeModal() }}>
    <section className="inv227-modal inv227-list-modal" role="dialog" aria-modal="true" aria-labelledby="inv227-list-title">
      <header><div><span>Inventory safety</span><h2 id="inv227-list-title">Batch & expiry register</h2><p>Review remaining quantities, expiry windows, suppliers, and branch placement from the Supabase-backed batch ledger.</p></div><button type="button" onClick={closeModal} aria-label="Close"><X size={18}/></button></header>
      <div className="inv227-body">
        <div className="inv227-summary-grid"><div><span>Usable units</span><strong>{quantity(usableUnits)}</strong></div><div><span>Expiring soon</span><strong>{expiringRows.length}</strong></div><div><span>Expired units</span><strong>{quantity(expiredUnits)}</strong></div><div><span>Reconciliation checks</span><strong>{reconciliationIssues.length}</strong></div></div>
        {reconciliationIssues.length > 0 && <div className="inv227-notice"><AlertTriangle size={17}/><div><strong>Batch totals do not fully reconcile with branch stock.</strong><span>{reconciliationIssues.length} tracked item/branch position{reconciliationIssues.length === 1 ? '' : 's'} need review. This can happen when older stock was recorded before batch tracking was enabled.</span></div></div>}
        <div className="inv227-toolbar"><div className="inv227-filter-group"><button type="button" className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>All batches</button><button type="button" className={filter === 'expiring' ? 'is-active' : ''} onClick={() => setFilter('expiring')}>Expiring</button><button type="button" className={filter === 'expired' ? 'is-active' : ''} onClick={() => setFilter('expired')}>Expired</button></div><label><PackageSearch size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item, batch, branch…" /></label></div>
        <div className="inv227-table-head"><span>Item / batch</span><span>Branch</span><span>Quantity</span><span>Expiry</span><span>Source</span><span></span></div>
        <div className="inv227-list">
          {visibleRows.map(({ batch, item, expired, expiring, warningDays }) => <article className="inv227-row" key={batch.id}>
            <div className="inv227-item"><strong>{item?.name ?? 'Unavailable inventory item'}</strong><span>{batch.batchNumber || 'No batch number'} · {item?.itemCode ?? batch.itemId}</span><small>Received {formatDate(batch.receivedDate)} · {php(batch.unitCostCents)} / unit</small></div>
            <div><strong>{branchMap.get(batch.branchId) ?? 'Branch'}</strong><span>{item?.trackBatches ? 'Batch tracked' : 'Batch record'}</span></div>
            <div><strong>{quantity(batch.quantityOnHand)}</strong><span>remaining</span></div>
            <div><strong>{formatDate(batch.expiryDate)}</strong><span className={`inv227-state ${expired ? 'is-expired' : expiring ? 'is-expiring' : 'is-current'}`}>{expired ? 'Expired' : expiring ? `Within ${warningDays}d warning` : batch.expiryDate ? 'Current' : 'Not tracked'}</span></div>
            <div><strong>{batch.supplierId ? supplierMap.get(batch.supplierId) ?? 'Supplier' : 'No supplier'}</strong><span>{String(batch.sourceType || 'stock receipt').replaceAll('_', ' ')}</span></div>
            <div>{expired && Number(batch.quantityOnHand) > 0 && canAdjust ? <button className="btn btn-secondary" type="button" onClick={() => openDispose(batch)}>Remove expired</button> : <span className="inv227-safe"><CheckCircle2 size={14}/> Monitored</span>}</div>
          </article>)}
          {!visibleRows.length && <div className="inv227-empty"><ShieldCheck size={24}/><strong>No batches match this view</strong><span>{filter === 'expired' ? 'There is no remaining expired batch stock in the current branch scope.' : filter === 'expiring' ? 'No batches are inside their configured expiry warning window.' : 'No batch records with remaining quantity are available.'}</span></div>}
        </div>
      </div>
    </section>
  </div>, document.body)}{mode === 'dispose' && selectedBatch && createPortal(<div className="inv227-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) closeModal() }}>
    <section className="inv227-modal inv227-dispose-modal" role="dialog" aria-modal="true" aria-labelledby="inv227-dispose-title">
      <header><div><span>Expired inventory</span><h2 id="inv227-dispose-title">Remove expired batch stock</h2><p>This posts an Expired movement and reduces both the batch quantity and authoritative branch stock in one database transaction.</p></div><button type="button" onClick={closeModal} disabled={busy} aria-label="Close"><X size={18}/></button></header>
      <div className="inv227-body">
        <div className="inv227-dispose-summary"><div><span>Item</span><strong>{selectedItem?.name ?? 'Inventory item'}</strong></div><div><span>Batch</span><strong>{selectedBatch.batchNumber}</strong></div><div><span>Expiry</span><strong>{formatDate(selectedBatch.expiryDate)}</strong></div><div><span>Remaining</span><strong>{quantity(selectedBatch.quantityOnHand)}</strong></div></div>
        <label className="inv227-field"><span>Quantity to remove</span><input type="number" min="0.001" step="0.001" max={selectedBatch.quantityOnHand} value={disposeQuantity} onChange={(event) => setDisposeQuantity(event.target.value)} /></label>
        <label className="inv227-field"><span>Reason / disposal note</span><textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <div className="inv227-notice"><ShieldCheck size={17}/><div><strong>Atomic database operation</strong><span>The batch balance, branch inventory balance, stock movement ledger, and audit log are committed together by PostgreSQL.</span></div></div>
        {error && <div className="inv227-error" role="alert"><AlertTriangle size={16}/><span>{error}</span></div>}
      </div>
      <footer><button className="btn btn-secondary" type="button" onClick={() => { if (!busy) setMode('list') }} disabled={busy}>Back</button><button className="btn btn-primary" type="button" onClick={() => void dispose()} disabled={busy}>{busy ? 'Updating database…' : 'Remove expired stock'}</button></footer>
    </section>
  </div>, document.body)}</>
}
