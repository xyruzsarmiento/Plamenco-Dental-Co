import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  Boxes,
  MoreHorizontal,
  Package,
  PackageMinus,
  PackagePlus,
  PackageX,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { usePermissions } from '../features/auth/permissions'
import { useBranchContext } from '../features/branches/BranchContext'
import { getStoredBranches } from '../features/branches/branchStore'
import { InventoryActionModal, type InventoryDialog } from '../features/inventory/InventoryActionModal'
import {
  getBranchInventory,
  getInventoryItems,
  getStockMovements,
  getStockStatus,
  type InventoryItem,
  type StockMovement,
} from '../features/inventory/inventoryStore'
import '../styles/inventory-simple-v232.css'
import '../styles/inventory-item-actions-v232.css'

type Tab = 'stock' | 'activity'

function labelize(value?: string) {
  return String(value ?? '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDateTime(value?: string) {
  if (!value) return 'Unknown time'
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

function movementDelta(movement: StockMovement) {
  const delta = Number(movement.quantityAfter || 0) - Number(movement.quantityBefore || 0)
  return { delta, label: `${delta > 0 ? '+' : ''}${delta.toLocaleString('en-PH', { maximumFractionDigits: 3 })}` }
}

function movementLabel(type: string) {
  const normalized = type.toLowerCase()
  if (normalized.includes('purchase') || normalized.includes('stock_in') || normalized.includes('opening')) return 'Stock received'
  if (normalized.includes('stock_out') || normalized.includes('consumption')) return 'Stock used / removed'
  if (normalized.includes('expired')) return 'Expired stock removed'
  if (normalized.includes('damaged')) return 'Damaged stock removed'
  if (normalized.includes('transfer_in')) return 'Transferred in'
  if (normalized.includes('transfer_out')) return 'Transferred out'
  if (normalized.includes('adjustment')) return 'Stock corrected'
  return labelize(type)
}

function statusCopy(status: string) {
  if (status === 'out_of_stock') return 'Out of stock'
  if (status === 'low_stock') return 'Low stock'
  return 'In stock'
}

type InventoryStock = ReturnType<typeof getBranchInventory>[number]

function InventoryItemActionsModal({
  item,
  stock,
  branchName,
  canAdjust,
  canTransfer,
  canEdit,
  onAction,
  onClose,
}: {
  item: InventoryItem
  stock: InventoryStock
  branchName: string
  canAdjust: boolean
  canTransfer: boolean
  canEdit: boolean
  onAction: (dialog: InventoryDialog) => void
  onClose: () => void
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [onClose])

  const status = getStockStatus(stock)
  const openAction = (dialog: InventoryDialog) => onAction(dialog)

  return createPortal(
    <div className="inv232-item-actions-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="inv232-item-actions-dialog" role="dialog" aria-modal="true" aria-labelledby="inv232-item-actions-title" aria-describedby="inv232-item-actions-code">
        <header>
          <div>
            <span>Inventory item</span>
            <h2 id="inv232-item-actions-title">{item.name}</h2>
            <p id="inv232-item-actions-code">{item.itemCode}</p>
          </div>
          <button type="button" className="inv232-item-actions-close" aria-label="Close item actions" onClick={onClose} autoFocus><X size={18}/></button>
        </header>
        <div className="inv232-item-actions-meta" aria-label="Item stock details">
          <div><span>Current stock</span><strong>{Number(stock.quantityOnHand || 0).toLocaleString('en-PH', { maximumFractionDigits: 3 })}</strong></div>
          <div><span>Status</span><strong className={`is-${status}`}>{statusCopy(status)}</strong></div>
          <div><span>Branch</span><strong>{branchName}</strong></div>
        </div>
        <div className="inv232-item-actions-list">
          {canAdjust && <button type="button" onClick={() => openAction({ type: 'adjust', item })}><SlidersHorizontal size={17}/>Correct quantity</button>}
          {canTransfer && <button type="button" onClick={() => openAction({ type: 'quick_transfer', item })}><ArrowRightLeft size={17}/>Transfer to branch</button>}
          {canEdit && <button type="button" onClick={() => openAction({ type: 'edit_item', item })}>Edit item</button>}
          {canEdit && <button type="button" className="is-danger" onClick={() => openAction({ type: 'remove_item', item })}>Archive item</button>}
        </div>
      </section>
    </div>,
    document.body,
  )
}

export function InventoryPageSimpleV232({ onInventoryChanged }: { onInventoryChanged: () => void }) {
  const permissions = usePermissions()
  const {
    activeBranch,
    activeBranchId,
    availableBranches,
    authorizedBranchIds,
    hasBranchAccess,
    isAllBranchesMode,
    setActiveBranch,
  } = useBranchContext()

  const [tab, setTab] = useState<Tab>('stock')
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<InventoryDialog | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

  const branches = getStoredBranches().filter((branch) => branch.status === 'active')
  const items = getInventoryItems().filter((item) => item.status === 'active')
  const stocks = getBranchInventory()
  const movements = getStockMovements()
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  const scopedBranchIds = isAllBranchesMode
    ? authorizedBranchIds
    : activeBranchId
      ? [activeBranchId]
      : []

  const scopedStocks = stocks.filter((stock) => scopedBranchIds.includes(stock.branchId))
  const branchRows = scopedStocks
    .map((stock) => ({ stock, item: itemMap.get(stock.itemId) }))
    .filter((row): row is { stock: typeof scopedStocks[number]; item: InventoryItem } => Boolean(row.item))

  const query = search.trim().toLowerCase()
  const filteredRows = branchRows.filter(({ item }) => !query || [item.name, item.itemCode, item.sku, item.brand].join(' ').toLowerCase().includes(query))
  const selectedActionRow = branchRows.find(({ item }) => item.id === selectedItemId)
  const lowRows = branchRows.filter(({ stock }) => getStockStatus(stock) === 'low_stock')
  const outRows = branchRows.filter(({ stock }) => getStockStatus(stock) === 'out_of_stock')
  const totalUnits = scopedStocks.reduce((sum, stock) => sum + Number(stock.quantityOnHand || 0), 0)

  const scopedMovements = movements
    .filter((movement) => scopedBranchIds.includes(movement.branchId))
    .filter((movement) => !query || [itemMap.get(movement.itemId)?.name, movement.reason, movement.movementType].join(' ').toLowerCase().includes(query))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const actionBranches = availableBranches.length ? availableBranches : branches
  const afterAction = () => {
    setDialog(null)
    setSelectedItemId(null)
    onInventoryChanged()
  }

  function openItemAction(dialog: InventoryDialog) {
    setSelectedItemId(null)
    setDialog(dialog)
  }

  if (isAllBranchesMode) {
    const branchSummaries = actionBranches
      .filter((branch) => authorizedBranchIds.includes(branch.id))
      .map((branch) => {
        const rows = stocks.filter((stock) => stock.branchId === branch.id)
        return {
          branch,
          items: rows.length,
          units: rows.reduce((sum, row) => sum + Number(row.quantityOnHand || 0), 0),
          low: rows.filter((row) => getStockStatus(row) === 'low_stock').length,
          out: rows.filter((row) => getStockStatus(row) === 'out_of_stock').length,
        }
      })

    return <section className="inv232-page">
      <header className="inv232-header mobile-card-standard">
        <div className="inv232-header-mark mobile-card-standard-icon"><Package size={22}/></div>
        <div className="inv232-header-copy mobile-card-standard-copy"><span className="inv232-kicker"><Sparkles size={14} />Inventory</span><h1>Choose a branch</h1><p>Open one location to check stock, record supplies coming in, or record items being used.</p></div>
      </header>
      <div className="inv232-branch-grid">
        {branchSummaries.map(({ branch, items: itemCount, units, low, out }) => <button key={branch.id} type="button" className="inv232-branch-card" onClick={() => setActiveBranch(branch.id)}>
          <div className="inv232-branch-icon"><Boxes size={20}/></div>
          <div className="inv232-branch-copy"><strong>{branch.name}</strong><span>{branch.city || branch.code}</span></div>
          <div className="inv232-branch-stats"><span><b>{itemCount}</b> items</span><span><b>{units.toLocaleString('en-PH')}</b> units</span><span className={low ? 'is-warning' : ''}><b>{low}</b> low</span><span className={out ? 'is-danger' : ''}><b>{out}</b> out</span></div>
        </button>)}
      </div>
    </section>
  }

  if (!activeBranch || !activeBranchId || !hasBranchAccess) {
    return <section className="inv232-page"><div className="inv232-empty"><PackageX size={26}/><strong>No inventory branch assigned</strong><span>This account needs an active branch assignment before stock can be managed.</span></div></section>
  }

  return <section className="inv232-page">
    <header className="inv232-header mobile-card-standard">
      <div className="inv232-header-mark mobile-card-standard-icon"><Package size={22}/></div>
      <div className="inv232-header-copy mobile-card-standard-copy"><span className="inv232-kicker"><Sparkles size={14} />Inventory</span><h1>Manage clinic stock</h1><p>Track supplies and materials for <strong>{activeBranch.name}</strong>.</p></div>
      <div className="inv232-header-actions mobile-card-standard-actions">{permissions.can('inventory.create_item') && <Button className="mobile-card-standard-action" onClick={() => setDialog({ type: 'add_item' })}><PackagePlus size={16}/> Add item</Button>}</div>
    </header>

    <section className="inv232-summary" aria-label="Inventory summary">
      <article><i><Package size={18}/></i><div><span>Items</span><strong>{branchRows.length}</strong></div></article>
      <article><i><Boxes size={18}/></i><div><span>Units on hand</span><strong>{totalUnits.toLocaleString('en-PH', { maximumFractionDigits: 3 })}</strong></div></article>
      <article><i><PackageMinus size={18}/></i><div><span>Low stock</span><strong>{lowRows.length}</strong></div></article>
      <article><i><PackageX size={18}/></i><div><span>Out of stock</span><strong>{outRows.length}</strong></div></article>
    </section>

    <div className="inv232-toolbar">
      <nav aria-label="Inventory views"><button type="button" className={tab === 'stock' ? 'is-active' : ''} onClick={() => setTab('stock')}>Stock</button><button type="button" className={tab === 'activity' ? 'is-active' : ''} onClick={() => setTab('activity')}>Activity</button></nav>
      <label><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === 'stock' ? 'Search items…' : 'Search activity…'} /></label>
    </div>

    {tab === 'stock' && <section className="inv232-panel">
      <header><div><span>Current stock</span><h2>Supplies and materials</h2><p>Use Stock in when supplies arrive. Use Stock out when supplies are used or removed.</p></div><b>{filteredRows.length} item{filteredRows.length === 1 ? '' : 's'}</b></header>
      {(lowRows.length > 0 || outRows.length > 0) && <div className="inv232-risk-strip">
        <div className="inv232-risk-copy"><i><AlertCircle size={17}/></i><div><strong>Stock needs attention</strong><span>{outRows.length > 0 ? `${outRows.length} out of stock` : `${lowRows.length} low-stock item${lowRows.length === 1 ? '' : 's'}`}</span></div></div>
        <div className="inv232-risk-items">{[...outRows, ...lowRows].slice(0, 4).map(({ item, stock }) => <button key={stock.id} type="button" onClick={() => setDialog({ type: 'stock_in', item })}><span>{item.name}</span><b>{Number(stock.quantityOnHand || 0).toLocaleString('en-PH')} on hand</b><em>Stock in</em></button>)}</div>
      </div>}
      <div className="inv232-stock-list">
        {filteredRows.map(({ item, stock }) => {
          const status = getStockStatus(stock)
          return <article className="inv232-stock-row" key={stock.id}>
            <div className="inv232-item-icon"><Package size={18}/></div>
            <div className="inv232-item-copy"><span>{item.itemCode}</span><strong>{item.name}</strong><small>{item.brand || 'No brand'}{item.sku ? ` · ${item.sku}` : ''}</small></div>
            <div className="inv232-quantity"><span>On hand</span><strong>{Number(stock.quantityOnHand || 0).toLocaleString('en-PH', { maximumFractionDigits: 3 })}</strong></div>
            <div className={`inv232-status is-${status}`}><span>{statusCopy(status)}</span>{Number(stock.reorderLevel || 0) > 0 && <small>Reorder at {Number(stock.reorderLevel).toLocaleString('en-PH')}</small>}</div>
            <div className="inv232-actions">
              {permissions.can('inventory.stock_in') && <button type="button" className="inv232-primary-action" onClick={() => setDialog({ type: 'stock_in', item })}><ArrowDownToLine size={15}/> Stock in</button>}
              {permissions.can('inventory.stock_out') && <button type="button" onClick={() => setDialog({ type: 'stock_out', item })}><ArrowUpFromLine size={15}/> Stock out</button>}
              <div className="inv232-more-wrap"><button type="button" aria-label={`Actions for ${item.name}`} aria-haspopup="dialog" aria-expanded={selectedItemId === item.id} onClick={() => setSelectedItemId(item.id)}><MoreHorizontal size={17}/></button></div>
            </div>
          </article>
        })}
        {!filteredRows.length && <div className="inv232-empty"><Package size={24}/><strong>{query ? 'No matching inventory items' : 'No stock items yet'}</strong><span>{query ? 'Try a different search.' : 'Add an item to begin tracking stock at this branch.'}</span></div>}
      </div>
    </section>}

    {tab === 'activity' && <section className="inv232-panel">
      <header><div><span>Stock history</span><h2>Recent activity</h2><p>A simple timeline of supplies received, used, transferred, or corrected.</p></div><b>{scopedMovements.length} record{scopedMovements.length === 1 ? '' : 's'}</b></header>
      <div className="inv232-activity-list">
        {scopedMovements.map((movement) => {
          const item = itemMap.get(movement.itemId)
          const { delta, label } = movementDelta(movement)
          return <article key={movement.id}>
            <i className={delta < 0 ? 'is-out' : 'is-in'}>{delta < 0 ? <ArrowUpFromLine size={16}/> : <ArrowDownToLine size={16}/>}</i>
            <div><strong>{item?.name ?? 'Historical inventory item'}</strong><span>{movementLabel(movement.movementType)}{movement.reason ? ` · ${movement.reason}` : ''}</span><small>{formatDateTime(movement.createdAt)}</small></div>
            <b className={delta < 0 ? 'is-out' : 'is-in'}>{label}</b>
          </article>
        })}
        {!scopedMovements.length && <div className="inv232-empty"><ArrowRightLeft size={24}/><strong>No stock activity yet</strong><span>Stock changes will appear here automatically.</span></div>}
      </div>
    </section>}

    {selectedActionRow && <InventoryItemActionsModal
      item={selectedActionRow.item}
      stock={selectedActionRow.stock}
      branchName={activeBranch.name}
      canAdjust={permissions.can('inventory.adjust')}
      canTransfer={permissions.can('inventory.transfer') && actionBranches.length > 1}
      canEdit={permissions.can('inventory.create_item')}
      onAction={openItemAction}
      onClose={() => setSelectedItemId(null)}
    />}
    {dialog && <InventoryActionModal dialog={dialog} branches={actionBranches} preferredBranchId={activeBranchId} onClose={() => setDialog(null)} onSuccess={afterAction} />}
  </section>
}
