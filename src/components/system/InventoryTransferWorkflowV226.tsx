import { AlertTriangle, ArrowRightLeft, CheckCircle2, Package, Plus, Send, Truck, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePermissions } from '../../features/auth/permissions'
import { useBranchContext } from '../../features/branches/BranchContext'
import { getStoredBranches } from '../../features/branches/branchStore'
import {
  createStockTransferPersisted,
  dispatchStockTransferPersisted,
  receiveStockTransferPersisted,
} from '../../features/inventory/inventoryPersistence'
import {
  getBranchInventory,
  getInventoryItems,
  getStockTransfers,
  type StockTransfer,
  type StockTransferItem,
} from '../../features/inventory/inventoryStore'
import { acquireModalScrollLock } from '../../lib/modalScrollLock'
import '../../styles/inventory-transfer-workflow-v226.css'

type TransferLine = { id: string; itemId: string; quantity: string }
type ModalMode = 'queue' | 'create' | 'detail' | null

function lineId() {
  return `transfer-line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function statusLabel(value: string) {
  if (value === 'in_transit') return 'In transit'
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
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

export function InventoryTransferWorkflowV226() {
  const permissions = usePermissions()
  const canTransfer = permissions.can('inventory.transfer')
  const { activeBranchId, authorizedBranchIds, isAllBranchesMode } = useBranchContext()
  const [revision, setRevision] = useState(0)
  const [mount, setMount] = useState<HTMLElement | null>(null)
  const [mode, setMode] = useState<ModalMode>(null)
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const branches = useMemo(() => {
    void revision
    return getStoredBranches().filter((branch) => branch.status === 'active' && authorizedBranchIds.includes(branch.id))
  }, [authorizedBranchIds, revision])
  const items = useMemo(() => {
    void revision
    return getInventoryItems().filter((item) => item.status === 'active')
  }, [revision])
  const stocks = useMemo(() => {
    void revision
    return getBranchInventory()
  }, [revision])
  const transfers = useMemo(() => {
    void revision
    const rows = getStockTransfers()
      .filter((transfer) => authorizedBranchIds.includes(transfer.fromBranchId) || authorizedBranchIds.includes(transfer.toBranchId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    if (isAllBranchesMode) return rows
    if (!activeBranchId) return []
    return rows.filter((transfer) => transfer.fromBranchId === activeBranchId || transfer.toBranchId === activeBranchId)
  }, [activeBranchId, authorizedBranchIds, isAllBranchesMode, revision])

  const draftCount = transfers.filter((row) => row.status === 'draft').length
  const transitCount = transfers.filter((row) => row.status === 'in_transit').length
  const receivedCount = transfers.filter((row) => row.status === 'received').length
  const selectedTransfer = transfers.find((row) => row.id === selectedTransferId) ?? null
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches])
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  useEffect(() => {
    const page = document.querySelector('.page-inventory .inv182-page')
    if (!page) return
    let host = page.querySelector<HTMLElement>('[data-inv226-transfer-mount]')
    if (!host) {
      host = document.createElement('div')
      host.dataset.inv226TransferMount = 'true'
      const workspace = page.querySelector('.inv182-workspace')
      if (workspace) workspace.insertAdjacentElement('beforebegin', host)
      else page.appendChild(host)
    }
    setMount(host)
    return () => {
      if (host?.isConnected) host.remove()
    }
  }, [])

  useEffect(() => {
    if (!mode) return undefined
    return acquireModalScrollLock()
  }, [mode])

  useEffect(() => {
    if (!mode) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) closeModal()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, mode])

  function closeModal() {
    if (busy) return
    setMode(null)
    setSelectedTransferId(null)
    setError(null)
  }

  function openDetail(transfer: StockTransfer) {
    setSelectedTransferId(transfer.id)
    setError(null)
    setMode('detail')
  }

  function notifyChanged() {
    setRevision((value) => value + 1)
    window.dispatchEvent(new Event('plamenco-inventory-updated'))
  }

  async function dispatchTransfer(transfer: StockTransfer) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await dispatchStockTransferPersisted(transfer.id)
      notifyChanged()
      setMode('queue')
      setSelectedTransferId(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The transfer could not be dispatched.')
    } finally {
      setBusy(false)
    }
  }

  async function receiveTransfer(transfer: StockTransfer) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await receiveStockTransferPersisted(transfer.id)
      notifyChanged()
      setMode('queue')
      setSelectedTransferId(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The transfer could not be received.')
    } finally {
      setBusy(false)
    }
  }

  const panel = mount ? createPortal(
    <section className="inv226-transfer-panel" aria-label="Stock transfer control center">
      <div className="inv226-transfer-copy">
        <i><ArrowRightLeft size={19}/></i>
        <div><span>Branch stock movement</span><h3>Stock transfers</h3><p>Move supplies between branches with a clear Draft → In transit → Received workflow.</p></div>
      </div>
      <div className="inv226-transfer-stats">
        <div><span>Draft</span><strong>{draftCount}</strong></div>
        <div><span>In transit</span><strong>{transitCount}</strong></div>
        <div><span>Received</span><strong>{receivedCount}</strong></div>
      </div>
      <div className="inv226-transfer-actions">
        <button className="btn btn-secondary" type="button" onClick={() => { setError(null); setMode('queue') }}>View queue</button>
        {canTransfer && <button className="btn btn-primary" type="button" onClick={() => { setError(null); setMode('create') }}><Plus size={15}/> New transfer</button>}
      </div>
    </section>, mount) : null

  return <>{panel}{mode === 'queue' && <TransferQueueModal
    transfers={transfers}
    branchMap={branchMap}
    itemMap={itemMap}
    canTransfer={canTransfer}
    busy={busy}
    error={error}
    authorizedBranchIds={authorizedBranchIds}
    onClose={closeModal}
    onCreate={() => { setError(null); setMode('create') }}
    onOpen={openDetail}
    onDispatch={dispatchTransfer}
    onReceive={receiveTransfer}
  />}{mode === 'create' && <CreateTransferModal
    branches={branches}
    items={items}
    stocks={stocks}
    preferredBranchId={!isAllBranchesMode ? activeBranchId : null}
    busy={busy}
    error={error}
    setBusy={setBusy}
    setError={setError}
    onClose={closeModal}
    onSaved={() => { notifyChanged(); setMode('queue') }}
  />}{mode === 'detail' && selectedTransfer && <TransferDetailModal
    transfer={selectedTransfer}
    branchMap={branchMap}
    itemMap={itemMap}
    busy={busy}
    error={error}
    authorizedBranchIds={authorizedBranchIds}
    canTransfer={canTransfer}
    onClose={closeModal}
    onBack={() => { setError(null); setMode('queue'); setSelectedTransferId(null) }}
    onDispatch={dispatchTransfer}
    onReceive={receiveTransfer}
  />}</>
}

function TransferQueueModal({ transfers, branchMap, itemMap, canTransfer, busy, error, authorizedBranchIds, onClose, onCreate, onOpen, onDispatch, onReceive }: {
  transfers: StockTransfer[]
  branchMap: Map<string, string>
  itemMap: Map<string, { name: string }>
  canTransfer: boolean
  busy: boolean
  error: string | null
  authorizedBranchIds: string[]
  onClose: () => void
  onCreate: () => void
  onOpen: (transfer: StockTransfer) => void
  onDispatch: (transfer: StockTransfer) => void
  onReceive: (transfer: StockTransfer) => void
}) {
  return createPortal(<div className="inv226-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="inv226-modal inv226-queue-modal" role="dialog" aria-modal="true" aria-labelledby="inv226-queue-title">
      <header><div><span>Branch movement queue</span><h2 id="inv226-queue-title">Stock transfers</h2><p>Draft transfers reserve nothing. Dispatch removes stock from the source; receive adds it to the destination.</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="Close"><X size={18}/></button></header>
      <div className="inv226-modal-body">
        {canTransfer && <div className="inv226-queue-toolbar"><div><strong>Transfer lifecycle</strong><span>Create a draft, dispatch when items leave the source branch, then receive at the destination.</span></div><button className="btn btn-primary" type="button" onClick={onCreate}><Plus size={15}/> New transfer</button></div>}
        {error && <div className="inv226-error" role="alert"><AlertTriangle size={16}/><span>{error}</span></div>}
        <div className="inv226-transfer-list">
          {transfers.map((transfer) => {
            const units = transfer.items.reduce((sum, row) => sum + Number(row.quantity || 0), 0)
            const canDispatch = canTransfer && transfer.status === 'draft' && authorizedBranchIds.includes(transfer.fromBranchId)
            const canReceive = canTransfer && transfer.status === 'in_transit' && authorizedBranchIds.includes(transfer.toBranchId)
            return <article className="inv226-transfer-row" key={transfer.id}>
              <div className="inv226-transfer-symbol"><ArrowRightLeft size={17}/></div>
              <div className="inv226-transfer-row-main"><div><strong>{transfer.transferNumber || 'Transfer'}</strong><span className={`inv226-status is-${transfer.status}`}>{statusLabel(transfer.status)}</span></div><p>{branchMap.get(transfer.fromBranchId) ?? 'Source branch'} <b>→</b> {branchMap.get(transfer.toBranchId) ?? 'Destination branch'}</p><small>{transfer.items.length} item{transfer.items.length === 1 ? '' : 's'} · {units.toLocaleString('en-PH')} units · {dateTime(transfer.createdAt)}</small></div>
              <div className="inv226-row-actions"><button className="btn btn-secondary" type="button" onClick={() => onOpen(transfer)}>Details</button>{canDispatch && <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void onDispatch(transfer)}><Send size={14}/> Dispatch</button>}{canReceive && <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void onReceive(transfer)}><CheckCircle2 size={14}/> Receive</button>}</div>
            </article>
          })}
          {!transfers.length && <div className="inv226-empty"><Truck size={24}/><strong>No transfers yet</strong><span>Create a transfer when stock needs to move between clinic branches.</span></div>}
        </div>
      </div>
    </section>
  </div>, document.body)
}

function CreateTransferModal({ branches, items, stocks, preferredBranchId, busy, error, setBusy, setError, onClose, onSaved }: {
  branches: Array<{ id: string; name: string }>
  items: Array<{ id: string; name: string; itemCode: string }>
  stocks: Array<{ branchId: string; itemId: string; quantityOnHand: number }>
  preferredBranchId?: string | null
  busy: boolean
  error: string | null
  setBusy: (value: boolean) => void
  setError: (value: string | null) => void
  onClose: () => void
  onSaved: () => void
}) {
  const firstSource = preferredBranchId && branches.some((row) => row.id === preferredBranchId) ? preferredBranchId : branches[0]?.id ?? ''
  const [fromBranchId, setFromBranchId] = useState(firstSource)
  const [toBranchId, setToBranchId] = useState(branches.find((row) => row.id !== firstSource)?.id ?? '')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<TransferLine[]>([{ id: lineId(), itemId: '', quantity: '1' }])

  const availableItems = useMemo(() => items.filter((item) => stocks.some((stock) => stock.branchId === fromBranchId && stock.itemId === item.id && Number(stock.quantityOnHand) > 0)), [fromBranchId, items, stocks])

  function available(itemId: string) {
    return Number(stocks.find((stock) => stock.branchId === fromBranchId && stock.itemId === itemId)?.quantityOnHand ?? 0)
  }

  async function submit() {
    if (busy) return
    setError(null)
    if (!fromBranchId || !toBranchId) { setError('Choose both a source and destination branch.'); return }
    if (fromBranchId === toBranchId) { setError('Source and destination branches must be different.'); return }
    const prepared = lines.filter((line) => line.itemId).map((line) => ({ id: line.id, itemId: line.itemId, quantity: Number(line.quantity) }))
    if (!prepared.length) { setError('Add at least one inventory item to the transfer.'); return }
    if (new Set(prepared.map((line) => line.itemId)).size !== prepared.length) { setError('Each inventory item can only appear once in a transfer.'); return }
    for (const line of prepared) {
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) { setError('Every transfer quantity must be greater than zero.'); return }
      if (line.quantity > available(line.itemId)) { setError(`${items.find((item) => item.id === line.itemId)?.name ?? 'An item'} exceeds the available source stock.`); return }
    }
    setBusy(true)
    try {
      await createStockTransferPersisted({ fromBranchId, toBranchId, items: prepared, notes: notes.trim() })
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the stock transfer.')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(<div className="inv226-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="inv226-modal inv226-create-modal" role="dialog" aria-modal="true" aria-labelledby="inv226-create-title">
      <header><div><span>New branch movement</span><h2 id="inv226-create-title">Create stock transfer</h2><p>Choose the source branch, destination branch, and exact quantities to move.</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="Close"><X size={18}/></button></header>
      <div className="inv226-modal-body">
        <section className="inv226-form-section"><div className="inv226-step"><b>1</b><div><strong>Transfer route</strong><span>Stock will leave the source only after the transfer is dispatched.</span></div></div><div className="inv226-route-grid"><label><span>From branch</span><select value={fromBranchId} onChange={(event) => { const next = event.target.value; setFromBranchId(next); if (next === toBranchId) setToBranchId(branches.find((row) => row.id !== next)?.id ?? ''); setLines([{ id: lineId(), itemId: '', quantity: '1' }]) }}><option value="">Select source</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><div className="inv226-route-arrow"><ArrowRightLeft size={18}/></div><label><span>To branch</span><select value={toBranchId} onChange={(event) => setToBranchId(event.target.value)}><option value="">Select destination</option>{branches.filter((branch) => branch.id !== fromBranchId).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div></section>
        <section className="inv226-form-section"><div className="inv226-step"><b>2</b><div><strong>Items to transfer</strong><span>Available quantity is read from the current source-branch stock balance.</span></div></div><div className="inv226-lines">{lines.map((line, index) => {
          const max = available(line.itemId)
          return <div className="inv226-line" key={line.id}><div className="inv226-line-number">{index + 1}</div><label><span>Inventory item</span><select value={line.itemId} onChange={(event) => setLines((current) => current.map((entry) => entry.id === line.id ? { ...entry, itemId: event.target.value, quantity: '1' } : entry))}><option value="">Select item</option>{availableItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.itemCode}</option>)}</select>{line.itemId && <small>{max.toLocaleString('en-PH')} available at source</small>}</label><label><span>Quantity</span><input type="number" min="0.001" step="0.001" max={max || undefined} value={line.quantity} onChange={(event) => setLines((current) => current.map((entry) => entry.id === line.id ? { ...entry, quantity: event.target.value } : entry))}/></label><button type="button" className="inv226-remove-line" aria-label="Remove item" onClick={() => setLines((current) => current.length === 1 ? current : current.filter((entry) => entry.id !== line.id))} disabled={lines.length === 1}><X size={16}/></button></div>
        })}</div><button className="inv226-add-line" type="button" onClick={() => setLines((current) => [...current, { id: lineId(), itemId: '', quantity: '1' }])}><Plus size={15}/> Add another item</button></section>
        <section className="inv226-form-section"><label className="inv226-notes"><span>Transfer notes</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional handling instructions or reason for transfer"/></label></section>
        <div className="inv226-info"><Truck size={17}/><div><strong>What happens next?</strong><span>This creates a Draft transfer only. Dispatch will subtract stock from the source branch. Receive will add it to the destination branch and complete the audit trail.</span></div></div>
        {error && <div className="inv226-error" role="alert"><AlertTriangle size={16}/><span>{error}</span></div>}
      </div>
      <footer><button className="btn btn-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="btn btn-primary" type="button" disabled={busy || branches.length < 2} onClick={() => void submit()}>{busy ? 'Creating transfer…' : 'Create draft transfer'}</button></footer>
    </section>
  </div>, document.body)
}

function TransferDetailModal({ transfer, branchMap, itemMap, busy, error, authorizedBranchIds, canTransfer, onClose, onBack, onDispatch, onReceive }: {
  transfer: StockTransfer
  branchMap: Map<string, string>
  itemMap: Map<string, { name: string }>
  busy: boolean
  error: string | null
  authorizedBranchIds: string[]
  canTransfer: boolean
  onClose: () => void
  onBack: () => void
  onDispatch: (transfer: StockTransfer) => void
  onReceive: (transfer: StockTransfer) => void
}) {
  const canDispatch = canTransfer && transfer.status === 'draft' && authorizedBranchIds.includes(transfer.fromBranchId)
  const canReceive = canTransfer && transfer.status === 'in_transit' && authorizedBranchIds.includes(transfer.toBranchId)
  const totalUnits = transfer.items.reduce((sum, row) => sum + Number(row.quantity || 0), 0)
  return createPortal(<div className="inv226-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="inv226-modal inv226-detail-modal" role="dialog" aria-modal="true" aria-labelledby="inv226-detail-title">
      <header><div><span>{transfer.transferNumber || 'Stock transfer'}</span><h2 id="inv226-detail-title">Transfer details</h2><p>{branchMap.get(transfer.fromBranchId) ?? 'Source branch'} → {branchMap.get(transfer.toBranchId) ?? 'Destination branch'}</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="Close"><X size={18}/></button></header>
      <div className="inv226-modal-body">
        <div className="inv226-detail-summary"><div><span>Status</span><strong className={`inv226-status is-${transfer.status}`}>{statusLabel(transfer.status)}</strong></div><div><span>Items</span><strong>{transfer.items.length}</strong></div><div><span>Total units</span><strong>{totalUnits.toLocaleString('en-PH')}</strong></div><div><span>Created</span><strong>{dateTime(transfer.createdAt)}</strong></div></div>
        <section className="inv226-lifecycle"><div className="is-done"><i><Package size={15}/></i><div><strong>Draft created</strong><span>{dateTime(transfer.createdAt)}</span></div></div><div className={transfer.status === 'in_transit' || transfer.status === 'received' ? 'is-done' : ''}><i><Send size={15}/></i><div><strong>Dispatched</strong><span>{transfer.sentAt ? dateTime(transfer.sentAt) : 'Waiting at source branch'}</span></div></div><div className={transfer.status === 'received' ? 'is-done' : ''}><i><CheckCircle2 size={15}/></i><div><strong>Received</strong><span>{transfer.receivedAt ? dateTime(transfer.receivedAt) : 'Waiting at destination branch'}</span></div></div></section>
        <section className="inv226-detail-items"><header><div><span>Transfer contents</span><h3>Inventory items</h3></div><b>{totalUnits.toLocaleString('en-PH')} units</b></header>{transfer.items.map((line: StockTransferItem) => <div className="inv226-detail-item" key={line.id}><div><strong>{itemMap.get(line.itemId)?.name ?? 'Unavailable inventory item'}</strong><span>{line.itemId}</span></div><b>{Number(line.quantity || 0).toLocaleString('en-PH')}</b></div>)}</section>
        {transfer.notes && <div className="inv226-note"><span>Transfer notes</span><p>{transfer.notes}</p></div>}
        {error && <div className="inv226-error" role="alert"><AlertTriangle size={16}/><span>{error}</span></div>}
      </div>
      <footer><button className="btn btn-secondary" type="button" onClick={onBack} disabled={busy}>Back to queue</button>{canDispatch && <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void onDispatch(transfer)}><Send size={15}/> {busy ? 'Dispatching…' : 'Dispatch transfer'}</button>}{canReceive && <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void onReceive(transfer)}><CheckCircle2 size={15}/> {busy ? 'Receiving…' : 'Confirm received'}</button>}</footer>
    </section>
  </div>, document.body)
}
