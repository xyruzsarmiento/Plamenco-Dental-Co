import { Navigate, useLocation } from 'react-router-dom'
import { PortalSkeleton } from '../../components/ui/DesignSystem'
import { useAuth } from './AuthContext'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { user, isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <PortalSkeleton variant="internal" message="Restoring secure session" />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (user?.status === 'inactive' || user?.status === 'suspended') {
    return <Navigate to="/unauthorized" state={{ from: location }} replace />
  }

  if (user?.role === 'patient') {
    return <Navigate to={user.patientId ? `/portal/${user.patientId}` : '/login'} replace />
  }

  return children
}
