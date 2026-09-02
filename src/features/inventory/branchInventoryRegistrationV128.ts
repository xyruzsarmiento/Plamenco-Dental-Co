import { supabase } from '../../lib/supabase'
import { getBranchInventory, type BranchInventory, type InventoryItem } from './inventoryStore'

const BRANCH_STOCK_KEY = 'plamenco.inventory.branchStock'

function saveLocalBranchPosition(row: BranchInventory) {
  if (typeof window === 'undefined') return
  const current = getBranchInventory()
  if (current.some((entry) => entry.branchId === row.branchId && entry.itemId === row.itemId)) return
  window.localStorage.setItem(BRANCH_STOCK_KEY, JSON.stringify([row, ...current]))
}

export async function ensureItemRegisteredToBranchV128(branchId: string, item: InventoryItem) {
  if (!branchId || !item.id) return
  if (!supabase && getBranchInventory().some((entry) => entry.branchId === branchId && entry.itemId === item.id)) return

  const localRow: BranchInventory = {
    id: `branch-stock-${crypto.randomUUID()}`,
    branchId,
    itemId: item.id,
    quantityOnHand: 0,
    reorderLevel: item.defaultReorderLevel,
    location: '',
    averageUnitCostCents: 0,
    updatedAt: new Date().toISOString(),
  }

  if (supabase) {
    const { data: remoteItem, error: itemError } = await supabase
      .from('inventory_items')
      .select('id')
      .eq('item_code', item.itemCode)
      .maybeSingle()
    if (itemError) throw new Error(`Unable to resolve the new inventory item: ${itemError.message}`)
    if (!remoteItem?.id) throw new Error('The new inventory item was not found in the clinic database.')

    const { data: existing, error: existingError } = await supabase
      .from('branch_inventory')
      .select('id')
      .eq('branch_id', branchId)
      .eq('inventory_item_id', remoteItem.id)
      .maybeSingle()
    if (existingError) throw new Error(`Unable to check branch inventory registration: ${existingError.message}`)

    if (!existing?.id) {
      const { error: insertError } = await supabase.from('branch_inventory').insert({
        id: localRow.id,
        branch_id: branchId,
        inventory_item_id: remoteItem.id,
        quantity_on_hand: 0,
        reorder_level: item.defaultReorderLevel,
        location: '',
        average_unit_cost_cents: 0,
        updated_at: localRow.updatedAt,
      })
      if (insertError) throw new Error(`Unable to register the item to this branch: ${insertError.message}`)
    }
  }

  saveLocalBranchPosition(localRow)
}
