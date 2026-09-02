import { supabase } from '../../lib/supabase'
import { invalidateQueryTags } from '../../lib/queryCache'
import { loadProviderFoundationFromSupabase } from '../dentists/dentistStore'

export type StaffBranchAssignmentAdminRow = { id: string; profileId: string; branchId: string; isPrimary: boolean; status: 'active' | 'inactive' }
export type ProviderBranchAssignmentAdminRow = { id: string; providerId: string; branchId: string; isPrimary: boolean; status: 'active' | 'inactive' }

function requireClient() {
  if (!supabase) throw new Error('Clinic database is not configured.')
  return supabase
}

export async function loadStaffBranchAssignmentsAdmin(): Promise<StaffBranchAssignmentAdminRow[]> {
  const db = requireClient()
  const { data, error } = await db.from('staff_branch_assignments').select('id, profile_id, branch_id, is_primary, status').order('is_primary', { ascending: false })
  if (error) throw new Error(`Unable to load staff branch assignments: ${error.message}`)
  return (data ?? []).map((row) => ({ id: String(row.id), profileId: String(row.profile_id), branchId: String(row.branch_id), isPrimary: Boolean(row.is_primary), status: row.status as 'active' | 'inactive' }))
}

export async function loadProviderBranchAssignmentsAdmin(): Promise<ProviderBranchAssignmentAdminRow[]> {
  const db = requireClient()
  const { data, error } = await db.from('provider_branch_assignments').select('id, provider_id, branch_id, is_primary, status').order('is_primary', { ascending: false })
  if (error) throw new Error(`Unable to load dentist branch assignments: ${error.message}`)
  return (data ?? []).map((row) => ({ id: String(row.id), providerId: String(row.provider_id), branchId: String(row.branch_id), isPrimary: Boolean(row.is_primary), status: row.status as 'active' | 'inactive' }))
}

export async function replaceStaffBranchAssignmentsPersisted(profileId: string, branchIds: string[], primaryBranchId?: string) {
  const db = requireClient()
  const uniqueIds = [...new Set(branchIds.filter(Boolean))]
  const primary = primaryBranchId && uniqueIds.includes(primaryBranchId) ? primaryBranchId : uniqueIds[0] ?? null
  const { data, error } = await db.rpc('replace_staff_branch_assignments', { p_profile_id: profileId, p_branch_ids: uniqueIds, p_primary_branch_id: primary })
  if (error) throw new Error(error.message || 'Unable to save staff branch assignments.')
  invalidateQueryTags(['branches', 'workspace-bootstrap', 'internal-sync'])
  return data
}

export async function replaceProviderBranchAssignmentsPersisted(providerId: string, branchIds: string[], primaryBranchId?: string) {
  const db = requireClient()
  const uniqueIds = [...new Set(branchIds.filter(Boolean))]
  const primary = primaryBranchId && uniqueIds.includes(primaryBranchId) ? primaryBranchId : uniqueIds[0] ?? null
  const { data, error } = await db.rpc('replace_provider_branch_assignments', { p_provider_id: providerId, p_branch_ids: uniqueIds, p_primary_branch_id: primary })
  if (error) throw new Error(error.message || 'Unable to save dentist branch assignments.')
  invalidateQueryTags(['branches', 'providers', 'workspace-bootstrap', 'internal-sync'])
  await loadProviderFoundationFromSupabase({ strict: true })
  return data
}
