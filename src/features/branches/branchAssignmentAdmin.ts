import { supabase } from '../../lib/supabase'
import { invalidateQueryTags } from '../../lib/queryCache'
import { loadProviderFoundationFromSupabase } from '../dentists/dentistStore'

export type StaffBranchAssignmentAdminRow = { id: string; profileId: string; branchId: string; isPrimary: boolean; status: 'active' | 'inactive' }
export type ProviderBranchAssignmentAdminRow = { id: string; providerId: string; branchId: string; isPrimary: boolean; status: 'active' | 'inactive' }

function requireClient() {
  if (!supabase) throw new Error('Clinic database is not configured.')
  return supabase
}

function isMissingSuperAdminHelper(message?: string) {
  return /function\s+public\.is_super_admin\(\)\s+does not exist/i.test(message ?? '')
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

async function replaceStaffAssignmentsCompatibility(profileId: string, branchIds: string[], primary: string | null) {
  const db = requireClient()
  const { data: existing, error: readError } = await db.from('staff_branch_assignments').select('id, branch_id').eq('profile_id', profileId)
  if (readError) throw new Error(readError.message)
  const existingByBranch = new Map((existing ?? []).map((row) => [String(row.branch_id), String(row.id)]))

  for (const row of existing ?? []) {
    const branchId = String(row.branch_id)
    if (branchIds.includes(branchId)) continue
    const { error } = await db.from('staff_branch_assignments').update({ status: 'inactive', is_primary: false, updated_at: new Date().toISOString() }).eq('id', row.id)
    if (error) throw new Error(error.message)
  }
  for (const branchId of branchIds) {
    const id = existingByBranch.get(branchId)
    if (id) {
      const { error } = await db.from('staff_branch_assignments').update({ status: 'active', is_primary: branchId === primary, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await db.from('staff_branch_assignments').insert({ profile_id: profileId, branch_id: branchId, status: 'active', is_primary: branchId === primary })
      if (error) throw new Error(error.message)
    }
  }
  return loadStaffBranchAssignmentsAdmin()
}

async function replaceProviderAssignmentsCompatibility(providerId: string, branchIds: string[], primary: string | null) {
  const db = requireClient()
  const { data: existing, error: readError } = await db.from('provider_branch_assignments').select('id, branch_id').eq('provider_id', providerId)
  if (readError) throw new Error(readError.message)
  const existingByBranch = new Map((existing ?? []).map((row) => [String(row.branch_id), String(row.id)]))
  const removedBranchIds = (existing ?? []).map((row) => String(row.branch_id)).filter((branchId) => !branchIds.includes(branchId))

  for (const branchId of removedBranchIds) {
    const { error: scheduleError } = await db.from('provider_schedule_blocks').update({ status: 'inactive', updated_at: new Date().toISOString() }).eq('provider_id', providerId).eq('branch_id', branchId).eq('status', 'active')
    if (scheduleError) throw new Error(scheduleError.message)
  }
  for (const row of existing ?? []) {
    const branchId = String(row.branch_id)
    if (branchIds.includes(branchId)) continue
    const { error } = await db.from('provider_branch_assignments').update({ status: 'inactive', is_primary: false, updated_at: new Date().toISOString() }).eq('id', row.id)
    if (error) throw new Error(error.message)
  }
  for (const branchId of branchIds) {
    const id = existingByBranch.get(branchId)
    if (id) {
      const { error } = await db.from('provider_branch_assignments').update({ status: 'active', is_primary: branchId === primary, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await db.from('provider_branch_assignments').insert({ provider_id: providerId, branch_id: branchId, status: 'active', is_primary: branchId === primary })
      if (error) throw new Error(error.message)
    }
  }
  return loadProviderBranchAssignmentsAdmin()
}

export async function replaceStaffBranchAssignmentsPersisted(profileId: string, branchIds: string[], primaryBranchId?: string) {
  const db = requireClient()
  const uniqueIds = [...new Set(branchIds.filter(Boolean))]
  const primary = primaryBranchId && uniqueIds.includes(primaryBranchId) ? primaryBranchId : uniqueIds[0] ?? null
  const { data, error } = await db.rpc('replace_staff_branch_assignments', { p_profile_id: profileId, p_branch_ids: uniqueIds, p_primary_branch_id: primary })
  const result = error && isMissingSuperAdminHelper(error.message) ? await replaceStaffAssignmentsCompatibility(profileId, uniqueIds, primary) : data
  if (error && !isMissingSuperAdminHelper(error.message)) throw new Error(error.message || 'Unable to save staff branch assignments.')
  invalidateQueryTags(['branches', 'workspace-bootstrap', 'internal-sync'])
  return result
}

export async function replaceProviderBranchAssignmentsPersisted(providerId: string, branchIds: string[], primaryBranchId?: string) {
  const db = requireClient()
  const uniqueIds = [...new Set(branchIds.filter(Boolean))]
  const primary = primaryBranchId && uniqueIds.includes(primaryBranchId) ? primaryBranchId : uniqueIds[0] ?? null
  const { data, error } = await db.rpc('replace_provider_branch_assignments', { p_provider_id: providerId, p_branch_ids: uniqueIds, p_primary_branch_id: primary })
  const result = error && isMissingSuperAdminHelper(error.message) ? await replaceProviderAssignmentsCompatibility(providerId, uniqueIds, primary) : data
  if (error && !isMissingSuperAdminHelper(error.message)) throw new Error(error.message || 'Unable to save dentist branch assignments.')
  invalidateQueryTags(['branches', 'providers', 'workspace-bootstrap', 'internal-sync'])
  await loadProviderFoundationFromSupabase({ strict: true })
  return result
}
