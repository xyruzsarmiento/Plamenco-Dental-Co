import { useEffect, useRef } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useBranchContext } from '../branches/BranchContext'
import { clearAuthenticatedWorkspaceState, clearBranchSensitiveWorkspaceCache, notifyBranchContextChanged } from './workspaceIsolation'

export function WorkspaceAccountIsolationGuard() {
  const { isLoading, user } = useAuth()
  const previousUserId = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (isLoading) return
    const nextUserId = user?.id ?? null
    if (previousUserId.current === undefined) {
      previousUserId.current = nextUserId
      return
    }
    if (previousUserId.current !== nextUserId) clearAuthenticatedWorkspaceState()
    previousUserId.current = nextUserId
  }, [isLoading, user?.id])

  return null
}

export function WorkspaceBranchIsolationGuard() {
  const { activeBranchId, authorizedBranchIds, isAllBranchesMode } = useBranchContext()
  const previousAuthorization = useRef<string | undefined>(undefined)
  const previousScope = useRef<string | undefined>(undefined)

  useEffect(() => {
    const authorizationKey = [...authorizedBranchIds].sort().join(',')
    if (previousAuthorization.current === undefined) {
      previousAuthorization.current = authorizationKey
      return
    }
    if (previousAuthorization.current !== authorizationKey) clearBranchSensitiveWorkspaceCache()
    previousAuthorization.current = authorizationKey
  }, [authorizedBranchIds])

  useEffect(() => {
    const scopeKey = isAllBranchesMode ? 'all' : activeBranchId ?? 'none'
    if (previousScope.current === undefined) {
      previousScope.current = scopeKey
      return
    }
    if (previousScope.current !== scopeKey) notifyBranchContextChanged(activeBranchId, isAllBranchesMode ? 'all' : 'branch')
    previousScope.current = scopeKey
  }, [activeBranchId, isAllBranchesMode])

  return null
}
