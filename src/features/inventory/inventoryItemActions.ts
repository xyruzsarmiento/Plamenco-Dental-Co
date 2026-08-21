import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import {
  BATCH_KEY,
  BRANCH_STOCK_KEY,
  ITEM_KEY,
  MOVEMENT_KEY,
  PO_KEY,
  STOCK_COUNT_KEY,
  TRANSFER_KEY,
  type InventoryItem,
} from './inventoryStore'

function readList<T>(key: string): T[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readItems(): InventoryItem[] {
  return readList<InventoryItem>(ITEM_KEY)
}

function writeItems(items: InventoryItem[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ITEM_KEY, JSON.stringify(items))
}

function mapItem(item: InventoryItem) {
  return {
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

export async function updateInventoryItemRecord(itemId: string, patch: Partial<Omit<InventoryItem, 'id' | 'createdAt'>>) {
  const items = readItems()
  const current = items.find((item) => item.id === itemId)
  if (!current) throw new Error('Inventory item not found.')

  const updated: InventoryItem = {
    ...current,
    ...patch,
    name: (patch.name ?? current.name).trim(),
    sku: (patch.sku ?? current.sku).trim(),
    itemCode: (patch.itemCode ?? current.itemCode).trim(),
    description: (patch.description ?? current.description).trim(),
    brand: (patch.brand ?? current.brand).trim(),
    updatedAt: new Date().toISOString(),
  }

  if (!updated.name) throw new Error('Item name is required.')
  if (!updated.itemCode) throw new Error('Item code is required.')
  if (!updated.unitId) throw new Error('Unit is required.')
  if (!updated.categoryId) throw new Error('Category is required.')
  if (!Number.isFinite(updated.defaultReorderLevel) || updated.defaultReorderLevel < 0) throw new Error('Reorder level must be zero or greater.')
  if (updated.trackExpiry && (!Number.isInteger(updated.expiryWarningDays) || updated.expiryWarningDays <= 0)) throw new Error('Expiry warning days must be a positive whole number.')

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('inventory_items').update(mapItem(updated)).eq('id', itemId).select('id').maybeSingle()
    if (error) throw new Error(`Database update failed: ${error.message}`)
    if (!data) throw new Error('Database update could not be confirmed for this inventory item.')
  }

  writeItems(items.map((item) => item.id === itemId ? updated : item))
  return updated
}

export async function removeInventoryItemRecord(itemId: string) {
  const items = readItems()
  const current = items.find((item) => item.id === itemId)
  if (!current) throw new Error('Inventory item not found.')

  const hasBranchStock = readList<{ itemId: string }>(BRANCH_STOCK_KEY).some((row) => row.itemId === itemId)
  const hasMovements = readList<{ itemId: string }>(MOVEMENT_KEY).some((row) => row.itemId === itemId)
  const hasBatches = readList<{ itemId: string }>(BATCH_KEY).some((row) => row.itemId === itemId)
  const hasPurchaseOrderHistory = readList<{ items?: Array<{ itemId: string }> }>(PO_KEY).some((row) => row.items?.some((item) => item.itemId === itemId))
  const hasStockCountHistory = readList<{ items?: Array<{ itemId: string }> }>(STOCK_COUNT_KEY).some((row) => row.items?.some((item) => item.itemId === itemId))
  const hasTransferHistory = readList<{ items?: Array<{ itemId: string }> }>(TRANSFER_KEY).some((row) => row.items?.some((item) => item.itemId === itemId))

  if (hasBranchStock || hasMovements || hasBatches || hasPurchaseOrderHistory || hasStockCountHistory || hasTransferHistory) {
    throw new Error('This item already has inventory history and cannot be permanently removed. Edit the item instead so historical records remain valid.')
  }

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('inventory_items').delete().eq('id', itemId)
    if (error) throw new Error(`Database removal failed: ${error.message}`)
  }

  writeItems(items.filter((item) => item.id !== itemId))
  return current
}

// Compatibility name used by the current modal. This performs a guarded permanent removal only
// when the item has no stock/history references; otherwise it throws and preserves the record.
export const archiveInventoryItemRecord = removeInventoryItemRecord
