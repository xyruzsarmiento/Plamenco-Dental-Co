import type { ReactNode } from 'react'
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

type PaginationProps = {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  label?: string
}

export function Pagination({ page, pageCount, onPageChange, label = 'Pagination' }: PaginationProps) {
  const safeCount = Math.max(1, pageCount)
  const safePage = Math.min(Math.max(1, page), safeCount)
  const pages = Array.from({ length: safeCount }, (_, index) => index + 1).filter(
    (value) => value === 1 || value === safeCount || Math.abs(value - safePage) <= 1,
  )

  return (
    <nav className="ui-pagination" aria-label={label}>
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
