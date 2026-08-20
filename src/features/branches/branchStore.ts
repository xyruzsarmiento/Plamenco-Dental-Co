import { supabase } from '../../lib/supabase'
import { insertRemoteTableRow, updateRemoteTableRow } from '../../lib/supabaseSync'
import type { Branch, BranchFormValues } from './branchTypes'

const BRANCH_STORAGE_KEY = 'plamenco.branches'

const nowIso = () => new Date().toISOString()

export const defaultBranches: Branch[] = [
  {
    id: 'branch-pulilan',
    name: 'Plamenco Dental Co. - Pulilan',
    code: 'pulilan',
    address: 'Pulilan, Bulacan',
    city: 'Pulilan',
    province: 'Bulacan',
    phone: '',
    email: '',
    openingTime: '09:00',
    closingTime: '18:00',
    status: 'active',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 'branch-plaridel',
    name: 'Plamenco Dental Co. - Plaridel',
    code: 'plaridel',
    address: 'Plaridel, Bulacan',
    city: 'Plaridel',
    province: 'Bulacan',
    phone: '',
    email: '',
    openingTime: '09:00',
    closingTime: '18:00',
    status: 'active',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
]

function parseBranches(value: string | null): Branch[] | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Branch[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function mapBranchRow(row: Record<string, any>): Branch {
  return {
    id: row.id,
    name: row.name ?? '',
    code: row.code ?? '',
    address: row.address ?? '',
    city: row.city ?? '',
    province: row.province ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    openingTime: String(row.opening_time ?? '09:00').slice(0, 5),
    closingTime: String(row.closing_time ?? '18:00').slice(0, 5),
    status: row.status ?? 'active',
    createdAt: row.created_at ?? nowIso(),
    updatedAt: row.updated_at ?? row.created_at ?? nowIso(),
  }
}

export function getStoredBranches(): Branch[] {
  const stored = parseBranches(window.localStorage.getItem(BRANCH_STORAGE_KEY))
  if (stored?.length) return stored

  window.localStorage.setItem(BRANCH_STORAGE_KEY, JSON.stringify(defaultBranches))
  return defaultBranches
}

export function saveStoredBranches(branches: Branch[]) {
  window.localStorage.setItem(BRANCH_STORAGE_KEY, JSON.stringify(branches))
}

export async function loadBranchesFromSupabase(options: { strict?: boolean } = {}) {
  if (!supabase) return getStoredBranches()

  const { data, error } = await supabase.from('branches').select('*').order('name', { ascending: true })
  if (error) {
    if (options.strict) throw new Error(`Unable to load clinic branches: ${error.message}`)
    return getStoredBranches()
  }

  if (!Array.isArray(data) || data.length === 0) {
    if (options.strict) {
      saveStoredBranches([])
      return []
    }
    return getStoredBranches()
  }

  const branches = data.map(mapBranchRow)
  saveStoredBranches(branches)
  return branches
}

export function getBranchById(branchId: string) {
  return getStoredBranches().find((branch) => branch.id === branchId)
}

export function updateBranch(id: string, values: BranchFormValues): Branch | null {
  const branches = getStoredBranches()
  const index = branches.findIndex((branch) => branch.id === id)
  if (index === -1) return null

  const updated: Branch = {
    ...branches[index],
    ...values,
    updatedAt: nowIso(),
  }

  branches[index] = updated
  saveStoredBranches(branches)
  void updateRemoteTableRow('branches', id, {
    name: updated.name,
    address: updated.address,
    city: updated.city,
    province: updated.province,
    phone: updated.phone,
    email: updated.email,
    opening_time: updated.openingTime,
    closing_time: updated.closingTime,
    status: updated.status,
  })

  return updated
}

export function createBranch(values: BranchFormValues & { code: string }): Branch {
  const branches = getStoredBranches()
  const timestamp = nowIso()
  const code = values.code.trim().toLowerCase()
  const branch: Branch = {
    ...values,
    id: `branch-${code}-${Date.now()}`,
    code,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  const next = [branch, ...branches]
  saveStoredBranches(next)
  void insertRemoteTableRow('branches', {
    id: branch.id,
    name: branch.name,
    code: branch.code,
    address: branch.address,
    city: branch.city,
    province: branch.province,
    phone: branch.phone,
    email: branch.email,
    opening_time: branch.openingTime,
    closing_time: branch.closingTime,
    status: branch.status,
  })

  return branch
}

export { BRANCH_STORAGE_KEY }
