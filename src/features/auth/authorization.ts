import type { UserRole } from './authTypes'

export function canAccessRole(userRole: UserRole | undefined, allowedRoles: UserRole[]) {
  return Boolean(userRole && allowedRoles.includes(userRole))
}
