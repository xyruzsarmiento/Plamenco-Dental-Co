import { Archive, AlertTriangle, Package, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../ui/Button'
import { usePermissions } from '../../features/auth/permissions'
import { useBranchContext } from '../../features/branches/BranchContext'
import { archiveInventoryItemRecord, removeInventoryItemRecord } from '../../features/inventory/inventoryItemActions'
import { refreshInventoryOperationalCaches } from '../../features/inventory/inventoryPersistence'
import { getBranchInventory, getInventoryItems, getStockStatus, type InventoryItem } from '../../features/inventory/inventoryStore'
import { acquireModalScrollLock } from '../../lib/modalScrollLock'
import '../../styles/inventory-modals-premium-v183.css'

function php(cents = 0) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(cents || 0) / 100)
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

export function InventoryEnhancerV183({ onInventoryChanged }: { onInventoryChanged: () => void }) {
  const permissions = usePermissions()
  const canManageItems = permissions.can('inventory.edit_item')
  const { activeBranchId, authorizedBranchIds, isAllBranchesMode } = useBranchContext()
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [mount, setMount] = useState<HTMLElement | null>(null)
  const [domRevision, setDomRevision] = useState(0)

  const allItems = useMemo(() => getInventoryItems(), [domRevision])
  const activeItems = useMemo(() => allItems.filter((item) => item.status === 'active'), [allItems])
  const inactiveItems = useMemo(() => allItems.filter((item) => item.status !== 'active'), [allItems])
  const stocks = useMemo(() => getBranchInventory(), [domRevision])
  const itemMap = useMemo(() => new Map(allItems.map((item) => [item.id, item])), [allItems])
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
      isCurrent: item.status === 'active',
      valueCents: Math.round(Number(stock.quantityOnHand || 0) * Number(stock.averageUnitCostCents || 0)),
    }))
    .sort((a, b) => b.valueCents - a.valueCents), [itemMap, visibleStocks])

  const currentValuationRows = valuationRows.filter((row) => row.isCurrent)
  const historicalValuationRows = valuationRows.filter((row) => !row.isCurrent)
  const currentValuationTotal = currentValuationRows.reduce((sum, row) => sum + row.valueCents, 0)
  const historicalValuationTotal = historicalValuationRows.reduce((sum, row) => sum + row.valueCents, 0)
  const recordedValuationTotal = currentValuationTotal + historicalValuationTotal
  const currentOnHand = currentValuationRows.reduce((sum, row) => sum + Number(row.stock.quantityOnHand || 0), 0)
  const operationalLow = currentValuationRows.filter((row) => getStockStatus(row.stock) === 'low_stock').length
  const operationalOut = currentValuationRows.filter((row) => getStockStatus(row.stock) === 'out_of_stock').length
  const selectedItem = selectedItemId ? itemMap.get(selectedItemId) ?? null : null

  useEffect(() => {
    if (!selectedItemId) return undefined
    return acquireModalScrollLock()
  }, [selectedItemId])

  useEffect(() => {
    if (!selectedItemId) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setSelectedItemId(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [busy, selectedItemId])

  useEffect(() => {
    let raf = 0
    let revisionScheduled = false

    const replaceCatalogIds = (text: string) => {
      let output = text
      allItems.forEach((item) => {
        if (output.includes(item.id)) output = output.replaceAll(item.id, item.name)
      })
      if (isUuid(output)) return 'Unavailable inventory item'
      return output.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, 'Unavailable inventory item')
    }

    const setMetric = (container: Element, label: string, value: string) => {
      Array.from(container.children).forEach((child) => {
        const metricLabel = child.querySelector('span')?.textContent?.trim()
        if (metricLabel !== label) return
        const strong = child.querySelector('strong')
        if (strong && strong.textContent !== value) strong.textContent = value
      })
    }

    const enhance = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const page = document.querySelector('.page-inventory .inv182-page')
        if (!page) { setMount(null); return }
        let changed = false

        page.querySelectorAll<HTMLButtonElement>('.inv182-tabs button').forEach((button) => {
          const label = button.textContent?.trim()
          if (label === 'Stock') { button.textContent = 'Items'; changed = true }
          if (label === 'Management') { button.textContent = 'Counts & reconciliation'; changed = true }
        })

        const branchSummary = page.querySelector('.inv182-branch-summary')
        if (branchSummary) {
          Array.from(branchSummary.children).forEach((child) => {
            const label = child.querySelector('span')
            const strong = child.querySelector('strong')
            if (!label || !strong) return
            if (label.textContent?.trim() === 'Total on hand') {
              label.textContent = 'Current on hand'
              strong.textContent = currentOnHand.toLocaleString('en-PH')
              changed = true
            }
            if (label.textContent?.trim() === 'Inventory value') {
              label.textContent = 'Current inventory value'
              strong.textContent = php(currentValuationTotal)
              changed = true
            }
          })
        }

        const heroValue = page.querySelector<HTMLElement>('.inv182-all-hero .inv182-hero-value strong')
        if (heroValue && heroValue.textContent !== php(currentValuationTotal)) {
          heroValue.textContent = php(currentValuationTotal)
          changed = true
        }

        page.querySelectorAll<HTMLElement>('.inv182-health-grid, .inv182-priority-grid').forEach((grid) => {
          setMetric(grid, 'Low stock', operationalLow.toLocaleString('en-PH'))
          setMetric(grid, 'Out of stock', operationalOut.toLocaleString('en-PH'))
          Array.from(grid.children).forEach((child) => {
            const label = child.querySelector('span')
            if (label?.textContent?.trim() === 'Total items') label.textContent = 'Current items'
          })
        })

        page.querySelectorAll<HTMLElement>('.inv182-insight-strip > div').forEach((metric) => {
          const label = metric.querySelector('span')
          const strong = metric.querySelector('strong')
          if (label?.textContent?.trim() === 'Catalog items' && strong) {
            label.textContent = 'Active catalog items'
            strong.textContent = activeItems.length.toLocaleString('en-PH')
          }
        })

        page.querySelectorAll<HTMLElement>('.inv182-list-row span, .inv182-list-row small, .inv182-queue-row strong').forEach((node) => {
          const text = node.textContent ?? ''
          const next = replaceCatalogIds(text)
          if (next !== text) { node.textContent = next; changed = true }
        })

        let valuationMount = page.querySelector<HTMLElement>('[data-inv183-valuation-mount]')
        if (!valuationMount) {
          valuationMount = document.createElement('div')
          valuationMount.dataset.inv183ValuationMount = 'true'
          const target = page.querySelector('.inv182-health-grid') ?? page.querySelector('.inv182-priority-grid') ?? page.querySelector('.inv182-branch-summary')
          if (target) {
            target.insertAdjacentElement('afterend', valuationMount)
            changed = true
          }
        }
        setMount(valuationMount)

        document.querySelectorAll<HTMLElement>('.page-inventory .inv182-stock-row').forEach((row) => {
          const code = row.querySelector<HTMLElement>('.inv182-stock-copy span')?.textContent?.trim()
          if (!code) return
          const item = allItems.find((entry) => entry.itemCode === code)
          if (!item) return
          const branchStock = getBranchInventory().find((stock) => stock.itemId === item.id && (!activeBranchId || stock.branchId === activeBranchId))
          if (!branchStock) return
          let chip = row.querySelector<HTMLElement>('.inv183-value-chip')
          if (!chip) {
            chip = document.createElement('div')
            chip.className = 'inv183-value-chip'
            const actions = row.querySelector('.inv182-row-actions')
            actions?.insertAdjacentElement('beforebegin', chip)
            changed = true
          }
          const lineValue = Math.round(Number(branchStock.quantityOnHand || 0) * Number(branchStock.averageUnitCostCents || 0))
          const nextMarkup = `<span>Stock value</span><strong>${php(lineValue)}</strong><small>${php(Number(branchStock.averageUnitCostCents || 0))} / unit</small>`
          if (chip && chip.innerHTML !== nextMarkup) chip.innerHTML = nextMarkup

          if (canManageItems && item.status === 'active') {
            const actions = row.querySelector<HTMLElement>('.inv182-row-actions')
            if (actions && !actions.querySelector('[data-inv183-manage]')) {
              const button = document.createElement('button')
              button.type = 'button'
              button.className = 'btn btn-secondary btn-sm'
              button.dataset.inv183Manage = item.id
              button.textContent = 'Manage'
              actions.appendChild(button)
              changed = true
            }
          }
        })

        if (changed && !revisionScheduled) {
          revisionScheduled = true
          window.setTimeout(() => {
            revisionScheduled = false
            setDomRevision((value) => value + 1)
          }, 0)
        }
      })
    }

    enhance()
    const observer = new MutationObserver((records) => {
      const externalChange = records.some((record) => Array.from(record.addedNodes).some((node) => !(node instanceof HTMLElement) || !node.closest?.('[data-inv183-valuation-mount], .inv183-value-chip, [data-inv183-manage]')))
      if (externalChange) enhance()
    })
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
  }, [activeBranchId, activeItems.length, allItems, canManageItems, currentOnHand, currentValuationTotal, operationalLow, operationalOut])

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
      <header><div><span>Inventory valuation</span><h3>Current vs archived-catalog value</h3><p>Current value includes active catalog items. Archived-catalog exposure is retained separately so old records never disappear from the audit trail.</p></div><strong className="inv183-valuation-total">{php(currentValuationTotal)}</strong></header>
      <div className="inv183-valuation-list">
        <div className="inv183-valuation-row"><div><strong>Current operational inventory</strong><span>{currentOnHand.toLocaleString('en-PH')} units across active catalog positions</span><small>{currentValuationRows.length} valued position{currentValuationRows.length === 1 ? '' : 's'}</small></div><b>{php(currentValuationTotal)}</b></div>
        <div className="inv183-valuation-row"><div><strong>Archived-catalog exposure</strong><span>Stock still linked to inactive or archived catalog records</span><small>{historicalValuationRows.length} retained position{historicalValuationRows.length === 1 ? '' : 's'} · {inactiveItems.length} inactive catalog item{inactiveItems.length === 1 ? '' : 's'}</small></div><b>{php(historicalValuationTotal)}</b></div>
        <div className="inv183-valuation-row"><div><strong>Total recorded value</strong><span>Operational + retained historical catalogue exposure</span><small>Database reconciliation total</small></div><b>{php(recordedValuationTotal)}</b></div>
        {historicalValuationTotal > 0 && <div className="inv182-error" role="status"><AlertTriangle size={16}/><span>Archived catalog records still carry stock value. Reconcile these positions before treating the current operational value as fully clean.</span></div>}
        {valuationRows.map(({ item, stock, valueCents, isCurrent }) => <div className="inv183-valuation-row" key={stock.id}><div><strong>{item.name}</strong><span>{Number(stock.quantityOnHand || 0).toLocaleString('en-PH')} on hand × {php(Number(stock.averageUnitCostCents || 0))} average unit cost</span><small>{item.itemCode} · {isCurrent ? 'current catalog' : 'archived catalog'} · {getStockStatus(stock).replaceAll('_', ' ')}</small></div><b>{php(valueCents)}</b></div>)}
        {!valuationRows.length && <div className="inv182-empty-small"><Package size={20}/><span>No valued stock positions are currently recorded.</span></div>}
      </div>
    </section>, mount) : null

  return <>{valuation}{selectedItem && createPortal(<div className="inv182-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setSelectedItemId(null) }}>
    <section className="inv183-manage-modal" role="dialog" aria-modal="true" aria-labelledby="inv183-manage-title">
      <header><div className="inv183-manage-icon"><Package size={19}/></div><div><span>Inventory management</span><h2 id="inv183-manage-title">Manage {selectedItem.name}</h2><p>Remove the item from active use without corrupting stock, purchasing, or expense history.</p></div><button type="button" aria-label="Close" onClick={() => setSelectedItemId(null)} disabled={busy}><X size={18}/></button></header>
      <div className="inv183-manage-body">
        <div className="inv183-manage-card"><i><Archive size={19}/></i><div><strong>Archive item</strong><span>Recommended only after on-hand stock reaches zero. Movement, purchase-order, transfer, count, and valuation history remain available for audit and reporting.</span><small>Stocked items are blocked from archiving by both the application and database integrity guard.</small></div></div>
        <div className="inv183-manage-card is-danger"><i><Trash2 size={19}/></i><div><strong>Delete permanently</strong><span>Only available for a newly created catalog item with no inventory history at all. The persistence layer rejects permanent deletion once the item participates in the ledger.</span><small>This prevents broken audit trails and unexplained financial totals.</small></div></div>
        {message && <div className="inv182-error" role="alert"><AlertTriangle size={16}/><span>{message}</span></div>}
      </div>
      <footer><Button variant="secondary" onClick={() => setSelectedItemId(null)} disabled={busy}>Close</Button><Button variant="secondary" onClick={() => void archiveSelected()} disabled={busy}><Archive size={14}/> Archive</Button><Button className="inv183-danger-button" variant="secondary" onClick={() => void deleteSelected()} disabled={busy}><Trash2 size={14}/> Delete permanently</Button></footer>
    </section>
  </div>, document.body)}</>
}