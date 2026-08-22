import { Boxes, ClipboardCheck, ClipboardList, PackagePlus, PencilLine, Trash2, Truck, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { getCurrentSessionUserName } from '../security/security'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import type { Branch } from '../branches/branchTypes'
import { removeInventoryItemRecord, updateInventoryItemRecord } from './inventoryItemActions'
import {
  createInventoryItem,
  createPurchaseOrder,
  createStockCount,
  createSupplier,
  getInventoryCategories,
  getInventoryItems,
  getInventoryUnits,
  getPurchaseOrders,
  getSuppliers,
  updateStockCountItem,
  type InventoryItem,
} from './inventoryStore'
import {
  adjustStockPersisted,
  completeStockTransferPersisted,
  createStockTransferPersisted,
  receivePurchaseOrderPersisted,
  stockInPersisted,
  stockOutPersisted,
} from './inventoryPersistence'

export type InventoryDialog =
  | { type: 'add_item' }
  | { type: 'edit_item'; item: InventoryItem }
  | { type: 'remove_item'; item: InventoryItem }
  | { type: 'add_supplier' }
  | { type: 'purchase_order' }
  | { type: 'stock_count' }
  | { type: 'stock_in'; item: InventoryItem }
  | { type: 'stock_out'; item: InventoryItem }
  | { type: 'adjust'; item: InventoryItem }
  | { type: 'create_transfer'; item: InventoryItem }
  | { type: 'quick_transfer'; item: InventoryItem }
  | { type: 'receive_po'; poId: string }
  | { type: 'count_item'; countId: string; itemId: string; currentQuantity: number }

type Props = {
  dialog: InventoryDialog
  branches: Branch[]
  preferredBranchId?: string
  onClose: () => void
  onSuccess: () => void
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

const LEGACY_GENERATED_ID_PATTERN = /^[a-z][a-z0-9-]*-\d{10,}-[a-z0-9]+$/i

function deterministicUuid(value: string) {
  let h1 = 0xdeadbeef ^ value.length
  let h2 = 0x41c6ce57 ^ value.length
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  let seed = `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`
  let state = (h1 ^ h2) >>> 0
  while (seed.length < 32) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    seed += (state >>> 0).toString(16).padStart(8, '0')
  }
  const hex = seed.slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = '8'
  const normalized = hex.join('')
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`
}

function persistenceIdCandidates(id: string) {
  if (!LEGACY_GENERATED_ID_PATTERN.test(id)) return [id]
  return [id, deterministicUuid(id)]
}

async function confirmRemote(table: string, id: string) {
  if (!isSupabaseConfigured || !supabase) return

  const candidates = persistenceIdCandidates(id)
  let waitMs = 120
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase.from(table).select('id').in('id', candidates).limit(1)
    if (error) throw new Error(`Database persistence failed: ${error.message}`)
    if (Array.isArray(data) && data.length > 0) return
    if (attempt < 7) {
      await sleep(waitMs)
      waitMs = Math.min(Math.round(waitMs * 1.6), 700)
    }
  }

  throw new Error(`Database persistence could not be confirmed for ${table}. The save did not reach Supabase.`)
}

function todayManila() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function ModalLead({ icon, eyebrow, title, copy }: { icon: ReactNode; eyebrow: string; title: string; copy: string }) {
  return <div className="inv56-modal-lead"><span className="inv56-modal-icon">{icon}</span><div><span>{eyebrow}</span><h2 id="inventory-action-title">{title}</h2><p>{copy}</p></div></div>
}

export function InventoryActionModal({ dialog, branches, preferredBranchId, onClose, onSuccess }: Props) {
  const items = useMemo(() => getInventoryItems().filter((item) => item.status === 'active'), [])
  const suppliers = useMemo(() => getSuppliers().filter((supplier) => supplier.status === 'active'), [])
  const categories = useMemo(() => getInventoryCategories().filter((category) => category.status === 'active'), [])
  const units = useMemo(() => getInventoryUnits().filter((unit) => unit.status === 'active'), [])
  const actor = getCurrentSessionUserName() || 'Clinic user'
  const defaultBranch = preferredBranchId && preferredBranchId !== 'all' ? preferredBranchId : branches[0]?.id ?? ''
  const editingItem = dialog.type === 'edit_item' || dialog.type === 'remove_item' ? dialog.item : undefined

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [name, setName] = useState(editingItem?.name ?? '')
  const [sku, setSku] = useState(editingItem?.sku ?? '')
  const [itemCode, setItemCode] = useState(editingItem?.itemCode ?? '')
  const [description, setDescription] = useState(editingItem?.description ?? '')
  const [categoryId, setCategoryId] = useState(editingItem?.categoryId ?? categories[0]?.id ?? 'other')
  const [unitId, setUnitId] = useState(editingItem?.unitId ?? units[0]?.id ?? 'piece')
  const [brand, setBrand] = useState(editingItem?.brand ?? '')
  const [defaultSupplierId, setDefaultSupplierId] = useState(editingItem?.defaultSupplierId ?? '')
  const [reorderLevel, setReorderLevel] = useState(String(editingItem?.defaultReorderLevel ?? 0))
  const [trackBatches, setTrackBatches] = useState(editingItem?.trackBatches ?? false)
  const [trackExpiry, setTrackExpiry] = useState(editingItem?.trackExpiry ?? false)
  const [expiryWarningDays, setExpiryWarningDays] = useState(String(editingItem?.expiryWarningDays ?? 60))
  const [openingBranchId, setOpeningBranchId] = useState(defaultBranch)
  const [openingQuantity, setOpeningQuantity] = useState('0')
  const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '')
  const [branchId, setBranchId] = useState(defaultBranch)
  const [orderDate, setOrderDate] = useState(todayManila())
  const [expectedDate, setExpectedDate] = useState('')
  const [poItemId, setPoItemId] = useState(items[0]?.id ?? '')
  const [quantity, setQuantity] = useState('1')
  const [unitCost, setUnitCost] = useState('0')
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [fromBranchId, setFromBranchId] = useState(defaultBranch)
  const [toBranchId, setToBranchId] = useState(branches.find((branch) => branch.id !== defaultBranch)?.id ?? '')
  const [physicalQuantity, setPhysicalQuantity] = useState(dialog.type === 'count_item' ? String(dialog.currentQuantity) : '0')

  const currentItem = 'item' in dialog ? dialog.item : undefined
  const receiveOrder = dialog.type === 'receive_po' ? getPurchaseOrders().find((order) => order.id === dialog.poId) : undefined
  const receiveItem = receiveOrder?.items.find((item) => item.quantityReceived < item.quantityOrdered)
  const remainingToReceive = receiveItem ? receiveItem.quantityOrdered - receiveItem.quantityReceived : 0
  const selectedUnit = units.find((unit) => unit.id === unitId)
  const branchOptions = [{ value: '', label: 'Select branch' }, ...branches.map((branch) => ({ value: branch.id, label: branch.name }))]

  function title() {
    switch (dialog.type) {
      case 'add_item': return 'Add inventory item'
      case 'edit_item': return 'Edit inventory item'
      case 'remove_item': return 'Remove inventory item'
      case 'add_supplier': return 'Add supplier'
      case 'purchase_order': return 'Create purchase order'
      case 'stock_count': return 'Create stock count'
      case 'stock_in': return `Stock in · ${dialog.item.name}`
      case 'stock_out': return `Stock out · ${dialog.item.name}`
      case 'adjust': return `Adjust stock · ${dialog.item.name}`
      case 'create_transfer': return `Create transfer · ${dialog.item.name}`
      case 'quick_transfer': return `Quick transfer · ${dialog.item.name}`
      case 'receive_po': return `Receive ${receiveOrder?.poNumber ?? 'purchase order'}`
      case 'count_item': return 'Record physical count'
    }
  }

  function modalMeta() {
    switch (dialog.type) {
      case 'add_item': return { eyebrow: 'Catalog setup', copy: 'Create the item, choose its counting unit, and optionally record the starting quantity at a branch.', icon: <PackagePlus size={19} /> }
      case 'edit_item': return { eyebrow: 'Catalog maintenance', copy: 'Correct the item information without changing its stock movement history.', icon: <PencilLine size={19} /> }
      case 'remove_item': return { eyebrow: 'Safe removal', copy: 'Permanently remove an item only when it has no stock, movement, batch, purchase, transfer, or stock-count history.', icon: <Trash2 size={19} /> }
      case 'add_supplier': return { eyebrow: 'Supplier network', copy: 'Add the supplier contact used by purchasing and replenishment workflows.', icon: <Truck size={19} /> }
      case 'purchase_order': return { eyebrow: 'Procurement', copy: 'Create an order request. Stock changes only after the order is received.', icon: <ClipboardList size={19} /> }
      case 'stock_count': return { eyebrow: 'Stock verification', copy: 'Start a physical count snapshot for one branch before review and reconciliation.', icon: <ClipboardCheck size={19} /> }
      default: return { eyebrow: 'Inventory action', copy: 'Update the branch inventory ledger using the existing controlled workflow.', icon: <Boxes size={19} /> }
    }
  }

  function validatePositive(value: string, label: string) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be greater than zero.`)
    return parsed
  }

  async function submit() {
    if (busy || success) return
    setBusy(true)
    setError(null)
    try {
      let persistedTable = ''
      let persistedId = ''
      let message = 'Inventory action saved.'

      if (dialog.type === 'add_item') {
        if (!name.trim()) throw new Error('Item name is required.')
        const reorder = Number(reorderLevel)
        if (!Number.isFinite(reorder) || reorder < 0) throw new Error('Reorder level must be zero or greater.')
        const warningDays = Number(expiryWarningDays)
        if (trackExpiry && (!Number.isInteger(warningDays) || warningDays <= 0)) throw new Error('Expiry warning days must be a positive whole number.')
        const startingQty = Number(openingQuantity)
        if (!Number.isFinite(startingQty) || startingQty < 0) throw new Error('Starting quantity must be zero or greater.')
        if (startingQty > 0 && !openingBranchId) throw new Error('Select the branch that currently holds the starting quantity.')

        const created = createInventoryItem({
          itemCode: itemCode.trim() || undefined,
          sku: sku.trim(), name: name.trim(), description: description.trim(), categoryId, unitId,
          brand: brand.trim(), defaultSupplierId: defaultSupplierId || undefined,
          defaultReorderLevel: reorder, trackBatches, trackExpiry,
          expiryWarningDays: trackExpiry ? warningDays : 60, status: 'active',
        })
        await confirmRemote('inventory_items', created.id)

        if (startingQty > 0) {
          await stockInPersisted({
            branchId: openingBranchId,
            itemId: created.id,
            quantity: startingQty,
            unitCostCents: 0,
            reason: 'Starting quantity recorded during item setup',
            receivedDate: todayManila(),
          })
        }

        setSuccess(startingQty > 0 ? `${created.name} was added with ${startingQty.toLocaleString('en-PH')} ${selectedUnit?.abbreviation ?? unitId} starting stock.` : `${created.name} was added to the inventory catalog.`)
        onSuccess()
        return
      } else if (dialog.type === 'edit_item') {
        const reorder = Number(reorderLevel)
        const warningDays = Number(expiryWarningDays)
        await updateInventoryItemRecord(dialog.item.id, {
          name, sku, itemCode, description, categoryId, unitId, brand,
          defaultSupplierId: defaultSupplierId || undefined,
          defaultReorderLevel: reorder,
          trackBatches,
          trackExpiry,
          expiryWarningDays: trackExpiry ? warningDays : 60,
        })
        setSuccess(`${name.trim()} was updated.`)
        onSuccess()
        return
      } else if (dialog.type === 'remove_item') {
        await removeInventoryItemRecord(dialog.item.id)
        setSuccess(`${dialog.item.name} was permanently removed because it had no inventory history.`)
        onSuccess()
        return
      } else if (dialog.type === 'add_supplier') {
        if (!name.trim()) throw new Error('Supplier name is required.')
        if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Enter a valid supplier email address.')
        const created = createSupplier({ name: name.trim(), contactPerson: contactPerson.trim(), phone: phone.trim(), email: email.trim(), address: address.trim(), notes: notes.trim(), status: 'active' })
        persistedTable = 'suppliers'; persistedId = created.id; message = `${created.name} was added as a supplier.`
      } else if (dialog.type === 'purchase_order') {
        if (!supplierId) throw new Error('Select a supplier.')
        if (!branchId) throw new Error('Select a destination branch.')
        if (!poItemId) throw new Error('Select an inventory item.')
        const qty = validatePositive(quantity, 'Quantity')
        const costPhp = Number(unitCost)
        if (!Number.isFinite(costPhp) || costPhp < 0) throw new Error('Unit cost must be zero or greater.')
        const created = createPurchaseOrder({ supplierId, branchId, orderDate, expectedDeliveryDate: expectedDate || undefined, items: [{ id: `po-item-${Date.now()}`, itemId: poItemId, quantityOrdered: qty, quantityReceived: 0, unitCostCents: Math.round(costPhp * 100) }], notes: notes.trim(), createdBy: actor })
        persistedTable = 'purchase_orders'; persistedId = created.id; message = `${created.poNumber} was created. Stock will change only when receiving is posted.`
      } else if (dialog.type === 'stock_count') {
        if (!branchId) throw new Error('Select a branch.')
        const created = createStockCount({ branchId, countedBy: actor, countDate: orderDate, notes: notes.trim() })
        persistedTable = 'stock_counts'; persistedId = created.id; message = `${created.countNumber} was created as a draft count. No stock quantity was changed.`
      } else if (dialog.type === 'stock_in' && currentItem) {
        if (!branchId) throw new Error('Select a branch.')
        const qty = validatePositive(quantity, 'Quantity')
        const costPhp = Number(unitCost)
        if (!Number.isFinite(costPhp) || costPhp < 0) throw new Error('Unit cost must be zero or greater.')
        if (!reason.trim()) throw new Error('Reason is required.')
        await stockInPersisted({
          branchId,
          itemId: currentItem.id,
          quantity: qty,
          unitCostCents: Math.round(costPhp * 100),
          reference: reference.trim() || undefined,
          reason: reason.trim(),
          receivedDate: orderDate,
          batchNumber: batchNumber.trim() || undefined,
          expiryDate: currentItem.trackExpiry ? expiryDate || undefined : undefined,
        })
        setSuccess('Stock was added and confirmed by the database.')
        onSuccess()
        return
      } else if (dialog.type === 'stock_out' && currentItem) {
        if (!branchId) throw new Error('Select a branch.')
        if (!reason.trim()) throw new Error('Reason is required.')
        await stockOutPersisted({ branchId, itemId: currentItem.id, quantity: validatePositive(quantity, 'Quantity'), reason: reason.trim() })
        setSuccess('Stock was removed and confirmed by the database.')
        onSuccess()
        return
      } else if (dialog.type === 'adjust' && currentItem) {
        if (!branchId) throw new Error('Select a branch.')
        const adjustmentQuantity = Number(quantity)
        if (!Number.isFinite(adjustmentQuantity) || adjustmentQuantity === 0) throw new Error('Adjustment quantity cannot be zero.')
        if (!reason.trim()) throw new Error('Adjustment reason is required.')
        await adjustStockPersisted({ branchId, itemId: currentItem.id, adjustmentQuantity, reason: reason.trim() })
        setSuccess('Stock adjustment was confirmed by the database.')
        onSuccess()
        return
      } else if ((dialog.type === 'create_transfer' || dialog.type === 'quick_transfer') && currentItem) {
        if (!fromBranchId || !toBranchId) throw new Error('Select both source and destination branches.')
        const qty = validatePositive(quantity, 'Quantity')
        const itemsToTransfer = [{ id: `transfer-item-${Date.now()}`, itemId: currentItem.id, quantity: qty }]
        if (dialog.type === 'create_transfer') {
          const transfer = await createStockTransferPersisted({ fromBranchId, toBranchId, items: itemsToTransfer, notes: notes.trim() })
          setSuccess(`${transfer.transferNumber} was created as a draft transfer.`)
        } else {
          const transfer = await completeStockTransferPersisted({ fromBranchId, toBranchId, items: itemsToTransfer, notes: notes.trim() })
          setSuccess(`${transfer.transferNumber} completed atomically. Source and destination balances were committed together.`)
        }
        onSuccess()
        return
      } else if (dialog.type === 'receive_po') {
        if (!receiveOrder || !receiveItem) throw new Error('No receivable purchase-order item was found.')
        const qty = validatePositive(quantity, 'Received quantity')
        if (qty > remainingToReceive) throw new Error(`Received quantity cannot exceed the remaining ${remainingToReceive}.`)
        const result = await receivePurchaseOrderPersisted({
          poId: receiveOrder.id,
          receivedDate: orderDate,
          items: [{ poItemId: receiveItem.id, quantityReceived: qty }],
        })
        setSuccess(`${result.receipt.receiptNumber} was posted atomically and inventory was updated by PostgreSQL.`)
        onSuccess()
        return
      } else if (dialog.type === 'count_item') {
        const physical = Number(physicalQuantity)
        if (!Number.isFinite(physical) || physical < 0) throw new Error('Physical quantity must be zero or greater.')
        const updated = updateStockCountItem(dialog.countId, dialog.itemId, physical, reason.trim())
        persistedTable = 'stock_counts'; persistedId = updated.id; message = 'Physical count saved. Stock remains unchanged until review and reconciliation.'
      }

      if (!persistedTable || !persistedId) throw new Error('This inventory action could not be prepared for persistence.')
      await confirmRemote(persistedTable, persistedId)
      setSuccess(message)
      onSuccess()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this inventory action.')
    } finally {
      setBusy(false)
    }
  }

  const meta = modalMeta()

  return (
    <div className="modal-backdrop inventory-action-backdrop inv56-backdrop" onClick={busy ? undefined : onClose}>
      <section className={`modal inventory-action-modal inv56-modal inv56-${dialog.type}`} role="dialog" aria-modal="true" aria-labelledby="inventory-action-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header inv56-modal-header">
          <ModalLead icon={meta.icon} eyebrow={meta.eyebrow} title={title()} copy={meta.copy} />
          <button type="button" className="icon-button inv56-close" aria-label="Close dialog" onClick={onClose} disabled={busy}><X size={18} /></button>
        </div>
        <div className="modal-body inventory-action-body inv56-modal-body">
          {success ? <div className="inline-alert success inv56-success" role="status">{success}</div> : (
            <>
              {dialog.type === 'add_item' && <div className="inv56-form-stack">
                <section className="inv56-form-section"><header><span>1</span><div><strong>Item identity</strong><small>Basic catalog information used by staff when searching inventory.</small></div></header><div className="inventory-form-grid">
                  <Input label="Item name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                  <Input label="Stock code (SKU, optional)" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. GLOVE-M-100" />
                  <Input label="Item code" value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="Auto-generated if blank" />
                  <Input label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Optional" />
                  <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} options={categories.map((c) => ({ value: c.id, label: c.name }))} />
                  <Select label="Counting unit" value={unitId} onChange={(e) => setUnitId(e.target.value)} options={units.map((u) => ({ value: u.id, label: `${u.label} (${u.abbreviation})` }))} />
                  <Select label="Default supplier" value={defaultSupplierId} onChange={(e) => setDefaultSupplierId(e.target.value)} options={[{ value: '', label: 'None' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
                  <Input label={`Reorder level (${selectedUnit?.abbreviation ?? unitId})`} type="number" min="0" step="0.001" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} />
                  <div className="inventory-form-wide"><Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
                  <div className="inventory-form-wide inventory-info-note inv56-explainer"><strong>What is SKU?</strong><span>SKU means “stock keeping unit.” It is only an optional internal code that helps staff identify an item quickly. Leave it blank if the clinic does not use stock codes.</span></div>
                </div></section>

                <section className="inv56-form-section is-stock"><header><span>2</span><div><strong>Starting stock</strong><small>Record how many units are physically available right now. You can leave this at zero and stock in later.</small></div></header><div className="inventory-form-grid">
                  <Select label="Starting branch" value={openingBranchId} onChange={(e) => setOpeningBranchId(e.target.value)} options={branchOptions} />
                  <Input label={`Starting quantity (${selectedUnit?.label ?? unitId})`} type="number" min="0" step="0.001" value={openingQuantity} onChange={(e) => setOpeningQuantity(e.target.value)} placeholder="0" />
                  <div className="inventory-form-wide inventory-info-note">Example: if the unit is <strong>Piece</strong> and the clinic currently has 25 pieces, enter <strong>25</strong>. A quantity of 0 creates only the catalog item.</div>
                </div></section>

                <section className="inv56-form-section"><header><span>3</span><div><strong>Tracking preferences</strong><small>Enable only the controls needed for this item.</small></div></header><div className="inv56-toggle-grid">
                  <label className="inventory-checkbox"><input type="checkbox" checked={trackBatches} onChange={(e) => setTrackBatches(e.target.checked)} /><span><strong>Track batches / lots</strong><small>Useful for materials received in identifiable batches.</small></span></label>
                  <label className="inventory-checkbox"><input type="checkbox" checked={trackExpiry} onChange={(e) => setTrackExpiry(e.target.checked)} /><span><strong>Track expiry dates</strong><small>Show expiry risk and warning windows.</small></span></label>
                  {trackExpiry && <Input label="Expiry warning days" type="number" min="1" step="1" value={expiryWarningDays} onChange={(e) => setExpiryWarningDays(e.target.value)} />}
                </div></section>
              </div>}

              {dialog.type === 'edit_item' && <div className="inv56-form-stack">
                <section className="inv56-form-section"><header><span>1</span><div><strong>Catalog details</strong><small>Correct naming and classification without rewriting historical stock transactions.</small></div></header><div className="inventory-form-grid">
                  <Input label="Item name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                  <Input label="Stock code (SKU, optional)" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Optional internal code" />
                  <Input label="Item code" value={itemCode} onChange={(e) => setItemCode(e.target.value)} />
                  <Input label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
                  <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} options={categories.map((c) => ({ value: c.id, label: c.name }))} />
                  <Select label="Counting unit" value={unitId} onChange={(e) => setUnitId(e.target.value)} options={units.map((u) => ({ value: u.id, label: `${u.label} (${u.abbreviation})` }))} />
                  <Select label="Default supplier" value={defaultSupplierId} onChange={(e) => setDefaultSupplierId(e.target.value)} options={[{ value: '', label: 'None' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
                  <Input label="Default reorder level" type="number" min="0" step="0.001" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} />
                  <div className="inventory-form-wide"><Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
                </div></section>
                <section className="inv56-form-section"><header><span>2</span><div><strong>Tracking</strong><small>Stock quantity is not edited here; use Stock In, Stock Out, or Adjust so the ledger stays auditable.</small></div></header><div className="inv56-toggle-grid">
                  <label className="inventory-checkbox"><input type="checkbox" checked={trackBatches} onChange={(e) => setTrackBatches(e.target.checked)} /><span><strong>Track batches / lots</strong><small>Keep batch-level receiving information.</small></span></label>
                  <label className="inventory-checkbox"><input type="checkbox" checked={trackExpiry} onChange={(e) => setTrackExpiry(e.target.checked)} /><span><strong>Track expiry dates</strong><small>Monitor expiry windows for this item.</small></span></label>
                  {trackExpiry && <Input label="Expiry warning days" type="number" min="1" step="1" value={expiryWarningDays} onChange={(e) => setExpiryWarningDays(e.target.value)} />}
                </div></section>
              </div>}

              {dialog.type === 'remove_item' && <div className="inv56-archive-card"><span><Trash2 size={22} /></span><div><strong>Permanently remove {dialog.item.name}?</strong><p>This is allowed only when the item has no branch stock, movements, batches, purchase, transfer, or stock-count history.</p><small>If the item already has history, removal is blocked and you should edit the item instead.</small></div></div>}

              {dialog.type === 'add_supplier' && <div className="inv56-form-stack"><section className="inv56-form-section"><header><span>1</span><div><strong>Supplier profile</strong><small>Contact details used by purchasing and receiving staff.</small></div></header><div className="inventory-form-grid">
                <Input label="Supplier name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                <Input label="Contact person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
                <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <div className="inventory-form-wide"><Textarea label="Address" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
                <div className="inventory-form-wide"><Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              </div></section></div>}

              {dialog.type === 'purchase_order' && <div className="inv56-form-stack"><section className="inv56-form-section"><header><span>1</span><div><strong>Order destination</strong><small>Choose who supplies the order and which clinic receives it.</small></div></header><div className="inventory-form-grid">
                <Select label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} options={[{ value: '', label: suppliers.length ? 'Select supplier' : 'No suppliers available' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
                <Select label="Destination branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} options={branchOptions} />
                <Input label="Order date" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                <Input label="Expected delivery" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
              </div></section><section className="inv56-form-section"><header><span>2</span><div><strong>Order line</strong><small>Specify the item, requested quantity, and expected unit cost.</small></div></header><div className="inventory-form-grid">
                <Select label="Inventory item" value={poItemId} onChange={(e) => setPoItemId(e.target.value)} options={[{ value: '', label: items.length ? 'Select item' : 'No inventory items available' }, ...items.map((i) => ({ value: i.id, label: `${i.name} · ${i.itemCode}` }))]} />
                <Input label="Quantity ordered" type="number" min="0.001" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                <Input label="Unit cost (PHP)" type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
                <div className="inventory-form-wide"><Textarea label="PO notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
                <div className="inventory-form-wide inventory-info-note">Creating a purchase order does <strong>not</strong> increase stock. Inventory changes only when receiving is posted.</div>
              </div></section></div>}

              {dialog.type === 'stock_count' && <div className="inv56-form-stack"><section className="inv56-form-section"><header><span>1</span><div><strong>Count session</strong><small>Select the branch and date for the physical inventory check.</small></div></header><div className="inventory-form-grid">
                <Select label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} options={branchOptions} />
                <Input label="Count date" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                <div className="inventory-form-wide"><Textarea label="Count notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
                <div className="inventory-form-wide inventory-info-note">This creates a draft snapshot of active items. Enter physical quantities, review the count, then reconcile. Creating the count does not change stock.</div>
              </div></section></div>}

              {(dialog.type === 'stock_in' || dialog.type === 'stock_out' || dialog.type === 'adjust') && currentItem && <div className="inventory-form-grid">
                <Select label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} options={branchOptions} />
                <Input label={dialog.type === 'adjust' ? 'Adjustment (+/-)' : 'Quantity'} type="number" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                {dialog.type === 'stock_in' && <><Input label="Unit cost (PHP)" type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} /><Input label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} /><Input label="Received date" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /><Input label="Batch / lot" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />{currentItem.trackExpiry && <Input label="Expiry date" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />}</>}
                <div className="inventory-form-wide"><Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
              </div>}

              {(dialog.type === 'create_transfer' || dialog.type === 'quick_transfer') && currentItem && <div className="inventory-form-grid">
                <Select label="From branch" value={fromBranchId} onChange={(e) => setFromBranchId(e.target.value)} options={branchOptions} />
                <Select label="To branch" value={toBranchId} onChange={(e) => setToBranchId(e.target.value)} options={branchOptions} />
                <Input label="Quantity" type="number" min="0.001" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                <div className="inventory-form-wide"><Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              </div>}

              {dialog.type === 'receive_po' && <div className="inventory-form-grid">
                <div className="inventory-form-wide inventory-info-note">{receiveItem ? `${items.find((item) => item.id === receiveItem.itemId)?.name ?? receiveItem.itemId}: ${remainingToReceive} remaining.` : 'No remaining PO item is available to receive.'}</div>
                <Input label="Quantity received" type="number" min="0.001" max={remainingToReceive || undefined} step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                <Input label="Received date" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>}

              {dialog.type === 'count_item' && <div className="inventory-form-grid">
                <Input label="Physical quantity" type="number" min="0" step="0.001" value={physicalQuantity} onChange={(e) => setPhysicalQuantity(e.target.value)} autoFocus />
                <div className="inventory-form-wide"><Textarea label="Reason for difference" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
                <div className="inventory-form-wide inventory-info-note">Saving a physical count updates the draft count only. It does not mutate branch stock until review and reconciliation.</div>
              </div>}
            </>
          )}
          {error && <div className="inline-alert danger inv56-error" role="alert">{error}</div>}
        </div>
        <div className="modal-actions inv56-modal-actions">
          {success ? <Button onClick={onClose}>Done</Button> : <><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => void submit()} disabled={busy} variant={dialog.type === 'remove_item' ? 'danger' : undefined}>{busy ? 'Saving…' : dialog.type === 'remove_item' ? 'Remove item' : dialog.type === 'edit_item' ? 'Save changes' : 'Save'}</Button></>}
        </div>
      </section>
    </div>
  )
}
