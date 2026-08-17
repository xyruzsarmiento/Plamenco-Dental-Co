import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage'
import { LoginPage } from '../features/auth/LoginPage'
import { RegisterPage } from '../features/auth/RegisterPage'
import { useAuth } from '../features/auth/AuthContext'
import { RequireAuth } from '../features/auth/RequireAuth'
import { RequirePatientAuth } from '../features/auth/RequirePatientAuth'
import { RequireRole } from '../features/auth/RequireRole'
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage'
import { AppointmentsPage } from '../pages/AppointmentsPage'
import { BillingPage } from '../pages/BillingPage'
import { DashboardPage } from '../pages/DashboardPage'
import { DentalRecordsPage } from '../pages/DentalRecordsPage'
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
          <Route path="appointments" element={<AppointmentsPage />} />
          <Route path="patients" element={<PatientsPage />} />
          <Route
            path="dental-records"
            element={
              <RequireRole allowedRoles={['admin', 'staff']}>
                <DentalRecordsPage />
              </RequireRole>
            }
          />
          <Route path="treatments" element={<TreatmentsPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route
            path="staff"
            element={
              <RequireRole allowedRoles={['admin']}>
                <StaffPage />
              </RequireRole>
            }
          />
          <Route
            path="reports"
            element={
              <RequireRole allowedRoles={['admin', 'staff']}>
                <ReportsPage />
              </RequireRole>
            }
          />
          <Route
            path="notifications"
            element={
              <RequireRole allowedRoles={['admin', 'staff']}>
                <NotificationsPage />
              </RequireRole>
            }
          />
          <Route
            path="settings"
            element={
              <RequireRole allowedRoles={['admin']}>
                <SettingsPage />
              </RequireRole>
            }
          />
          <Route path="unauthorized" element={<UnauthorizedPage />} />
        </Route>
        <Route path="/dashboard" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Router>
  )
}
