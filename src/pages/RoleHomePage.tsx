import '../styles/staff-super-admin-parity-v105.css'
import { AppointmentRequestAlert } from '../components/dashboard/AppointmentRequestAlert'
import { DashboardGreeting } from '../components/dashboard/DashboardGreeting'
import { SuperAdminBranchDashboardV128 } from '../features/admin/SuperAdminBranchDashboardV128'
import { useAuth } from '../features/auth/AuthContext'
import { DentistPremiumDashboardV130 } from '../features/dentalRecords/DentistPremiumDashboardV130'
import { StaffTodayWorkspace } from '../features/staff/StaffTodayWorkspace'

export function RoleHomePage() {
  const { user } = useAuth()
  const isDentist = user?.role === 'dentist' || user?.role === 'associate_dentist'

  if (isDentist) {
    return (
      <div className="role-home-with-greeting dentist-premium-home-v130">
        <DentistPremiumDashboardV130 />
      </div>
    )
  }

  const workspace = user?.role === 'super_admin'
    ? <SuperAdminBranchDashboardV128 />
    : <StaffTodayWorkspace />

  return (
    <div className="role-home-with-greeting">
      <DashboardGreeting />
      <AppointmentRequestAlert />
      {workspace}
    </div>
  )
}
