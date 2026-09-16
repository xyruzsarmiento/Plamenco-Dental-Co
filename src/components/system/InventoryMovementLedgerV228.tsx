import { ArrowDownLeft, ArrowUpRight, Download, History, Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBranchContext } from '../../features/branches/BranchContext'
import { getStoredBranches } from '../../features/branches/branchStore'
import {
  getInventoryBatches,
  getInventoryItems,
  getPurchaseOrders,
  getPurchaseReceipts,
  getStockCounts,
  getStockMovements,
  getStockTransfers,
  type StockMovement,
  type StockMovementType,
} from '../../features/inventory/inventoryStore'
import { acquireModalScrollLock } from '../../lib/modalScrollLock'
import '../../styles/inventory-movement-ledger-v228.css'

type Period = '30d' | 'this_month' | 'this_year' | 'all'
type Direction = 'all' | 'in' | 'out'

type LedgerRow = {
  movement: StockMovement
  itemName: string
  itemCode: string
  branchName: string
  sourceLabel: string
  actorLabel: string
  delta: number
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function quantity(value: number) {
  return Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 3 })
}

function php(cents = 0) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(cents || 0) / 100)
}

function labelize(value?: string) {
  return String(value ?? '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function dateTime(value?: string) {
  if (!value) return 'Not recorded'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function manilaDateKey(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}

function actorLabel(value?: string) {
  const text = String(value ?? '').trim()
  if (!text || UUID_RE.test(text)) return 'Authenticated clinic user'
  return text
}

function csvEscape(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

export function InventoryMovementLedgerV228() {
  const { activeBranchId, authorizedBranchIds, isAllBranchesMode } = useBranchContext()
  const [revision, setRevision] = useState(0)
  const [mount, setMount] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('30d')
  const [direction, setDirection] = useState<Direction>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | StockMovementType>('all')
  const [itemFilter, setItemFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [search, setSearch] = useState('')

  const branches = useMemo(() => { void revision; return getStoredBranches() }, [revision])
  const items = useMemo(() => { void revision; return getInventoryItems() }, [revision])
  const movements = useMemo(() => {
    void revision
    const rows = getStockMovements().filter((row) => authorizedBranchIds.includes(row.branchId))
    if (isAllBranchesMode) return rows
    return activeBranchId ? rows.filter((row) => row.branchId === activeBranchId) : []
  }, [activeBranchId, authorizedBranchIds, isAllBranchesMode, revision])
  const transfers = useMemo(() => { void revision; return getStockTransfers() }, [revision])
  const orders = useMemo(() => { void revision; return getPurchaseOrders() }, [revision])
  const receipts = useMemo(() => { void revision; return getPurchaseReceipts() }, [revision])
  const counts = useMemo(() => { void revision; return getStockCounts() }, [revision])
  const batches = useMemo(() => { void revision; return getInventoryBatches() }, [revision])

  const branchMap = useMemo(() => new Map(branches.map((row) => [row.id, row.name])), [branches])
  const itemMap = useMemo(() => new Map(items.map((row) => [row.id, row])), [items])

  function resolveSource(movement: StockMovement) {
    const type = String(movement.referenceType ?? '').trim()
    const id = String(movement.referenceId ?? '').trim()
    if (type.includes('transfer')) {
      const transfer = transfers.find((row) => row.id === id || row.transferNumber === id)
      return transfer ? `Transfer ${transfer.transferNumber}` : 'Stock transfer'
    }
    if (type.includes('purchase')) {
      const receipt = receipts.find((row) => row.id === id || row.receiptNumber === id)
      if (receipt) return `Receipt ${receipt.receiptNumber}`
      const order = orders.find((row) => row.id === id || row.poNumber === id)
      return order ? `Purchase order ${order.poNumber}` : 'Purchase receiving'
    }
    if (type.includes('stock_count') || type.includes('count')) {
      const count = counts.find((row) => row.id === id || row.countNumber === id)
      return count ? `Stock count ${count.countNumber}` : 'Stock count reconciliation'
    }
    if (type.includes('batch') || movement.batchId) {
      const batch = batches.find((row) => row.id === movement.batchId || row.id === id)
      if (batch) return `Batch ${batch.batchNumber}`
    }
    if (id && !UUID_RE.test(id)) return id
    if (type) return labelize(type)
    return 'Inventory ledger'
  }

  const ledgerRows = useMemo<LedgerRow[]>(() => movements.map((movement) => {
    const item = itemMap.get(movement.itemId)
    return {
      movement,
      itemName: item?.name ?? 'Unavailable inventory item',
      itemCode: item?.itemCode ?? '',
      branchName: branchMap.get(movement.branchId) ?? 'Branch',
      sourceLabel: resolveSource(movement),
      actorLabel: actorLabel(movement.performedBy),
      delta: Number(movement.quantityAfter || 0) - Number(movement.quantityBefore || 0),
    }
  }), [batches, branchMap, counts, itemMap, movements, orders, receipts, transfers]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredRows = useMemo(() => {
    const now = new Date()
    const todayKey = manilaDateKey(now)
    const monthPrefix = todayKey.slice(0, 7)
    const yearPrefix = todayKey.slice(0, 4)
    const thirtyDaysAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000)
    const q = search.trim().toLowerCase()

    return ledgerRows.filter((row) => {
      const created = new Date(row.movement.createdAt)
      const key = Number.isNaN(created.getTime()) ? '' : manilaDateKey(created)
      if (period === '30d' && (!created.getTime() || created.getTime() < thirtyDaysAgo)) return false
      if (period === 'this_month' && !key.startsWith(monthPrefix)) return false
      if (period === 'this_year' && !key.startsWith(yearPrefix)) return false
      if (direction === 'in' && row.delta <= 0) return false
      if (direction === 'out' && row.delta >= 0) return false
      if (typeFilter !== 'all' && row.movement.movementType !== typeFilter) return false
      if (itemFilter !== 'all' && row.movement.itemId !== itemFilter) return false
      if (branchFilter !== 'all' && row.movement.branchId !== branchFilter) return false
      if (q && ![
        row.itemName,
        row.itemCode,
        row.branchName,
        row.sourceLabel,
        row.actorLabel,
        row.movement.reason,
        labelize(row.movement.movementType),
      ].some((value) => String(value ?? '').toLowerCase().includes(q))) return false
      return true
    })
  }, [branchFilter, direction, itemFilter, ledgerRows, period, search, typeFilter])

  const incomingUnits = filteredRows.filter((row) => row.delta > 0).reduce((sum, row) => sum + row.delta, 0)
  const outgoingUnits = filteredRows.filter((row) => row.delta < 0).reduce((sum, row) => sum + Math.abs(row.delta), 0)
  const movedValue = filteredRows.reduce((sum, row) => sum + Math.abs(Number(row.movement.totalCostCents || 0)), 0)
  const selected = selectedMovementId ? ledgerRows.find((row) => row.movement.id === selectedMovementId) ?? null : null
  const movementTypes = useMemo(() => [...new Set(ledgerRows.map((row) => row.movement.movementType))].sort(), [ledgerRows])
  const visibleItems = useMemo(() => items.filter((item) => ledgerRows.some((row) => row.movement.itemId === item.id)).sort((a, b) => a.name.localeCompare(b.name)), [items, ledgerRows])
  const visibleBranches = useMemo(() => branches.filter((branch) => authorizedBranchIds.includes(branch.id)), [authorizedBranchIds, branches])

  useEffect(() => {
    const page = document.querySelector('.page-inventory .inv182-page')
    if (!page) return
    let host = page.querySelector<HTMLElement>('[data-inv228-ledger-mount]')
    if (!host) {
      host = document.createElement('div')
      host.dataset.inv228LedgerMount = 'true'
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

  function resetFilters() {
    setPeriod('30d')
    setDirection('all')
    setTypeFilter('all')
    setItemFilter('all')
    setBranchFilter('all')
    setSearch('')
  }

  function exportCsv() {
    const header = ['Date', 'Branch', 'Item', 'Item code', 'Movement', 'Quantity before', 'Quantity after', 'Delta', 'Unit cost', 'Value moved', 'Source', 'Reason', 'Recorded by']
    const rows = filteredRows.map((row) => [
      dateTime(row.movement.createdAt),
      row.branchName,
      row.itemName,
      row.itemCode,
      labelize(row.movement.movementType),
      row.movement.quantityBefore,
      row.movement.quantityAfter,
      row.delta,
      php(row.movement.unitCostCents || 0),
      php(row.movement.totalCostCents || 0),
      row.sourceLabel,
      row.movement.reason,
      row.actorLabel,
    ])
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `inventory-movement-ledger-${manilaDateKey(new Date())}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const panel = mount ? createPortal(<section className="inv228-panel" aria-label="Inventory movement ledger">
    <div className="inv228-panel-copy"><i><History size={19}/></i><div><span>Audit history</span><h3>Movement ledger</h3><p>Trace every stock increase, decrease, transfer, receipt, adjustment, count reconciliation, and expiry event.</p></div></div>
    <div className="inv228-panel-stats"><div><span>Last 30 days</span><strong>{ledgerRows.filter((row) => new Date(row.movement.createdAt).getTime() >= Date.now() - 30 * 86400000).length}</strong></div><div><span>Units in</span><strong>{quantity(ledgerRows.filter((row) => row.delta > 0 && new Date(row.movement.createdAt).getTime() >= Date.now() - 30 * 86400000).reduce((sum, row) => sum + row.delta, 0))}</strong></div><div><span>Units out</span><strong>{quantity(ledgerRows.filter((row) => row.delta < 0 && new Date(row.movement.createdAt).getTime() >= Date.now() - 30 * 86400000).reduce((sum, row) => sum + Math.abs(row.delta), 0))}</strong></div></div>
    <button className="btn btn-secondary" type="button" onClick={() => setOpen(true)}>Open ledger</button>
  </section>, mount) : null

  return <>{panel}{open && createPortal(<div className="inv228-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
    <section className="inv228-modal" role="dialog" aria-modal="true" aria-labelledby="inv228-title">
      <header><div><span>Inventory audit trail</span><h2 id="inv228-title">Movement ledger</h2><p>Database-loaded movement history with before/after balances, source references, cost impact, and branch scope.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close"><X size={18}/></button></header>
      <div className="inv228-body">
        <div className="inv228-summary"><div><span>Movements</span><strong>{filteredRows.length}</strong></div><div><span>Units in</span><strong>{quantity(incomingUnits)}</strong></div><div><span>Units out</span><strong>{quantity(outgoingUnits)}</strong></div><div><span>Value moved</span><strong>{php(movedValue)}</strong></div></div>
        <div className="inv228-filters">
          <label className="inv228-search"><Search size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item, reason, source…" /></label>
          <select value={period} onChange={(event) => setPeriod(event.target.value as Period)} aria-label="Period"><option value="30d">Last 30 days</option><option value="this_month">This month</option><option value="this_year">This year</option><option value="all">All history</option></select>
          <select value={direction} onChange={(event) => setDirection(event.target.value as Direction)} aria-label="Direction"><option value="all">All directions</option><option value="in">Stock in</option><option value="out">Stock out</option></select>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'all' | StockMovementType)} aria-label="Movement type"><option value="all">All movement types</option>{movementTypes.map((type) => <option key={type} value={type}>{labelize(type)}</option>)}</select>
          <select value={itemFilter} onChange={(event) => setItemFilter(event.target.value)} aria-label="Item"><option value="all">All items</option>{visibleItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          {isAllBranchesMode && <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} aria-label="Branch"><option value="all">All branches</option>{visibleBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>}
          <button className="btn btn-secondary" type="button" onClick={resetFilters}><SlidersHorizontal size={14}/> Reset</button>
          <button className="btn btn-secondary" type="button" onClick={exportCsv} disabled={!filteredRows.length}><Download size={14}/> Export CSV</button>
        </div>
        <div className="inv228-head"><span>Movement</span><span>Branch</span><span>Before → after</span><span>Source</span><span>Date</span><span></span></div>
        <div className="inv228-list">
          {filteredRows.map((row) => <article className="inv228-row" key={row.movement.id}>
            <div className="inv228-event"><i className={row.delta >= 0 ? 'is-in' : 'is-out'}>{row.delta >= 0 ? <ArrowDownLeft size={16}/> : <ArrowUpRight size={16}/>}</i><div><strong>{row.itemName}</strong><span>{labelize(row.movement.movementType)} · {row.itemCode || 'Historical item'}</span><small>{row.movement.reason || 'No additional reason recorded'}</small></div></div>
            <div><strong>{row.branchName}</strong><span>{row.actorLabel}</span></div>
            <div><strong>{quantity(row.movement.quantityBefore)} → {quantity(row.movement.quantityAfter)}</strong><span className={row.delta >= 0 ? 'is-in' : 'is-out'}>{row.delta > 0 ? '+' : ''}{quantity(row.delta)}</span></div>
            <div><strong>{row.sourceLabel}</strong><span>{php(row.movement.totalCostCents || 0)}</span></div>
            <div><strong>{dateTime(row.movement.createdAt)}</strong><span>{php(row.movement.unitCostCents || 0)} / unit</span></div>
            <div><button className="btn btn-secondary" type="button" onClick={() => setSelectedMovementId(row.movement.id)}>Details</button></div>
          </article>)}
          {!filteredRows.length && <div className="inv228-empty"><History size={24}/><strong>No movements match these filters</strong><span>Change the date range or filters to inspect another part of the inventory audit trail.</span></div>}
        </div>
      </div>
    </section>
  </div>, document.body)}{selected && createPortal(<div className="inv228-backdrop is-detail" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedMovementId(null) }}>
    <section className="inv228-detail" role="dialog" aria-modal="true" aria-labelledby="inv228-detail-title">
      <header><div><span>Ledger entry</span><h2 id="inv228-detail-title">{selected.itemName}</h2><p>{labelize(selected.movement.movementType)} · {dateTime(selected.movement.createdAt)}</p></div><button type="button" onClick={() => setSelectedMovementId(null)} aria-label="Close"><X size={18}/></button></header>
      <div className="inv228-detail-body">
        <div className="inv228-detail-balance"><span>Stock balance</span><strong>{quantity(selected.movement.quantityBefore)} <b>→</b> {quantity(selected.movement.quantityAfter)}</strong><small>{selected.delta > 0 ? '+' : ''}{quantity(selected.delta)} units</small></div>
        <div className="inv228-detail-grid"><div><span>Movement</span><strong>{labelize(selected.movement.movementType)}</strong></div><div><span>Branch</span><strong>{selected.branchName}</strong></div><div><span>Source</span><strong>{selected.sourceLabel}</strong></div><div><span>Recorded by</span><strong>{selected.actorLabel}</strong></div><div><span>Unit cost</span><strong>{php(selected.movement.unitCostCents || 0)}</strong></div><div><span>Value moved</span><strong>{php(selected.movement.totalCostCents || 0)}</strong></div></div>
        <div className="inv228-reason"><span>Reason / audit note</span><strong>{selected.movement.reason || 'No additional reason recorded.'}</strong></div>
      </div>
      <footer><button className="btn btn-primary" type="button" onClick={() => setSelectedMovementId(null)}>Done</button></footer>
    </section>
  </div>, document.body)}</>
}
