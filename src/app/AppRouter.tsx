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
import { BranchProvider } from '../features/branches/BranchContext'
import { PatientPortalRoute } from '../features/patientPortal/PatientPortalRoute'
import { WorkspaceBranchIsolationGuard } from '../features/security/WorkspaceIsolationGuard'
import { AppointmentsPageV38 } from '../pages/AppointmentsPageV38'
import { BillingBranchWorkspaceV123 } from '../pages/BillingBranchWorkspaceV123'
import { BranchesPageV27 } from '../pages/BranchesPageV27'
import { DataImportBranchWorkspaceV127 } from '../pages/DataImportBranchWorkspaceV127'
import { DentalRecordsPageV11 } from '../pages/DentalRecordsPageV11'
import { DentistsBranchAssignmentsV126 } from '../pages/DentistsBranchAssignmentsV126'
import { DocumentsBranchWorkspaceV127 } from '../pages/DocumentsBranchWorkspaceV127'
import { ExpensesBranchWorkspaceV122 } from '../pages/ExpensesBranchWorkspaceV122'
import { FormsConsentBranchWorkspaceV127 } from '../pages/FormsConsentBranchWorkspaceV127'
import { InventoryPageV56 } from '../pages/InventoryPageV56'
import { LandingPage } from '../pages/LandingPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { NotificationsPageV25 } from '../pages/NotificationsPageV25'
import { PatientBranchAwareDetailV125 } from '../pages/PatientBranchAwareDetailV125'
import { PatientIntakePage } from '../pages/PatientIntakePage'
import { PatientsBranchDirectoryV125 } from '../pages/PatientsBranchDirectoryV125'
import { PrescriptionsPage } from '../pages/PrescriptionsPage'
import { ProfilePage } from '../pages/ProfilePage'
import { ReportsBranchWorkspaceV124 } from '../pages/ReportsBranchWorkspaceV124'
import { RoleHomePage } from '../pages/RoleHomePage'
import { ServicesPageV49 } from '../pages/ServicesPageV49'
import { SettingsPageV30 } from '../pages/SettingsPageV30'
import { SystemAdministrationPageV58 } from '../pages/SystemAdministrationPageV58'
import { TeamAccessBranchAssignmentsV126 } from '../pages/TeamAccessBranchAssignmentsV126'
import { TreatmentPlansPageV44 } from '../pages/TreatmentPlansPageV44'
import { TreatmentsPageV43 } from '../pages/TreatmentsPageV43'
import { UnauthorizedPage } from '../pages/UnauthorizedPage'

function BookRoute() {
  const { user, isAuthenticated } = useAuth()

  if (isAuthenticated && user?.role === 'patient' && user.patientId) {
    return <Navigate to={`/portal/${user.patientId}?tab=booking`} replace />
  }

  return <Navigate to="/login" replace state={{ from: { pathname: '/book' } }} />
}

function InternalPortalShell() {
  return (
    <BranchProvider>
      <WorkspaceBranchIsolationGuard />
      <AppLayout />
    </BranchProvider>
  )
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
        <Route path="/app" element={<RequireAuth><InternalPortalShell /></RequireAuth>}>
          <Route index element={<RoleHomePage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="appointments" element={<RequirePermission permission="appointments.view"><AppointmentsPageV38 /></RequirePermission>} />
          <Route path="patients" element={<RequirePermission permission="patients.view"><PatientsBranchDirectoryV125 /></RequirePermission>} />
          <Route path="patients/:patientId" element={<RequirePermission permission="patients.view"><PatientBranchAwareDetailV125 /></RequirePermission>} />
          <Route path="dental-records" element={<RequirePermission permission="clinical_records.view"><DentalRecordsPageV11 /></RequirePermission>} />
          <Route path="treatments" element={<RequirePermission permission="treatments.view"><TreatmentsPageV43 /></RequirePermission>} />
          <Route path="treatment-plans" element={<RequirePermission permission="treatments.view"><TreatmentPlansPageV44 /></RequirePermission>} />
          <Route path="prescriptions" element={<RequirePermission permission="prescriptions.view"><PrescriptionsPage /></RequirePermission>} />
          <Route path="documents" element={<RequirePermission anyOf={['documents.view', 'documents.upload']}><DocumentsBranchWorkspaceV127 /></RequirePermission>} />
          <Route path="billing" element={<RequirePermission anyOf={['billing.view', 'payments.view']}><BillingBranchWorkspaceV123 /></RequirePermission>} />
          <Route path="services" element={<RequirePermission anyOf={['services.view', 'services.manage']}><ServicesPageV49 /></RequirePermission>} />
          <Route path="inventory" element={<RequirePermission permission="inventory.view"><InventoryPageV56 /></RequirePermission>} />
          <Route path="expenses" element={<RequirePermission permission="expenses.view"><ExpensesBranchWorkspaceV122 /></RequirePermission>} />
          <Route path="staff" element={<RequirePermission anyOf={['staff.manage', 'dentists.manage']}><TeamAccessBranchAssignmentsV126 /></RequirePermission>} />
          <Route path="dentists" element={<RequirePermission permission="dentists.manage"><DentistsBranchAssignmentsV126 /></RequirePermission>} />
          <Route path="branches" element={<RequirePermission anyOf={['branches.view', 'branches.manage']}><BranchesPageV27 /></RequirePermission>} />
          <Route path="reports" element={<RequirePermission anyOf={['reports.view', 'reports.view_limited']}><ReportsBranchWorkspaceV124 /></RequirePermission>} />
          <Route path="data-import" element={<RequirePermission permission="patients.import"><DataImportBranchWorkspaceV127 /></RequirePermission>} />
          <Route path="notifications" element={<RequirePermission permission="notifications.view"><NotificationsPageV25 /></RequirePermission>} />
          <Route path="forms-consent" element={<RequirePermission permission="settings.manage"><FormsConsentBranchWorkspaceV127 /></RequirePermission>} />
          <Route path="settings" element={<RequirePermission permission="settings.manage"><SettingsPageV30 /></RequirePermission>} />
          <Route path="system-admin" element={<RequireRole allowedRoles={['super_admin']}><SystemAdministrationPageV58 /></RequireRole>} />
          <Route path="unauthorized" element={<UnauthorizedPage />} />
        </Route>
        <Route path="/super-admin/*" element={<RequireAuth><RequireRole allowedRoles={['super_admin']}><Navigate to="/app/system-admin" replace /></RequireRole></RequireAuth>} />
        <Route path="/dentist/*" element={<RequireAuth><RequireRole allowedRoles={['dentist', 'associate_dentist']}><Navigate to="/app" replace /></RequireRole></RequireAuth>} />
        <Route path="/staff/*" element={<RequireAuth><RequireRole allowedRoles={['staff', 'super_admin']}><Navigate to="/app" replace /></RequireRole></RequireAuth>} />
        <Route path="/dashboard" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Router>
  )
}
