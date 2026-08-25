import '../styles/staff-super-admin-parity-v105.css'
import { AppointmentRequestAlert } from '../components/dashboard/AppointmentRequestAlert'
import { DashboardGreeting } from '../components/dashboard/DashboardGreeting'
import { SuperAdminBranchDashboardV128 } from '../features/admin/SuperAdminBranchDashboardV128'
import { useAuth } from '../features/auth/AuthContext'
import { DentistTodayWorkspace } from '../features/dentalRecords/DentistTodayWorkspace'
import { StaffTodayWorkspace } from '../features/staff/StaffTodayWorkspace'

export function RoleHomePage() {
  const { user } = useAuth()

  let workspace: React.ReactNode

  if (user?.role === 'super_admin') {
    workspace = <SuperAdminBranchDashboardV128 />
  } else if (user?.role === 'dentist' || user?.role === 'associate_dentist') {
    workspace = <DentistTodayWorkspace />
  } else {
    workspace = <StaffTodayWorkspace />
  }

  return (
    <div className="role-home-with-greeting">
      <DashboardGreeting />
      <AppointmentRequestAlert />
      {workspace}
    </div>
  )
}
