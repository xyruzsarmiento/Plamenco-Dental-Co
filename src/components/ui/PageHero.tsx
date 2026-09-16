import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { Badge } from './Badge'

type PageHeroProps = {
  title: string
  description: string
  eyebrow?: string
  icon?: ReactNode
  metric?: ReactNode
  status?: string
  primaryAction?: ReactNode
  secondaryAction?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHero({
  actions,
  className = '',
  description,
  eyebrow,
  icon,
  metric,
  primaryAction,
  secondaryAction,
  status,
  title,
}: PageHeroProps) {
  const hasActionContent = Boolean(actions || primaryAction || secondaryAction)
  const actionContent = actions ?? (
    <>
      {secondaryAction}
      {primaryAction}
    </>
  )

  return (
    <header className={`portal-page-hero premium-page-header ${className}`.trim()}>
      <div className="portal-page-hero-copy">
        <span className="portal-page-hero-icon" aria-hidden="true">{icon ?? <Sparkles size={21} />}</span>
        <div className="portal-page-hero-text">
          <div className="portal-page-hero-meta">
            {eyebrow && <p className="eyebrow"><Sparkles size={11} aria-hidden="true" />{eyebrow}</p>}
            {status && <Badge tone="info">{status}</Badge>}
          </div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {(metric || hasActionContent) && (
        <div className="portal-page-hero-actions">
          {metric && <div className="portal-page-hero-metric">{metric}</div>}
          {actionContent}
        </div>
      )}
    </header>
  )
}
