import { getPaymentMethodLabel, getStoredInvoices, getStoredPayments, getStoredRefunds, type PaymentMethod } from '../billing/billingStore'
import { getPurchaseOrders, getPurchaseReceipts, getSuppliers } from '../inventory/inventoryStore'
import { recordAuditEntry } from '../security/auditLogStore'
import { getCurrentSessionUserName } from '../security/security'
import { insertRemoteTableRow, updateRemoteTableRow } from '../../lib/supabaseSync'

export type ExpenseScope = 'branch' | 'clinic_wide'
export type ExpenseStatus = 'draft' | 'unpaid' | 'partially_paid' | 'paid' | 'void' | 'cancelled'
export type ExpenseSourceType = 'manual' | 'purchase_order' | 'purchase_receipt' | 'recurring' | 'other'
export type RecurringFrequency = 'monthly' | 'quarterly' | 'yearly' | 'custom'
export type DueStatus = 'paid' | 'not_due' | 'due_soon' | 'overdue' | 'void'
export type CashMovementType = 'cash_in' | 'cash_out' | 'opening_float' | 'closing_adjustment'
export type CashierSessionStatus = 'open' | 'closed' | 'void'

export type CashierSession = {
  id: string
  sessionNumber: string
  branchId: string
  businessDate: string
  openedBy: string
  openedAt: string
  openingCashCents: number
  expectedCashCents: number
  actualCashCents?: number
  varianceCents?: number
  varianceReason?: string
  closedBy?: string
  closedAt?: string
  status: CashierSessionStatus
  notes: string
  createdAt: string
  updatedAt: string
}

export type CashMovement = {
  id: string
  movementNumber: string
  branchId: string
  businessDate: string
  movementType: CashMovementType
  direction: 'in' | 'out'
  amountCents: number
  reason: string
  referenceType?: 'cashier_session' | 'expense' | 'billing_payment' | 'refund' | 'petty_cash' | 'other'
  referenceId?: string
  recordedBy: string
  createdAt: string
}

export type ExpenseCategory = {
  id: string
  name: string
  parentId?: string
  status: 'active' | 'inactive'
}

export type ExpenseVendor = {
  id: string
  vendorNumber: string
  name: string
  contactPerson: string
  phone: string
  email: string
  address: string
  notes: string
  linkedSupplierId?: string
  status: 'active' | 'inactive'
  createdAt: string
  updatedAt: string
}

export type Expense = {
  id: string
  expenseNumber: string
  scope: ExpenseScope
  branchId?: string
  categoryId: string
  vendorId?: string
  payeeName: string
  description: string
  expenseDate: string
  dueDate?: string
  billingPeriodStart?: string
  billingPeriodEnd?: string
  subtotalCents: number
  taxCents: number
  totalCents: number
  amountPaidCents: number
  balanceCents: number
  status: ExpenseStatus
  paymentMethod?: PaymentMethod
  referenceNumber?: string
  sourceType: ExpenseSourceType
  sourceId?: string
  notes: string
  recurringTemplateId?: string
  createdBy: string
  approvedBy?: string
  approvedAt?: string
  voidReason?: string
  voidedBy?: string
  voidedAt?: string
  createdAt: string
  updatedAt: string
}

export type ExpensePayment = {
  id: string
  expenseId: string
  amountCents: number
  paymentDate: string
  paymentMethod: PaymentMethod
  referenceNumber?: string
  paidBy: string
  notes: string
  createdAt: string
}

export type ExpenseAttachment = {
  id: string
  expenseId: string
  fileName: string
  documentType: 'bill' | 'receipt' | 'invoice' | 'payment_proof' | 'contract' | 'quotation' | 'other'
  storagePath: string
  uploadedBy: string
  uploadedAt: string
  description: string
}

export type RecurringExpenseTemplate = {
  id: string
  name: string
  scope: ExpenseScope
  branchId?: string
  categoryId: string
  vendorId?: string
  payeeName: string
  frequency: RecurringFrequency
  defaultAmountCents?: number
  nextDueDate: string
  autoCreate: boolean
  status: 'active' | 'inactive'
  createdBy: string
  createdAt: string
  updatedAt: string
}

const EXPENSE_KEY = 'plamenco.expenses'
const PAYMENT_KEY = 'plamenco.expense.payments'
const CATEGORY_KEY = 'plamenco.expense.categories'
const VENDOR_KEY = 'plamenco.expense.vendors'
const ATTACHMENT_KEY = 'plamenco.expense.attachments'
const RECURRING_KEY = 'plamenco.expense.recurringTemplates'
const CASHIER_SESSION_KEY = 'plamenco.expense.cashierSessions'
const CASH_MOVEMENT_KEY = 'plamenco.expense.cashMovements'
const DUE_SOON_DAYS = 7

const defaultCategoryRows: Array<[string, string, string?]> = [
  ['utilities', 'Utilities', undefined],
  ['electricity', 'Electricity', 'utilities'],
  ['water', 'Water', 'utilities'],
  ['internet_telecommunications', 'Internet / Telecommunications', 'utilities'],
  ['rent_lease', 'Rent / Lease', undefined],
  ['inventory_purchases', 'Inventory Purchases', undefined],
  ['dental_supplies', 'Dental Supplies', 'inventory_purchases'],
  ['laboratory_fees', 'Laboratory Fees', undefined],
  ['equipment', 'Equipment', undefined],
  ['equipment_maintenance', 'Equipment Maintenance', 'equipment'],
  ['repairs_maintenance', 'Repairs & Maintenance', undefined],
  ['cleaning_sanitation', 'Cleaning / Sanitation', undefined],
  ['office_supplies', 'Office Supplies', undefined],
  ['professional_fees', 'Professional Fees', undefined],
  ['transportation_delivery', 'Transportation / Delivery', undefined],
  ['marketing_advertising', 'Marketing / Advertising', undefined],
  ['software_subscriptions', 'Software / Subscriptions', undefined],
  ['government_regulatory', 'Government / Regulatory Fees', undefined],
  ['payroll_compensation', 'Payroll / Compensation', undefined],
  ['petty_cash', 'Petty Cash', undefined],
  ['miscellaneous', 'Miscellaneous', undefined],
]

const defaultCategories: ExpenseCategory[] = defaultCategoryRows.map(([id, name, parentId]) => ({ id, name, parentId, status: 'active' }))

function nowIso() {
  return new Date().toISOString()
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  } as Storage
}

function getStorage(): Storage {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) return globalThis.localStorage
  const globalWithMemory = globalThis as typeof globalThis & { __plamencoExpenseStorage?: Storage }
  if (globalWithMemory.__plamencoExpenseStorage) return globalWithMemory.__plamencoExpenseStorage
  const created = createMemoryStorage()
  globalWithMemory.__plamencoExpenseStorage = created
  return created
}

function safeParse<T>(value: string | null): T | null {
  if (!value) return null
  try { return JSON.parse(value) as T } catch { return null }
}

function getList<T>(key: string): T[] {
  const parsed = safeParse<T[]>(getStorage().getItem(key))
  return Array.isArray(parsed) ? parsed : []
}

function saveList<T>(key: string, rows: T[]) {
  getStorage().setItem(key, JSON.stringify(rows))
}

function nextNumber(prefix: string, existing: string[]) {
  const next = existing.reduce((max, value) => {
    const match = value.match(new RegExp(`^${prefix}-(\\d+)$`))
    return match ? Math.max(max, Number(match[1])) : max
  }, 0) + 1
  return `${prefix}-${String(next).padStart(6, '0')}`
}

function audit(action: Parameters<typeof recordAuditEntry>[0]['action'], entity: string, entityId: string, metadata?: Record<string, string | number | boolean | null | undefined>) {
  recordAuditEntry({ user: getCurrentSessionUserName(), action, entity, entityId, metadata })
}

function normalizeExpense(expense: Expense): Expense {
  const totalCents = Math.max((expense.subtotalCents ?? 0) + (expense.taxCents ?? 0), 0)
  const amountPaidCents = Math.min(expense.amountPaidCents ?? 0, totalCents)
  const balanceCents = Math.max(totalCents - amountPaidCents, 0)
  return {
    ...expense,
    totalCents,
    amountPaidCents,
    balanceCents,
    status: expense.status === 'void' || expense.status === 'cancelled' || expense.status === 'draft'
      ? expense.status
      : balanceCents <= 0 ? 'paid' : amountPaidCents > 0 ? 'partially_paid' : 'unpaid',
  }
}

export function formatExpenseCurrency(cents: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100)
}

function getActivePaymentMethodTotals(rows: Array<{ method: PaymentMethod; amountCents: number }>) {
  return rows.reduce<Record<PaymentMethod, number>>((totals, row) => {
    totals[row.method] = (totals[row.method] ?? 0) + row.amountCents
    return totals
  }, { cash: 0, gcash: 0, maya: 0, bank_transfer: 0, card: 0, online_gateway: 0, other: 0 })
}

export function getExpenseCategories() {
  const stored = getList<ExpenseCategory>(CATEGORY_KEY)
  return stored.length ? stored : defaultCategories
}

export function getExpenseVendors() {
  const vendors = getList<ExpenseVendor>(VENDOR_KEY)
  const supplierVendors = getSuppliers().map<ExpenseVendor>((supplier) => ({
    id: `supplier-vendor-${supplier.id}`,
    vendorNumber: supplier.supplierNumber,
    name: supplier.name,
    contactPerson: supplier.contactPerson,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    notes: supplier.notes,
    linkedSupplierId: supplier.id,
    status: supplier.status,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt,
  }))
  return [...vendors, ...supplierVendors.filter((supplierVendor) => !vendors.some((vendor) => vendor.linkedSupplierId === supplierVendor.linkedSupplierId))]
}

export function getExpenses() {
  return getList<Expense>(EXPENSE_KEY).map(normalizeExpense).sort((a, b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime())
}

export function getExpensePayments() {
  return getList<ExpensePayment>(PAYMENT_KEY).sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
}

export function getExpenseAttachments() {
  return getList<ExpenseAttachment>(ATTACHMENT_KEY)
}

export function getRecurringExpenseTemplates() {
  return getList<RecurringExpenseTemplate>(RECURRING_KEY)
}

export function getCashierSessions() {
  return getList<CashierSession>(CASHIER_SESSION_KEY).sort((a, b) => new Date(b.businessDate).getTime() - new Date(a.businessDate).getTime())
}

export function getCashMovements() {
  return getList<CashMovement>(CASH_MOVEMENT_KEY).sort((a, b) => new Date(b.businessDate).getTime() - new Date(a.businessDate).getTime())
}

export function resetExpenseState() {
  for (const key of [EXPENSE_KEY, PAYMENT_KEY, CATEGORY_KEY, VENDOR_KEY, ATTACHMENT_KEY, RECURRING_KEY, CASHIER_SESSION_KEY, CASH_MOVEMENT_KEY]) getStorage().removeItem(key)
}

export function createExpenseVendor(input: Omit<ExpenseVendor, 'id' | 'vendorNumber' | 'createdAt' | 'updatedAt'>) {
  if (!input.name.trim()) throw new Error('Vendor name is required.')
  const vendors = getList<ExpenseVendor>(VENDOR_KEY)
  const now = nowIso()
  const vendor: ExpenseVendor = {
    ...input,
    id: makeId('expense-vendor'),
    vendorNumber: nextNumber('VND', vendors.map((entry) => entry.vendorNumber)),
    name: input.name.trim(),
    createdAt: now,
    updatedAt: now,
  }
  saveList(VENDOR_KEY, [vendor, ...vendors])
  void insertRemoteTableRow('expense_vendors', mapVendor(vendor))
  audit('expense_vendor_changed', 'expense_vendor', vendor.id, { vendorNumber: vendor.vendorNumber, name: vendor.name })
  return vendor
}

export function createExpense(input: Omit<Expense, 'id' | 'expenseNumber' | 'totalCents' | 'amountPaidCents' | 'balanceCents' | 'status' | 'createdAt' | 'updatedAt'> & { status?: ExpenseStatus; amountPaidCents?: number }) {
  if (input.scope === 'branch' && !input.branchId) throw new Error('Branch is required for branch expenses.')
  if (!input.categoryId.trim()) throw new Error('Expense category is required.')
  if (!input.payeeName.trim()) throw new Error('Vendor or payee is required.')
  if (!input.description.trim()) throw new Error('Expense description is required.')
  if (!Number.isFinite(input.subtotalCents) || input.subtotalCents < 0) throw new Error('Expense amount must be non-negative.')
  if (!Number.isFinite(input.taxCents) || input.taxCents < 0) throw new Error('Tax amount must be non-negative.')

  const existing = input.sourceId
    ? getExpenses().find((expense) => expense.sourceType === input.sourceType && expense.sourceId === input.sourceId && expense.status !== 'void')
    : undefined
  if (existing && input.sourceType !== 'manual') return existing

  const now = nowIso()
  const totalCents = input.subtotalCents + input.taxCents
  const amountPaidCents = Math.min(input.amountPaidCents ?? 0, totalCents)
  const expense: Expense = normalizeExpense({
    ...input,
    id: makeId('expense'),
    expenseNumber: nextNumber('EXP', getExpenses().map((entry) => entry.expenseNumber)),
    totalCents,
    amountPaidCents,
    balanceCents: totalCents - amountPaidCents,
    status: input.status ?? 'unpaid',
    notes: input.notes ?? '',
    createdAt: now,
    updatedAt: now,
  })
  saveList(EXPENSE_KEY, [expense, ...getExpenses()])
  void insertRemoteTableRow('expenses', mapExpense(expense))
  audit(input.sourceType === 'purchase_receipt' || input.sourceType === 'purchase_order' ? 'purchase_linked_expense_generated' : 'expense_created', 'expense', expense.id, {
    expenseNumber: expense.expenseNumber,
    branchId: expense.branchId,
    scope: expense.scope,
    categoryId: expense.categoryId,
    totalCents: expense.totalCents,
    sourceType: expense.sourceType,
    sourceId: expense.sourceId,
  })
  return expense
}

export function recordExpensePayment(input: Omit<ExpensePayment, 'id' | 'createdAt'>) {
  const expenses = getExpenses()
  const index = expenses.findIndex((expense) => expense.id === input.expenseId)
  if (index === -1) throw new Error('Expense not found.')
  const expense = expenses[index]
  if (expense.status === 'void' || expense.status === 'cancelled') throw new Error('Cannot pay a void or cancelled expense.')
  if (input.amountCents <= 0 || input.amountCents > expense.balanceCents) throw new Error('Expense payment exceeds outstanding balance.')
  const payment: ExpensePayment = { ...input, id: makeId('expense-payment'), notes: input.notes ?? '', createdAt: nowIso() }
  const updated = normalizeExpense({
    ...expense,
    amountPaidCents: expense.amountPaidCents + input.amountCents,
    paymentMethod: input.paymentMethod,
    referenceNumber: input.referenceNumber,
    updatedAt: nowIso(),
  })
  expenses[index] = updated
  saveList(EXPENSE_KEY, expenses)
  saveList(PAYMENT_KEY, [payment, ...getExpensePayments()])
  void updateRemoteTableRow('expenses', updated.id, mapExpense(updated))
  void insertRemoteTableRow('expense_payments', mapPayment(payment))
  audit(updated.status === 'paid' ? 'expense_paid' : 'expense_partial_payment_recorded', 'expense', updated.id, {
    expenseNumber: updated.expenseNumber,
    amountCents: payment.amountCents,
    paymentMethod: payment.paymentMethod,
    paidBy: payment.paidBy,
  })
  return payment
}

export function approveExpense(expenseId: string, approvedBy: string) {
  const expenses = getExpenses()
  const index = expenses.findIndex((expense) => expense.id === expenseId)
  if (index === -1) throw new Error('Expense not found.')
  const updated = { ...expenses[index], approvedBy, approvedAt: nowIso(), updatedAt: nowIso() }
  expenses[index] = updated
  saveList(EXPENSE_KEY, expenses)
  void updateRemoteTableRow('expenses', updated.id, mapExpense(updated))
  audit('expense_approved', 'expense', expenseId, { approvedBy, expenseNumber: updated.expenseNumber })
  return updated
}

export function voidExpense(expenseId: string, reason: string, voidedBy: string) {
  const expenses = getExpenses()
  const index = expenses.findIndex((expense) => expense.id === expenseId)
  if (index === -1) throw new Error('Expense not found.')
  const updated: Expense = { ...expenses[index], status: 'void', balanceCents: 0, voidReason: reason, voidedBy, voidedAt: nowIso(), updatedAt: nowIso() }
  expenses[index] = updated
  saveList(EXPENSE_KEY, expenses)
  void updateRemoteTableRow('expenses', updated.id, mapExpense(updated))
  audit('expense_voided', 'expense', expenseId, { reason, voidedBy, expenseNumber: updated.expenseNumber })
  return updated
}

export function addExpenseAttachment(input: Omit<ExpenseAttachment, 'id' | 'uploadedAt'>) {
  if (!input.expenseId.trim()) throw new Error('Expense is required for attachment metadata.')
  if (!input.storagePath.trim()) throw new Error('Secure storage path is required.')
  const attachment: ExpenseAttachment = { ...input, id: makeId('expense-attachment'), uploadedAt: nowIso() }
  saveList(ATTACHMENT_KEY, [attachment, ...getExpenseAttachments()])
  void insertRemoteTableRow('expense_attachments', mapAttachment(attachment))
  audit('expense_attachment_uploaded', 'expense', attachment.expenseId, { fileName: attachment.fileName, documentType: attachment.documentType })
  return attachment
}

export function createRecurringExpenseTemplate(input: Omit<RecurringExpenseTemplate, 'id' | 'createdAt' | 'updatedAt'>) {
  if (input.scope === 'branch' && !input.branchId) throw new Error('Branch is required for branch recurring expenses.')
  if (!input.name.trim()) throw new Error('Template name is required.')
  const now = nowIso()
  const template: RecurringExpenseTemplate = { ...input, id: makeId('recurring-expense'), createdAt: now, updatedAt: now }
  saveList(RECURRING_KEY, [template, ...getRecurringExpenseTemplates()])
  void insertRemoteTableRow('expense_recurring_templates', mapRecurring(template))
  audit('expense_recurring_template_created', 'expense_recurring_template', template.id, { name: template.name, branchId: template.branchId, frequency: template.frequency })
  return template
}

export function createExpenseFromRecurringTemplate(templateId: string, amountCents?: number) {
  const template = getRecurringExpenseTemplates().find((entry) => entry.id === templateId)
  if (!template) throw new Error('Recurring template not found.')
  const subtotalCents = amountCents ?? template.defaultAmountCents ?? 0
  return createExpense({
    scope: template.scope,
    branchId: template.branchId,
    categoryId: template.categoryId,
    vendorId: template.vendorId,
    payeeName: template.payeeName,
    description: `${template.name} - ${template.nextDueDate.slice(0, 7)}`,
    expenseDate: template.nextDueDate,
    dueDate: template.nextDueDate,
    subtotalCents,
    taxCents: 0,
    sourceType: 'recurring',
    sourceId: template.id,
    notes: subtotalCents === 0 ? 'Amount requires confirmation for this billing period.' : '',
    recurringTemplateId: template.id,
    createdBy: getCurrentSessionUserName(),
  })
}

export function createExpenseFromPurchaseReceipt(receiptId: string) {
  const receipt = getPurchaseReceipts().find((entry) => entry.id === receiptId)
  if (!receipt) throw new Error('Purchase receipt not found.')
  const order = getPurchaseOrders().find((entry) => entry.id === receipt.poId)
  const supplier = getSuppliers().find((entry) => entry.id === receipt.supplierId)
  return createExpense({
    scope: 'branch',
    branchId: receipt.branchId,
    categoryId: 'inventory_purchases',
    vendorId: supplier ? `supplier-vendor-${supplier.id}` : undefined,
    payeeName: supplier?.name ?? 'Inventory supplier',
    description: `Inventory purchase receipt ${receipt.receiptNumber}`,
    expenseDate: receipt.receivedDate,
    dueDate: receipt.receivedDate,
    subtotalCents: receipt.totalCostCents,
    taxCents: 0,
    paymentMethod: undefined,
    sourceType: 'purchase_receipt',
    sourceId: receipt.id,
    notes: order ? `Linked to ${order.poNumber}. Do not recreate manually.` : 'Linked inventory receipt. Do not recreate manually.',
    createdBy: receipt.receivedBy,
  })
}

export function openCashierSession(input: {
  branchId: string
  businessDate: string
  openingCashCents: number
  openedBy: string
  notes?: string
}) {
  if (!input.branchId.trim()) throw new Error('Branch is required for cashier session.')
  if (!input.businessDate.trim()) throw new Error('Business date is required.')
  if (!Number.isFinite(input.openingCashCents) || input.openingCashCents < 0) throw new Error('Opening cash must be non-negative.')
  const sessions = getCashierSessions()
  const existingOpen = sessions.find((session) => session.branchId === input.branchId && session.businessDate === input.businessDate && session.status === 'open')
  if (existingOpen) return existingOpen
  const now = nowIso()
  const session: CashierSession = {
    id: makeId('cashier-session'),
    sessionNumber: nextNumber('CSH', sessions.map((entry) => entry.sessionNumber)),
    branchId: input.branchId,
    businessDate: input.businessDate,
    openedBy: input.openedBy,
    openedAt: now,
    openingCashCents: input.openingCashCents,
    expectedCashCents: getDailyCashReconciliation(input.branchId, input.businessDate, input.openingCashCents).expectedCashCents,
    status: 'open',
    notes: input.notes ?? '',
    createdAt: now,
    updatedAt: now,
  }
  saveList(CASHIER_SESSION_KEY, [session, ...sessions])
  void insertRemoteTableRow('cashier_sessions', mapCashierSession(session))
  audit('cashier_session_opened', 'cashier_session', session.id, { sessionNumber: session.sessionNumber, branchId: session.branchId, businessDate: session.businessDate })
  return session
}

export function recordCashMovement(input: Omit<CashMovement, 'id' | 'movementNumber' | 'createdAt'>) {
  if (!input.branchId.trim()) throw new Error('Branch is required for cash movement.')
  if (!input.businessDate.trim()) throw new Error('Business date is required.')
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) throw new Error('Cash movement amount must be greater than zero.')
  if (!input.reason.trim()) throw new Error('Cash movement reason is required.')
  const movement: CashMovement = {
    ...input,
    id: makeId('cash-movement'),
    movementNumber: nextNumber('CMV', getCashMovements().map((entry) => entry.movementNumber)),
    createdAt: nowIso(),
  }
  saveList(CASH_MOVEMENT_KEY, [movement, ...getCashMovements()])
  void insertRemoteTableRow('cash_movements', mapCashMovement(movement))
  audit('cash_movement_recorded', 'cash_movement', movement.id, {
    movementNumber: movement.movementNumber,
    branchId: movement.branchId,
    direction: movement.direction,
    amountCents: movement.amountCents,
  })
  return movement
}

export function recordPettyCashDisbursement(input: {
  branchId: string
  amountCents: number
  paymentDate: string
  payeeName: string
  description: string
  recordedBy: string
  notes?: string
}) {
  const expense = createExpense({
    scope: 'branch',
    branchId: input.branchId,
    categoryId: 'petty_cash',
    payeeName: input.payeeName,
    description: input.description,
    expenseDate: input.paymentDate,
    dueDate: input.paymentDate,
    subtotalCents: input.amountCents,
    taxCents: 0,
    sourceType: 'manual',
    notes: input.notes ?? 'Petty cash disbursement.',
    createdBy: input.recordedBy,
  })
  recordExpensePayment({
    expenseId: expense.id,
    amountCents: input.amountCents,
    paymentDate: input.paymentDate,
    paymentMethod: 'cash',
    referenceNumber: `Petty cash ${expense.expenseNumber}`,
    paidBy: input.recordedBy,
    notes: input.notes ?? '',
  })
  audit('petty_cash_disbursed', 'expense', expense.id, { expenseNumber: expense.expenseNumber, branchId: input.branchId, amountCents: input.amountCents })
  return getExpenses().find((entry) => entry.id === expense.id) ?? expense
}

export function getCashFlowSummary(input: { branchId?: string; startDate?: string; endDate?: string } = {}) {
  const inRange = (dateValue: string) => {
    const date = dateValue.slice(0, 10)
    return (!input.startDate || date >= input.startDate) && (!input.endDate || date <= input.endDate)
  }
  const matchesBranch = (branchId?: string) => !input.branchId || branchId === input.branchId
  const patientPayments = getStoredPayments().filter((payment) => ['completed', 'partially_refunded', 'refunded'].includes(payment.status) && matchesBranch(payment.branchId) && inRange(payment.date))
  const refunds = getStoredRefunds().filter((refund) => refund.status === 'completed' && matchesBranch(refund.branchId) && inRange(refund.processedAt))
  const expensePayments = getExpensePayments().filter((payment) => {
    const expense = getExpenses().find((entry) => entry.id === payment.expenseId)
    return expense && matchesBranch(expense.branchId) && inRange(payment.paymentDate)
  })
  const standaloneMovements = getCashMovements().filter((movement) => matchesBranch(movement.branchId) && inRange(movement.businessDate))
  const invoices = getStoredInvoices().filter((invoice) => invoice.status !== 'void' && matchesBranch(invoice.branchId) && inRange(invoice.invoiceDate))
  const byMethod = getActivePaymentMethodTotals(patientPayments.map((payment) => ({ method: payment.paymentMethod, amountCents: payment.amountCents })))
  const patientInflowCents = patientPayments.reduce((sum, payment) => sum + payment.amountCents, 0)
  const expenseOutflowCents = expensePayments.reduce((sum, payment) => sum + payment.amountCents, 0)
  const refundOutflowCents = refunds.reduce((sum, refund) => sum + refund.amountCents, 0)
  const cashMovementInCents = standaloneMovements.filter((movement) => movement.direction === 'in').reduce((sum, movement) => sum + movement.amountCents, 0)
  const cashMovementOutCents = standaloneMovements.filter((movement) => movement.direction === 'out').reduce((sum, movement) => sum + movement.amountCents, 0)
  const pettyCashUsedCents = expensePayments.reduce((sum, payment) => {
    const expense = getExpenses().find((entry) => entry.id === payment.expenseId)
    return expense?.categoryId === 'petty_cash' ? sum + payment.amountCents : sum
  }, 0)
  const discountsCents = invoices.reduce((sum, invoice) => sum + invoice.discountCents, 0)
  return {
    patientInflowCents,
    expenseOutflowCents,
    refundOutflowCents,
    cashMovementInCents,
    cashMovementOutCents,
    netCashFlowCents: patientInflowCents + cashMovementInCents - expenseOutflowCents - refundOutflowCents - cashMovementOutCents,
    unpaidPatientBalanceCents: invoices.reduce((sum, invoice) => sum + invoice.balanceCents, 0),
    unpaidExpenseBalanceCents: getExpenses().filter((expense) => expense.status !== 'void' && matchesBranch(expense.branchId)).reduce((sum, expense) => sum + expense.balanceCents, 0),
    discountsCents,
    pettyCashUsedCents,
    byMethod,
  }
}

export function getDailyCashReconciliation(branchId: string, businessDate: string, openingCashCents?: number) {
  const session = getCashierSessions().find((entry) => entry.branchId === branchId && entry.businessDate === businessDate && entry.status !== 'void')
  const opening = openingCashCents ?? session?.openingCashCents ?? 0
  const summary = getCashFlowSummary({ branchId, startDate: businessDate, endDate: businessDate })
  const expectedCashCents = opening + (summary.byMethod.cash ?? 0) + summary.cashMovementInCents - getExpensePayments()
    .filter((payment) => payment.paymentMethod === 'cash' && payment.paymentDate === businessDate)
    .filter((payment) => getExpenses().some((expense) => expense.id === payment.expenseId && expense.branchId === branchId))
    .reduce((sum, payment) => sum + payment.amountCents, 0) - getStoredRefunds()
    .filter((refund) => refund.status === 'completed' && refund.branchId === branchId && refund.processedAt.slice(0, 10) === businessDate)
    .reduce((sum, refund) => sum + refund.amountCents, 0) - summary.cashMovementOutCents
  return {
    branchId,
    businessDate,
    openingCashCents: opening,
    expectedCashCents,
    actualCashCents: session?.actualCashCents,
    varianceCents: session?.actualCashCents === undefined ? undefined : session.actualCashCents - expectedCashCents,
    status: session?.status ?? 'open',
    summary,
  }
}

export function closeCashierSession(sessionId: string, input: { actualCashCents: number; varianceReason?: string; closedBy: string }) {
  if (!Number.isFinite(input.actualCashCents) || input.actualCashCents < 0) throw new Error('Actual counted cash must be non-negative.')
  const sessions = getCashierSessions()
  const index = sessions.findIndex((session) => session.id === sessionId)
  if (index === -1) throw new Error('Cashier session not found.')
  const session = sessions[index]
  if (session.status !== 'open') throw new Error('Only open cashier sessions can be closed.')
  const reconciliation = getDailyCashReconciliation(session.branchId, session.businessDate, session.openingCashCents)
  const varianceCents = input.actualCashCents - reconciliation.expectedCashCents
  if (varianceCents !== 0 && !input.varianceReason?.trim()) throw new Error('Variance reason is required when actual cash differs from expected cash.')
  const updated: CashierSession = {
    ...session,
    expectedCashCents: reconciliation.expectedCashCents,
    actualCashCents: input.actualCashCents,
    varianceCents,
    varianceReason: input.varianceReason ?? '',
    closedBy: input.closedBy,
    closedAt: nowIso(),
    status: 'closed',
    updatedAt: nowIso(),
  }
  sessions[index] = updated
  saveList(CASHIER_SESSION_KEY, sessions)
  void updateRemoteTableRow('cashier_sessions', updated.id, mapCashierSession(updated))
  audit('cashier_session_closed', 'cashier_session', updated.id, { sessionNumber: updated.sessionNumber, expectedCashCents: updated.expectedCashCents, actualCashCents: updated.actualCashCents, varianceCents })
  return updated
}

export function getExpenseDueStatus(expense: Expense, today = new Date()): DueStatus {
  if (expense.status === 'void') return 'void'
  if (expense.status === 'paid') return 'paid'
  if (!expense.dueDate) return 'not_due'
  const due = new Date(`${expense.dueDate}T00:00:00`)
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffDays = Math.ceil((due.getTime() - todayStart.getTime()) / 86400000)
  if (diffDays < 0) return 'overdue'
  if (diffDays <= DUE_SOON_DAYS) return 'due_soon'
  return 'not_due'
}

export function getExpenseOverview(branchId?: string) {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const expenses = getExpenses().filter((expense) => expense.status !== 'void' && (!branchId || expense.branchId === branchId || (branchId === 'clinic_wide' && expense.scope === 'clinic_wide')))
  const cashSummary = getCashFlowSummary({ branchId: branchId === 'clinic_wide' ? undefined : branchId, startDate: `${currentMonth}-01` })
  return {
    thisMonthCents: expenses.filter((expense) => expense.expenseDate.startsWith(currentMonth)).reduce((sum, expense) => sum + expense.totalCents, 0),
    unpaidCents: expenses.reduce((sum, expense) => sum + expense.balanceCents, 0),
    dueSoon: expenses.filter((expense) => getExpenseDueStatus(expense) === 'due_soon').length,
    overdue: expenses.filter((expense) => getExpenseDueStatus(expense) === 'overdue').length,
    recurringDue: getRecurringExpenseTemplates().filter((template) => template.status === 'active' && getExpenseDueStatus({ status: 'unpaid', dueDate: template.nextDueDate } as Expense) === 'due_soon').length,
    pettyCashUsedCents: cashSummary.pettyCashUsedCents,
    pulilanCents: getExpenses().filter((expense) => expense.branchId === 'branch-pulilan' && expense.status !== 'void').reduce((sum, expense) => sum + expense.totalCents, 0),
    plaridelCents: getExpenses().filter((expense) => expense.branchId === 'branch-plaridel' && expense.status !== 'void').reduce((sum, expense) => sum + expense.totalCents, 0),
    clinicWideCents: getExpenses().filter((expense) => expense.scope === 'clinic_wide' && expense.status !== 'void').reduce((sum, expense) => sum + expense.totalCents, 0),
  }
}

export function getExpenseLedger(branchId?: string) {
  const expenses = getExpenses().filter((expense) => !branchId || expense.branchId === branchId)
  const payments = getExpensePayments()
  return [
    ...expenses.map((expense) => ({ id: expense.id, date: expense.expenseDate, kind: 'expense' as const, label: expense.expenseNumber, amountCents: expense.totalCents, balanceEffectCents: expense.totalCents })),
    ...payments.map((payment) => {
      const expense = expenses.find((entry) => entry.id === payment.expenseId)
      return expense ? { id: payment.id, date: payment.paymentDate, kind: 'payment' as const, label: getPaymentMethodLabel(payment.paymentMethod), amountCents: payment.amountCents, balanceEffectCents: -payment.amountCents } : null
    }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

function mapExpense(expense: Expense) {
  return {
    id: expense.id,
    expense_number: expense.expenseNumber,
    scope: expense.scope,
    branch_id: expense.branchId ?? null,
    category_id: expense.categoryId,
    vendor_id: expense.vendorId ?? null,
    payee_name: expense.payeeName,
    description: expense.description,
    expense_date: expense.expenseDate,
    due_date: expense.dueDate ?? null,
    billing_period_start: expense.billingPeriodStart ?? null,
    billing_period_end: expense.billingPeriodEnd ?? null,
    subtotal_cents: expense.subtotalCents,
    tax_cents: expense.taxCents,
    total_cents: expense.totalCents,
    amount_paid_cents: expense.amountPaidCents,
    balance_cents: expense.balanceCents,
    status: expense.status,
    payment_method: expense.paymentMethod ?? null,
    reference_number: expense.referenceNumber ?? '',
    source_type: expense.sourceType,
    source_id: expense.sourceId ?? null,
    notes: expense.notes,
    recurring_template_id: expense.recurringTemplateId ?? null,
    created_by: expense.createdBy,
    approved_by: expense.approvedBy ?? '',
    approved_at: expense.approvedAt ?? null,
    void_reason: expense.voidReason ?? '',
    voided_by: expense.voidedBy ?? '',
    voided_at: expense.voidedAt ?? null,
  }
}

function mapPayment(payment: ExpensePayment) {
  return {
    id: payment.id,
    expense_id: payment.expenseId,
    amount_cents: payment.amountCents,
    payment_date: payment.paymentDate,
    payment_method: payment.paymentMethod,
    reference_number: payment.referenceNumber ?? '',
    paid_by: payment.paidBy,
    notes: payment.notes,
  }
}

function mapVendor(vendor: ExpenseVendor) {
  return {
    id: vendor.id,
    vendor_number: vendor.vendorNumber,
    name: vendor.name,
    contact_person: vendor.contactPerson,
    phone: vendor.phone,
    email: vendor.email,
    address: vendor.address,
    notes: vendor.notes,
    linked_supplier_id: vendor.linkedSupplierId ?? null,
    status: vendor.status,
  }
}

function mapAttachment(attachment: ExpenseAttachment) {
  return {
    id: attachment.id,
    expense_id: attachment.expenseId,
    file_name: attachment.fileName,
    document_type: attachment.documentType,
    storage_path: attachment.storagePath,
    uploaded_by: attachment.uploadedBy,
    uploaded_at: attachment.uploadedAt,
    description: attachment.description,
  }
}

function mapRecurring(template: RecurringExpenseTemplate) {
  return {
    id: template.id,
    name: template.name,
    scope: template.scope,
    branch_id: template.branchId ?? null,
    category_id: template.categoryId,
    vendor_id: template.vendorId ?? null,
    payee_name: template.payeeName,
    frequency: template.frequency,
    default_amount_cents: template.defaultAmountCents ?? null,
    next_due_date: template.nextDueDate,
    auto_create: template.autoCreate,
    status: template.status,
    created_by: template.createdBy,
  }
}

function mapCashierSession(session: CashierSession) {
  return {
    id: session.id,
    session_number: session.sessionNumber,
    branch_id: session.branchId,
    business_date: session.businessDate,
    opened_by: session.openedBy,
    opened_at: session.openedAt,
    opening_cash_cents: session.openingCashCents,
    expected_cash_cents: session.expectedCashCents,
    actual_cash_cents: session.actualCashCents ?? null,
    variance_cents: session.varianceCents ?? null,
    variance_reason: session.varianceReason ?? '',
    closed_by: session.closedBy ?? '',
    closed_at: session.closedAt ?? null,
    status: session.status,
    notes: session.notes,
  }
}

function mapCashMovement(movement: CashMovement) {
  return {
    id: movement.id,
    movement_number: movement.movementNumber,
    branch_id: movement.branchId,
    business_date: movement.businessDate,
    movement_type: movement.movementType,
    direction: movement.direction,
    amount_cents: movement.amountCents,
    reason: movement.reason,
    reference_type: movement.referenceType ?? null,
    reference_id: movement.referenceId ?? null,
    recorded_by: movement.recordedBy,
    created_at: movement.createdAt,
  }
}

export { ATTACHMENT_KEY, CASHIER_SESSION_KEY, CASH_MOVEMENT_KEY, CATEGORY_KEY, DUE_SOON_DAYS, EXPENSE_KEY, PAYMENT_KEY, RECURRING_KEY, VENDOR_KEY }
