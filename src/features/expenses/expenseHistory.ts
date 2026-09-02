import { supabase } from '../../lib/supabase'
import type { Expense, ExpensePayment } from './expenseStore'
import { mapExpense, mapPayment } from './expensePersistence'

export type ExpenseHistoryScope =
  | { mode: 'branch'; branchId: string }
  | { mode: 'all'; authorizedBranchIds: string[] }

export type ExpenseHistoryData = {
  expenses: Expense[]
  payments: ExpensePayment[]
  trend: Array<{ date: string; expensesCents: number }>
  source: 'supabase' | 'local'
}

function isExpenseInScope(expense: Expense, scope: ExpenseHistoryScope) {
  if (scope.mode === 'branch') return expense.scope === 'branch' && expense.branchId === scope.branchId
  return expense.scope === 'clinic_wide' || scope.authorizedBranchIds.includes(expense.branchId ?? '')
}

function daysBetween(start: string, end: string) {
  const startTime = new Date(`${start}T00:00:00+08:00`).getTime()
  const endTime = new Date(`${end}T00:00:00+08:00`).getTime()
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return 0
  return Math.max(0, Math.round((endTime - startTime) / 86_400_000))
}

function trendKey(value: string, monthly: boolean) {
  return monthly ? value.slice(0, 7) : value
}

function trendLabelKey(key: string, monthly: boolean) {
  if (!monthly) return key
  return `${key}-01`
}

function nextTrendKey(key: string, monthly: boolean) {
  if (monthly) {
    const [year = 0, month = 1] = key.split('-').map(Number)
    const nextMonth = month >= 12 ? 1 : month + 1
    const nextYear = month >= 12 ? year + 1 : year
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}`
  }

  const [year = 0, month = 1, day = 1] = key.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}

export function buildExpenseTrend(expenses: Expense[], start: string, end: string) {
  const monthly = daysBetween(start, end) > 92
  const totals = new Map<string, number>()
  for (const expense of expenses) {
    if (expense.status === 'void' || expense.status === 'cancelled') continue
    const key = trendKey(expense.expenseDate, monthly)
    totals.set(key, (totals.get(key) ?? 0) + expense.totalCents)
  }

  const rows: Array<{ date: string; expensesCents: number }> = []
  let key = monthly ? start.slice(0, 7) : start
  const limit = monthly ? end.slice(0, 7) : end
  while (key <= limit) {
    rows.push({ date: trendLabelKey(key, monthly), expensesCents: totals.get(key) ?? 0 })
    key = nextTrendKey(key, monthly)
  }
  return rows
}

async function queryExpensesForScope(start: string, end: string, scope: ExpenseHistoryScope) {
  if (!supabase) throw new Error('Clinic database is not configured.')
  if (scope.mode === 'branch') {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('scope', 'branch')
      .eq('branch_id', scope.branchId)
      .gte('expense_date', start)
      .lte('expense_date', end)
      .order('expense_date', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []).map((row) => mapExpense(row as Record<string, any>))
  }

  const [branchRows, clinicRows] = await Promise.all([
    scope.authorizedBranchIds.length
      ? supabase.from('expenses').select('*').eq('scope', 'branch').in('branch_id', scope.authorizedBranchIds).gte('expense_date', start).lte('expense_date', end).order('expense_date', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase.from('expenses').select('*').eq('scope', 'clinic_wide').gte('expense_date', start).lte('expense_date', end).order('expense_date', { ascending: false }),
  ])
  const firstError = branchRows.error ?? clinicRows.error
  if (firstError) throw new Error(firstError.message)
  return [...(branchRows.data ?? []), ...(clinicRows.data ?? [])]
    .map((row) => mapExpense(row as Record<string, any>))
    .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate))
}

export async function fetchExpenseHistory(start: string, end: string, scope: ExpenseHistoryScope): Promise<ExpenseHistoryData> {
  if (!supabase) throw new Error('Clinic database is not configured. Expense history cannot be loaded from browser storage.')

  const expenses = await queryExpensesForScope(start, end, scope)

  const { data: paymentRows, error: paymentError } = await supabase
    .from('expense_payments')
    .select('*')
    .gte('payment_date', start)
    .lte('payment_date', end)
    .order('payment_date', { ascending: false })
  if (paymentError) throw new Error(paymentError.message)

  const paymentsInRange = (paymentRows ?? []).map((row) => mapPayment(row as Record<string, any>))
  const paymentExpenseIds = [...new Set(paymentsInRange.map((payment) => payment.expenseId))]
  let paymentExpenses: Expense[] = []
  if (paymentExpenseIds.length) {
    const { data: linkedExpenseRows, error: linkedError } = await supabase.from('expenses').select('*').in('id', paymentExpenseIds)
    if (linkedError) throw new Error(linkedError.message)
    paymentExpenses = (linkedExpenseRows ?? []).map((row) => mapExpense(row as Record<string, any>))
  }
  const expenseById = new Map([...expenses, ...paymentExpenses].map((expense) => [expense.id, expense]))
  const payments = paymentsInRange.filter((payment) => {
    const expense = expenseById.get(payment.expenseId)
    return Boolean(expense && isExpenseInScope(expense, scope))
  })

  return { expenses, payments, trend: buildExpenseTrend(expenses, start, end), source: 'supabase' }
}
