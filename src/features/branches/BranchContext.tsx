import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import type { Branch } from './branchTypes'

export type BranchScope =
  | { kind: 'branch'; branchId: string }
  | { kind: 'all' }

export type BranchContextValue = {
  availableBranches: Branch[]
  activeBranchId: string | null
  activeBranch: Branch | null
  authorizedBranchIds: string[]
  canViewAllBranches: boolean
  isAllBranchesMode: boolean
  isLoading: boolean
  error: string | null
  hasBranchAccess: boolean
  setActiveBranch: (branchId: string) => void
  setAllBranches: () => void
  refreshBranchAccess: () => Promise<void>
}

type BranchRow = {
  id: string
  name: string
  code: string
  address: string
  city: string
  province: string
  phone: string | null
  email: string | null
  opening_time: string
  closing_time: string
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

type AssignmentRow = {
  branch_id: string
  is_primary: boolean
  status: string
}

const BranchContext = createContext<BranchContextValue | undefined>(undefined)

const storageKey = (userId: string) => `plamenco.branch-scope.${userId}`

function mapBranch(row: BranchRow): Branch {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    city: row.city,
    province: row.province,
    phone: row.phone ?? '',
    email: row.email ?? '',
    openingTime: String(row.opening_time ?? '09:00').slice(0, 5),
    closingTime: String(row.closing_time ?? '18:00').slice(0, 5),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function readStoredScope(userId: string): BranchScope | null {
  try {
    const value = window.localStorage.getItem(storageKey(userId))
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<BranchScope>
    if (parsed.kind === 'all') return { kind: 'all' }
    if (parsed.kind === 'branch' && typeof parsed.branchId === 'string' && parsed.branchId) {
      return { kind: 'branch', branchId: parsed.branchId }
    }
  } catch {
    // Invalid UX state is ignored. Authorization never depends on browser storage.
  }
  return null
}

function persistScope(userId: string, scope: BranchScope) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(scope))
  } catch {
    // Persistence is only a convenience; branch authorization remains server-backed.
  }
}

async function loadActiveBranches(): Promise<Branch[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('branches')
    .select('id, name, code, address, city, province, phone, email, opening_time, closing_time, status, created_at, updated_at')
    .eq('status', 'active')
    .order('name', { ascending: true })
  if (error) throw new Error(`Unable to load clinic branches: ${error.message}`)
  return (data ?? []).map((row) => mapBranch(row as BranchRow))
}

async function loadStaffAssignments(profileId: string): Promise<AssignmentRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('staff_branch_assignments')
    .select('branch_id, is_primary, status')
    .eq('profile_id', profileId)
    .eq('status', 'active')
  if (error) throw new Error(`Unable to load staff branch assignments: ${error.message}`)
  return (data ?? []) as AssignmentRow[]
}

async function loadProviderAssignments(profileId: string): Promise<AssignmentRow[]> {
  if (!supabase) return []
  const { data: provider, error: providerError } = await supabase
    .from('providers')
    .select('id')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()
  if (providerError) throw new Error(`Unable to resolve dentist profile: ${providerError.message}`)
  if (!provider?.id) return []

  const { data, error } = await supabase
    .from('provider_branch_assignments')
    .select('branch_id, is_primary, status')
    .eq('provider_id', provider.id)
    .eq('status', 'active')
  if (error) throw new Error(`Unable to load dentist branch assignments: ${error.message}`)
  return (data ?? []) as AssignmentRow[]
}

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [availableBranches, setAvailableBranches] = useState<Branch[]>([])
  const [authorizedBranchIds, setAuthorizedBranchIds] = useState<string[]>([])
  const [primaryBranchId, setPrimaryBranchId] = useState<string | null>(null)
  const [scope, setScope] = useState<BranchScope | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canViewAllBranches = user?.role === 'super_admin'

  const refreshBranchAccess = useCallback(async () => {
    if (!user || user.role === 'patient') {
      setAvailableBranches([])
      setAuthorizedBranchIds([])
      setPrimaryBranchId(null)
      setScope(null)
      setError(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const branches = await loadActiveBranches()
      let assignments: AssignmentRow[] = []

      if (user.role === 'staff') assignments = await loadStaffAssignments(user.id)
      if (user.role === 'dentist' || user.role === 'associate_dentist') assignments = await loadProviderAssignments(user.id)

      const branchIds = user.role === 'super_admin'
        ? branches.map((branch) => branch.id)
        : [...new Set(assignments.map((assignment) => assignment.branch_id))]
      const authorizedBranches = branches.filter((branch) => branchIds.includes(branch.id))
      const normalizedIds = authorizedBranches.map((branch) => branch.id)
      const primary = user.role === 'super_admin'
        ? authorizedBranches[0]?.id ?? null
        : assignments.find((assignment) => assignment.is_primary && normalizedIds.includes(assignment.branch_id))?.branch_id
          ?? authorizedBranches[0]?.id
          ?? null

      setAvailableBranches(authorizedBranches)
      setAuthorizedBranchIds(normalizedIds)
      setPrimaryBranchId(primary)

      const stored = readStoredScope(user.id)
      let nextScope: BranchScope | null = null
      if (normalizedIds.length === 1) {
        nextScope = { kind: 'branch', branchId: normalizedIds[0] }
      } else if (stored?.kind === 'branch' && normalizedIds.includes(stored.branchId)) {
        nextScope = stored
      } else if (stored?.kind === 'all' && user.role === 'super_admin') {
        nextScope = stored
      } else if (primary) {
        nextScope = { kind: 'branch', branchId: primary }
      } else if (user.role === 'super_admin') {
        nextScope = { kind: 'all' }
      }

      setScope(nextScope)
      if (nextScope) persistScope(user.id, nextScope)
    } catch (cause) {
      setAvailableBranches([])
      setAuthorizedBranchIds([])
      setPrimaryBranchId(null)
      setScope(null)
      setError(cause instanceof Error ? cause.message : 'Unable to establish branch workspace access.')
    } finally {
      setIsLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refreshBranchAccess()
  }, [refreshBranchAccess])

  const setActiveBranch = useCallback((branchId: string) => {
    if (!user || !authorizedBranchIds.includes(branchId)) return
    const next: BranchScope = { kind: 'branch', branchId }
    setScope(next)
    persistScope(user.id, next)
  }, [authorizedBranchIds, user])

  const setAllBranches = useCallback(() => {
    if (!user || user.role !== 'super_admin') return
    const next: BranchScope = { kind: 'all' }
    setScope(next)
    persistScope(user.id, next)
  }, [user])

  const activeBranchId = scope?.kind === 'branch' ? scope.branchId : null
  const activeBranch = activeBranchId
    ? availableBranches.find((branch) => branch.id === activeBranchId) ?? null
    : null

  const value = useMemo<BranchContextValue>(() => ({
    availableBranches,
    activeBranchId,
    activeBranch,
    authorizedBranchIds,
    canViewAllBranches,
    isAllBranchesMode: scope?.kind === 'all',
    isLoading,
    error,
    hasBranchAccess: authorizedBranchIds.length > 0,
    setActiveBranch,
    setAllBranches,
    refreshBranchAccess,
  }), [activeBranch, activeBranchId, authorizedBranchIds, availableBranches, canViewAllBranches, error, isLoading, refreshBranchAccess, scope?.kind, setActiveBranch, setAllBranches])

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
}

export function useBranchContext() {
  const context = useContext(BranchContext)
  if (!context) throw new Error('useBranchContext must be used inside BranchProvider')
  return context
}

export function useOptionalBranchContext() {
  return useContext(BranchContext)
}
