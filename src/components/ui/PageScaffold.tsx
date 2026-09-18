import type { ReactNode } from 'react'
import { EmptyState } from './EmptyState'
import { PageHero } from './PageHero'

type PageScaffoldProps = {
  heroClassName?: string
  title: string
  description: string
  eyebrow?: string
  icon?: ReactNode
  metric?: ReactNode
  status?: string
  primaryAction?: ReactNode
  secondaryAction?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}

export function PageScaffold({
  actions,
  heroClassName,
  children,
  description,
  eyebrow,
  icon,
  metric,
  primaryAction,
  secondaryAction,
  status,
  title,
}: PageScaffoldProps) {
  return (
    <section className="page-stack premium-page-scaffold">
      <PageHero
        actions={actions}
        className={heroClassName}
        description={description}
        eyebrow={eyebrow}
        icon={icon}
        metric={metric}
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
        status={status}
        title={title}
      />
      {children || (
        <EmptyState
          title={`${title} module`}
          message="No information is available in this workspace yet."
        />
      )}
    </section>
  )
}
