import { AlertTriangle, CheckCircle2, ClipboardCheck, ClipboardList, PackageCheck, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../ui/Button'
import { StatusBadge } from '../ui/Badge'
import { usePermissions } from '../../features/auth/permissions'
import { useBranchContext } from '../../features/branches/BranchContext'
import { postStockCountPersisted, refreshInventoryOperationalCaches } from '../../features/inventory/inventoryPersistence'
import { reviewStockCountPersisted, updateStockCountItemPersisted } from '../../features/inventory/inventorySetupPersistence'
import {
  getInventoryItems,
  getPurchaseOrders,
  getStockCounts,
  getSuppliers,
  type StockCount,
} from '../../features/inventory/inventoryStore'
import { acquireModalScrollLock } from '../../lib/modalScrollLock'
import '../../styles/inventory-workflow-v225.css'

type InventoryTab = 'items' | 'purchasing' | 'movements' | 'counts' | 'unknown'

type DraftLine = {
  physicalQuantity: string
  reason: string
}

function php(cents = 0) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(cents || 0) / 100)
}

function labelize(value?: string) {
  return String(value ?? '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function resolveTab(label: string): InventoryTab {
  const normalized = label.trim().toLowerCase()
  if (normalized === 'stock' || normalized === 'items') return 'items'
  if (normalized === 'purchasing') return 'purchasing'
  if (normalized === 'movements') return 'movements'
  if (normalized === 'management' || normalized.includes('counts')) return 'counts'
  return 'unknown'
}

function countStats(count: StockCount) {
  const varianceLines = count.items.filter((line) => Number(line.physicalQuantity || 0) !== Number(line.systemQuantity || 0)).length
  const netDifference = count.items.reduce((sum, line) => sum + (Number(line.physicalQuantity || 0) - Number(line.systemQuantity || 0)), 0)
  return { varianceLines, netDifference }
}

function StockCountWorkflowModal({
  count,
  onClose,
  onChanged,
}: {
  count: StockCount
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const permissions = usePermissions()
  const canAdjust = permissions.can('inventory.adjust')
  const items = useMemo(() => getInventoryItems(), [count.id])
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const [draft, setDraft] = useState<Record<string, DraftLine>>(() => Object.fromEntries(count.items.map((line) => [line.itemId, {
    physicalQuantity: String(line.physicalQuantity ?? line.systemQuantity ?? 0),
    reason: line.reason ?? '',
  }])))
  const [current, setCurrent] = useState(count)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => acquireModalScrollLock(), [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [busy, onClose])

  const localStats = useMemo(() => {
    let varianceLines = 0
    let netDifference = 0
    current.items.forEach((line) => {
      const physical = Number(draft[line.itemId]?.physicalQuantity ?? line.physicalQuantity ?? 0)
      const system = Number(line.systemQuantity || 0)
      const difference = Number.isFinite(physical) ? physical - system : 0
      if (difference !== 0) varianceLines += 1
      netDifference += difference
    })
    return { varianceLines, netDifference }
  }, [current.items, draft])

  async function saveDraftLines() {
    if (current.status !== 'draft') return current
    let latest = current
    for (const line of current.items) {
      const next = draft[line.itemId]
      const physicalQuantity = Number(next?.physicalQuantity ?? line.physicalQuantity ?? 0)
      if (!Number.isFinite(physicalQuantity) || physicalQuantity < 0) {
        throw new Error(`Enter a valid physical quantity for ${itemMap.get(line.itemId)?.name ?? 'the inventory item'}.`)
      }
      const changed = physicalQuantity !== Number(line.physicalQuantity || 0) || (next?.reason ?? '') !== (line.reason ?? '')
      if (!changed) continue
      latest = await updateStockCountItemPersisted({
        countId: current.id,
        itemId: line.itemId,
        physicalQuantity,
        reason: next?.reason ?? '',
      })
    }
    setCurrent(latest)
    return latest
  }

  async function saveOnly() {
    if (busy || current.status !== 'draft') return
    setBusy(true); setError(null)
    try {
      await saveDraftLines()
      await refreshInventoryOperationalCaches({ branchIds: [current.branchId] })
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Stock count changes could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function reviewCount() {
    if (busy || current.status !== 'draft') return
    setBusy(true); setError(null)
    try {
      const saved = await saveDraftLines()
      const reviewed = await reviewStockCountPersisted(saved.id)
      setCurrent(reviewed)
      await refreshInventoryOperationalCaches({ branchIds: [reviewed.branchId] })
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Stock count could not be reviewed.')
    } finally {
      setBusy(false)
    }
  }

  async function postCount() {
    if (busy || current.status !== 'reviewed') return
    setBusy(true); setError(null)
    try {
      const posted = await postStockCountPersisted(current.id)
      setCurrent(posted)
      await refreshInventoryOperationalCaches({ branchIds: [posted.branchId] })
      await onChanged()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Stock count reconciliation could not be posted.')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="inv182-modal-backdrop inv225-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <section className="inv225-count-modal" role="dialog" aria-modal="true" aria-labelledby="inv225-count-title">
        <header className="inv225-modal-head">
          <div className="inv225-modal-icon"><ClipboardCheck size={19}/></div>
          <div><span>Physical inventory</span><h2 id="inv225-count-title">{current.countNumber}</h2><p>Compare the system balance with the physical quantity, review variances, then post one auditable reconciliation.</p></div>
          <button type="button" aria-label="Close" onClick={onClose} disabled={busy}><X size={18}/></button>
        </header>

        <div className="inv225-count-summary">
          <div><span>Status</span><StatusBadge status={current.status} label={labelize(current.status)} variant="compact" /></div>
          <div><span>Count lines</span><strong>{current.items.length}</strong></div>
          <div><span>Variance lines</span><strong>{localStats.varianceLines}</strong></div>
          <div><span>Net unit difference</span><strong>{localStats.netDifference > 0 ? '+' : ''}{localStats.netDifference.toLocaleString('en-PH')}</strong></div>
        </div>

        <div className="inv225-count-body">
          {current.items.map((line) => {
            const item = itemMap.get(line.itemId)
            const physical = Number(draft[line.itemId]?.physicalQuantity ?? line.physicalQuantity ?? 0)
            const difference = (Number.isFinite(physical) ? physical : 0) - Number(line.systemQuantity || 0)
            return <article className="inv225-count-line" key={line.itemId}>
              <div className="inv225-count-item"><strong>{item?.name ?? 'Unavailable inventory item'}</strong><span>{item?.itemCode ?? 'Historical catalogue record'}</span></div>
              <div className="inv225-system-qty"><span>System</span><strong>{Number(line.systemQuantity || 0).toLocaleString('en-PH')}</strong></div>
              <label><span>Physical</span><input type="number" min="0" step="0.001" disabled={!canAdjust || current.status !== 'draft' || busy} value={draft[line.itemId]?.physicalQuantity ?? String(line.physicalQuantity ?? 0)} onChange={(event) => setDraft((state) => ({ ...state, [line.itemId]: { physicalQuantity: event.target.value, reason: state[line.itemId]?.reason ?? '' } }))} /></label>
              <div className="inv225-difference"><span>Difference</span><strong>{difference > 0 ? '+' : ''}{difference.toLocaleString('en-PH')}</strong></div>
              <label className="inv225-reason"><span>Variance note</span><input disabled={!canAdjust || current.status !== 'draft' || busy} value={draft[line.itemId]?.reason ?? ''} onChange={(event) => setDraft((state) => ({ ...state, [line.itemId]: { physicalQuantity: state[line.itemId]?.physicalQuantity ?? String(line.physicalQuantity ?? 0), reason: event.target.value } }))} placeholder={difference === 0 ? 'Optional' : 'Explain the variance'} /></label>
            </article>
          })}
          {!current.items.length && <div className="inv225-empty"><ClipboardCheck size={22}/><strong>No count lines</strong><span>This stock count was created without active inventory items.</span></div>}
          {error && <div className="inv225-error" role="alert"><AlertTriangle size={16}/><span>{error}</span></div>}
        </div>

        <footer className="inv225-modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Close</Button>
          {canAdjust && current.status === 'draft' && <><Button variant="secondary" onClick={() => void saveOnly()} disabled={busy}>{busy ? 'Saving…' : 'Save count'}</Button><Button onClick={() => void reviewCount()} disabled={busy || !current.items.length}>Review count</Button></>}
          {canAdjust && current.status === 'reviewed' && <Button onClick={() => void postCount()} disabled={busy}>{busy ? 'Posting…' : 'Post reconciliation'}</Button>}
          {current.status === 'posted' && <div className="inv225-posted-note"><CheckCircle2 size={16}/> Reconciliation posted to the stock ledger</div>}
        </footer>
      </section>
    </div>,
    document.body,
  )
}

export function InventoryWorkflowEnhancerV225({ onInventoryChanged }: { onInventoryChanged: () => void }) {
  const permissions = usePermissions()
  const { activeBranchId, isAllBranchesMode } = useBranchContext()
  const [mount, setMount] = useState<HTMLElement | null>(null)
  const [activeTab, setActiveTab] = useState<InventoryTab>('unknown')
  const [revision, setRevision] = useState(0)
  const [selectedCountId, setSelectedCountId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyCountId, setBusyCountId] = useState<string | null>(null)

  const orders = useMemo(() => { void revision; return getPurchaseOrders() }, [revision])
  const suppliers = useMemo(() => { void revision; return getSuppliers() }, [revision])
  const counts = useMemo(() => { void revision; return getStockCounts() }, [revision])
  const items = useMemo(() => { void revision; return getInventoryItems() }, [revision])
  const supplierMap = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers])
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  const branchOrders = useMemo(() => activeBranchId ? orders.filter((order) => order.branchId === activeBranchId) : [], [activeBranchId, orders])
  const branchCounts = useMemo(() => activeBranchId ? counts.filter((count) => count.branchId === activeBranchId) : [], [activeBranchId, counts])
  const openOrders = branchOrders.filter((order) => ['ordered', 'partially_received'].includes(order.status))
  const openCounts = branchCounts.filter((count) => ['draft', 'reviewed'].includes(count.status))
  const selectedCount = selectedCountId ? branchCounts.find((count) => count.id === selectedCountId) ?? null : null

  const purchaseStats = useMemo(() => {
    let orderedUnits = 0
    let receivedUnits = 0
    let openValueCents = 0
    openOrders.forEach((order) => order.items.forEach((line) => {
      const ordered = Number(line.quantityOrdered || 0)
      const received = Number(line.quantityReceived || 0)
      const remaining = Math.max(0, ordered - received)
      orderedUnits += ordered
      receivedUnits += received
      openValueCents += Math.round(remaining * Number(line.unitCostCents || 0))
    }))
    const openUnits = Math.max(0, orderedUnits - receivedUnits)
    return { orderedUnits, receivedUnits, openUnits, openValueCents }
  }, [openOrders])

  useEffect(() => {
    let raf = 0
    const sync = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const page = document.querySelector('.page-inventory .inv182-page')
        if (!page || isAllBranchesMode) { setMount(null); return }
        const workspace = page.querySelector('.inv182-workspace')
        if (!workspace) { setMount(null); return }
        let target = page.querySelector<HTMLElement>('[data-inv225-workflow-mount]')
        if (!target) {
          target = document.createElement('div')
          target.dataset.inv225WorkflowMount = 'true'
          workspace.insertAdjacentElement('afterend', target)
        }
        setMount(target)
        const active = page.querySelector<HTMLButtonElement>('.inv182-tabs button.is-active')
        setActiveTab(resolveTab(active?.textContent ?? ''))
      })
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
    document.addEventListener('click', sync, true)
    return () => { cancelAnimationFrame(raf); observer.disconnect(); document.removeEventListener('click', sync, true) }
  }, [isAllBranchesMode])

  async function changed() {
    await refreshInventoryOperationalCaches({ branchIds: activeBranchId ? [activeBranchId] : undefined })
    setRevision((value) => value + 1)
    onInventoryChanged()
  }

  async function postFromCard(count: StockCount) {
    if (busyCountId) return
    setBusyCountId(count.id); setActionError(null)
    try {
      await postStockCountPersisted(count.id)
      await changed()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Reconciliation could not be posted.')
    } finally {
      setBusyCountId(null)
    }
  }

  const purchasing = activeTab === 'purchasing' ? <section className="inv225-guidance-card" aria-label="Purchasing workflow summary">
    <header><div><span>Purchasing workflow</span><h3>Order → receive → stock → expense</h3><p>Purchase orders are commitments. Inventory and the linked clinic expense are created when goods are actually received.</p></div><PackageCheck size={20}/></header>
    <div className="inv225-metrics">
      <div><span>Open orders</span><strong>{openOrders.length}</strong><small>ordered or partially received</small></div>
      <div><span>Ordered units</span><strong>{purchaseStats.orderedUnits.toLocaleString('en-PH')}</strong><small>across open orders</small></div>
      <div><span>Still to receive</span><strong>{purchaseStats.openUnits.toLocaleString('en-PH')}</strong><small>remaining units</small></div>
      <div><span>Open commitment</span><strong>{php(purchaseStats.openValueCents)}</strong><small>remaining at PO unit cost</small></div>
    </div>
    {openOrders.length > 0 && <div className="inv225-order-progress">{openOrders.slice(0, 4).map((order) => {
      const ordered = order.items.reduce((sum, line) => sum + Number(line.quantityOrdered || 0), 0)
      const received = order.items.reduce((sum, line) => sum + Number(line.quantityReceived || 0), 0)
      const percent = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0
      return <div key={order.id}><div><strong>{order.poNumber}</strong><span>{supplierMap.get(order.supplierId)?.name ?? 'Supplier'} · {received.toLocaleString('en-PH')} / {ordered.toLocaleString('en-PH')} units</span><b>{percent}%</b></div><progress max="100" value={percent} /></div>
    })}</div>}
    <div className="inv225-flow-note"><ClipboardList size={16}/><span>Use <strong>Receive</strong> on an order only when supplies physically arrive. The database receipt updates stock first and records the supplier invoice/expense workflow from that receipt.</span></div>
  </section> : null

  const countPanel = activeTab === 'counts' ? <section className="inv225-guidance-card" aria-label="Stock count workflow">
    <header><div><span>Count workflow</span><h3>Count → review → reconcile</h3><p>Draft counts capture the physical quantity. Review freezes the count for checking. Posting writes only the variances to the stock ledger.</p></div><ClipboardCheck size={20}/></header>
    <div className="inv225-metrics">
      <div><span>Open counts</span><strong>{openCounts.length}</strong><small>draft + reviewed</small></div>
      <div><span>Draft</span><strong>{openCounts.filter((count) => count.status === 'draft').length}</strong><small>still editable</small></div>
      <div><span>Ready to post</span><strong>{openCounts.filter((count) => count.status === 'reviewed').length}</strong><small>reviewed counts</small></div>
      <div><span>Posted history</span><strong>{branchCounts.filter((count) => count.status === 'posted').length}</strong><small>completed reconciliations</small></div>
    </div>
    <div className="inv225-count-queue">
      {openCounts.map((count) => {
        const stats = countStats(count)
        return <article key={count.id}><div><strong>{count.countNumber}</strong><span>{count.items.length} lines · {stats.varianceLines} variance{stats.varianceLines === 1 ? '' : 's'}</span><small>Net difference: {stats.netDifference > 0 ? '+' : ''}{stats.netDifference.toLocaleString('en-PH')} units</small></div><StatusBadge status={count.status} label={labelize(count.status)} variant="compact" /><div className="inv225-count-actions"><Button size="sm" variant="secondary" onClick={() => { setActionError(null); setSelectedCountId(count.id) }}>{count.status === 'draft' ? 'Count items' : 'Review details'}</Button>{permissions.can('inventory.adjust') && count.status === 'reviewed' && <Button size="sm" onClick={() => void postFromCard(count)} disabled={busyCountId === count.id}>{busyCountId === count.id ? 'Posting…' : 'Post reconciliation'}</Button>}</div></article>
      })}
      {!openCounts.length && <div className="inv225-empty"><CheckCircle2 size={21}/><strong>No count is waiting</strong><span>Start a stock count below when you are ready to verify physical inventory.</span></div>}
    </div>
    {actionError && <div className="inv225-error" role="alert"><AlertTriangle size={16}/><span>{actionError}</span></div>}
  </section> : null

  return <>{mount && (purchasing || countPanel) ? createPortal(purchasing ?? countPanel, mount) : null}{selectedCount && <StockCountWorkflowModal count={selectedCount} onClose={() => setSelectedCountId(null)} onChanged={changed} />}</>
}
