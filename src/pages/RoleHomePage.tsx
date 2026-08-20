import { useAuth } from '../features/auth/AuthContext'
import { DentistTodayWorkspace } from '../features/dentalRecords/DentistTodayWorkspace'
import { DashboardPage } from './DashboardPage'

export function RoleHomePage() {
  const { user } = useAuth()

  if (user?.role === 'dentist' || user?.role === 'associate_dentist') {
    return <DentistTodayWorkspace />
  }

  return <DashboardPage />
}
