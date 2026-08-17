import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { canAccessRole } from './authorization'
import type { UserRole } from './authTypes'

type RequireRoleProps = {
  allowedRoles: UserRole[]
  children: React.ReactNode
}

export function RequireRole({ allowedRoles, children }: RequireRoleProps) {
  const location = useLocation()
  const { user } = useAuth()

  if (!canAccessRole(user?.role, allowedRoles)) {
    return <Navigate to="/unauthorized" state={{ from: location }} replace />
  }

  return children
}
