import { useMemo, useState } from 'react'
import {
  Banknote,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Landmark,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Store,
  WalletCards,
} from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { PageScaffold } from '../components/ui/PageScaffold'
import { usePermissions } from '../features/auth/permissions'
import { getStoredBranches } from '../features/branches/branchStore'
import { ExpenseActionModal, type ExpenseDialogType } from '../features/expenses/ExpenseActionModal'
import {
  createExpenseFromPurchaseReceipt,
  formatExpenseCurrency,
  getExpenseCategories,
  getExpenseDueStatus,
  getExpenseOverview,
  getExpensePayments,
  getExpenses,
  getExpenseVendors,
  getRecurringExpenseTemplates,
  type Expense,
  type ExpenseSourceType,
  type ExpenseStatus,
} from '../features/expenses/expenseStore'
import { getPurchaseReceipts } from '../features/inventory/inventoryStore'

type ExpenseTab = 'ledger' | 'due' | 'recurring' | 'petty_cash' | 'supplier_bills' | 'vendors'

const tabs: Array<{ key: ExpenseTab; label: string }> = [
  { key: 'ledger', label: 'Expense Ledger' },
  { key: 'due', label: 'Due & Payables' },
  { key: 'recurring', label: 'Recurring' },
  { key: 'petty_cash', label: 'Petty Cash' },
  { key: 'supplier_bills', label: 'Supplier Bills' },
  { key: 'vendors', label: 'Vendors' },
]

function branchName(branchId?: string) {
  if (!branchId) return 'Clinic-wide'
  return getStoredBranches().find((branch) => branch.id === branchId)?.name ?? branchId
}

function categoryName(categoryId: string) {
  return getExpenseCategories().find((category) => category.id === categoryId)?.name ?? categoryId
}

function formatDate(value?: string) {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'paid' || status === 'active') return 'success'
  if (['partially_paid', 'due_soon', 'unpaid', 'draft'].includes(status)) return 'warning'
  if (['void', 'overdue', 'cancelled'].includes(status)) return 'danger'
  return 'info'
}

function expenseInitials(expense: Expense) {
  return (expense.payeeName || expense.description || 'EX').split(' ').slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase()
}

export function ExpensesPageV23() {
  const permissions = usePermissions()
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState<ExpenseTab>('ledger')
  const [selectedBranchId, setSelectedBranchId] = useState('all')
  const [categoryId, setCategoryId] = useState('all')
  const [status, setStatus] = useState<'all' | ExpenseStatus>('all')
  const [sourceType, setSourceType] = useState<'all' | ExpenseSourceType>('all')
  const [search, setSearch] = useState('')
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<ExpenseDialogType | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const branches = useMemo(() => { void refreshKey; return getStoredBranches() }, [refreshKey])
  const expenses = useMemo(() => { void refreshKey; return getExpenses() }, [refreshKey])
  const payments = useMemo(() => { void refreshKey; return getExpensePayments() }, [refreshKey])
  const vendors = useMemo(() => { void refreshKey; return getExpenseVendors() }, [refreshKey])
  const recurring = useMemo(() => { void refreshKey; return getRecurringExpenseTemplates() }, [refreshKey])
  const purchaseReceipts = useMemo(() => { void refreshKey; return getPurchaseReceipts() }, [refreshKey])
  const overview = useMemo(() => { void refreshKey; return getExpenseOverview(selectedBranchId === 'all' ? undefined : selectedBranchId) }, [refreshKey, selectedBranchId])

  const selectedExpense = selectedExpenseId
    ? expenses.find((expense) => expense.id === selectedExpenseId) ?? null
    : expenses[0] ?? null

  const filteredExpenses = useMemo(() => {
    const query = search.trim().toLowerCase()
    return expenses.filter((expense) => {
      const matchesSearch = !query || [expense.expenseNumber, expense.description, expense.payeeName, expense.referenceNumber ?? ''].join(' ').toLowerCase().includes(query)
      const matchesBranch = selectedBranchId === 'all' || expense.branchId === selectedBranchId || (selectedBranchId === 'clinic_wide' && expense.scope === 'clinic_wide')
      const matchesCategory = categoryId === 'all' || expense.categoryId === categoryId
      const matchesStatus = status === 'all' || expense.status === status
      const matchesSource = sourceType === 'all' || expense.sourceType === sourceType
      return matchesSearch && matchesBranch && matchesCategory && matchesStatus && matchesSource
    })
  }, [categoryId, expenses, search, selectedBranchId, sourceType, status])

  const dueExpenses = useMemo(() => expenses.filter((expense) => ['due_soon', 'overdue'].includes(getExpenseDueStatus(expense))), [expenses])
  const pettyCashExpenses = useMemo(() => expenses.filter((expense) => expense.categoryId === 'petty_cash'), [expenses])
  const paidThisMonth = useMemo(() => expenses.reduce((total, expense) => total + expense.amountPaidCents, 0), [expenses])

  function refresh(message?: string) {
    setRefreshKey((key) => key + 1)
    setActionError(null)
    if (message) setActionMessage(message)
  }

  function openDialog(type: ExpenseDialogType) {
    setActionMessage(null)
    setActionError(null)
    setDialog(type)
  }

  function createSupplierExpense(receiptId: string) {
    try {
      const expense = createExpenseFromPurchaseReceipt(receiptId)
      refresh(`${expense.expenseNumber} created from the purchase receipt.`)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Unable to create an expense from this purchase receipt.')
    }
  }

  return (
    <PageScaffold title="Expenses" description="Track branch operating costs, payables, petty cash, vendors, and recurring obligations.">
      <div className="expenses-v23">
        <section className="expenses-v23-hero">
          <div className="expenses-v23-hero-copy">
            <span className="expenses-v23-kicker">Finance operations</span>
            <h2>Expense control center</h2>
            <p>Manage operating costs and payable workflows from actual clinic records, with branch-aware visibility and truthful payment states.</p>
          </div>
          <div className="expenses-v23-actions">
            {permissions.can('expenses.create') && <Button icon={<Plus size={16} />} onClick={() => openDialog('add_expense')}>Add Expense</Button>}
            {permissions.can('expenses.record_payment') && <Button variant="secondary" icon={<Banknote size={16} />} onClick={() => openDialog('petty_cash')}>Small Cash Purchase</Button>}
            {permissions.can('expenses.create') && <Button variant="secondary" icon={<Store size={16} />} onClick={() => openDialog('add_vendor')}>Add Vendor</Button>}
            {permissions.can('expenses.manage_recurring') && <Button variant="secondary" icon={<WalletCards size={16} />} onClick={() => openDialog('recurring')}>Recurring</Button>}
          </div>
        </section>

        <section className="expenses-v23-metrics" aria-label="Expense overview">
          <article><span>This month</span><strong>{formatExpenseCurrency(overview.thisMonthCents)}</strong><small>Non-void operating costs</small><i><ReceiptText size={17} /></i></article>
          <article><span>Open payables</span><strong>{formatExpenseCurrency(overview.unpaidCents)}</strong><small>Outstanding balances</small><i><CircleDollarSign size={17} /></i></article>
          <article><span>Due soon</span><strong>{overview.dueSoon}</strong><small>Due within seven days</small><i><CalendarClock size={17} /></i></article>
          <article><span>Overdue</span><strong>{overview.overdue}</strong><small>Past recorded due date</small><i><FileText size={17} /></i></article>
          <article><span>Recurring due</span><strong>{overview.recurringDue}</strong><small>Templates due soon</small><i><RefreshCw size={17} /></i></article>
          <article><span>Petty cash</span><strong>{formatExpenseCurrency(overview.pettyCashUsedCents)}</strong><small>Used this month</small><i><Banknote size={17} /></i></article>
          <article><span>Paid against expenses</span><strong>{formatExpenseCurrency(paidThisMonth)}</strong><small>Recorded expense payments</small><i><Landmark size={17} /></i></article>
          <article><span>Branch total</span><strong>{formatExpenseCurrency(overview.pulilanCents + overview.plaridelCents)}</strong><small>Pulilan + Plaridel</small><i><Building2 size={17} /></i></article>
        </section>

        <section className="expenses-v23-command">
          <div className="expenses-v23-tabs" role="tablist" aria-label="Expense workspace sections">
            {tabs.map((tab) => (
              <button key={tab.key} type="button" className={activeTab === tab.key ? 'is-active' : ''} onClick={() => setActiveTab(tab.key)}>
                {tab.label}
                <span>{tab.key === 'ledger' ? expenses.length : tab.key === 'due' ? dueExpenses.length : tab.key === 'recurring' ? recurring.length : tab.key === 'petty_cash' ? pettyCashExpenses.length : tab.key === 'supplier_bills' ? purchaseReceipts.length : vendors.length}</span>
              </button>
            ))}
          </div>
          <div className="expenses-v23-filters">
            <label className="expenses-v23-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search expense, payee, reference" /></label>
            <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)} aria-label="Filter by branch">
              <option value="all">All branches</option><option value="clinic_wide">Clinic-wide</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} aria-label="Filter by category">
              <option value="all">All categories</option>{getExpenseCategories().map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="Filter by status">
              {['all', 'draft', 'unpaid', 'partially_paid', 'paid', 'void', 'cancelled'].map((entry) => <option key={entry} value={entry}>{entry.replaceAll('_', ' ')}</option>)}
            </select>
            <select value={sourceType} onChange={(event) => setSourceType(event.target.value as typeof sourceType)} aria-label="Filter by source">
              {['all', 'manual', 'purchase_receipt', 'purchase_order', 'recurring', 'other'].map((entry) => <option key={entry} value={entry}>{entry.replaceAll('_', ' ')}</option>)}
            </select>
          </div>
        </section>

        {actionError && <div className="expenses-v23-alert is-error" role="alert">{actionError}</div>}
        {actionMessage && <div className="expenses-v23-alert is-success" role="status">{actionMessage}</div>}

        {activeTab === 'ledger' && (
          <div className="expenses-v23-workspace">
            <section className="expenses-v23-list-panel">
              <header><div><span>Expense ledger</span><h3>{filteredExpenses.length} records</h3></div><small>Current filters</small></header>
              {filteredExpenses.length === 0 ? (
                <div className="expenses-v23-empty"><ReceiptText size={30} /><h3>No expenses in this view</h3><p>Create an expense or adjust the current filters.</p></div>
              ) : (
                <div className="expenses-v23-list">
                  {filteredExpenses.map((expense) => (
                    <button key={expense.id} type="button" className={`expenses-v23-row ${selectedExpense?.id === expense.id ? 'is-selected' : ''}`} onClick={() => setSelectedExpenseId(expense.id)}>
                      <span className="expenses-v23-avatar">{expenseInitials(expense)}</span>
                      <span className="expenses-v23-row-main"><strong>{expense.description}</strong><span>{expense.expenseNumber} · {expense.payeeName}</span><small>{formatDate(expense.expenseDate)} · {branchName(expense.branchId)} · {categoryName(expense.categoryId)}</small></span>
                      <span className="expenses-v23-row-end"><Badge tone={statusTone(expense.status)}>{expense.status.replaceAll('_', ' ')}</Badge><strong>{formatExpenseCurrency(expense.balanceCents)}</strong><ChevronRight size={16} /></span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <aside className="expenses-v23-detail-panel">
              {!selectedExpense ? <div className="expenses-v23-empty"><CircleDollarSign size={30} /><h3>Select an expense</h3><p>Choose a ledger record to review payable details.</p></div> : (
                <div className="expenses-v23-detail-stack">
                  <header className="expenses-v23-detail-head"><div><span>Payable record</span><h3>{selectedExpense.expenseNumber}</h3><p>{selectedExpense.description}</p></div><Badge tone={statusTone(selectedExpense.status)}>{selectedExpense.status.replaceAll('_', ' ')}</Badge></header>
                  <section className="expenses-v23-detail-metrics">
                    <article><span>Total</span><strong>{formatExpenseCurrency(selectedExpense.totalCents)}</strong></article>
                    <article><span>Paid</span><strong>{formatExpenseCurrency(selectedExpense.amountPaidCents)}</strong></article>
                    <article><span>Balance</span><strong>{formatExpenseCurrency(selectedExpense.balanceCents)}</strong></article>
                  </section>
                  <section className="expenses-v23-info-grid">
                    <article><span>Payee</span><strong>{selectedExpense.payeeName}</strong></article>
                    <article><span>Branch</span><strong>{branchName(selectedExpense.branchId)}</strong></article>
                    <article><span>Category</span><strong>{categoryName(selectedExpense.categoryId)}</strong></article>
                    <article><span>Expense date</span><strong>{formatDate(selectedExpense.expenseDate)}</strong></article>
                    <article><span>Due date</span><strong>{formatDate(selectedExpense.dueDate)}</strong></article>
                    <article><span>Source</span><strong>{selectedExpense.sourceType.replaceAll('_', ' ')}</strong></article>
                  </section>
                  <section className="expenses-v23-payment-history">
                    <header><div><span>Payment history</span><h4>Recorded payments</h4></div><b>{payments.filter((payment) => payment.expenseId === selectedExpense.id).length}</b></header>
                    {payments.filter((payment) => payment.expenseId === selectedExpense.id).length === 0 ? <p>No expense payments recorded yet.</p> : payments.filter((payment) => payment.expenseId === selectedExpense.id).map((payment) => <div key={payment.id}><span><strong>{payment.paymentMethod.replaceAll('_', ' ')}</strong><small>{formatDate(payment.paymentDate)} · {payment.paidBy}</small></span><b>{formatExpenseCurrency(payment.amountCents)}</b></div>)}
                  </section>
                </div>
              )}
            </aside>
          </div>
        )}

        {activeTab === 'due' && <section className="expenses-v23-section"><header><div><span>Payables watchlist</span><h3>Due & overdue expenses</h3></div><b>{dueExpenses.length}</b></header><div className="expenses-v23-card-grid">{dueExpenses.map((expense) => <article key={expense.id} className="expenses-v23-mini-card"><div><Badge tone={statusTone(getExpenseDueStatus(expense))}>{getExpenseDueStatus(expense).replaceAll('_', ' ')}</Badge><span>{expense.expenseNumber}</span></div><h4>{expense.description}</h4><p>{expense.payeeName} · {branchName(expense.branchId)}</p><footer><span>Due {formatDate(expense.dueDate)}</span><strong>{formatExpenseCurrency(expense.balanceCents)}</strong></footer></article>)}{dueExpenses.length === 0 && <div className="expenses-v23-empty is-wide"><CalendarClock size={28} /><h3>No due-soon or overdue expenses</h3></div>}</div></section>}

        {activeTab === 'recurring' && <section className="expenses-v23-section"><header><div><span>Recurring commitments</span><h3>Expense templates</h3></div>{permissions.can('expenses.manage_recurring') && <Button size="sm" onClick={() => openDialog('recurring')}>New recurring expense</Button>}</header><div className="expenses-v23-card-grid">{recurring.map((template) => <article key={template.id} className="expenses-v23-mini-card"><div><Badge tone={statusTone(template.status)}>{template.status}</Badge><span>{template.frequency}</span></div><h4>{template.name}</h4><p>{template.payeeName} · {branchName(template.branchId)}</p><footer><span>Next {formatDate(template.nextDueDate)}</span><strong>{template.defaultAmountCents ? formatExpenseCurrency(template.defaultAmountCents) : 'Variable'}</strong></footer></article>)}{recurring.length === 0 && <div className="expenses-v23-empty is-wide"><RefreshCw size={28} /><h3>No recurring templates yet</h3></div>}</div></section>}

        {activeTab === 'petty_cash' && <section className="expenses-v23-section"><header><div><span>Branch cash operations</span><h3>Petty cash disbursements</h3></div>{permissions.can('expenses.record_payment') && <Button size="sm" onClick={() => openDialog('petty_cash')}>Record petty cash</Button>}</header><div className="expenses-v23-card-grid">{pettyCashExpenses.map((expense) => <article key={expense.id} className="expenses-v23-mini-card"><div><Badge tone={statusTone(expense.status)}>{expense.status.replaceAll('_', ' ')}</Badge><span>{expense.expenseNumber}</span></div><h4>{expense.description}</h4><p>{expense.payeeName} · {branchName(expense.branchId)}</p><footer><span>{formatDate(expense.expenseDate)}</span><strong>{formatExpenseCurrency(expense.totalCents)}</strong></footer></article>)}{pettyCashExpenses.length === 0 && <div className="expenses-v23-empty is-wide"><Banknote size={28} /><h3>No petty cash disbursements yet</h3></div>}</div></section>}

        {activeTab === 'supplier_bills' && <section className="expenses-v23-section"><header><div><span>Procurement handoff</span><h3>Supplier bills</h3></div><b>{purchaseReceipts.length}</b></header><div className="expenses-v23-card-grid">{purchaseReceipts.map((receipt) => { const linked = expenses.find((expense) => expense.sourceType === 'purchase_receipt' && expense.sourceId === receipt.id); return <article key={receipt.id} className="expenses-v23-mini-card"><div>{linked ? <Badge tone={statusTone(linked.status)}>{linked.expenseNumber}</Badge> : <Badge tone="info">Not linked</Badge>}<span>{receipt.receiptNumber}</span></div><h4>{branchName(receipt.branchId)}</h4><p>Received {formatDate(receipt.receivedDate)}</p><footer><strong>{formatExpenseCurrency(receipt.totalCostCents)}</strong>{!linked && permissions.can('expenses.create') && <Button size="sm" onClick={() => createSupplierExpense(receipt.id)}>Create expense</Button>}</footer></article>})}{purchaseReceipts.length === 0 && <div className="expenses-v23-empty is-wide"><FileText size={28} /><h3>No purchase receipts available</h3></div>}</div></section>}

        {activeTab === 'vendors' && <section className="expenses-v23-section"><header><div><span>Payee directory</span><h3>Vendors & suppliers</h3></div>{permissions.can('expenses.create') && <Button size="sm" onClick={() => openDialog('add_vendor')}>Add vendor</Button>}</header><div className="expenses-v23-card-grid">{vendors.map((vendor) => <article key={vendor.id} className="expenses-v23-vendor-card"><span className="expenses-v23-avatar">{vendor.name.split(' ').slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase()}</span><div><div><h4>{vendor.name}</h4><Badge tone={statusTone(vendor.status)}>{vendor.status}</Badge></div><p>{vendor.contactPerson || 'No contact person'} · {vendor.phone || 'No phone'}</p><small>{vendor.email || vendor.address || 'No additional contact details'}</small></div></article>)}{vendors.length === 0 && <div className="expenses-v23-empty is-wide"><Store size={28} /><h3>No vendors yet</h3></div>}</div></section>}
      </div>

      {dialog && <ExpenseActionModal type={dialog} preferredBranchId={selectedBranchId} onClose={() => setDialog(null)} onSuccess={() => { setDialog(null); refresh() }} />}
    </PageScaffold>
  )
}
