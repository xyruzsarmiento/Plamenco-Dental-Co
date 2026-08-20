import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { getCurrentSessionUserName } from '../security/security'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import type { Branch } from '../branches/branchTypes'
import {
  adjustStock,
  createInventoryItem,
  createPurchaseOrder,
  createStockCount,
  createStockTransfer,
  createSupplier,
  getInventoryCategories,
  getInventoryItems,
  getInventoryUnits,
  getPurchaseOrders,
  getSuppliers,
  receivePurchaseOrder,
  stockIn,
  stockOut,
  transferStock,
  updateStockCountItem,
  type InventoryItem,
} from './inventoryStore'

export type InventoryDialog =
  | { type: 'add_item' }
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

async function confirmRemote(table: string, id: string) {
  if (!isSupabaseConfigured || !supabase) return
  const { data, error } = await supabase.from(table).select('id').eq('id', id).maybeSingle()
  if (error) throw new Error(`Database persistence failed: ${error.message}`)
  if (!data) throw new Error(`Database persistence could not be confirmed for ${table}.`)
}

function todayManila() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export function InventoryActionModal({ dialog, branches, preferredBranchId, onClose, onSuccess }: Props) {
  const items = useMemo(() => getInventoryItems().filter((item) => item.status === 'active'), [])
  const suppliers = useMemo(() => getSuppliers().filter((supplier) => supplier.status === 'active'), [])
  const categories = useMemo(() => getInventoryCategories().filter((category) => category.status === 'active'), [])
  const units = useMemo(() => getInventoryUnits().filter((unit) => unit.status === 'active'), [])
  const actor = getCurrentSessionUserName() || 'Clinic user'
  const defaultBranch = preferredBranchId && preferredBranchId !== 'all' ? preferredBranchId : branches[0]?.id ?? ''

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [itemCode, setItemCode] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? 'other')
  const [unitId, setUnitId] = useState(units[0]?.id ?? 'piece')
  const [brand, setBrand] = useState('')
  const [defaultSupplierId, setDefaultSupplierId] = useState('')
  const [reorderLevel, setReorderLevel] = useState('0')
  const [trackBatches, setTrackBatches] = useState(false)
  const [trackExpiry, setTrackExpiry] = useState(false)
  const [expiryWarningDays, setExpiryWarningDays] = useState('60')
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

  function title() {
    switch (dialog.type) {
      case 'add_item': return 'Add inventory item'
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
        const created = createInventoryItem({
          itemCode: itemCode.trim() || undefined,
          sku: sku.trim(), name: name.trim(), description: description.trim(), categoryId, unitId,
          brand: brand.trim(), defaultSupplierId: defaultSupplierId || undefined,
          defaultReorderLevel: reorder, trackBatches, trackExpiry,
          expiryWarningDays: trackExpiry ? warningDays : 60, status: 'active',
        })
        persistedTable = 'inventory_items'; persistedId = created.id; message = `${created.name} was added to the inventory catalog.`
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
        const movement = stockIn({ branchId, itemId: currentItem.id, quantity: qty, unitCostCents: Math.round(costPhp * 100), reference: reference.trim() || undefined, reason: reason.trim(), receivedDate: orderDate, batchNumber: batchNumber.trim() || undefined, expiryDate: currentItem.trackExpiry ? expiryDate || undefined : undefined, performedBy: actor })
        persistedTable = 'stock_movements'; persistedId = movement.id
      } else if (dialog.type === 'stock_out' && currentItem) {
        if (!branchId) throw new Error('Select a branch.')
        if (!reason.trim()) throw new Error('Reason is required.')
        const movement = stockOut({ branchId, itemId: currentItem.id, quantity: validatePositive(quantity, 'Quantity'), reason: reason.trim(), performedBy: actor })
        persistedTable = 'stock_movements'; persistedId = movement.id
      } else if (dialog.type === 'adjust' && currentItem) {
        if (!branchId) throw new Error('Select a branch.')
        const adjustmentQuantity = Number(quantity)
        if (!Number.isFinite(adjustmentQuantity) || adjustmentQuantity === 0) throw new Error('Adjustment quantity cannot be zero.')
        if (!reason.trim()) throw new Error('Adjustment reason is required.')
        const movement = adjustStock({ branchId, itemId: currentItem.id, adjustmentQuantity, reason: reason.trim(), performedBy: actor })
        persistedTable = 'stock_movements'; persistedId = movement.id
      } else if ((dialog.type === 'create_transfer' || dialog.type === 'quick_transfer') && currentItem) {
        if (!fromBranchId || !toBranchId) throw new Error('Select both source and destination branches.')
        const qty = validatePositive(quantity, 'Quantity')
        if (dialog.type === 'create_transfer') {
          const transfer = createStockTransfer({ fromBranchId, toBranchId, items: [{ id: `transfer-item-${Date.now()}`, itemId: currentItem.id, quantity: qty }], requestedBy: actor, notes: notes.trim() })
          persistedTable = 'stock_transfers'; persistedId = transfer.id; message = `${transfer.transferNumber} was created as a draft transfer.`
        } else {
          const transfer = transferStock({ fromBranchId, toBranchId, items: [{ id: `transfer-item-${Date.now()}`, itemId: currentItem.id, quantity: qty }], requestedBy: actor, receivedBy: actor, notes: notes.trim() })
          persistedTable = 'stock_transfers'; persistedId = transfer.id; message = `${transfer.transferNumber} completed through the canonical transfer ledger.`
        }
      } else if (dialog.type === 'receive_po') {
        if (!receiveOrder || !receiveItem) throw new Error('No receivable purchase-order item was found.')
        const qty = validatePositive(quantity, 'Received quantity')
        if (qty > remainingToReceive) throw new Error(`Received quantity cannot exceed the remaining ${remainingToReceive}.`)
        const result = receivePurchaseOrder({ poId: receiveOrder.id, receivedBy: actor, receivedDate: orderDate, items: [{ poItemId: receiveItem.id, quantityReceived: qty }] })
        persistedTable = 'purchase_receipts'; persistedId = result.receipt.id; message = `${result.receipt.receiptNumber} was posted and inventory was updated through purchase receiving.`
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

  const branchOptions = [{ value: '', label: 'Select branch' }, ...branches.map((branch) => ({ value: branch.id, label: branch.name }))]

  return (
    <div className="modal-backdrop inventory-action-backdrop" onClick={busy ? undefined : onClose}>
      <section className="modal inventory-action-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-action-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div><h2 id="inventory-action-title">{title()}</h2><p className="muted-label">Inventory records follow the existing branch ledger and receiving workflow.</p></div>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose} disabled={busy}><X size={18} /></button>
        </div>
        <div className="modal-body inventory-action-body">
          {success ? <div className="inline-alert success" role="status">{success}</div> : (
            <>
              {dialog.type === 'add_item' && <div className="inventory-form-grid">
                <Input label="Item name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                <Input label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Optional" />
                <Input label="Item code" value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="Auto-generated if blank" />
                <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} options={categories.map((c) => ({ value: c.id, label: c.name }))} />
                <Select label="Unit" value={unitId} onChange={(e) => setUnitId(e.target.value)} options={units.map((u) => ({ value: u.id, label: `${u.label} (${u.abbreviation})` }))} />
                <Input label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
                <Select label="Default supplier" value={defaultSupplierId} onChange={(e) => setDefaultSupplierId(e.target.value)} options={[{ value: '', label: 'None' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
                <Input label="Default reorder level" type="number" min="0" step="0.001" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} />
                <div className="inventory-form-wide"><Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
                <label className="inventory-checkbox"><input type="checkbox" checked={trackBatches} onChange={(e) => setTrackBatches(e.target.checked)} /> Track batches/lots</label>
                <label className="inventory-checkbox"><input type="checkbox" checked={trackExpiry} onChange={(e) => setTrackExpiry(e.target.checked)} /> Track expiry dates</label>
                {trackExpiry && <Input label="Expiry warning days" type="number" min="1" step="1" value={expiryWarningDays} onChange={(e) => setExpiryWarningDays(e.target.value)} />}
                <div className="inventory-form-wide inventory-info-note">Items are catalog records. Branch quantity is created only by stock movements, receiving, transfers, or posted count reconciliation.</div>
              </div>}

              {dialog.type === 'add_supplier' && <div className="inventory-form-grid">
                <Input label="Supplier name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                <Input label="Contact person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
                <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <div className="inventory-form-wide"><Textarea label="Address" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
                <div className="inventory-form-wide"><Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              </div>}

              {dialog.type === 'purchase_order' && <div className="inventory-form-grid">
                <Select label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} options={[{ value: '', label: suppliers.length ? 'Select supplier' : 'No suppliers available' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
                <Select label="Destination branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} options={branchOptions} />
                <Input label="Order date" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                <Input label="Expected delivery" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
                <Select label="Inventory item" value={poItemId} onChange={(e) => setPoItemId(e.target.value)} options={[{ value: '', label: items.length ? 'Select item' : 'No inventory items available' }, ...items.map((i) => ({ value: i.id, label: `${i.name} · ${i.itemCode}` }))]} />
                <Input label="Quantity ordered" type="number" min="0.001" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                <Input label="Unit cost (PHP)" type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
                <div className="inventory-form-wide"><Textarea label="PO notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
                <div className="inventory-form-wide inventory-info-note">Creating a PO does not increase stock. Inventory changes only when a purchase receipt is posted.</div>
              </div>}

              {dialog.type === 'stock_count' && <div className="inventory-form-grid">
                <Select label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} options={branchOptions} />
                <Input label="Count date" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                <div className="inventory-form-wide"><Textarea label="Count notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
                <div className="inventory-form-wide inventory-info-note">This creates a draft snapshot of active items. Enter physical quantities, review the count, then reconcile. Creating the count does not change stock.</div>
              </div>}

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
          {error && <div className="inline-alert danger" role="alert">{error}</div>}
        </div>
        <div className="modal-actions">
          {success ? <Button onClick={onClose}>Done</Button> : <><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => void submit()} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></>}
        </div>
      </section>
    </div>
  )
}
