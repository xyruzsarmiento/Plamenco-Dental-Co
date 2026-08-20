import { useAuth } from '../features/auth/AuthContext'
import { DentistTodayWorkspace } from '../features/dentalRecords/DentistTodayWorkspace'
import { StaffTodayWorkspace } from '../features/staff/StaffTodayWorkspace'
import { DashboardPage } from './DashboardPage'

export function RoleHomePage() {
  const { user } = useAuth()

  if (user?.role === 'dentist' || user?.role === 'associate_dentist') {
    return <DentistTodayWorkspace />
  }

  if (user?.role === 'staff') {
    return <StaffTodayWorkspace />
  }

  return <DashboardPage />
}
