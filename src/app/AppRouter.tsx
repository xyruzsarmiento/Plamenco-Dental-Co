import { useEffect } from 'react'
import { Navigate, Route, BrowserRouter as Router, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage'
import { LoginPage } from '../features/auth/LoginPage'
import { RegisterPage } from '../features/auth/RegisterPage'
import { useAuth } from '../features/auth/AuthContext'
import { RequireAuth } from '../features/auth/RequireAuth'
import { RequirePatientAuth } from '../features/auth/RequirePatientAuth'
import { RequirePermission } from '../features/auth/RequirePermission'
import { RequireRole } from '../features/auth/RequireRole'
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage'
import { PatientPortalRoute } from '../features/patientPortal/PatientPortalRoute'
import { AppointmentsPage } from '../pages/AppointmentsPage'
import { BillingPageV14 } from '../pages/BillingPageV14'
import { BranchesPage } from '../pages/BranchesPage'
import { CommunicationsPageV24 } from '../pages/CommunicationsPageV24'
import { DataImportPageV21 } from '../pages/DataImportPageV21'
import { DentalRecordsPageV11 } from '../pages/DentalRecordsPageV11'
import { DentistsPageV16 } from '../pages/DentistsPageV16'
import { ExpensesPageV23 } from '../pages/ExpensesPageV23'
import { FormsConsentAdminPage } from '../pages/FormsConsentAdminPage'
import { InventoryPageV22 } from '../pages/InventoryPageV22'
import { LandingPage } from '../pages/LandingPage'
import { ManagementReportAutomationPageV20 } from '../pages/ManagementReportAutomationPageV20'
import { NotFoundPage } from '../pages/NotFoundPage'
import { NotificationsPageV25 } from '../pages/NotificationsPageV25'
import { OperationalTasksPageV17 } from '../pages/OperationalTasksPageV17'
import { PatientIntakePage } from '../pages/PatientIntakePage'
import { PatientsPageV10 } from '../pages/PatientsPageV10'
import { RecallFollowUpPageV18 } from '../pages/RecallFollowUpPageV18'
import { ReportsPageV19 } from '../pages/ReportsPageV19'
import { RoleHomePage } from '../pages/RoleHomePage'
import { ServicesPageV15 } from '../pages/ServicesPageV15'
import { SettingsPage } from '../pages/SettingsPage'
import { StaffPage } from '../pages/StaffPage'
import { SystemAdministrationPage } from '../pages/SystemAdministrationPage'
import { TreatmentPlansPageV13 } from '../pages/TreatmentPlansPageV13'
import { TreatmentsPageV12 } from '../pages/TreatmentsPageV12'
import { UnauthorizedPage } from '../pages/UnauthorizedPage'

function BookRoute() {
  const { user, isAuthenticated } = useAuth()

  if (isAuthenticated && user?.role === 'patient' && user.patientId) {
    return <Navigate to={`/portal/${user.patientId}?tab=booking`} replace />
  }

  return <Navigate to="/login" replace state={{ from: { pathname: '/book' } }} />
}

function RouteRobotsMeta() {
  const location = useLocation()

  useEffect(() => {
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    if (!robots) return
    const deploymentEnvironment = (import.meta.env.VITE_DEPLOYMENT_ENV ?? 'development').toLowerCase()
    const isNonProductionDeployment = deploymentEnvironment !== 'production'
    const privateRoutePrefixes = ['/app', '/portal', '/staff', '/dentist', '/super-admin', '/login', '/register', '/forgot-password', '/reset-password']
    const isPrivateOrAuthRoute = privateRoutePrefixes.some((prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`))
    robots.content = isNonProductionDeployment || isPrivateOrAuthRoute ? 'noindex, nofollow' : 'index, follow'
  }, [location.pathname])

  return null
}

export function AppRouter() {
  return (
    <Router>
      <RouteRobotsMeta />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/book" element={<BookRoute />} />
        <Route path="/settings" element={<Navigate to="/app/settings" replace />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="/portal/:patientId" element={<RequirePatientAuth><PatientPortalRoute /></RequirePatientAuth>} />
        <Route path="/portal/:patientId/intake" element={<RequirePatientAuth><PatientIntakePage /></RequirePatientAuth>} />
        <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<RoleHomePage />} />
          <Route path="appointments" element={<RequirePermission permission="appointments.view"><AppointmentsPage /></RequirePermission>} />
          <Route path="patients" element={<RequirePermission permission="patients.view"><PatientsPageV10 /></RequirePermission>} />
          <Route path="patients/:patientId" element={<RequirePermission permission="patients.view"><PatientsPageV10 /></RequirePermission>} />
          <Route path="dental-records" element={<RequirePermission permission="clinical_records.view"><DentalRecordsPageV11 /></RequirePermission>} />
          <Route path="treatments" element={<RequirePermission permission="treatments.view"><TreatmentsPageV12 /></RequirePermission>} />
          <Route path="treatment-plans" element={<RequirePermission permission="treatments.view"><TreatmentPlansPageV13 /></RequirePermission>} />
          <Route path="billing" element={<RequirePermission anyOf={['billing.view', 'payments.view']}><BillingPageV14 /></RequirePermission>} />
          <Route path="services" element={<RequirePermission anyOf={['services.view', 'services.manage']}><ServicesPageV15 /></RequirePermission>} />
          <Route path="inventory" element={<RequirePermission permission="inventory.view"><InventoryPageV22 /></RequirePermission>} />
          <Route path="expenses" element={<RequirePermission permission="expenses.view"><ExpensesPageV23 /></RequirePermission>} />
          <Route path="staff" element={<RequirePermission anyOf={['staff.manage', 'dentists.manage']}><StaffPage /></RequirePermission>} />
          <Route path="dentists" element={<RequirePermission permission="dentists.manage"><DentistsPageV16 /></RequirePermission>} />
          <Route path="branches" element={<RequirePermission anyOf={['branches.view', 'branches.manage']}><BranchesPage /></RequirePermission>} />
          <Route path="reports" element={<RequirePermission permission="reports.view"><ReportsPageV19 /></RequirePermission>} />
          <Route path="report-automation" element={<RequirePermission permission="reports.view"><ManagementReportAutomationPageV20 /></RequirePermission>} />
          <Route path="data-import" element={<RequirePermission permission="patients.import"><DataImportPageV21 /></RequirePermission>} />
          <Route path="notifications" element={<RequirePermission permission="notifications.view"><NotificationsPageV25 /></RequirePermission>} />
          <Route path="communications" element={<RequirePermission anyOf={['communications.manage', 'notifications.send', 'notifications.view']}><CommunicationsPageV24 /></RequirePermission>} />
          <Route path="recalls" element={<RequirePermission anyOf={['appointments.view', 'clinical_records.view', 'communications.manage']}><RecallFollowUpPageV18 /></RequirePermission>} />
          <Route path="tasks" element={<RequirePermission anyOf={['appointments.view', 'clinical_records.view', 'system_admin.view']}><OperationalTasksPageV17 /></RequirePermission>} />
          <Route path="forms-consent" element={<RequirePermission permission="settings.manage"><FormsConsentAdminPage /></RequirePermission>} />
          <Route path="settings" element={<RequirePermission permission="settings.manage"><SettingsPage /></RequirePermission>} />
          <Route path="system-admin" element={<RequireRole allowedRoles={['super_admin']}><SystemAdministrationPage /></RequireRole>} />
          <Route path="unauthorized" element={<UnauthorizedPage />} />
        </Route>
        <Route path="/super-admin/*" element={<RequireAuth><RequireRole allowedRoles={['super_admin']}><Navigate to="/app/system-admin" replace /></RequireRole></RequireAuth>} />
        <Route path="/dentist/*" element={<RequireAuth><RequireRole allowedRoles={['dentist', 'associate_dentist']}><Navigate to="/app" replace /></RequireRole></RequireAuth>} />
        <Route path="/staff/*" element={<RequireAuth><RequireRole allowedRoles={['staff', 'admin', 'super_admin']}><Navigate to="/app" replace /></RequireRole></RequireAuth>} />
        <Route path="/dashboard" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Router>
  )
}
