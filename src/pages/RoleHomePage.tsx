import { useAuth } from '../features/auth/AuthContext'
import { SuperAdminOverviewV56 } from '../features/admin/SuperAdminOverviewV56'
import { DentistTodayWorkspace } from '../features/dentalRecords/DentistTodayWorkspace'
import { StaffTodayWorkspace } from '../features/staff/StaffTodayWorkspace'
import { DashboardPage } from './DashboardPage'

export function RoleHomePage() {
  const { user } = useAuth()

  if (user?.role === 'super_admin') {
    return <SuperAdminOverviewV56 />
  }

  if (user?.role === 'dentist' || user?.role === 'associate_dentist') {
    return <DentistTodayWorkspace />
  }

  if (user?.role === 'staff') {
    return <StaffTodayWorkspace />
  }

  return <DashboardPage />
}
