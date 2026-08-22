import { getExpensePayments, getExpenses, type Expense } from './expenseStore'
import { reviseExpensePersisted, voidExpensePersisted } from './expensePersistence'

type ExpenseCorrectionPatch = Pick<Expense, 'scope' | 'branchId' | 'categoryId' | 'vendorId' | 'payeeName' | 'description' | 'expenseDate' | 'dueDate' | 'subtotalCents' | 'taxCents' | 'referenceNumber' | 'notes'>

export function canCorrectExpense(expense: Expense) {
  if (expense.sourceType !== 'manual') return { allowed: false, reason: 'Linked or generated expenses should be corrected at their source instead of editing the ledger copy.' }
  if (expense.status === 'void' || expense.status === 'cancelled') return { allowed: false, reason: 'Void or cancelled expenses cannot be edited.' }
  if (getExpensePayments().some((payment) => payment.expenseId === expense.id)) return { allowed: false, reason: 'This expense already has a payment. Void it and recreate the corrected record instead.' }
  return { allowed: true, reason: '' }
}

export async function reviseExpense(expenseId: string, patch: ExpenseCorrectionPatch) {
  const current = getExpenses().find((row) => row.id === expenseId)
  if (!current) throw new Error('Expense record not found.')
  const eligibility = canCorrectExpense(current)
  if (!eligibility.allowed) throw new Error(eligibility.reason)
  if (patch.scope === 'branch' && !patch.branchId) throw new Error('Branch is required for branch expenses.')
  if (!patch.categoryId.trim()) throw new Error('Expense category is required.')
  if (!patch.payeeName.trim()) throw new Error('Vendor or payee is required.')
  if (!patch.description.trim()) throw new Error('Expense description is required.')
  if (!Number.isFinite(patch.subtotalCents) || patch.subtotalCents < 0) throw new Error('Subtotal must be zero or greater.')
  if (!Number.isFinite(patch.taxCents) || patch.taxCents < 0) throw new Error('Tax must be zero or greater.')

  return reviseExpensePersisted(expenseId, patch)
}

export async function voidExpenseWithConfirmation(expenseId: string, reason: string) {
  const current = getExpenses().find((row) => row.id === expenseId)
  if (!current) throw new Error('Expense record not found.')
  if (current.status === 'void') throw new Error('Expense is already void.')
  if (!reason.trim()) throw new Error('A correction reason is required before voiding an expense.')
  return voidExpensePersisted(expenseId, reason.trim())
}
