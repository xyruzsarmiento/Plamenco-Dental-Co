import type { ReactNode } from 'react'
import { Badge } from './Badge'
import { EmptyState } from './EmptyState'

type PageScaffoldProps = {
  title: string
  description: string
  status?: string
  children?: ReactNode
}

export function PageScaffold({ children, description, status = 'Foundation ready', title }: PageScaffoldProps) {
  return (
    <section className="page-stack">
      <div className="section-header">
        <div>
          <Badge tone="info">{status}</Badge>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children || (
        <EmptyState
          title={`${title} module`}
          message="This area is intentionally a placeholder for Part 1. It establishes routing, layout, and design structure without adding module-specific workflows yet."
        />
      )}
    </section>
  )
}
