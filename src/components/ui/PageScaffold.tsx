import type { ReactNode } from 'react'
import { Badge } from './Badge'
import { EmptyState } from './EmptyState'

type PageScaffoldProps = {
  title: string
  description: string
  eyebrow?: string
  status?: string
  actions?: ReactNode
  children?: ReactNode
}

export function PageScaffold({
  actions,
  children,
  description,
  eyebrow,
  status,
  title,
}: PageScaffoldProps) {
  return (
    <section className="page-stack premium-page-scaffold">
      <header className="section-header premium-page-header">
        <div className="premium-page-heading">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          {status && <Badge tone="info">{status}</Badge>}
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {actions && <div className="premium-page-actions">{actions}</div>}
      </header>
      {children || (
        <EmptyState
          title={`${title} module`}
          message="No information is available in this workspace yet."
        />
      )}
    </section>
  )
}
