import { Archive, AlertTriangle, Package, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../ui/Button'
import { usePermissions } from '../../features/auth/permissions'
import { useBranchContext } from '../../features/branches/BranchContext'
import { archiveInventoryItemRecord, removeInventoryItemRecord } from '../../features/inventory/inventoryItemActions'
import { refreshInventoryOperationalCaches } from '../../features/inventory/inventoryPersistence'
import { getBranchInventory, getInventoryItems, getStockStatus, type InventoryItem } from '../../features/inventory/inventoryStore'
import '../../styles/inventory-modals-premium-v183.css'

function php(cents = 0) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(cents || 0) / 100)
}

export function InventoryEnhancerV183({ onInventoryChanged }: { onInventoryChanged: () => void }) {
  const permissions = usePermissions()
  const { activeBranchId, authorizedBranchIds, isAllBranchesMode } = useBranchContext()
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [mount, setMount] = useState<HTMLElement | null>(null)
  const [domRevision, setDomRevision] = useState(0)

  const items = useMemo(() => getInventoryItems().filter((item) => item.status === 'active'), [domRevision])
  const stocks = useMemo(() => getBranchInventory(), [domRevision])
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const visibleStocks = useMemo(() => {
    if (isAllBranchesMode) return stocks.filter((stock) => authorizedBranchIds.includes(stock.branchId))
    return activeBranchId ? stocks.filter((stock) => stock.branchId === activeBranchId) : []
  }, [activeBranchId, authorizedBranchIds, isAllBranchesMode, stocks])
  const valuationRows = useMemo(() => visibleStocks
    .map((stock) => ({ stock, item: itemMap.get(stock.itemId) }))
    .filter((row): row is { stock: typeof visibleStocks[number]; item: InventoryItem } => Boolean(row.item))
    .map(({ stock, item }) => ({
      item,
      stock,
      valueCents: Math.round(Number(stock.quantityOnHand || 0) * Number(stock.averageUnitCostCents || 0)),
    }))
    .sort((a, b) => b.valueCents - a.valueCents), [itemMap, visibleStocks])
  const valuationTotal = valuationRows.reduce((sum, row) => sum + row.valueCents, 0)
  const selectedItem = selectedItemId ? itemMap.get(selectedItemId) ?? getInventoryItems().find((item) => item.id === selectedItemId) ?? null : null

  useEffect(() => {
    let raf = 0
    const enhance = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const page = document.querySelector('.page-inventory .inv182-page')
        if (!page) { setMount(null); return }

        let valuationMount = page.querySelector<HTMLElement>('[data-inv183-valuation-mount]')
        if (!valuationMount) {
          valuationMount = document.createElement('div')
          valuationMount.dataset.inv183ValuationMount = 'true'
          const target = page.querySelector('.inv182-health-grid') ?? page.querySelector('.inv182-priority-grid') ?? page.querySelector('.inv182-branch-summary')
          target?.insertAdjacentElement('afterend', valuationMount)
        }
        setMount(valuationMount)

        document.querySelectorAll<HTMLElement>('.page-inventory .inv182-stock-row').forEach((row) => {
          const code = row.querySelector<HTMLElement>('.inv182-stock-copy span')?.textContent?.trim()
          if (!code) return
          const item = getInventoryItems().find((entry) => entry.itemCode === code)
          if (!item) return
          const branchStock = getBranchInventory().find((stock) => stock.itemId === item.id && (!activeBranchId || stock.branchId === activeBranchId))
          if (!branchStock) return
          let chip = row.querySelector<HTMLElement>('.inv183-value-chip')
          if (!chip) {
            chip = document.createElement('div')
            chip.className = 'inv183-value-chip'
            const actions = row.querySelector('.inv182-row-actions')
            actions?.insertAdjacentElement('beforebegin', chip)
          }
          const lineValue = Math.round(Number(branchStock.quantityOnHand || 0) * Number(branchStock.averageUnitCostCents || 0))
          chip.innerHTML = `<span>Stock value</span><strong>${php(lineValue)}</strong><small>${php(Number(branchStock.averageUnitCostCents || 0))} / unit</small>`

          if (permissions.can('inventory.edit_item')) {
            const actions = row.querySelector<HTMLElement>('.inv182-row-actions')
            if (actions && !actions.querySelector('[data-inv183-manage]')) {
              const button = document.createElement('button')
              button.type = 'button'
              button.className = 'btn btn-secondary btn-sm'
              button.dataset.inv183Manage = item.id
              button.textContent = 'Manage'
              actions.appendChild(button)
            }
          }
        })
        setDomRevision((value) => value + 1)
      })
    }

    enhance()
    const observer = new MutationObserver(enhance)
    observer.observe(document.body, { childList: true, subtree: true })
    const onClick = (event: Event) => {
      const target = event.target as HTMLElement | null
      const button = target?.closest<HTMLElement>('[data-inv183-manage]')
      if (!button?.dataset.inv183Manage) return
      event.preventDefault()
      event.stopPropagation()
      setMessage(null)
      setSelectedItemId(button.dataset.inv183Manage)
    }
    document.addEventListener('click', onClick, true)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      document.removeEventListener('click', onClick, true)
    }
  }, [activeBranchId, permissions])

  async function refreshAfterChange() {
    try {
      await refreshInventoryOperationalCaches({ branchIds: isAllBranchesMode ? undefined : activeBranchId ? [activeBranchId] : undefined })
    } finally {
      setDomRevision((value) => value + 1)
      onInventoryChanged()
    }
  }

  async function archiveSelected() {
    if (!selectedItem || busy) return
    setBusy(true); setMessage(null)
    try {
      await archiveInventoryItemRecord(selectedItem.id)
      await refreshAfterChange()
      setSelectedItemId(null)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'The item could not be archived.')
    } finally { setBusy(false) }
  }

  async function deleteSelected() {
    if (!selectedItem || busy) return
    setBusy(true); setMessage(null)
    try {
      await removeInventoryItemRecord(selectedItem.id)
      await refreshAfterChange()
      setSelectedItemId(null)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'The item could not be deleted.')
    } finally { setBusy(false) }
  }

  const valuation = mount ? createPortal(
    <section className="inv183-valuation-card" aria-label="Inventory valuation breakdown">
      <header><div><span>Cost transparency</span><h3>Valuation breakdown</h3><p>Every line below contributes to the Inventory Value shown above: on-hand quantity × average unit cost.</p></div><strong className="inv183-valuation-total">{php(valuationTotal)}</strong></header>
      <div className="inv183-valuation-list">
        {valuationRows.map(({ item, stock, valueCents }) => <div className="inv183-valuation-row" key={stock.id}><div><strong>{item.name}</strong><span>{Number(stock.quantityOnHand || 0).toLocaleString('en-PH')} on hand × {php(Number(stock.averageUnitCostCents || 0))} average unit cost</span><small>{item.itemCode} · {getStockStatus(stock).replaceAll('_', ' ')}</small></div><b>{php(valueCents)}</b></div>)}
        {!valuationRows.length && <div className="inv182-empty-small"><Package size={20}/><span>No valued stock positions are currently recorded.</span></div>}
      </div>
    </section>, mount) : null

  return <>{valuation}{selectedItem && <div className="inv182-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setSelectedItemId(null) }}>
    <section className="inv183-manage-modal" role="dialog" aria-modal="true" aria-labelledby="inv183-manage-title">
      <header><div className="inv183-manage-icon"><Package size={19}/></div><div><span>Inventory management</span><h2 id="inv183-manage-title">Manage {selectedItem.name}</h2><p>Remove the item from active use without corrupting stock, purchasing, or expense history.</p></div><button type="button" aria-label="Close" onClick={() => setSelectedItemId(null)} disabled={busy}><X size={18}/></button></header>
      <div className="inv183-manage-body">
        <div className="inv183-manage-card"><i><Archive size={19}/></i><div><strong>Archive item</strong><span>Recommended when the item has ever had stock, movements, purchase orders, transfers, or counts. It disappears from active inventory but historical records stay valid.</span><small>This is reversible later by changing the item's status in the database/admin workflow.</small></div></div>
        <div className="inv183-manage-card is-danger"><i><Trash2 size={19}/></i><div><strong>Delete permanently</strong><span>Only available for a newly created catalog item with no inventory history at all. The persistence layer rejects permanent deletion once the item participates in the ledger.</span><small>This prevents broken audit trails and unexplained financial totals.</small></div></div>
        {message && <div className="inv182-error" role="alert"><AlertTriangle size={16}/><span>{message}</span></div>}
      </div>
      <footer><Button variant="secondary" onClick={() => setSelectedItemId(null)} disabled={busy}>Close</Button><Button variant="secondary" onClick={() => void archiveSelected()} disabled={busy}><Archive size={14}/> Archive</Button><Button className="inv183-danger-button" variant="secondary" onClick={() => void deleteSelected()} disabled={busy}><Trash2 size={14}/> Delete permanently</Button></footer>
    </section>
  </div>}</>
}
