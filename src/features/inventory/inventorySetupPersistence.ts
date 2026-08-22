import { supabase } from '../../lib/supabase'
import { refreshInventoryOperationalCaches } from './inventoryPersistence'
import { getSuppliers, type PurchaseOrderItem, type StockCount, type Supplier } from './inventoryStore'

const SUPPLIER_KEY = 'plamenco.inventory.suppliers'
const STOCK_COUNT_KEY = 'plamenco.inventory.stockCounts'

function requireDatabase() {
  if (!supabase) throw new Error('Clinic database is not configured. Inventory setup cannot be saved safely.')
  return supabase
}

function mapSupplier(row: Record<string, any>): Supplier {
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

function mapStockCount(row: Record<string, any>): StockCount {
  return {
    id: String(row.id),
    countNumber: String(row.count_number ?? ''),
    branchId: String(row.branch_id ?? ''),
    status: row.status,
    countedBy: String(row.counted_by ?? ''),
    reviewedBy: row.reviewed_by || undefined,
    countDate: String(row.count_date ?? ''),
    items: Array.isArray(row.items) ? row.items : [],
    notes: String(row.notes ?? ''),
    createdAt: row.created_at ?? new Date().toISOString(),
    postedAt: row.posted_at ?? undefined,
  }
}

function cacheStockCount(count: StockCount) {
  if (typeof window === 'undefined') return
  let existing: StockCount[] = []
  try { existing = JSON.parse(window.localStorage.getItem(STOCK_COUNT_KEY) ?? '[]') as StockCount[] } catch { existing = [] }
  window.localStorage.setItem(STOCK_COUNT_KEY, JSON.stringify([count, ...existing.filter((row) => row.id !== count.id)]))
}

export async function createInventorySupplierPersisted(input: {
  name: string
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
}): Promise<Supplier> {
  const db = requireDatabase()
  const { data, error } = await db.rpc('create_inventory_supplier', {
    p_name: input.name,
    p_contact_person: input.contactPerson ?? '',
    p_phone: input.phone ?? '',
    p_email: input.email ?? '',
    p_address: input.address ?? '',
    p_notes: input.notes ?? '',
  })
  if (error || !data) throw new Error(error?.message || 'Supplier could not be saved.')
  const supplier = mapSupplier(data as Record<string, any>)
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SUPPLIER_KEY, JSON.stringify([supplier, ...getSuppliers().filter((row) => row.id !== supplier.id)]))
  }
  return supplier
}

export async function createPurchaseOrderPersisted(input: {
  supplierId: string
  branchId: string
  orderDate: string
  expectedDeliveryDate?: string
  items: PurchaseOrderItem[]
  notes?: string
}) {
  const db = requireDatabase()
  const { data, error } = await db.rpc('create_purchase_order_record', {
    p_supplier_id: input.supplierId,
    p_branch_id: input.branchId,
    p_order_date: input.orderDate,
    p_expected_delivery_date: input.expectedDeliveryDate ?? null,
    p_items: input.items,
    p_notes: input.notes ?? '',
  })
  if (error || !data) throw new Error(error?.message || 'Purchase order could not be saved.')
  await refreshInventoryOperationalCaches()
  return data
}

export async function createStockCountPersisted(input: { branchId: string; countDate: string; notes?: string }): Promise<StockCount> {
  const db = requireDatabase()
  const { data, error } = await db.rpc('create_stock_count_record', {
    p_branch_id: input.branchId,
    p_count_date: input.countDate,
    p_notes: input.notes ?? '',
  })
  if (error || !data) throw new Error(error?.message || 'Stock count could not be created.')
  const count = mapStockCount(data as Record<string, any>)
  cacheStockCount(count)
  return count
}

export async function updateStockCountItemPersisted(input: {
  countId: string
  itemId: string
  physicalQuantity: number
  reason?: string
}): Promise<StockCount> {
  const db = requireDatabase()
  const { data, error } = await db.rpc('set_stock_count_physical_quantity', {
    p_count_id: input.countId,
    p_item_id: input.itemId,
    p_physical_quantity: input.physicalQuantity,
    p_reason: input.reason ?? '',
  })
  if (error || !data) throw new Error(error?.message || 'Physical stock count could not be saved.')
  const count = mapStockCount(data as Record<string, any>)
  cacheStockCount(count)
  return count
}

export async function reviewStockCountPersisted(countId: string): Promise<StockCount> {
  const db = requireDatabase()
  const { data, error } = await db.rpc('review_stock_count_record', { p_count_id: countId })
  if (error || !data) throw new Error(error?.message || 'Stock count could not be reviewed.')
  const count = mapStockCount(data as Record<string, any>)
  cacheStockCount(count)
  return count
}
