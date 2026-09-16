import { AlertTriangle, Archive, CalendarCheck2, Database, LockKeyhole, RefreshCw, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePermissions } from '../../features/auth/permissions'
import { useBranchContext } from '../../features/branches/BranchContext'
import { getStoredBranches } from '../../features/branches/branchStore'
import {
  captureInventoryValuationSnapshot,
  fetchInventoryValuationSnapshots,
  type InventoryValuationSnapshot,
} from '../../features/inventory/inventoryValuationPersistence'
import { acquireModalScrollLock } from '../../lib/modalScrollLock'
import '../../styles/inventory-valuation-snapshots-v231.css'

function php(cents = 0) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(cents || 0) / 100)
}

function quantity(value = 0) {
  return Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 3 })
}

function monthValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

function previousMonth() {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() - 1)
  return monthValue(date)
}

function monthLabel(value: string) {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00+08:00`)
  return new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'Asia/Manila' }).format(date)
}

function closedMonthOptions(count = 36) {
  const now = new Date()
  now.setDate(1)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now)
    date.setMonth(now.getMonth() - index - 1)
    const value = monthValue(date)
    return { value, label: monthLabel(value) }
  })
}

export function InventoryValuationSnapshotsV231() {
  const permissions = usePermissions()
  const { activeBranchId, authorizedBranchIds, isAllBranchesMode } = useBranchContext()
  const [mount, setMount] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [snapshots, setSnapshots] = useState<InventoryValuationSnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const branches = useMemo(() => getStoredBranches().filter((branch) => branch.status === 'active' && authorizedBranchIds.includes(branch.id)), [authorizedBranchIds])
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches])
  const initialBranch = !isAllBranchesMode && activeBranchId ? activeBranchId : branches[0]?.id ?? ''
  const [branchId, setBranchId] = useState(initialBranch)
  const [periodMonth, setPeriodMonth] = useState(previousMonth())
  const canClose = permissions.can('reports.view_inventory') || permissions.can('inventory.view_cost') || permissions.can('inventory.adjust')
  const monthOptions = useMemo(() => closedMonthOptions(), [])

  const scopedSnapshots = useMemo(() => snapshots.filter((row) => {
    if (!authorizedBranchIds.includes(row.branchId)) return false
    if (isAllBranchesMode) return true
    return row.branchId === activeBranchId
  }), [activeBranchId, authorizedBranchIds, isAllBranchesMode, snapshots])

  const previousMonthSnapshot = scopedSnapshots.find((row) => row.periodMonth.slice(0, 7) === previousMonth().slice(0, 7))
  const latest = scopedSnapshots[0]

  useEffect(() => {
    if (!branchId && initialBranch) setBranchId(initialBranch)
  }, [branchId, initialBranch])

  useEffect(() => {
    const page = document.querySelector('.page-inventory .inv182-page')
    if (!page) return
    let host = page.querySelector<HTMLElement>('[data-inv231-snapshot-mount]')
    if (!host) {
      host = document.createElement('div')
      host.dataset.inv231SnapshotMount = 'true'
      const workspace = page.querySelector('.inv182-workspace')
      if (workspace) workspace.insertAdjacentElement('beforebegin', host)
      else page.appendChild(host)
    }
    setMount(host)
    return () => { if (host?.isConnected) host.remove() }
  }, [])

  useEffect(() => open ? acquireModalScrollLock() : undefined, [open])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchInventoryValuationSnapshots(authorizedBranchIds)
      setSnapshots(rows)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load monthly inventory snapshots.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [authorizedBranchIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  async function closePeriod() {
    if (!branchId || busy) return
    setBusy(true)
    setError(null)
    try {
      await captureInventoryValuationSnapshot(branchId, periodMonth)
      await load()
      window.dispatchEvent(new Event('plamenco-inventory-updated'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The inventory month could not be closed.')
    } finally {
      setBusy(false)
    }
  }

  const selectedExisting = snapshots.find((row) => row.branchId === branchId && row.periodMonth.slice(0, 7) === periodMonth.slice(0, 7))

  const panel = mount ? createPortal(<section className="inv231-panel" aria-label="Monthly inventory valuation snapshots">
    <div className="inv231-copy"><i><Archive size={19}/></i><div><span>Accounting-grade history</span><h3>Monthly valuation snapshots</h3><p>Freeze completed month-end inventory values so historical reports no longer move with future cost changes.</p></div></div>
    <div className="inv231-kpis"><div><span>Closed periods</span><strong>{scopedSnapshots.length}</strong></div><div><span>Latest close</span><strong>{latest ? monthLabel(latest.periodMonth) : 'None'}</strong></div><div><span>Latest value</span><strong>{latest ? php(latest.closingValueCents) : '—'}</strong></div></div>
    <button className="btn btn-secondary" type="button" onClick={() => setOpen(true)}><Database size={15}/> Manage snapshots</button>
  </section>, mount) : null

  return <>{panel}{open && createPortal(<div className="inv231-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false) }}>
    <section className="inv231-modal" role="dialog" aria-modal="true" aria-labelledby="inv231-title">
      <header><div><span>Period close</span><h2 id="inv231-title">Monthly inventory valuation snapshots</h2><p>Completed months are stored as immutable branch-level closes. Current-month inventory remains live.</p></div><button type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Close"><X size={18}/></button></header>
      <div className="inv231-body">
        <div className="inv231-close-card">
          <div className="inv231-close-copy"><LockKeyhole size={18}/><div><strong>Close a completed inventory month</strong><span>The first close for a branch/month becomes the permanent historical valuation record. Re-running the same close returns the existing snapshot instead of rewriting history.</span></div></div>
          <div className="inv231-close-form">
            <label><span>Branch</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)} disabled={busy}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label><span>Completed month</span><select value={periodMonth} onChange={(event) => setPeriodMonth(event.target.value)} disabled={busy}>{monthOptions.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}</select></label>
            <button className="btn btn-primary" type="button" onClick={() => void closePeriod()} disabled={!canClose || !branchId || busy || Boolean(selectedExisting)}>{busy ? 'Closing…' : selectedExisting ? 'Already closed' : 'Close month'}</button>
          </div>
          {selectedExisting && <div className="inv231-existing"><CalendarCheck2 size={16}/><span>{monthLabel(selectedExisting.periodMonth)} is already closed at <strong>{php(selectedExisting.closingValueCents)}</strong>.</span></div>}
          {!canClose && <div className="inv231-warning"><AlertTriangle size={16}/><span>Your role can view inventory but cannot create month-end valuation closes.</span></div>}
          {error && <div className="inv231-warning"><AlertTriangle size={16}/><span>{error}</span></div>}
        </div>

        <div className="inv231-history-head"><div><span>Permanent history</span><h3>Closed inventory periods</h3></div><button className="btn btn-secondary" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
        <div className="inv231-table-head"><span>Period</span><span>Branch</span><span>Closing units</span><span>Closing value</span><span>Purchases</span><span>Consumption</span><span>Adjustments</span><span>Coverage</span></div>
        <div className="inv231-list">
          {scopedSnapshots.map((row) => <article className="inv231-row" key={row.id}>
            <div><strong>{monthLabel(row.periodMonth)}</strong><small>v{row.calculationVersion} · {row.snapshotSource.replaceAll('_', ' ')}</small></div>
            <div><strong>{branchMap.get(row.branchId) ?? 'Branch'}</strong><small>{row.activePositions} active positions</small></div>
            <div><strong>{quantity(row.closingQuantity)}</strong><small>{row.lowStockPositions} low · {row.outOfStockPositions} out</small></div>
            <div><strong>{php(row.closingValueCents)}</strong><small>immutable close</small></div>
            <div><strong>{php(row.purchasesCents)}</strong></div>
            <div><strong>{php(row.consumptionCents + row.expiryDamageCents)}</strong><small>incl. expiry/damage</small></div>
            <div><strong>{php(row.adjustmentsCents)}</strong></div>
            <div><strong>{row.costCoveragePercent.toFixed(0)}%</strong><small>{row.directlyCostedMovements}/{row.movementCount} directly costed</small></div>
          </article>)}
          {!loading && !scopedSnapshots.length && <div className="inv231-empty"><Archive size={24}/><strong>No closed inventory periods yet</strong><span>Close the previous completed month to establish the first permanent valuation baseline.</span></div>}
        </div>
        <div className="inv231-note"><strong>Reporting rule:</strong><span>Use live inventory for the current open month. Use these snapshots for closed historical months. This prevents old month-end values from changing when future receipts, adjustments, or average costs change.</span></div>
      </div>
    </section>
  </div>, document.body)}</>
}
