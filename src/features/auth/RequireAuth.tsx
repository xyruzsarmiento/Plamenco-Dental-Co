import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { user, isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <main className="auth-page">
        <div className="loading-state">Restoring secure session...</div>
      </main>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (user?.role === 'patient') {
    return <Navigate to={user.patientId ? `/portal/${user.patientId}` : '/login'} replace />
  }

  return children
}
