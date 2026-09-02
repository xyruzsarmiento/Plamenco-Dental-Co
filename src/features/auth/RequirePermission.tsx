import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { hasAnyPermission, hasPermission, type PermissionKey } from './permissions'

type RequirePermissionProps = {
  permission?: PermissionKey
  anyOf?: PermissionKey[]
  children: React.ReactNode
}

export function RequirePermission({ anyOf, children, permission }: RequirePermissionProps) {
  const location = useLocation()
  const { user } = useAuth()

  const allowed = permission
    ? hasPermission(user, permission)
    : anyOf
      ? hasAnyPermission(user, anyOf)
      : false

  if (!allowed) {
    return <Navigate to="/unauthorized" state={{ from: location }} replace />
  }

  return children
}

export function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { user } = useAuth()

  if (!user || user.status !== 'active' || user.role !== 'super_admin') {
    return <Navigate to="/unauthorized" state={{ from: location }} replace />
  }

  return children
}
