import test from 'node:test'
import assert from 'node:assert/strict'

import { createInventoryItem, createPurchaseOrder, createSupplier, receivePurchaseOrder, resetInventoryState } from '../inventory/inventoryStore.ts'
import {
  addExpenseAttachment,
  approveExpense,
  closeCashierSession,
  createExpense,
  createExpenseFromPurchaseReceipt,
  createExpenseFromRecurringTemplate,
  createRecurringExpenseTemplate,
  getCashFlowSummary,
  getDailyCashReconciliation,
  getExpenseDueStatus,
  getExpenseOverview,
  getExpenses,
  openCashierSession,
  recordCashMovement,
  recordExpensePayment,
  recordPettyCashDisbursement,
  resetExpenseState,
  voidExpense,
} from './expenseStore.ts'

test.beforeEach(() => {
  resetExpenseState()
  resetInventoryState()
})

test('expense records branch, category, utility billing period and unpaid status', () => {
  const expense = createExpense({
    scope: 'branch',
    branchId: 'branch-pulilan',
    categoryId: 'electricity',
    payeeName: 'Meralco',
    description: 'August 2026 electricity',
    expenseDate: '2026-08-18',
    dueDate: '2026-08-25',
    billingPeriodStart: '2026-08-01',
    billingPeriodEnd: '2026-08-31',
    subtotalCents: 1250000,
    taxCents: 0,
    sourceType: 'manual',
    notes: '',
    createdBy: 'Admin',
  })

  assert.equal(expense.expenseNumber, 'EXP-000001')
  assert.equal(expense.branchId, 'branch-pulilan')
  assert.equal(expense.status, 'unpaid')
  assert.equal(expense.balanceCents, 1250000)
})

test('clinic-wide expense is represented without false branch assignment', () => {
  const expense = createExpense({
    scope: 'clinic_wide',
    categoryId: 'software_subscriptions',
    payeeName: 'Software Provider',
    description: 'Clinic-wide subscription',
    expenseDate: '2026-08-18',
    subtotalCents: 300000,
    taxCents: 0,
    sourceType: 'manual',
    notes: '',
    createdBy: 'Admin',
  })

  assert.equal(expense.scope, 'clinic_wide')
  assert.equal(expense.branchId, undefined)
  assert.equal(getExpenseOverview().clinicWideCents, 300000)
})

test('partial and full expense payments derive balance and preserve method and actor', () => {
  const expense = createExpense({
    scope: 'branch',
    branchId: 'branch-plaridel',
    categoryId: 'rent_lease',
    payeeName: 'Landlord',
    description: 'Branch rent',
    expenseDate: '2026-08-18',
    subtotalCents: 2000000,
    taxCents: 0,
    sourceType: 'manual',
    notes: '',
    createdBy: 'Admin',
  })

  const first = recordExpensePayment({ expenseId: expense.id, amountCents: 1000000, paymentDate: '2026-08-20', paymentMethod: 'bank_transfer', referenceNumber: 'BT-1', paidBy: 'Admin', notes: '' })
  assert.equal(first.paymentMethod, 'bank_transfer')
  assert.equal(getExpenses()[0].status, 'partially_paid')
  assert.equal(getExpenses()[0].balanceCents, 1000000)

  recordExpensePayment({ expenseId: expense.id, amountCents: 1000000, paymentDate: '2026-08-21', paymentMethod: 'cash', paidBy: 'Admin', notes: '' })
  assert.equal(getExpenses()[0].status, 'paid')
  assert.equal(getExpenses()[0].balanceCents, 0)
})

test('due soon and overdue derive from due date but paid expenses are not overdue', () => {
  const dueSoon = createExpense({
    scope: 'branch',
    branchId: 'branch-pulilan',
    categoryId: 'water',
    payeeName: 'Water Utility',
    description: 'Water bill',
    expenseDate: '2026-08-18',
    dueDate: '2026-08-23',
    subtotalCents: 100000,
    taxCents: 0,
    sourceType: 'manual',
    notes: '',
    createdBy: 'Admin',
  })
  assert.equal(getExpenseDueStatus(dueSoon, new Date('2026-08-18')), 'due_soon')

  recordExpensePayment({ expenseId: dueSoon.id, amountCents: 100000, paymentDate: '2026-08-19', paymentMethod: 'cash', paidBy: 'Admin', notes: '' })
  assert.equal(getExpenseDueStatus(getExpenses()[0], new Date('2026-09-01')), 'paid')
})

test('attachments store secure metadata without file blobs', () => {
  const expense = createExpense({
    scope: 'branch',
    branchId: 'branch-pulilan',
    categoryId: 'repairs_maintenance',
    payeeName: 'Maintenance Contractor',
    description: 'Chair repair',
    expenseDate: '2026-08-18',
    subtotalCents: 500000,
    taxCents: 0,
    sourceType: 'manual',
    notes: '',
    createdBy: 'Admin',
  })

  const attachment = addExpenseAttachment({ expenseId: expense.id, fileName: 'receipt.pdf', documentType: 'receipt', storagePath: 'private/expenses/receipt.pdf', uploadedBy: 'Admin', description: 'Repair receipt' })
  assert.equal(attachment.storagePath.startsWith('private/'), true)
})

test('recurring variable utility template can create unpriced expense requiring confirmation', () => {
  const template = createRecurringExpenseTemplate({
    name: 'Monthly electricity',
    scope: 'branch',
    branchId: 'branch-pulilan',
    categoryId: 'electricity',
    payeeName: 'Meralco',
    frequency: 'monthly',
    nextDueDate: '2026-09-25',
    autoCreate: false,
    status: 'active',
    createdBy: 'Admin',
  })
  const expense = createExpenseFromRecurringTemplate(template.id)
  assert.equal(expense.totalCents, 0)
  assert.equal(expense.notes.includes('Amount requires confirmation'), true)
})

test('purchase receipt creates one linked expense and does not duplicate', () => {
  const item = createInventoryItem({ sku: 'MASK', name: 'Masks', description: '', categoryId: 'ppe', unitId: 'box', brand: '', defaultReorderLevel: 0, trackBatches: false, trackExpiry: false, expiryWarningDays: 60, status: 'active' })
  const supplier = createSupplier({ name: 'Dental Supplier', contactPerson: '', phone: '', email: '', address: '', notes: '', status: 'active' })
  const po = createPurchaseOrder({ supplierId: supplier.id, branchId: 'branch-plaridel', orderDate: '2026-08-18', items: [{ id: 'po-line', itemId: item.id, quantityOrdered: 2, quantityReceived: 0, unitCostCents: 100000 }], notes: '', createdBy: 'Admin' })
  const { receipt } = receivePurchaseOrder({ poId: po.id, receivedBy: 'Admin', receivedDate: '2026-08-19', items: [{ poItemId: 'po-line', quantityReceived: 2 }] })

  const expense = createExpenseFromPurchaseReceipt(receipt.id)
  const duplicate = createExpenseFromPurchaseReceipt(receipt.id)

  assert.equal(expense.id, duplicate.id)
  assert.equal(getExpenses().length, 1)
  assert.equal(expense.sourceType, 'purchase_receipt')
  assert.equal(expense.totalCents, 200000)
})

test('approval and void preserve record state', () => {
  const expense = createExpense({
    scope: 'branch',
    branchId: 'branch-pulilan',
    categoryId: 'miscellaneous',
    payeeName: 'Payee',
    description: 'Correction candidate',
    expenseDate: '2026-08-18',
    subtotalCents: 100000,
    taxCents: 0,
    sourceType: 'manual',
    notes: '',
    createdBy: 'Staff',
  })

  approveExpense(expense.id, 'Admin')
  const voided = voidExpense(expense.id, 'Duplicate entry', 'Admin')
  assert.equal(voided.status, 'void')
  assert.equal(getExpenses().length, 1)
})

test('petty cash is a cash-paid branch expense and appears in cash flow', () => {
  const petty = recordPettyCashDisbursement({
    branchId: 'branch-pulilan',
    amountCents: 75000,
    paymentDate: '2026-08-18',
    payeeName: 'Front desk',
    description: 'Emergency cleaning supplies',
    recordedBy: 'Admin',
    notes: 'Receipt required',
  })

  const summary = getCashFlowSummary({ branchId: 'branch-pulilan', startDate: '2026-08-18', endDate: '2026-08-18' })
  assert.equal(petty.categoryId, 'petty_cash')
  assert.equal(petty.status, 'paid')
  assert.equal(summary.expenseOutflowCents, 75000)
  assert.equal(summary.pettyCashUsedCents, 75000)
})

test('cashier session closes with expected versus actual cash variance', () => {
  const session = openCashierSession({
    branchId: 'branch-plaridel',
    businessDate: '2026-08-18',
    openingCashCents: 100000,
    openedBy: 'Admin',
  })
  recordCashMovement({
    branchId: 'branch-plaridel',
    businessDate: '2026-08-18',
    movementType: 'cash_in',
    direction: 'in',
    amountCents: 25000,
    reason: 'Owner cash top-up',
    referenceType: 'other',
    recordedBy: 'Admin',
  })

  const reconciliation = getDailyCashReconciliation('branch-plaridel', '2026-08-18')
  assert.equal(reconciliation.expectedCashCents, 125000)

  const closed = closeCashierSession(session.id, { actualCashCents: 124000, varianceReason: 'Cash count short by PHP 10', closedBy: 'Admin' })
  assert.equal(closed.status, 'closed')
  assert.equal(closed.varianceCents, -1000)
})
