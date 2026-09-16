import { supabase } from '../../lib/supabase'

export type InventoryValuationSnapshot = {
  id: string
  branchId: string
  periodMonth: string
  periodEnd: string
  closingQuantity: number
  closingValueCents: number
  purchasesCents: number
  consumptionCents: number
  transferInCents: number
  transferOutCents: number
  adjustmentsCents: number
  expiryDamageCents: number
  activePositions: number
  lowStockPositions: number
  outOfStockPositions: number
  movementCount: number
  directlyCostedMovements: number
  costCoveragePercent: number
  positions: Array<Record<string, unknown>>
  snapshotSource: string
  calculationVersion: number
  createdBy?: string
  createdAt: string
}

function requireDatabase() {
  if (!supabase) throw new Error('Clinic database is not configured.')
  return supabase
}

function mapSnapshot(row: Record<string, any>): InventoryValuationSnapshot {
  return {
    id: String(row.id),
    branchId: String(row.branch_id),
    periodMonth: String(row.period_month ?? ''),
    periodEnd: String(row.period_end ?? ''),
    closingQuantity: Number(row.closing_quantity ?? 0),
    closingValueCents: Number(row.closing_value_cents ?? 0),
    purchasesCents: Number(row.purchases_cents ?? 0),
    consumptionCents: Number(row.consumption_cents ?? 0),
    transferInCents: Number(row.transfer_in_cents ?? 0),
    transferOutCents: Number(row.transfer_out_cents ?? 0),
    adjustmentsCents: Number(row.adjustments_cents ?? 0),
    expiryDamageCents: Number(row.expiry_damage_cents ?? 0),
    activePositions: Number(row.active_positions ?? 0),
    lowStockPositions: Number(row.low_stock_positions ?? 0),
    outOfStockPositions: Number(row.out_of_stock_positions ?? 0),
    movementCount: Number(row.movement_count ?? 0),
    directlyCostedMovements: Number(row.directly_costed_movements ?? 0),
    costCoveragePercent: Number(row.cost_coverage_percent ?? 100),
    positions: Array.isArray(row.positions) ? row.positions : [],
    snapshotSource: String(row.snapshot_source ?? 'ledger_reconstruction_v1'),
    calculationVersion: Number(row.calculation_version ?? 1),
    createdBy: row.created_by ? String(row.created_by) : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  }
}

export async function fetchInventoryValuationSnapshots(branchIds?: string[]) {
  const db = requireDatabase()
  let query = db.from('inventory_valuation_snapshots').select('*').order('period_month', { ascending: false })
  if (branchIds?.length) query = query.in('branch_id', branchIds)
  const { data, error } = await query
  if (error) {
    if (/relation .*inventory_valuation_snapshots.* does not exist/i.test(error.message)) {
      throw new Error('Monthly inventory snapshots are not installed in Supabase yet. Run the valuation snapshot migration first.')
    }
    throw new Error(error.message || 'Unable to load inventory valuation snapshots.')
  }
  return (data ?? []).map((row) => mapSnapshot(row as Record<string, any>))
}

export async function captureInventoryValuationSnapshot(branchId: string, periodMonth: string) {
  if (!branchId.trim()) throw new Error('Branch is required.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodMonth)) throw new Error('A valid snapshot month is required.')
  const db = requireDatabase()
  const { data, error } = await db.rpc('capture_inventory_valuation_snapshot', {
    p_branch_id: branchId,
    p_period_month: periodMonth,
  })
  if (error || !data) {
    if (/capture_inventory_valuation_snapshot/i.test(error?.message ?? '') && /does not exist|schema cache/i.test(error?.message ?? '')) {
      throw new Error('Monthly inventory snapshots are not installed in Supabase yet. Run the valuation snapshot migration first.')
    }
    throw new Error(error?.message || 'Inventory valuation snapshot could not be created.')
  }
  return mapSnapshot(data as Record<string, any>)
}
