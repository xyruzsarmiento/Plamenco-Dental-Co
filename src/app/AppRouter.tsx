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
import { AppointmentsPage } from '../pages/AppointmentsPage'
import { BillingPage } from '../pages/BillingPage'
import { BranchesPage } from '../pages/BranchesPage'
import { CommunicationsPage } from '../pages/CommunicationsPage'
import { DataImportPage } from '../pages/DataImportPage'
import { DentalRecordsPage } from '../pages/DentalRecordsPage'
import { DentistsPage } from '../pages/DentistsPage'
import { ExpensesPage } from '../pages/ExpensesPage'
import { FormsConsentAdminPage } from '../pages/FormsConsentAdminPage'
import { InventoryPage } from '../pages/InventoryPage'
import { LandingPage } from '../pages/LandingPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { NotificationsPage } from '../pages/NotificationsPage'
import { PatientIntakePage } from '../pages/PatientIntakePage'
import { PatientPortalPage } from '../pages/PatientPortalPage'
import { PatientsPage } from '../pages/PatientsPage'
import { PublicBookingPage } from '../pages/PublicBookingPage'
import { RecallFollowUpPage } from '../pages/RecallFollowUpPage'
import { ReportsPage } from '../pages/ReportsPage'
import { RoleHomePage } from '../pages/RoleHomePage'
import { ServicesPage } from '../pages/ServicesPage'
import { SettingsPage } from '../pages/SettingsPage'
import { StaffPage } from '../pages/StaffPage'
import { SystemAdministrationPage } from '../pages/SystemAdministrationPage'
import { TreatmentPlansPage } from '../pages/TreatmentPlansPage'
import { TreatmentsPage } from '../pages/TreatmentsPage'
import { UnauthorizedPage } from '../pages/UnauthorizedPage'

function BookRoute() {
  const { user, isAuthenticated } = useAuth()

  if (isAuthenticated && user?.role === 'patient' && user.patientId) {
    return <Navigate to={`/portal/${user.patientId}`} replace />
  }

  return <PublicBookingPage />
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
        <Route
          path="/portal/:patientId"
          element={
            <RequirePatientAuth>
              <PatientPortalPage />
            </RequirePatientAuth>
          }
        />
        <Route
          path="/portal/:patientId/intake"
          element={
            <RequirePatientAuth>
              <PatientIntakePage />
            </RequirePatientAuth>
          }
        />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<RoleHomePage />} />
          <Route path="appointments" element={<RequirePermission permission="appointments.view"><AppointmentsPage /></RequirePermission>} />
          <Route path="patients" element={<RequirePermission permission="patients.view"><PatientsPage /></RequirePermission>} />
          <Route path="patients/:patientId" element={<RequirePermission permission="patients.view"><PatientsPage /></RequirePermission>} />
          <Route path="dental-records" element={<RequirePermission permission="clinical_records.view"><DentalRecordsPage /></RequirePermission>} />
          <Route path="treatments" element={<RequirePermission permission="treatments.view"><TreatmentsPage /></RequirePermission>} />
          <Route path="treatment-plans" element={<RequirePermission permission="treatments.view"><TreatmentPlansPage /></RequirePermission>} />
          <Route path="billing" element={<RequirePermission anyOf={['billing.view', 'payments.view']}><BillingPage /></RequirePermission>} />
          <Route path="services" element={<RequirePermission anyOf={['services.view', 'services.manage']}><ServicesPage /></RequirePermission>} />
          <Route path="inventory" element={<RequirePermission permission="inventory.view"><InventoryPage /></RequirePermission>} />
          <Route path="expenses" element={<RequirePermission permission="expenses.view"><ExpensesPage /></RequirePermission>} />
          <Route path="staff" element={<RequirePermission anyOf={['staff.manage', 'dentists.manage']}><StaffPage /></RequirePermission>} />
          <Route path="dentists" element={<RequirePermission permission="dentists.manage"><DentistsPage /></RequirePermission>} />
          <Route path="branches" element={<RequirePermission anyOf={['branches.view', 'branches.manage']}><BranchesPage /></RequirePermission>} />
          <Route path="reports" element={<RequirePermission permission="reports.view"><ReportsPage /></RequirePermission>} />
          <Route path="data-import" element={<RequirePermission permission="patients.import"><DataImportPage /></RequirePermission>} />
          <Route path="notifications" element={<RequirePermission permission="notifications.view"><NotificationsPage /></RequirePermission>} />
          <Route path="communications" element={<RequirePermission anyOf={['communications.manage', 'notifications.send', 'notifications.view']}><CommunicationsPage /></RequirePermission>} />
          <Route path="recalls" element={<RequirePermission anyOf={['appointments.view', 'clinical_records.view', 'communications.manage']}><RecallFollowUpPage /></RequirePermission>} />
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
