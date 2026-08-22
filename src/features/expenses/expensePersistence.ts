import { supabase } from '../../lib/supabase'
import { createUuid } from '../../lib/id'
import {
  getExpensePayments,
  getExpenses,
  getExpenseVendors,
  getRecurringExpenseTemplates,
  type Expense,
  type ExpensePayment,
  type ExpenseScope,
  type ExpenseSourceType,
  type ExpenseVendor,
  type RecurringExpenseTemplate,
  type RecurringFrequency,
} from './expenseStore'
import type { PaymentMethod } from '../billing/billingStore'

const EXPENSE_KEY = 'plamenco.expenses'
const PAYMENT_KEY = 'plamenco.expense.payments'
const VENDOR_KEY = 'plamenco.expense.vendors'
const RECURRING_KEY = 'plamenco.expense.recurringTemplates'

function requireDatabase() {
  if (!supabase) throw new Error('Clinic database is not configured. Expenses cannot be saved safely.')
  return supabase
}

export function mapExpense(row: Record<string, any>): Expense {
  return {
    id: String(row.id),
    expenseNumber: String(row.expense_number ?? ''),
    scope: (row.scope ?? 'branch') as ExpenseScope,
    branchId: row.branch_id ?? undefined,
    categoryId: String(row.category_id ?? ''),
    vendorId: row.vendor_id ?? undefined,
    payeeName: String(row.payee_name ?? ''),
    description: String(row.description ?? ''),
    expenseDate: String(row.expense_date ?? ''),
    dueDate: row.due_date ?? undefined,
    billingPeriodStart: row.billing_period_start ?? undefined,
    billingPeriodEnd: row.billing_period_end ?? undefined,
    subtotalCents: Number(row.subtotal_cents ?? 0),
    taxCents: Number(row.tax_cents ?? 0),
    totalCents: Number(row.total_cents ?? 0),
    amountPaidCents: Number(row.amount_paid_cents ?? 0),
    balanceCents: Number(row.balance_cents ?? 0),
    status: row.status ?? 'unpaid',
    paymentMethod: row.payment_method ?? undefined,
    referenceNumber: row.reference_number || undefined,
    sourceType: (row.source_type ?? 'manual') as ExpenseSourceType,
    sourceId: row.source_id ?? undefined,
    notes: row.notes ?? '',
    recurringTemplateId: row.recurring_template_id ?? undefined,
    createdBy: row.created_by ?? '',
    approvedBy: row.approved_by || undefined,
    approvedAt: row.approved_at ?? undefined,
    voidReason: row.void_reason || undefined,
    voidedBy: row.voided_by || undefined,
    voidedAt: row.voided_at ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }
}

function mapPayment(row: Record<string, any>): ExpensePayment {
  return {
    id: String(row.id),
    expenseId: String(row.expense_id),
    amountCents: Number(row.amount_cents ?? 0),
    paymentDate: String(row.payment_date ?? ''),
    paymentMethod: (row.payment_method ?? 'cash') as PaymentMethod,
    referenceNumber: row.reference_number || undefined,
    paidBy: String(row.paid_by ?? ''),
    notes: String(row.notes ?? ''),
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}

function mapVendor(row: Record<string, any>): ExpenseVendor {
  return {
    id: String(row.id),
    vendorNumber: String(row.vendor_number ?? ''),
    name: String(row.name ?? ''),
    contactPerson: String(row.contact_person ?? ''),
    phone: String(row.phone ?? ''),
    email: String(row.email ?? ''),
    address: String(row.address ?? ''),
    notes: String(row.notes ?? ''),
    linkedSupplierId: row.linked_supplier_id ?? undefined,
    status: row.status ?? 'active',
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }
}

function mapRecurring(row: Record<string, any>): RecurringExpenseTemplate {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    scope: (row.scope ?? 'branch') as ExpenseScope,
    branchId: row.branch_id ?? undefined,
    categoryId: String(row.category_id ?? ''),
    vendorId: row.vendor_id ?? undefined,
    payeeName: String(row.payee_name ?? ''),
    frequency: row.frequency as RecurringFrequency,
    defaultAmountCents: row.default_amount_cents == null ? undefined : Number(row.default_amount_cents),
    nextDueDate: String(row.next_due_date ?? ''),
    autoCreate: Boolean(row.auto_create),
    status: row.status ?? 'active',
    createdBy: String(row.created_by ?? ''),
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }
}

function cacheExpense(expense: Expense) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(EXPENSE_KEY, JSON.stringify([expense, ...getExpenses().filter((entry) => entry.id !== expense.id)]))
}

function cachePayment(payment: ExpensePayment) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PAYMENT_KEY, JSON.stringify([payment, ...getExpensePayments().filter((entry) => entry.id !== payment.id)]))
}

function cacheVendor(vendor: ExpenseVendor) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(VENDOR_KEY, JSON.stringify([vendor, ...getExpenseVendors().filter((entry) => entry.id !== vendor.id)]))
}

function cacheRecurring(template: RecurringExpenseTemplate) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(RECURRING_KEY, JSON.stringify([template, ...getRecurringExpenseTemplates().filter((entry) => entry.id !== template.id)]))
}

export async function createExpensePersisted(input: {
  scope: ExpenseScope
  branchId?: string
  categoryId: string
  vendorId?: string
  payeeName: string
  description: string
  expenseDate: string
  dueDate?: string
  subtotalCents: number
  taxCents?: number
  referenceNumber?: string
  notes?: string
  sourceType?: ExpenseSourceType
  sourceId?: string
  recurringTemplateId?: string
}): Promise<Expense> {
  const db = requireDatabase()
  const { data, error } = await db.rpc('create_expense_record', {
    p_scope: input.scope,
    p_branch_id: input.branchId ?? null,
    p_category_id: input.categoryId,
    p_vendor_id: input.vendorId ?? null,
    p_payee_name: input.payeeName,
    p_description: input.description,
    p_expense_date: input.expenseDate,
    p_due_date: input.dueDate ?? null,
    p_subtotal_cents: input.subtotalCents,
    p_tax_cents: input.taxCents ?? 0,
    p_reference_number: input.referenceNumber ?? '',
    p_notes: input.notes ?? '',
    p_source_type: input.sourceType ?? 'manual',
    p_source_id: input.sourceId ?? null,
    p_recurring_template_id: input.recurringTemplateId ?? null,
  })
  if (error || !data) {
    if (import.meta.env.DEV && error?.message) console.error('[expense persistence]', error)
    throw new Error('Expense could not be saved. No financial record was committed.')
  }
  const expense = mapExpense(data as Record<string, any>)
  cacheExpense(expense)
  return expense
}

export async function createExpenseVendorPersisted(input: {
  name: string
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
}): Promise<ExpenseVendor> {
  const db = requireDatabase()
  const { data, error } = await db.rpc('create_expense_vendor', {
    p_name: input.name,
    p_contact_person: input.contactPerson ?? '',
    p_phone: input.phone ?? '',
    p_email: input.email ?? '',
    p_address: input.address ?? '',
    p_notes: input.notes ?? '',
  })
  if (error || !data) throw new Error('Vendor could not be saved. No vendor record was committed.')
  const vendor = mapVendor(data as Record<string, any>)
  cacheVendor(vendor)
  return vendor
}

export async function createRecurringExpenseTemplatePersisted(input: {
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
}): Promise<RecurringExpenseTemplate> {
  const db = requireDatabase()
  const { data, error } = await db.rpc('create_expense_recurring_template', {
    p_name: input.name,
    p_scope: input.scope,
    p_branch_id: input.branchId ?? null,
    p_category_id: input.categoryId,
    p_vendor_id: input.vendorId ?? null,
    p_payee_name: input.payeeName,
    p_frequency: input.frequency,
    p_default_amount_cents: input.defaultAmountCents ?? null,
    p_next_due_date: input.nextDueDate,
    p_auto_create: input.autoCreate,
  })
  if (error || !data) throw new Error('Recurring expense template could not be saved.')
  const template = mapRecurring(data as Record<string, any>)
  cacheRecurring(template)
  return template
}

export async function reviseExpensePersisted(expenseId: string, patch: {
  scope: ExpenseScope
  branchId?: string
  categoryId: string
  vendorId?: string
  payeeName: string
  description: string
  expenseDate: string
  dueDate?: string
  subtotalCents: number
  taxCents: number
  referenceNumber?: string
  notes: string
}): Promise<Expense> {
  const db = requireDatabase()
  const { data, error } = await db.rpc('revise_expense_record', {
    p_expense_id: expenseId,
    p_scope: patch.scope,
    p_branch_id: patch.branchId ?? null,
    p_category_id: patch.categoryId,
    p_vendor_id: patch.vendorId ?? null,
    p_payee_name: patch.payeeName,
    p_description: patch.description,
    p_expense_date: patch.expenseDate,
    p_due_date: patch.dueDate ?? null,
    p_subtotal_cents: patch.subtotalCents,
    p_tax_cents: patch.taxCents,
    p_reference_number: patch.referenceNumber ?? '',
    p_notes: patch.notes,
  })
  if (error || !data) throw new Error(error?.message || 'Expense correction was not saved.')
  const expense = mapExpense(data as Record<string, any>)
  cacheExpense(expense)
  return expense
}

export async function voidExpensePersisted(expenseId: string, reason: string): Promise<Expense> {
  const db = requireDatabase()
  const { data, error } = await db.rpc('void_expense_record', { p_expense_id: expenseId, p_reason: reason })
  if (error || !data) throw new Error(error?.message || 'Expense was not voided.')
  const expense = mapExpense(data as Record<string, any>)
  cacheExpense(expense)
  return expense
}

export async function recordExpensePaymentPersisted(input: {
  expenseId: string
  amountCents: number
  paymentDate: string
  paymentMethod: PaymentMethod
  referenceNumber?: string
  notes?: string
  clientRequestId?: string
}): Promise<Expense> {
  const db = requireDatabase()
  const requestId = input.clientRequestId ?? createUuid()
  const { data, error } = await db.rpc('record_expense_payment', {
    p_expense_id: input.expenseId,
    p_amount_cents: input.amountCents,
    p_payment_date: input.paymentDate,
    p_payment_method: input.paymentMethod,
    p_reference_number: input.referenceNumber ?? '',
    p_paid_by: '',
    p_notes: input.notes ?? '',
    p_client_request_id: requestId,
  })
  if (error || !data) throw new Error('Expense payment was not recorded. The balance remains unchanged.')
  const expense = mapExpense(data as Record<string, any>)
  cacheExpense(expense)

  const { data: paymentRows } = await db
    .from('expense_payments')
    .select('*')
    .eq('client_request_id', requestId)
    .limit(1)
  const paymentRow = paymentRows?.[0]
  if (paymentRow) cachePayment(mapPayment(paymentRow as Record<string, any>))
  return expense
}

export async function recordPettyCashPersisted(input: {
  branchId: string
  amountCents: number
  paymentDate: string
  payeeName: string
  description: string
  notes?: string
  clientRequestId?: string
}): Promise<{ expense: Expense; payment: ExpensePayment }> {
  const db = requireDatabase()
  const requestId = input.clientRequestId ?? createUuid()
  const { data, error } = await db.rpc('record_petty_cash_disbursement', {
    p_branch_id: input.branchId,
    p_amount_cents: input.amountCents,
    p_payment_date: input.paymentDate,
    p_payee_name: input.payeeName,
    p_description: input.description,
    p_notes: input.notes ?? '',
    p_client_request_id: requestId,
  })
  if (error || !data?.expense || !data?.payment) throw new Error('Petty cash could not be recorded. No financial record was committed.')
  const expense = mapExpense(data.expense as Record<string, any>)
  const payment = mapPayment(data.payment as Record<string, any>)
  cacheExpense(expense)
  cachePayment(payment)
  return { expense, payment }
}

export async function generateExpenseFromPurchaseReceiptPersisted(receiptId: string): Promise<Expense> {
  const db = requireDatabase()
  const { data, error } = await db.rpc('generate_expense_from_purchase_receipt', {
    p_receipt_id: receiptId,
    p_created_by: '',
  })
  if (error || !data) throw new Error('Supplier expense could not be generated from this receipt.')
  const expense = mapExpense(data as Record<string, any>)
  cacheExpense(expense)
  return expense
}
