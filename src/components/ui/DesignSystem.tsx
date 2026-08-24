import type { CSSProperties, ReactNode } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from './Button'

type SkeletonProps = {
  width?: string | number
  height?: string | number
  className?: string
  radius?: string | number
}

export function Skeleton({ width = '100%', height = 16, className = '', radius }: SkeletonProps) {
  return (
    <span
      className={`ui-skeleton ${className}`.trim()}
      aria-hidden="true"
      style={{ width, height, borderRadius: radius }}
    />
  )
}

type SkeletonTextProps = {
  lines?: number
  className?: string
  widths?: Array<string | number>
}

export function SkeletonText({ lines = 3, className = '', widths = ['92%', '76%', '48%'] }: SkeletonTextProps) {
  return (
    <span className={`ui-skeleton-text ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} width={widths[index] ?? widths.at(-1) ?? '80%'} height={index === 0 ? 16 : 12} />
      ))}
    </span>
  )
}

type SkeletonAvatarProps = {
  size?: number | string
  className?: string
  radius?: number | string
}

export function SkeletonAvatar({ size = 44, className = '', radius = '50%' }: SkeletonAvatarProps) {
  return <Skeleton className={`ui-skeleton-avatar ${className}`.trim()} width={size} height={size} radius={radius} />
}

type SkeletonCardProps = {
  className?: string
  compact?: boolean
  children?: ReactNode
}

export function SkeletonCard({ className = '', compact = false, children }: SkeletonCardProps) {
  return (
    <section className={`ui-skeleton-card ${compact ? 'is-compact' : ''} ${className}`.trim()} aria-busy="true" aria-label="Loading content">
      {children ?? (
        <>
          <Skeleton width="38%" height={12} />
          <Skeleton width="72%" height={24} radius={10} />
          <SkeletonText lines={3} />
        </>
      )}
    </section>
  )
}

type SkeletonListProps = {
  items?: number
  withAvatar?: boolean
  className?: string
}

export function SkeletonList({ items = 5, withAvatar = true, className = '' }: SkeletonListProps) {
  return (
    <div className={`ui-skeleton-list ${className}`.trim()} aria-busy="true" aria-label="Loading list">
      {Array.from({ length: items }, (_, index) => (
        <div className="ui-skeleton-list-row" key={index}>
          {withAvatar ? <SkeletonAvatar size={42} radius={12} /> : null}
          <SkeletonText lines={2} widths={['78%', '46%']} />
          <Skeleton width={70} height={24} radius={999} />
        </div>
      ))}
    </div>
  )
}

type SkeletonTableProps = {
  rows?: number
  columns?: number
  className?: string
}

export function SkeletonTable({ rows = 6, columns = 5, className = '' }: SkeletonTableProps) {
  return (
    <div className={`ui-skeleton-table ${className}`.trim()} style={{ '--ui-skeleton-columns': columns } as CSSProperties} aria-busy="true" aria-label="Loading table">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div className="ui-skeleton-table-row" key={rowIndex}>
          {Array.from({ length: columns }, (_, columnIndex) => (
            <Skeleton
              key={`${rowIndex}-${columnIndex}`}
              height={rowIndex === 0 ? 12 : 16}
              width={columnIndex === 0 ? '72%' : columnIndex === columns - 1 ? '58%' : '86%'}
              radius={rowIndex === 0 ? 999 : 8}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonChart({ className = '' }: { className?: string }) {
  const bars = [62, 84, 45, 72, 55, 91, 68]
  return (
    <div className={`ui-skeleton-chart ${className}`.trim()} aria-busy="true" aria-label="Loading chart">
      <div className="ui-skeleton-chart-grid">
        {bars.map((height, index) => (
          <Skeleton key={index} width="100%" height={`${height}%`} radius="10px 10px 4px 4px" />
        ))}
      </div>
      <Skeleton width="42%" height={12} />
    </div>
  )
}

export function ProfileSkeleton() {
  return (
    <section className="ui-skeleton-profile" aria-busy="true" aria-label="Loading profile">
      <div className="ui-skeleton-profile-hero">
        <SkeletonAvatar size={96} />
        <div>
          <Skeleton width={120} height={12} />
          <Skeleton width={260} height={30} radius={12} />
          <SkeletonText lines={2} widths={['220px', '340px']} />
        </div>
        <Skeleton width={132} height={42} radius={12} />
      </div>
      <div className="ui-skeleton-profile-grid">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </section>
  )
}

type PortalSkeletonProps = {
  variant?: 'internal' | 'patient' | 'booking'
  message?: string
}

export function PortalSkeleton({ variant = 'internal', message }: PortalSkeletonProps) {
  const isPatient = variant === 'patient'
  const style = { '--ui-skeleton-rail-width': isPatient ? '260px' : '244px' } as CSSProperties
  return (
    <main className={`ui-skeleton-portal is-${variant}`} style={style} aria-busy="true" aria-label={message ?? 'Loading portal'}>
      {variant !== 'booking' ? (
        <aside className="ui-skeleton-rail">
          <div className="ui-skeleton-brand"><SkeletonAvatar size={42} radius={12} /><SkeletonText lines={2} widths={['86px', '56px']} /></div>
          <SkeletonList items={5} withAvatar={false} />
          <div className="ui-skeleton-rail-account"><SkeletonAvatar size={36} /><SkeletonText lines={2} widths={['90px', '52px']} /></div>
        </aside>
      ) : null}
      <section className="ui-skeleton-workspace">
        <header className="ui-skeleton-topbar">
          <SkeletonText lines={2} widths={['130px', variant === 'booking' ? '280px' : '210px']} />
          <Skeleton width={96} height={34} radius={999} />
        </header>
        <SkeletonCard className="ui-skeleton-hero-card">
          <Skeleton width={140} height={12} />
          <Skeleton width="min(420px, 80%)" height={34} radius={12} />
          <SkeletonText lines={2} widths={['min(620px, 92%)', 'min(440px, 70%)']} />
        </SkeletonCard>
        <div className="ui-skeleton-stat-grid">
          <SkeletonCard compact />
          <SkeletonCard compact />
          <SkeletonCard compact />
          <SkeletonCard compact />
        </div>
        <div className="ui-skeleton-main-grid">
          <SkeletonCard><SkeletonChart /></SkeletonCard>
          <SkeletonCard><SkeletonList items={4} /></SkeletonCard>
        </div>
      </section>
    </main>
  )
}

type PaginationProps = {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  label?: string
  totalItems?: number
  pageSize?: number
  pageSizeOptions?: number[]
  onPageSizeChange?: (pageSize: number) => void
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  label = 'Pagination',
  totalItems,
  pageSize,
  pageSizeOptions = [10, 20, 50],
  onPageSizeChange,
}: PaginationProps) {
  const safeCount = Math.max(1, pageCount)
  const safePage = Math.min(Math.max(1, page), safeCount)
  const start = totalItems && pageSize ? (safePage - 1) * pageSize + 1 : 0
  const end = totalItems && pageSize ? Math.min(safePage * pageSize, totalItems) : 0
  const pages = Array.from({ length: safeCount }, (_, index) => index + 1).filter(
    (value) => value === 1 || value === safeCount || Math.abs(value - safePage) <= 1,
  )

  return (
    <nav className="ui-pagination" aria-label={label}>
      {typeof totalItems === 'number' && pageSize ? (
        <div className="ui-pagination-meta">
          <strong>{totalItems ? `${start}-${end}` : '0'}</strong>
          <span>of {totalItems}</span>
        </div>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        disabled={safePage <= 1}
        onClick={() => onPageChange(safePage - 1)}
        icon={<ChevronLeft size={15} />}
      >
        Previous
      </Button>
      <div className="ui-pagination-pages">
        {pages.map((value, index) => {
          const previous = pages[index - 1]
          return (
            <span key={value} style={{ display: 'contents' }}>
              {previous && value - previous > 1 ? <span aria-hidden="true">…</span> : null}
              <button
                type="button"
                className="ui-page-button"
                aria-current={value === safePage ? 'page' : undefined}
                aria-label={`Page ${value}`}
                onClick={() => onPageChange(value)}
              >
                {value}
              </button>
            </span>
          )
        })}
      </div>
      {onPageSizeChange && pageSize ? (
        <label className="ui-page-size">
          <span>Rows</span>
          <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
            {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        disabled={safePage >= safeCount}
        onClick={() => onPageChange(safePage + 1)}
        icon={<ChevronRight size={15} />}
      >
        Next
      </Button>
    </nav>
  )
}

type TooltipProps = {
  label: string
  children: ReactNode
  className?: string
}

export function Tooltip({ label, children, className = '' }: TooltipProps) {
  return (
    <span className={`ui-tooltip ${className}`.trim()} data-tooltip={label}>
      {children}
    </span>
  )
}

type ToastProps = {
  title?: string
  message: string
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  onDismiss?: () => void
}

export function Toast({ title, message, tone = 'neutral', onDismiss }: ToastProps) {
  return (
    <div className={`ui-toast ui-toast-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <div>
        {title ? <strong>{title}</strong> : null}
        <p>{message}</p>
      </div>
      {onDismiss ? (
        <button type="button" className="icon-button" aria-label="Dismiss notification" onClick={onDismiss}>
          <X size={16} />
        </button>
      ) : null}
    </div>
  )
}

type DrawerProps = {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
}

export function Drawer({ open, title, description, children, footer, onClose }: DrawerProps) {
  if (!open) return null

  return (
    <div className="modal-backdrop drawer-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header className="modal-header">
          <div>
            <h2 id="drawer-title">{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="icon-button" aria-label="Close drawer" data-modal-close onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-footer">{footer}</footer> : null}
      </section>
    </div>
  )
}

type SectionHeaderProps = {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}

export function SectionHeader({ eyebrow, title, description, actions }: SectionHeaderProps) {
  return (
    <div className="section-header premium-section-header">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="action-buttons">{actions}</div> : null}
    </div>
  )
}
