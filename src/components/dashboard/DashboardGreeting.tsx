import type { ReactNode } from 'react'
import { BarChart3, CalendarDays, FileText, Hand, Search, Settings, ShieldCheck, Stethoscope, UserPlus, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthContext'
import type { UserRole } from '../../features/auth/authTypes'

function getDashboardGreeting() {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    hour12: false,
  }).format(new Date()))

  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function getDashboardFirstName(name = '', email = '') {
  const cleanedName = name.trim().replace(/^(dr\.?|doctor)\s+/i, '')
  const source = cleanedName || email.split('@')[0] || 'there'
  return source.split(/\s+/)[0]?.replace(/[._-]+/g, ' ') || 'there'
}

function getDashboardToday() {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())
}

function getRoleCopy(role?: UserRole) {
  if (role === 'super_admin') {
    return {
      eyebrow: 'Executive dashboard',
      subtitle: "Here's the clinic-wide picture for leadership decisions today.",
      icon: ShieldCheck,
      signal: 'Owner view',
      actions: [
        { label: 'Reports', path: '/app/reports', icon: BarChart3 },
        { label: 'Settings', path: '/app/settings', icon: Settings },
      ],
    }
  }
  if (role === 'dentist' || role === 'associate_dentist') {
    return {
      eyebrow: 'Clinical dashboard',
      subtitle: "Here's your patient flow and clinical schedule for the day.",
      icon: Stethoscope,
      signal: 'Clinical view',
      actions: [
        { label: 'My schedule', path: '/app/appointments', icon: CalendarDays },
        { label: 'Patient records', path: '/app/dental-records', icon: FileText },
      ],
    }
  }
  return {
    eyebrow: 'Front desk dashboard',
    subtitle: "Here's what's happening at the clinic today.",
    icon: UsersRound,
    signal: 'Staff view',
    actions: [
      { label: 'Book visit', path: '/app/appointments', icon: CalendarDays },
      { label: 'Add patient', path: '/app/patients', icon: UserPlus },
    ],
  }
}

type DashboardGreetingProps = {
  variant?: 'internal' | 'patient'
  eyebrow?: string
  name?: string
  subtitle?: string
  signal?: string
  icon?: ReactNode
  actions?: ReactNode
}

export function DashboardGreeting({ actions, eyebrow, icon, name, signal, subtitle, variant = 'internal' }: DashboardGreetingProps) {
  const { user } = useAuth()
  const roleCopy = getRoleCopy(user?.role)
  const Icon = roleCopy.icon
  const firstName = getDashboardFirstName(user?.name, user?.email)
  const internalNameLabel = user?.role === 'dentist' || user?.role === 'associate_dentist' ? `Dr. ${firstName}` : firstName
  const nameLabel = name ?? internalNameLabel
  const today = getDashboardToday()
  const isPatient = variant === 'patient'
  const signalLabel = signal ?? roleCopy.signal

  return (
    <section className={`dashboard-greeting-card dashboard-greeting-v2 ${isPatient ? 'dashboard-greeting-patient' : ''}`} aria-label="Dashboard greeting">
      <div className="dashboard-greeting-v2-icon" aria-hidden="true">
        {icon ?? <Hand size={24} />}
      </div>
      <div className="dashboard-greeting-v2-copy">
        <span className="dashboard-greeting-eyebrow">{eyebrow ?? roleCopy.eyebrow}</span>
        <h1>{getDashboardGreeting()}, <span>{nameLabel}</span></h1>
        <p>{subtitle ?? roleCopy.subtitle}</p>
      </div>
      <aside className="dashboard-greeting-v2-context" aria-label="Dashboard context">
        <div>
          <span>{icon ?? <Icon size={16} />} {signalLabel}</span>
          <time dateTime={new Date().toISOString()}>{today}</time>
        </div>
        {actions ? (
          <div className="dashboard-greeting-v2-actions" aria-label="Dashboard quick actions">{actions}</div>
        ) : (
          <nav className="dashboard-greeting-v2-actions" aria-label="Dashboard quick actions">
            {roleCopy.actions.map((action) => {
              const ActionIcon = action.icon
              return <Link key={action.path} to={action.path}><ActionIcon size={15} />{action.label}</Link>
            })}
            <Link to="/app/patients" className="is-secondary"><Search size={15} />Search</Link>
          </nav>
        )}
      </aside>
    </section>
  )
}
