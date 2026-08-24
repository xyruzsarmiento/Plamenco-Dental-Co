import { CheckCircle2, CircleDot, Clock3, Info, XCircle } from 'lucide-react'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'
type StatusBadgeVariant = 'standard' | 'compact'

type BadgeProps = {
  children: React.ReactNode
  tone?: BadgeTone
  icon?: React.ReactNode
  variant?: StatusBadgeVariant
  className?: string
}

export function Badge({ children, className = '', icon, tone = 'neutral', variant = 'standard' }: BadgeProps) {
  return <span className={`badge status-badge-v4 badge-${tone} status-badge-v4-${variant} ${className}`.trim()}>{icon}{children}</span>
}

function normalizeStatus(status: string) {
  return status.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function statusBadgeLabel(status?: string) {
  if (!status) return 'Not set'
  const normalized = normalizeStatus(status)
  const labels: Record<string, string> = {
    active: 'Active',
    amended: 'Updated',
    accepted: 'Accepted',
    approved: 'Approved',
    archived: 'Archived',
    absent: 'Absent',
    attention: 'Attention',
    cancelled: 'Cancelled',
    checked_in: 'Checked in',
    closed: 'Closed',
    completed: 'Completed',
    complete: 'Complete',
    confirmed: 'Confirmed',
    configured: 'Configured',
    contacted: 'Contacted',
    declined: 'Declined',
    delivered: 'Delivered',
    dismissed: 'Dismissed',
    duplicate: 'Duplicate',
    due_soon: 'Due soon',
    draft: 'Draft',
    error: 'Error',
    expired: 'Expired',
    failed: 'Failed',
    finalized: 'Finalized',
    follow_up: 'Follow-up',
    healthy: 'Healthy',
    in_progress: 'In progress',
    in_stock: 'In stock',
    in_transit: 'In transit',
    inactive: 'Inactive',
    late: 'Late',
    low_stock: 'Low stock',
    monitoring: 'Monitoring',
    needs_rescheduling: 'Needs rescheduling',
    no_show: 'No-show',
    not_billed: 'Not billed',
    on_leave: 'On leave',
    open: 'Open',
    ordered: 'Ordered',
    overdue: 'Overdue',
    out_of_stock: 'Out of stock',
    paid: 'Paid',
    partially_paid: 'Partially paid',
    partially_received: 'Partially received',
    partially_refunded: 'Partially refunded',
    pending: 'Pending',
    pending_verification: 'Pending verification',
    partial: 'Partial',
    planned: 'Planned',
    posted: 'Posted',
    present: 'Present',
    processed: 'Processed',
    presented: 'Presented',
    processing: 'Processing',
    possible_match: 'Possible match',
    published: 'Published',
    queued: 'Queued',
    ready: 'Ready',
    received: 'Received',
    refunded: 'Refunded',
    rejected: 'Rejected',
    rescheduled: 'Rescheduled',
    rolled_back: 'Rolled back',
    reviewed: 'Reviewed',
    sent: 'Sent',
    signed: 'Signed',
    skipped: 'Skipped',
    scheduled: 'Scheduled',
    sending: 'Sending',
    submitted: 'Submitted',
    succeeded: 'Succeeded',
    superseded: 'Superseded',
    unpaid: 'Unpaid',
    verified: 'Verified',
    verification_failed: 'Verification failed',
    void: 'Void',
    voided: 'Voided',
    waiting: 'Waiting',
    waiting_patient: 'Waiting for patient',
  }
  return labels[normalized] ?? normalized.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function statusBadgeTone(status?: string): BadgeTone {
  if (!status) return 'neutral'
  const normalized = normalizeStatus(status)
  if (['active', 'booked', 'confirmed', 'configured', 'delivered', 'follow_up', 'monitoring', 'not_billed', 'open', 'published', 'scheduled', 'sent'].includes(normalized)) return 'info'
  if (['accepted', 'amended', 'closed', 'complete', 'completed', 'finalized', 'healthy', 'in_stock', 'paid', 'posted', 'present', 'processed', 'ready', 'received', 'signed', 'succeeded', 'verified'].includes(normalized)) return 'success'
  if (['approved', 'checked_in', 'contacted', 'draft', 'due_soon', 'in_progress', 'in_transit', 'late', 'low_stock', 'needs_rescheduling', 'on_leave', 'ordered', 'partial', 'partially_paid', 'partially_received', 'partially_refunded', 'pending', 'pending_verification', 'planned', 'presented', 'processing', 'possible_match', 'queued', 'rescheduled', 'reviewed', 'sending', 'submitted', 'superseded', 'waiting', 'waiting_patient'].includes(normalized)) return 'warning'
  if (['absent', 'archived', 'attention', 'cancelled', 'declined', 'dismissed', 'duplicate', 'error', 'expired', 'failed', 'inactive', 'no_show', 'out_of_stock', 'overdue', 'refunded', 'rejected', 'rolled_back', 'skipped', 'unpaid', 'verification_failed', 'void', 'voided'].includes(normalized)) return 'danger'
  return 'info'
}

function StatusIcon({ tone }: { tone: BadgeTone }) {
  if (tone === 'success') return <CheckCircle2 size={13} aria-hidden="true" />
  if (tone === 'warning') return <Clock3 size={13} aria-hidden="true" />
  if (tone === 'danger') return <XCircle size={13} aria-hidden="true" />
  if (tone === 'info') return <Info size={13} aria-hidden="true" />
  return <CircleDot size={13} aria-hidden="true" />
}

type StatusBadgeProps = {
  status?: string
  label?: string
  variant?: StatusBadgeVariant
  showIcon?: boolean
  className?: string
}

export function StatusBadge({ className = '', label, showIcon = true, status, variant = 'standard' }: StatusBadgeProps) {
  const tone = statusBadgeTone(status)
  const normalized = status ? normalizeStatus(status) : 'unset'
  return (
    <Badge
      className={`status-badge-v4-status status-badge-v4-status-${normalized} ${className}`.trim()}
      icon={showIcon ? <StatusIcon tone={tone} /> : undefined}
      tone={tone}
      variant={variant}
    >
      {label ?? statusBadgeLabel(status)}
    </Badge>
  )
}
