import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
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
import { DashboardPage } from '../pages/DashboardPage'
import { DentalRecordsPage } from '../pages/DentalRecordsPage'
import { DentistsPage } from '../pages/DentistsPage'
import { LandingPage } from '../pages/LandingPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { NotificationsPage } from '../pages/NotificationsPage'
import { PatientPortalPage } from '../pages/PatientPortalPage'
import { PatientsPage } from '../pages/PatientsPage'
import { PublicBookingPage } from '../pages/PublicBookingPage'
import { ReportsPage } from '../pages/ReportsPage'
import { ServicesPage } from '../pages/ServicesPage'
import { SettingsPage } from '../pages/SettingsPage'
import { StaffPage } from '../pages/StaffPage'
import { TreatmentsPage } from '../pages/TreatmentsPage'
import { UnauthorizedPage } from '../pages/UnauthorizedPage'

function BookRoute() {
  const { user, isAuthenticated } = useAuth()

  if (isAuthenticated && user?.role === 'patient' && user.patientId) {
    return <Navigate to={`/portal/${user.patientId}`} replace />
  }

  return <PublicBookingPage />
}

export function AppRouter() {
  return (
    <Router>
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
          path="/app"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route
            path="appointments"
            element={
              <RequirePermission permission="appointments.view">
                <AppointmentsPage />
              </RequirePermission>
            }
          />
          <Route
            path="patients"
            element={
              <RequirePermission permission="patients.view">
                <PatientsPage />
              </RequirePermission>
            }
          />
          <Route
            path="dental-records"
            element={
              <RequirePermission permission="clinical_records.view">
                <DentalRecordsPage />
              </RequirePermission>
            }
          />
          <Route
            path="treatments"
            element={
              <RequirePermission permission="treatments.view">
                <TreatmentsPage />
              </RequirePermission>
            }
          />
          <Route
            path="billing"
            element={
              <RequirePermission anyOf={['billing.view', 'payments.view']}>
                <BillingPage />
              </RequirePermission>
            }
          />
          <Route
            path="services"
            element={
              <RequirePermission anyOf={['services.view', 'services.manage']}>
                <ServicesPage />
              </RequirePermission>
            }
          />
          <Route
            path="staff"
            element={
              <RequirePermission anyOf={['staff.manage', 'dentists.manage']}>
                <StaffPage />
              </RequirePermission>
            }
          />
          <Route
            path="dentists"
            element={
              <RequirePermission permission="dentists.manage">
                <DentistsPage />
              </RequirePermission>
            }
          />
          <Route
            path="branches"
            element={
              <RequirePermission anyOf={['branches.view', 'branches.manage']}>
                <BranchesPage />
              </RequirePermission>
            }
          />
          <Route
            path="reports"
            element={
              <RequirePermission anyOf={['reports.view', 'reports.view_limited']}>
                <ReportsPage />
              </RequirePermission>
            }
          />
          <Route
            path="notifications"
            element={
              <RequirePermission permission="notifications.view">
                <NotificationsPage />
              </RequirePermission>
            }
          />
          <Route
            path="settings"
            element={
              <RequirePermission permission="settings.manage">
                <SettingsPage />
              </RequirePermission>
            }
          />
          <Route path="unauthorized" element={<UnauthorizedPage />} />
        </Route>
        <Route
          path="/super-admin/*"
          element={
            <RequireAuth>
              <RequireRole allowedRoles={['super_admin']}>
                <Navigate to="/app" replace />
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/dentist/*"
          element={
            <RequireAuth>
              <RequireRole allowedRoles={['dentist', 'associate_dentist']}>
                <Navigate to="/app" replace />
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/staff/*"
          element={
            <RequireAuth>
              <RequireRole allowedRoles={['staff', 'admin', 'super_admin']}>
                <Navigate to="/app" replace />
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route path="/dashboard" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Router>
  )
}
