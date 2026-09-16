import { supabase } from '../../lib/supabase'
import { createUuid } from '../../lib/id'
import { refreshInventoryOperationalCaches } from './inventoryPersistence'

function requireDatabase() {
  if (!supabase) throw new Error('Clinic database is not configured. Batch inventory cannot be changed safely.')
  return supabase
}

export async function disposeExpiredBatchPersisted(input: {
  batchId: string
  quantity: number
  reason?: string
  clientRequestId?: string
}) {
  if (!input.batchId.trim()) throw new Error('Inventory batch is required.')
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error('Quantity must be greater than zero.')

  const db = requireDatabase()
  const { data, error } = await db.rpc('dispose_expired_inventory_batch', {
    p_batch_id: input.batchId,
    p_quantity: input.quantity,
    p_reason: input.reason ?? '',
    p_client_request_id: input.clientRequestId ?? createUuid(),
  })

  if (error || !data) throw new Error(error?.message || 'Expired stock could not be removed.')
  await refreshInventoryOperationalCaches()
  return data as Record<string, unknown>
}
