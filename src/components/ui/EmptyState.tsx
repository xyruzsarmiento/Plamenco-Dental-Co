import type { ReactNode } from 'react'

type EmptyStateProps = {
  title: string
  message: string
  action?: ReactNode
}

export function EmptyState({ action, message, title }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-inner">
        <h2>{title}</h2>
        <p>{message}</p>
        {action}
      </div>
    </div>
  )
}
