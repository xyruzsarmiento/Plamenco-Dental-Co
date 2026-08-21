import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { ITEM_KEY, type InventoryItem } from './inventoryStore'

function readItems(): InventoryItem[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ITEM_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
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

export async function archiveInventoryItemRecord(itemId: string) {
  return updateInventoryItemRecord(itemId, { status: 'archived' })
}
