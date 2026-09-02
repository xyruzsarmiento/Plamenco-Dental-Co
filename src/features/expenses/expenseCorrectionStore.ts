import { getExpensePayments, getExpenses, type Expense } from './expenseStore'
import { reviseExpensePersisted, voidExpensePersisted } from './expensePersistence'

type ExpenseCorrectionPatch = Pick<Expense, 'scope' | 'branchId' | 'categoryId' | 'vendorId' | 'payeeName' | 'description' | 'expenseDate' | 'dueDate' | 'subtotalCents' | 'taxCents' | 'referenceNumber' | 'notes'>

export function expenseHasPayments(expenseId: string) {
  return getExpensePayments().some((payment) => payment.expenseId === expenseId)
}

export function canEditExpenseSafeFields(expense: Expense) {
  if (expense.status === 'void' || expense.status === 'cancelled') return { allowed: false, reason: 'Void or cancelled expenses cannot be edited.' }
  return { allowed: true, reason: '' }
}

export function canCorrectExpenseAmount(expense: Expense, paymentCount = getExpensePayments().filter((payment) => payment.expenseId === expense.id).length) {
  const safe = canEditExpenseSafeFields(expense)
  if (!safe.allowed) return safe
  if (paymentCount > 0) return { allowed: false, reason: 'Amount is locked because this expense already has payment history. Use the void workflow when the financial total is wrong.' }
  return { allowed: true, reason: '' }
}

export function canCorrectExpense(expense: Expense) {
  return canEditExpenseSafeFields(expense)
}

export async function reviseExpense(expenseId: string, patch: ExpenseCorrectionPatch) {
  const current = getExpenses().find((row) => row.id === expenseId)
  if (!current) throw new Error('Expense record not found.')
  const eligibility = canEditExpenseSafeFields(current)
  if (!eligibility.allowed) throw new Error(eligibility.reason)
  const hasPayments = expenseHasPayments(expenseId)
  if (hasPayments) {
    const branchChanged = patch.scope !== current.scope || (patch.branchId ?? '') !== (current.branchId ?? '')
    const amountChanged = patch.subtotalCents !== current.subtotalCents || patch.taxCents !== current.taxCents
    const referenceChanged = (patch.referenceNumber ?? '') !== (current.referenceNumber ?? '')
    if (branchChanged || amountChanged || referenceChanged) {
      throw new Error('This expense already has payment history. Only descriptive fields can be updated; use void with a reason for financial corrections.')
    }
  }
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
