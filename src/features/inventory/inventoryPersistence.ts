import { supabase } from '../../lib/supabase'
import { createUuid } from '../../lib/id'
import {
  getBranchInventory,
  getStockMovements,
  type BranchInventory,
  type StockMovement,
  type StockMovementType,
} from './inventoryStore'

const BRANCH_STOCK_KEY = 'plamenco.inventory.branchStock'
const MOVEMENT_KEY = 'plamenco.inventory.movements'

function requireDatabase() {
  if (!supabase) throw new Error('Clinic database is not configured. Stock cannot be changed safely.')
  return supabase
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

function updateCaches(movement: StockMovement, stock: BranchInventory) {
  if (typeof window === 'undefined') return
  const movements = [movement, ...getStockMovements().filter((entry) => entry.id !== movement.id)]
  const stocks = [stock, ...getBranchInventory().filter((entry) => entry.id !== stock.id && !(entry.branchId === stock.branchId && entry.itemId === stock.itemId))]
  window.localStorage.setItem(MOVEMENT_KEY, JSON.stringify(movements))
  window.localStorage.setItem(BRANCH_STOCK_KEY, JSON.stringify(stocks))
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

export function stockInPersisted(input: Omit<Parameters<typeof postStockMovementPersisted>[0], 'movementType'>) {
  return postStockMovementPersisted({ ...input, movementType: 'manual_stock_in' })
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
