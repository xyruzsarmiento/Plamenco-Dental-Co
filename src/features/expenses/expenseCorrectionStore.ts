import { isSupabaseConfigured } from '../../lib/supabase'
import { updateRemoteTableRow } from '../../lib/supabaseSync'
import { recordAuditEntry } from '../security/auditLogStore'
import { getCurrentSessionUserName } from '../security/security'
import { EXPENSE_KEY, formatExpenseCurrency, getExpensePayments, getExpenses, type Expense } from './expenseStore'

type ExpenseCorrectionPatch = Pick<Expense, 'scope' | 'branchId' | 'categoryId' | 'vendorId' | 'payeeName' | 'description' | 'expenseDate' | 'dueDate' | 'subtotalCents' | 'taxCents' | 'referenceNumber' | 'notes'>

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

function saveExpenses(rows: Expense[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(EXPENSE_KEY, JSON.stringify(rows))
}

export function canCorrectExpense(expense: Expense) {
  if (expense.sourceType !== 'manual') return { allowed: false, reason: 'Linked or generated expenses should be corrected at their source instead of editing the ledger copy.' }
  if (expense.status === 'void' || expense.status === 'cancelled') return { allowed: false, reason: 'Void or cancelled expenses cannot be edited.' }
  if (getExpensePayments().some((payment) => payment.expenseId === expense.id)) return { allowed: false, reason: 'This expense already has a payment. Void it and recreate the corrected record instead.' }
  return { allowed: true, reason: '' }
}

export async function reviseExpense(expenseId: string, patch: ExpenseCorrectionPatch) {
  const rows = getExpenses()
  const index = rows.findIndex((row) => row.id === expenseId)
  if (index < 0) throw new Error('Expense record not found.')
  const current = rows[index]
  const eligibility = canCorrectExpense(current)
  if (!eligibility.allowed) throw new Error(eligibility.reason)
  if (patch.scope === 'branch' && !patch.branchId) throw new Error('Branch is required for branch expenses.')
  if (!patch.categoryId.trim()) throw new Error('Expense category is required.')
  if (!patch.payeeName.trim()) throw new Error('Vendor or payee is required.')
  if (!patch.description.trim()) throw new Error('Expense description is required.')
  if (!Number.isFinite(patch.subtotalCents) || patch.subtotalCents < 0) throw new Error('Subtotal must be zero or greater.')
  if (!Number.isFinite(patch.taxCents) || patch.taxCents < 0) throw new Error('Tax must be zero or greater.')

  const totalCents = patch.subtotalCents + patch.taxCents
  const updated: Expense = {
    ...current,
    ...patch,
    branchId: patch.scope === 'branch' ? patch.branchId : undefined,
    totalCents,
    balanceCents: Math.max(totalCents - current.amountPaidCents, 0),
    status: current.status === 'draft' ? 'draft' : totalCents <= current.amountPaidCents ? 'paid' : current.amountPaidCents > 0 ? 'partially_paid' : 'unpaid',
    updatedAt: new Date().toISOString(),
  }
  const next = rows.map((row) => row.id === expenseId ? updated : row)
  saveExpenses(next)
  const remote = await updateRemoteTableRow('expenses', updated.id, mapExpense(updated))
  if (isSupabaseConfigured && !remote) {
    saveExpenses(rows)
    throw new Error('Database update failed. The previous expense values were restored locally.')
  }
  recordAuditEntry({
    user: getCurrentSessionUserName(),
    action: 'expense_updated',
    entity: 'expense',
    entityId: updated.id,
    metadata: { expenseNumber: updated.expenseNumber, total: formatExpenseCurrency(updated.totalCents) },
  })
  return updated
}

export async function voidExpenseWithConfirmation(expenseId: string, reason: string) {
  const rows = getExpenses()
  const index = rows.findIndex((row) => row.id === expenseId)
  if (index < 0) throw new Error('Expense record not found.')
  const current = rows[index]
  if (current.status === 'void') throw new Error('Expense is already void.')
  if (!reason.trim()) throw new Error('A correction reason is required before voiding an expense.')
  const updated: Expense = {
    ...current,
    status: 'void',
    balanceCents: 0,
    voidReason: reason.trim(),
    voidedBy: getCurrentSessionUserName(),
    voidedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const next = rows.map((row) => row.id === expenseId ? updated : row)
  saveExpenses(next)
  const remote = await updateRemoteTableRow('expenses', updated.id, mapExpense(updated))
  if (isSupabaseConfigured && !remote) {
    saveExpenses(rows)
    throw new Error('Database update failed. The expense was not voided locally.')
  }
  recordAuditEntry({
    user: getCurrentSessionUserName(),
    action: 'expense_voided',
    entity: 'expense',
    entityId: updated.id,
    metadata: { expenseNumber: updated.expenseNumber, reason: reason.trim() },
  })
  return updated
}
