import { useAuth } from '../features/auth/AuthContext'
import { SuperAdminOverview } from '../features/admin/SuperAdminOverview'
import { DentistTodayWorkspace } from '../features/dentalRecords/DentistTodayWorkspace'
import { StaffTodayWorkspace } from '../features/staff/StaffTodayWorkspace'
import { DashboardPage } from './DashboardPage'

export function RoleHomePage() {
  const { user } = useAuth()

  if (user?.role === 'super_admin') {
    return <SuperAdminOverview />
  }

  if (user?.role === 'dentist' || user?.role === 'associate_dentist') {
    return <DentistTodayWorkspace />
  }

  if (user?.role === 'staff') {
    return <StaffTodayWorkspace />
  }

  return <DashboardPage />
}
