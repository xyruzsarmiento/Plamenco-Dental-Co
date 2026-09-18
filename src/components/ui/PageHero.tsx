import type { ReactNode } from 'react'
import {
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Pill,
  ReceiptText,
  Settings2,
  ShieldCheck,
  Stethoscope,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import { Badge } from './Badge'

type PageHeroProps = {
  title: string
  description: string
  eyebrow?: string
  eyebrowIcon?: ReactNode
  icon?: ReactNode
  metric?: ReactNode
  status?: string
  primaryAction?: ReactNode
  secondaryAction?: ReactNode
  actions?: ReactNode
  className?: string
}

function defaultPageIcon(title: string) {
  const normalized = title.trim().toLowerCase()
  if (normalized.includes('appointment')) return <CalendarDays size={21} />
  if (normalized.includes('patient')) return <UsersRound size={21} />
  if (normalized.includes('dental record') || normalized.includes('document')) return <FileText size={21} />
  if (normalized.includes('treatment plan')) return <ClipboardList size={21} />
  if (normalized.includes('treatment') || normalized.includes('service') || normalized.includes('dentist')) return <Stethoscope size={21} />
  if (normalized.includes('recall') || normalized.includes('follow-up')) return <HeartPulse size={21} />
  if (normalized.includes('prescription')) return <Pill size={21} />
  if (normalized.includes('billing') || normalized.includes('payment')) return <ReceiptText size={21} />
  if (normalized.includes('inventory')) return <Boxes size={21} />
  if (normalized.includes('expense')) return <WalletCards size={21} />
  if (normalized.includes('report') || normalized.includes('analytic')) return <BarChart3 size={21} />
  if (normalized.includes('team') || normalized.includes('access') || normalized.includes('system admin')) return <ShieldCheck size={21} />
  if (normalized.includes('branch')) return <Building2 size={21} />
  if (normalized.includes('notification')) return <Bell size={21} />
  if (normalized.includes('setting')) return <Settings2 size={21} />
  return <LayoutDashboard size={21} />
}

export function PageHero({
  actions,
  className = '',
  description,
  eyebrow,
  eyebrowIcon,
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
        <span className="portal-page-hero-icon" aria-hidden="true">{icon ?? defaultPageIcon(title)}</span>
        <div className="portal-page-hero-text">
          <div className="portal-page-hero-meta">
            {eyebrow && <p className={`eyebrow ${eyebrowIcon ? 'has-sparkles-icon' : ''}`.trim()}>{eyebrowIcon}{eyebrow}</p>}
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
