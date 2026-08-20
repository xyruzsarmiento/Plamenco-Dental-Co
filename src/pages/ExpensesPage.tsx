import { useMemo, useState } from 'react'
import { Ban, Banknote, CheckCircle2, ClipboardCheck, FileUp, History, Plus, ReceiptText, Search, WalletCards } from 'lucide-react'
import { PageScaffold } from '../components/ui/PageScaffold'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Select'
import { usePermissions } from '../features/auth/permissions'
import { getActivePaymentMethods, type PaymentMethod } from '../features/billing/billingStore'
import { getStoredBranches } from '../features/branches/branchStore'
import {
  addExpenseAttachment,
  approveExpense,
  closeCashierSession,
  createExpense,
  createExpenseFromPurchaseReceipt,
  createExpenseVendor,
  createRecurringExpenseTemplate,
  formatExpenseCurrency,
  getCashFlowSummary,
  getCashierSessions,
  getCashMovements,
  getDailyCashReconciliation,
  getExpenseAttachments,
  getExpenseCategories,
  getExpenseDueStatus,
  getExpenseOverview,
  getExpensePayments,
  getExpenses,
  getExpenseVendors,
  getRecurringExpenseTemplates,
  recordExpensePayment,
  recordCashMovement,
  recordPettyCashDisbursement,
  voidExpense,
  openCashierSession,
  type CashMovementType,
  type Expense,
  type ExpenseSourceType,
  type ExpenseStatus,
} from '../features/expenses/expenseStore'
import { getPurchaseReceipts } from '../features/inventory/inventoryStore'

type ExpenseTab = 'ledger' | 'due' | 'vendors' | 'recurring' | 'petty_cash' | 'supplier_bills' | 'cash_disbursements' | 'reconciliation' | 'history'

function branchName(branchId?: string) {
  if (!branchId) return 'Clinic-wide'
  return getStoredBranches().find((branch) => branch.id === branchId)?.name ?? branchId
}

function categoryName(categoryId: string) {
  return getExpenseCategories().find((category) => category.id === categoryId)?.name ?? categoryId
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'paid' || status === 'active') return 'success'
  if (status === 'partially_paid' || status === 'due_soon' || status === 'unpaid' || status === 'draft') return 'warning'
  if (status === 'void' || status === 'overdue' || status === 'cancelled') return 'danger'
  return 'info'
}

function formatDate(value?: string) {
  if (!value) return 'No date'
  return new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ExpensesPage() {
  const permissions = usePermissions()
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState<ExpenseTab>('ledger')
  const [selectedBranchId, setSelectedBranchId] = useState('all')
  const [categoryId, setCategoryId] = useState('all')
  const [status, setStatus] = useState<'all' | ExpenseStatus>('all')
  const [sourceType, setSourceType] = useState<'all' | ExpenseSourceType>('all')
  const [search, setSearch] = useState('')
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null)

  const expenses = useMemo(() => {
    void refreshKey
    return getExpenses()
  }, [refreshKey])
  const payments = useMemo(() => {
    void refreshKey
    return getExpensePayments()
  }, [refreshKey])
  const attachments = useMemo(() => {
    void refreshKey
    return getExpenseAttachments()
  }, [refreshKey])
  const vendors = useMemo(() => {
    void refreshKey
    return getExpenseVendors()
  }, [refreshKey])
  const recurring = useMemo(() => {
    void refreshKey
    return getRecurringExpenseTemplates()
  }, [refreshKey])
  const cashierSessions = useMemo(() => {
    void refreshKey
    return getCashierSessions()
  }, [refreshKey])
  const cashMovements = useMemo(() => {
    void refreshKey
    return getCashMovements()
  }, [refreshKey])
  const cashSummary = useMemo(() => {
    void refreshKey
    const today = new Date().toISOString().slice(0, 10)
    return getCashFlowSummary({ branchId: selectedBranchId === 'all' || selectedBranchId === 'clinic_wide' ? undefined : selectedBranchId, startDate: today, endDate: today })
  }, [refreshKey, selectedBranchId])
  const dailyReconciliation = useMemo(() => {
    void refreshKey
    const today = new Date().toISOString().slice(0, 10)
    const branchId = selectedBranchId === 'all' || selectedBranchId === 'clinic_wide' ? getStoredBranches()[0]?.id ?? 'branch-pulilan' : selectedBranchId
    return getDailyCashReconciliation(branchId, today)
  }, [refreshKey, selectedBranchId])
  const overview = useMemo(() => {
    void refreshKey
    return getExpenseOverview(selectedBranchId === 'all' ? undefined : selectedBranchId)
  }, [refreshKey, selectedBranchId])
  const selectedExpense = selectedExpenseId ? expenses.find((expense) => expense.id === selectedExpenseId) : expenses[0]

  const filteredExpenses = useMemo(() => {
    const query = search.trim().toLowerCase()
    return expenses.filter((expense) => {
      const matchesSearch = !query || [expense.expenseNumber, expense.description, expense.payeeName, expense.referenceNumber ?? ''].some((value) => value.toLowerCase().includes(query))
      const matchesBranch = selectedBranchId === 'all' || expense.branchId === selectedBranchId || (selectedBranchId === 'clinic_wide' && expense.scope === 'clinic_wide')
      const matchesCategory = categoryId === 'all' || expense.categoryId === categoryId
      const matchesStatus = status === 'all' || expense.status === status
      const matchesSource = sourceType === 'all' || expense.sourceType === sourceType
      return matchesSearch && matchesBranch && matchesCategory && matchesStatus && matchesSource
    })
  }, [categoryId, expenses, search, selectedBranchId, sourceType, status])

  function refresh() {
    setRefreshKey((key) => key + 1)
  }

  function chooseBranch() {
    const branch = window.prompt(`Branch ID or clinic_wide\n${getStoredBranches().map((entry) => `${entry.id}: ${entry.name}`).join('\n')}`, 'branch-pulilan')
    return branch || null
  }

  function handleAddExpense() {
    const branch = chooseBranch()
    if (!branch) return
    const amount = Number(window.prompt('Amount in PHP', '0') ?? 0)
    const payeeName = window.prompt('Vendor or payee', '') ?? ''
    const description = window.prompt('Description', '') ?? ''
    createExpense({
      scope: branch === 'clinic_wide' ? 'clinic_wide' : 'branch',
      branchId: branch === 'clinic_wide' ? undefined : branch,
      categoryId: getExpenseCategories()[0]?.id ?? 'miscellaneous',
      payeeName,
      description,
      expenseDate: new Date().toISOString().slice(0, 10),
      dueDate: window.prompt('Due date YYYY-MM-DD', '') ?? undefined,
      subtotalCents: Math.round(amount * 100),
      taxCents: 0,
      sourceType: 'manual',
      notes: window.prompt('Notes', '') ?? '',
      createdBy: 'clinic-user',
    })
    refresh()
  }

  function handleRecordPayment(expense: Expense) {
    const amount = Number(window.prompt('Payment amount in PHP', String(expense.balanceCents / 100)) ?? 0)
    const method = (window.prompt('Method: cash, gcash, maya, bank_transfer, card, other', 'bank_transfer') ?? 'bank_transfer') as PaymentMethod
    recordExpensePayment({
      expenseId: expense.id,
      amountCents: Math.round(amount * 100),
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: method,
      referenceNumber: window.prompt('Reference number', '') ?? undefined,
      paidBy: 'clinic-user',
      notes: '',
    })
    refresh()
  }

  function handleAttach(expense: Expense) {
    const storagePath = window.prompt('Secure storage path, e.g. private/expenses/file.pdf')
    if (!storagePath) return
    addExpenseAttachment({
      expenseId: expense.id,
      fileName: storagePath.split('/').pop() ?? 'attachment',
      documentType: 'receipt',
      storagePath,
      uploadedBy: 'clinic-user',
      description: window.prompt('Attachment description', '') ?? '',
    })
    refresh()
  }

  function handleVoid(expense: Expense) {
    const reason = window.prompt(`Reason for voiding ${expense.expenseNumber}`)
    if (!reason) return
    voidExpense(expense.id, reason, 'clinic-user')
    refresh()
  }

  function handleAddVendor() {
    const name = window.prompt('Vendor name')
    if (!name) return
    createExpenseVendor({ name, contactPerson: '', phone: '', email: '', address: '', notes: '', status: 'active' })
    refresh()
  }

  function handleRecurring() {
    const branch = chooseBranch()
    if (!branch) return
    createRecurringExpenseTemplate({
      name: window.prompt('Template name', 'Monthly bill') ?? 'Monthly bill',
      scope: branch === 'clinic_wide' ? 'clinic_wide' : 'branch',
      branchId: branch === 'clinic_wide' ? undefined : branch,
      categoryId: getExpenseCategories()[0]?.id ?? 'miscellaneous',
      payeeName: window.prompt('Vendor or payee', '') ?? '',
      frequency: 'monthly',
      nextDueDate: window.prompt('Next due date YYYY-MM-DD', new Date().toISOString().slice(0, 10)) ?? new Date().toISOString().slice(0, 10),
      autoCreate: false,
      status: 'active',
      createdBy: 'clinic-user',
    })
    refresh()
  }

  function handleGeneratePurchaseExpense(receiptId: string) {
    createExpenseFromPurchaseReceipt(receiptId)
    refresh()
  }

  function handlePettyCash() {
    const branch = chooseBranch()
    if (!branch || branch === 'clinic_wide') return
    const amount = Number(window.prompt('Petty cash amount in PHP', '0') ?? 0)
    const payeeName = window.prompt('Payee', 'Petty cash') ?? 'Petty cash'
    const description = window.prompt('Purpose', 'Petty cash disbursement') ?? 'Petty cash disbursement'
    recordPettyCashDisbursement({
      branchId: branch,
      amountCents: Math.round(amount * 100),
      paymentDate: new Date().toISOString().slice(0, 10),
      payeeName,
      description,
      recordedBy: 'clinic-user',
      notes: window.prompt('Notes', '') ?? '',
    })
    refresh()
  }

  function handleCashMovement(direction: 'in' | 'out') {
    const branch = chooseBranch()
    if (!branch || branch === 'clinic_wide') return
    const amount = Number(window.prompt(`${direction === 'in' ? 'Cash in' : 'Cash out'} amount in PHP`, '0') ?? 0)
    const reason = window.prompt('Reason')
    if (!reason) return
    recordCashMovement({
      branchId: branch,
      businessDate: new Date().toISOString().slice(0, 10),
      movementType: direction === 'in' ? 'cash_in' : 'cash_out' as CashMovementType,
      direction,
      amountCents: Math.round(amount * 100),
      reason,
      referenceType: 'other',
      recordedBy: 'clinic-user',
    })
    refresh()
  }

  function handleOpenSession() {
    const branch = chooseBranch()
    if (!branch || branch === 'clinic_wide') return
    const opening = Number(window.prompt('Opening cash in PHP', '0') ?? 0)
    openCashierSession({
      branchId: branch,
      businessDate: new Date().toISOString().slice(0, 10),
      openingCashCents: Math.round(opening * 100),
      openedBy: 'clinic-user',
      notes: window.prompt('Opening notes', '') ?? '',
    })
    refresh()
  }

  function handleCloseSession() {
    const openSession = cashierSessions.find((session) => session.status === 'open')
    if (!openSession) return
    const actual = Number(window.prompt(`Actual counted cash for ${branchName(openSession.branchId)} in PHP`, String(openSession.expectedCashCents / 100)) ?? 0)
    closeCashierSession(openSession.id, {
      actualCashCents: Math.round(actual * 100),
      varianceReason: window.prompt('Variance reason, required if different', '') ?? '',
      closedBy: 'clinic-user',
    })
    refresh()
  }

  return (
    <PageScaffold title="Expenses" description="Track branch operating costs, due bills, vendors and purchase-linked expenses.">
      <div className="page-stack">
        <div className="toolbar-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="toolbar-row" style={{ flexWrap: 'wrap' }}>
            {(['ledger', 'due', 'recurring', 'petty_cash', 'supplier_bills', 'cash_disbursements', 'reconciliation', 'history', 'vendors'] as ExpenseTab[]).map((tab) => (
              <button key={tab} type="button" className={`tab-button ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                {tab.replaceAll('_', ' ')}
              </button>
            ))}
          </div>
          <div className="toolbar-row">
            {permissions.can('expenses.create') && <Button icon={<Plus size={16} />} onClick={handleAddExpense}>Add Expense</Button>}
            {permissions.can('expenses.record_payment') && <Button variant="secondary" icon={<Banknote size={16} />} onClick={handlePettyCash}>Petty Cash</Button>}
            {permissions.can('expenses.create') && <Button variant="secondary" icon={<ReceiptText size={16} />} onClick={handleAddVendor}>Add Vendor</Button>}
            {permissions.can('expenses.manage_recurring') && <Button variant="secondary" icon={<WalletCards size={16} />} onClick={handleRecurring}>Recurring</Button>}
          </div>
        </div>

        <div className="metrics-grid">
          <div className="metric-card"><span>Expenses This Month</span><strong>{formatExpenseCurrency(overview.thisMonthCents)}</strong><small>Non-void operating costs</small></div>
          <div className="metric-card"><span>Unpaid Expenses</span><strong>{formatExpenseCurrency(overview.unpaidCents)}</strong><small>Open payable balances</small></div>
          <div className="metric-card"><span>Due Soon</span><strong>{overview.dueSoon}</strong><small>Due within 7 days</small></div>
          <div className="metric-card"><span>Overdue</span><strong>{overview.overdue}</strong><small>Unpaid past due date</small></div>
          <div className="metric-card"><span>Recurring Due</span><strong>{overview.recurringDue}</strong><small>Templates due within 7 days</small></div>
          <div className="metric-card"><span>Petty Cash Used</span><strong>{formatExpenseCurrency(overview.pettyCashUsedCents)}</strong><small>This month</small></div>
          <div className="metric-card"><span>Expected Cash Today</span><strong>{formatExpenseCurrency(dailyReconciliation.expectedCashCents)}</strong><small>Cash payments less cash outflows</small></div>
          <div className="metric-card"><span>Branch Split</span><strong>{formatExpenseCurrency(overview.pulilanCents + overview.plaridelCents)}</strong><small>Pulilan {formatExpenseCurrency(overview.pulilanCents)} · Plaridel {formatExpenseCurrency(overview.plaridelCents)}</small></div>
        </div>

        <div className="filter-panel" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) repeat(4, minmax(140px, 190px))', gap: 12 }}>
          <label className="field">
            <span>Search expenses</span>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-muted)' }} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} style={{ paddingLeft: 36 }} />
            </div>
          </label>
          <Select label="Branch" value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)} options={[{ value: 'all', label: 'All branches' }, { value: 'clinic_wide', label: 'Clinic-wide' }, ...getStoredBranches().map((branch) => ({ value: branch.id, label: branch.name }))]} />
          <Select label="Category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} options={[{ value: 'all', label: 'All categories' }, ...getExpenseCategories().map((category) => ({ value: category.id, label: category.name }))]} />
          <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} options={['all', 'draft', 'unpaid', 'partially_paid', 'paid', 'void', 'cancelled'].map((entry) => ({ value: entry, label: entry.replaceAll('_', ' ') }))} />
          <Select label="Source" value={sourceType} onChange={(event) => setSourceType(event.target.value as typeof sourceType)} options={['all', 'manual', 'purchase_receipt', 'purchase_order', 'recurring', 'other'].map((entry) => ({ value: entry, label: entry.replaceAll('_', ' ') }))} />
        </div>

        {activeTab === 'ledger' && (
          <div className="workspace-grid">
            <section className="workspace-panel">
              <div className="section-header"><div><h3>Expense Ledger</h3><p>{filteredExpenses.length} expenses</p></div></div>
              <div className="workspace-list">
                {filteredExpenses.map((expense) => (
                  <button key={expense.id} type="button" className="workspace-row" onClick={() => setSelectedExpenseId(expense.id)}>
                    <div>
                      <strong>{expense.expenseNumber} - {expense.description}</strong>
                      <span>{formatDate(expense.expenseDate)} - {branchName(expense.branchId)} - {categoryName(expense.categoryId)}</span>
                      <small>{expense.payeeName} - {expense.sourceType.replaceAll('_', ' ')}</small>
                    </div>
                    <div style={{ textAlign: 'right' }}><Badge tone={statusTone(expense.status)}>{expense.status.replaceAll('_', ' ')}</Badge><strong>{formatExpenseCurrency(expense.balanceCents)}</strong></div>
                  </button>
                ))}
                {filteredExpenses.length === 0 && <div className="empty-state-panel">No expenses match the current filters.</div>}
              </div>
            </section>

            <aside className="workspace-panel">
              {selectedExpense ? (
                <>
                  <div className="section-header"><div><h3>{selectedExpense.expenseNumber}</h3><p>{selectedExpense.description}</p></div><Badge tone={statusTone(selectedExpense.status)}>{selectedExpense.status.replaceAll('_', ' ')}</Badge></div>
                  <div className="detail-grid detail-grid-mini">
                    <div className="detail-item"><span>Branch</span><strong>{branchName(selectedExpense.branchId)}</strong></div>
                    <div className="detail-item"><span>Category</span><strong>{categoryName(selectedExpense.categoryId)}</strong></div>
                    <div className="detail-item"><span>Vendor</span><strong>{selectedExpense.payeeName}</strong></div>
                    <div className="detail-item"><span>Total</span><strong>{formatExpenseCurrency(selectedExpense.totalCents)}</strong></div>
                    <div className="detail-item"><span>Paid</span><strong>{formatExpenseCurrency(selectedExpense.amountPaidCents)}</strong></div>
                    <div className="detail-item"><span>Balance</span><strong>{formatExpenseCurrency(selectedExpense.balanceCents)}</strong></div>
                  </div>
                  <div className="workspace-list">
                    {payments.filter((payment) => payment.expenseId === selectedExpense.id).map((payment) => (
                      <div key={payment.id} className="workspace-row"><div><strong>{payment.paymentMethod.replaceAll('_', ' ')}</strong><span>{formatDate(payment.paymentDate)} - {payment.paidBy}</span><small>{payment.referenceNumber || 'No reference'}</small></div><strong>{formatExpenseCurrency(payment.amountCents)}</strong></div>
                    ))}
                    {attachments.filter((attachment) => attachment.expenseId === selectedExpense.id).map((attachment) => (
                      <div key={attachment.id} className="workspace-row"><div><strong>{attachment.fileName}</strong><span>{attachment.documentType} - {attachment.storagePath}</span></div><FileUp size={16} /></div>
                    ))}
                  </div>
                  <div className="toolbar-row">
                    {permissions.can('expenses.record_payment') && selectedExpense.balanceCents > 0 && selectedExpense.status !== 'void' && <Button size="sm" icon={<CheckCircle2 size={14} />} onClick={() => handleRecordPayment(selectedExpense)}>Record Payment</Button>}
                    {permissions.can('expenses.create') && <Button size="sm" variant="secondary" icon={<FileUp size={14} />} onClick={() => handleAttach(selectedExpense)}>Attach</Button>}
                    {permissions.can('expenses.approve') && !selectedExpense.approvedBy && <Button size="sm" variant="secondary" onClick={() => { approveExpense(selectedExpense.id, 'clinic-user'); refresh() }}>Approve</Button>}
                    {permissions.can('expenses.void') && selectedExpense.status !== 'void' && <Button size="sm" variant="danger" icon={<Ban size={14} />} onClick={() => handleVoid(selectedExpense)}>Void</Button>}
                  </div>
                </>
              ) : <div className="empty-state-panel">Select an expense to view details.</div>}
            </aside>
          </div>
        )}

        {activeTab === 'due' && (
          <section className="workspace-panel">
            <div className="section-header"><div><h3>Upcoming Bills</h3><p>Due soon and overdue expenses</p></div></div>
            <div className="workspace-list">
              {expenses.filter((expense) => ['due_soon', 'overdue'].includes(getExpenseDueStatus(expense))).map((expense) => (
                <div key={expense.id} className="workspace-row"><div><strong>{expense.description}</strong><span>{expense.expenseNumber} - due {formatDate(expense.dueDate)}</span><small>{branchName(expense.branchId)} - {expense.payeeName}</small></div><div><Badge tone={statusTone(getExpenseDueStatus(expense))}>{getExpenseDueStatus(expense).replaceAll('_', ' ')}</Badge><strong>{formatExpenseCurrency(expense.balanceCents)}</strong></div></div>
              ))}
              {expenses.filter((expense) => ['due_soon', 'overdue'].includes(getExpenseDueStatus(expense))).length === 0 && <div className="empty-state-panel">No due-soon or overdue expenses.</div>}
            </div>
          </section>
        )}

        {activeTab === 'vendors' && (
          <section className="workspace-panel">
            <div className="section-header"><div><h3>Vendors & Payees</h3><p>{vendors.length} records including inventory suppliers</p></div></div>
            <div className="workspace-list">
              {vendors.map((vendor) => <div key={vendor.id} className="workspace-row"><div><strong>{vendor.name}</strong><span>{vendor.contactPerson || 'No contact'} - {vendor.phone || 'No phone'}</span><small>{vendor.linkedSupplierId ? 'Linked inventory supplier' : 'Expense vendor'}</small></div><Badge tone={statusTone(vendor.status)}>{vendor.status}</Badge></div>)}
              {vendors.length === 0 && <div className="empty-state-panel">No vendors or suppliers yet.</div>}
            </div>
          </section>
        )}

        {activeTab === 'recurring' && (
          <section className="workspace-panel">
            <div className="section-header"><div><h3>Recurring Expense Templates</h3><p>{recurring.length} templates</p></div></div>
            <div className="workspace-list">
              {recurring.map((template) => <div key={template.id} className="workspace-row"><div><strong>{template.name}</strong><span>{branchName(template.branchId)} - {template.frequency}</span><small>Next due {formatDate(template.nextDueDate)} - amount {template.defaultAmountCents ? formatExpenseCurrency(template.defaultAmountCents) : 'requires entry'}</small></div><Badge tone={statusTone(template.status)}>{template.status}</Badge></div>)}
              {recurring.length === 0 && <div className="empty-state-panel">No recurring expense templates yet.</div>}
            </div>
          </section>
        )}

        {activeTab === 'petty_cash' && (
          <section className="workspace-panel">
            <div className="section-header"><div><h3>Petty Cash</h3><p>Cash-paid small disbursements by branch</p></div><Button size="sm" icon={<Banknote size={14} />} onClick={handlePettyCash}>Record Petty Cash</Button></div>
            <div className="workspace-list">
              {expenses.filter((expense) => expense.categoryId === 'petty_cash').map((expense) => (
                <div key={expense.id} className="workspace-row"><div><strong>{expense.description}</strong><span>{expense.expenseNumber} - {branchName(expense.branchId)}</span><small>{formatDate(expense.expenseDate)} - {expense.payeeName}</small></div><div><Badge tone={statusTone(expense.status)}>{expense.status.replaceAll('_', ' ')}</Badge><strong>{formatExpenseCurrency(expense.totalCents)}</strong></div></div>
              ))}
              {expenses.filter((expense) => expense.categoryId === 'petty_cash').length === 0 && <div className="empty-state-panel">No petty cash disbursements yet.</div>}
            </div>
          </section>
        )}

        {activeTab === 'supplier_bills' && (
          <section className="workspace-panel">
            <div className="section-header"><div><h3>Supplier Bills</h3><p>Inventory receipts become one linked expense each</p></div></div>
            <div className="workspace-list">
              {getPurchaseReceipts().map((receipt) => {
                const linked = expenses.find((expense) => expense.sourceType === 'purchase_receipt' && expense.sourceId === receipt.id)
                return (
                  <div key={receipt.id} className="workspace-row">
                    <div><strong>{receipt.receiptNumber}</strong><span>{branchName(receipt.branchId)} - {formatDate(receipt.receivedDate)}</span><small>{formatExpenseCurrency(receipt.totalCostCents)}</small></div>
                    {linked ? <div style={{ textAlign: 'right' }}><Badge tone={statusTone(linked.status)}>{linked.expenseNumber}</Badge><strong>{formatExpenseCurrency(linked.balanceCents)}</strong></div> : permissions.can('expenses.create') && <Button size="sm" onClick={() => handleGeneratePurchaseExpense(receipt.id)}>Create Expense</Button>}
                  </div>
                )
              })}
              {getPurchaseReceipts().length === 0 && <div className="empty-state-panel">No purchase receipts available to link.</div>}
            </div>
          </section>
        )}

        {activeTab === 'cash_disbursements' && (
          <section className="workspace-panel">
            <div className="section-header">
              <div><h3>Cash Disbursements</h3><p>Standalone cash movements outside patient payments and expense payments</p></div>
              <div className="toolbar-row"><Button size="sm" icon={<Banknote size={14} />} onClick={() => handleCashMovement('in')}>Cash In</Button><Button size="sm" variant="secondary" onClick={() => handleCashMovement('out')}>Cash Out</Button></div>
            </div>
            <div className="metrics-grid">
              <div className="metric-card"><span>Patient Inflow Today</span><strong>{formatExpenseCurrency(cashSummary.patientInflowCents)}</strong><small>All completed patient payments</small></div>
              <div className="metric-card"><span>Expense Outflow Today</span><strong>{formatExpenseCurrency(cashSummary.expenseOutflowCents)}</strong><small>Recorded expense payments</small></div>
              <div className="metric-card"><span>Refunds Today</span><strong>{formatExpenseCurrency(cashSummary.refundOutflowCents)}</strong><small>Completed refunds</small></div>
              <div className="metric-card"><span>Discounts Today</span><strong>{formatExpenseCurrency(cashSummary.discountsCents)}</strong><small>Invoice discounts</small></div>
              <div className="metric-card"><span>Net Cash Flow</span><strong>{formatExpenseCurrency(cashSummary.netCashFlowCents)}</strong><small>Includes standalone cash movements</small></div>
            </div>
            <div className="workspace-list">
              {cashMovements.map((movement) => (
                <div key={movement.id} className="workspace-row"><div><strong>{movement.movementNumber} - {movement.reason}</strong><span>{formatDate(movement.businessDate)} - {branchName(movement.branchId)}</span><small>{movement.movementType.replaceAll('_', ' ')} - {movement.recordedBy}</small></div><div><Badge tone={movement.direction === 'in' ? 'success' : 'warning'}>{movement.direction}</Badge><strong>{formatExpenseCurrency(movement.amountCents)}</strong></div></div>
              ))}
              {cashMovements.length === 0 && <div className="empty-state-panel">No standalone cash movements yet.</div>}
            </div>
          </section>
        )}

        {activeTab === 'reconciliation' && (
          <section className="workspace-panel">
            <div className="section-header">
              <div><h3>Daily Cash Reconciliation</h3><p>Expected versus actual cash for branch closing</p></div>
              <div className="toolbar-row"><Button size="sm" icon={<ClipboardCheck size={14} />} onClick={handleOpenSession}>Open Session</Button><Button size="sm" variant="secondary" onClick={handleCloseSession}>Close Open Session</Button></div>
            </div>
            <div className="detail-grid detail-grid-mini">
              <div className="detail-item"><span>Opening Cash</span><strong>{formatExpenseCurrency(dailyReconciliation.openingCashCents)}</strong></div>
              <div className="detail-item"><span>Expected Cash</span><strong>{formatExpenseCurrency(dailyReconciliation.expectedCashCents)}</strong></div>
              <div className="detail-item"><span>Actual Cash</span><strong>{dailyReconciliation.actualCashCents === undefined ? 'Not counted' : formatExpenseCurrency(dailyReconciliation.actualCashCents)}</strong></div>
              <div className="detail-item"><span>Variance</span><strong>{dailyReconciliation.varianceCents === undefined ? 'Open' : formatExpenseCurrency(dailyReconciliation.varianceCents)}</strong></div>
            </div>
            <div className="workspace-list">
              {cashierSessions.map((session) => (
                <div key={session.id} className="workspace-row"><div><strong>{session.sessionNumber} - {branchName(session.branchId)}</strong><span>{formatDate(session.businessDate)} - opened by {session.openedBy}</span><small>{session.varianceReason || 'No variance reason recorded'}</small></div><div><Badge tone={session.status === 'closed' ? 'success' : 'warning'}>{session.status}</Badge><strong>{formatExpenseCurrency(session.expectedCashCents)}</strong></div></div>
              ))}
              {cashierSessions.length === 0 && <div className="empty-state-panel">No cashier sessions opened yet.</div>}
            </div>
          </section>
        )}

        {activeTab === 'history' && (
          <section className="workspace-panel">
            <div className="section-header"><div><h3>Financial History</h3><p>Expenses, payments, and cash events in date order</p></div><History size={18} /></div>
            <div className="workspace-list">
              {[...expenses.map((expense) => ({ id: expense.id, date: expense.expenseDate, label: expense.expenseNumber, detail: `${expense.payeeName} - ${branchName(expense.branchId)}`, amountCents: expense.totalCents, tone: statusTone(expense.status), status: expense.status })),
                ...payments.map((payment) => ({ id: payment.id, date: payment.paymentDate, label: getActivePaymentMethods().find((method) => method.id === payment.paymentMethod)?.label ?? payment.paymentMethod, detail: `Expense payment - ${payment.paidBy}`, amountCents: payment.amountCents, tone: 'success' as const, status: 'paid' })),
                ...cashMovements.map((movement) => ({ id: movement.id, date: movement.businessDate, label: movement.movementNumber, detail: `${movement.reason} - ${branchName(movement.branchId)}`, amountCents: movement.amountCents, tone: movement.direction === 'in' ? 'success' as const : 'warning' as const, status: movement.direction }))].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((entry) => (
                <div key={entry.id} className="workspace-row"><div><strong>{entry.label}</strong><span>{formatDate(entry.date)} - {entry.detail}</span></div><div><Badge tone={entry.tone}>{entry.status.replaceAll('_', ' ')}</Badge><strong>{formatExpenseCurrency(entry.amountCents)}</strong></div></div>
              ))}
            </div>
          </section>
        )}

        <div className="inline-alert info">
          Payment methods come from the billing configuration: {getActivePaymentMethods().map((method) => method.label).join(', ') || 'none configured'}.
        </div>
      </div>
    </PageScaffold>
  )
}
