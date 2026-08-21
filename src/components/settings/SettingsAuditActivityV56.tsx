import {
  Activity,
  CalendarClock,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  FileClock,
  Package,
  Search,
  Settings2,
  ShieldCheck,
  Stethoscope,
  UserRound,
  UsersRound,
} from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import type { StaffMember } from '../../features/auth/authTypes'
import { formatAuditAction, type AuditLogEntry } from '../../features/security/auditLogStore'

type Props = {
  logs: AuditLogEntry[]
  staff: StaffMember[]
  actionValue: string
  searchValue: string
  actionOptions: Array<{ value: string; label: string }>
  onActionChange: (value: string) => void
  onSearchChange: (value: string) => void
}

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: string | number }>

type AreaInfo = {
  label: string
  icon: Icon
}

const areaMap: Record<string, AreaInfo> = {
  patient: { label: 'Patient records', icon: UserRound },
  patients: { label: 'Patient records', icon: UserRound },
  appointment: { label: 'Appointments', icon: CalendarClock },
  appointments: { label: 'Appointments', icon: CalendarClock },
  clinical_record: { label: 'Clinical records', icon: Stethoscope },
  dental_record: { label: 'Dental records', icon: Stethoscope },
  treatment: { label: 'Treatments', icon: Stethoscope },
  treatment_plan: { label: 'Treatment plans', icon: ClipboardList },
  invoice: { label: 'Billing & payments', icon: CircleDollarSign },
  payment: { label: 'Billing & payments', icon: CircleDollarSign },
  refund: { label: 'Billing & payments', icon: CircleDollarSign },
  charge: { label: 'Billing & payments', icon: CircleDollarSign },
  inventory_item: { label: 'Inventory', icon: Package },
  stock_movement: { label: 'Inventory', icon: Package },
  stock_transfer: { label: 'Inventory', icon: Package },
  purchase_order: { label: 'Inventory', icon: Package },
  purchase_receipt: { label: 'Inventory', icon: Package },
  supplier: { label: 'Inventory', icon: Package },
  stock_count: { label: 'Inventory', icon: Package },
  expense: { label: 'Expenses', icon: CircleDollarSign },
  provider: { label: 'Dentists & providers', icon: UsersRound },
  staff: { label: 'Team & access', icon: UsersRound },
  branch: { label: 'Branches', icon: Activity },
  clinic_settings: { label: 'Clinic settings', icon: Settings2 },
  settings: { label: 'Clinic settings', icon: Settings2 },
  report: { label: 'Reports & analytics', icon: FileClock },
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
}

function normalizedEntity(value: string) {
  return value.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
}

function areaFor(entity: string): AreaInfo {
  const normalized = normalizedEntity(entity)
  const direct = areaMap[normalized]
  if (direct) return direct
  if (normalized.includes('patient')) return areaMap.patient
  if (normalized.includes('appointment')) return areaMap.appointment
  if (normalized.includes('treatment') || normalized.includes('clinical') || normalized.includes('dental')) return areaMap.treatment
  if (normalized.includes('invoice') || normalized.includes('payment') || normalized.includes('billing') || normalized.includes('refund')) return areaMap.invoice
  if (normalized.includes('inventory') || normalized.includes('stock') || normalized.includes('supplier') || normalized.includes('purchase')) return areaMap.inventory_item
  if (normalized.includes('expense') || normalized.includes('cashier') || normalized.includes('cash')) return areaMap.expense
  if (normalized.includes('provider') || normalized.includes('dentist')) return areaMap.provider
  if (normalized.includes('staff') || normalized.includes('team')) return areaMap.staff
  if (normalized.includes('branch')) return areaMap.branch
  if (normalized.includes('setting') || normalized.includes('config')) return areaMap.settings
  if (normalized.includes('report')) return areaMap.report
  return { label: 'Clinic operations', icon: Activity }
}

function friendlyActor(rawActor: string, staff: StaffMember[]) {
  const normalized = rawActor.trim().toLowerCase()
  const match = staff.find((member) =>
    [member.id, member.email, member.name].some((value) => value?.trim().toLowerCase() === normalized),
  )
  if (match?.name) return match.name
  if (!normalized || normalized === 'system') return 'Clinic system'
  if (normalized.includes('@') || normalized.includes('super admin') || normalized === 'admin' || normalized.includes('administrator')) {
    return 'Clinic administrator'
  }
  return rawActor.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function metadataEntries(log: AuditLogEntry) {
  return Object.entries(log.metadata ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== '')
}

function actorInitials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'CA'
}

export function SettingsAuditActivityV56({
  logs,
  staff,
  actionValue,
  searchValue,
  actionOptions,
  onActionChange,
  onSearchChange,
}: Props) {
  return (
    <section className="settings56-audit" aria-label="Clinic change history">
      <header className="settings56-audit-head">
        <div>
          <span className="settings56-eyebrow"><ShieldCheck size={14} /> Clinic change history</span>
          <h3>What changed in the clinic?</h3>
          <p>Review important changes in plain language. Technical record details are available only when you need them.</p>
        </div>
        <div className="settings56-audit-count"><strong>{logs.length}</strong><span>matching changes</span></div>
      </header>

      <div className="settings56-filters">
        <label className="settings56-search">
          <Search size={17} />
          <input
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by change, clinic area, or person"
          />
        </label>
        <label className="settings56-filter">
          <span>Type of change</span>
          <select value={actionValue} onChange={(event) => onActionChange(event.target.value)}>
            {actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      {logs.length === 0 ? (
        <div className="settings56-empty">
          <FileClock size={30} />
          <h4>No changes match your filters</h4>
          <p>Try a different search term or change type.</p>
        </div>
      ) : (
        <div className="settings56-activity-list">
          {logs.map((log) => {
            const action = formatAuditAction(log.action)
            const area = areaFor(log.entity)
            const AreaIcon = area.icon
            const actor = friendlyActor(log.user, staff)
            const metadata = metadataEntries(log)
            return (
              <article className="settings56-change-card" key={log.id}>
                <div className="settings56-change-icon"><AreaIcon size={19} /></div>
                <div className="settings56-change-main">
                  <div className="settings56-change-topline">
                    <span className="settings56-area-pill">{area.label}</span>
                    <time dateTime={log.timestamp}>{formatDateTime(log.timestamp)}</time>
                  </div>
                  <h4>{action.label}</h4>
                  <p>{action.description}</p>
                  <div className="settings56-actor">
                    <span className="settings56-avatar">{actorInitials(actor)}</span>
                    <span><small>Changed by</small><strong>{actor}</strong></span>
                  </div>

                  <details className="settings56-technical">
                    <summary><ChevronDown size={14} /> View record details</summary>
                    <div className="settings56-technical-grid">
                      <div><span>Original actor</span><strong>{log.user || 'System'}</strong></div>
                      <div><span>Record area</span><strong>{log.entity || 'Not recorded'}</strong></div>
                      <div className="is-wide"><span>Record reference</span><code>{log.entityId || 'Not recorded'}</code></div>
                      {metadata.length > 0 && (
                        <div className="is-wide settings56-meta">
                          <span>Additional details</span>
                          <div>{metadata.slice(0, 8).map(([key, value]) => <span key={key}><b>{key.replaceAll('_', ' ')}</b>{String(value)}</span>)}</div>
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
