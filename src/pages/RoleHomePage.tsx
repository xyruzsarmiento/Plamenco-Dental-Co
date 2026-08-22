import { useAuth } from '../features/auth/AuthContext'
import { SuperAdminOverviewV56 } from '../features/admin/SuperAdminOverviewV56'
import { DentistTodayWorkspace } from '../features/dentalRecords/DentistTodayWorkspace'
import { StaffTodayWorkspace } from '../features/staff/StaffTodayWorkspace'
import { DashboardPage } from './DashboardPage'

function getGreeting() {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    hour12: false,
  }).format(new Date()))

  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function getRoleLabel(role?: string) {
  if (role === 'super_admin') return 'Owner workspace'
  if (role === 'admin') return 'Admin workspace'
  if (role === 'dentist' || role === 'associate_dentist') return 'Clinical workspace'
  if (role === 'staff') return 'Clinic operations'
  return 'Dashboard'
}

function DashboardGreeting() {
  const { user } = useAuth()
  const displayName = user?.name?.trim() || (user?.role === 'super_admin' ? 'Owner' : user?.role === 'admin' ? 'Admin' : 'there')
  const today = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())

  return (
    <section className="dashboard-greeting-card" aria-label="Dashboard greeting">
      <div>
        <span className="dashboard-greeting-eyebrow">{getRoleLabel(user?.role)}</span>
        <h1>{getGreeting()}, {displayName}</h1>
        <p>Here’s your clinic overview for {today}.</p>
      </div>
      <span className="dashboard-greeting-live"><i /> Live clinic data</span>
    </section>
  )
}

export function RoleHomePage() {
  const { user } = useAuth()

  let workspace: React.ReactNode

  if (user?.role === 'super_admin') {
    workspace = <SuperAdminOverviewV56 />
  } else if (user?.role === 'dentist' || user?.role === 'associate_dentist') {
    workspace = <DentistTodayWorkspace />
  } else if (user?.role === 'staff') {
    workspace = <StaffTodayWorkspace />
  } else {
    workspace = <DashboardPage />
  }

  return (
    <div className="role-home-with-greeting">
      <DashboardGreeting />
      {workspace}
    </div>
  )
}
