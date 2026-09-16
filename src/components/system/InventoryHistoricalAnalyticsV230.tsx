import { BarChart3, CalendarRange, TrendingDown, TrendingUp, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBranchContext } from '../../features/branches/BranchContext'
import { getStoredBranches } from '../../features/branches/branchStore'
import {
  getBranchInventory,
  getInventoryItems,
  getStockMovements,
  type StockMovement,
} from '../../features/inventory/inventoryStore'
import { acquireModalScrollLock } from '../../lib/modalScrollLock'
import '../../styles/inventory-historical-analytics-v230.css'

function php(cents = 0) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(cents || 0) / 100)
}

function quantity(value = 0) {
  return Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 3 })
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthEnd(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0, 23, 59, 59, 999)
}

function monthLabel(year: number, monthIndex: number) {
  return new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric' }).format(new Date(year, monthIndex, 1))
}

function signedQuantity(movement: StockMovement) {
  return Number(movement.quantityAfter || 0) - Number(movement.quantityBefore || 0)
}

function isPurchaseIn(movement: StockMovement) {
  return movement.movementType === 'purchase_receipt' || movement.movementType === 'manual_stock_in' || movement.movementType === 'opening_balance'
}

function isConsumptionOut(movement: StockMovement) {
  return ['consumption', 'manual_stock_out', 'expired', 'damaged', 'return_to_supplier'].includes(movement.movementType)
}

function isAdjustment(movement: StockMovement) {
  return ['adjustment_increase', 'adjustment_decrease', 'reversal', 'void'].includes(movement.movementType)
}

function isTransfer(movement: StockMovement) {
  return ['transfer_in', 'transfer_out'].includes(movement.movementType)
}

export function InventoryHistoricalAnalyticsV230() {
  const { activeBranchId, authorizedBranchIds, isAllBranchesMode } = useBranchContext()
  const [revision, setRevision] = useState(0)
  const [mount, setMount] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)

  const items = useMemo(() => { void revision; return getInventoryItems() }, [revision])
  const stocks = useMemo(() => { void revision; return getBranchInventory() }, [revision])
  const movements = useMemo(() => { void revision; return getStockMovements() }, [revision])
  const branches = useMemo(() => { void revision; return getStoredBranches() }, [revision])

  const visibleStocks = useMemo(() => stocks.filter((stock) => {
    if (!authorizedBranchIds.includes(stock.branchId)) return false
    return isAllBranchesMode ? true : stock.branchId === activeBranchId
  }), [activeBranchId, authorizedBranchIds, isAllBranchesMode, stocks])

  const visibleMovements = useMemo(() => movements.filter((movement) => {
    if (!authorizedBranchIds.includes(movement.branchId)) return false
    return isAllBranchesMode ? true : movement.branchId === activeBranchId
  }), [activeBranchId, authorizedBranchIds, isAllBranchesMode, movements])

  const currentValueCents = visibleStocks.reduce((sum, stock) => sum + Math.round(Number(stock.quantityOnHand || 0) * Number(stock.averageUnitCostCents || 0)), 0)
  const currentUnits = visibleStocks.reduce((sum, stock) => sum + Number(stock.quantityOnHand || 0), 0)
  const costFallback = useMemo(() => new Map(visibleStocks.map((stock) => [`${stock.branchId}:${stock.itemId}`, Number(stock.averageUnitCostCents || 0)])), [visibleStocks])

  const valuedMovements = useMemo(() => visibleMovements.map((movement) => {
    const explicit = Number(movement.totalCostCents || 0)
    const unitCost = Number(movement.unitCostCents || 0)
    const fallback = costFallback.get(`${movement.branchId}:${movement.itemId}`) ?? 0
    const base = explicit > 0 ? explicit : unitCost > 0 ? Math.round(unitCost * Number(movement.quantity || 0)) : fallback > 0 ? Math.round(fallback * Number(movement.quantity || 0)) : 0
    return {
      movement,
      signedUnits: signedQuantity(movement),
      signedValueCents: Math.sign(signedQuantity(movement)) * base,
      hasRecordedCost: explicit > 0 || unitCost > 0,
      hasAnyCost: base > 0,
    }
  }), [costFallback, visibleMovements])

  const years = useMemo(() => {
    const found = new Set<number>([currentYear])
    valuedMovements.forEach(({ movement }) => {
      const year = new Date(movement.createdAt).getFullYear()
      if (Number.isFinite(year)) found.add(year)
    })
    return Array.from(found).sort((a, b) => b - a)
  }, [currentYear, valuedMovements])

  const monthly = useMemo(() => Array.from({ length: 12 }, (_, monthIndex) => {
    const end = monthEnd(selectedYear, monthIndex)
    const endMs = end.getTime()
    const after = valuedMovements.filter(({ movement }) => new Date(movement.createdAt).getTime() > endMs)
    const closingUnits = currentUnits - after.reduce((sum, row) => sum + row.signedUnits, 0)
    const closingValueCents = Math.max(0, currentValueCents - after.reduce((sum, row) => sum + row.signedValueCents, 0))
    const monthRows = valuedMovements.filter(({ movement }) => {
      const date = new Date(movement.createdAt)
      return date.getFullYear() === selectedYear && date.getMonth() === monthIndex
    })
    const purchases = monthRows.filter(({ movement, signedUnits }) => signedUnits > 0 && isPurchaseIn(movement)).reduce((sum, row) => sum + Math.abs(row.signedValueCents), 0)
    const consumption = monthRows.filter(({ movement, signedUnits }) => signedUnits < 0 && isConsumptionOut(movement)).reduce((sum, row) => sum + Math.abs(row.signedValueCents), 0)
    const adjustments = monthRows.filter(({ movement }) => isAdjustment(movement)).reduce((sum, row) => sum + row.signedValueCents, 0)
    const transfers = monthRows.filter(({ movement }) => isTransfer(movement)).reduce((sum, row) => sum + row.signedValueCents, 0)
    const costed = monthRows.filter((row) => row.hasAnyCost).length
    const recordedCost = monthRows.filter((row) => row.hasRecordedCost).length
    return {
      monthIndex,
      key: `${selectedYear}-${String(monthIndex + 1).padStart(2, '0')}`,
      label: monthLabel(selectedYear, monthIndex),
      closingUnits,
      closingValueCents,
      purchases,
      consumption,
      adjustments,
      transfers,
      movementCount: monthRows.length,
      costCoverage: monthRows.length ? Math.round((costed / monthRows.length) * 100) : 100,
      recordedCostCoverage: monthRows.length ? Math.round((recordedCost / monthRows.length) * 100) : 100,
    }
  }), [currentUnits, currentValueCents, selectedYear, valuedMovements])

  const yearRows = valuedMovements.filter(({ movement }) => new Date(movement.createdAt).getFullYear() === selectedYear)
  const yearPurchases = monthly.reduce((sum, row) => sum + row.purchases, 0)
  const yearConsumption = monthly.reduce((sum, row) => sum + row.consumption, 0)
  const yearAdjustments = monthly.reduce((sum, row) => sum + row.adjustments, 0)
  const yearTransferNet = monthly.reduce((sum, row) => sum + row.transfers, 0)
  const latestMonthIndex = selectedYear === currentYear ? new Date().getMonth() : 11
  const selectedClosing = monthly[latestMonthIndex]
  const previousClosing = latestMonthIndex > 0 ? monthly[latestMonthIndex - 1] : null
  const changeCents = previousClosing ? selectedClosing.closingValueCents - previousClosing.closingValueCents : 0
  const changePct = previousClosing && previousClosing.closingValueCents > 0 ? (changeCents / previousClosing.closingValueCents) * 100 : 0
  const maxValue = Math.max(1, ...monthly.map((row) => row.closingValueCents))
  const overallCoverage = yearRows.length ? Math.round((yearRows.filter((row) => row.hasAnyCost).length / yearRows.length) * 100) : 100

  useEffect(() => {
    const page = document.querySelector('.page-inventory .inv182-page')
    if (!page) return
    let host = page.querySelector<HTMLElement>('[data-inv230-history-mount]')
    if (!host) {
      host = document.createElement('div')
      host.dataset.inv230HistoryMount = 'true'
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

  useEffect(() => open ? acquireModalScrollLock() : undefined, [open])

  const scopeLabel = isAllBranchesMode ? 'All authorized branches' : branches.find((branch) => branch.id === activeBranchId)?.name ?? 'Current branch'

  const panel = mount ? createPortal(<section className="inv230-panel" aria-label="Historical inventory analytics">
    <div className="inv230-copy"><i><BarChart3 size={19}/></i><div><span>Historical inventory</span><h3>Valuation & trend history</h3><p>Compare closing inventory value and stock movement activity across months and years.</p></div></div>
    <div className="inv230-kpis"><div><span>Current value</span><strong>{php(currentValueCents)}</strong></div><div><span>Current units</span><strong>{quantity(currentUnits)}</strong></div><div><span>Ledger coverage</span><strong>{overallCoverage}%</strong></div></div>
    <button className="btn btn-secondary" type="button" onClick={() => setOpen(true)}><CalendarRange size={15}/> View history</button>
  </section>, mount) : null

  return <>{panel}{open && createPortal(<div className="inv230-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
    <section className="inv230-modal" role="dialog" aria-modal="true" aria-labelledby="inv230-title">
      <header><div><span>Inventory history</span><h2 id="inv230-title">Historical valuation & activity</h2><p>{scopeLabel}. Current value comes from authoritative branch inventory; prior month values are reconstructed from the stock movement ledger.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close"><X size={18}/></button></header>
      <div className="inv230-body">
        <div className="inv230-toolbar"><label><span>Year</span><select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label><div className="inv230-method"><strong>{overallCoverage}% movement-value coverage</strong><span>Rows without recorded historical cost use the current branch average cost as a fallback, so historical valuation is shown as a ledger-derived estimate rather than an accounting close.</span></div></div>

        <div className="inv230-summary-grid">
          <div><span>Closing value</span><strong>{php(selectedClosing.closingValueCents)}</strong><small>{selectedClosing.label}</small></div>
          <div><span>Purchases / stock in</span><strong>{php(yearPurchases)}</strong><small>{selectedYear} recorded inflows</small></div>
          <div><span>Consumption / losses</span><strong>{php(yearConsumption)}</strong><small>{selectedYear} recorded outflows</small></div>
          <div><span>Net adjustments</span><strong>{php(yearAdjustments)}</strong><small>counts and corrections</small></div>
          <div><span>Transfer net</span><strong>{php(yearTransferNet)}</strong><small>{isAllBranchesMode ? 'normally near zero when internal' : 'branch-level net movement'}</small></div>
          <div><span>Month change</span><strong className={changeCents >= 0 ? 'is-up' : 'is-down'}>{changeCents >= 0 ? '+' : ''}{php(changeCents)}</strong><small>{previousClosing ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}% vs ${previousClosing.label}` : 'No prior month in this year'}</small></div>
        </div>

        <section className="inv230-chart-card">
          <div className="inv230-chart-head"><div><span>Monthly closing inventory value</span><h3>{selectedYear} valuation trend</h3></div><div>{changeCents >= 0 ? <TrendingUp size={18}/> : <TrendingDown size={18}/>}<strong>{php(selectedClosing.closingValueCents)}</strong></div></div>
          <div className="inv230-chart">{monthly.map((row) => <div className="inv230-bar-col" key={row.key}><div className="inv230-bar-track"><div className="inv230-bar" style={{ height: `${Math.max(3, (row.closingValueCents / maxValue) * 100)}%` }} title={`${row.label}: ${php(row.closingValueCents)}`}></div></div><strong>{new Intl.DateTimeFormat('en-PH', { month: 'short' }).format(new Date(selectedYear, row.monthIndex, 1))}</strong><span>{row.closingValueCents > 0 ? php(row.closingValueCents).replace('.00', '') : '—'}</span></div>)}</div>
        </section>

        <section className="inv230-table-card">
          <div className="inv230-table-head"><span>Month</span><span>Closing stock</span><span>Closing value</span><span>Purchases</span><span>Consumption</span><span>Adjustments</span><span>Coverage</span></div>
          <div className="inv230-table-body">{monthly.map((row) => <article className="inv230-row" key={row.key}><div><strong>{row.label}</strong><small>{row.movementCount} movement{row.movementCount === 1 ? '' : 's'}</small></div><div><strong>{quantity(row.closingUnits)}</strong><small>units</small></div><div><strong>{php(row.closingValueCents)}</strong><small>ledger-derived close</small></div><div><strong>{php(row.purchases)}</strong></div><div><strong>{php(row.consumption)}</strong></div><div><strong>{php(row.adjustments)}</strong></div><div><strong>{row.costCoverage}%</strong><small>{row.recordedCostCoverage}% directly costed</small></div></article>)}</div>
        </section>

        <div className="inv230-note"><strong>How to interpret this:</strong><span>The current inventory value is the live branch balance. Historical closing values are reconstructed by reversing later stock movements. When old movement rows do not contain a cost, the system falls back to the item's current branch average cost and marks coverage accordingly. For formal accounting-period inventory, monthly valuation snapshots should be added later.</span></div>
      </div>
    </section>
  </div>, document.body)}</>
}
