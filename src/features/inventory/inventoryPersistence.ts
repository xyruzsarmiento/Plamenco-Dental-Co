import { supabase } from '../../lib/supabase'
import { createUuid } from '../../lib/id'
import {
  getBranchInventory,
  getStockMovements,
  type BranchInventory,
  type PurchaseOrder,
  type PurchaseReceipt,
  type StockCount,
  type StockMovement,
  type StockMovementType,
  type StockTransfer,
} from './inventoryStore'

type RefreshScope = {
  branchIds?: string[]
}

const ITEM_KEY = 'plamenco.inventory.items'
const CATEGORY_KEY = 'plamenco.inventory.categories'
const UNIT_KEY = 'plamenco.inventory.units'
const BRANCH_STOCK_KEY = 'plamenco.inventory.branchStock'
const BATCH_KEY = 'plamenco.inventory.batches'
const SUPPLIER_KEY = 'plamenco.inventory.suppliers'
const MOVEMENT_KEY = 'plamenco.inventory.movements'
const PO_KEY = 'plamenco.inventory.purchaseOrders'
const RECEIPT_KEY = 'plamenco.inventory.purchaseReceipts'
const TRANSFER_KEY = 'plamenco.inventory.transfers'
const STOCK_COUNT_KEY = 'plamenco.inventory.stockCounts'

function requireDatabase() {
  if (!supabase) throw new Error('Clinic database is not configured. Stock cannot be changed safely.')
  return supabase
}

function mapCategory(row: Record<string, any>) {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    status: row.status ?? 'active',
  }
}

function mapUnit(row: Record<string, any>) {
  return {
    id: String(row.id),
    label: String(row.label ?? ''),
    abbreviation: String(row.abbreviation ?? ''),
    status: row.status ?? 'active',
  }
}

function mapSupplier(row: Record<string, any>) {
  return {
    id: String(row.id),
    supplierNumber: String(row.supplier_number ?? ''),
    name: String(row.name ?? ''),
    contactPerson: String(row.contact_person ?? ''),
    phone: String(row.phone ?? ''),
    email: String(row.email ?? ''),
    address: String(row.address ?? ''),
    notes: String(row.notes ?? ''),
    status: row.status ?? 'active',
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }
}

function mapItem(row: Record<string, any>) {
  return {
    id: String(row.id),
    itemCode: String(row.item_code ?? ''),
    sku: String(row.sku ?? ''),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    categoryId: String(row.category_id ?? ''),
    unitId: String(row.unit_id ?? ''),
    brand: String(row.brand ?? ''),
    defaultSupplierId: row.default_supplier_id ?? undefined,
    defaultReorderLevel: Number(row.default_reorder_level ?? 0),
    trackBatches: Boolean(row.track_batches),
    trackExpiry: Boolean(row.track_expiry),
    expiryWarningDays: Number(row.expiry_warning_days ?? 60),
    status: row.status ?? 'active',
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }
}

function mapBatch(row: Record<string, any>) {
  return {
    id: String(row.id),
    branchId: String(row.branch_id),
    itemId: String(row.inventory_item_id),
    batchNumber: String(row.batch_number ?? ''),
    quantityOnHand: Number(row.quantity_on_hand ?? 0),
    receivedDate: row.received_date ?? '',
    expiryDate: row.expiry_date ?? undefined,
    supplierId: row.supplier_id ?? undefined,
    unitCostCents: Number(row.unit_cost_cents ?? 0),
    sourceType: row.source_type ?? '',
    sourceId: row.source_id ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }
}

function mapMovement(row: Record<string, any>): StockMovement {
  return {
    id: String(row.id),
    branchId: String(row.branch_id),
    itemId: String(row.inventory_item_id),
    batchId: row.batch_id ?? undefined,
    movementType: row.movement_type as StockMovementType,
    quantity: Number(row.quantity ?? 0),
    quantityBefore: Number(row.quantity_before ?? 0),
    quantityAfter: Number(row.quantity_after ?? 0),
    referenceType: row.reference_type || undefined,
    referenceId: row.reference_id || undefined,
    reason: row.reason ?? '',
    performedBy: row.performed_by ?? '',
    patientId: row.patient_id ?? undefined,
    clinicalVisitId: row.clinical_visit_id ?? undefined,
    treatmentId: row.treatment_id ?? undefined,
    appointmentId: row.appointment_id ?? undefined,
    providerId: row.provider_id ?? undefined,
    unitCostCents: Number(row.unit_cost_cents ?? 0),
    totalCostCents: Number(row.total_cost_cents ?? 0),
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}

function mapStock(row: Record<string, any>): BranchInventory {
  return {
    id: String(row.id),
    branchId: String(row.branch_id),
    itemId: String(row.inventory_item_id),
    quantityOnHand: Number(row.quantity_on_hand ?? 0),
    reorderLevel: Number(row.reorder_level ?? 0),
    location: row.location ?? '',
    averageUnitCostCents: Number(row.average_unit_cost_cents ?? 0),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  }
}

function mapPurchaseOrder(row: Record<string, any>): PurchaseOrder {
  return {
    id: String(row.id),
    poNumber: row.po_number ?? '',
    supplierId: row.supplier_id ?? '',
    branchId: row.branch_id ?? '',
    orderDate: row.order_date ?? '',
    expectedDeliveryDate: row.expected_delivery_date ?? undefined,
    status: row.status,
    items: Array.isArray(row.items) ? row.items : [],
    subtotalCents: Number(row.subtotal_cents ?? 0),
    totalCents: Number(row.total_cents ?? 0),
    notes: row.notes ?? '',
    createdBy: row.created_by ?? '',
    approvedBy: row.approved_by || undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  }
}

function mapPurchaseReceipt(row: Record<string, any>): PurchaseReceipt {
  return {
    id: String(row.id),
    receiptNumber: row.receipt_number ?? '',
    poId: row.purchase_order_id ?? '',
    supplierId: row.supplier_id ?? '',
    branchId: row.branch_id ?? '',
    receivedDate: row.received_date ?? '',
    receivedBy: row.received_by ?? '',
    supplierInvoiceNumber: row.supplier_invoice_number || undefined,
    supplierInvoiceDate: row.supplier_invoice_date ?? undefined,
    supplierInvoiceDueDate: row.supplier_invoice_due_date ?? undefined,
    supplierInvoiceAmountCents: Number(row.supplier_invoice_amount_cents ?? 0),
    notes: row.notes ?? '',
    totalCostCents: Number(row.total_cost_cents ?? 0),
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}

function mapTransfer(row: Record<string, any>): StockTransfer {
  return {
    id: String(row.id),
    transferNumber: row.transfer_number ?? '',
    fromBranchId: row.from_branch_id ?? '',
    toBranchId: row.to_branch_id ?? '',
    status: row.status,
    items: Array.isArray(row.items) ? row.items : [],
    requestedBy: row.requested_by ?? '',
    sentBy: row.sent_by || undefined,
    sentAt: row.sent_at ?? undefined,
    receivedBy: row.received_by || undefined,
    notes: row.notes ?? '',
    createdAt: row.created_at ?? new Date().toISOString(),
    receivedAt: row.received_at ?? undefined,
  }
}

function mapStockCount(row: Record<string, any>): StockCount {
  return {
    id: String(row.id),
    countNumber: row.count_number ?? '',
    branchId: row.branch_id ?? '',
    status: row.status,
    countedBy: row.counted_by ?? '',
    reviewedBy: row.reviewed_by || undefined,
    countDate: row.count_date ?? '',
    items: Array.isArray(row.items) ? row.items : [],
    notes: row.notes ?? '',
    createdAt: row.created_at ?? new Date().toISOString(),
    postedAt: row.posted_at ?? undefined,
  }
}

function setCache(key: string, value: unknown) {
  if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value))
}

function readCache<T>(key: string): T[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]') as T[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function mergeById<T extends { id: string }>(key: string, incoming: T[], shouldReplace: (row: T) => boolean) {
  const current = readCache<T>(key)
  setCache(key, [...incoming, ...current.filter((row) => !shouldReplace(row) && !incoming.some((entry) => entry.id === row.id))])
}

function updateCaches(movement: StockMovement, stock: BranchInventory) {
  if (typeof window === 'undefined') return
  const movements = [movement, ...getStockMovements().filter((entry) => entry.id !== movement.id)]
  const stocks = [stock, ...getBranchInventory().filter((entry) => entry.id !== stock.id && !(entry.branchId === stock.branchId && entry.itemId === stock.itemId))]
  setCache(MOVEMENT_KEY, movements)
  setCache(BRANCH_STOCK_KEY, stocks)
}

export async function refreshInventoryOperationalCaches(scope: RefreshScope = {}) {
  const db = requireDatabase()
  const branchIds = [...new Set((scope.branchIds ?? []).filter(Boolean))]
  const scoped = branchIds.length > 0
  const transferFilter = `from_branch_id.in.(${branchIds.join(',')}),to_branch_id.in.(${branchIds.join(',')})`
  const stocksQuery = scoped ? db.from('branch_inventory').select('*').in('branch_id', branchIds) : db.from('branch_inventory').select('*')
  const batchesQuery = scoped ? db.from('inventory_batches').select('*').in('branch_id', branchIds) : db.from('inventory_batches').select('*')
  const movementsQuery = scoped ? db.from('stock_movements').select('*').in('branch_id', branchIds).order('created_at', { ascending: false }) : db.from('stock_movements').select('*').order('created_at', { ascending: false })
  const ordersQuery = scoped ? db.from('purchase_orders').select('*').in('branch_id', branchIds).order('created_at', { ascending: false }) : db.from('purchase_orders').select('*').order('created_at', { ascending: false })
  const receiptsQuery = scoped ? db.from('purchase_receipts').select('*').in('branch_id', branchIds).order('created_at', { ascending: false }) : db.from('purchase_receipts').select('*').order('created_at', { ascending: false })
  const transfersQuery = scoped ? db.from('stock_transfers').select('*').or(transferFilter).order('created_at', { ascending: false }) : db.from('stock_transfers').select('*').order('created_at', { ascending: false })
  const countsQuery = scoped ? db.from('stock_counts').select('*').in('branch_id', branchIds).order('created_at', { ascending: false }) : db.from('stock_counts').select('*').order('created_at', { ascending: false })
  const [
    categoriesResult,
    unitsResult,
    suppliersResult,
    itemsResult,
    stocksResult,
    batchesResult,
    movementsResult,
    ordersResult,
    receiptsResult,
    transfersResult,
    countsResult,
  ] = await Promise.all([
    db.from('inventory_categories').select('*'),
    db.from('inventory_units').select('*'),
    db.from('suppliers').select('*').order('name', { ascending: true }),
    db.from('inventory_items').select('*').order('name', { ascending: true }),
    stocksQuery,
    batchesQuery,
    movementsQuery,
    ordersQuery,
    receiptsQuery,
    transfersQuery,
    countsQuery,
  ])
  const firstError = [categoriesResult.error, unitsResult.error, suppliersResult.error, itemsResult.error, stocksResult.error, batchesResult.error, movementsResult.error, ordersResult.error, receiptsResult.error, transfersResult.error, countsResult.error].find(Boolean)
  if (firstError) throw new Error(`Inventory was saved, but the latest database state could not be refreshed: ${firstError?.message}`)

  setCache(CATEGORY_KEY, (categoriesResult.data ?? []).map((row) => mapCategory(row as Record<string, any>)))
  setCache(UNIT_KEY, (unitsResult.data ?? []).map((row) => mapUnit(row as Record<string, any>)))
  setCache(SUPPLIER_KEY, (suppliersResult.data ?? []).map((row) => mapSupplier(row as Record<string, any>)))
  setCache(ITEM_KEY, (itemsResult.data ?? []).map((row) => mapItem(row as Record<string, any>)))

  const stocks = (stocksResult.data ?? []).map((row) => mapStock(row as Record<string, any>))
  const batches = (batchesResult.data ?? []).map((row) => mapBatch(row as Record<string, any>))
  const movements = (movementsResult.data ?? []).map((row) => mapMovement(row as Record<string, any>))
  const orders = (ordersResult.data ?? []).map((row) => mapPurchaseOrder(row as Record<string, any>))
  const receipts = (receiptsResult.data ?? []).map((row) => mapPurchaseReceipt(row as Record<string, any>))
  const transfers = (transfersResult.data ?? []).map((row) => mapTransfer(row as Record<string, any>))
  const counts = (countsResult.data ?? []).map((row) => mapStockCount(row as Record<string, any>))

  if (!scoped) {
    setCache(BRANCH_STOCK_KEY, stocks)
    setCache(BATCH_KEY, batches)
    setCache(MOVEMENT_KEY, movements)
    setCache(PO_KEY, orders)
    setCache(RECEIPT_KEY, receipts)
    setCache(TRANSFER_KEY, transfers)
    setCache(STOCK_COUNT_KEY, counts)
    return
  }

  const inScope = (branchId: string) => branchIds.includes(branchId)
  mergeById(BRANCH_STOCK_KEY, stocks, (row: BranchInventory) => inScope(row.branchId))
  mergeById(BATCH_KEY, batches, (row: ReturnType<typeof mapBatch>) => inScope(row.branchId))
  mergeById(MOVEMENT_KEY, movements, (row: StockMovement) => inScope(row.branchId))
  mergeById(PO_KEY, orders, (row: PurchaseOrder) => inScope(row.branchId))
  mergeById(RECEIPT_KEY, receipts, (row: PurchaseReceipt) => inScope(row.branchId))
  mergeById(TRANSFER_KEY, transfers, (row: StockTransfer) => inScope(row.fromBranchId) || inScope(row.toBranchId))
  mergeById(STOCK_COUNT_KEY, counts, (row: StockCount) => inScope(row.branchId))
}

export async function postStockMovementPersisted(input: {
  branchId: string
  itemId: string
  movementType: StockMovementType
  quantity: number
  reason: string
  referenceType?: string
  referenceId?: string
  batchId?: string
  unitCostCents?: number
  clientRequestId?: string
}): Promise<{ movement: StockMovement; stock: BranchInventory }> {
  if (!input.branchId.trim()) throw new Error('Branch is required.')
  if (!input.itemId.trim()) throw new Error('Inventory item is required.')
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error('Quantity must be greater than zero.')
  if (!input.reason.trim()) throw new Error('Reason is required.')

  const db = requireDatabase()
  const clientRequestId = input.clientRequestId ?? createUuid()
  const { data, error } = await db.rpc('post_stock_movement', {
    p_branch_id: input.branchId,
    p_inventory_item_id: input.itemId,
    p_movement_type: input.movementType,
    p_quantity: input.quantity,
    p_reason: input.reason.trim(),
    p_performed_by: '',
    p_reference_type: input.referenceType ?? '',
    p_reference_id: input.referenceId ?? '',
    p_batch_id: input.batchId ?? null,
    p_unit_cost_cents: input.unitCostCents ?? 0,
    p_client_request_id: clientRequestId,
  })
  if (error || !data) {
    if (import.meta.env.DEV && error?.message) console.error('[inventory persistence]', error)
    throw new Error('Stock was not changed. The database rejected the inventory operation.')
  }

  const movement = mapMovement(data as Record<string, any>)
  const { data: stockRow, error: stockError } = await db
    .from('branch_inventory')
    .select('*')
    .eq('branch_id', input.branchId)
    .eq('inventory_item_id', input.itemId)
    .single()
  if (stockError || !stockRow) throw new Error('Stock movement was saved, but the authoritative balance could not be refreshed. Reload the page.')
  const stock = mapStock(stockRow as Record<string, any>)
  updateCaches(movement, stock)
  return { movement, stock }
}

export async function stockInPersisted(input: {
  branchId: string
  itemId: string
  quantity: number
  unitCostCents?: number
  reason: string
  reference?: string
  receivedDate?: string
  batchNumber?: string
  expiryDate?: string
  clientRequestId?: string
}) {
  if (!input.branchId.trim()) throw new Error('Branch is required.')
  if (!input.itemId.trim()) throw new Error('Inventory item is required.')
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error('Quantity must be greater than zero.')
  if (!input.reason.trim()) throw new Error('Reason is required.')
  const db = requireDatabase()
  const { data, error } = await db.rpc('post_manual_stock_in_atomic', {
    p_branch_id: input.branchId,
    p_inventory_item_id: input.itemId,
    p_quantity: input.quantity,
    p_unit_cost_cents: input.unitCostCents ?? 0,
    p_reason: input.reason.trim(),
    p_reference: input.reference ?? '',
    p_received_date: input.receivedDate ?? new Date().toISOString().slice(0, 10),
    p_batch_number: input.batchNumber ?? '',
    p_expiry_date: input.expiryDate ?? null,
    p_client_request_id: input.clientRequestId ?? createUuid(),
  })
  if (error || !data) throw new Error(error?.message || 'Stock was not added. The database rejected the inventory operation.')
  const result = data as Record<string, any>
  const movement = mapMovement(result.movement as Record<string, any>)
  const { data: stockRow, error: stockError } = await db.from('branch_inventory').select('*').eq('branch_id', input.branchId).eq('inventory_item_id', input.itemId).single()
  if (stockError || !stockRow) throw new Error('Stock was saved, but the authoritative balance could not be refreshed. Reload the page.')
  const stock = mapStock(stockRow as Record<string, any>)
  updateCaches(movement, stock)
  return { movement, stock, duplicateReused: Boolean(result.duplicate_reused) }
}

export function stockOutPersisted(input: Omit<Parameters<typeof postStockMovementPersisted>[0], 'movementType'>) {
  return postStockMovementPersisted({ ...input, movementType: 'manual_stock_out' })
}

export function adjustStockPersisted(input: {
  branchId: string
  itemId: string
  adjustmentQuantity: number
  reason: string
  clientRequestId?: string
}) {
  if (!Number.isFinite(input.adjustmentQuantity) || input.adjustmentQuantity === 0) throw new Error('Adjustment quantity cannot be zero.')
  return postStockMovementPersisted({
    branchId: input.branchId,
    itemId: input.itemId,
    movementType: input.adjustmentQuantity > 0 ? 'adjustment_increase' : 'adjustment_decrease',
    quantity: Math.abs(input.adjustmentQuantity),
    reason: input.reason,
    clientRequestId: input.clientRequestId,
  })
}

export async function receivePurchaseOrderPersisted(input: {
  poId: string
  receivedDate: string
  items: Array<{ poItemId: string; quantityReceived: number; batchNumber?: string; expiryDate?: string; unitCostCents?: number }>
  notes?: string
  supplierInvoiceNumber?: string
  supplierInvoiceDate?: string
  supplierInvoiceDueDate?: string
  supplierInvoiceAmountCents?: number
  clientRequestId?: string
}) {
  const db = requireDatabase()
  const { data, error } = await db.rpc('receive_purchase_order', {
    p_po_id: input.poId,
    p_received_date: input.receivedDate,
    p_items: input.items,
    p_notes: input.notes ?? '',
    p_supplier_invoice_number: input.supplierInvoiceNumber ?? '',
    p_supplier_invoice_date: input.supplierInvoiceDate ?? null,
    p_supplier_invoice_due_date: input.supplierInvoiceDueDate ?? null,
    p_supplier_invoice_amount_cents: input.supplierInvoiceAmountCents ?? 0,
    p_client_request_id: input.clientRequestId ?? createUuid(),
  })
  if (error || !data) throw new Error(error?.message || 'Purchase receiving failed. No stock was changed.')
  await refreshInventoryOperationalCaches()
  const result = data as Record<string, any>
  return {
    receipt: mapPurchaseReceipt(result.receipt as Record<string, any>),
    order: mapPurchaseOrder(result.order as Record<string, any>),
    duplicateReused: Boolean(result.duplicate_reused),
  }
}

export async function createStockTransferPersisted(input: {
  fromBranchId: string
  toBranchId: string
  items: Array<{ id: string; itemId: string; quantity: number }>
  notes?: string
  clientRequestId?: string
}) {
  const db = requireDatabase()
  const { data, error } = await db.rpc('create_stock_transfer_atomic', {
    p_from_branch_id: input.fromBranchId,
    p_to_branch_id: input.toBranchId,
    p_items: input.items,
    p_notes: input.notes ?? '',
    p_client_request_id: input.clientRequestId ?? createUuid(),
  })
  if (error || !data) throw new Error(error?.message || 'Unable to create stock transfer.')
  await refreshInventoryOperationalCaches()
  return mapTransfer(data as Record<string, any>)
}

export async function completeStockTransferPersisted(input: {
  fromBranchId: string
  toBranchId: string
  items: Array<{ id: string; itemId: string; quantity: number }>
  notes?: string
  clientRequestId?: string
}) {
  const db = requireDatabase()
  const { data, error } = await db.rpc('complete_stock_transfer_atomic', {
    p_from_branch_id: input.fromBranchId,
    p_to_branch_id: input.toBranchId,
    p_items: input.items,
    p_notes: input.notes ?? '',
    p_client_request_id: input.clientRequestId ?? createUuid(),
  })
  if (error || !data) throw new Error(error?.message || 'Quick transfer failed. No partial transfer was committed.')
  await refreshInventoryOperationalCaches()
  return mapTransfer(data as Record<string, any>)
}

export async function dispatchStockTransferPersisted(transferId: string, clientRequestId = createUuid()) {
  const db = requireDatabase()
  const { data, error } = await db.rpc('dispatch_stock_transfer_atomic', {
    p_transfer_id: transferId,
    p_client_request_id: clientRequestId,
  })
  if (error || !data) throw new Error(error?.message || 'Stock transfer was not dispatched.')
  await refreshInventoryOperationalCaches()
  return mapTransfer(data as Record<string, any>)
}

export async function receiveStockTransferPersisted(transferId: string, clientRequestId = createUuid()) {
  const db = requireDatabase()
  const { data, error } = await db.rpc('receive_stock_transfer_atomic', {
    p_transfer_id: transferId,
    p_client_request_id: clientRequestId,
  })
  if (error || !data) throw new Error(error?.message || 'Stock transfer was not received.')
  await refreshInventoryOperationalCaches()
  return mapTransfer(data as Record<string, any>)
}

export async function postStockCountPersisted(countId: string, clientRequestId = createUuid()) {
  const db = requireDatabase()
  const { data, error } = await db.rpc('post_stock_count_atomic', {
    p_count_id: countId,
    p_client_request_id: clientRequestId,
  })
  if (error || !data) throw new Error(error?.message || 'Stock count was not posted.')
  await refreshInventoryOperationalCaches()
  return mapStockCount(data as Record<string, any>)
}
