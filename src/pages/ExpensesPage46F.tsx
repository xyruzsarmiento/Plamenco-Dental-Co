import { useState } from 'react'
import { ExpenseActionModal, type ExpenseDialogType } from '../features/expenses/ExpenseActionModal'
import { ExpensesPage } from './ExpensesPage'

const ACTION_LABELS: Record<string, ExpenseDialogType> = {
  'Add Expense': 'add_expense',
  'Petty Cash': 'petty_cash',
  'Add Vendor': 'add_vendor',
  'Recurring': 'recurring',
}

export function ExpensesPage46F() {
  const [dialog, setDialog] = useState<ExpenseDialogType | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div
      key={refreshKey}
      onClickCapture={(event) => {
        const target = event.target as HTMLElement
        const button = target.closest('button')
        if (!button) return
        const action = ACTION_LABELS[button.textContent?.trim() ?? '']
        if (!action) return
        event.preventDefault()
        event.stopPropagation()
        setDialog(action)
      }}
    >
      <ExpensesPage />
      {dialog && (
        <ExpenseActionModal
          type={dialog}
          onClose={() => setDialog(null)}
          onSuccess={() => {
            setDialog(null)
            setRefreshKey((key) => key + 1)
          }}
        />
      )}
    </div>
  )
}
