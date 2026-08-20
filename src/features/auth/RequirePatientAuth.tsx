import { Navigate, useLocation, useParams } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function RequirePatientAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { patientId } = useParams()
  const { user, isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <main className="auth-page">
        <div className="loading-state">Loading your patient account...</div>
      </main>
    )
  }

  if (!isAuthenticated || user?.role !== 'patient') {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (user.status === 'inactive' || user.status === 'suspended') {
    return <Navigate to="/unauthorized" state={{ from: location }} replace />
  }

  if (!user.patientId) {
    return <Navigate to="/login" replace />
  }

  if (patientId && patientId !== user.patientId) {
    return <Navigate to={`/portal/${user.patientId}`} replace />
  }

  return children
}
