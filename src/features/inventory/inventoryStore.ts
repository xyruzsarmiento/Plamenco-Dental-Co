import { recordAuditEntry } from '../security/auditLogStore'
import { getCurrentSessionUserName } from '../security/security'
import { insertRemoteTableRow, updateRemoteTableRow } from '../../lib/supabaseSync'

export type InventoryItemStatus = 'active' | 'inactive' | 'archived'
export type StockMovementType =
  | 'opening_balance'
  | 'purchase_receipt'
  | 'manual_stock_in'
  | 'consumption'
  | 'manual_stock_out'
  | 'transfer_out'
  | 'transfer_in'
  | 'adjustment_increase'
  | 'adjustment_decrease'
  | 'expired'
  | 'damaged'
  | 'return_to_supplier'
  | 'void'
  | 'reversal'
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock'
export type ExpiryStatus = 'not_tracked' | 'valid' | 'expiring_soon' | 'expired'
export type PurchaseOrderStatus = 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled'
export type TransferStatus = 'draft' | 'in_transit' | 'received' | 'cancelled'
export type StockCountStatus = 'draft' | 'reviewed' | 'posted' | 'cancelled'
export type SupplierStatus = 'active' | 'inactive'

export type InventoryCategory = {
  id: string
  name: string
  status: 'active' | 'inactive'
}

export type InventoryUnit = {
  id: string
  label: string
  abbreviation: string
  status: 'active' | 'inactive'
}

export type Supplier = {
  id: string
  supplierNumber: string
  name: string
  contactPerson: string
  phone: string
  email: string
  address: string
  notes: string
  status: SupplierStatus
  createdAt: string
  updatedAt: string
}

export type InventoryItem = {
  id: string
  itemCode: string
  sku: string
  name: string
  description: string
  categoryId: string
  unitId: string
  brand: string
  defaultSupplierId?: string
  defaultReorderLevel: number
  trackBatches: boolean
  trackExpiry: boolean
  expiryWarningDays: number
  status: InventoryItemStatus
  createdAt: string
  updatedAt: string
}

export type BranchInventory = {
  id: string
  branchId: string
  itemId: string
  quantityOnHand: number
  reorderLevel: number
  location: string
  averageUnitCostCents: number
  updatedAt: string
}

export type InventoryBatch = {
  id: string
  branchId: string
  itemId: string
  batchNumber: string
  quantityOnHand: number
  receivedDate: string
  expiryDate?: string
  supplierId?: string
  unitCostCents: number
  sourceType: string
  sourceId?: string
  createdAt: string
  updatedAt: string
}

export type StockMovement = {
  id: string
  branchId: string
  itemId: string
  batchId?: string
  movementType: StockMovementType
  quantity: number
  quantityBefore: number
  quantityAfter: number
  referenceType?: string
  referenceId?: string
  reason: string
  performedBy: string
  patientId?: string
  clinicalVisitId?: string
  treatmentId?: string
  appointmentId?: string
  providerId?: string
  unitCostCents?: number
  totalCostCents?: number
  createdAt: string
}

export type PurchaseOrderItem = {
  id: string
  itemId: string
  quantityOrdered: number
  quantityReceived: number
  unitCostCents: number
}

export type PurchaseOrder = {
  id: string
  poNumber: string
  supplierId: string
  branchId: string
  orderDate: string
  expectedDeliveryDate?: string
  status: PurchaseOrderStatus
  items: PurchaseOrderItem[]
  subtotalCents: number
  totalCents: number
  notes: string
  createdBy: string
  approvedBy?: string
  createdAt: string
  updatedAt: string
}

export type PurchaseReceipt = {
  id: string
  receiptNumber: string
  poId: string
  supplierId: string
  branchId: string
  receivedDate: string
  receivedBy: string
  supplierInvoiceNumber?: string
  supplierInvoiceDate?: string
  supplierInvoiceDueDate?: string
  supplierInvoiceAmountCents?: number
  notes: string
  totalCostCents: number
  createdAt: string
}

export type StockTransferItem = {
  id: string
  itemId: string
  quantity: number
}

export type StockTransfer = {
  id: string
  transferNumber: string
  fromBranchId: string
  toBranchId: string
  status: TransferStatus
  items: StockTransferItem[]
  requestedBy: string
  sentBy?: string
  sentAt?: string
  receivedBy?: string
  notes: string
  createdAt: string
  receivedAt?: string
}

export type StockCountItem = {
  id: string
  itemId: string
  systemQuantity: number
  physicalQuantity: number
  difference: number
  reason: string
}

export type StockCount = {
  id: string
  countNumber: string
  branchId: string
  status: StockCountStatus
  countedBy: string
  reviewedBy?: string
  countDate: string
  items: StockCountItem[]
  notes: string
  createdAt: string
  postedAt?: string
}

const ITEM_KEY = 'plamenco.inventory.items'
const CATEGORY_KEY = 'plamenco.inventory.categories'
const UNIT_KEY = 'plamenco.inventory.units'
const BRANCH_STOCK_KEY = 'plamenco.inventory.branchStock'
const MOVEMENT_KEY = 'plamenco.inventory.movements'
const BATCH_KEY = 'plamenco.inventory.batches'
const SUPPLIER_KEY = 'plamenco.inventory.suppliers'
const PO_KEY = 'plamenco.inventory.purchaseOrders'
const RECEIPT_KEY = 'plamenco.inventory.purchaseReceipts'
const TRANSFER_KEY = 'plamenco.inventory.transfers'
const STOCK_COUNT_KEY = 'plamenco.inventory.stockCounts'

const defaultCategories: InventoryCategory[] = [
  'Dental Materials',
  'Disposable Supplies',
  'PPE',
  'Sterilization Supplies',
  'Medications',
  'Office Supplies',
  'Cleaning Supplies',
  'Laboratory Materials',
  'Equipment Consumables',
  'Other',
].map((name) => ({ id: name.toLowerCase().replaceAll(' ', '_'), name, status: 'active' }))

const defaultUnits: InventoryUnit[] = [
  ['piece', 'Piece', 'pc'],
  ['box', 'Box', 'box'],
  ['pack', 'Pack', 'pack'],
  ['bottle', 'Bottle', 'btl'],
  ['tube', 'Tube', 'tube'],
  ['sachet', 'Sachet', 'sachet'],
  ['roll', 'Roll', 'roll'],
  ['pair', 'Pair', 'pair'],
  ['set', 'Set', 'set'],
  ['milliliter', 'Milliliter', 'ml'],
  ['liter', 'Liter', 'L'],
  ['gram', 'Gram', 'g'],
  ['kilogram', 'Kilogram', 'kg'],
].map(([id, label, abbreviation]) => ({ id, label, abbreviation, status: 'active' }))

function nowIso() {
  return new Date().toISOString()
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  } as Storage
}

function getStorage(): Storage {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) return globalThis.localStorage
  const globalWithMemory = globalThis as typeof globalThis & { __plamencoInventoryStorage?: Storage }
  if (globalWithMemory.__plamencoInventoryStorage) return globalWithMemory.__plamencoInventoryStorage
  const created = createMemoryStorage()
  globalWithMemory.__plamencoInventoryStorage = created
  return created
}

function safeParse<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function getList<T>(key: string): T[] {
  const parsed = safeParse<T[]>(getStorage().getItem(key))
  return Array.isArray(parsed) ? parsed : []
}

function saveList<T>(key: string, rows: T[]) {
  getStorage().setItem(key, JSON.stringify(rows))
}

function nextNumber(prefix: string, existing: string[]) {
  const next = existing.reduce((max, value) => {
    const match = value.match(new RegExp(`^${prefix}-(\\d+)$`))
    return match ? Math.max(max, Number(match[1])) : max
  }, 0) + 1
  return `${prefix}-${String(next).padStart(6, '0')}`
}

function audit(action: Parameters<typeof recordAuditEntry>[0]['action'], entity: string, entityId: string, metadata?: Record<string, string | number | boolean | null | undefined>) {
  recordAuditEntry({ user: getCurrentSessionUserName(), action, entity, entityId, metadata })
}

export function getInventoryCategories() {
  const stored = getList<InventoryCategory>(CATEGORY_KEY)
  return stored.length ? stored : defaultCategories
}

export function getInventoryUnits() {
  const stored = getList<InventoryUnit>(UNIT_KEY)
  return stored.length ? stored : defaultUnits
}

export function getInventoryItems() {
  return getList<InventoryItem>(ITEM_KEY)
}

export function getBranchInventory() {
  return getList<BranchInventory>(BRANCH_STOCK_KEY)
}

export function getStockMovements() {
  return getList<StockMovement>(MOVEMENT_KEY).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function getInventoryBatches() {
  return getList<InventoryBatch>(BATCH_KEY)
}

export function getSuppliers() {
  return getList<Supplier>(SUPPLIER_KEY)
}

export function getPurchaseOrders() {
  return getList<PurchaseOrder>(PO_KEY)
}

export function getPurchaseReceipts() {
  return getList<PurchaseReceipt>(RECEIPT_KEY)
}

export function getStockTransfers() {
  return getList<StockTransfer>(TRANSFER_KEY)
}

export function getStockCounts() {
  return getList<StockCount>(STOCK_COUNT_KEY).sort((a, b) => new Date(b.countDate).getTime() - new Date(a.countDate).getTime())
}

export function resetInventoryState() {
  for (const key of [ITEM_KEY, CATEGORY_KEY, UNIT_KEY, BRANCH_STOCK_KEY, MOVEMENT_KEY, BATCH_KEY, SUPPLIER_KEY, PO_KEY, RECEIPT_KEY, TRANSFER_KEY, STOCK_COUNT_KEY]) {
    getStorage().removeItem(key)
  }
}

export function createInventoryItem(input: Omit<InventoryItem, 'id' | 'itemCode' | 'createdAt' | 'updatedAt'> & { itemCode?: string }) {
  if (!input.name.trim()) throw new Error('Item name is required.')
  if (!input.unitId.trim()) throw new Error('Unit is required.')
  const items = getInventoryItems()
  const now = nowIso()
  const item: InventoryItem = {
    ...input,
    id: makeId('inventory-item'),
    itemCode: input.itemCode?.trim() || nextNumber('INV', items.map((entry) => entry.itemCode)),
    sku: input.sku.trim(),
    name: input.name.trim(),
    description: input.description.trim(),
    brand: input.brand.trim(),
    defaultReorderLevel: Math.max(0, input.defaultReorderLevel),
    expiryWarningDays: input.expiryWarningDays || 60,
    createdAt: now,
    updatedAt: now,
  }
  saveList(ITEM_KEY, [item, ...items])
  void insertRemoteTableRow('inventory_items', mapItem(item))
  audit('inventory_item_created', 'inventory_item', item.id, { itemCode: item.itemCode, name: item.name })
  return item
}

export function createSupplier(input: Omit<Supplier, 'id' | 'supplierNumber' | 'createdAt' | 'updatedAt'>) {
  if (!input.name.trim()) throw new Error('Supplier name is required.')
  const suppliers = getSuppliers()
  const now = nowIso()
  const supplier: Supplier = {
    ...input,
    id: makeId('supplier'),
    supplierNumber: nextNumber('SUP', suppliers.map((entry) => entry.supplierNumber)),
    name: input.name.trim(),
    createdAt: now,
    updatedAt: now,
  }
  saveList(SUPPLIER_KEY, [supplier, ...suppliers])
  void insertRemoteTableRow('suppliers', mapSupplier(supplier))
  audit('supplier_changed', 'supplier', supplier.id, { supplierNumber: supplier.supplierNumber, name: supplier.name })
  return supplier
}

function getOrCreateBranchStock(branchId: string, itemId: string) {
  const stocks = getBranchInventory()
  const existing = stocks.find((stock) => stock.branchId === branchId && stock.itemId === itemId)
  if (existing) return { stock: existing, stocks }
  const item = getInventoryItems().find((entry) => entry.id === itemId)
  if (!item) throw new Error('Inventory item not found.')
  const stock: BranchInventory = {
    id: makeId('branch-stock'),
    branchId,
    itemId,
    quantityOnHand: 0,
    reorderLevel: item.defaultReorderLevel,
    location: '',
    averageUnitCostCents: 0,
    updatedAt: nowIso(),
  }
  const next = [stock, ...stocks]
  saveList(BRANCH_STOCK_KEY, next)
  void insertRemoteTableRow('branch_inventory', mapBranchStock(stock))
  return { stock, stocks: next }
}

function postMovement(input: {
  branchId: string
  itemId: string
  movementType: StockMovementType
  quantity: number
  reason: string
  performedBy: string
  referenceType?: string
  referenceId?: string
  batchId?: string
  unitCostCents?: number
  patientId?: string
  clinicalVisitId?: string
  treatmentId?: string
  appointmentId?: string
  providerId?: string
}) {
  if (!input.branchId.trim()) throw new Error('Branch is required.')
  if (!input.itemId.trim()) throw new Error('Inventory item is required.')
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error('Quantity must be greater than zero.')
  if (!input.reason.trim()) throw new Error('Reason is required.')

  const { stock, stocks } = getOrCreateBranchStock(input.branchId, input.itemId)
  const decreases = ['consumption', 'manual_stock_out', 'transfer_out', 'adjustment_decrease', 'expired', 'damaged', 'return_to_supplier']
  const quantityBefore = stock.quantityOnHand
  const quantityAfter = decreases.includes(input.movementType) ? quantityBefore - input.quantity : quantityBefore + input.quantity
  if (quantityAfter < 0) throw new Error('Stock operation would create negative stock.')

  const now = nowIso()
  const unitCost = input.unitCostCents ?? stock.averageUnitCostCents
  const movement: StockMovement = {
    id: makeId('stock-movement'),
    ...input,
    quantityBefore,
    quantityAfter,
    unitCostCents: unitCost,
    totalCostCents: unitCost * input.quantity,
    createdAt: now,
  }
  const updatedStock = {
    ...stock,
    quantityOnHand: quantityAfter,
    averageUnitCostCents: input.unitCostCents && quantityAfter > 0
      ? Math.round(((stock.averageUnitCostCents * quantityBefore) + (input.unitCostCents * input.quantity)) / Math.max(quantityAfter, 1))
      : stock.averageUnitCostCents,
    updatedAt: now,
  }

  saveList(BRANCH_STOCK_KEY, stocks.map((entry) => entry.id === stock.id ? updatedStock : entry))
  saveList(MOVEMENT_KEY, [movement, ...getStockMovements()])
  void updateRemoteTableRow('branch_inventory', updatedStock.id, mapBranchStock(updatedStock))
  void insertRemoteTableRow('stock_movements', mapMovement(movement))
  audit('stock_movement_posted', 'stock_movement', movement.id, {
    branchId: movement.branchId,
    itemId: movement.itemId,
    movementType: movement.movementType,
    quantity: movement.quantity,
    quantityBefore,
    quantityAfter,
  })
  return movement
}

export function stockIn(input: {
  branchId: string
  itemId: string
  quantity: number
  unitCostCents?: number
  supplierId?: string
  reference?: string
  reason: string
  receivedDate: string
  batchNumber?: string
  expiryDate?: string
  notes?: string
  performedBy: string
  movementType?: 'manual_stock_in' | 'purchase_receipt'
  sourceType?: string
}) {
  const item = getInventoryItems().find((entry) => entry.id === input.itemId)
  if (!item) throw new Error('Inventory item not found.')
  let batchId: string | undefined
  if (item.trackBatches || item.trackExpiry || input.batchNumber || input.expiryDate) {
    const now = nowIso()
    const batch: InventoryBatch = {
      id: makeId('batch'),
      branchId: input.branchId,
      itemId: input.itemId,
      batchNumber: input.batchNumber?.trim() || `BATCH-${Date.now()}`,
      quantityOnHand: input.quantity,
      receivedDate: input.receivedDate,
      expiryDate: input.expiryDate,
      supplierId: input.supplierId,
      unitCostCents: input.unitCostCents ?? 0,
      sourceType: input.sourceType ?? input.movementType ?? 'manual_stock_in',
      sourceId: input.reference,
      createdAt: now,
      updatedAt: now,
    }
    batchId = batch.id
    saveList(BATCH_KEY, [batch, ...getInventoryBatches()])
    void insertRemoteTableRow('inventory_batches', mapBatch(batch))
  }
  return postMovement({
    branchId: input.branchId,
    itemId: input.itemId,
    batchId,
    movementType: input.movementType ?? 'manual_stock_in',
    quantity: input.quantity,
    unitCostCents: input.unitCostCents,
    referenceType: input.reference ? 'manual_reference' : undefined,
    referenceId: input.reference,
    reason: input.reason,
    performedBy: input.performedBy,
  })
}

export function stockOut(input: {
  branchId: string
  itemId: string
  quantity: number
  reason: string
  performedBy: string
  patientId?: string
  clinicalVisitId?: string
  treatmentId?: string
  appointmentId?: string
  providerId?: string
}) {
  return postMovement({ ...input, movementType: 'manual_stock_out' })
}

export function consumeStock(input: Parameters<typeof stockOut>[0]) {
  return postMovement({ ...input, movementType: 'consumption' })
}

export function adjustStock(input: { branchId: string; itemId: string; adjustmentQuantity: number; reason: string; notes?: string; performedBy: string }) {
  if (input.adjustmentQuantity === 0) throw new Error('Adjustment quantity cannot be zero.')
  return postMovement({
    branchId: input.branchId,
    itemId: input.itemId,
    movementType: input.adjustmentQuantity > 0 ? 'adjustment_increase' : 'adjustment_decrease',
    quantity: Math.abs(input.adjustmentQuantity),
    reason: input.notes ? `${input.reason}: ${input.notes}` : input.reason,
    performedBy: input.performedBy,
  })
}

export function createPurchaseOrder(input: Omit<PurchaseOrder, 'id' | 'poNumber' | 'subtotalCents' | 'totalCents' | 'status' | 'createdAt' | 'updatedAt'> & { status?: PurchaseOrderStatus }) {
  if (!input.supplierId.trim()) throw new Error('Supplier is required.')
  if (!input.branchId.trim()) throw new Error('Destination branch is required.')
  if (!input.items.length) throw new Error('Purchase order must include items.')
  const orders = getPurchaseOrders()
  const now = nowIso()
  const subtotalCents = input.items.reduce((sum, item) => sum + item.quantityOrdered * item.unitCostCents, 0)
  const order: PurchaseOrder = {
    ...input,
    id: makeId('purchase-order'),
    poNumber: nextNumber('PO', orders.map((entry) => entry.poNumber)),
    items: input.items.map((item) => ({ ...item, quantityReceived: item.quantityReceived ?? 0 })),
    subtotalCents,
    totalCents: subtotalCents,
    status: input.status ?? 'ordered',
    createdAt: now,
    updatedAt: now,
  }
  saveList(PO_KEY, [order, ...orders])
  void insertRemoteTableRow('purchase_orders', mapPurchaseOrder(order))
  audit('purchase_order_created', 'purchase_order', order.id, { poNumber: order.poNumber, branchId: order.branchId, totalCents: order.totalCents })
  return order
}

export function receivePurchaseOrder(input: {
  poId: string
  receivedBy: string
  receivedDate: string
  notes?: string
  supplierInvoiceNumber?: string
  supplierInvoiceDate?: string
  supplierInvoiceDueDate?: string
  supplierInvoiceAmountCents?: number
  items: Array<{ poItemId: string; quantityReceived: number; batchNumber?: string; expiryDate?: string; unitCostCents?: number }>
}) {
  const orders = getPurchaseOrders()
  const orderIndex = orders.findIndex((order) => order.id === input.poId)
  if (orderIndex === -1) throw new Error('Purchase order not found.')
  const order = orders[orderIndex]
  if (order.status === 'cancelled' || order.status === 'received') throw new Error('Purchase order cannot be received in its current status.')

  const receipt: PurchaseReceipt = {
    id: makeId('purchase-receipt'),
    receiptNumber: nextNumber('POR', getPurchaseReceipts().map((entry) => entry.receiptNumber)),
    poId: order.id,
    supplierId: order.supplierId,
    branchId: order.branchId,
    receivedDate: input.receivedDate,
    receivedBy: input.receivedBy,
    supplierInvoiceNumber: input.supplierInvoiceNumber ?? '',
    supplierInvoiceDate: input.supplierInvoiceDate,
    supplierInvoiceDueDate: input.supplierInvoiceDueDate,
    supplierInvoiceAmountCents: input.supplierInvoiceAmountCents ?? 0,
    notes: input.notes ?? '',
    totalCostCents: 0,
    createdAt: nowIso(),
  }

  const updatedItems = order.items.map((poItem) => {
    const received = input.items.find((entry) => entry.poItemId === poItem.id)
    if (!received) return poItem
    const remaining = poItem.quantityOrdered - poItem.quantityReceived
    if (received.quantityReceived <= 0 || received.quantityReceived > remaining) throw new Error('Received quantity exceeds remaining purchase order quantity.')
    const unitCostCents = received.unitCostCents ?? poItem.unitCostCents
    stockIn({
      branchId: order.branchId,
      itemId: poItem.itemId,
      quantity: received.quantityReceived,
      unitCostCents,
      supplierId: order.supplierId,
      reference: receipt.receiptNumber,
      reason: `Purchase receipt ${receipt.receiptNumber}`,
      receivedDate: input.receivedDate,
      batchNumber: received.batchNumber,
      expiryDate: received.expiryDate,
      performedBy: input.receivedBy,
      movementType: 'purchase_receipt',
      sourceType: 'purchase_receipt',
    })
    receipt.totalCostCents += received.quantityReceived * unitCostCents
    return { ...poItem, quantityReceived: poItem.quantityReceived + received.quantityReceived }
  })

  const allReceived = updatedItems.every((item) => item.quantityReceived >= item.quantityOrdered)
  const someReceived = updatedItems.some((item) => item.quantityReceived > 0)
  const updatedOrder = { ...order, items: updatedItems, status: allReceived ? 'received' as const : someReceived ? 'partially_received' as const : order.status, updatedAt: nowIso() }
  orders[orderIndex] = updatedOrder
  saveList(PO_KEY, orders)
  saveList(RECEIPT_KEY, [receipt, ...getPurchaseReceipts()])
  void updateRemoteTableRow('purchase_orders', order.id, mapPurchaseOrder(updatedOrder))
  void insertRemoteTableRow('purchase_receipts', mapPurchaseReceipt(receipt))
  audit('purchase_received', 'purchase_receipt', receipt.id, { poId: order.id, branchId: order.branchId, totalCostCents: receipt.totalCostCents })
  return { receipt, order: updatedOrder }
}

export function transferStock(input: { fromBranchId: string; toBranchId: string; items: StockTransferItem[]; requestedBy: string; receivedBy: string; notes?: string }) {
  const transfer = createStockTransfer(input)
  dispatchStockTransfer(transfer.id, input.requestedBy)
  return receiveStockTransfer(transfer.id, input.receivedBy)
}

export function createStockTransfer(input: { fromBranchId: string; toBranchId: string; items: StockTransferItem[]; requestedBy: string; notes?: string }) {
  if (input.fromBranchId === input.toBranchId) throw new Error('Transfer branches must be different.')
  if (!input.items.length) throw new Error('Transfer must include at least one item.')
  for (const item of input.items) {
    const source = getBranchStock(input.fromBranchId, item.itemId)
    if (!source || item.quantity > source.quantityOnHand) throw new Error('Transfer quantity exceeds available source stock.')
  }
  const transfer: StockTransfer = {
    id: makeId('stock-transfer'),
    transferNumber: nextNumber('TRF', getStockTransfers().map((entry) => entry.transferNumber)),
    fromBranchId: input.fromBranchId,
    toBranchId: input.toBranchId,
    status: 'draft',
    items: input.items,
    requestedBy: input.requestedBy,
    notes: input.notes ?? '',
    createdAt: nowIso(),
  }
  saveList(TRANSFER_KEY, [transfer, ...getStockTransfers()])
  void insertRemoteTableRow('stock_transfers', mapTransfer(transfer))
  audit('stock_transfer_initiated', 'stock_transfer', transfer.id, { transferNumber: transfer.transferNumber, fromBranchId: input.fromBranchId, toBranchId: input.toBranchId })
  return transfer
}

export function dispatchStockTransfer(transferId: string, sentBy: string) {
  const transfers = getStockTransfers()
  const transfer = transfers.find((entry) => entry.id === transferId)
  if (!transfer) throw new Error('Transfer not found.')
  if (transfer.status !== 'draft') throw new Error('Only draft transfers can be dispatched.')
  for (const item of transfer.items) {
    const source = getBranchStock(transfer.fromBranchId, item.itemId)
    if (!source || item.quantity > source.quantityOnHand) throw new Error('Transfer quantity exceeds available source stock.')
  }
  for (const item of transfer.items) {
    postMovement({ branchId: transfer.fromBranchId, itemId: item.itemId, movementType: 'transfer_out', quantity: item.quantity, reason: `Transfer ${transfer.transferNumber} dispatched`, performedBy: sentBy, referenceType: 'stock_transfer', referenceId: transfer.id })
  }
  const updated = { ...transfer, status: 'in_transit' as const, sentBy, sentAt: nowIso() }
  saveList(TRANSFER_KEY, transfers.map((entry) => entry.id === transferId ? updated : entry))
  void updateRemoteTableRow('stock_transfers', transfer.id, mapTransfer(updated))
  audit('stock_transfer_initiated', 'stock_transfer', transfer.id, { transferNumber: transfer.transferNumber, status: updated.status })
  return updated
}

export function receiveStockTransfer(transferId: string, receivedBy: string) {
  const transfers = getStockTransfers()
  const transfer = transfers.find((entry) => entry.id === transferId)
  if (!transfer) throw new Error('Transfer not found.')
  if (transfer.status !== 'in_transit') throw new Error('Only in-transit transfers can be received.')
  for (const item of transfer.items) {
    postMovement({ branchId: transfer.toBranchId, itemId: item.itemId, movementType: 'transfer_in', quantity: item.quantity, reason: `Transfer ${transfer.transferNumber} received`, performedBy: receivedBy, referenceType: 'stock_transfer', referenceId: transfer.id })
  }
  const updated = { ...transfer, status: 'received' as const, receivedBy, receivedAt: nowIso() }
  saveList(TRANSFER_KEY, transfers.map((entry) => entry.id === transferId ? updated : entry))
  void updateRemoteTableRow('stock_transfers', transfer.id, mapTransfer(updated))
  audit('stock_transfer_received', 'stock_transfer', transfer.id, { transferNumber: transfer.transferNumber, fromBranchId: transfer.fromBranchId, toBranchId: transfer.toBranchId })
  return updated
}

export function createStockCount(input: { branchId: string; countedBy: string; countDate: string; itemIds?: string[]; notes?: string }) {
  if (!input.branchId.trim()) throw new Error('Branch is required.')
  const candidateItems = input.itemIds?.length ? input.itemIds : getInventoryItems().filter((item) => item.status === 'active').map((item) => item.id)
  const count: StockCount = {
    id: makeId('stock-count'),
    countNumber: nextNumber('CNT', getStockCounts().map((entry) => entry.countNumber)),
    branchId: input.branchId,
    status: 'draft',
    countedBy: input.countedBy,
    countDate: input.countDate,
    items: candidateItems.map((itemId) => {
      const systemQuantity = getBranchStock(input.branchId, itemId)?.quantityOnHand ?? 0
      return { id: makeId('stock-count-item'), itemId, systemQuantity, physicalQuantity: systemQuantity, difference: 0, reason: '' }
    }),
    notes: input.notes ?? '',
    createdAt: nowIso(),
  }
  saveList(STOCK_COUNT_KEY, [count, ...getStockCounts()])
  void insertRemoteTableRow('stock_counts', mapStockCount(count))
  audit('stock_movement_posted', 'stock_count', count.id, { countNumber: count.countNumber, branchId: count.branchId, status: count.status })
  return count
}

export function updateStockCountItem(countId: string, itemId: string, physicalQuantity: number, reason = '') {
  if (!Number.isFinite(physicalQuantity) || physicalQuantity < 0) throw new Error('Physical quantity must be zero or greater.')
  const counts = getStockCounts()
  const count = counts.find((entry) => entry.id === countId)
  if (!count) throw new Error('Stock count not found.')
  if (count.status !== 'draft') throw new Error('Only draft stock counts can be edited.')
  const updated: StockCount = {
    ...count,
    items: count.items.map((item) => item.itemId === itemId ? {
      ...item,
      physicalQuantity,
      difference: physicalQuantity - item.systemQuantity,
      reason,
    } : item),
  }
  saveList(STOCK_COUNT_KEY, counts.map((entry) => entry.id === countId ? updated : entry))
  void updateRemoteTableRow('stock_counts', count.id, mapStockCount(updated))
  return updated
}

export function reviewStockCount(countId: string, reviewedBy: string) {
  const counts = getStockCounts()
  const count = counts.find((entry) => entry.id === countId)
  if (!count) throw new Error('Stock count not found.')
  if (count.status !== 'draft') throw new Error('Only draft stock counts can be reviewed.')
  const updated = { ...count, status: 'reviewed' as const, reviewedBy }
  saveList(STOCK_COUNT_KEY, counts.map((entry) => entry.id === countId ? updated : entry))
  void updateRemoteTableRow('stock_counts', count.id, mapStockCount(updated))
  return updated
}

export function postStockCountReconciliation(countId: string, postedBy: string) {
  const counts = getStockCounts()
  const count = counts.find((entry) => entry.id === countId)
  if (!count) throw new Error('Stock count not found.')
  if (count.status !== 'reviewed') throw new Error('Only reviewed stock counts can be reconciled.')
  for (const item of count.items.filter((entry) => entry.difference !== 0)) {
    postMovement({
      branchId: count.branchId,
      itemId: item.itemId,
      movementType: item.difference > 0 ? 'adjustment_increase' : 'adjustment_decrease',
      quantity: Math.abs(item.difference),
      reason: `Stock count ${count.countNumber}`,
      performedBy: postedBy,
      referenceType: 'stock_count',
      referenceId: count.id,
    })
  }
  const updated = { ...count, status: 'posted' as const, postedAt: nowIso(), reviewedBy: count.reviewedBy ?? postedBy }
  saveList(STOCK_COUNT_KEY, counts.map((entry) => entry.id === countId ? updated : entry))
  void updateRemoteTableRow('stock_counts', count.id, mapStockCount(updated))
  audit('stock_movement_posted', 'stock_count', count.id, { countNumber: count.countNumber, status: updated.status })
  return updated
}

export function getBranchStock(branchId: string, itemId: string) {
  return getBranchInventory().find((stock) => stock.branchId === branchId && stock.itemId === itemId)
}

export function getItemMovements(itemId: string, branchId?: string) {
  return getStockMovements().filter((movement) => movement.itemId === itemId && (!branchId || movement.branchId === branchId))
}

export function getStockStatus(stock?: BranchInventory): StockStatus {
  if (!stock || stock.quantityOnHand <= 0) return 'out_of_stock'
  if (stock.quantityOnHand <= stock.reorderLevel) return 'low_stock'
  return 'in_stock'
}

export function getExpiryStatus(batch: InventoryBatch, item?: InventoryItem): ExpiryStatus {
  if (!batch.expiryDate) return 'not_tracked'
  const today = new Date()
  const expiry = new Date(`${batch.expiryDate}T00:00:00`)
  if (expiry < today) return 'expired'
  const warningDays = item?.expiryWarningDays ?? 60
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / 86400000)
  return diffDays <= warningDays ? 'expiring_soon' : 'valid'
}

export function getUsableBranchQuantity(branchId: string, itemId: string) {
  const item = getInventoryItems().find((entry) => entry.id === itemId)
  const stock = getBranchStock(branchId, itemId)?.quantityOnHand ?? 0
  if (!item?.trackExpiry) return stock
  const expiredQuantity = getInventoryBatches()
    .filter((batch) => batch.branchId === branchId && batch.itemId === itemId && getExpiryStatus(batch, item) === 'expired')
    .reduce((sum, batch) => sum + batch.quantityOnHand, 0)
  return Math.max(stock - expiredQuantity, 0)
}

export function getInventoryOverview(branchId?: string) {
  const items = getInventoryItems().filter((item) => item.status === 'active')
  const stocks = getBranchInventory().filter((stock) => !branchId || stock.branchId === branchId)
  const batches = getInventoryBatches()
  const stockStatuses = stocks.map(getStockStatus)
  return {
    totalActiveItems: items.length,
    lowStockItems: stockStatuses.filter((status) => status === 'low_stock').length,
    outOfStockItems: stockStatuses.filter((status) => status === 'out_of_stock').length,
    expiringSoon: batches.filter((batch) => getExpiryStatus(batch, items.find((item) => item.id === batch.itemId)) === 'expiring_soon').length,
    pendingPurchaseOrders: getPurchaseOrders().filter((order) => order.status === 'ordered' || order.status === 'partially_received').length,
    pendingTransfers: getStockTransfers().filter((transfer) => transfer.status === 'draft' || transfer.status === 'in_transit').length,
    openStockCounts: getStockCounts().filter((count) => count.status === 'draft' || count.status === 'reviewed').length,
    inventoryValueCents: getInventoryValuation(branchId),
  }
}

export function getInventoryValuation(branchId?: string) {
  return getBranchInventory()
    .filter((stock) => !branchId || stock.branchId === branchId)
    .reduce((sum, stock) => sum + stock.quantityOnHand * stock.averageUnitCostCents, 0)
}

function mapItem(item: InventoryItem) {
  return {
    id: item.id,
    item_code: item.itemCode,
    sku: item.sku,
    name: item.name,
    description: item.description,
    category_id: item.categoryId,
    unit_id: item.unitId,
    brand: item.brand,
    default_supplier_id: item.defaultSupplierId ?? null,
    default_reorder_level: item.defaultReorderLevel,
    track_batches: item.trackBatches,
    track_expiry: item.trackExpiry,
    expiry_warning_days: item.expiryWarningDays,
    status: item.status,
  }
}

function mapSupplier(supplier: Supplier) {
  return {
    id: supplier.id,
    supplier_number: supplier.supplierNumber,
    name: supplier.name,
    contact_person: supplier.contactPerson,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    notes: supplier.notes,
    status: supplier.status,
  }
}

function mapBranchStock(stock: BranchInventory) {
  return {
    id: stock.id,
    branch_id: stock.branchId,
    inventory_item_id: stock.itemId,
    quantity_on_hand: stock.quantityOnHand,
    reorder_level: stock.reorderLevel,
    location: stock.location,
    average_unit_cost_cents: stock.averageUnitCostCents,
  }
}

function mapBatch(batch: InventoryBatch) {
  return {
    id: batch.id,
    branch_id: batch.branchId,
    inventory_item_id: batch.itemId,
    batch_number: batch.batchNumber,
    quantity_on_hand: batch.quantityOnHand,
    received_date: batch.receivedDate,
    expiry_date: batch.expiryDate ?? null,
    supplier_id: batch.supplierId ?? null,
    unit_cost_cents: batch.unitCostCents,
    source_type: batch.sourceType,
    source_id: batch.sourceId ?? null,
  }
}

function mapMovement(movement: StockMovement) {
  return {
    id: movement.id,
    branch_id: movement.branchId,
    inventory_item_id: movement.itemId,
    batch_id: movement.batchId ?? null,
    movement_type: movement.movementType,
    quantity: movement.quantity,
    quantity_before: movement.quantityBefore,
    quantity_after: movement.quantityAfter,
    reference_type: movement.referenceType ?? '',
    reference_id: movement.referenceId ?? '',
    reason: movement.reason,
    performed_by: movement.performedBy,
    patient_id: movement.patientId ?? null,
    clinical_visit_id: movement.clinicalVisitId ?? null,
    treatment_id: movement.treatmentId ?? null,
    appointment_id: movement.appointmentId ?? null,
    provider_id: movement.providerId ?? null,
    unit_cost_cents: movement.unitCostCents ?? 0,
    total_cost_cents: movement.totalCostCents ?? 0,
  }
}

function mapPurchaseOrder(order: PurchaseOrder) {
  return {
    id: order.id,
    po_number: order.poNumber,
    supplier_id: order.supplierId,
    branch_id: order.branchId,
    order_date: order.orderDate,
    expected_delivery_date: order.expectedDeliveryDate ?? null,
    status: order.status,
    items: order.items,
    subtotal_cents: order.subtotalCents,
    total_cents: order.totalCents,
    notes: order.notes,
    created_by: order.createdBy,
    approved_by: order.approvedBy ?? '',
  }
}

function mapPurchaseReceipt(receipt: PurchaseReceipt) {
  return {
    id: receipt.id,
    receipt_number: receipt.receiptNumber,
    purchase_order_id: receipt.poId,
    supplier_id: receipt.supplierId,
    branch_id: receipt.branchId,
    received_date: receipt.receivedDate,
    received_by: receipt.receivedBy,
    notes: receipt.notes,
    total_cost_cents: receipt.totalCostCents,
    supplier_invoice_number: receipt.supplierInvoiceNumber ?? '',
    supplier_invoice_date: receipt.supplierInvoiceDate ?? null,
    supplier_invoice_due_date: receipt.supplierInvoiceDueDate ?? null,
    supplier_invoice_amount_cents: receipt.supplierInvoiceAmountCents ?? 0,
  }
}

function mapTransfer(transfer: StockTransfer) {
  return {
    id: transfer.id,
    transfer_number: transfer.transferNumber,
    from_branch_id: transfer.fromBranchId,
    to_branch_id: transfer.toBranchId,
    status: transfer.status,
    items: transfer.items,
    requested_by: transfer.requestedBy,
    sent_by: transfer.sentBy ?? '',
    received_by: transfer.receivedBy ?? '',
    notes: transfer.notes,
    sent_at: transfer.sentAt ?? null,
    received_at: transfer.receivedAt ?? null,
  }
}

function mapStockCount(count: StockCount) {
  return {
    id: count.id,
    count_number: count.countNumber,
    branch_id: count.branchId,
    status: count.status,
    counted_by: count.countedBy,
    reviewed_by: count.reviewedBy ?? '',
    count_date: count.countDate,
    items: count.items,
    notes: count.notes,
    posted_at: count.postedAt ?? null,
  }
}

export {
  BATCH_KEY,
  BRANCH_STOCK_KEY,
  CATEGORY_KEY,
  ITEM_KEY,
  MOVEMENT_KEY,
  PO_KEY,
  RECEIPT_KEY,
  STOCK_COUNT_KEY,
  SUPPLIER_KEY,
  TRANSFER_KEY,
  UNIT_KEY,
}
