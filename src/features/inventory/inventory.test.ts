import test from 'node:test'
import assert from 'node:assert/strict'

import {
  adjustStock,
  createInventoryItem,
  createPurchaseOrder,
  createSupplier,
  createStockCount,
  createStockTransfer,
  dispatchStockTransfer,
  getBranchStock,
  getExpiryStatus,
  getInventoryBatches,
  getInventoryItems,
  getInventoryValuation,
  getPurchaseOrders,
  getStockCounts,
  getStockMovements,
  getStockStatus,
  getSuppliers,
  getUsableBranchQuantity,
  postStockCountReconciliation,
  receivePurchaseOrder,
  receiveStockTransfer,
  reviewStockCount,
  resetInventoryState,
  stockIn,
  stockOut,
  transferStock,
  updateStockCountItem,
} from './inventoryStore.ts'

const pulilan = 'branch-pulilan'
const plaridel = 'branch-plaridel'

function createItem(overrides = {}) {
  return createInventoryItem({
    sku: 'GLV-NITRILE',
    name: 'Nitrile Gloves',
    description: '',
    categoryId: 'ppe',
    unitId: 'box',
    brand: '',
    defaultReorderLevel: 5,
    trackBatches: false,
    trackExpiry: false,
    expiryWarningDays: 60,
    status: 'active',
    ...overrides,
  })
}

test.beforeEach(() => {
  resetInventoryState()
})

test('inventory item can be created without fake stock', () => {
  const item = createItem()
  assert.equal(getInventoryItems().length, 1)
  assert.equal(item.itemCode, 'INV-000001')
  assert.equal(getBranchStock(pulilan, item.id), undefined)
})

test('branch stock remains separate per branch with independent reorder levels', () => {
  const item = createItem()
  stockIn({ branchId: pulilan, itemId: item.id, quantity: 8, reason: 'Opening balance', receivedDate: '2026-08-18', performedBy: 'Admin' })
  stockIn({ branchId: plaridel, itemId: item.id, quantity: 3, reason: 'Opening balance', receivedDate: '2026-08-18', performedBy: 'Admin' })

  assert.equal(getBranchStock(pulilan, item.id)?.quantityOnHand, 8)
  assert.equal(getBranchStock(plaridel, item.id)?.quantityOnHand, 3)
  assert.equal(getStockStatus(getBranchStock(pulilan, item.id)), 'in_stock')
  assert.equal(getStockStatus(getBranchStock(plaridel, item.id)), 'low_stock')
})

test('stock in and stock out create movement history and prevent negative stock', () => {
  const item = createItem()
  stockIn({ branchId: pulilan, itemId: item.id, quantity: 4, unitCostCents: 10000, reason: 'Manual stock in', receivedDate: '2026-08-18', performedBy: 'Maria' })
  stockOut({ branchId: pulilan, itemId: item.id, quantity: 2, reason: 'Clinic consumption', performedBy: 'Maria' })

  assert.equal(getBranchStock(pulilan, item.id)?.quantityOnHand, 2)
  assert.equal(getStockMovements().length, 2)
  assert.throws(() => stockOut({ branchId: pulilan, itemId: item.id, quantity: 3, reason: 'Too much', performedBy: 'Maria' }))
})

test('adjustment records reason and actor', () => {
  const item = createItem()
  stockIn({ branchId: pulilan, itemId: item.id, quantity: 5, reason: 'Opening balance', receivedDate: '2026-08-18', performedBy: 'Admin' })
  const movement = adjustStock({ branchId: pulilan, itemId: item.id, adjustmentQuantity: -1, reason: 'Damaged item', performedBy: 'Admin' })

  assert.equal(movement.movementType, 'adjustment_decrease')
  assert.equal(movement.reason, 'Damaged item')
  assert.equal(movement.performedBy, 'Admin')
})

test('batch and expiry tracking preserve expiry and exclude expired usable quantity', () => {
  const item = createItem({ trackBatches: true, trackExpiry: true, expiryWarningDays: 90 })
  stockIn({
    branchId: pulilan,
    itemId: item.id,
    quantity: 6,
    reason: 'Received medication',
    receivedDate: '2026-08-18',
    batchNumber: 'LOT-1',
    expiryDate: '2026-08-01',
    performedBy: 'Admin',
  })

  const batch = getInventoryBatches()[0]
  assert.equal(batch.batchNumber, 'LOT-1')
  assert.equal(getExpiryStatus(batch, item), 'expired')
  assert.equal(getUsableBranchQuantity(pulilan, item.id), 0)
})

test('supplier and purchase order flow supports partial receiving without increasing stock on order creation', () => {
  const item = createItem()
  const supplier = createSupplier({ name: 'Dental Supplier Co.', contactPerson: 'Ana', phone: '', email: '', address: '', notes: '', status: 'active' })
  const order = createPurchaseOrder({
    supplierId: supplier.id,
    branchId: pulilan,
    orderDate: '2026-08-18',
    items: [{ id: 'po-item-1', itemId: item.id, quantityOrdered: 10, quantityReceived: 0, unitCostCents: 12000 }],
    notes: '',
    createdBy: 'Admin',
  })

  assert.equal(getSuppliers().length, 1)
  assert.equal(getBranchStock(pulilan, item.id), undefined)

  const partial = receivePurchaseOrder({
    poId: order.id,
    receivedBy: 'Maria',
    receivedDate: '2026-08-19',
    items: [{ poItemId: 'po-item-1', quantityReceived: 6 }],
  })

  assert.equal(partial.order.status, 'partially_received')
  assert.equal(getBranchStock(pulilan, item.id)?.quantityOnHand, 6)

  const complete = receivePurchaseOrder({
    poId: order.id,
    receivedBy: 'Maria',
    receivedDate: '2026-08-20',
    items: [{ poItemId: 'po-item-1', quantityReceived: 4 }],
  })

  assert.equal(complete.order.status, 'received')
  assert.equal(getPurchaseOrders()[0].items[0].quantityReceived, 10)
})

test('branch transfer creates transfer out and transfer in movements', () => {
  const item = createItem()
  stockIn({ branchId: pulilan, itemId: item.id, quantity: 10, reason: 'Opening balance', receivedDate: '2026-08-18', performedBy: 'Admin' })
  transferStock({ fromBranchId: pulilan, toBranchId: plaridel, items: [{ id: 'transfer-item-1', itemId: item.id, quantity: 4 }], requestedBy: 'Admin', receivedBy: 'Staff' })

  assert.equal(getBranchStock(pulilan, item.id)?.quantityOnHand, 6)
  assert.equal(getBranchStock(plaridel, item.id)?.quantityOnHand, 4)
  assert.equal(getStockMovements().filter((movement) => movement.movementType === 'transfer_out').length, 1)
  assert.equal(getStockMovements().filter((movement) => movement.movementType === 'transfer_in').length, 1)
  assert.throws(() => transferStock({ fromBranchId: pulilan, toBranchId: plaridel, items: [{ id: 'transfer-item-2', itemId: item.id, quantity: 100 }], requestedBy: 'Admin', receivedBy: 'Staff' }))
})

test('transfer lifecycle keeps destination unchanged until receipt', () => {
  const item = createItem()
  stockIn({ branchId: pulilan, itemId: item.id, quantity: 10, reason: 'Opening balance', receivedDate: '2026-08-18', performedBy: 'Admin' })
  const transfer = createStockTransfer({ fromBranchId: pulilan, toBranchId: plaridel, items: [{ id: 'transfer-item-1', itemId: item.id, quantity: 3 }], requestedBy: 'Admin' })

  assert.equal(getBranchStock(pulilan, item.id)?.quantityOnHand, 10)
  assert.equal(getBranchStock(plaridel, item.id), undefined)

  const dispatched = dispatchStockTransfer(transfer.id, 'Admin')
  assert.equal(dispatched.status, 'in_transit')
  assert.equal(getBranchStock(pulilan, item.id)?.quantityOnHand, 7)
  assert.equal(getBranchStock(plaridel, item.id), undefined)

  const received = receiveStockTransfer(transfer.id, 'Plaridel Staff')
  assert.equal(received.status, 'received')
  assert.equal(getBranchStock(plaridel, item.id)?.quantityOnHand, 3)
  assert.throws(() => receiveStockTransfer(transfer.id, 'Plaridel Staff'))
})

test('stock count reconciliation posts adjustment movements after review', () => {
  const item = createItem()
  stockIn({ branchId: pulilan, itemId: item.id, quantity: 5, reason: 'Opening balance', receivedDate: '2026-08-18', performedBy: 'Admin' })
  const count = createStockCount({ branchId: pulilan, countedBy: 'Maria', countDate: '2026-08-20', itemIds: [item.id] })

  assert.equal(getStockCounts()[0].status, 'draft')
  updateStockCountItem(count.id, item.id, 4, 'Shelf count lower')
  assert.equal(getBranchStock(pulilan, item.id)?.quantityOnHand, 5)

  reviewStockCount(count.id, 'Supervisor')
  const posted = postStockCountReconciliation(count.id, 'Supervisor')
  assert.equal(posted.status, 'posted')
  assert.equal(getBranchStock(pulilan, item.id)?.quantityOnHand, 4)
  assert.equal(getStockMovements().some((movement) => movement.movementType === 'adjustment_decrease' && movement.referenceType === 'stock_count'), true)
})

test('inventory valuation uses branch stock quantity and weighted average cost', () => {
  const item = createItem()
  stockIn({ branchId: pulilan, itemId: item.id, quantity: 5, unitCostCents: 10000, reason: 'First receipt', receivedDate: '2026-08-18', performedBy: 'Admin' })
  stockIn({ branchId: pulilan, itemId: item.id, quantity: 5, unitCostCents: 20000, reason: 'Second receipt', receivedDate: '2026-08-19', performedBy: 'Admin' })

  assert.equal(getInventoryValuation(pulilan), 150000)
})
